"""Regex/OCR field extraction for ID documents.

Deliberately regex-only, no LLM fallback: a national ID card has a fixed,
standard government layout, so the regex parser (services/field_parser.py)
is expected to reliably extract every field from clean OCR text. Unlike
employment-proof documents (which vary per employer and do need an LLM —
see services/employment_extractor.py), spending an AI call per ID is
unnecessary here.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field

from services.field_parser import ParsedFields, _count_filled, parse_id_fields

logger = logging.getLogger(__name__)


def detect_document_language(raw_text: str) -> str:
    arabic_chars = sum(1 for c in raw_text if "؀" <= c <= "ۿ")
    total_chars = len(re.findall(r"\S", raw_text))
    if total_chars == 0:
        return "en"
    return "ar" if arabic_chars / total_chars > 0.3 else "en"


@dataclass
class ExtractionOutcome:
    fields: ParsedFields
    language: str
    warnings: list[str] = field(default_factory=list)
    llm_fallback_attempted: bool = False
    regex_field_count: int = 0


def extract_all_fields(raw_text: str, ocr_confidence: float = 0.0) -> ExtractionOutcome:
    doc_language = detect_document_language(raw_text)
    logger.info("[field extraction] detected language=%s", doc_language)
    logger.info(
        "[field extraction] raw_text before parsing (%d chars):\n%s",
        len(raw_text),
        raw_text,
    )

    regex_fields = parse_id_fields(raw_text, ocr_confidence=ocr_confidence)
    filled = _count_filled(regex_fields)
    logger.info(
        "[field extraction] extraction_source=regex (AI disabled for ID documents) | "
        "filled %d/6 fields | first=%s last=%s dob=%s id=%s conf=%.1f",
        filled,
        regex_fields.first_name,
        regex_fields.last_name,
        regex_fields.date_of_birth,
        regex_fields.id_number,
        regex_fields.confidence,
    )

    return ExtractionOutcome(
        fields=regex_fields,
        language=doc_language,
        warnings=[],
        llm_fallback_attempted=False,
        regex_field_count=filled,
    )
