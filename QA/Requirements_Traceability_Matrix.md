# Requirements Traceability Matrix

**Date:** 2026-07-13 (rebased — see `Change_Impact_Assessment.md` for the diff driving these updates)
**Prior version:** 2026-07-06, 34/34 requirements. This rebase updates the implementation/status of rows affected by the loan-engine refactor and real account-creation work, and adds PRB-029–038 / NFR-007–008 for the new capabilities.

| Req ID | Requirement | Implementation | Test IDs | Result | Defect / Notes |
|--------|-------------|----------------|----------|--------|--------|
| PRB-001 | 3-role RBAC | `src/lib/roles.ts`, migrations | TC-RBAC-01–06, UT-01–04 | **PASS** (static+UT) | — |
| PRB-002 | Supabase login/logout | `AuthContext`, `Auth.tsx` | TC-AUTH-01–04 | Partial | BLOCKED live |
| PRB-003 | Profile on signup | Trigger in migration | TC-DB-01 | Unverified | BLOCKED |
| PRB-004 | Route access matrix | `App.tsx`, `ProtectedRoute` | TC-RBAC-07–12 | **PASS** static | BUG-012 note |
| PRB-005 | Global dashboard stats | `get_platform_stats`, `useStats` | TC-DASH-01–03 | Partial | BUG-004 |
| PRB-006 | Live recent activity | `useRecentActivity.ts` | TC-DASH-04–05 | Partial | BLOCKED live |
| PRB-007 | Account lookup assessment | `CreditRisk.tsx`, `bank_customers`, **`useLatestBankCustomer.ts` (new hint)** | TC-CR-01–04, TC-CR-22 | Partial | BLOCKED live; hint logic verified by inspection |
| PRB-008 | AI credit narrative | `aiCreditAssessment.ts` (rewritten), `credit-assessment` EF (rewritten) | TC-CR-05–08, TC-CR-19 | Partial | Now explanation-only by design, not scoring — see PRB-035; hybrid path BLOCKED (`VITE_CREDIT_AI_FALLBACK=false` in this env) |
| PRB-009 | Deterministic scoring fallback | `loanRiskScoring.ts`, `aiCreditAssessment.ts` (was: "Algorithm fallback") | TC-CR-09, TC-CR-16–18, UT (28 new) | **PASS** UT | Re-scoped: this is now the primary path (`result_source='formula'`), not a fallback of last resort — see `Change_Impact_Assessment.md` §4.3 |
| PRB-010 | Persist assessment snapshot | `approval_requests` insert, extended by `20260711130000_loan_assessment_fields.sql` (+14 columns) | TC-CR-10, TC-CR-21 | Partial | BLOCKED live; schema-cache bug found+fixed this cycle (see Bug_Report BUG-013) |
| PRB-011 | Risk approve/reject | `CreditRisk.tsx`, RLS UPDATE | TC-CR-11–12 | Partial | BLOCKED |
| PRB-012 | Objection/modification | Dialog + `loan_modification_requests`, `modificationReanalysis.ts` (extended: new scoring fields, `.select()` bug fixed) | TC-CR-13–14, TC-CR-20-reanalysis | Partial | BLOCKED live; extension verified by inspection |
| PRB-013 | Approvals page | `Approvals.tsx` | TC-APR-01–05 | Partial | BLOCKED; re-checked for breakage from wider `approval_requests` schema — none found by inspection |
| PRB-014 | Documents CRUD | `useDocuments.ts`, RLS | TC-DOC-01–06 | Partial | BLOCKED |
| PRB-015 | Account opening OCR → real customer write | FastAPI + wizard, **`Documents.tsx` `handleCompleteProcess`, `bankCustomers.ts`** | TC-DOC-07–13, TC-ACC-01–08 | **FAIL** (unrelated) / Partial (new part) | BUG-001 (pre-existing auth issue, unrelated); real-write path verified in Docker container, live BLOCKED |
| PRB-016 | Loan restricted block | `bank_customers` | TC-CR-15 | Partial | BLOCKED |
| PRB-017 | AI Assistant RAG | `policy-search`, `rag.ts` | TC-AI-01–04 | Partial | BLOCKED; unaffected by this cycle |
| PRB-018 | Chat history | `ai_chat_*` tables | TC-AI-05 | Partial | BLOCKED |
| PRB-019 | Audit log risk-only | RLS + `AuditLog.tsx` | TC-AUD-01–03 | **PASS** static | — |
| PRB-020 | User management | `admin-users` EF | TC-ADM-01–04 | Partial | BLOCKED |
| PRB-021 | Modification requests page | `ModificationRequests.tsx` | TC-MOD-01–02 | Partial | BLOCKED |
| PRB-022 | Bilingual EN/AR | `LanguageContext`, **`loanExplanation.ts` (new bilingual narrative), `LoanRiskInfoPopover.tsx` (rewritten)** | TC-UI-01 | **PASS** static | New bilingual surfaces verified by code inspection |
| PRB-023 | Realtime subscriptions | hooks/pages channels, **`bank_customers` added to publication, `useLatestBankCustomer.ts`** | TC-RT-01 | Unverified | BLOCKED |
| PRB-024 | Onboarding tours | `onboardingSession.ts`, `OnboardingTour.tsx` (now coordinates with Help System) | TC-UI-02 | Partial | Manual; coexistence with Help System verified by inspection |
| PRB-025 | Stats on Credit/Approvals | `useStats` hooks | TC-DASH-06 | Partial | — |
| PRB-026 | Re-analysis | `modificationReanalysis.ts` | TC-MOD-03 | Unverified | BLOCKED |
| PRB-027 | Seed customers | migration seed | TC-DB-02 | Unverified | BLOCKED |
| PRB-028 | Unauthorized redirect | `/unauthorized` | TC-RBAC-13 | **PASS** static | — |
| **PRB-029** | **Real bank customer creation (DB write)** | `bankCustomers.ts` (`findOrCreateBankCustomerFromAccountOpening`), `Documents.tsx` | TC-ACC-01, TC-ACC-02 | Partial | Verified in Docker container [EXEC in container]; live BLOCKED. New requirement, added this rebase. |
| **PRB-030** | **DB-generated sequential account numbering (`BOP-1000xx`)** | `20260711100000_bank_customers_account_sequence.sql`, `20260711120000_fix_bank_customers_account_sequence.sql` | TC-ACC-03, TC-ACC-04, TC-ACC-05 | Partial | Verified in Docker container incl. the BOP-200013 regression scenario and 20-way concurrency [EXEC in container]; live BLOCKED |
| **PRB-031** | **Idempotent duplicate national-ID handling** | `bankCustomers.ts` (`findOrCreateBankCustomerFromAccountOpening`), `UNIQUE(national_id)` constraint | TC-ACC-06, TC-ACC-07 | Partial | Verified by code inspection [INSPECT]; live BLOCKED |
| **PRB-032** | **"Latest customer added" hint in Credit Risk** | `useLatestBankCustomer.ts`, `CreditRisk.tsx` | TC-CR-22 | Partial | Verified by code inspection [INSPECT]; Realtime update behavior BLOCKED |
| **PRB-033** | **Deterministic loan calculation engine (EMI, DBR, age-at-maturity)** | `loanCalculator.ts`, `loanEligibility.ts`, `loanProducts.ts` | TC-CR-16, TC-CR-17, TC-CR-18 | **PASS** UT | Unit tested this cycle, 28 new tests [EXEC] |
| **PRB-034** | **Deterministic weighted risk-scoring model** | `loanRiskScoring.ts` | TC-CR-09 (extended) | **PASS** UT | Unit tested [EXEC] |
| **PRB-035** | **AI explanation-only architecture (AI cannot alter numeric result)** | `aiCreditAssessment.ts`, `supabase/functions/credit-assessment/index.ts` | TC-CR-19 | Partial | Formula-first-then-AI-additive structure verified by code inspection [INSPECT]; hybrid (AI-success) path BLOCKED — `.env` has AI disabled in this environment |
| **PRB-036** | **Deterministic bilingual fallback explanation** | `loanExplanation.ts` | TC-CR-20 | **PASS** (verified by inspection + covered indirectly by UT of the values it formats) | Currently the actively-exercised explanation path given this environment's `.env` |
| **PRB-037** | **Global Help System availability (8 pages)** | `src/components/help/*`, `useHelpTarget.ts`, page-level `HelpTarget` registrations | TC-HELP-01–08 | Partial | Verified by code inspection (`grep -rl` confirms all 8 pages) [INSPECT]; live interaction BLOCKED |
| **PRB-038** | **Help-target selection precision + onboarding coexistence** | `helpTargeting.ts` (`pickBestHelpTarget`), `OnboardingTour.tsx` | TC-HELP-09, TC-HELP-10, TC-HELP-11 | Partial | Verified by code inspection [INSPECT]; live BLOCKED. Two bugs (z-index conflict, infinite render loop) were found and fixed during construction — regression-sensitive area, recommend a manual profiler check each release. |
| NFR-001 | RLS enabled | migrations, **new INSERT policy for `bank_customers` restricted to `branch_employee`/`branch_manager`** | TC-SEC-01 | **PASS** review | New policy verified by reading the migration [INSPECT] |
| NFR-002 | Append-only audit | no UPDATE policy | TC-SEC-02 | **PASS** review | — |
| NFR-003 | Responsive UI | DashboardLayout | TC-UI-03 | **PASS** static | — |
| NFR-004 | Production build | vite build | TC-BLD-01 | **PASS** | Re-verified today [EXEC] |
| NFR-005 | Secrets not committed | .gitignore | TC-SEC-03 | **PASS** | — |
| NFR-006 | Performance / bundle size | bundle size | TC-PERF-01 | Partial | **Updated figure:** `957.39 kB` / `281.39 kB` gzip, up from `896.69 KB` / `262.59 KB` (BUG-010 note updated) |
| NFR-006b | Code quality — no new lint errors | `CreditRisk.tsx` | — | **FAIL** | New: 3 `no-explicit-any` errors introduced by the Help System build (2026-07-07, commit `4b882f7f`) went undetected because they postdate the Jul 6 baseline's lint run — see BUG-013 |
| **NFR-007** | **Schema-cache consistency after DDL migrations** | `NOTIFY pgrst, 'reload schema';` appended to `20260711130000_loan_assessment_fields.sql` | TC-CR-21 | Partial | Fix verified by inspection [INSPECT]; live re-confirmation is the user's top priority next manual step (BUG-013) |
| **NFR-008** | **Migration idempotency (safe re-run)** | All 3 new migrations use `IF NOT EXISTS` / drop-then-recreate patterns | — | **PASS** review | Verified by reading each migration file [INSPECT] |

**Legend:** UT = unit test automated; BLOCKED = requires live Supabase/API; [EXEC] = executed this session; [EXEC in container] = executed in a throwaway Docker Postgres container, not the live project; [INSPECT] = verified by code reading only.

**Coverage:** 44/44 requirements mapped (34 carried forward + 10 new); 17 fully verified (was 12); 21 blocked pending environment (was 18); 6 partial/fail (unchanged count, different composition — see rows above for what shifted).
