# QA Roadmap & Summary — Bank of Palestine Intelligence Platform

**Date:** 2026-07-13
**Prepared from:** direct repository inspection (code, migrations, tests, build) + the existing `/QA` document set (last rebased 2026-07-13, see `QA_Summary_After_Rebase.md`) + one major feature built **after** that rebase that is not yet reflected anywhere in `/QA`.
**Status:** CONDITIONAL PASS carried forward from the last rebase, now **stale again** in one specific area (the chat assistant) — see below.

---

## Executive note — do this first, next, last

- **Do first (today):** Re-confirm the live schema-cache fix (`age_at_maturity` column error) and run the 6-item Tier 1 manual smoke list in §7 for account creation + credit risk. Nothing else matters if these are broken.
- **Do next (this week):** Manually exercise the brand-new hybrid bank chat assistant (§2, item 4) — it has **zero manual verification and zero live testing** right now, only 17 unit tests on its pure math/classification helpers. Then work through Tier 2 (Help System, Approvals, role pages) and the regression sweep.
- **Do last (before/at release, can slip past demo):** Automation backlog (§8), performance/bundle-size cleanup, and the two known housekeeping items (orphaned `Index.tsx`, empty `manage-users` function) — none of these block a demo.

---

## 1. Project QA Overview

The platform is a 3-role (branch employee / branch manager / risk department) internal banking intelligence tool: dashboard, credit-risk assessment, approvals, document upload/OCR + real account opening, an AI assistant, audit log, and user management. Frontend is React 18 + TypeScript + Vite; backend is Supabase (Postgres/Auth/RLS/Realtime/Edge Functions) plus a separate FastAPI OCR microservice.

**Current QA status:** the `/QA` folder was fully rebased on 2026-07-13 (24 documents updated/created) to cover three major efforts: a Global Help System, a real "Open New Account" flow with DB-generated sequential account numbers, and a full loan/credit-risk calculation engine refactor. That rebase is accurate for everything it covers — but **one more major feature has landed since**, entirely untouched by that rebase: a hybrid bank chat assistant that now reads live customer data and runs loan-affordability calculations from the chat page. This document exists specifically to (a) fold that feature into the QA picture and (b) turn the accumulated `/QA` content into one practical, ranked action plan, since the last rebase left 24 separate files that are thorough but not built for "what do I do Monday morning."

**Why QA needs refreshing now:** the chat assistant change is not cosmetic — it added a new live database read path (previously chat never touched `bank_customers`), a new intent-routing layer, a new edge function, and a new deterministic financial-calculation path (installment-term recommendation) — all reachable from a page whose entire previous QA history assumed "answers only from 3 static policy files." That assumption is now false, and nothing in `/QA` currently reflects it.

---

## 2. What Changed Recently

| # | Change | What it touches | How it affects testing | Old tests still valid? |
|---|--------|------------------|-------------------------|--------------------------|
| 1 | **Global Help System** — contextual help overlay across 8 pages | `src/components/help/*`, `useHelpTarget.ts`, `helpTargeting.ts`, onboarding coordination | New interaction surface on every major page; already had one infinite-render-loop bug during construction (fixed) and introduced 3 new lint errors that went undetected for a week (BUG-013) | Mostly yes — existing page tests weren't testing help behavior, so nothing is invalidated, only extended (new TC-HELP-01–11 cases added in the last rebase) |
| 2 | **Real "Open New Account" flow** — `bank_customers` is now a live write target with DB-generated sequential numbering | `bankCustomers.ts`, 2 migrations (sequence + fix), `Documents.tsx` | This used to be effectively read-only demo data; now it's a genuine concurrent-write path. Already found and fixed two real bugs (wrong account-number family `BOP-200013`; hard error on duplicate national ID) | **No** — any old assumption that `bank_customers` = static seed data (BOP-100001–010 only) is invalidated. Old Test_Cases rows assuming a fixed customer set need the new TC-ACC-01–08 series alongside them |
| 3 | **Loan/credit-risk engine refactor** — deterministic EMI/DBR/age-at-maturity engine, AI reduced to explanation-only | `loanCalculator.ts`, `loanEligibility.ts`, `loanRiskScoring.ts`, `loanProducts.ts`, `loanExplanation.ts`, rewritten `creditScoring.ts`/`aiCreditAssessment.ts`, rewritten `credit-assessment` edge function, +14 `approval_requests` columns | `result_source` went from 2 values (`ai`/`algorithm`) to 4 (`ai`/`algorithm`/`formula`/`hybrid`); scoring is now a 28-unit-tested pipeline instead of one function; caused one live bug (schema-cache miss, BUG-014, fixed in migration, **not yet reconfirmed live**) | **No** — any test asserting `result_source: 'algorithm'` on success is stale; must now expect `'formula'`/`'hybrid'` |
| 4 | **Hybrid bank chat assistant (NEW — not yet in any QA doc)** — chat now routes between the 3 policy files, the live `bank_customers` database, and a deterministic loan-advisory calculator | New: `chatIntent.ts`, `chatCustomerLookup.ts`, `chatLoanAdvisory.ts`, `chatHybridAnswer.ts`, `assistantChat.ts`, `supabase/functions/assistant-chat/index.ts` (filled a previously-empty scaffold); edited `AIChatContext.tsx`, `AIAssistant.tsx` | Chat can now read live customer financial data (income, expenses, existing loans, restrictions) and recommend a loan term — this is a brand-new live-data + calculation surface with **17 unit tests covering only the pure classifier/calculator functions**, and **zero tests, zero manual verification, on the orchestration layer, the DB lookup, or the edge function** | **N/A — nothing existed to invalidate.** But the *implicit* old assumption "AI Assistant only ever answers from the 3 policy files" is now false and was never explicitly written down anywhere, so nobody has been told it changed |

**Housekeeping note (not a functional risk):** `src/lib/rag.ts` and `src/lib/assistantPolicy.ts` still contain the old file-only retrieval path (`answerQuestion()`, `isOutOfScope()` blocklist) — this code is no longer called by the chat page (it now calls `answerHybridQuestion()` instead) but was intentionally left in place rather than deleted. It is dead code from the chat page's perspective; harmless, but worth a cleanup pass eventually (same category as the already-known orphaned `Index.tsx` and empty `manage-users` edge function).

---

## 3. Current QA Coverage

| Area | Coverage level | Evidence type |
|------|----------------|----------------|
| Auth / RBAC / route matrix | Good | Unit tests + static code review |
| Credit-risk calculation engine (EMI, DBR, age-at-maturity, risk scoring) | Good | 28 unit tests, deterministic and reproducible |
| Real account creation + sequential numbering | Good on logic, **not live-confirmed** | Verified in a throwaway Docker Postgres container (concurrency, poisoning-row regression) — never run against the actual Supabase project |
| AI-narrative-cannot-override-numbers invariant | Design-level only | Enforced by code structure (formula computed unconditionally first); **no automated test asserts this directly** |
| Global Help System | Partial | Code inspection only across all 8 pages; zero live interaction testing |
| **Hybrid chat assistant (DB + policy + advisory)** | **Minimal** | 17 unit tests on pure helper functions only; **the DB lookup, intent routing, and end-to-end answer composition have never been run, not even once, in any environment** |
| Dashboard, Audit Log, User Management, Approvals | Unchanged from original baseline | Static review + a handful of unit tests; no new code, no new risk, but still no E2E |
| Documents CRUD, OCR wizard | Partial | Static review; live blocked (needs FastAPI + Tesseract running) |
| Security (RLS policies) | Good on design, **not live-confirmed** | All policies read directly from migrations; no live multi-role session test has ever been run |
| End-to-end browser automation | **None** | No Playwright/Cypress anywhere in the project — this is the single largest structural gap and has been known since the original audit |

**Most fragile areas right now, in order:**
1. The hybrid chat assistant's live DB path (brand new, zero live testing)
2. Real account creation under live conditions (logic solid, live-unconfirmed)
3. The credit-risk schema-cache fix (BUG-014, live-unconfirmed)
4. The Global Help System's render-loop-prone hit-testing logic (already broke once)

---

## 4. Testing Roadmap

A start-to-finish path. Each step lists what "done" looks like before moving to the next.

### Step 1 — Review and baseline
Read `QA_Summary_After_Rebase.md` and this document. Re-run `npm test`, `npx tsc --noEmit -p tsconfig.app.json`, `npx eslint .`, `npm run build` yourself once, so your starting point matches what's documented (37 unit tests + 17 new = 54 passing, 6 pre-existing lint errors, 6 pre-existing type errors, build succeeds at ~970 kB / ~285 kB gzip). **Done when:** your local run matches these numbers.

### Step 2 — Test critical user flows
Login as each of the 3 roles; walk Dashboard → Credit Risk → Documents → Approvals → AI Assistant once each, just to confirm nothing is visibly broken before deeper testing. **Done when:** all 3 roles can complete one full pass with no crashes or blank screens.

### Step 3 — Test database writes and reads
This is the highest-stakes step. Cover: new account creation (correct `BOP-1000xx` numbering), duplicate national ID retry (no hard error), new credit assessment persistence (no schema-cache error), and — new this cycle — the chat assistant's live customer lookup (correct data returned for a real account number, clean "not found" for a fake one). **Done when:** every write/read in §7's checklist passes.

### Step 4 — Test permissions and roles
Confirm route access matrix (employee/manager/risk) and the `bank_customers` INSERT restriction (employee/manager can create accounts, risk cannot). Confirm the chat assistant doesn't expose anything to a role that couldn't already see it via existing pages. **Done when:** no role can reach a page or action outside `Role_Permission_Matrix.md`.

### Step 5 — Test UI and help features
Toggle Help mode on all 8 covered pages; confirm it opens/closes cleanly, targets the right element, and doesn't fight the onboarding tour or cause visible slowdown. **Done when:** all 8 pages pass with no console errors and no repeated re-renders (watch the React DevTools profiler if unsure).

### Step 6 — Test calculations and fallback logic
Run a credit assessment with a DBR-breaching input and confirm it's forced to `high`/`reject`. Run one with `VITE_CREDIT_AI_FALLBACK` in its current (disabled) state and confirm the deterministic explanation displays correctly. Ask the chat assistant a loan-term question for a real account and confirm the recommended term is sane and the debt-burden-ratio math checks out by hand for one example. **Done when:** at least one case from each of the 4 `result_source` values (`formula`, `hybrid` if you flip the flag, plus the chat's own `file`/`database`/`both`/`general` sources) has been observed.

### Step 7 — Test error handling
Try: a fake account number in Credit Risk and in chat, a duplicate national ID in account opening, an ambiguous chat question mentioning two account numbers, a chat question about "the customer" with no account number given at all. **Done when:** every case produces a clear, honest message — never a raw error, never invented data.

### Step 8 — Regression testing
Work through the Tier 1/2/3 suite in `Regression_Testing.md` (29 items) plus the new chat-assistant scenarios in §7 of this document. **Done when:** Tier 1 is 100% passed live, Tier 2/3 spot-checked.

### Step 9 — Final QA sign-off
Update `Known_Issues.md`/`Risk_Register.md` with whatever you found in Steps 1–8 (see §11 for the exact next steps), and record a go/no-go decision. **Done when:** you can answer "what's broken, what's risky, what's acceptable to ship with" in one paragraph.

---

## 5. Priority Order

| Priority | Item | Why |
|----------|------|-----|
| **P0** | Live-reconfirm the `age_at_maturity` schema-cache fix (BUG-014) | Actively blocks every new credit assessment until confirmed |
| **P0** | Live end-to-end test: Open New Account (numbering + duplicate handling) | Real money/identity data, genuine concurrency risk, already had 2 production bugs |
| **P0** | Manually test the hybrid chat assistant end-to-end at least once | Zero live testing exists today on a feature that reads real customer financial data |
| **P1** | Credit-risk calculation smoke test (DBR/age caps, eligibility override) | Core business logic; unit-tested but never watched live in the UI |
| **P1** | Role/permission sweep (all 3 roles × all pages + chat) | Security-adjacent; cheap to test, expensive if wrong |
| **P1** | Regression sweep of Approvals/Dashboard/Audit Log/User Management | Unchanged code, but sits downstream of a widened `approval_requests` schema |
| **P2** | Global Help System pass on all 8 pages | Real but lower-severity risk (UX/perf, not data integrity) |
| **P2** | Documents CRUD + OCR wizard manual pass | Known environment-dependent (needs FastAPI running) |
| **P2** | AI-narrative ("hybrid") path live test | Currently disabled by config in this environment; needs a flag flip first |
| **P3** | Automation backlog (§8) | Improves long-term confidence, doesn't block a demo |
| **P3** | Bundle-size / performance cleanup | Cosmetic-adjacent; ~970 kB is a warning, not a failure |
| **P3** | Housekeeping: dead `rag.ts`/`assistantPolicy.ts` code, orphaned `Index.tsx`, empty `manage-users` function | Zero user-facing impact |

---

## 6. High-Risk Areas

| Area | Why it's risky | Current mitigation | Residual risk |
|------|-----------------|---------------------|----------------|
| Database insert/update logic (`bank_customers`, `approval_requests`) | Real, concurrent, identity-bearing writes | Docker-container-verified sequence/trigger logic; idempotent migrations | Never run against the live Supabase project by this process |
| Account numbering (`BOP-1NNNNN` sequence) | Already caused one production bug (wrong family, `BOP-200013`) | Regex narrowed to the `1xxxxx` family, re-verified with a poisoning-row reproduction | A future out-of-family row could reintroduce the same class of bug; no automated live guard exists yet |
| Duplicate national ID handling | Previously threw a hard, confusing error on retry | Find-or-create pattern with race-safe catch-and-refetch | Logic-verified, not live-verified |
| Loan calculation logic (EMI/DBR/age-at-maturity/risk score) | Core financial correctness | 28 unit tests, deterministic, reused identically by the new chat advisory feature | Never watched in the actual UI/chat by a human this cycle |
| AI vs. deterministic-fallback logic | An architectural invariant (AI can never override the number) that isn't automated | Formula computed unconditionally before any AI call, by code structure | No automated test would catch a future accidental regression of this invariant |
| **Hybrid chat DB lookup + advisory (new)** | Reads live financial data and computes a recommendation from a natural-language question | Exact-account-number-only lookup (no fuzzy match), `national_id` deliberately excluded from the AI payload, "not found" is honest, never invented | **Entirely unexercised outside unit tests on pure helpers** — the live Supabase call, the intent classifier's real-world accuracy, and the edge function have never actually run |
| Help bot / overlay system | Already caused one infinite-render-loop bug during construction | Content-keyed effects + memoized context, fixed | No automated guard against reintroduction on a future page addition |
| Role-based pages | Wrong access = data exposure | Static route-matrix + RLS review | Live multi-role session testing has never been performed |
| Documents actions (upload/delete/open-account) | Feeds directly into the account-creation write path | Partial static + container verification | OCR pipeline itself needs FastAPI running to test at all |
| Approvals / manager pages | Downstream of the widened `approval_requests` schema | No code changes detected, schema compatibility checked by inspection | Not re-run live since the schema changed |
| Realtime behavior | Subscriptions on `bank_customers`, `approval_requests`, dashboard activity | Present in migrations/hooks | Never tested under two simultaneous sessions or a network interruption |
| Wording / UI correctness (`result_source` badges, source labels) | 4 legacy+new values (credit risk) and 4 chat-source values must never be confused | Distinct badge/label rendering per value, code-reviewed | Never visually confirmed by a human this cycle |

---

## 7. Recommended Manual Tests

Do these in order. "Pass" means the **Expected result** happens exactly; anything else (error, wrong data, invented data, silent fallback) is a **Fail** and should be logged in `Known_Issues.md`.

| # | Open | Click / Do | Verify | Expected result | Pass/Fail rule |
|---|------|-------------|--------|------------------|------------------|
| 1 | Supabase SQL Editor | Re-run `20260711130000_loan_assessment_fields.sql` in full | Query `information_schema.columns` for `age_at_maturity` on `approval_requests` | Column exists | Fail if missing or the migration errors |
| 2 | Credit Risk (as employee or risk) | New Assessment → fill a valid form → submit | Toast/result panel | Assessment saves, no "schema cache" error, `result_source` shows `Formula engine (no AI)` | Fail on any error toast |
| 3 | Documents | Open New Account wizard → complete with a **new** national ID | The generated account number | Number is `BOP-1000xx`, sequential from the current high-water mark | Fail if number is out of the `BOP-1xxxxx` family or not sequential |
| 4 | Documents | Repeat step 3 with the **same** national ID | UI state | Shows "existing customer reused," no error, same account number as before | Fail if a raw duplicate-key error appears |
| 5 | Documents | Open New Account with 20 near-simultaneous submissions (or trust the container test) | Resulting account numbers | All unique, no collisions | Fail on any duplicate |
| 6 | Credit Risk | New Assessment with obligations high enough to breach 50% DBR | Result category/action | Forced to `high` risk / `reject`, regardless of the raw score | Fail if an over-leveraged case is approved |
| 7 | AI Assistant | Ask *"What are the conditions for obtaining a loan?"* | Answer + source badge | Answer drawn from policy files, badge reads "Policy files" | Fail if it invents a general answer instead of citing the file |
| 8 | AI Assistant | Ask *"What is the monthly salary of customer BOP-100011?"* (use a real seeded account number) | Answer | States the actual on-file salary, badge reads "Customer database" | **Fail — and treat as a real bug — if any number appears that isn't the actual DB value** |
| 9 | AI Assistant | Ask *"The customer with account number BOP-100011 wants a loan. What is the best installment term based on his salary and obligations?"* | Answer | Gives a specific recommended term with DBR math shown/implied; states if it used the on-file loan amount as an assumption | Fail if it fabricates salary/obligation figures instead of using the real record |
| 10 | AI Assistant | Ask about a fake account, e.g. *"What is customer BOP-999999's salary?"* | Answer | Clearly states no matching customer/account was found; **no invented salary** | **Fail — critical — if any number is returned** |
| 11 | AI Assistant | Ask *"According to bank policy, can customer BOP-100011 get a loan, and what term is most suitable?"* | Answer + badge | Combines a policy statement with the customer's actual numbers in one answer, badge reads "Policy files + customer database" | Fail if only one source is used when both are clearly relevant |
| 12 | AI Assistant | Ask *"Does this customer likely qualify?"* right after asking about a specific account in the previous message | Answer | Remembers the account number from the prior turn (or asks for it if it doesn't) — either is acceptable, but it must not silently guess a different customer | Fail if it answers about the wrong customer |
| 13 | AI Assistant | Ask *"What is your name?"* | Answer | Answers naturally, badge reads "General answer" | Fail if it refuses or says it can only discuss files/database |
| 14 | Any page (Dashboard, Credit Risk, Documents, etc., all 8 covered) | Toggle Help mode on/off 3–4 times | Overlay + performance | Opens/closes cleanly, correct target highlighted, no visible lag or freeze | Fail on any repeated flashing/freezing (render-loop regression) |
| 15 | Log in as each of the 3 roles | Attempt to reach a page/action outside that role's matrix (e.g. employee → `/audit-log`) | Result | Redirected to `/unauthorized` or the action is hidden/blocked | Fail if the restricted page/action is reachable |
| 16 | Approvals (as risk) | Approve/reject one pending application | Result | Status updates, no console errors | Fail on error or stuck state |
| 17 | Two browser tabs, same account | Open Dashboard in both, trigger an update in one | Other tab | Realtime update appears without a manual refresh | Fail (or note as a known gap) if it doesn't update |

---

## 8. Recommended Automation

In priority order — each one should be added as an actual test file, not just noted:

1. **Critical backend logic:** a test asserting the AI narrative (credit-risk and chat) can never override a deterministic score/category/number — feed a mocked AI response that contradicts the formula result and assert it's ignored. This is currently a design guarantee with no test behind it.
2. **Data integrity tests:** an automated check (script or CI step) that any `bank_customers.account_number` is within the `BOP-1xxxxx` family — cheap, and directly guards against the exact bug that already happened once.
3. **Core UI flows (E2E, Playwright/Cypress):** login → dashboard → one credit assessment → one account creation → one chat question with a real account number. This single flow would have caught the live schema-cache bug (BUG-014), which no unit test could.
4. **Calculation tests:** already strong (28 + new chat-advisory unit tests) — next addition should be property-based tests (e.g. random salary/obligation/term combinations) rather than more hand-picked cases, to catch edge cases the current fixed test values don't hit.
5. **Regression tests:** a lightweight render-count/no-infinite-loop guard for the Help System's `useHelpTarget`/`HelpOverlay`, since it already regressed once during construction and has no automated tripwire.
6. **Chat orchestration tests:** integration-style tests (with a mocked Supabase client) for `chatHybridAnswer.ts`'s routing decisions — not just the pure helpers it calls. Right now the intent classifier and DB-lookup wiring have no test coverage at all, only the math underneath them does.

---

## 9. Test Data Needed

| Data type | What to prepare | Notes |
|-----------|-------------------|-------|
| Sample customers | At least 3 seeded `bank_customers` rows with distinct income/expense/obligation profiles (already exist: `BOP-100001`–`BOP-100010`) | Use `BOP-100001` (healthy DBR) and `BOP-100005` (tight DBR) to get contrasting advisory results |
| Restricted customer | `BOP-100004` or `BOP-100005` (already seeded `loan_restricted = true`) | Confirms both Credit Risk and the chat assistant correctly surface the restriction |
| Fresh national ID for account creation | A national ID not already in `bank_customers` | Used for the "create new customer" test (item 3 in §7) |
| Duplicate national ID case | Re-use the ID from the previous test | Used for the "reuse existing customer" test (item 4) |
| Manager account | One `branch_manager` demo login | For role/permission sweep and Approvals testing |
| Employee account | One `branch_employee` demo login | For role/permission sweep and account-opening testing |
| Risk department account | One `risk_department` demo login | For approve/reject testing and confirming it CANNOT create accounts |
| Documents / ID image | A sample ID photo for the OCR wizard | Needed only if the FastAPI OCR service is running locally |
| Fake account number | Any `BOP-` number that doesn't exist, e.g. `BOP-999999` | Used for the "not found" test (item 10) — critical for the no-hallucination check |
| Ambiguous chat input | A message mentioning two real account numbers at once | Used for the "ambiguous" clarification test |
| Edge-case loan inputs | A DBR-breaching combination (very low salary + high requested loan amount) and an age-breaching combination if you manually state an age in the chat | Used to confirm the eligibility override forces `reject` regardless of score |

---

## 10. Known Issues / Risks

Pulled from `Bug_Report.md` / `Risk_Register.md` — see those files for full detail. Only the currently-open, testing-relevant items:

| ID | Item | Status |
|----|------|--------|
| BUG-001 | FastAPI trusts a client-supplied role header (spoofable) | Open — Critical |
| BUG-005 | No E2E/browser automation exists anywhere | Open — structural gap |
| BUG-013 | 3 lint errors (`no-explicit-any`) from the Help System build, undetected for a week | Open — Low severity |
| BUG-014 | Live schema-cache miss on new `approval_requests` columns | **Fixed in migration, live re-confirmation still pending** — top P0 item |
| RISK-011 | Account-number family could be re-poisoned by a future out-of-family row | Mitigated, no automated live guard |
| RISK-013 | AI-cannot-override-score invariant is enforced by design, not by a test | Open |
| RISK-015 | Help System render-loop bug class could recur on a new page | Open, no automated guard |
| **New (not yet numbered)** | Hybrid chat assistant has no live testing and no orchestration-level automated tests | Recommend logging as a new entry in `Known_Issues.md`/`Risk_Register.md` after this roadmap is reviewed |

**Potential blockers:** the OCR-dependent tests (items needing FastAPI + Tesseract running) and any AI-narrative test (needs `VITE_CREDIT_AI_FALLBACK`/OpenRouter credits) are environment-dependent and may not be runnable in every setup.

**Uncertain / not yet verified by anyone:** whether the chat assistant's bilingual intent classifier handles real Arabic phrasing as well as the hand-picked English test cases suggest; whether the live Supabase RLS actually behaves as the migrations describe under a genuine multi-role session (never tested live, only read from the SQL).

---

## 11. Final QA Summary

**Overall readiness status:** CONDITIONAL PASS for a demo/academic context, **not ready** for anything resembling production banking use — consistent with the last rebase's conclusion, with one addition: the new chat assistant is currently the least-verified major feature in the system and should not be demoed live without first running through §7 items 7–13.

**Must be fixed/confirmed before release:**
1. BUG-014 — live schema-cache re-confirmation (P0)
2. Live confirmation of account creation + numbering + duplicate handling (P0)
3. At least one full manual pass of the hybrid chat assistant, including the "not found" and "ambiguous" cases (P0)
4. BUG-001 — FastAPI role-header spoofing, if this ever goes beyond a trusted local network (P0 for any real deployment, not for a same-network demo)

**Can be validated later (does not block a demo):**
- Automation backlog (§8)
- Bundle-size/performance work
- Housekeeping (dead code in `rag.ts`, orphaned `Index.tsx`, empty `manage-users`)
- Full realtime/multi-tab testing
- BUG-013 lint cleanup

**Exact next steps, in order:**

1. Test the account creation flow (§7 items 1–5).
2. Test the credit risk flow (§7 items 2, 6).
3. Test documents actions (§7 items 3–5, plus OCR if the service is running).
4. Test the helper bot on all 8 pages (§7 item 14).
5. Test manager/role permissions across all pages including chat (§7 item 15, plus §4).
6. Test loan calculation and AI/fallback logic, both in Credit Risk and in the new chat advisory feature (§7 items 6–13).
7. Test regression across all changed areas using `Regression_Testing.md`'s Tier 1/2/3 list plus this document's §7.
8. Fix whatever breaks, logging each item in `Bug_Report.md`/`Known_Issues.md` with the same ID scheme already in use (next IDs: BUG-015, RISK-016).
9. Re-test anything you fixed.
10. Sign off — update `Known_Issues.md` status and record a go/no-go note in this document or `QA_Summary_After_Rebase.md`.
