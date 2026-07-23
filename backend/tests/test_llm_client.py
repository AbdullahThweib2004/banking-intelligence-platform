"""
Unit tests for services/llm_client.py's HTTP-error classification and
model-fallback retry.

CONTEXT: two real production incidents are pinned here:
  1. An OpenRouter 402 Payment Required (insufficient account credits) was
     being reported to end users as a generic "network error" — hiding an
     actionable, unrelated-to-networking problem behind a misleading
     message. httpx response-level errors (401/402/other) must map to
     distinct LlmCallError codes, and only genuine transport failures (no
     response at all) may map to "network_error".
  2. A configured model ("krea/krea-2-medium") turned out not to exist on
     OpenRouter at all — every request returned a bare 500 "Internal Server
     Error", indistinguishable by status code from a real outage, and the
     logged error never included OpenRouter's actual response body. Fixed
     by (a) logging the real response body, and (b) a single automatic
     retry against a known-good fallback model for exactly this class of
     error (never for 401/402/429, which a different model can't fix).

Run with:  cd backend && .venv/bin/python -m unittest tests/test_llm_client.py -v
"""

from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from services.llm_client import LlmCallError, call_llm_for_json  # noqa: E402


def _fake_response(status_code: int, json_body: dict | None = None) -> MagicMock:
    resp = MagicMock(spec=httpx.Response)
    resp.status_code = status_code
    body = json_body or {"error": {"message": f"fake {status_code} error", "code": status_code}}
    resp.json.return_value = body
    resp.text = json.dumps(body)
    if status_code >= 400:
        request = httpx.Request("POST", "https://openrouter.ai/api/v1/chat/completions")
        resp.raise_for_status.side_effect = httpx.HTTPStatusError(
            f"{status_code} error", request=request, response=resp
        )
    else:
        resp.raise_for_status.return_value = None
    return resp


class TestCallLlmForJsonErrorClassification(unittest.TestCase):
    def setUp(self):
        patcher = patch.dict("os.environ", {"OPENROUTER_API_KEY": "sk-or-v1-test-key"})
        patcher.start()
        self.addCleanup(patcher.stop)

    def _call(self, default_model="openai/gpt-4o-mini", fallback_model="openai/gpt-4o-mini"):
        # default_model == fallback_model in the base tests so the fallback
        # retry path (fallback_model != model) never fires and each test
        # stays focused on classifying a single response.
        return call_llm_for_json(
            "system prompt",
            "user content",
            model_env_var="TEST_MODEL",
            default_model=default_model,
            title="Test",
            fallback_model=fallback_model,
        )

    def test_402_maps_to_insufficient_credits_not_network_error(self):
        with patch("httpx.Client.post", return_value=_fake_response(402)):
            with self.assertRaises(LlmCallError) as ctx:
                self._call()
        self.assertEqual(ctx.exception.code, "insufficient_credits")

    def test_401_maps_to_invalid_api_key(self):
        with patch("httpx.Client.post", return_value=_fake_response(401)):
            with self.assertRaises(LlmCallError) as ctx:
                self._call()
        self.assertEqual(ctx.exception.code, "invalid_api_key")

    def test_other_4xx_5xx_maps_to_upstream_error(self):
        with patch("httpx.Client.post", return_value=_fake_response(500)):
            with self.assertRaises(LlmCallError) as ctx:
                self._call()
        self.assertEqual(ctx.exception.code, "upstream_error")

    def test_429_still_maps_to_rate_limit(self):
        with patch("httpx.Client.post", return_value=_fake_response(429)):
            with self.assertRaises(LlmCallError) as ctx:
                self._call()
        self.assertEqual(ctx.exception.code, "rate_limit")

    def test_genuine_connection_failure_maps_to_network_error(self):
        with patch("httpx.Client.post", side_effect=httpx.ConnectError("connection refused")):
            with self.assertRaises(LlmCallError) as ctx:
                self._call()
        self.assertEqual(ctx.exception.code, "network_error")

    def test_successful_response_returns_parsed_json(self):
        payload = {"choices": [{"message": {"content": '{"ok": true}'}}]}
        with patch("httpx.Client.post", return_value=_fake_response(200, payload)):
            result = self._call()
        self.assertEqual(result, {"ok": True})


class TestModelFallbackRetry(unittest.TestCase):
    """Pins the "krea/krea-2-medium doesn't exist" incident fix: an
    upstream/network error on the CONFIGURED model triggers exactly one
    retry against a different fallback model, and a genuinely bad model id
    (500 from OpenRouter, indistinguishable from a real outage by status
    code alone) is recovered from automatically instead of surfacing to the
    end user as a hard failure."""

    def setUp(self):
        patcher = patch.dict("os.environ", {"OPENROUTER_API_KEY": "sk-or-v1-test-key"})
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_retries_with_fallback_model_on_upstream_error_and_succeeds(self):
        success_payload = {"choices": [{"message": {"content": '{"ok": true}'}}]}
        responses = [_fake_response(500), _fake_response(200, success_payload)]

        with patch("httpx.Client.post", side_effect=responses) as mock_post:
            result = call_llm_for_json(
                "system prompt",
                "user content",
                model_env_var="TEST_MODEL",
                default_model="nonexistent/bad-model-id",
                title="Test",
                fallback_model="openai/gpt-4o-mini",
            )

        self.assertEqual(result, {"ok": True})
        self.assertEqual(mock_post.call_count, 2)
        first_call_body = mock_post.call_args_list[0].kwargs["json"]
        second_call_body = mock_post.call_args_list[1].kwargs["json"]
        self.assertEqual(first_call_body["model"], "nonexistent/bad-model-id")
        self.assertEqual(second_call_body["model"], "openai/gpt-4o-mini")

    def test_does_not_retry_when_fallback_equals_primary_model(self):
        with patch("httpx.Client.post", return_value=_fake_response(500)) as mock_post:
            with self.assertRaises(LlmCallError):
                call_llm_for_json(
                    "system prompt",
                    "user content",
                    model_env_var="TEST_MODEL",
                    default_model="openai/gpt-4o-mini",
                    title="Test",
                    fallback_model="openai/gpt-4o-mini",
                )
        self.assertEqual(mock_post.call_count, 1)

    def test_does_not_retry_on_401_invalid_key_even_with_different_fallback(self):
        # A bad/expired key fails identically on any model — retrying just
        # wastes a call and produces a confusing double failure.
        with patch("httpx.Client.post", return_value=_fake_response(401)) as mock_post:
            with self.assertRaises(LlmCallError) as ctx:
                call_llm_for_json(
                    "system prompt",
                    "user content",
                    model_env_var="TEST_MODEL",
                    default_model="some/model",
                    title="Test",
                    fallback_model="openai/gpt-4o-mini",
                )
        self.assertEqual(ctx.exception.code, "invalid_api_key")
        self.assertEqual(mock_post.call_count, 1)

    def test_does_not_retry_on_402_insufficient_credits(self):
        with patch("httpx.Client.post", return_value=_fake_response(402)) as mock_post:
            with self.assertRaises(LlmCallError) as ctx:
                call_llm_for_json(
                    "system prompt",
                    "user content",
                    model_env_var="TEST_MODEL",
                    default_model="some/model",
                    title="Test",
                    fallback_model="openai/gpt-4o-mini",
                )
        self.assertEqual(ctx.exception.code, "insufficient_credits")
        self.assertEqual(mock_post.call_count, 1)

    def test_surfaces_fallback_failure_when_both_models_fail(self):
        with patch("httpx.Client.post", return_value=_fake_response(500)) as mock_post:
            with self.assertRaises(LlmCallError) as ctx:
                call_llm_for_json(
                    "system prompt",
                    "user content",
                    model_env_var="TEST_MODEL",
                    default_model="nonexistent/bad-model-id",
                    title="Test",
                    fallback_model="also/broken-model",
                )
        self.assertEqual(ctx.exception.code, "upstream_error")
        self.assertEqual(mock_post.call_count, 2)


if __name__ == "__main__":
    unittest.main()
