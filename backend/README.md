# Document OCR API (FastAPI)

Backend for the **Open New Account** wizard on the Documents page.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/documents/extract-id` | Upload ID image → preprocess → **Tesseract OCR** → `{ document_id, raw_text, language, ocr_confidence }` |
| `POST` | `/documents/{document_id}/extract-fields` | Parse fields from the **stored OCR text** for that document |
| `POST` | `/documents/{document_id}/generate-form` | Render two-copy account-opening PDF (bank + customer) |
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

**WeasyPrint** (PDF form generation) requires additional system libraries:

```bash
# Arch Linux
sudo pacman -S pango cairo gdk-pixbuf2

# Debian/Ubuntu
sudo apt install libpango-1.0-0 libpangocairo-1.0-0 libcairo2 libgdk-pixbuf-2.0-0
```

## Environment variables

Set these in **every environment** where account opening runs (local, staging, production).

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENROUTER_API_KEY` | **Recommended** | OpenRouter API key for LLM field-extraction fallback when regex fills fewer than 4 of 6 fields. Without it, extraction falls back to regex-only and returns `extraction_warnings` to the UI. |
| `ID_EXTRACT_MODEL` | Optional | OpenRouter model id (default: `openai/gpt-4o-mini`) |
| `OPENROUTER_HTTP_REFERER` | Optional | Referer header for OpenRouter (default: `http://localhost:8080`) |

### Where to configure

| Environment | How to set |
|-------------|------------|
| **Local dev** | Repo-root `.env` (loaded automatically by `main.py`) |
| **Staging / Production** | Host environment variables or secrets manager (e.g. Railway, Render, Fly.io secrets, Kubernetes `Secret`, systemd `EnvironmentFile`) — **do not rely on `.env` in deployed builds** |

The server logs a startup warning if `OPENROUTER_API_KEY` is missing.

Supabase Edge Functions (`credit-assessment`, `policy-search`) use the same key via:

```bash
supabase secrets set OPENROUTER_API_KEY=sk-or-v1-...
```

The FastAPI backend reads it from the process environment — configure it separately on whatever hosts port 8000.

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

The server logs the **raw OCR text** to the console for each upload and logs `extraction_source` / `llm_fallback_attempted` for each field-extraction call.

Restart `npm run dev` after proxy changes so `/documents/*` routes to port 8000.

## Verification

```bash
python backend/scripts/verify_extraction.py   # rotated, blurry, labeled, source audit
python backend/scripts/test_ocr.py            # two synthetic images, compare outputs
```

Swagger: http://localhost:8000/docs
