"""In-memory document store for the OCR pipeline."""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Literal


Language = Literal["en", "ar", "mixed"]


@dataclass
class StoredDocument:
    document_id: str
    filename: str
    raw_text: str
    language: Language
    ocr_confidence: float = 0.0
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    pdf_bytes: bytes | None = None
    pdf_filename: str | None = None


_documents: dict[str, StoredDocument] = {}


def create_document(
    filename: str,
    raw_text: str,
    language: Language,
    ocr_confidence: float = 0.0,
) -> StoredDocument:
    doc_id = f"doc_{uuid.uuid4().hex[:12]}"
    doc = StoredDocument(
        document_id=doc_id,
        filename=filename,
        raw_text=raw_text,
        language=language,
        ocr_confidence=ocr_confidence,
    )
    _documents[doc_id] = doc
    return doc


def get_document(document_id: str) -> StoredDocument | None:
    return _documents.get(document_id)


def store_pdf(document_id: str, pdf_bytes: bytes, filename: str) -> None:
    doc = _documents.get(document_id)
    if doc:
        doc.pdf_bytes = pdf_bytes
        doc.pdf_filename = filename
