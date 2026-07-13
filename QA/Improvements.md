# Improvements Recommendations

**Date:** 2026-07-06; **rebased 2026-07-13** — items 31–35 added below  
**Priority:** P0 = before production; P1 = before pilot; P2 = nice-to-have

## Product improvements

| # | Improvement | Priority | Effort |
|---|-------------|----------|--------|
| 1 | Wire dashboard module overview KPIs to live stats or remove section | P1 | Low |
| 2 | Paginate large tables (applications, documents, audit log) | P1 | Medium |
| 3 | Show AI fallback reason prominently in assessment result UI | P2 | Low |
| 4 | Add duplicate assessment warning for same customer within session | P2 | Medium |

## UX improvements

| # | Improvement | Priority | Effort |
|---|-------------|----------|--------|
| 5 | Consistent empty-state illustrations across modules | P2 | Low |
| 6 | Progress indicator on multi-step account opening wizard | P2 | Low |
| 7 | Confirm dialog before deleting documents | P2 | Low |
| 8 | Force re-login toast when admin changes user role | P1 | Medium |

## Validation improvements

| # | Improvement | Priority | Effort |
|---|-------------|----------|--------|
| 9 | Max file size validation on document upload (client + server) | P1 | Low |
| 10 | Server-side validation mirror for all credit assessment fields | P1 | Medium |
| 11 | Email format hint on user creation form | P2 | Low |

## Security improvements

| # | Improvement | Priority | Effort |
|---|-------------|----------|--------|
| 12 | **Validate Supabase JWT on FastAPI; load role from profiles** | **P0** | Medium |
| 13 | Sync `user_metadata.role` when admin updates profiles.role | P0 | Medium |
| 14 | Restrict CORS on edge functions to app origin | P1 | Low |
| 15 | Rate-limit credit-assessment and policy-search edge functions | P1 | Medium |
| 16 | Remove debug console.log from useStats and creditScoring | P2 | Low |

## Testability improvements

| # | Improvement | Priority | Effort |
|---|-------------|----------|--------|
| 17 | Add Playwright E2E: login + assessment smoke | **P0** | Medium |
| 18 | pytest suite for FastAPI with auth negative cases | P0 | Medium |
| 19 | Supabase local stack for RLS integration tests | P1 | High |
| 20 | CI pipeline: test + build + lint on every PR | P1 | Low |

## Maintainability improvements

| # | Improvement | Priority | Effort |
|---|-------------|----------|--------|
| 21 | Fix 3 ESLint errors (textarea, tailwind.config) | P1 | Low |
| 22 | Remove or route orphan `Index.tsx` | P2 | Low |
| 23 | Vite code-splitting for route-level chunks | P2 | Medium |
| 24 | Centralize API error types in shared module | P2 | Medium |

## Automation improvements

| # | Improvement | Priority | Effort |
|---|-------------|----------|--------|
| 25 | Expand unit tests: modificationReanalysis, serializeRiskExplanation edge cases | P1 | Low |
| 26 | Snapshot tests for role matrix when ROUTE_PERMISSIONS changes | P2 | Low |
| 27 | Lighthouse CI budget (JS < 400 KB gzip) | P2 | Medium |

## Documentation improvements

| # | Improvement | Priority | Effort |
|---|-------------|----------|--------|
| 28 | Add formal SRS.md to repo matching implemented scope | P1 | Medium |
| 29 | Demo rehearsal script linked from README | P2 | Low |
| 30 | Architecture diagram (frontend ↔ Supabase ↔ FastAPI) | P2 | Low |

## New this rebase (2026-07-13)

| # | Improvement | Priority | Effort |
|---|-------------|----------|--------|
| 31 | **Re-confirm the `age_at_maturity` schema-cache fix live and add a post-migration smoke check to the deploy routine (BUG-014)** | **P0** | Low |
| 32 | **Add an automated regression test asserting AI narrative can never override the deterministic score/category/eligibility (currently a design guarantee only, RISK-013)** | P0 | Medium |
| 33 | **Add a lightweight render-count/no-infinite-loop guard test for the Help System's `useHelpTarget`/`HelpOverlay` (already regressed once, RISK-015)** | P1 | Low |
| 34 | **Fix the 3 new `no-explicit-any` ref casts in `CreditRisk.tsx` introduced by the Help System build (BUG-013)** | P2 | Low |
| 35 | **Add a periodic live audit query for any `bank_customers.account_number` outside the `BOP-1xxxxx` family, as a cheap ongoing guard against the numbering bug class recurring (RISK-011)** | P1 | Low |
| 36 | Remove or clean up the empty, untracked `supabase/functions/manage-users/` directory | P2 | Low |
| 37 | Add Playwright/Cypress smoke coverage for the two new live-write flows (account creation, loan assessment submission) — unit tests alone did not catch BUG-014 | **P0** | Medium |

## Recommended sprint order (graduation → pilot)

1. **Week 1:** Items 12, 13, 17, 21, **31** (security + smoke E2E + lint + live schema-cache re-confirmation)
2. **Week 2:** Items 1, 9, 18, 20, **37** (data accuracy + API tests + CI + new-flow E2E)
3. **Week 3:** Items 8, 14, 19, 23, **32, 33** (role UX + integration tests + performance + regression-test hardening for the new invariants)
