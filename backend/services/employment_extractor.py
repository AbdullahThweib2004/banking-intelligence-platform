"""LLM-based structured field extraction for employment-proof documents
(payslips, salary certificates, employer letters).

Unlike national ID cards — which have a fixed government layout that the
regex parser in field_parser.py can target — employment-proof documents vary
per employer with no common template, so a regex-first pass would either
need one hardcoded layout (breaking on every other employer's document) or
silently return nothing. Given that, this module goes straight to the LLM
step instead of a disconnected regex-then-LLM pipeline like the ID flow.

It reuses the OCR step (services/ocr.py, via the /documents/extract-employment-proof
route) and the exact same OpenRouter-calling infrastructure as the ID
extractor (services/llm_client.py) rather than duplicating the HTTP/JSON
plumbing — only the prompt/schema is specific to this document type.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from services.field_parser import _normalize_date
from services.llm_client import LlmCallError, call_llm_for_json, user_facing_error

DEFAULT_MODEL = "openai/gpt-4o-mini"

SYSTEM_PROMPT = """You extract structured employment/salary fields from noisy OCR text of an employment-proof document (payslip, salary certificate, or employer letter).
Respond with ONLY one valid JSON object — no markdown, no code fences, no commentary.

Rules:
- Use empty string "" (or null for monthly_salary) when a field cannot be determined from the text.
- issue_date must be ISO format YYYY-MM-DD when possible.
- monthly_salary: a plain number with no currency symbol and no thousands separators, representing the salary figure as stated on the document (prefer a figure explicitly labeled "monthly", "net", or "gross" salary). Do not calculate, estimate, or annualize/de-annualize it.
- currency: the currency the salary figure is stated in, as one of exactly "ILS", "USD", or "JOD" (map symbols/words like "$"/"dollars" -> USD, "₪"/"shekel"/"NIS" -> ILS, "دينار"/"JD" -> JOD). Use "" if no currency is stated or determinable — never guess one.
- employment_status: one of "employed", "self-employed", "business", or "" if unclear from the text.
- national_id: digits only, no spaces, or "" if not present on the document.
- confidence: 0-100 reflecting how certain you are overall.

JSON schema:
{
  "full_name": string,
  "national_id": string,
  "employer_name": string,
  "job_title": string,
  "monthly_salary": number | null,
  "currency": string,
  "employment_status": string,
  "issue_date": string,
  "confidence": number
}"""

SUPPORTED_CURRENCIES = ("ILS", "USD", "JOD")


@dataclass
class ParsedEmploymentFields:
    full_name: str = ""
    national_id: str = ""
    employer_name: str = ""
    job_title: str = ""
    monthly_salary: float | None = None
    currency: str = ""
    employment_status: str = ""
    issue_date: str = ""
    confidence: float = 0.0
    extraction_source: str = "llm"


def _parse_salary(raw: object) -> float | None:
    """Normalizes a salary value returned by the LLM into a plain float, or
    None when it can't be interpreted as a number. Exposed standalone (no
    LLM call) so it can be unit tested directly."""
    if isinstance(raw, bool):
        return None
    if isinstance(raw, (int, float)):
        return float(raw)
    if isinstance(raw, str) and raw.strip():
        cleaned = re.sub(r"[^\d.]", "", raw)
        if not cleaned:
            return None
        try:
            return float(cleaned)
        except ValueError:
            return None
    return None


def _parse_employment_status(raw: object) -> str:
    """Normalizes the LLM's employment_status into one of the three known
    values, or "" if it returned anything else (including a hallucinated
    value). Exposed standalone so it can be unit tested directly."""
    status = str(raw or "").strip().lower()
    return status if status in ("employed", "self-employed", "business") else ""


def _parse_currency(raw: object) -> str:
    """Normalizes the LLM's currency into one of the app's supported
    currencies, or "" if it returned anything else — never guesses a
    currency the model didn't actually report. Exposed standalone so it can
    be unit tested directly."""
    currency = str(raw or "").strip().upper()
    return currency if currency in SUPPORTED_CURRENCIES else ""


def extract_employment_fields(raw_text: str) -> tuple[ParsedEmploymentFields | None, str | None]:
    """
    Returns (parsed_fields, user_facing_warning).

    Unlike the ID extractor, there is no regex fallback here — if the LLM
    call fails, `parsed_fields` is None and the caller must fall back to an
    all-empty/manual-entry result, never a guessed value.
    """
    try:
        data = call_llm_for_json(
            SYSTEM_PROMPT,
            f"Extract employment/salary fields from this OCR text:\n\n{raw_text}",
            model_env_var="EMPLOYMENT_EXTRACT_MODEL",
            default_model=DEFAULT_MODEL,
            title="BoP Employment Proof Extraction",
        )
    except LlmCallError as exc:
        return None, user_facing_error(exc.code)

    fields = ParsedEmploymentFields(
        full_name=str(data.get("full_name") or "").strip(),
        national_id=re.sub(r"\D", "", str(data.get("national_id") or "")),
        employer_name=str(data.get("employer_name") or "").strip(),
        job_title=str(data.get("job_title") or "").strip(),
        monthly_salary=_parse_salary(data.get("monthly_salary")),
        currency=_parse_currency(data.get("currency")),
        employment_status=_parse_employment_status(data.get("employment_status")),
        issue_date=_normalize_date(str(data.get("issue_date") or "")),
        confidence=float(data.get("confidence") or 0),
    )
    return fields, None
