# Test Strategy

**Document ID:** QA-TS-001  
**Date:** 2026-07-06

## 1. Testing levels

| Level | Approach | Tools | Status |
|-------|----------|-------|--------|
| Unit | Pure functions: roles, credit scoring | Node `node:test`, `npm test` | **9 tests PASS** |
| Integration | Supabase client + RLS (manual) | Browser + Supabase dashboard | Blocked without live creds |
| API | FastAPI Swagger + curl | `/docs`, scripts | Partial static |
| E2E UI | Full workflows per role | *Not implemented* | Gap |
| Security | Static code + policy review | Manual | Complete (static) |
| Performance | Build size, obvious N+1 | Static | Partial |

## 2. Testing types applied

- **Functional** — requirement mapping (`Functional_Testing.md`)
- **Validation** — form rules (`Validation_Testing.md`)
- **Security** — OWASP-oriented static review (`Security_Testing.md`)
- **Regression** — unit test baseline (`Regression_Testing.md`)
- **Usability** — bilingual, layout (manual checklist in Test_Cases)

## 3. Prioritization (risk-based)

**P0 — Must test first**
1. Authentication & session
2. RBAC route + RLS alignment
3. Credit assessment persistence
4. Approval approve/reject authorization
5. FastAPI authorization

**P1**
6. Documents CRUD + storage
7. Account opening OCR flow
8. Audit log immutability
9. User management edge function

**P2**
10. AI assistant RAG quality
11. Dashboard cosmetic KPIs
12. Onboarding tours

## 4. Pass/fail criteria

- **Pass:** Behavior matches PRB expected result; no data corruption; correct HTTP/RLS denial
- **Fail:** Wrong data shown, unauthorized action succeeds, crash, silent data loss
- **Blocked:** Cannot execute without environment
- **Partial:** UI present but data static, fallback path used without disclosure

## 5. Defect severity definitions

| Severity | Definition |
|----------|------------|
| Critical | Security breach, data loss, auth bypass |
| High | Core workflow broken for a role |
| Medium | Wrong data, poor error handling, partial feature |
| Low | Cosmetic, debug logs, dead code |

## 6. Automation strategy

**Current:** `src/lib/__tests__/qa.test.ts` (9 tests)

**Recommended next:**
1. Add Vitest + `@testing-library/react` for Auth/ProtectedRoute
2. Add Playwright smoke: login → dashboard → credit assessment form
3. Add pytest for FastAPI auth once JWT validation added

See `Automation_Testing.md`.

## 7. Environment assumptions

- Single Supabase project per environment
- Anon key in frontend (expected); service role only on server/scripts
- CORS open on edge functions (`*` origin) — acceptable for demo, not prod
