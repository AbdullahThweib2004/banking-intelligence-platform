"""LLM-based structured field extraction fallback (OpenRouter)."""

from __future__ import annotations

import json
import logging
import os
import re
from typing import Any

import httpx

from services.field_parser import ParsedFields, _compute_confidence, _normalize_date

logger = logging.getLogger(__name__)

OPENROUTER_BASE = "https://openrouter.ai/api/v1"
DEFAULT_MODEL = os.environ.get("ID_EXTRACT_MODEL", "openai/gpt-4o-mini")

SYSTEM_PROMPT = """You extract structured identity-document fields from noisy OCR text.
Respond with ONLY one valid JSON object — no markdown, no code fences, no commentary.

Rules:
- Use empty string "" when a field cannot be determined from the text.
- date_of_birth must be ISO format YYYY-MM-DD when possible.
- Names should be plain text without labels.
- id_number: digits only, no spaces.
- confidence: 0-100 reflecting how certain you are overall.

JSON schema:
{
  "first_name": string,
  "last_name": string,
  "date_of_birth": string,
  "father_name": string,
  "mother_name": string,
  "id_number": string,
  "confidence": number
}"""


def llm_fallback_configured() -> bool:
    return bool(os.environ.get("OPENROUTER_API_KEY", "").strip())


def _parse_json_response(content: str) -> dict[str, Any]:
    text = content.strip()
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if fence:
        text = fence.group(1).strip()
    return json.loads(text)


def _user_facing_error(code: str) -> str:
    messages = {
        "missing_api_key": (
            "AI-assisted field recovery is unavailable (OPENROUTER_API_KEY not configured). "
            "Please review and enter missing fields manually."
        ),
        "rate_limit": (
            "AI-assisted field recovery is temporarily unavailable (rate limit). "
            "Please review and enter missing fields manually."
        ),
        "network_error": (
            "AI-assisted field recovery failed due to a network error. "
            "Please review and enter missing fields manually."
        ),
        "parse_error": (
            "AI-assisted field recovery returned an invalid response. "
            "Please review and enter missing fields manually."
        ),
        "unknown_error": (
            "AI-assisted field recovery failed. "
            "Please review and enter missing fields manually."
        ),
    }
    return messages.get(code, messages["unknown_error"])


def extract_fields_with_llm(raw_text: str) -> tuple[ParsedFields | None, str | None]:
    """
    Returns (parsed_fields, user_facing_error).
    On success: (fields, None). On failure: (None, error_message).
    """
    api_key = os.environ.get("OPENROUTER_API_KEY", "").strip()
    if not api_key:
        logger.warning("[LLM extract] OPENROUTER_API_KEY not set — skipping fallback")
        return None, _user_facing_error("missing_api_key")

    payload = {
        "model": DEFAULT_MODEL,
        "temperature": 0,
        "max_tokens": 400,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": f"Extract identity fields from this OCR text:\n\n{raw_text}",
            },
        ],
        "response_format": {"type": "json_object"},
    }

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": os.environ.get("OPENROUTER_HTTP_REFERER", "http://localhost:8080"),
        "X-Title": "BoP ID Field Extraction",
    }

    try:
        with httpx.Client(timeout=30.0) as client:
            res = client.post(f"{OPENROUTER_BASE}/chat/completions", json=payload, headers=headers)
            if res.status_code == 429:
                logger.warning("[LLM extract] rate limited (429)")
                return None, _user_facing_error("rate_limit")
            res.raise_for_status()
            content = res.json()["choices"][0]["message"]["content"]
        logger.info("[LLM extract] raw response: %s", content[:500])
        data = _parse_json_response(content)
    except httpx.HTTPError as exc:
        logger.warning("[LLM extract] network/http failed: %s", exc)
        return None, _user_facing_error("network_error")
    except (json.JSONDecodeError, KeyError, IndexError, TypeError) as exc:
        logger.warning("[LLM extract] parse failed: %s", exc)
        return None, _user_facing_error("parse_error")
    except Exception as exc:
        logger.warning("[LLM extract] failed: %s", exc)
        return None, _user_facing_error("unknown_error")

    fields = ParsedFields(
        first_name=str(data.get("first_name") or "").strip(),
        last_name=str(data.get("last_name") or "").strip(),
        date_of_birth=_normalize_date(str(data.get("date_of_birth") or "")),
        father_name=str(data.get("father_name") or "").strip(),
        mother_name=str(data.get("mother_name") or "").strip(),
        id_number=re.sub(r"\D", "", str(data.get("id_number") or "")),
        confidence=float(data.get("confidence") or 0),
        extraction_source="llm",
    )
    if fields.confidence <= 0:
        fields.confidence = _compute_confidence(fields, 0)
    return fields, None
