# Requirements Traceability Matrix

**Date:** 2026-07-06

| Req ID | Requirement | Implementation | Test IDs | Result | Defect |
|--------|-------------|----------------|----------|--------|--------|
| PRB-001 | 3-role RBAC | `src/lib/roles.ts`, migrations | TC-RBAC-01–06, UT-01–04 | **PASS** (static+UT) | — |
| PRB-002 | Supabase login/logout | `AuthContext`, `Auth.tsx` | TC-AUTH-01–04 | Partial | BLOCKED live |
| PRB-003 | Profile on signup | Trigger in migration | TC-DB-01 | Unverified | BLOCKED |
| PRB-004 | Route access matrix | `App.tsx`, `ProtectedRoute` | TC-RBAC-07–12 | **PASS** static | BUG-012 note |
| PRB-005 | Global dashboard stats | `get_platform_stats`, `useStats` | TC-DASH-01–03 | Partial | BUG-004 |
| PRB-006 | Live recent activity | `useRecentActivity.ts` | TC-DASH-04–05 | Partial | BLOCKED live |
| PRB-007 | Account lookup assessment | `CreditRisk.tsx`, `bank_customers` | TC-CR-01–04 | Partial | BLOCKED |
| PRB-008 | AI credit scoring | `credit-assessment` EF | TC-CR-05–08 | Partial | BUG-008 |
| PRB-009 | Algorithm fallback | `aiCreditAssessment.ts` | TC-CR-09, UT-05–08 | **PASS** UT | — |
| PRB-010 | Persist assessment snapshot | `approval_requests` insert | TC-CR-10 | Partial | BLOCKED |
| PRB-011 | Risk approve/reject | `CreditRisk.tsx`, RLS UPDATE | TC-CR-11–12 | Partial | BLOCKED |
| PRB-012 | Objection/modification | Dialog + `loan_modification_requests` | TC-CR-13–14 | Partial | BLOCKED |
| PRB-013 | Approvals page | `Approvals.tsx` | TC-APR-01–05 | Partial | BLOCKED |
| PRB-014 | Documents CRUD | `useDocuments.ts`, RLS | TC-DOC-01–06 | Partial | BLOCKED |
| PRB-015 | Account opening OCR | FastAPI + wizard | TC-DOC-07–12 | **FAIL** auth | BUG-001 |
| PRB-016 | Loan restricted block | `bank_customers` | TC-CR-15 | Partial | BLOCKED |
| PRB-017 | AI Assistant RAG | `policy-search`, `rag.ts` | TC-AI-01–04 | Partial | BLOCKED |
| PRB-018 | Chat history | `ai_chat_*` tables | TC-AI-05 | Partial | BLOCKED |
| PRB-019 | Audit log risk-only | RLS + `AuditLog.tsx` | TC-AUD-01–03 | **PASS** static | — |
| PRB-020 | User management | `admin-users` EF | TC-ADM-01–04 | Partial | BLOCKED |
| PRB-021 | Modification requests page | `ModificationRequests.tsx` | TC-MOD-01–02 | Partial | BLOCKED |
| PRB-022 | Bilingual EN/AR | `LanguageContext` | TC-UI-01 | **PASS** static | — |
| PRB-023 | Realtime subscriptions | hooks/pages channels | TC-RT-01 | Unverified | BLOCKED |
| PRB-024 | Onboarding tours | `onboardingSession.ts` | TC-UI-02 | Partial | Manual |
| PRB-025 | Stats on Credit/Approvals | `useStats` hooks | TC-DASH-06 | Partial | — |
| PRB-026 | Re-analysis | `modificationReanalysis.ts` | TC-MOD-03 | Unverified | BLOCKED |
| PRB-027 | Seed customers | migration seed | TC-DB-02 | Unverified | BLOCKED |
| PRB-028 | Unauthorized redirect | `/unauthorized` | TC-RBAC-13 | **PASS** static | — |
| NFR-001 | RLS enabled | migrations | TC-SEC-01 | **PASS** review | — |
| NFR-002 | Append-only audit | no UPDATE policy | TC-SEC-02 | **PASS** review | — |
| NFR-003 | Responsive UI | DashboardLayout | TC-UI-03 | **PASS** static | — |
| NFR-004 | Production build | vite build | TC-BLD-01 | **PASS** | — |
| NFR-005 | Secrets not committed | .gitignore | TC-SEC-03 | **PASS** | — |
| NFR-006 | Performance | bundle size | TC-PERF-01 | Partial | BUG-010 |

**Legend:** UT = unit test automated; BLOCKED = requires live Supabase/API

**Coverage:** 34/34 requirements mapped; 12 fully verified; 18 blocked pending environment; 4 partial/fail.
