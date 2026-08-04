"""
Tests for services/auth.py's `require_account_opening_role` as actually
enforced on the real routes (not testing the dependency function in
isolation — exercising it through the real HTTP surface per the task's
"do not mock the internal route behavior itself" instruction).

FINDING worth flagging: this check is a bare `X-User-Role` request header
with no signature/JWT verification at all (see services/auth.py) — any
caller can set this header to whatever they want. It is NOT equivalent to
the frontend's real Supabase-JWT-based RLS. Also: ALLOWED_ROLES here is
{branch_employee, branch_manager} only — risk_department is excluded from
backend account-opening endpoints even though the frontend's own
ROUTE_PERMISSIONS['/documents'] grants risk_department UI access to the
Documents page. Whether that's intentional is a product question, not a
bug this suite fixes — flagged for follow-up.
"""

from __future__ import annotations

import pytest

ACCOUNT_OPEN_BODY = {
    "document_id": "doc_does_not_exist",
    "first_name": "Jane",
    "last_name": "Doe",
    "date_of_birth": "1990-01-01",
    "id_number": "123456789",
}


@pytest.mark.parametrize("role", ["branch_employee", "branch_manager"])
def test_allowed_roles_pass_the_authz_gate(client, role):
    # 404 (document not found) proves the request got PAST the role check,
    # which is exactly what this test is verifying — not the 404 itself.
    response = client.post(
        "/accounts/open-new", json=ACCOUNT_OPEN_BODY, headers={"X-User-Role": role}
    )
    assert response.status_code == 404


@pytest.mark.parametrize("role", ["risk_department", "audit_department", "not_a_real_role"])
def test_disallowed_roles_are_rejected(client, role):
    response = client.post(
        "/accounts/open-new", json=ACCOUNT_OPEN_BODY, headers={"X-User-Role": role}
    )
    assert response.status_code == 403


def test_missing_role_header_is_rejected(client):
    response = client.post("/accounts/open-new", json=ACCOUNT_OPEN_BODY)
    assert response.status_code == 403


def test_empty_role_header_is_rejected(client):
    response = client.post(
        "/accounts/open-new", json=ACCOUNT_OPEN_BODY, headers={"X-User-Role": ""}
    )
    assert response.status_code == 403


def test_authz_gate_also_applies_to_the_documents_router(client):
    # No file attached at all — if the role gate ran first, this must be
    # 403, not a 422 about the missing file.
    response = client.post("/documents/extract-id", headers={"X-User-Role": "risk_department"})
    assert response.status_code == 403
