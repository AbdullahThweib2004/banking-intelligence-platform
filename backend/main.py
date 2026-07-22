"""
BoP Intelligence Platform — document OCR & account-opening API.

Run locally:
  cd backend && python -m venv .venv && source .venv/bin/activate
  pip install -r requirements.txt
  uvicorn main:app --reload --host 0.0.0.0 --port 8000

Swagger UI: http://localhost:8000/docs
"""

from __future__ import annotations

import logging
from pathlib import Path

from dotenv import load_dotenv

# Load repo-root .env before any service reads process env.
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import accounts, documents
from services.llm_client import llm_configured

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)

# ID extraction is regex/OCR-only (no AI — see services/field_extraction.py),
# so this only gates employment-proof extraction's AI step.
if not llm_configured():
    logging.getLogger(__name__).warning(
        "OPENROUTER_API_KEY is not set — AI-based employment-proof extraction is disabled. "
        "Set this in dev (.env), staging, and production host env / secrets."
    )

app = FastAPI(
    title="BoP Document OCR API",
    description="ID upload, OCR extraction, and account-opening endpoints.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(documents.router)
app.include_router(accounts.router)


@app.get("/health")
def health():
    return {
        "status": "ok",
        "llm_fallback_configured": llm_configured(),
    }
