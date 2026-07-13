# Rebased QA Baseline

**Date:** 2026-07-13
**Supersedes:** the 2026-07-06 baseline captured across `QA_Report.md` / `Test_Plan.md` / `Coverage_Map.md` etc. Those files are being updated in place (not discarded) — this document states what changed about the baseline itself and is the reference point for all Phase 3–7 QA docs in this rebase.
**Source of truth used for this rebase:** the current repository state (code + migrations, read directly), not the prior QA documents. Findings were then mapped back onto `SRS_Baseline.md`. See `Change_Impact_Assessment.md` for the full diff this baseline is built from.

---

## 1. Product scope (current)

Unchanged from baseline: a 3-role (Branch Employee / Branch Manager / Risk Department) internal banking intelligence platform — dashboard, credit-risk assessment, approvals, document upload/OCR, AI assistant, audit log, user management, modification requests. React 18 + TypeScript + Vite frontend, Supabase (Postgres/Auth/RLS/Realtime/Edge Functions) backend, separate FastAPI OCR microservice.

**New/changed since baseline:**
- A Global Help System (contextual "what is this?" overlay) is now present across 8 pages.
- The "Open New Account" flow is a real, live database write (previously effectively a UI mock over static seed rows): OCR-derived customer data → `bank_customers` insert → DB-generated sequential account number (`BOP-1000xx`) → idempotent reuse on duplicate national ID.
- The Credit Risk assessment flow now implements a bank-calculator-style deterministic engine (EMI/annuity, Debt Burden Ratio, age-at-maturity, product/currency-aware rate resolution, weighted risk scoring) with AI reduced to an optional explanation-only layer that can never change the numeric result.

## 2. Assumptions carried forward (still valid)

- No standalone SRS document exists in the repo; `SRS_Baseline.md` remains the reconstructed requirement source.
- Rate figures (fixed bands, index+margin, FX table) remain **configured, not live-fed** — there is no real SOFR/JODIBOR/Prime/FX integration. This was true before the refactor (informally) and remains explicitly true and now explicitly labeled in code (`loanProducts.ts`) and UI (`LoanRiskInfoPopover.tsx`).
- AI features (credit narrative, policy search, assistant) depend on a third-party API (OpenRouter) and remain optional/best-effort by design.
- OCR/account-opening depends on the local FastAPI + Tesseract service being reachable; unavailability degrades gracefully to manual entry (unchanged).
- This session has no live Supabase credentials, no live AI key, and no browser — dynamic/live verification remains BLOCKED exactly as it was at the original baseline, for the same reason (environment limitation, not a new regression).

## 3. Assumptions invalidated by the rebase

See `Change_Impact_Assessment.md` §5 for the full list. Summary: `bank_customers` is no longer static seed data; `result_source` is a 4-value enum, not 2; credit scoring is a decomposed, independently-testable pipeline, not one opaque function; "AI cannot affect the number" is now an enforced architectural invariant; bundle size and lint-error-count baselines were stale and are corrected.

## 4. Testing objectives after the rebase

1. Confirm the two new live-write paths (bank customer creation, loan assessment persistence) are correct, idempotent, and safe under concurrency and partial-migration states — these did not exist as live paths at the original baseline and carry the highest regression risk.
2. Confirm the deterministic engine (`loanCalculator.ts` / `loanEligibility.ts` / `loanRiskScoring.ts`) produces mathematically correct, monotonic results independent of whether AI is enabled — verified today by unit test (28 new tests, all passing), not yet by a live end-to-end run in this session.
3. Confirm the AI-explanation layer degrades gracefully — this environment currently runs with AI narrative **disabled** (`VITE_CREDIT_AI_FALLBACK=false`), so the "AI succeeds → hybrid" path is unexercised here; the "AI disabled/fails → formula-only fallback with correct wording" path is the one actually exercisable and should be the primary manual-test focus before demo.
4. Confirm the Global Help System doesn't regress page performance or interaction (the infinite-render-loop bug class it already had once) on any of its 8 covered pages, and correctly coexists with the onboarding tour.
5. Re-sweep all previously-passing areas (Auth, RBAC, Dashboard, Audit Log, User Management, Approvals) for any breakage caused by the widened `approval_requests` schema, even though their own code did not change — a schema change is a valid trigger for regression on unrelated readers.
6. Maintain the same evidence discipline as the original baseline: nothing is marked PASS without either automated-test or code-inspection evidence; anything requiring a live credentialed session is marked BLOCKED, not assumed.

## 5. What this baseline does NOT claim

- It does not claim the live Supabase migrations have been applied to any real project — the user applies migrations themselves via the SQL Editor by established preference (confirmed twice this project). QA evidence here is code/migration-file correctness, not "confirmed live in production."
- It does not claim the AI narrative path has been exercised against a real OpenRouter call in this session.
- It does not claim any new E2E/browser automation exists — `Automation_Testing.md`'s baseline gap (no Playwright/Cypress suite) is unchanged.

## 6. Reference

Full change inventory: `Change_Impact_Assessment.md`. Regression suite: `Regression_Testing.md`. Traceability: `Requirements_Traceability_Matrix.md`. Executive summary: `QA_Summary_After_Rebase.md`.
