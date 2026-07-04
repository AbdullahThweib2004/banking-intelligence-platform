"""Parse structured ID fields from OCR raw text."""

from __future__ import annotations

import re
from dataclasses import dataclass


@dataclass
class ParsedFields:
    first_name: str = ""
    last_name: str = ""
    date_of_birth: str = ""
    father_name: str = ""
    mother_name: str = ""
    id_number: str = ""
    confidence: float = 0.0


def _find(patterns: list[str], text: str, flags: int = re.IGNORECASE) -> str:
    for pattern in patterns:
        m = re.search(pattern, text, flags)
        if m:
            return m.group(1).strip()
    return ""


def parse_id_fields(raw_text: str) -> ParsedFields:
    text = raw_text.replace("\r", "\n")
    fields = ParsedFields()

    fields.id_number = _find(
        [
            r"(?:ID|Identity|رقم\s*الهوية|هوية)[:\s#]*(\d{6,12})",
            r"\b(\d{9})\b",
        ],
        text,
    )

    fields.date_of_birth = _find(
        [
            r"(?:DOB|Date of Birth|تاريخ\s*الميلاد|Born)[:\s]*(\d{4}[-/]\d{2}[-/]\d{2})",
            r"\b(\d{2}[-/]\d{2}[-/]\d{4})\b",
            r"\b(\d{4}-\d{2}-\d{2})\b",
        ],
        text,
    )

    fields.first_name = _find(
        [
            r"(?:First Name|Given Name|الاسم\s*الأول)[:\s]+([A-Za-z\u0600-\u06FF\-]+)",
        ],
        text,
    )

    fields.last_name = _find(
        [
            r"(?:Last Name|Surname|Family Name|اسم\s*العائلة)[:\s]+([A-Za-z\u0600-\u06FF\-]+)",
        ],
        text,
    )

    fields.father_name = _find(
        [
            r"(?:Father(?:'s)? Name|اسم\s*الأب)[:\s]+([A-Za-z\u0600-\u06FF\-]+)",
        ],
        text,
    )

    fields.mother_name = _find(
        [
            r"(?:Mother(?:'s)? Name|اسم\s*الأم)[:\s]+([A-Za-z\u0600-\u06FF\-]+)",
        ],
        text,
    )

    # Fallback: "First Last" on one line after Name:
    if not fields.first_name and not fields.last_name:
        full = _find([r"(?:Full Name|Name|الاسم)[:\s]+([A-Za-z\u0600-\u06FF\s\-]+)"], text)
        parts = full.split()
        if len(parts) >= 2:
            fields.first_name = parts[0]
            fields.last_name = " ".join(parts[1:])
        elif len(parts) == 1:
            fields.first_name = parts[0]

    filled = sum(
        1
        for v in (
            fields.first_name,
            fields.last_name,
            fields.date_of_birth,
            fields.father_name,
            fields.mother_name,
            fields.id_number,
        )
        if v
    )
    # Confidence scales with how many fields were parsed (60–95%).
    fields.confidence = round(min(95.0, 60.0 + filled * 6.0), 1)
    return fields
