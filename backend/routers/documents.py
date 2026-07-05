from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from services.auth import require_account_opening_role
from services.field_extraction import extract_all_fields
from services.ocr import run_ocr
from services.store import create_document, get_document

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/documents", tags=["documents"])

ALLOWED_TYPES = {
    "image/jpeg",
    "image/png",
    "image/jpg",
    "application/pdf",
}


@router.post("/extract-id")
async def extract_id(
    file: UploadFile = File(...),
    _role: str = Depends(require_account_opening_role),
):
    """
    Upload an ID image (JPG/PNG/PDF), preprocess, run OCR, and return a document id.
    """
    if file.content_type not in ALLOWED_TYPES and not (
        file.filename and file.filename.lower().endswith((".jpg", ".jpeg", ".png", ".pdf"))
    ):
        raise HTTPException(status_code=400, detail="Only JPG, PNG, or PDF files are allowed.")

    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty file.")

    filename = file.filename or "upload.jpg"

    try:
        ocr = run_ocr(data, filename)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=422,
            detail="Could not read the ID clearly. Please upload a clearer photo.",
        ) from exc
    except Exception as exc:
        logger.exception("OCR failed for %s", filename)
        raise HTTPException(
            status_code=422,
            detail="Could not read the ID clearly. Please upload a clearer photo.",
        ) from exc

    logger.info(
        "[extract-id] document pending | file=%s | ocr_confidence=%.1f | raw_text (%d chars):\n%s",
        filename,
        ocr.ocr_confidence,
        len(ocr.raw_text),
        ocr.raw_text,
    )

    doc = create_document(
        filename,
        ocr.raw_text,
        ocr.language,
        ocr_confidence=ocr.ocr_confidence,
    )

    logger.info("[extract-id] stored document_id=%s", doc.document_id)

    return {
        "document_id": doc.document_id,
        "raw_text": doc.raw_text,
        "language": doc.language,
        "ocr_confidence": doc.ocr_confidence,
    }


@router.post("/{document_id}/extract-fields")
async def extract_fields(
    document_id: str,
    _role: str = Depends(require_account_opening_role),
):
    """Parse structured fields from a previously OCR'd document."""
    doc = get_document(document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found.")

    if not doc.raw_text.strip():
        raise HTTPException(
            status_code=422,
            detail="Could not read the ID clearly. Please upload a clearer photo.",
        )

    logger.info(
        "[extract-fields] document_id=%s | full raw_text (%d chars):\n%s",
        document_id,
        len(doc.raw_text),
        doc.raw_text,
    )

    outcome = extract_all_fields(doc.raw_text, ocr_confidence=doc.ocr_confidence)
    parsed = outcome.fields

    logger.info(
        "[extract-fields] document_id=%s | first=%s last=%s dob=%s father=%s mother=%s id=%s "
        "source=%s confidence=%.1f llm_attempted=%s warnings=%s",
        document_id,
        parsed.first_name,
        parsed.last_name,
        parsed.date_of_birth,
        parsed.father_name,
        parsed.mother_name,
        parsed.id_number,
        parsed.extraction_source,
        parsed.confidence,
        outcome.llm_fallback_attempted,
        outcome.warnings,
    )

    return {
        "document_id": doc.document_id,
        "first_name": parsed.first_name,
        "last_name": parsed.last_name,
        "date_of_birth": parsed.date_of_birth,
        "father_name": parsed.father_name,
        "mother_name": parsed.mother_name,
        "id_number": parsed.id_number,
        "confidence": parsed.confidence,
        "extraction_source": parsed.extraction_source,
        "llm_fallback_attempted": outcome.llm_fallback_attempted,
        "extraction_warnings": outcome.warnings,
        "language": doc.language,
        "raw_text": doc.raw_text,
    }
