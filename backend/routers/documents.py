from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field

from services.auth import require_account_opening_role
from services.employment_extractor import extract_employment_fields
from services.field_extraction import extract_all_fields
from services.form_generator import FormFields, SignaturePayload, generate_account_opening_pdf
from services.ocr import run_ocr
from services.store import create_document, get_document, store_pdf

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
        "language": outcome.language,
        "ocr_language": doc.language,
        "raw_text": doc.raw_text,
    }


@router.post("/extract-employment-proof")
async def extract_employment_proof(
    file: UploadFile = File(...),
    _role: str = Depends(require_account_opening_role),
):
    """
    Upload a proof-of-employment document (payslip, salary certificate, or
    employer letter — JPG/PNG/PDF), run OCR, and return a document id.

    Mirrors /extract-id's upload step and reuses the same OCR pipeline —
    only the downstream field-extraction step differs (see
    /extract-employment-fields below).
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
            detail="Could not read the document clearly. Please upload a clearer photo or scan.",
        ) from exc
    except Exception as exc:
        logger.exception("OCR failed for %s", filename)
        raise HTTPException(
            status_code=422,
            detail="Could not read the document clearly. Please upload a clearer photo or scan.",
        ) from exc

    doc = create_document(
        filename,
        ocr.raw_text,
        ocr.language,
        ocr_confidence=ocr.ocr_confidence,
        doc_type="employment_proof",
    )

    logger.info("[extract-employment-proof] stored document_id=%s", doc.document_id)

    return {
        "document_id": doc.document_id,
        "language": doc.language,
        "ocr_confidence": doc.ocr_confidence,
    }


@router.post("/{document_id}/extract-employment-fields")
async def extract_employment_fields_endpoint(
    document_id: str,
    _role: str = Depends(require_account_opening_role),
):
    """Parse employer/salary fields from a previously OCR'd employment-proof document."""
    # Confirms this endpoint was actually reached for this document_id — the
    # first thing to check when a customer's extracted data doesn't show up
    # is whether this line appears in the logs at all.
    logger.info("[extract-employment-fields] called for document_id=%s", document_id)

    doc = get_document(document_id)
    if not doc:
        logger.warning("[extract-employment-fields] document_id=%s not found in store", document_id)
        raise HTTPException(status_code=404, detail="Document not found.")
    if doc.doc_type != "employment_proof":
        logger.warning(
            "[extract-employment-fields] document_id=%s has doc_type=%s, expected employment_proof",
            document_id,
            doc.doc_type,
        )
        raise HTTPException(
            status_code=400,
            detail="This document was not uploaded as a proof of employment.",
        )

    if not doc.raw_text.strip():
        logger.warning("[extract-employment-fields] document_id=%s has empty OCR text", document_id)
        raise HTTPException(
            status_code=422,
            detail="Could not read the document clearly. Please upload a clearer photo or scan.",
        )

    parsed, warning = extract_employment_fields(doc.raw_text)

    if parsed is None:
        # LLM unavailable/failed — never guess; return an all-empty result
        # with the warning so the UI requires manual entry, same pattern as
        # the ID pipeline's own "AI recovery unavailable" fallback.
        logger.warning(
            "[extract-employment-fields] document_id=%s | extraction failed, returning empty fields: %s",
            document_id,
            warning,
        )
        return {
            "document_id": doc.document_id,
            "full_name": "",
            "national_id": "",
            "employer_name": "",
            "job_title": "",
            "monthly_salary": None,
            "currency": "",
            "employment_status": "",
            "issue_date": "",
            "confidence": 0,
            "extraction_warnings": [warning] if warning else [],
        }

    logger.info(
        "[extract-employment-fields] document_id=%s | SUCCESS | full_name=%s employer=%s job_title=%s "
        "salary=%s currency=%s status=%s issue_date=%s confidence=%.1f",
        document_id,
        parsed.full_name,
        parsed.employer_name,
        parsed.job_title,
        parsed.monthly_salary,
        parsed.currency,
        parsed.employment_status,
        parsed.issue_date,
        parsed.confidence,
    )

    return {
        "document_id": doc.document_id,
        "full_name": parsed.full_name,
        "national_id": parsed.national_id,
        "employer_name": parsed.employer_name,
        "job_title": parsed.job_title,
        "monthly_salary": parsed.monthly_salary,
        "currency": parsed.currency,
        "employment_status": parsed.employment_status,
        "issue_date": parsed.issue_date,
        "confidence": parsed.confidence,
        "extraction_warnings": [],
    }


class GenerateFormRequest(BaseModel):
    """Fields from a prior /extract-fields call (may be edited in the UI)."""

    language: str | None = Field(
        default=None,
        description="Force template language: ar or en. Auto-detected from raw_text when omitted.",
    )
    first_name: str = Field(min_length=1)
    last_name: str = Field(min_length=1)
    date_of_birth: str = Field(min_length=1)
    id_number: str = Field(min_length=1)
    father_name: str = ""
    mother_name: str = ""
    customer_signature: str | None = Field(
        default=None,
        description="PNG signature — base64 or data URI from UI canvas.",
    )
    employee_signature: str | None = Field(
        default=None,
        description="PNG signature — base64 or data URI from UI canvas.",
    )
    staff_signature: str | None = Field(
        default=None,
        description="Alias for employee_signature (deprecated).",
    )
    return_format: str = Field(
        default="download",
        description='Return as file download ("download") or JSON base64 ("base64").',
    )


@router.post("/{document_id}/generate-form")
async def generate_form(
    document_id: str,
    body: GenerateFormRequest,
    _role: str = Depends(require_account_opening_role),
):
    """Render a two-copy account-opening PDF (bank + customer) from extracted fields."""
    doc = get_document(document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found.")

    lang = body.language.lower() if body.language else None
    if lang is not None and lang not in ("ar", "en"):
        raise HTTPException(status_code=400, detail="language must be 'ar' or 'en'.")

    fields = FormFields(
        first_name=body.first_name.strip(),
        last_name=body.last_name.strip(),
        date_of_birth=body.date_of_birth.strip(),
        id_number=body.id_number.strip(),
        father_name=body.father_name.strip(),
        mother_name=body.mother_name.strip(),
    )

    employee_sig = body.employee_signature or body.staff_signature

    try:
        pdf_bytes = generate_account_opening_pdf(
            document_id=document_id,
            raw_text=doc.raw_text,
            fields=fields,
            language=lang,  # type: ignore[arg-type]
            signatures=SignaturePayload(
                customer_signature=body.customer_signature,
                employee_signature=employee_sig,
            ),
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("[generate-form] failed document_id=%s", document_id)
        raise HTTPException(status_code=500, detail="Could not generate the account opening form.") from exc

    filename = f"account_opening_{document_id}.pdf"
    store_pdf(document_id, pdf_bytes, filename)
    logger.info("[generate-form] document_id=%s bytes=%d format=%s", document_id, len(pdf_bytes), body.return_format)

    if body.return_format == "base64":
        import base64

        return {
            "document_id": document_id,
            "filename": filename,
            "content_type": "application/pdf",
            "pdf_base64": base64.b64encode(pdf_bytes).decode("ascii"),
            "size_bytes": len(pdf_bytes),
        }

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/{document_id}/pdf")
async def download_pdf(
    document_id: str,
    _role: str = Depends(require_account_opening_role),
):
    """Return the account-opening PDF generated for this document (same server session)."""
    doc = get_document(document_id)
    if not doc or not doc.pdf_bytes:
        raise HTTPException(status_code=404, detail="PDF not available for this document.")

    filename = doc.pdf_filename or f"account_opening_{document_id}.pdf"
    return Response(
        content=doc.pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )
