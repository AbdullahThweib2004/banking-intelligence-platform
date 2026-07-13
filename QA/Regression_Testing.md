# Regression Testing Report

**Date:** 2026-07-13 (rebased — supersedes the 2026-07-06 version below the changelog note)
**Release under test:** Post loan-engine refactor + real account-creation + Global Help System
**Rebase context:** see `Change_Impact_Assessment.md` for the full change inventory this suite is built from, and `Rebased_QA_Baseline.md` for scope/assumptions.

> **Changelog:** This file previously covered only the pre-2026-07-06 UI redesign/AI-fix cycle (content preserved below as "Tier 3 / legacy carry-forward" items where still relevant). It did not reflect any of the account-creation, loan-engine, or help-system work. This rebase replaces the flat single-list structure with a risk-tiered suite per the QA rebase mandate.

## Automated regression suite (executed today, 2026-07-13)

| Suite | Command | Result | Evidence |
|-------|---------|--------|----------|
| Unit tests | `npm test` | **37/37 PASS**, 8 suites (was 9/9, 1 suite) | [EXEC] |
| Typecheck | `npx tsc --noEmit -p tsconfig.app.json` | 6 pre-existing errors, all `AIChatContext.tsx`, unrelated to any change in scope | [EXEC] |
| Lint | `npx eslint .` | 6 errors (3 pre-existing baseline: `command.tsx`, `textarea.tsx`, `tailwind.config.ts`; **+3 new since baseline**: `no-explicit-any` in `CreditRisk.tsx` lines 813/1371/1476, introduced by the Help System build itself per `git blame` — BUG-013), 15 warnings — **FAIL** as a gate | [EXEC] |
| Production build | `npm run build` | **PASS**, `957.39 kB` JS / `281.39 kB` gzip (was `896.69 KB` / `262.59 KB`) | [EXEC] |

The 6 typecheck errors are unrelated to any change in this rebase's scope (all in `AIChatContext.tsx`, untouched this cycle). Of the 6 lint errors, 3 are pre-existing baseline debt (`command.tsx`, `textarea.tsx`, `tailwind.config.ts`) and 3 are a **newly-identified regression from the Help System build itself** (`CreditRisk.tsx` ref-as-any casts, BUG-013) — the baseline's lint-error count (3) was accurate for Jul 6, but has been stale since Jul 7.

---

## Tier 1 — Critical / release-blocking

Must pass before any demo or release. These are the areas with genuine live database writes and business-rule-correctness risk introduced since baseline.

| # | Area | Scenario | Test IDs | Regression risk if broken | Status |
|---|------|----------|----------|---------------------------|--------|
| 1 | Open New Account — DB write | New customer, valid OCR data → row inserted into `bank_customers` | TC-ACC-01, TC-ACC-02 | Silent data loss / no account created | Verified by code inspection + Docker-container SQL test [INSPECT]; live UI run BLOCKED (no credentialed env) |
| 2 | Open New Account — sequential numbering | Account number is `BOP-1000xx`, strictly sequential, DB-generated (never frontend-computed) | TC-ACC-03, TC-ACC-04 | Recurrence of the BOP-200013 bug class (regex re-poisoned by a future out-of-family row) | Verified in throwaway Docker Postgres container: 10 seed rows + 1 poisoning row → correct `BOP-100011..013` sequence, poisoning row ignored [EXEC in container, not live] |
| 3 | Open New Account — concurrency | N concurrent account-opening submissions → zero collisions, zero duplicate account numbers | TC-ACC-05 | Two customers issued the same account number (data integrity/compliance failure) | Verified: 20 concurrent inserts in Docker container, zero collisions [EXEC in container, not live] |
| 4 | Open New Account — duplicate national ID | Same national ID submitted twice → second attempt reuses existing customer, no hard error | TC-ACC-06, TC-ACC-07 | Regression of the exact "bad UX" bug already fixed once (hard 23505 error surfaced to the employee) | Verified by code inspection of `findOrCreateBankCustomerFromAccountOpening()` [INSPECT]; live UI run BLOCKED |
| 5 | Open New Account — success UI states | UI clearly distinguishes "new customer created" vs "existing customer reused" | TC-ACC-08 | Employee cannot tell if a duplicate submission actually created a second record | Verified by code inspection (`customerWasNew` branch in `Documents.tsx`) [INSPECT]; live UI BLOCKED |
| 6 | Credit Risk — EMI/installment math | Given principal/rate/term, monthly installment matches the annuity formula | TC-CR-16 | Wrong installment shown to employee/customer — direct financial-accuracy defect | **PASS** — unit tested, `loanEngine.test.ts` [EXEC] |
| 7 | Credit Risk — DBR eligibility gate | DBR > 50% → `not_eligible`, category forced to `high`, action forced to `reject`, regardless of raw score | TC-CR-17 | An over-leveraged applicant could be approved | **PASS** — unit tested [EXEC] |
| 8 | Credit Risk — age-at-maturity gate | client age + term > 70 → `not_eligible`, same override as above | TC-CR-18 | An ineligible-by-age applicant could be approved | **PASS** — unit tested [EXEC] |
| 9 | Credit Risk — AI cannot override numbers | AI narrative is generated from already-computed final numbers only; disabling/failing AI never changes score/category/eligibility | TC-CR-19 | Silent architectural regression allowing AI to hallucinate a different score — the single most important invariant introduced this cycle | Verified by code inspection of `aiCreditAssessment.ts` (formula computed first, unconditionally; AI call is additive-only) [INSPECT] + unit test on the formula-only path [EXEC]. Hybrid (AI-success) path itself is code-inspected only — `VITE_CREDIT_AI_FALLBACK=false` in this environment, so it is not exercised live here. |
| 10 | Credit Risk — deterministic fallback narrative | When AI is disabled/times out/fails, a complete bilingual explanation is still shown, built only from computed fields | TC-CR-20 | Employee sees a blank/broken explanation panel | Verified by code inspection of `loanExplanation.ts` [INSPECT]; this is the actively-exercised path in this environment given the current `.env` value |
| 11 | Credit Risk — schema/migration integrity | New `approval_requests` columns are present and writable; no "column not found in schema cache" error | TC-CR-21 | Recurrence of the exact live bug just reported and fixed (`age_at_maturity` missing from schema cache) | Fix applied (`NOTIFY pgrst, 'reload schema';` appended to migration) [INSPECT]; **user must re-confirm live** by re-running the migration in the Supabase SQL Editor and retrying an assessment — this is the top manual-test priority before next use |
| 12 | Documents → Account creation entry point | Completing the document-processing flow triggers the real account-creation call (not a mock) | TC-DOC-13 | Feature silently reverts to non-functional mock behavior | Verified by code inspection (`handleCompleteProcess` call site) [INSPECT]; live BLOCKED |

## Tier 2 — Major features / integrations

Should pass before release; failures here are serious but not necessarily release-blocking alone.

| # | Area | Scenario | Test IDs | Status |
|---|------|----------|----------|--------|
| 13 | Global Help System — availability | Help toggle present and functional on all 8 covered pages (Dashboard, Credit Risk, Approvals, Documents, User Management, Audit Log, Modification Requests, AI Assistant) | TC-HELP-01–08 | Verified by code inspection (`grep -rl "HelpTarget\|useHelpTarget" src/pages/`, all 8 confirmed) [INSPECT]; live interaction BLOCKED |
| 14 | Global Help System — targeting precision | Overlapping/nested help targets resolve to the correct (most specific) one | TC-HELP-09 | Verified by code inspection of `pickBestHelpTarget()` ranking (priority → DOM containment → smallest bounding box) [INSPECT] |
| 15 | Global Help System — no render-loop regression | Toggling help mode repeatedly does not cause runaway re-renders | TC-HELP-10 | Fixed once already (content-keyed effect + memoized context value) — verified by code inspection [INSPECT]; recommend a manual React DevTools profiler check before next demo since this bug class is easy to reintroduce |
| 16 | Global Help System / Onboarding coexistence | Activating help mode auto-dismisses any active onboarding tour; no z-index conflict | TC-HELP-11 | Verified by code inspection [INSPECT]; live BLOCKED |
| 17 | Credit Risk — "latest customer" hint | New Assessment dialog shows the most recently created bank customer with a click-to-fill button, updates live via Realtime | TC-CR-22 | Verified by code inspection of `useLatestBankCustomer.ts` [INSPECT]; Realtime behavior itself BLOCKED (needs live subscription) |
| 18 | Approvals flow (unchanged code, changed upstream schema) | Approve/reject still functions correctly now that `approval_requests` has 14 additional nullable columns | TC-APR-01–05 (carried forward) | Not re-broken by inspection (new columns are all nullable, no `SELECT *` assumptions found) [INSPECT]; live BLOCKED, same as baseline |
| 19 | Manager / role-specific pages | Manager-only pages render correctly with no regression from schema/help-system changes | TC-RBAC-03, TC-RBAC-04 (carried forward) | No code changes detected in role-gating logic itself [INSPECT] |
| 20 | Modification requests → reanalysis | An approved modification touching a bank-calculator field (e.g. `loan_term_years`) triggers correct reanalysis with the new fields persisted | TC-CR-13, TC-CR-14 (extended) | Verified by code inspection of `modificationReanalysis.ts` — `SCORING_FIELDS` extended, `.select()` bug (broken string concatenation) fixed to a single template literal, update payload extended to include all new fields [INSPECT]; live BLOCKED |
| 21 | AI Assistant / policy search | Unaffected by this cycle's changes — confirm no regression | TC-AI-01–03 (carried forward, unchanged) | No code changes detected [INSPECT] |

## Tier 3 — Broader regression / lower-frequency

Re-swept because upstream data shape changed, even though the area's own code did not.

| # | Area | Why it's in scope | Status |
|---|------|--------------------|--------|
| 22 | Auth / authorization | No code changes detected; re-swept because it's foundational | Unchanged from baseline — carried forward as-is |
| 23 | Dashboard critical widgets/data loading | No code changes to widget logic detected; reads tables unaffected by the new columns | Unchanged from baseline |
| 24 | Audit Log | No code changes detected | Unchanged from baseline |
| 25 | User Management | No code changes to role logic; help-system coverage added (see Tier 2 #13) | Unchanged aside from help coverage |
| 26 | Database integrity checks | RLS policies for `bank_customers` INSERT (new, restricted to `branch_employee`/`branch_manager`), `UNIQUE(national_id)`, sequence/trigger correctness | Verified in Docker container [EXEC in container]; live RLS enforcement BLOCKED (needs live session with each role) |
| 27 | Error handling / user messages | Duplicate national ID, OCR-missing-fields, sequence/trigger failure, schema-cache-miss — all should produce clear, non-crashing messages | Verified by code inspection of catch blocks in `bankCustomers.ts` and `aiCreditAssessment.ts` [INSPECT]; live BLOCKED |
| 28 | Realtime behavior | `bank_customers` added to the `supabase_realtime` publication; `useLatestBankCustomer` subscribes | Verified by code inspection of migration + hook [INSPECT]; live BLOCKED |
| 29 | Migration-sensitive behavior | All 3 new migrations are idempotent (`IF NOT EXISTS` / drop-then-recreate); safe to re-run | Verified by reading each migration file [INSPECT]; live application is the user's own action per established preference |

## Manual regression checklist (for demo rehearsal)

### Smoke (15–20 min) — updated for this cycle

- [ ] Login as each demo user
- [ ] Dashboard loads stats + recent activities (unchanged area, quick sanity check)
- [ ] **Open New Account: create a brand-new customer end to end, confirm the account number is `BOP-1000xx` and increments correctly**
- [ ] **Re-submit the same national ID and confirm it reuses the existing customer with no error**
- [ ] **New credit assessment: fill loan type/currency/term/age, submit, confirm installment/DBR/age-at-maturity/eligibility all display and the source badge reads "Formula engine (no AI)" given `VITE_CREDIT_AI_FALLBACK=false`**
- [ ] **Confirm the "age_at_maturity ... schema cache" error does not recur** (requires the migration to have been re-applied live first — see Tier 1 #11)
- [ ] Toggle Help mode on at least 3 of the 8 covered pages, confirm it opens/closes cleanly and doesn't fight the onboarding tour
- [ ] Risk user approves/rejects one application
- [ ] Upload and delete a document
- [ ] AI Assistant answers one policy question
- [ ] Language toggle EN ↔ AR (check the new loan-calculator UI strings too, not just legacy pages)

### Full regression (3–4 hr)

See `Test_Cases.md` — now includes the new TC-ACC-*, TC-CR-16–22, TC-HELP-* series in addition to the carried-forward baseline cases.

## Known regression risks (no E2E automation)

| Risk | Mitigation |
|------|------------|
| No Playwright/Cypress suite exists — everything above Tier-1-code-level is manual | Unchanged limitation from baseline (`BUG-005`); now higher-stakes given the new live-write paths |
| Realtime duplicate events / stale subscriptions | Manual test with two browser tabs, including the new `useLatestBankCustomer` subscription |
| Role change without re-login | Test BUG-002 scenario (unchanged, carried forward) |
| Hybrid (AI-success) explanation path is entirely untested live in this environment | Flip `VITE_CREDIT_AI_FALLBACK` to `true` (or confirm the Supabase secret value) and manually run one assessment with AI enabled before claiming that path works end-to-end |

## Result

**Automated regression: PASS** (37/37 unit tests + build; pre-existing lint/typecheck issues unrelated to this cycle).
**Full UI regression: NOT EXECUTED** — same environment limitation as the original baseline. The Tier 1 manual checklist above is the minimum required pass before demo/release, and is *stricter* than the previous baseline's smoke list because two genuine live-write paths did not exist before this cycle.
