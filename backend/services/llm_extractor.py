"""LLM-based structured field extraction fallback (OpenRouter)."""

from __future__ import annotations

import re

from services.field_parser import ParsedFields, _compute_confidence, _normalize_date
from services.llm_client import LlmCallError, call_llm_for_json, llm_configured, user_facing_error

DEFAULT_MODEL = "openai/gpt-4o-mini"

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
    return llm_configured()


def extract_fields_with_llm(raw_text: str) -> tuple[ParsedFields | None, str | None]:
    """
    Returns (parsed_fields, user_facing_error).
    On success: (fields, None). On failure: (None, error_message).
    """
    try:
        data = call_llm_for_json(
            SYSTEM_PROMPT,
            f"Extract identity fields from this OCR text:\n\n{raw_text}",
            model_env_var="ID_EXTRACT_MODEL",
            default_model=DEFAULT_MODEL,
            title="BoP ID Field Extraction",
        )
    except LlmCallError as exc:
        return None, user_facing_error(exc.code)

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
