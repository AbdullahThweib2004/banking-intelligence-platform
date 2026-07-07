# Security Testing Report

**Date:** 2026-07-06  
**Method:** Static analysis + threat modeling (OWASP-oriented)

## Summary

| Category | Result | Notes |
|----------|--------|-------|
| SQL Injection | **PASS** (likely) | Supabase parameterized queries; no raw SQL in frontend |
| XSS | **PASS** (likely) | React text escaping; no dangerouslySetInnerHTML found in pages |
| CSRF | Partial | Supabase JWT in Authorization; cookie CSRF N/A for API |
| Broken Access Control | **FAIL** | BUG-001 FastAPI header trust |
| Auth weaknesses | Partial | BUG-002 role desync |
| IDOR | Partial | RLS protects Supabase rows; API doc IDs need live test |
| Secret leakage | **PASS** | .env gitignored; edge logs mask API key prefix |
| Client-only validation | Partial | Some checks client-side; RLS is server backstop |

## BUG-001 detail — Broken Access Control (API)

**File:** `backend/services/auth.py`

```python
def require_account_opening_role(x_user_role: str | None = Header(...)):
    if x_user_role not in ALLOWED_ROLES:
        raise HTTPException(403, ...)
```

Any client can set `X-User-Role: branch_manager`. Frontend sends role from `AuthContext` (`accountApi.ts`) but this is not cryptographically bound to identity.

**Recommendation:** Validate Supabase JWT; reject mismatched role.

## Supabase RLS — Positive findings

- `audit_logs`: no UPDATE/DELETE policies (append-only) ✅
- `approval_requests`: employee SELECT scoped to `employee_id` ✅
- Edge `admin-users`: verifies caller is manager via JWT ✅

## Edge function CORS

`Access-Control-Allow-Origin: *` on credit-assessment and policy-search — acceptable for demo; restrict in production.

## XSS review

User-entered fields (customer name, objection reason) rendered via React `{text}` — escaped by default. **PASS** static.

## SQL injection

Frontend uses Supabase client `.eq()`, `.insert()` — parameterized. FastAPI uses structured services. **PASS** static.

## Security test cases executed

| ID | Test | Result |
|----|------|--------|
| SEC-01 | RLS policy review | Pass |
| SEC-02 | Audit append-only | Pass |
| SEC-03 | Secrets in repo | Pass |
| SEC-04 | XSS static review | Pass |
| SEC-05 | API role header forge | **Fail** BUG-001 |
| SEC-06 | Employee JWT on admin-users | Blocked live |

## Residual risk

**High** until BUG-001 resolved. Supabase layer reasonably hardened for graduation scope.
