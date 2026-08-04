"""Tests for /accounts/open-new (routers/accounts.py)."""

from __future__ import annotations

from io import BytesIO
from unittest.mock import patch

from services.ocr import OcrResult

FAKE_JPEG_BYTES = b"\xff\xd8\xff\xe0not a real jpeg but non-empty"


def _fake_ocr_result() -> OcrResult:
    return OcrResult(raw_text="ID NO: 123456789\nName: Jane Doe", language="en", ocr_confidence=87.5, pass_details=[])


def _upload_document(client, employee_headers) -> str:
    with patch("routers.documents.run_ocr", return_value=_fake_ocr_result()):
        response = client.post(
            "/documents/extract-id",
            headers=employee_headers,
            files={"file": ("id.jpg", BytesIO(FAKE_JPEG_BYTES), "image/jpeg")},
        )
    return response.json()["document_id"]


def test_returns_404_for_an_unknown_document_id(client, employee_headers):
    response = client.post(
        "/accounts/open-new",
        headers=employee_headers,
        json={
            "document_id": "doc_unknown",
            "first_name": "Jane",
            "last_name": "Doe",
            "date_of_birth": "1990-01-01",
            "id_number": "123456789",
        },
    )
    assert response.status_code == 404


def test_success_returns_a_reference_id_for_a_known_document(client, employee_headers):
    document_id = _upload_document(client, employee_headers)

    response = client.post(
        "/accounts/open-new",
        headers=employee_headers,
        json={
            "document_id": document_id,
            "first_name": "Jane",
            "last_name": "Doe",
            "date_of_birth": "1990-01-01",
            "id_number": "123456789",
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["reference_id"].startswith("ACC-")
    assert body["document_id"] == document_id
    assert body["extracted_fields"] >= 1


def test_rejects_a_request_missing_required_fields(client, employee_headers):
    response = client.post(
        "/accounts/open-new",
        headers=employee_headers,
        json={"document_id": "doc_unknown"},
    )
    assert response.status_code == 422


def test_rejects_disallowed_role_before_touching_the_document(client):
    response = client.post(
        "/accounts/open-new",
        headers={"X-User-Role": "audit_department"},
        json={
            "document_id": "doc_unknown",
            "first_name": "Jane",
            "last_name": "Doe",
            "date_of_birth": "1990-01-01",
            "id_number": "123456789",
        },
    )
    assert response.status_code == 403
