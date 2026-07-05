"""Orchestrate regex + optional LLM field extraction."""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field

from services.field_parser import (
    ParsedFields,
    _compute_confidence,
    _count_filled,
    merge_fields,
    parse_id_fields,
)
from services.llm_extractor import extract_fields_with_llm

logger = logging.getLogger(__name__)

# Trigger LLM when fewer than this many fields are filled by regex.
LLM_FALLBACK_MIN_FIELDS = 4


def detect_document_language(raw_text: str) -> str:
    arabic_chars = sum(1 for c in raw_text if "\u0600" <= c <= "\u06FF")
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
        "[field extraction] regex filled %d/6 fields | first=%s last=%s dob=%s id=%s conf=%.1f",
        filled,
        regex_fields.first_name,
        regex_fields.last_name,
        regex_fields.date_of_birth,
        regex_fields.id_number,
        regex_fields.confidence,
    )

    if filled >= LLM_FALLBACK_MIN_FIELDS:
        logger.info(
            "[field extraction] extraction_source=regex | llm_skipped=yes | regex_fields=%d",
            filled,
        )
        return ExtractionOutcome(
            fields=regex_fields,
            language=doc_language,
            warnings=[],
            llm_fallback_attempted=False,
            regex_field_count=filled,
        )

    logger.info(
        "[field extraction] regex below threshold (%d/%d) — attempting LLM fallback",
        filled,
        LLM_FALLBACK_MIN_FIELDS,
    )
    llm_fields, llm_error = extract_fields_with_llm(raw_text)
    if llm_fields is None:
        warnings: list[str] = []
        if llm_error:
            warnings.append(llm_error)
            logger.warning(
                "[field extraction] extraction_source=regex | llm_failed=yes | reason=%s",
                llm_error,
            )
        else:
            logger.warning(
                "[field extraction] extraction_source=regex | llm_failed=yes | reason=unknown",
            )
        return ExtractionOutcome(
            fields=regex_fields,
            language=doc_language,
            warnings=warnings,
            llm_fallback_attempted=True,
            regex_field_count=filled,
        )

    merged = merge_fields(regex_fields, llm_fields, source="regex+llm")
    merged.confidence = _compute_confidence(merged, ocr_confidence)
    merged_count = _count_filled(merged)
    logger.info(
        "[field extraction] extraction_source=regex+llm | llm_skipped=no | "
        "regex_fields=%d merged_fields=%d conf=%.1f",
        filled,
        merged_count,
        merged.confidence,
    )
    return ExtractionOutcome(
        fields=merged,
        language=doc_language,
        warnings=[],
        llm_fallback_attempted=True,
        regex_field_count=filled,
    )
