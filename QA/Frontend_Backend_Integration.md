# Frontend–Backend Integration Report

**Date:** 2026-07-06

## Architecture overview

```
React (Vite) ──► Supabase Client (Auth, DB, Storage, Realtime)
              ├──► Edge Functions (credit-assessment, policy-search, admin-users)
              └──► FastAPI (OCR / account opening) via accountApi.ts
```

## Integration points

| Frontend module | Backend target | Protocol | Status |
|-----------------|----------------|----------|--------|
| AuthContext | Supabase Auth | JWT session | Static **PASS** |
| useStats | `get_platform_stats()` RPC | PostgREST | BLOCKED live |
| useRecentActivity | approval_requests + documents | PostgREST + Realtime | BLOCKED live |
| CreditRisk assessment | credit-assessment EF | HTTPS + anon key | BLOCKED live |
| CreditRisk CRUD | approval_requests table | PostgREST + RLS | Static **PASS** |
| Documents upload | Supabase Storage + documents table | Storage API | BLOCKED live |
| Documents OCR wizard | FastAPI `/documents/*` | REST + X-User-Role | **FAIL** BUG-001 |
| AIAssistant | policy-search EF + ai_chat_* | HTTPS + PostgREST | BLOCKED live |
| UserManagement | admin-users EF | HTTPS + JWT | BLOCKED live |
| AuditLog | audit_logs SELECT | PostgREST + RLS | Static **PASS** |

## Environment configuration

| Variable | Consumer | Required | In repo |
|----------|----------|----------|---------|
| VITE_SUPABASE_URL | Frontend | Yes | .env.example |
| VITE_SUPABASE_ANON_KEY | Frontend | Yes | .env.example |
| VITE_ACCOUNT_API_URL | accountApi.ts | Yes (OCR) | .env.example |
| OPENROUTER_API_KEY | Edge + FastAPI | Yes (AI/OCR LLM) | Secrets only |
| SUPABASE_SERVICE_ROLE_KEY | Edge admin-users | Yes | Secrets only |

**Secrets in repo:** None found. **PASS**

## Error handling integration

| Flow | Frontend behavior | Backend behavior | Status |
|------|-------------------|------------------|--------|
| AI assessment failure | Fallback to algorithm or toast | Edge returns 500 on OpenRouter fail | **PASS** design |
| OCR API down | Toast error in wizard | Connection refused | Partial |
| RLS denial | Supabase error in hook | PostgreSQL policy error | Partial |
| Invalid session | Redirect to /auth | 401 from Supabase | Static **PASS** |

## CORS

| Service | CORS config | Risk |
|---------|-------------|------|
| FastAPI | `allow_origins=["*"]` | Demo OK |
| Edge functions | `Access-Control-Allow-Origin: *` | Demo OK |

## Data flow — Credit assessment (critical path)

1. User submits form in `CreditRisk.tsx`
2. `runCreditAssessment()` calls edge function with JWT
3. Edge calls OpenRouter; on failure returns error
4. Frontend falls back to `computeCreditScore()` locally
5. Result serialized and INSERT into `approval_requests`
6. Realtime updates Dashboard activity feed

Static review: flow is coherent. Live E2E **BLOCKED**.

## Data flow — Account opening (security concern)

1. `Documents.tsx` wizard calls `accountApi.ts`
2. Client sends `Authorization: Bearer <supabase_jwt>` AND `X-User-Role: <from context>`
3. FastAPI **ignores JWT for authorization**; trusts header only

**Critical integration defect:** BUG-001

## Recommendations

1. FastAPI middleware: validate Supabase JWT, load role from `profiles`
2. Add health check from frontend on wizard open (`GET /health`)
3. Centralize API error mapping in `accountApi.ts` for consistent toasts

## Result

Integration design is **sound for Supabase layer**. FastAPI integration has **critical auth gap**.
