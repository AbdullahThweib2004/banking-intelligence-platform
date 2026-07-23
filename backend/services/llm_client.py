"""Shared OpenRouter JSON-completion client for LLM-based field extraction.

Used by services/employment_extractor.py (ID-document extraction is
regex/OCR-only — see services/field_extraction.py — and doesn't call this
module at all). Kept separate from the extractor itself so the OpenRouter
request/response plumbing isn't duplicated if another AI-based extractor is
ever added.
"""

from __future__ import annotations

import json
import logging
import os
import re

import httpx

logger = logging.getLogger(__name__)

OPENROUTER_BASE = "https://openrouter.ai/api/v1"

# A model known to actually exist on OpenRouter for chat completions, used as
# the last-resort retry target when the configured model itself is the
# problem (invalid/deprecated/unavailable model id) rather than a real
# outage. See the incident note on call_llm_for_json below.
DEFAULT_FALLBACK_MODEL = "openai/gpt-4o-mini"

USER_FACING_ERRORS = {
    "missing_api_key": (
        "AI-assisted extraction is unavailable (OPENROUTER_API_KEY not configured). "
        "Please review and enter the fields manually."
    ),
    "rate_limit": (
        "AI-assisted extraction is temporarily unavailable (rate limit). "
        "Please review and enter the fields manually."
    ),
    "invalid_api_key": (
        "AI-assisted extraction failed — OpenRouter rejected the configured API key (401). "
        "Please review and enter the fields manually."
    ),
    "insufficient_credits": (
        "AI-assisted extraction is unavailable — the OpenRouter account has insufficient "
        "credits (402 Payment Required). Please review and enter the fields manually."
    ),
    "upstream_error": (
        "AI-assisted extraction failed — OpenRouter returned an error. "
        "Please review and enter the fields manually."
    ),
    "network_error": (
        "AI-assisted extraction failed due to a network error (could not reach OpenRouter). "
        "Please review and enter the fields manually."
    ),
    "parse_error": (
        "AI-assisted extraction returned an invalid response. "
        "Please review and enter the fields manually."
    ),
    "unknown_error": (
        "AI-assisted extraction failed. Please review and enter the fields manually."
    ),
}


class LlmCallError(Exception):
    """Raised with a stable `code` so callers can map it to a user-facing message."""

    def __init__(self, code: str, detail: str = ""):
        self.code = code
        self.detail = detail
        super().__init__(code)


def llm_configured() -> bool:
    return bool(os.environ.get("OPENROUTER_API_KEY", "").strip())


def user_facing_error(code: str) -> str:
    return USER_FACING_ERRORS.get(code, USER_FACING_ERRORS["unknown_error"])


def _parse_json_response(content: str) -> dict:
    text = content.strip()
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if fence:
        text = fence.group(1).strip()
    return json.loads(text)


def _call_once(
    model: str,
    system_prompt: str,
    user_content: str,
    *,
    title: str,
    max_tokens: int,
    api_key: str,
) -> dict:
    """One OpenRouter attempt against a specific model. Raises LlmCallError
    with the real upstream error body captured in `.detail` for logging —
    never just the generic httpx exception string, which for a bare 500/400
    response says nothing about *why* (e.g. "model not found")."""
    payload = {
        "model": model,
        "temperature": 0,
        "max_tokens": max_tokens,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content},
        ],
        "response_format": {"type": "json_object"},
    }
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": os.environ.get("OPENROUTER_HTTP_REFERER", "http://localhost:8080"),
        "X-Title": title,
    }

    try:
        with httpx.Client(timeout=30.0) as client:
            res = client.post(f"{OPENROUTER_BASE}/chat/completions", json=payload, headers=headers)
            if res.status_code == 429:
                logger.warning("[LLM %s] model=%s rate limited (429): %s", title, model, res.text[:500])
                raise LlmCallError("rate_limit", res.text)
            res.raise_for_status()
            content = res.json()["choices"][0]["message"]["content"]
        logger.info("[LLM %s] model=%s raw response: %s", title, model, content[:500])
        return _parse_json_response(content)
    except LlmCallError:
        raise
    except httpx.HTTPStatusError as exc:
        status = exc.response.status_code
        # The actual OpenRouter error body (e.g. {"error":{"message":"...
        # model not found...","code":400}}) — logging only str(exc) hides
        # exactly this, which is the whole reason a bad model id looks
        # identical to a real outage in the logs.
        body = exc.response.text[:1000]
        logger.warning("[LLM %s] model=%s OpenRouter returned HTTP %d: %s", title, model, status, body)
        if status == 401:
            raise LlmCallError("invalid_api_key", body) from exc
        if status == 402:
            raise LlmCallError("insufficient_credits", body) from exc
        raise LlmCallError("upstream_error", body) from exc
    except httpx.HTTPError as exc:
        # Only genuine transport-level failures (DNS, connection refused,
        # timeout, TLS) reach here — any actual HTTP response is handled
        # above by httpx.HTTPStatusError, a subclass of this.
        logger.warning("[LLM %s] model=%s could not reach OpenRouter: %s", title, model, exc)
        raise LlmCallError("network_error", str(exc)) from exc
    except (json.JSONDecodeError, KeyError, IndexError, TypeError) as exc:
        logger.warning("[LLM %s] model=%s parse failed: %s", title, model, exc)
        raise LlmCallError("parse_error", str(exc)) from exc
    except Exception as exc:
        logger.warning("[LLM %s] model=%s failed: %s", title, model, exc)
        raise LlmCallError("unknown_error", str(exc)) from exc


def call_llm_for_json(
    system_prompt: str,
    user_content: str,
    *,
    model_env_var: str,
    default_model: str,
    title: str,
    max_tokens: int = 400,
    fallback_model: str | None = DEFAULT_FALLBACK_MODEL,
) -> dict:
    """
    Calls OpenRouter chat completions with a JSON-object response format and
    returns the parsed JSON payload.

    Raises LlmCallError with a stable `.code` ("missing_api_key" | "rate_limit"
    | "invalid_api_key" | "insufficient_credits" | "upstream_error" |
    "network_error" | "parse_error" | "unknown_error") and a `.detail` string
    (the real upstream error body) — callers translate `.code` into a
    user-facing message via `user_facing_error()`; `.detail` is for logs only.

    IMPORTANT: an HTTP error response (401/402/403/5xx) from OpenRouter is a
    real, distinct failure — never lump it into "network_error", which means
    "could not reach OpenRouter at all" (DNS/connection/timeout). Conflating
    them hides actionable problems like an expired key or a depleted credit
    balance behind a generic "network error" message.

    INCIDENT: the model configured for a given feature can itself be the
    problem — e.g. a typo'd or since-deprecated/never-existent model id
    (this happened for real: "krea/krea-2-medium" doesn't exist on OpenRouter
    at all and returns a bare {"error":{"message":"Internal Server
    Error","code":500}} for every request, indistinguishable from a true
    outage by status code alone). A bad API key or empty credit balance would
    fail identically on any model, so retrying with a different one would
    just waste a call — but for "upstream_error"/"network_error" specifically,
    a single retry against `fallback_model` (defaults to a model known to
    exist) is a safe, cheap recovery attempt. 401/402/429 are never retried
    this way since a different model can't fix an auth/billing/rate-limit
    problem with the same key.
    """
    api_key = os.environ.get("OPENROUTER_API_KEY", "").strip()
    if not api_key:
        logger.warning("[LLM %s] OPENROUTER_API_KEY not set — skipping", title)
        raise LlmCallError("missing_api_key")

    model = os.environ.get(model_env_var, default_model)

    try:
        return _call_once(model, system_prompt, user_content, title=title, max_tokens=max_tokens, api_key=api_key)
    except LlmCallError as exc:
        if fallback_model and fallback_model != model and exc.code in ("upstream_error", "network_error"):
            logger.warning(
                "[LLM %s] primary model '%s' failed (%s) — retrying once with fallback model '%s'",
                title,
                model,
                exc.code,
                fallback_model,
            )
            return _call_once(
                fallback_model, system_prompt, user_content, title=title, max_tokens=max_tokens, api_key=api_key
            )
        raise
