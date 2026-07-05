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

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import accounts, documents

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
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
    return {"status": "ok"}
