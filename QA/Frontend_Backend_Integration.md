# Frontend–Backend Integration Report

**Date:** 2026-07-06; **rebased 2026-07-13**

## Architecture overview

```
React (Vite) ──► Supabase Client (Auth, DB, Storage, Realtime)
              ├──► Edge Functions (credit-assessment [now narrative-only], policy-search, admin-users)
              ├──► bank_customers (NEW live write path: sequence + trigger for account numbers)
              └──► FastAPI (OCR / account opening) via accountApi.ts
```

## Integration points

| Frontend module | Backend target | Protocol | Status |
|-----------------|----------------|----------|--------|
| AuthContext | Supabase Auth | JWT session | Static **PASS** |
| useStats | `get_platform_stats()` RPC | PostgREST | BLOCKED live |
| useRecentActivity | approval_requests + documents | PostgREST + Realtime | BLOCKED live |
| CreditRisk assessment | credit-assessment EF (**rewritten: narrative-only, receives final numbers**) | HTTPS + anon key | BLOCKED live (AI disabled in this env, `VITE_CREDIT_AI_FALLBACK=false`) |
| CreditRisk CRUD | approval_requests table (**+14 loan-calculator columns**) | PostgREST + RLS | Static **PASS**; live insert hit BUG-014 (schema-cache miss), fixed, pending re-confirmation |
| Documents upload | Supabase Storage + documents table | Storage API | BLOCKED live |
| Documents OCR wizard → **real account creation [new]** | FastAPI `/documents/*` **then** `bankCustomers.ts` → `bank_customers` INSERT | REST + X-User-Role, then PostgREST | FastAPI leg: **FAIL** BUG-001 (unchanged); new INSERT leg: container-verified, live BLOCKED |
| **CreditRisk latest-customer hint [new]** | `bank_customers` SELECT + Realtime | PostgREST + Realtime | Static **PASS**; live BLOCKED |
| AIAssistant | policy-search EF + ai_chat_* | HTTPS + PostgREST | BLOCKED live |
| UserManagement | admin-users EF | HTTPS + JWT | BLOCKED live |
| AuditLog | audit_logs SELECT | PostgREST + RLS | Static **PASS** |
| **Help System [new]** | Client-side only, no backend integration | — | N/A — no integration risk |

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

## Data flow — Credit assessment (critical path) [rebased]

1. User submits form in `CreditRisk.tsx`, including new loan type/currency/term/age/obligations fields
2. `computeCreditScore()` runs **client-side, always, first** — rate resolution → EMI → eligibility gates → weighted risk score. This step cannot fail to produce a result.
3. If AI is enabled (`VITE_CREDIT_AI_FALLBACK !== 'false'`), `requestAiNarrative()` calls the credit-assessment edge function with `{input, formula_result}`, wrapped in a 12s timeout
4. Edge function calls OpenRouter for a narrative explanation only; on any failure, the deterministic `buildDeterministicExplanation()` fallback is used instead — the numeric result is never affected either way
5. Result serialized (`result_source`: `formula` or `hybrid`) and INSERT into `approval_requests`
6. Realtime updates Dashboard activity feed

Static review: flow is coherent and the AI-cannot-override-the-number invariant is structurally enforced (formula computed unconditionally before any AI call). Live E2E **BLOCKED**; this environment specifically runs with AI disabled, so step 3 is unexercised here.

## Data flow — Account opening (security concern, unchanged) + real customer creation [new]

1. `Documents.tsx` wizard calls `accountApi.ts`
2. Client sends `Authorization: Bearer <supabase_jwt>` AND `X-User-Role: <from context>`
3. FastAPI **ignores JWT for authorization**; trusts header only

**Critical integration defect:** BUG-001 (unchanged)

4. **[New]** On successful OCR completion, `Documents.tsx` calls `findOrCreateBankCustomerFromAccountOpening()`
5. **[New]** This checks `bank_customers` for an existing row by `national_id` first; if found, reuses it (`wasCreated=false`); if not, inserts a new row, letting the DB trigger assign the sequential `account_number`
6. **[New]** On a race-condition `23505` unique-violation, the code catches it and re-fetches the winning row rather than surfacing an error
7. **[New]** UI shows a distinct success state for "created" vs. "reused"

Static + container review: this new leg is coherent and container-verified (Docker Postgres, including the exact BOP-200013 poisoning scenario and 20-way concurrency). Live E2E **BLOCKED**.

## Recommendations

1. FastAPI middleware: validate Supabase JWT, load role from `profiles`
2. Add health check from frontend on wizard open (`GET /health`)
3. Centralize API error mapping in `accountApi.ts` for consistent toasts
4. **[New]** Add an automated test asserting the AI narrative call can never alter `risk_score`/`risk_category`/`eligibility_status` (RISK-013)
5. **[New]** Add Playwright/Cypress coverage for the account-creation and loan-assessment-submission flows specifically — BUG-014 (schema-cache miss) was invisible to unit tests and would only have been caught by an actual submission attempt

## Result

Integration design is **sound for Supabase layer**, now including a genuine live write path for `bank_customers` with concurrency-safe ID generation. FastAPI integration has **critical auth gap** (BUG-001, unchanged). The credit-assessment integration was re-architected this cycle to make AI strictly additive — a meaningful integration-design improvement over the baseline's simpler "AI or algorithm" framing.
