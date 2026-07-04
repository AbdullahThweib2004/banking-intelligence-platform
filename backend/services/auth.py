"""Role-based access for account-opening endpoints."""

from __future__ import annotations

from fastapi import Header, HTTPException

ALLOWED_ROLES = frozenset({"branch_employee", "branch_manager"})


def require_account_opening_role(
    x_user_role: str | None = Header(default=None, alias="X-User-Role"),
) -> str:
    if not x_user_role or x_user_role not in ALLOWED_ROLES:
        raise HTTPException(
            status_code=403,
            detail="You are not authorized to perform account opening.",
        )
    return x_user_role
