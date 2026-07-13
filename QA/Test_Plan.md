# Test Plan

**Project:** Bank of Palestine Intelligence Platform  
**Document ID:** QA-TP-001  
**Version:** 1.0 (2026-07-06); **rebased 2026-07-13, see `Rebased_QA_Baseline.md`**  
**Date:** 2026-07-06

## 1. Scope

### In scope
- React frontend (11 routes, 12 page components)
- Supabase Auth, Postgres RLS, **4 edge function directories (3 functioning + 1 confirmed empty/orphaned `manage-users`), 22 migrations (was 3/19 at baseline)**
- FastAPI OCR/account-opening backend (6 endpoints)
- Role-based access for 3 bank roles
- Credit assessment — **rebased: a deterministic loan-calculator engine (EMI, DBR, age-at-maturity, weighted risk scoring) with an optional AI explanation-only layer, replacing the old "AI + algorithm fallback" framing**
- Documents lifecycle (now includes a real `bank_customers` write with DB-generated sequential account numbering), AI assistant, audit log, user management
- **New in scope this rebase:** Global Help System (8 pages), Open New Account real-write flow, loan-assessment schema/migration integrity

### Out of scope
- Supabase infrastructure SLA / hosting
- OpenRouter billing and uptime SLA
- Penetration testing by external firm
- Mobile native apps (web responsive only)

## 2. Objectives
- Verify implementation against PRB requirements (`SRS_Baseline.md`)
- Identify defects, gaps, and security weaknesses
- Establish regression baseline via automated unit tests
- Produce traceability from requirements → tests → results

## 3. Test items

| Module | Components |
|--------|------------|
| Auth | `AuthContext`, `Auth.tsx`, Supabase session |
| RBAC | `roles.ts`, `ProtectedRoute`, RLS policies |
| Dashboard | Stats RPC, recent activity hook |
| Credit Risk | Assessment, objection, approvals in-table, **loan calculation engine (`loanCalculator.ts`/`loanEligibility.ts`/`loanRiskScoring.ts`), AI explanation layer** |
| Approvals | Queue, approve/reject, modification panel |
| Documents | Table CRUD, account wizard, OCR API, **real `bank_customers` write via `bankCustomers.ts`** |
| AI Assistant | Chat, RAG, history persistence |
| Admin | User management edge function, audit log |
| **Help System [new]** | Help overlay, targeting, onboarding coexistence across 8 pages |

## 4. Assumptions
- Supabase project deployed with all migrations applied
- Demo users exist in Auth + `profiles`
- `.env` configured with valid Supabase + optional OpenRouter keys
- OCR API started via `npm run dev:api` for document tests

## 5. Risks

| Risk | Mitigation |
|------|------------|
| No formal SRS file in repo | Use `SRS_Baseline.md` |
| No E2E framework | Static + manual + unit tests |
| AI flakiness | Test algorithm path separately |
| RLS complexity | DB policy review + role matrix |

## 6. Test environment

| Layer | Configuration |
|-------|---------------|
| OS | Linux (audit host) |
| Node | v26.x |
| Frontend | Vite dev :8080 / production build |
| API | FastAPI :8000 |
| DB | Supabase cloud (project-linked) |

## 7. Entry criteria
- [x] Source code available
- [x] Build succeeds
- [x] Requirements baseline documented
- [ ] Demo users provisioned (manual)
- [ ] Migrations applied on target Supabase (manual verify)

## 8. Exit criteria
- [x] QA documentation complete in `/QA`
- [x] Unit tests pass (`npm test`)
- [x] Defects logged with severity
- [x] RTM updated
- [ ] Critical bugs resolved (BUG-001 open)

## 9. Deliverables
See `QA_Report.md` deliverables list.

## 10. Schedule (recommended)

| Phase | Duration | Activity |
|-------|----------|----------|
| Week 1 | 3 days | Static audit + unit tests (done) |
| Week 1 | 2 days | Manual role-based exploratory |
| Week 2 | 3 days | API + Supabase integration manual |
| Week 2 | 2 days | Defect fix retest + regression |
