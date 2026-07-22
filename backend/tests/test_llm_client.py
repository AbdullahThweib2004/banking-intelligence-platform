"""
Unit tests for services/llm_client.py's HTTP-error classification.

CONTEXT: a real production incident showed that an OpenRouter 402 Payment
Required (insufficient account credits) was being reported to end users as
a generic "network error" — hiding an actionable, unrelated-to-networking
problem behind a misleading message. These tests pin the fix: httpx
response-level errors (401/402/other) must map to distinct LlmCallError
codes, and only genuine transport failures (no response at all) may map to
"network_error".

Run with:  cd backend && .venv/bin/python -m unittest tests/test_llm_client.py -v
"""

from __future__ import annotations

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
    resp.json.return_value = json_body or {}
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

    def _call(self):
        return call_llm_for_json(
            "system prompt",
            "user content",
            model_env_var="TEST_MODEL",
            default_model="openai/gpt-4o-mini",
            title="Test",
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


if __name__ == "__main__":
    unittest.main()
