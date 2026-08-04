"""
Tests for the /documents/* routes (routers/documents.py).

OCR (pytesseract/opencv, a real external binary) and the employment-fields
LLM call are the unstable external boundaries here — they're mocked at the
router's own import site (routers.documents.run_ocr /
routers.documents.extract_employment_fields), exactly per the task's
"mock only external unstable boundaries, not the internal route behavior
itself" instruction. Everything else (validation, the in-memory store,
error-status mapping) is exercised for real.
"""

from __future__ import annotations

from io import BytesIO
from unittest.mock import patch

from services.ocr import OcrResult

FAKE_JPEG_BYTES = b"\xff\xd8\xff\xe0not a real jpeg but non-empty"


def _fake_ocr_result(raw_text: str = "ID NO: 123456789\nName: Jane Doe") -> OcrResult:
    return OcrResult(raw_text=raw_text, language="en", ocr_confidence=87.5, pass_details=[])


class TestExtractId:
    def test_success_returns_document_id_and_ocr_text(self, client, employee_headers):
        with patch("routers.documents.run_ocr", return_value=_fake_ocr_result()):
            response = client.post(
                "/documents/extract-id",
                headers=employee_headers,
                files={"file": ("id.jpg", BytesIO(FAKE_JPEG_BYTES), "image/jpeg")},
            )
        assert response.status_code == 200
        body = response.json()
        assert body["document_id"].startswith("doc_")
        assert body["raw_text"] == "ID NO: 123456789\nName: Jane Doe"
        assert body["language"] == "en"
        assert body["ocr_confidence"] == 87.5

    def test_rejects_unsupported_file_type(self, client, employee_headers):
        response = client.post(
            "/documents/extract-id",
            headers=employee_headers,
            files={"file": ("resume.txt", BytesIO(b"hello"), "text/plain")},
        )
        assert response.status_code == 400

    def test_rejects_empty_file(self, client, employee_headers):
        response = client.post(
            "/documents/extract-id",
            headers=employee_headers,
            files={"file": ("id.jpg", BytesIO(b""), "image/jpeg")},
        )
        assert response.status_code == 400

    def test_missing_file_is_a_422_not_a_crash(self, client, employee_headers):
        response = client.post("/documents/extract-id", headers=employee_headers)
        assert response.status_code == 422

    def test_ocr_value_error_maps_to_422_with_a_user_facing_message(self, client, employee_headers):
        with patch("routers.documents.run_ocr", side_effect=ValueError("blurry")):
            response = client.post(
                "/documents/extract-id",
                headers=employee_headers,
                files={"file": ("id.jpg", BytesIO(FAKE_JPEG_BYTES), "image/jpeg")},
            )
        assert response.status_code == 422
        assert "clearer photo" in response.json()["detail"]

    def test_ocr_runtime_error_maps_to_503(self, client, employee_headers):
        with patch("routers.documents.run_ocr", side_effect=RuntimeError("tesseract not installed")):
            response = client.post(
                "/documents/extract-id",
                headers=employee_headers,
                files={"file": ("id.jpg", BytesIO(FAKE_JPEG_BYTES), "image/jpeg")},
            )
        assert response.status_code == 503


class TestExtractFields:
    def test_returns_404_for_unknown_document_id(self, client, employee_headers):
        response = client.post("/documents/doc_unknown/extract-fields", headers=employee_headers)
        assert response.status_code == 404

    def test_success_returns_structured_fields_for_a_known_document(self, client, employee_headers):
        with patch("routers.documents.run_ocr", return_value=_fake_ocr_result()):
            upload = client.post(
                "/documents/extract-id",
                headers=employee_headers,
                files={"file": ("id.jpg", BytesIO(FAKE_JPEG_BYTES), "image/jpeg")},
            )
        document_id = upload.json()["document_id"]

        response = client.post(f"/documents/{document_id}/extract-fields", headers=employee_headers)
        assert response.status_code == 200
        body = response.json()
        assert body["document_id"] == document_id
        assert "confidence" in body
        assert "extraction_source" in body


class TestExtractEmploymentProof:
    def test_success_returns_document_id_with_employment_proof_doc_type(self, client, employee_headers):
        with patch("routers.documents.run_ocr", return_value=_fake_ocr_result("Salary: 3200 NIS")):
            response = client.post(
                "/documents/extract-employment-proof",
                headers=employee_headers,
                files={"file": ("payslip.jpg", BytesIO(FAKE_JPEG_BYTES), "image/jpeg")},
            )
        assert response.status_code == 200
        body = response.json()
        assert body["document_id"].startswith("doc_")

    def test_rejects_unsupported_file_type(self, client, employee_headers):
        response = client.post(
            "/documents/extract-employment-proof",
            headers=employee_headers,
            files={"file": ("notes.txt", BytesIO(b"hello"), "text/plain")},
        )
        assert response.status_code == 400


class TestExtractEmploymentFields:
    def test_returns_404_for_unknown_document_id(self, client, employee_headers):
        response = client.post("/documents/doc_unknown/extract-employment-fields", headers=employee_headers)
        assert response.status_code == 404

    def test_rejects_a_document_uploaded_as_id_not_employment_proof(self, client, employee_headers):
        with patch("routers.documents.run_ocr", return_value=_fake_ocr_result()):
            upload = client.post(
                "/documents/extract-id",
                headers=employee_headers,
                files={"file": ("id.jpg", BytesIO(FAKE_JPEG_BYTES), "image/jpeg")},
            )
        document_id = upload.json()["document_id"]

        response = client.post(f"/documents/{document_id}/extract-employment-fields", headers=employee_headers)
        assert response.status_code == 400

    def test_llm_unavailable_returns_empty_fields_not_an_error(self, client, employee_headers):
        with patch("routers.documents.run_ocr", return_value=_fake_ocr_result("Salary: 3200 NIS")):
            upload = client.post(
                "/documents/extract-employment-proof",
                headers=employee_headers,
                files={"file": ("payslip.jpg", BytesIO(FAKE_JPEG_BYTES), "image/jpeg")},
            )
        document_id = upload.json()["document_id"]

        with patch("routers.documents.extract_employment_fields", return_value=(None, "LLM unavailable")):
            response = client.post(
                f"/documents/{document_id}/extract-employment-fields", headers=employee_headers
            )
        assert response.status_code == 200
        body = response.json()
        assert body["full_name"] == ""
        assert body["extraction_warnings"] == ["LLM unavailable"]

    def test_success_returns_structured_employment_fields(self, client, employee_headers):
        from services.employment_extractor import ParsedEmploymentFields

        with patch("routers.documents.run_ocr", return_value=_fake_ocr_result("Salary: 3200 NIS")):
            upload = client.post(
                "/documents/extract-employment-proof",
                headers=employee_headers,
                files={"file": ("payslip.jpg", BytesIO(FAKE_JPEG_BYTES), "image/jpeg")},
            )
        document_id = upload.json()["document_id"]

        parsed = ParsedEmploymentFields(
            full_name="Jane Doe",
            employer_name="Bank of Palestine",
            job_title="Teller",
            monthly_salary=3200.0,
            currency="ILS",
            employment_status="employed",
            confidence=90.0,
        )
        with patch("routers.documents.extract_employment_fields", return_value=(parsed, None)):
            response = client.post(
                f"/documents/{document_id}/extract-employment-fields", headers=employee_headers
            )
        assert response.status_code == 200
        body = response.json()
        assert body["full_name"] == "Jane Doe"
        assert body["monthly_salary"] == 3200.0
        assert body["extraction_warnings"] == []
