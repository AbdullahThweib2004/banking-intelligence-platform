from __future__ import annotations

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from services.auth import require_account_opening_role
from services.field_parser import parse_id_fields
from services.ocr import run_ocr
from services.store import create_document, get_document

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
        raw_text, language = run_ocr(data, filename)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=422,
            detail="Could not read the ID clearly. Please upload a clearer photo.",
        ) from exc

    doc = create_document(filename, raw_text, language)

    return {
        "document_id": doc.document_id,
        "raw_text": doc.raw_text,
        "language": doc.language,
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

    parsed = parse_id_fields(doc.raw_text)

    return {
        "document_id": doc.document_id,
        "first_name": parsed.first_name,
        "last_name": parsed.last_name,
        "date_of_birth": parsed.date_of_birth,
        "father_name": parsed.father_name,
        "mother_name": parsed.mother_name,
        "id_number": parsed.id_number,
        "confidence": parsed.confidence,
        "language": doc.language,
    }
