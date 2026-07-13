# Change Impact Assessment — QA Baseline Rebase

**Date:** 2026-07-13
**Prior QA baseline date:** 2026-07-06 (all 24 `/QA` files were authored/last-touched on that date and had not been revisited since, confirmed via `git log` file mtimes)
**Trigger:** Three major feature efforts landed after the original baseline: (1) the Global Help System, (2) the real "Open New Account" flow writing to `bank_customers` with DB-generated sequential account numbers, (3) a full bank-calculator-style loan/credit-risk engine refactor. This document is Phase 1 of the rebase: what changed, where, and how it reshapes test scope and regression priority.

---

## 1. Method

- Diffed the repository against the 2026-07-06 baseline commit using `git log --since="2026-07-06"` (file-level) and read every changed source file in `src/`, `supabase/migrations/`, `supabase/functions/`.
- Re-executed the automated test suite, `tsc --noEmit`, `eslint .`, and `npm run build` today (2026-07-13) to get current, dated evidence rather than trusting the stale baseline's numbers.
- Did **not** re-run any check requiring live Supabase credentials, a live OpenRouter call, or a browser — those remain BLOCKED for the same reason they were blocked at the original baseline (no credentialed environment available to this session). Every claim below is tagged with how it was verified.

Evidence tags used throughout this rebase:
- **[EXEC]** — verified by actually running it in this session, today.
- **[INSPECT]** — verified by reading the source/migration code, not executed.
- **[UNVERIFIED]** — not checked this session (carried over from baseline or genuinely unknown).
- **[BLOCKED]** — requires an environment this session does not have (live DB session, live AI key, browser).

## 2. Fresh execution evidence (2026-07-13)

| Check | Result | Baseline (2026-07-06) | Delta |
|---|---|---|---|
| `npm test` | **37/37 pass**, 8 suites [EXEC] | 9/9 pass, 1 suite | +28 tests, +7 suites (new `loanEngine.test.ts`, 5 describe blocks; `qa.test.ts` grew) |
| `npx tsc --noEmit -p tsconfig.app.json` | 6 errors, all `src/contexts/AIChatContext.tsx` [EXEC] | 6 errors, same file/lines | No change — pre-existing, unrelated to any work in scope |
| `npx eslint .` | 6 errors + 15 warnings [EXEC] | 3 errors (per QA_Report.md) | Baseline `Bug_Report.md` documented only 3 errors (`command.tsx`, `textarea.tsx`, `tailwind.config.ts`); this session finds those same 3 **plus** 3 new `no-explicit-any` errors in `CreditRisk.tsx` (lines 813, 1371, 1476: `ref={creditActionsRef as any}` / `creditStatsRef as any` / `creditTableRef as any`). Traced via `git blame` to commit `4b882f7f` ("Add bot", 2026-07-07) — **the Global Help System build itself**, one day after the Jul 6 baseline. These are a genuine new lint regression introduced by wiring onboarding-tour target refs into `CreditRisk.tsx`, not pre-existing baseline debt. New bug entry: BUG-013. |
| `npm run build` | **PASS**, bundle `957.39 kB` JS / `281.39 kB` gzip, `82.86 kB` / `14.35 kB` CSS [EXEC] | PASS, `896.69 KB` / `262.59 KB` gzip (per `Risk_Register.md` RISK-006 and `Bug_Report.md` BUG-010) | **+60.7 kB JS / +18.8 kB gzip** — real, measurable growth from the new `loan*.ts` modules, expanded Help System, and onboarding additions. RISK-006/BUG-010 both need their numbers updated, not just re-flagged. |

## 3. Inventory deltas

| Item | Baseline (Jul 6) | Now (Jul 13) | Delta |
|---|---|---|---|
| SQL migrations | 19 | 22 | +3: `20260711100000_bank_customers_account_sequence.sql`, `20260711120000_fix_bank_customers_account_sequence.sql`, `20260711130000_loan_assessment_fields.sql` |
| Edge Functions | 3 (`admin-users`, `credit-assessment`, `policy-search`) | 4 | +1: `manage-users` — **investigated and confirmed empty** (zero files inside the directory), untracked by git, directory-dated Jun 26 (pre-baseline). No route or client code references it anywhere in `src/`. Conclusion: harmless orphaned scaffold, same category as the already-documented orphaned `Index.tsx` (BUG-007), not a new attack surface or feature requiring coverage. Recorded as a housekeeping note in `Known_Issues.md`, not a new risk. |
| `approval_requests` columns | baseline set (risk_score, risk_category, risk_confidence, risk_explanation_summary, risk_top_factors, risk_derived_features, recommended_action, result_source, reanalysis_* ) | +14 columns from `20260711130000` | `loan_type`, `loan_currency`, `salary_currency`, `monthly_obligations`, `client_age`, `loan_term_years`, `annual_interest_rate_used`, `monthly_installment`, `total_interest`, `total_repaid`, `debt_burden_ratio`, `age_at_maturity`, `eligibility_status`, `ai_explanation`. All nullable/additive [INSPECT]. |
| `result_source` allowed values | `'ai' \| 'algorithm'` (app-level only, no DB CHECK) | `'ai' \| 'algorithm' \| 'formula' \| 'hybrid'` (DB CHECK added) [INSPECT] | Legacy values preserved for old rows; new values are the only ones new code writes |
| `bank_customers` | seeded demo rows only (BOP-100001–010), no app-driven inserts | app can now INSERT via `findOrCreateBankCustomerFromAccountOpening()`; DB trigger auto-assigns `account_number` | Feature moved from "static seed data" to "live-write path" — this is the single highest-impact behavioral change in the codebase since baseline |
| `src/lib/` modules | (baseline set) | +6 new: `loanCalculator.ts`, `loanEligibility.ts`, `loanRiskScoring.ts`, `loanExplanation.ts`, `loanProducts.ts`, `accountOpeningDefaults.ts`, `bankCustomers.ts`, `helpTargeting.ts` | `creditScoring.ts` and `aiCreditAssessment.ts` internally rewritten (public exports preserved); `modificationReanalysis.ts` extended |
| `src/components/help/` | did not exist | new directory, 6 files | Entirely new subsystem |

## 4. Change clusters and impacted test scope

### 4.1 Global Help System (new subsystem)
**Files:** `src/components/help/*`, `src/hooks/useHelpTarget.ts`, `src/lib/helpTargeting.ts`, `src/components/layout/DashboardLayout.tsx`, `src/components/onboarding/OnboardingTour.tsx`, `src/config/onboardingTours.ts`, plus `HelpTarget`/`useHelpTarget` registrations added into `Dashboard.tsx`, `CreditRisk.tsx`, `Approvals.tsx`, `Documents.tsx`, `UserManagement.tsx`, `AuditLog.tsx`, `ModificationRequests.tsx`, `AIAssistant.tsx` (all 8 pages confirmed via `grep -rl "HelpTarget\|useHelpTarget" src/pages/`).
**What changed:** brand-new context-driven help-mode overlay with hit-testing/ranking (`pickBestHelpTarget()`: priority → DOM containment → smallest bounding box), a floating toggle widget, and a side explanation panel. Two bugs were found and fixed during construction: a z-index conflict with the onboarding tour overlay, and an infinite render loop (fixed by content-keyed `useHelpTarget` effects + memoized context value).
**Impacted test scope:** every page listed above needs help-mode regression coverage (help toggle visible, correct target selection precision, no interference with onboarding tour, no re-render storms). This is entirely new scope — the baseline `Coverage_Map.md` has no row for it at all.
**Regression priority:** **Tier 2** (not release-blocking on its own, but the infinite-render-loop bug class means any future page missing a stable dependency array is a silent perf regression — worth a lightweight smoke check on every page, every release).

### 4.2 Real account creation (`bank_customers` write path + sequential numbering)
**Files:** `supabase/migrations/20260711100000_*`, `20260711120000_*`, `src/lib/bankCustomers.ts`, `src/lib/accountOpeningDefaults.ts`, `src/pages/Documents.tsx` (`handleCompleteProcess`), `src/hooks/useLatestBankCustomer.ts`, `src/pages/CreditRisk.tsx` (latest-customer hint).
**What changed:** `bank_customers` moved from "seeded demo data only" to a live INSERT path. Account numbers are generated **DB-side** by a Postgres sequence + `BEFORE INSERT` trigger (never computed in the frontend). A `UNIQUE` constraint on `national_id` plus an idempotent find-or-create function in the app layer prevents duplicate-national-ID hard failures — the app checks first, and if a race still causes a `23505`, it re-fetches instead of throwing.
**Two real production bugs were found and fixed in this cluster:**
1. **BOP-200013 numbering bug** — an unexplained pre-existing out-of-family row (`BOP-200012`, origin unknown, confirmed via full-repo grep to not be written by any code here) poisoned the sequence fast-forward regex (`'^BOP-(\d+)`, matched any digits). Reproduced exactly in a throwaway Docker Postgres container; fixed by narrowing the regex to `'^BOP-(1\d{5})` (only the 100000–199999 family) in the corrective migration. Re-verified in the same container: correct sequence resumes at `BOP-100011`, and 20 concurrent inserts produce zero collisions.
2. **Duplicate-national-ID hard error on retry** — fixed by replacing the single "insert or throw" function with `findOrCreateBankCustomerFromAccountOpening()`, returning `{customer, accountNumber, wasCreated}` so the UI shows a distinct "reused existing customer" success state instead of an error.
**Impacted test scope:** this is the highest-risk cluster in the whole rebase — it is a genuine live database write path (previously nonexistent), with concurrency-sensitive ID generation and a schema/migration dependency chain. Needs dedicated Tier 1 regression coverage: fresh customer creation → correct `BOP-1000xx` number; duplicate national ID retry → reused, no error; concurrent submissions → no collisions; migration-not-yet-applied state → clear error, not silent corruption.
**Regression priority:** **Tier 1 (release-blocking)**.

### 4.3 Loan/Credit-Risk calculation engine refactor
**Files:** `src/lib/loanProducts.ts`, `loanCalculator.ts`, `loanEligibility.ts`, `loanRiskScoring.ts`, `loanExplanation.ts`, `creditScoring.ts` (rewritten internals, exports preserved), `aiCreditAssessment.ts` (rewritten), `supabase/functions/credit-assessment/index.ts` (rewritten), `supabase/migrations/20260711130000_*`, `modificationReanalysis.ts` (extended), `CreditRisk.tsx` (new form fields/section), `CreditScoreExplanation.tsx` (`LoanCalculatorPanel`, 4-way `sourceBadge()`), `LoanRiskInfoPopover.tsx` (rewritten bilingual explainer).
**What changed:** the credit-risk flow now models Bank of Palestine loan-calculator business rules — EMI/annuity installment, Debt Burden Ratio cap (50%), age-at-maturity cap (70), product-based rate resolution (Personal / Personal Housing / Mortgage Program, index vs. fixed) — computed by a **deterministic engine that AI can never override**. AI is now explanation-only: it receives the already-computed final numbers and must explain them, never recompute or contradict them; on AI failure/timeout(12s)/disablement, a deterministic bilingual fallback narrative is shown instead, so the employee always gets a complete result. `result_source` gained two new values, `'formula'` (deterministic only) and `'hybrid'` (deterministic + AI narrative), while `'ai'`/`'algorithm'` remain valid for old rows.
**Live-environment bug found and fixed during this cluster:** "Could not find the 'age_at_maturity' column ... in the schema cache" — code and migration were consistent (ruled out a code bug via grep); root cause was PostgREST's schema cache not having picked up the new columns. Fixed by appending `NOTIFY pgrst, 'reload schema';` to the end of the migration (idempotent-safe to re-run).
**Environment fact relevant to QA:** `.env` currently has `VITE_CREDIT_AI_FALLBACK=false` [EXEC, confirmed via grep], meaning **AI narrative generation is currently disabled in this environment** — every assessment run here executes the pure `'formula'` path. The `'hybrid'` (AI-narrative) path and the AI-timeout/failure-fallback behavior are therefore **verified by code inspection and unit test only, not by live execution**, in this environment. Flipping that flag (or a differing value in Supabase secrets/production) is required before hybrid-path live testing is possible.
**Impacted test scope:** DBR/age-at-maturity math (now unit-tested, 28 new tests in `loanEngine.test.ts`), eligibility override forcing `category='high'`/`recommended_action='reject'` regardless of raw score, rate resolution per product/currency, UI wording correctness (AI vs. algorithm vs. formula vs. hybrid — 4 distinct source badges must never be confused), reanalysis-after-modification carrying the new fields through correctly (`modificationReanalysis.ts` select-string bug was fixed here — string-concatenated `.select()` broke Supabase's literal-type parser; now a single template literal).
**Regression priority:** **Tier 1 (release-blocking)** — this is the core business logic of the platform's flagship feature.

### 4.4 Documents page behavior change
**File:** `src/pages/Documents.tsx`.
**What changed:** `handleCompleteProcess()` now calls the real `findOrCreateBankCustomerFromAccountOpening()` instead of a mock/no-op; success UI branches on `customerWasNew` to show two distinct states.
**Impacted test scope:** covered jointly under 4.2 (account creation) — Documents is the entry point/trigger, not a separate risk.
**Regression priority:** Tier 1 (shares the release-blocking status of 4.2).

## 5. Old assumptions this rebase invalidates

1. **"`bank_customers` is static seed data"** — false as of this session; it is now a live write path. Every baseline test case that assumed read-only customer data (e.g. anything treating `BOP-100001–010` as the complete universe) is now incomplete.
2. **"`result_source` is binary (`ai` or `algorithm`)"** — false; it is now a 4-value enum, and UI/logic branching on it must handle all 4, not 2.
3. **"Credit scoring = a single opaque function"** — false; scoring is now explicitly decomposed into rate resolution → EMI → eligibility gates → weighted risk score → (optional) AI narrative, each independently testable and each a candidate for its own regression case.
4. **"AI can affect the numeric result"** — false, and this is now an architectural invariant enforced by the code structure itself (AI only ever receives final numbers and returns a string), not just a convention — worth a dedicated regression case asserting this never regresses.
5. **Bundle size baseline (896.69 KB / 262.59 KB gzip) and lint-error count (3)** — both stale; corrected in §2 above.
6. **"3 edge functions"** — now 4 directories, though only 3 are functioning; `manage-users` is empty/orphaned.

## 6. Regression priority summary (feeds Phase 4)

| Priority | Clusters |
|---|---|
| **Tier 1 — release-blocking** | Real account creation & sequential numbering (4.2); Loan/credit-risk calculation engine (4.3); Documents→account-creation entry point (4.4) |
| **Tier 2 — major features** | Global Help System (4.1); Approvals/Manager pages (unchanged code, but now sit downstream of changed data shapes — must reconfirm they still render correctly with the new `approval_requests` columns present) |
| **Tier 3 — broader regression** | Everything unchanged since baseline (Auth, RBAC routing, Dashboard widgets, Audit Log, User Management) — no code changes detected in the core logic of these areas, but they must be re-swept because they read from tables (`approval_requests`) whose shape changed |

See `Regression_Testing.md` for the full tiered test suite and `Rebased_QA_Baseline.md` for the updated scope statement.
