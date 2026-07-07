# API Testing Report

**Date:** 2026-07-06

## API inventory

### FastAPI — `backend/` (port 8000)

| Method | Path | Auth | Purpose | Test status |
|--------|------|------|---------|-------------|
| GET | `/health` | None | Health + LLM config flag | Static **PASS** |
| POST | `/documents/extract-id` | X-User-Role header | Upload ID, OCR extract | **FAIL** BUG-001 |
| POST | `/documents/{id}/extract-fields` | X-User-Role | Field extraction | **FAIL** BUG-001 |
| POST | `/documents/{id}/generate-form` | X-User-Role | Generate account form | **FAIL** BUG-001 |
| GET | `/documents/{id}/pdf` | X-User-Role | Download PDF | **FAIL** BUG-001 |
| POST | `/accounts/open-new` | X-User-Role | Complete account opening | **FAIL** BUG-001 |

**Auth mechanism:** `backend/services/auth.py` — validates header value only, not JWT.

**Frontend client:** `src/lib/accountApi.ts` — sends `X-User-Role` from `AuthContext.userRole`.

### Supabase Edge Functions

| Function | Method | Auth | Purpose | Test status |
|----------|--------|------|---------|-------------|
| `credit-assessment` | POST | Supabase JWT (anon key + user token) | AI credit scoring | BLOCKED live |
| `policy-search` | POST | JWT | RAG policy Q&A | BLOCKED live |
| `admin-users` | POST | JWT + manager role check | User CRUD | BLOCKED live |

### Supabase RPC / REST (via client)

| RPC/Table | Operation | RLS | Test status |
|-----------|-----------|-----|-------------|
| `get_platform_stats()` | SELECT | Authenticated | BLOCKED live |
| `approval_requests` | CRUD | Role-based RLS | Static **PASS** |
| `documents` | CRUD + storage | Role-based RLS | Static **PASS** |
| `audit_logs` | INSERT (trigger), SELECT | Risk-only read | Static **PASS** |
| `profiles` | SELECT/UPDATE | Own + admin | Static **PASS** |
| `bank_customers` | SELECT | Authenticated | BLOCKED live |

## Response contract review

### credit-assessment (expected)

```json
{
  "risk_score": 0-100,
  "risk_category": "low|medium|high",
  "explanation": "...",
  "result_source": "ai|algorithm"
}
```

Static review: matches `aiCreditAssessment.ts` consumer. **PASS**

### /health (verified structure)

```json
{ "status": "ok", "llm_fallback_configured": boolean }
```

## Error scenario matrix

| Scenario | Expected | Verified |
|----------|----------|----------|
| Missing X-User-Role | 403 | Static **PASS** |
| Invalid role header | 403 | Static **PASS** |
| Forged manager header | 403 | **FAIL** — accepts forged role |
| Missing JWT on edge function | 401 | Static (admin-users checks) |
| Malformed JSON body | 422 | Pydantic default — static **PASS** |
| OpenRouter 402 | 500 + fallback | Documented BUG-008 |

## Recommendations

1. Replace header auth with Supabase JWT validation middleware on FastAPI
2. Add integration tests with httpx TestClient for each endpoint
3. Document OpenAPI schemas in `backend/README.md` (Swagger at `/docs`)

## Overall API test result

**FAIL** on FastAPI authorization; **PASS** (static) on Supabase RLS design; **BLOCKED** on live edge function execution.
