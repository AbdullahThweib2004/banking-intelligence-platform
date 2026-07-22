"""Shared OpenRouter JSON-completion client used by all LLM-based field extractors.

Extracted from services/llm_extractor.py so the employment-proof extractor
(services/employment_extractor.py) can reuse the same HTTP-calling and
JSON-parsing plumbing instead of duplicating it — the prompt/schema differ
per document type, but the OpenRouter request/response mechanics don't.
"""

from __future__ import annotations

import json
import logging
import os
import re

import httpx

logger = logging.getLogger(__name__)

OPENROUTER_BASE = "https://openrouter.ai/api/v1"

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

    def __init__(self, code: str):
        self.code = code
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


def call_llm_for_json(
    system_prompt: str,
    user_content: str,
    *,
    model_env_var: str,
    default_model: str,
    title: str,
    max_tokens: int = 400,
) -> dict:
    """
    Calls OpenRouter chat completions with a JSON-object response format and
    returns the parsed JSON payload.

    Raises LlmCallError with a stable `.code` ("missing_api_key" | "rate_limit"
    | "invalid_api_key" | "insufficient_credits" | "upstream_error" |
    "network_error" | "parse_error" | "unknown_error") — callers translate
    this into a user-facing message via `user_facing_error()`.

    IMPORTANT: an HTTP error response (401/402/403/5xx) from OpenRouter is a
    real, distinct failure — never lump it into "network_error", which means
    "could not reach OpenRouter at all" (DNS/connection/timeout). Conflating
    them hides actionable problems like an expired key or a depleted credit
    balance behind a generic "network error" message.
    """
    api_key = os.environ.get("OPENROUTER_API_KEY", "").strip()
    if not api_key:
        logger.warning("[LLM %s] OPENROUTER_API_KEY not set — skipping", title)
        raise LlmCallError("missing_api_key")

    model = os.environ.get(model_env_var, default_model)
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
                logger.warning("[LLM %s] rate limited (429)", title)
                raise LlmCallError("rate_limit")
            res.raise_for_status()
            content = res.json()["choices"][0]["message"]["content"]
        logger.info("[LLM %s] raw response: %s", title, content[:500])
        return _parse_json_response(content)
    except LlmCallError:
        raise
    except httpx.HTTPStatusError as exc:
        status = exc.response.status_code
        logger.warning("[LLM %s] OpenRouter returned HTTP %d: %s", title, status, exc)
        if status == 401:
            raise LlmCallError("invalid_api_key") from exc
        if status == 402:
            raise LlmCallError("insufficient_credits") from exc
        raise LlmCallError("upstream_error") from exc
    except httpx.HTTPError as exc:
        # Only genuine transport-level failures (DNS, connection refused,
        # timeout, TLS) reach here — any actual HTTP response is handled
        # above by httpx.HTTPStatusError, a subclass of this.
        logger.warning("[LLM %s] could not reach OpenRouter: %s", title, exc)
        raise LlmCallError("network_error") from exc
    except (json.JSONDecodeError, KeyError, IndexError, TypeError) as exc:
        logger.warning("[LLM %s] parse failed: %s", title, exc)
        raise LlmCallError("parse_error") from exc
    except Exception as exc:
        logger.warning("[LLM %s] failed: %s", title, exc)
        raise LlmCallError("unknown_error") from exc
