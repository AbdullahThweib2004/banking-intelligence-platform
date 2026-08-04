"""
Shared pytest fixtures for the FastAPI test suite.

Run with:  cd backend && .venv/bin/python -m pytest tests -v
(requires `pip install -r requirements-dev.txt` once, for pytest itself —
the existing tests/test_llm_client.py / test_employment_extractor.py stay
on stdlib unittest and are unaffected.)
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from main import app  # noqa: E402
from services.store import _documents  # noqa: E402

ALLOWED_ROLE = "branch_employee"


@pytest.fixture()
def client() -> TestClient:
    return TestClient(app)


@pytest.fixture()
def employee_headers() -> dict[str, str]:
    return {"X-User-Role": "branch_employee"}


@pytest.fixture()
def manager_headers() -> dict[str, str]:
    return {"X-User-Role": "branch_manager"}


@pytest.fixture(autouse=True)
def _clear_document_store():
    """The document store is a module-level in-memory dict shared across
    the whole TestClient/app lifetime — clear it between tests so one
    test's uploaded document_id can never leak into another's assertions."""
    _documents.clear()
    yield
    _documents.clear()
