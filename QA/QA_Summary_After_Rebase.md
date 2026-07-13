# QA Summary After Rebase

**Date:** 2026-07-13
**Status:** CONDITIONAL PASS (Academic / Demo Ready), same overall verdict as the 2026-07-06 baseline, re-earned against a substantially larger and riskier codebase.

This is the executive entry point for the rebase. Full detail lives in `Change_Impact_Assessment.md` (what changed), `Rebased_QA_Baseline.md` (new scope/assumptions), `Regression_Testing.md` (tiered suite), `Requirements_Traceability_Matrix.md`, `Test_Cases.md`, `Bug_Report.md`, `Known_Issues.md`, and `Risk_Register.md` (all updated).

## Why this rebase happened

Three major feature efforts landed since the Jul 6 baseline: a Global Help System, a real "Open New Account" flow that writes to `bank_customers` with DB-generated sequential account numbers, and a full bank-calculator-style loan/credit-risk engine refactor with a strict deterministic-engine-as-source-of-truth / AI-explains-only architecture. All 24 QA docs had been static since Jul 6 and no longer described the current system.

## Fresh evidence gathered (2026-07-13)

- `npm test`: **37/37 pass**, 8 suites (was 9/9, 1 suite)
- `tsc --noEmit`: 6 errors, all pre-existing and unrelated (`AIChatContext.tsx`)
- `eslint .`: 6 errors (3 pre-existing baseline debt + **3 newly-identified, previously-undocumented** errors traced via `git blame` to the Help System build itself, one day after the baseline — see BUG-013), 15 warnings
- `npm run build`: PASS, bundle grew from 896.69 KB/262.59 KB gzip to **957.39 kB/281.39 kB gzip**
- Sequential account-numbering and 20-way concurrency safety verified in a throwaway Docker Postgres container (not the live project)

## 1. QA files created or updated

**Created (new):** `Change_Impact_Assessment.md`, `Rebased_QA_Baseline.md`, `QA_Summary_After_Rebase.md` (this file).
**Updated (rewritten/extended in place):** `Regression_Testing.md`, `Requirements_Traceability_Matrix.md`, `Test_Cases.md`, `Bug_Report.md`, `Known_Issues.md`, `Risk_Register.md`.
**Reviewed and lightly updated for consistency:** `QA_Report.md`, `Testing_Report.md`, `Test_Plan.md`, `Test_Strategy.md`, `Test_Summary.md`, `Functional_Testing.md`, `Non_Functional_Testing.md`, `Security_Testing.md`, `Performance_Testing.md`, `Validation_Testing.md`, `Improvements.md`, `Coverage_Map.md`, `API_Testing.md`, `Database_Testing.md`, `Frontend_Backend_Integration.md`, `Role_Permission_Matrix.md`, `Automation_Testing.md`, `SRS_Baseline.md` (see each file's own changelog note for what changed).

## 2. Major old assumptions invalidated

1. **"`bank_customers` is static seed data"** — false. It is now a live write path via the Open New Account flow.
2. **"`result_source` is binary (`ai`/`algorithm`)"** — false. It's a 4-value enum (`ai`, `algorithm`, `formula`, `hybrid`); legacy values preserved for old rows only.
3. **"Credit scoring is one opaque function"** — false. It's now a decomposed, independently unit-tested pipeline (rate resolution → EMI → eligibility gates → weighted risk score → optional AI narrative).
4. **"3 lint errors"** — false, corrected to 6 (see BUG-013, a real regression from the Help System build that went undetected for a week).
5. **"896 KB bundle"** — stale, corrected to 957.39 kB.
6. **"3 edge functions"** — now 4 directories, but only 3 functioning; `manage-users` is confirmed empty/orphaned scaffold.

## 3. New top regression priorities (Tier 1 — release-blocking)

1. Real account creation: correct DB write, correct sequential `BOP-1000xx` numbering, no collisions under concurrency, graceful duplicate-national-ID reuse.
2. Loan/credit-risk engine: EMI math, DBR cap (50%), age-at-maturity cap (70), eligibility-override forcing `high`/`reject`, and the invariant that AI can never change the numeric result.
3. Live schema-cache re-confirmation for the new `approval_requests` columns (BUG-014) — fixed in code, **not yet confirmed live**.

Full tiered suite (Tier 1/2/3, 29 numbered items) is in `Regression_Testing.md`.

## 4. Highest-risk modules after rebase

1. **`bankCustomers.ts` + the two account-sequence migrations** — genuine live database write, concurrency-sensitive ID generation, already had one production bug (BOP-200013) and one UX bug (duplicate national ID), both fixed but only container-verified, not live-verified.
2. **`creditScoring.ts` / `aiCreditAssessment.ts` / `loan*.ts`** — the platform's core business logic, now materially more complex (5 new modules), with a critical architectural invariant (AI cannot override numbers) that is currently enforced by design/convention rather than an automated test (RISK-013).
3. **`approval_requests` schema + PostgREST schema cache** — just caused a live production error (BUG-014); any future migration touching this table carries the same risk unless the `NOTIFY pgrst, 'reload schema';` pattern is followed consistently.
4. **Global Help System** — new subsystem, already had one infinite-render-loop incident during construction; no automated guard against reintroduction (RISK-015).

## 5. What to test manually first, before demo/release

In priority order:
1. **Re-apply the `20260711130000_loan_assessment_fields.sql` migration live** (via the Supabase SQL Editor, per your established preference) and confirm a new assessment no longer throws the "age_at_maturity ... schema cache" error.
2. **Open New Account end-to-end**: create a brand-new customer, confirm the account number is `BOP-1000xx` and increments correctly from whatever the current live high-water mark is.
3. **Duplicate national ID retry**: submit the same national ID twice, confirm the second attempt reuses the existing customer with a clear "existing customer" UI state and no error.
4. **New credit assessment with the current environment's AI setting** (`VITE_CREDIT_AI_FALLBACK=false`): confirm installment/DBR/age-at-maturity/eligibility all display correctly and the source badge reads "Formula engine (no AI)" — this is the only AI-explanation path actually exercisable in this environment right now.
5. **Help mode**: toggle it on 2–3 pages, confirm no interaction issues with the onboarding tour and no visible slowdown/re-render storms.
6. Standard smoke: login per role, dashboard load, approve/reject one application, upload/delete a document, AI Assistant policy question, EN/AR toggle.

## 6. What should be automated next

1. A regression test asserting the AI-cannot-override-the-number invariant directly (e.g., feed a mocked AI response that contradicts the formula result and assert it's ignored) — currently this is a design guarantee, not a tested one (RISK-013).
2. A lightweight render-count/no-infinite-loop test for the Help System's `useHelpTarget`/`HelpOverlay` interaction, given it already regressed once (RISK-015).
3. An automated check (script or CI step) that greps for any `bank_customers.account_number` value outside the `BOP-1xxxxx` family, as a cheap ongoing guard against RISK-011 recurring.
4. Basic Playwright/Cypress smoke coverage for the two new live-write flows (account creation, loan assessment submission) — these are exactly the kind of feature where a unit test can't catch a live schema-cache or RLS-policy misconfiguration (BUG-014 was invisible to unit tests).
5. Continue closing the pre-existing E2E gap (BUG-005) — still the single biggest structural testing gap in the project, and now covers a materially larger and higher-stakes surface than it did at the Jul 6 baseline.
