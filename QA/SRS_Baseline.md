# SRS Baseline — Requirements Source of Truth

**Project:** Bank of Palestine Intelligence Platform  
**QA Audit Date:** 2026-07-06; **rebased 2026-07-13** — PRB-029–038 and NFR-007–008 added below to cover the Global Help System, real account creation, and loan-calculation engine work. See `Change_Impact_Assessment.md` for the source diff these were reconstructed from.  
**Auditor role:** Senior QA / Test Architect

## Important note on SRS availability

No standalone file named `SRS.pdf`, `SRS.md`, or `docs/SRS*` was found in the repository root at audit time. Per project instruction, requirements were reconstructed from **project context already embedded in the codebase and development history**, and treated as the authoritative baseline for this QA phase.

## Primary requirement sources (priority order)

| Priority | Source | Path | Content |
|----------|--------|------|---------|
| 1 | Graduation RBAC & platform specification | Agent transcript / implementation specs | 3-role RBAC, route matrix, Supabase profiles, seed users |
| 2 | Root README | `README.md` | Modules: credit risk, approvals, documents, audit log |
| 3 | Backend API spec | `backend/README.md` | OCR account-opening endpoints, auth header, verification scripts |
| 4 | Business policy rules | `src/data/policies/*.md` | Loan, account opening, customer service rules (RAG + business context) |
| 5 | Database migrations | `supabase/migrations/*.sql` | RLS matrices, triggers, RPCs, entity schemas |
| 6 | Edge function contracts | `supabase/functions/*/index.ts` | AI assessment, policy search, admin users |

## Functional requirement catalogue (PRB-001 … PRB-028)

| ID | Requirement | Source |
|----|-------------|--------|
| PRB-001 | Three roles: `branch_employee`, `branch_manager`, `risk_department` | RBAC spec / `src/lib/roles.ts` |
| PRB-002 | Supabase Auth login/logout | `AuthContext`, `Auth.tsx` |
| PRB-003 | Profile auto-created on signup; role stored in `profiles` | Migration `20260618103000_rbac_profiles.sql` |
| PRB-004 | Route-level access control per role matrix | `ROUTE_PERMISSIONS`, `ProtectedRoute` |
| PRB-005 | Dashboard global live statistics (same for all roles) | `get_platform_stats()` RPC, `useStats.ts` |
| PRB-006 | Dashboard recent activity from real Supabase data | `useRecentActivity.ts` |
| PRB-007 | Credit Risk: new assessment with customer account lookup | `CreditRisk.tsx`, `bank_customers` |
| PRB-008 | Credit Risk: AI-powered scoring (primary path) | `credit-assessment` edge function |
| PRB-009 | Credit Risk: algorithm fallback when AI fails | `aiCreditAssessment.ts` |
| PRB-010 | Credit Risk: persist score, category, explanation on `approval_requests` | Migrations + insert flow |
| PRB-011 | Credit Risk: risk department approve/reject pending applications | `CreditRisk.tsx`, RLS UPDATE policy |
| PRB-012 | Objection/modification request workflow | `loan_modification_requests`, dialog in Credit Risk |
| PRB-013 | Approvals page: review queue with saved AI explanation | `Approvals.tsx` |
| PRB-014 | Documents: list/upload/view/delete with Supabase storage | `useDocuments.ts`, RLS migration |
| PRB-015 | Documents: Open New Account OCR wizard (employee/manager only) | `Documents.tsx`, FastAPI |
| PRB-016 | Documents: block loan-restricted customers | `bank_customers.loan_restricted` |
| PRB-017 | AI Assistant: policy-grounded chat | `AIAssistant.tsx`, `policy-search`, RAG |
| PRB-018 | AI Assistant: persistent chat history per user | `ai_chat_*` tables |
| PRB-019 | Audit Log: append-only, risk department read | `audit_logs` migration + triggers |
| PRB-020 | User Management: manager CRUD via edge function | `admin-users`, `UserManagement.tsx` |
| PRB-021 | Modification Requests page (manager + risk) | `ModificationRequests.tsx` |
| PRB-022 | Bilingual EN/AR UI | `LanguageContext.tsx` |
| PRB-023 | Realtime updates on key tables | Supabase channels in hooks/pages |
| PRB-024 | Onboarding tours (session-scoped) | `onboardingSession.ts` |
| PRB-025 | Platform stats cards on Credit Risk & Approvals | `useCreditRiskStats`, `useApprovalStats` |
| PRB-026 | Re-analysis after loan modification | `modificationReanalysis.ts` |
| PRB-027 | Demo seed customers BOP-100001–010 | `20260621100000_bank_customers.sql` |
| PRB-028 | Unauthorized page for forbidden routes | `/unauthorized`, `ProtectedRoute` |

## Functional requirement catalogue — added 2026-07-13 rebase (PRB-029 … PRB-038)

| ID | Requirement | Source |
|----|-------------|--------|
| PRB-029 | Real bank customer creation: Open New Account writes a genuine row to `bank_customers`, not mock/static data | `bankCustomers.ts`, `Documents.tsx` |
| PRB-030 | Account numbers are generated DB-side, sequentially, in the `BOP-1000xx` format, never computed client-side | `20260711100000_bank_customers_account_sequence.sql`, `20260711120000_fix_bank_customers_account_sequence.sql` |
| PRB-031 | Duplicate national-ID submissions are handled idempotently (reuse existing customer), never a hard error | `findOrCreateBankCustomerFromAccountOpening()` in `bankCustomers.ts` |
| PRB-032 | Credit Risk shows a "latest customer added" hint with click-to-fill, updated via Realtime | `useLatestBankCustomer.ts`, `CreditRisk.tsx` |
| PRB-033 | Deterministic loan calculation engine: EMI/annuity installment, Debt Burden Ratio cap (50%), age-at-maturity cap (70), product/currency-aware rate resolution | `loanCalculator.ts`, `loanEligibility.ts`, `loanProducts.ts` |
| PRB-034 | Deterministic weighted risk-scoring model (documented, non-black-box formula) | `loanRiskScoring.ts` |
| PRB-035 | AI is explanation-only: it must never compute or override the risk score, category, or eligibility status | `aiCreditAssessment.ts`, `supabase/functions/credit-assessment/index.ts` |
| PRB-036 | A complete, bilingual (EN/AR) deterministic explanation is shown whenever AI is disabled, times out, or fails | `loanExplanation.ts` |
| PRB-037 | A contextual Global Help System is available on all key pages (Dashboard, Credit Risk, Approvals, Documents, User Management, Audit Log, Modification Requests, AI Assistant) | `src/components/help/*`, page-level `HelpTarget` registrations |
| PRB-038 | Help-target selection resolves precisely for overlapping targets, and coexists with the onboarding tour without conflict | `helpTargeting.ts` (`pickBestHelpTarget`), `OnboardingTour.tsx` |

## Non-functional requirement catalogue

| ID | Requirement | Verification approach |
|----|-------------|----------------------|
| NFR-001 | Row Level Security on sensitive tables | Static review of migrations; **[rebased] extended to the new `bank_customers` INSERT policy** |
| NFR-002 | Append-only audit trail | No UPDATE/DELETE policies on `audit_logs` |
| NFR-003 | Responsive layout (desktop + mobile sidebar) | Static UI review |
| NFR-004 | Production build succeeds | `npm run build` — **PASS**, re-verified 2026-07-13 |
| NFR-005 | Secure handling of credentials (.env gitignored) | Repo scan — **PASS** |
| NFR-006 | Reasonable performance for branch operations | Partial — no load tests run; **[rebased] bundle grew to 957.39 kB/281.39 kB gzip, trending the wrong way** |
| **NFR-007** | **Schema cache must reflect newly-migrated columns immediately (no PostgREST lag on DDL changes)** | `NOTIFY pgrst, 'reload schema';` in migration — fix applied for BUG-014, live re-confirmation pending |
| **NFR-008** | **All migrations must be idempotent / safe to re-run** | Static review — all 3 new migrations use `IF NOT EXISTS` / drop-then-recreate patterns |

## Acceptance criteria gaps

- Formal acceptance test scripts per SRS section: **not present**
- Written sign-off checklist: **not present**
- This QA audit substitutes traceability via `Requirements_Traceability_Matrix.md`
