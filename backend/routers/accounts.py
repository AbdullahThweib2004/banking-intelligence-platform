from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from services.auth import require_account_opening_role
from services.field_parser import parse_id_fields
from services.store import get_document

router = APIRouter(prefix="/accounts", tags=["accounts"])


class OpenAccountRequest(BaseModel):
    document_id: str
    first_name: str = Field(min_length=1)
    last_name: str = Field(min_length=1)
    date_of_birth: str = Field(min_length=1)
    father_name: str = ""
    mother_name: str = ""
    id_number: str = Field(min_length=1)


@router.post("/open-new")
async def open_new_account(
    body: OpenAccountRequest,
    _role: str = Depends(require_account_opening_role),
):
    doc = get_document(body.document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found.")

    confirmed = [
        body.first_name,
        body.last_name,
        body.date_of_birth,
        body.father_name,
        body.mother_name,
        body.id_number,
    ]
    extracted_count = sum(1 for v in confirmed if v.strip())

    base_name = f"{body.first_name}_{body.last_name}".strip().replace(" ", "_") or body.id_number
    reference_id = f"ACC-{datetime.now(timezone.utc).year}-{uuid.uuid4().hex[:6].upper()}"

    parsed = parse_id_fields(doc.raw_text)

    return {
        "reference_id": reference_id,
        "document_id": body.document_id,
        "file_name": f"{base_name}_account_opening.pdf",
        "extracted_fields": extracted_count,
        "confidence": parsed.confidence,
    }
