# Test Cases

**Document ID:** QA-TC-001
**Date (rebased):** 2026-07-13 — see `Change_Impact_Assessment.md` for what drove these additions
**Total cases:** 122 (was 96) — representative sample below; full IDs referenced in RTM
**Case status key:** Still valid (carried forward, unchanged) / Updated (scenario or expected result changed) / New (added this rebase) / Deprecated (superseded, see note)

## Sample test cases — carried forward (still valid unless noted)

| TC ID | Req | Module | Scenario | Expected | Actual | Status | Case status |
|-------|-----|--------|----------|----------|--------|--------|--------------|
| TC-AUTH-01 | PRB-002 | Auth | Valid login employee@bop.ps | Redirect to dashboard | — | BLOCKED | Still valid |
| TC-AUTH-02 | PRB-002 | Auth | Invalid password | Error message, stay on /auth | — | BLOCKED | Still valid |
| TC-AUTH-03 | PRB-002 | Auth | Logout | Session cleared, /auth | — | BLOCKED | Still valid |
| TC-AUTH-04 | PRB-002 | Auth | Access /dashboard without login | Redirect /auth | Static: RequireAuth wraps routes | **PASS** static | Still valid |
| TC-RBAC-01 | PRB-001 | RBAC | Employee canAccess /dashboard | true | true (UT) | **PASS** | Still valid |
| TC-RBAC-02 | PRB-001 | RBAC | Employee cannot /audit-log | false | false (UT) | **PASS** | Still valid |
| TC-RBAC-03 | PRB-001 | RBAC | Manager /user-management | true | true (UT) | **PASS** | Still valid |
| TC-RBAC-04 | PRB-001 | RBAC | Risk /audit-log | true | true (UT) | **PASS** | Still valid |
| TC-RBAC-05 | PRB-015 | RBAC | Risk cannot open account | canOpenAccount false | false (UT) | **PASS** | Still valid |
| TC-RBAC-06 | PRB-004 | RBAC | Employee hits /user-management URL | /unauthorized | ProtectedRoute logic | **PASS** static | Still valid |
| TC-RBAC-07 | PRB-004 | RBAC | Sidebar hides audit for employee | No nav link | canAccess filter | **PASS** static | Still valid |
| TC-CR-01 | PRB-007 | Credit | Load BOP-100001 | Form populated | — | BLOCKED | Still valid |
| TC-CR-05 | PRB-008 | Credit | Submit assessment, AI narrative enabled | result_source=hybrid, ai_explanation set | — | BLOCKED | **Updated** — was "result_source=ai"; AI is now explanation-only so success looks like `hybrid`, not `ai`. Also BLOCKED in this env since `VITE_CREDIT_AI_FALLBACK=false`. |
| TC-CR-09 | PRB-009, PRB-034 | Credit | Deterministic risk scoring | score 0-100, `result_source=formula` | UT verified | **PASS** | **Updated** — was "Algorithm fallback scoring... algorithm"; formula engine is now the primary path, not a fallback, and `result_source` value changed from `algorithm` to `formula` |
| TC-CR-11 | PRB-011 | Credit | Employee approve pending | No approve buttons | isRole(RISK) gate | **PASS** static | Still valid |
| TC-CR-15 | PRB-016 | Credit | Restricted customer BOP-100004 | Block assessment | — | BLOCKED | Still valid |
| TC-DOC-01 | PRB-014 | Documents | Upload document | Row in Supabase + storage | — | BLOCKED | Still valid |
| TC-DOC-03 | PRB-014 | Documents | Delete own document | Row removed after refresh | — | BLOCKED | Still valid |
| TC-DOC-07 | PRB-015 | Documents | OCR extract-id | document_id returned | — | BLOCKED | Still valid |
| TC-DOC-08 | PRB-015 | API | Forge X-User-Role manager | Should 403 without valid JWT role | Accepts header | **FAIL** BUG-001 | Still valid (open defect, unaffected by this cycle) |
| TC-DASH-01 | PRB-005 | Dashboard | Stats cards load | Numeric values from RPC | — | BLOCKED | Still valid |
| TC-DASH-04 | PRB-006 | Dashboard | Recent activity | Real rows merged | — | BLOCKED | Still valid |
| TC-DASH-07 | PRB-003 | Dashboard | Module KPIs | Live or N/A | Static fake values | **FAIL** BUG-003 | Still valid (open defect) |
| TC-AUD-01 | PRB-019 | Audit | Employee SELECT audit_logs | RLS denial | Policy risk-only | **PASS** static | Still valid |
| TC-AI-01 | PRB-017 | AI | Policy question | Grounded answer + citations | — | BLOCKED | Still valid |
| TC-ADM-01 | PRB-020 | Admin | Manager create user | Edge function 200 | — | BLOCKED | Still valid |
| TC-VAL-01 | PRB-007 | Validation | Empty customer name submit | Toast error | Code checks trim | **PASS** static | Still valid |
| TC-VAL-02 | PRB-007 | Validation | Empty loan amount | Toast error | Code checks | **PASS** static | Still valid |
| TC-VAL-03 | PRB-012 | Validation | Objection without reason | Submit disabled / error | disabled when empty | **PASS** static | Still valid |
| TC-SEC-01 | NFR-001 | Security | RLS on approval_requests | Employee sees own only | Migration policy | **PASS** review | Still valid |
| TC-SEC-04 | — | Security | XSS in customer name | Escaped in React text | React default escape | **PASS** static | Still valid |
| TC-BLD-01 | NFR-004 | Build | npm run build | Exit 0 | Exit 0 | **PASS** | Still valid — re-executed 2026-07-13, bundle now 957.39 kB/281.39 kB gzip |
| UT-01 | PRB-001 | Unit | canAccess all core routes | all true | Pass | **PASS** | Still valid |
| UT-05 | PRB-009 | Unit | weak profile higher score | weak > strong | Pass | **PASS** | Still valid |

## New test cases — Open New Account / real customer creation (PRB-029–031)

| TC ID | Req | Module | Scenario | Expected | Actual | Status | Case status |
|-------|-----|--------|----------|----------|--------|--------|--------------|
| TC-ACC-01 | PRB-029 | Account Opening | Complete OCR flow for a new national ID | New row inserted into `bank_customers` | Verified in Docker container | **PASS (container)** | New |
| TC-ACC-02 | PRB-029 | Account Opening | Missing/incomplete OCR fields | `accountOpeningDefaults.ts` fills clearly-labeled placeholder defaults, insert still succeeds | Code inspection | **PASS (inspect)** | New |
| TC-ACC-03 | PRB-030 | Account Opening | Fresh sequence, insert 3 real customers | Account numbers `BOP-100011`, `BOP-100012`, `BOP-100013` (continuing from seeded `BOP-100010`) | Verified in Docker container, incl. reproduction of the BOP-200013 regression scenario (poisoning row `BOP-200012` present) — new regex ignores it, old regex did not | **PASS (container)** | New — see detailed example below |
| TC-ACC-04 | PRB-030 | Account Opening | Account number is never computed client-side | No frontend arithmetic on account numbers found in `bankCustomers.ts` or callers | Code inspection (`grep` for any numeric account-number construction in `src/`) | **PASS (inspect)** | New |
| TC-ACC-05 | PRB-030 | Account Opening | 20 concurrent account-opening submissions | Zero collisions, all numbers unique and sequential | Verified in Docker container | **PASS (container)** | New |
| TC-ACC-06 | PRB-031 | Account Opening | Submit the same national ID twice | Second attempt returns the existing customer, `wasCreated=false`, no thrown error | Code inspection of `findOrCreateBankCustomerFromAccountOpening` | **PASS (inspect)** | New |
| TC-ACC-07 | PRB-031 | Account Opening | Race condition: two near-simultaneous inserts, same national ID | One succeeds; the other catches `23505` and re-fetches the winning row instead of erroring | Code inspection (explicit catch-and-refetch block) | **PASS (inspect)** | New |
| TC-ACC-08 | PRB-029 | Account Opening | Success UI after creation | Distinct UI state (icon/color/message) for "new customer created" vs "existing customer reused" | Code inspection of `customerWasNew` branch in `Documents.tsx` | **PASS (inspect)** | New |

## New test cases — Loan calculation engine (PRB-033–036)

| TC ID | Req | Module | Scenario | Expected | Actual | Status | Case status |
|-------|-----|--------|----------|----------|--------|--------|--------------|
| TC-CR-16 | PRB-033 | Credit | EMI/annuity formula, standard inputs | Matches `M = P × [r(1+r)ⁿ] / [(1+r)ⁿ−1]` reference calc | Unit tested | **PASS** | New |
| TC-CR-17 | PRB-033 | Credit | DBR = 55% (exceeds 50% cap) | `eligible=false`, reason lists DBR breach | Unit tested | **PASS** | New |
| TC-CR-18 | PRB-033 | Credit | client age 55 + term 20 = 75 (exceeds 70 cap) | `eligible=false`, reason lists age breach | Unit tested | **PASS** | New |
| TC-CR-19 | PRB-035 | Credit | AI narrative call fails/times out | `result_source` stays `formula`, score/category unchanged, `aiUnavailableReason` set | Code inspection of `assessCreditRisk` (formula computed unconditionally, first) | **PASS (inspect)** | New |
| TC-CR-20 | PRB-036 | Credit | AI disabled (`VITE_CREDIT_AI_FALLBACK=false`, current env value) | Deterministic bilingual explanation shown, references only computed fields | Code inspection of `loanExplanation.ts`; values it formats are unit-tested | **PASS (inspect)** | New — this is the actively-exercisable path in the current environment |
| TC-CR-21 | PRB-010, NFR-007 | Credit | Submit assessment right after applying the migration | No "column ... not found in schema cache" error | Fix applied (`NOTIFY pgrst, 'reload schema'`); **not yet re-confirmed live** | **NOT YET VERIFIED — user action required** | New — highest-priority manual retest, see `Known_Issues.md` |
| TC-CR-22 | PRB-032 | Credit | Open "New Assessment" after a customer was just created | Hint box shows the latest customer with a working click-to-fill button | Code inspection of `useLatestBankCustomer.ts` | **PASS (inspect)** | New |

## New test cases — Global Help System (PRB-037–038)

| TC ID | Req | Module | Scenario | Expected | Actual | Status | Case status |
|-------|-----|--------|----------|----------|--------|--------|--------------|
| TC-HELP-01–08 | PRB-037 | Help | Help toggle present on Dashboard, Credit Risk, Approvals, Documents, User Management, Audit Log, Modification Requests, AI Assistant | Toggle renders, opens overlay | `grep -rl "HelpTarget\|useHelpTarget" src/pages/` confirms all 8 | **PASS (inspect)** | New |
| TC-HELP-09 | PRB-038 | Help | Two overlapping help targets on one page | Overlay selects the smaller/most specific one (priority → containment → bounding box) | Code inspection of `pickBestHelpTarget()` | **PASS (inspect)** | New |
| TC-HELP-10 | PRB-038 | Help | Toggle help mode on/off repeatedly | No runaway re-renders (regression check for the already-fixed infinite-loop bug) | Code inspection of content-keyed effect + memoized context value | **PASS (inspect)** | New — recommend a manual React DevTools profiler pass before next demo, this bug class is easy to reintroduce |
| TC-HELP-11 | PRB-038 | Help | Onboarding tour active, user activates help mode | Tour auto-dismisses, no z-index conflict | Code inspection of `OnboardingTour.tsx` | **PASS (inspect)** | New |

## Deprecated / superseded framing

None of the 96 baseline cases are fully deprecated — the underlying scenarios remain relevant. TC-CR-05 and TC-CR-09 are **updated in place** (see table above) rather than deprecated, since the requirement they test still exists, only the expected values changed (`result_source` taxonomy).

## Detailed example — TC-ACC-03 (sequential account numbering, incl. regression reproduction)

| Field | Value |
|-------|-------|
| **Priority** | P0 |
| **Severity** | Critical (data integrity) |
| **Preconditions** | Docker Postgres container seeded with 10 real `BOP-100001`–`BOP-100010` demo rows plus one out-of-family `BOP-200012` poisoning row (reproducing the exact state that caused the original production bug) |
| **Steps** | 1. Apply `20260711100000_bank_customers_account_sequence.sql` (original). 2. Insert a new customer, observe generated number. 3. Apply the corrective migration `20260711120000_fix_bank_customers_account_sequence.sql`. 4. Insert 3 more customers, observe generated numbers. |
| **Expected** | Step 2 with the ORIGINAL migration reproduces the bug (`BOP-200013`, proving root cause). Step 4 with the FIX produces `BOP-100011`, `BOP-100012`, `BOP-100013`, ignoring the poisoning row. |
| **Actual** | Reproduced exactly as expected in both directions. |
| **Evidence** | Docker throwaway Postgres container — not the live Supabase project. Live re-confirmation still recommended by the user before treating this as closed in production. |
| **Defect** | Was BUG (unlabeled, fixed same session); see `Bug_Report.md` historical note |

## Detailed example — TC-DOC-08

| Field | Value |
|-------|-------|
| **Priority** | P0 |
| **Severity** | Critical |
| **Preconditions** | API running on :8000 |
| **Steps** | 1. curl -X POST /documents/extract-id -H "X-User-Role: branch_manager" -F file=@id.png |
| **Expected** | 401/403 unless JWT proves manager role |
| **Actual** | 403 only if header missing/wrong; any forged allowed role succeeds |
| **Defect** | BUG-001 |

## Execution summary (rebased 2026-07-13)

| Status | Count | Delta |
|--------|------:|------:|
| PASS (unit test / build, executed this session) | 22 | +0 net label, but underlying UT count grew from 9→37 |
| PASS (container — Docker Postgres, not live) | 3 | **New category** |
| PASS (code inspection only) | 19 | **New category** — was previously folded into "PASS static"; now split out per the rebase's evidence-discipline requirement |
| FAIL | 2 | unchanged (BUG-001, BUG-003, both pre-existing/unrelated) |
| BLOCKED | 74 | +6 (new cases requiring live Supabase/AI env) |
| NOT YET VERIFIED (user action required) | 1 | **New** — TC-CR-21, schema-cache fix needs live re-confirmation |
| PARTIAL | 1 | -3 (reclassified into the more precise categories above) |
| **Total** | **122** | +26 new cases this rebase |

See `Test_Summary.md` for roll-up and `Rebased_QA_Baseline.md` for the evidence-tag legend.
