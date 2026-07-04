# Document OCR API (FastAPI)

Backend for the **Open New Account** wizard on the Documents page.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/documents/extract-id` | Upload ID image → preprocess → OCR → `{ document_id, raw_text, language }` |
| `POST` | `/documents/{document_id}/extract-fields` | Parse structured fields from OCR text |
| `POST` | `/accounts/open-new` | Submit confirmed fields → reference id |
| `GET` | `/health` | Health check |
| `GET` | `/docs` | Swagger UI |

All account-opening routes require header: `X-User-Role: branch_employee` or `branch_manager`.

## Setup

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# Production OCR (recommended):
#   Arch:  sudo pacman -S tesseract tesseract-data-eng tesseract-data-ara
#   Ubuntu: sudo apt install tesseract-ocr tesseract-ocr-ara

# Local dev without tesseract (mock OCR text):
export OCR_ALLOW_MOCK=true

uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

From the repo root you can also run:

```bash
npm run dev:api
```

## Frontend integration

The Vite dev server proxies `/documents` and `/accounts` to `http://127.0.0.1:8000`.
Leave `VITE_API_BASE_URL` unset in `.env` so the frontend uses relative paths.

Run **both** in separate terminals:

```bash
npm run dev:api   # port 8000
npm run dev         # port 8080 (restart after proxy config changes)
```

Optional production override:

```env
VITE_API_BASE_URL=https://your-api-host
```

## Quick test (curl)

```bash
curl -X POST http://127.0.0.1:8000/documents/extract-id \
  -H "X-User-Role: branch_employee" \
  -F "file=@/path/to/id.jpg"

curl -X POST http://127.0.0.1:8000/documents/doc_XXXX/extract-fields \
  -H "X-User-Role: branch_employee"
```

Swagger: http://localhost:8000/docs
