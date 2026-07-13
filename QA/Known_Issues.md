# Known Issues

**Date (rebased):** 2026-07-13
**Status:** Active — supersedes the 2026-07-06 version. See `Change_Impact_Assessment.md` for full context on what changed.

## Confirmed defects (active)

See `Bug_Report.md` for full reproduction steps. Summary:

| ID | Severity | Summary |
|----|----------|---------|
| BUG-001 | Critical | FastAPI X-User-Role spoofable |
| BUG-002 | High | JWT role desync from profiles |
| **BUG-014** | **High** | **Live: "age_at_maturity column not found in schema cache" on new assessment — fix applied, live re-confirmation pending (top manual-test priority)** |
| BUG-003 | Medium | Dashboard module cards hardcoded KPIs |
| BUG-005 | Medium | No E2E test framework |
| BUG-008 | Medium | OpenRouter credit dependency |
| BUG-004 | Low | Debug console.log in useStats |
| BUG-006 | Low | ESLint errors fail lint gate — now 6, not 3 (see BUG-013) |
| **BUG-013** | **Low** | **New: 3 `no-explicit-any` casts in `CreditRisk.tsx` introduced by the Help System build (2026-07-07), previously undocumented** |
| BUG-007 | Low | Orphan Index.tsx not routed |
| BUG-009 | Low | CORS wildcard (accepted for demo) |
| BUG-010 | Low | Large JS bundle, now 957.39 kB / 281.39 kB gzip (was 896.69 KB / 262.59 KB) |
| BUG-011 | Low | creditScoring logs full payload to console |
| BUG-012 | Low | Approvals route not ProtectedRoute (by design) |

## Resolved this cycle (moved out of "active", kept for history)

These were found and fixed during the account-creation and loan-engine work and are **not** active issues, but are recorded here so the rebase doesn't silently drop the history:

| Issue | Resolution |
|-------|------------|
| Sequential account numbering produced `BOP-200013` instead of continuing `BOP-100010`→`BOP-100011` | Root-caused to an unexplained out-of-family `BOP-200012` row poisoning the sequence fast-forward regex; fixed by narrowing the regex to the `BOP-1xxxxx` family (`20260711120000_fix_bank_customers_account_sequence.sql`); re-verified in a throwaway Docker container. |
| Duplicate national ID on retry surfaced a hard error instead of reusing the existing customer | Fixed via `findOrCreateBankCustomerFromAccountOpening()` (check-first, catch-and-refetch-on-race pattern). |

## Limitations (not bugs) — updated

| Item | Description |
|------|-------------|
| SRS file | No standalone SRS document in repo; baseline reconstructed in `SRS_Baseline.md` |
| ~~Demo data~~ **Account creation is now a live write path** | **Invalidated baseline assumption:** `bank_customers` BOP-100001–010 remain seeded demo accounts, but the app can now insert real new customers via the Open New Account flow — this is no longer a read-only demo dataset. See PRB-029–031. |
| AI dependency | Credit assessment narrative and policy search require OpenRouter API. **Current environment fact:** `.env` has `VITE_CREDIT_AI_FALLBACK=false`, so the AI-narrative ("hybrid") path is currently disabled by configuration in this environment, not just by API availability — every assessment here runs the deterministic-only (`formula`) path. |
| OCR dependency | Account opening requires local FastAPI + Tesseract + optional WeasyPrint |
| Role re-login | Admin role changes may require user to sign out/in |
| Realtime | Subscription behavior not verified under network interruption; now also covers the new `bank_customers` realtime publication and `useLatestBankCustomer` hook |
| Rate figures are configured, not live | Loan product interest rates (fixed bands, index+margin) and the FX conversion table are static/configured values, explicitly labeled as such in `loanProducts.ts` and the UI — there is no live SOFR/JODIBOR/Prime/FX feed. This was informally true before the refactor; it is now explicit in code and UI copy. |
| Unexplained legacy data anomaly | A pre-existing `BOP-200012`-style row (origin unknown — confirmed via full-repo grep that no code in this repository ever wrote such a value) was found in the account-number space during root-causing of the numbering bug. It is now safely excluded from sequence fast-forward logic by the corrective migration, but its original origin remains unexplained. Not currently a functional risk; noted for awareness only. |
| Orphaned edge function directory | `supabase/functions/manage-users/` is empty (zero files), untracked by git, and directory-dated before the QA baseline (Jun 26). Not referenced anywhere in the frontend. Treated as harmless scaffold debris, same category as BUG-007's orphaned `Index.tsx` — not a new risk surface, not given test coverage. |

## Environment blockers (test execution)

| Blocker | Impact |
|---------|--------|
| Live Supabase credentials | 74 test cases BLOCKED (was 68 — grew with new account-creation/loan-engine live-verification cases) |
| OpenRouter API key / credits, or `VITE_CREDIT_AI_FALLBACK=false` | AI narrative ("hybrid" `result_source`) path tests BLOCKED in this environment specifically, in addition to the general dependency |
| FastAPI server not running in QA sandbox | OCR tests BLOCKED |
| No Playwright/Cypress | Browser E2E BLOCKED |
| No Docker/live DB access for this write-up beyond throwaway containers | Sequential-numbering and concurrency claims are verified in an isolated Docker Postgres container, not the live Supabase project — user must re-confirm live |

## Testability limitations

1. Edge functions require deployed Supabase project or local CLI stack
2. RLS policies need multi-user session testing — not automatable without test harness (now also true for the new `bank_customers` INSERT policy restricted to `branch_employee`/`branch_manager`)
3. OCR quality depends on image input — subjective validation
4. Unit tests use Node strip-types — may differ from browser TS compilation edge cases. Notably, the new `loan*.ts` modules use explicit `.ts` extensions on relative imports specifically to satisfy this constraint, verified compatible with both Vite/tsc (`allowImportingTsExtensions: true`) and the plain Node test runner.

## Deferred risks

- Load testing under concurrent branch users (partially addressed for account creation specifically — 20-way concurrent insert tested in a Docker container; not tested for the rest of the platform)
- Penetration testing by external auditor
- Accessibility (WCAG) audit
- Mobile device physical testing (only responsive CSS reviewed)

## Workarounds for demo

| Issue | Workaround |
|-------|------------|
| BUG-001 | Do not expose FastAPI publicly; demo via trusted local network only |
| BUG-014 | **Re-run the full `20260711130000_loan_assessment_fields.sql` migration in the Supabase SQL Editor before the demo**, then verify with `SELECT column_name FROM information_schema.columns WHERE table_name = 'approval_requests' AND column_name = 'age_at_maturity';` |
| BUG-008 | Ensure OpenRouter credits before viva; set `VITE_CREDIT_AI_FALLBACK=true` if a live AI-narrative demo is wanted (currently `false`) |
| BUG-003 | Do not highlight module overview cards during demo; use top stat cards instead |
| BUG-002 | Re-login demo users after any role change in User Management |

## Sign-off note

These issues are **documented and acceptable for graduation demo** with explicit disclosure. Not acceptable for production banking deployment without remediation. The two live-write features added this cycle (real account creation, real loan-assessment persistence) raise the stakes of BUG-014 specifically — it must be confirmed fixed live before any demo that exercises the credit-risk flow.
