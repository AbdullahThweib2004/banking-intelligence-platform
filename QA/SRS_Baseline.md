# SRS Baseline — Requirements Source of Truth

**Project:** Bank of Palestine Intelligence Platform  
**QA Audit Date:** 2026-07-06  
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

## Non-functional requirement catalogue

| ID | Requirement | Verification approach |
|----|-------------|----------------------|
| NFR-001 | Row Level Security on sensitive tables | Static review of migrations |
| NFR-002 | Append-only audit trail | No UPDATE/DELETE policies on `audit_logs` |
| NFR-003 | Responsive layout (desktop + mobile sidebar) | Static UI review |
| NFR-004 | Production build succeeds | `npm run build` — **PASS** |
| NFR-005 | Secure handling of credentials (.env gitignored) | Repo scan — **PASS** |
| NFR-006 | Reasonable performance for branch operations | Partial — no load tests run |

## Acceptance criteria gaps

- Formal acceptance test scripts per SRS section: **not present**
- Written sign-off checklist: **not present**
- This QA audit substitutes traceability via `Requirements_Traceability_Matrix.md`
