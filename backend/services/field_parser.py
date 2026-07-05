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


def _split_person_name(full: str) -> tuple[str, str]:
    """Split 'JOHN A. SMITH' → ('JOHN', 'SMITH') keeping middle initials on first name."""
    parts = [p for p in re.split(r"\s+", full.strip()) if p]
    if len(parts) >= 2:
        return parts[0], parts[-1]
    if len(parts) == 1:
        return parts[0], ""
    return "", ""


_HEADER_WORDS = frozenset(
    {
        "identity",
        "card",
        "identification",
        "license",
        "driver",
        "national",
        "republic",
        "palestinian",
        "passport",
        "document",
    }
)


def _looks_like_header(line: str) -> bool:
    words = [w.lower() for w in re.split(r"\s+", line.strip()) if w]
    if not words:
        return True
    if all(w in _HEADER_WORDS for w in words):
        return True
    if any(w.startswith("date") for w in words):
        return True
    if any(w in ("number", "no", "dob", "birth") for w in words):
        return True
    return False


def _name_from_caps_lines(text: str) -> tuple[str, str]:
    """Heuristic: prominent ALL-CAPS person-name line (common on ID cards)."""
    candidates: list[tuple[int, str]] = []
    for line in text.splitlines():
        candidate = line.strip()
        if not candidate or len(candidate) < 5 or _looks_like_header(candidate):
            continue
        if re.fullmatch(r"[A-Z][A-Z\s\.'\-]{3,}", candidate):
            words = candidate.split()
            if 2 <= len(words) <= 5 and not re.search(r"\d", candidate):
                candidates.append((len(words), candidate))

    if not candidates:
        return "", ""

    # Prefer longer name lines (e.g. "JOHN A. SMITH" over stray two-word headers).
    _, best = max(candidates, key=lambda item: (item[0], len(item[1])))
    return _split_person_name(best)


def parse_id_fields(raw_text: str, ocr_confidence: float = 0.0) -> ParsedFields:
    text = raw_text.replace("\r", "\n")
    fields = ParsedFields()

    fields.id_number = _find(
        [
            r"(?:ID|Identity|Document\s*No|رقم\s*الهوية|هوية)[:\s#]*(\d{6,12})",
            r"\b(\d{9})\b",
        ],
        text,
    )

    fields.date_of_birth = _find(
        [
            r"(?:DOB|Date of Birth|Birth|تاريخ\s*الميلاد|Born)[:\s]*(\d{4}[-/]\d{2}[-/]\d{2})",
            r"\b(\d{2}[-/]\d{2}[-/]\d{4})\b",
            r"\b(\d{4}-\d{2}-\d{2})\b",
        ],
        text,
    )

    first_raw = _find(
        [
            r"(?:First Name|Given Name|Given Names|الاسم\s*الأول)[:\s]+([A-Za-z\u0600-\u06FF\.\-\s]+?)(?:\n|$)",
        ],
        text,
    )
    if first_raw:
        fields.first_name = first_raw.split()[0]

    last_raw = _find(
        [
            r"(?:Last Name|Surname|Family Name|اسم\s*العائلة)[:\s]+([A-Za-z\u0600-\u06FF\.\-\s]+?)(?:\n|$)",
        ],
        text,
    )
    if last_raw:
        fields.last_name = last_raw.split()[0]

    fields.father_name = _find(
        [
            r"(?:Father(?:'s)?\s*Name|Father|اسم\s*الأب)[:\s]+([A-Za-z\u0600-\u06FF\.\-\s]+?)(?:\n|$)",
        ],
        text,
    )

    fields.mother_name = _find(
        [
            r"(?:Mother(?:'s)?\s*Name|Mother|اسم\s*الأم)[:\s]+([A-Za-z\u0600-\u06FF\.\-\s]+?)(?:\n|$)",
        ],
        text,
    )

    if not fields.first_name and not fields.last_name:
        full = _find(
            [
                r"(?:Full Name|Name|Holder|الاسم)[:\s]+([A-Za-z\u0600-\u06FF\.\-\s]+?)(?:\n|$)",
            ],
            text,
        )
        if full:
            fields.first_name, fields.last_name = _split_person_name(full)

    if not fields.first_name and not fields.last_name:
        fields.first_name, fields.last_name = _name_from_caps_lines(text)

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

    # Blend OCR engine confidence with how many structured fields we parsed.
    parse_score = min(100.0, filled * (100.0 / 6.0))
    if ocr_confidence > 0:
        fields.confidence = round(ocr_confidence * 0.6 + parse_score * 0.4, 1)
    else:
        fields.confidence = round(parse_score, 1)

    return fields
