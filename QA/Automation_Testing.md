# Automation Testing Report

**Date:** 2026-07-06; **rebased 2026-07-13**

## Existing automated tests (before QA audit)

| Location | Framework | Count | Status |
|----------|-----------|------:|--------|
| — | — | 0 | None found |

## Tests added during QA audit (baseline)

| File | Framework | Count | Command |
|------|-----------|------:|---------|
| `src/lib/__tests__/qa.test.ts` | Node.js built-in test runner | 9 | `npm test` |

## Tests added this rebase (2026-07-13)

| File | Framework | Count | Command |
|------|-----------|------:|---------|
| `src/lib/__tests__/loanEngine.test.ts` | Node.js built-in test runner | 28 | `npm test` (glob now covers `src/lib/__tests__/*.test.ts`) |

**Total automated tests: 37** (was 9), across **8 suites** (was 1).

### Test coverage detail — baseline suite (updated where result values changed)

| Suite | Test | Requirement | Result |
|-------|------|-------------|--------|
| roles | allows all roles on dashboard | PRB-001, PRB-004 | **PASS** |
| roles | restricts audit-log to risk | PRB-001, PRB-019 | **PASS** |
| roles | restricts user-management to manager | PRB-001, PRB-020 | **PASS** |
| roles | account opening excludes risk role | PRB-015 | **PASS** |
| creditScoring | `estimateMonthlyLoanPayment` zero principal payment | PRB-009 | **PASS** |
| creditScoring | score in 0-100 range | PRB-009, PRB-034 | **PASS** |
| creditScoring | weak > strong risk score | PRB-009, PRB-034 | **PASS** |
| creditScoring | `serializeRiskExplanation` uses the **formula** source (was: "algorithm") | PRB-010 | **PASS** — **assertion updated this cycle to match the `result_source` taxonomy shift (`algorithm`→`formula`)** |
| creditScoring | `buildDerivedFeatures` clamps negatives | PRB-009 | **PASS** |

### New test coverage — `loanEngine.test.ts` (5 describe blocks, 28 tests)

| Describe block | Covers | Requirement |
|-----------------|--------|-------------|
| loanCalculator | EMI/annuity formula, zero/negative-rate edge cases | PRB-033 |
| loanEligibility | DBR cap (50%), age-at-maturity cap (70), combined breach scenarios | PRB-033 |
| loanRiskScoring | Monotonicity of the weighted risk model across DBR/age/term/loan-to-income/obligations factors | PRB-034 |
| loanProducts | Rate resolution per product (Personal/Personal Housing/Mortgage Program) and currency | PRB-033 |
| loanExplanation / creditScoring end-to-end | Deterministic bilingual fallback narrative; full orchestration through `computeCreditScore()` | PRB-036, PRB-009 |

### Last execution (2026-07-13)

```
ℹ tests 37
ℹ suites 8
ℹ pass 37
ℹ fail 0
ℹ duration_ms 162.825448
```

## Build automation

| Command | Result (2026-07-06) | Result (2026-07-13) [rebased] |
|---------|--------|--------|
| `npm run build` | **PASS** (3.01s) | **PASS** (3.94s) |
| `npm run lint` | **FAIL** (3 errors) | **FAIL** (6 errors, 15 warnings — see BUG-013) |
| `npx tsc --noEmit` | not run at baseline | 6 pre-existing errors, all `AIChatContext.tsx`, unrelated |

## Gaps in automation

| Area | Priority | Recommendation |
|------|----------|----------------|
| E2E UI flows | P0 | Add Playwright; cover login + assessment + **[new] account creation + loan assessment submission** |
| FastAPI auth | P0 | pytest + httpx TestClient with forged headers |
| Edge functions | P1 | Deno test or integration against local Supabase |
| RLS policies | P1 | pgTAP or Supabase local multi-user tests — **[new] now also needs to cover the `bank_customers` INSERT policy** |
| Regression CI | P1 | GitHub Actions: test + build + lint |
| **AI-cannot-override-score invariant [new]** | **P0** | Add a test feeding a mocked AI response that contradicts the formula result and assert it's ignored — currently a design guarantee, not a tested one (RISK-013) |
| **Help System render-loop guard [new]** | P1 | Add a lightweight render-count assertion for `useHelpTarget`/`HelpOverlay` — already regressed once during construction (RISK-015) |

## Why Vitest was not used

`npm install vitest` was blocked in sandbox during initial audit. Node built-in test runner with `--experimental-strip-types` was used instead — zero new dependencies. **This cycle's new `loan*.ts` modules were written with explicit `.ts` extensions on relative imports specifically to keep working under this constraint**, verified compatible with both the Node test runner and Vite/tsc (`allowImportingTsExtensions: true`).

## Automation readiness score

| Level | Coverage | Status (2026-07-06) | Status (2026-07-13) [rebased] |
|-------|----------|--------|--------|
| Unit | ~5% of business logic | Minimal | **~15%** — the entire loan-calculation core is now unit-tested; page-level and hook-level code remains untested |
| Integration | 0% | Missing | Still 0% live; **new: 3 scenarios verified in a throwaway Docker Postgres container** (sequencing, concurrency, poisoning-row regression) — a meaningfully stronger evidence tier than pure static review, but explicitly not the same as live integration |
| E2E | 0% | Missing (BUG-005) | Still missing — now covers a larger, higher-stakes surface (two new live-write flows added) |

## Conclusion

**37 meaningful unit tests now passing** (up from 9), plus a new category of container-verified database behavior for the account-creation flow. Broader automation — especially E2E coverage for the two new live-write paths — remains the single highest-priority improvement before production, more so than at the original baseline given the added stakes.
