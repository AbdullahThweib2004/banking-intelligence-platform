"""Parse structured ID fields from OCR raw text."""

from __future__ import annotations

import re
from dataclasses import dataclass, fields as dataclass_fields
from datetime import datetime


@dataclass
class ParsedFields:
    first_name: str = ""
    last_name: str = ""
    date_of_birth: str = ""
    father_name: str = ""
    mother_name: str = ""
    id_number: str = ""
    confidence: float = 0.0
    extraction_source: str = "regex"


_MONTHS = (
    "JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC"
    "|JANUARY|FEBRUARY|MARCH|APRIL|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER"
)


def _find(patterns: list[str], text: str, flags: int = re.IGNORECASE) -> str:
    for pattern in patterns:
        m = re.search(pattern, text, flags)
        if m:
            return m.group(1).strip()
    return ""


def normalize_ocr_text(text: str) -> str:
    """Fix common OCR misreads before field extraction."""
    t = text.replace("\r", "\n")
    replacements = [
        (r"\bDet[o0]\s+of\s+Birth\b", "Date of Birth"),
        (r"\b1D\s*Number\b", "ID Number"),
        (r"\b1D\s*No\b", "ID No"),
        (r"\bLD\s*Number\b", "ID Number"),
        (r"\bDate\s+0f\s+Birth\b", "Date of Birth"),
        (r"\bFath[e]?r['']?\s*s?\s*Name\b", "Father Name"),
        (r"\bMoth[e]?r['']?\s*s?\s*Name\b", "Mother Name"),
    ]
    for pattern, repl in replacements:
        t = re.sub(pattern, repl, t, flags=re.IGNORECASE)
    return t


def _normalize_date(raw: str) -> str:
    raw = raw.strip()
    if not raw:
        return ""

    # Already ISO-ish: 1990-05-14 or OCR variants 1990.05.14 / 1990/05/14
    m = re.match(r"(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})", raw)
    if m:
        y, mo, d = m.groups()
        return f"{y}-{mo.zfill(2)}-{d.zfill(2)}"

    m = re.match(r"(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})", raw)
    if m:
        d, mo, y = m.groups()
        return f"{y}-{mo.zfill(2)}-{d.zfill(2)}"

    # 01 JAN 1990
    m = re.match(rf"(\d{{1,2}})\s+({_MONTHS})\s+(\d{{4}})", raw, re.IGNORECASE)
    if m:
        d, mon, y = m.groups()
        try:
            dt = datetime.strptime(f"{d} {mon[:3].title()} {y}", "%d %b %Y")
            return dt.strftime("%Y-%m-%d")
        except ValueError:
            return raw

    return raw


def _split_person_name(full: str) -> tuple[str, str]:
    parts = [p for p in re.split(r"\s+", full.strip()) if p]
    if len(parts) >= 2:
        return parts[0], parts[-1]
    if len(parts) == 1:
        return parts[0], ""
    return "", ""


def _clean_name(value: str) -> str:
    return re.sub(r"\s+", " ", value.strip(" .,\t"))


_HEADER_WORDS = frozenset(
    {
        "identity", "card", "identification", "license", "driver",
        "national", "republic", "palestinian", "passport", "document",
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
    if any(w in ("number", "no", "dob", "birth", "idnumber") for w in words):
        return True
    return False


def _name_from_caps_lines(text: str) -> tuple[str, str]:
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

    _, best = max(candidates, key=lambda item: (item[0], len(item[1])))
    return _split_person_name(best)


def _count_filled(fields: ParsedFields) -> int:
    return sum(
        1
        for f in dataclass_fields(fields)
        if f.name not in ("confidence", "extraction_source") and getattr(fields, f.name)
    )


def parse_id_fields(raw_text: str, ocr_confidence: float = 0.0) -> ParsedFields:
    text = normalize_ocr_text(raw_text)
    fields = ParsedFields()

    fields.id_number = _find(
        [
            r"(?:ID|Identity|Document)\s*No(?:\.|,|:|\s)*(\d{6,12})",
            r"(?:ID|Identity|رقم\s*الهوية|هوية)[:\s#]*(\d{6,12})",
            r"(?:Number|No)[:\s.]*(\d{6,12})",
            r"\b(\d{9})\b",
            r"\b(\d{8})\b",
        ],
        text,
    )

    dob_raw = _find(
        [
            rf"(?:DOB|Date of Birth|Birth|Born|تاريخ\s*الميلاد)[:\s]*(\d{{1,2}}\s+(?:{_MONTHS})\s+\d{{4}})",
            r"(?:DOB|Date of Birth|Birth|Born|تاريخ\s*الميلاد)[:\s]*(\d{4}[.\-/]\d{1,2}[.\-/]\d{1,2})",
            r"(?:DOB|Date of Birth|Birth|Born)[:\s]*(\d{1,2}[.\-/]\d{1,2}[.\-/]\d{4})",
            rf"\b(\d{{1,2}}\s+(?:{_MONTHS})\s+\d{{4}})\b",
            r"\b(\d{4}[.\-/]\d{1,2}[.\-/]\d{1,2})\b",
        ],
        text,
    )
    fields.date_of_birth = _normalize_date(dob_raw)

    first_raw = _find(
        [
            r"(?:First Name|Given Name|Given Names|FIRST NAME|الاسم\s*الأول)[:\s]+([A-Za-z\u0600-\u06FF\.\-\s]+?)(?:\n|$)",
        ],
        text,
    )
    if first_raw:
        fields.first_name = _clean_name(first_raw.split()[0])

    last_raw = _find(
        [
            r"(?:Last Name|Surname|Family Name|LAST NAME|اسم\s*العائلة)[:\s]+([A-Za-z\u0600-\u06FF\.\-\s]+?)(?:\n|$)",
        ],
        text,
    )
    if last_raw:
        fields.last_name = _clean_name(last_raw.split()[0])

    fields.father_name = _clean_name(
        _find(
            [
                r"(?:Father(?:'s)?\s*Name|Father|FATHER(?:'S)?\s*NAME|اسم\s*الأب)[:\s]+([A-Za-z\u0600-\u06FF\.\-\s]+?)(?:\n|$)",
            ],
            text,
        )
    )

    fields.mother_name = _clean_name(
        _find(
            [
                r"(?:Mother(?:'s)?\s*Name|Mother|MOTHER(?:'S)?\s*NAME|اسم\s*الأم)[:\s]+([A-Za-z\u0600-\u06FF\.\-\s]+?)(?:\n|$)",
            ],
            text,
        )
    )

    if not fields.first_name and not fields.last_name:
        full = _find(
            [
                r"(?:Full Name|Name|Holder|الاسم)[:\s]+([A-Za-z\u0600-\u06FF\.\-\s]+?)(?:\n|$)",
            ],
            text,
        )
        if full:
            fields.first_name, fields.last_name = _split_person_name(_clean_name(full))

    if not fields.first_name and not fields.last_name:
        fields.first_name, fields.last_name = _name_from_caps_lines(text)

    fields.confidence = _compute_confidence(fields, ocr_confidence)
    return fields


def _compute_confidence(fields: ParsedFields, ocr_confidence: float) -> float:
    filled = _count_filled(fields)
    parse_score = min(100.0, filled * (100.0 / 6.0))
    if ocr_confidence > 0:
        return round(ocr_confidence * 0.55 + parse_score * 0.45, 1)
    return round(parse_score, 1)


