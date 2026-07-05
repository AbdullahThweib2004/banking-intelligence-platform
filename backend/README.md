# Document OCR API (FastAPI)

Backend for the **Open New Account** wizard on the Documents page.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/documents/extract-id` | Upload ID image → preprocess → **Tesseract OCR** → `{ document_id, raw_text, language, ocr_confidence }` |
| `POST` | `/documents/{document_id}/extract-fields` | Parse fields from the **stored OCR text** for that document |
| `POST` | `/accounts/open-new` | Submit confirmed fields |
| `GET` | `/docs` | Swagger UI |

Requires header: `X-User-Role: branch_employee` or `branch_manager`.

## Prerequisites

**Tesseract must be installed** — there is no mock/placeholder OCR path.

```bash
# Arch Linux
sudo pacman -S tesseract tesseract-data-eng tesseract-data-ara

# Debian/Ubuntu
sudo apt install tesseract-ocr tesseract-ocr-eng tesseract-ocr-ara
```

## Setup

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

From repo root: `npm run dev:api` (runs the same server on port 8000).

## Debug logging

The server logs the **raw OCR text** to the console for each upload:

```
[OCR DEBUG] file=id.jpg chars=142 confidence=87.3
--- raw_text ---
...
--- end ---
```

Restart `npm run dev` after proxy changes so `/documents/*` routes to port 8000.

## Quick test

```bash
python backend/scripts/test_ocr.py   # generates two synthetic ID images and compares outputs
```

Swagger: http://localhost:8000/docs
