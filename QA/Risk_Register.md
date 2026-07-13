# Risk Register

**Date (rebased):** 2026-07-13 — RISK-001–010 carried forward from the 2026-07-06 baseline (figures updated where stale); RISK-011–015 added this rebase. See `Change_Impact_Assessment.md` for full context.
**Project:** Bank of Palestine Intelligence Platform

| Risk ID | Category | Description | Likelihood | Impact | Mitigation | Owner | Status |
|---------|----------|-------------|:----------:|:------:|------------|-------|--------|
| RISK-001 | Security | FastAPI accepts forged X-User-Role (BUG-001) | High | Critical | JWT validation on API | Dev team | **Open** |
| RISK-002 | Security | JWT role desync from profiles (BUG-002) | Medium | High | Sync metadata on role change | Dev team | **Open** |
| RISK-003 | Operational | OpenRouter credit exhaustion breaks AI path | Medium | Medium | Monitor credits; fallback flag | Ops | Mitigated |
| RISK-004 | Quality | No E2E test suite — UI regressions undetected | High | Medium | Add Playwright smoke tests | QA | **Open** |
| RISK-005 | Data | Stale role in session after admin change | Medium | High | Force re-auth on role update | Dev team | **Open** |
| RISK-006 | Performance | JS bundle slows first load — **updated: 957.39 kB / 281.39 kB gzip (was 896 KB)** | Low | Low | Code splitting | Dev team | **Open** |
| RISK-007 | Compliance | Audit log relies on RLS only — no external SIEM | Low | Medium | Export pipeline for production | Ops | Accepted (demo) |
| RISK-008 | Integration | OCR API unavailable breaks account wizard | Medium | Medium | Health check + user message | Dev team | Partial |
| RISK-009 | Data integrity | No dedup on duplicate assessments (distinct from customer dedup — see RISK-011, which IS now handled) | Low | Low | Unique constraint if needed | Dev team | Accepted — still open, unaffected by this cycle |
| RISK-010 | External | Supabase project outage | Low | Critical | SLA monitoring for production | Ops | Accepted (demo) |
| **RISK-011** | **Data integrity** | **Sequential account-number generation could be re-poisoned by a future out-of-family row, repeating the BOP-200013 bug class** | Low (mitigated) | Critical | Regex restricted to `BOP-1xxxxx` family in `20260711120000_fix_bank_customers_account_sequence.sql`; verified in a Docker container reproducing the exact poisoning scenario | Dev team | Mitigated — recommend a periodic live audit query for any `bank_customers.account_number` outside the expected family as a cheap ongoing safeguard |
| **RISK-012** | **Data integrity** | **Live schema-cache lag after a DDL migration can cause "column not found" errors on brand-new columns (BUG-014)** | Medium | High | `NOTIFY pgrst, 'reload schema';` appended to the migration | Dev team | Fixed in code; live re-confirmation pending — highest-priority open item in this rebase |
| **RISK-013** | **Business logic** | **AI narrative layer could, if a future change is made carelessly, be allowed to influence the numeric score/category/eligibility instead of only explaining it** | Low | Critical | Architecture enforces formula-first-always, AI-additive-only, verified by code inspection; recommend a permanent regression test (e.g. "AI response with a contradicting score is ignored") be added to the automated suite rather than relying on convention alone | Dev team | Open (mitigated by design, not yet by an enforcing test) |
| **RISK-014** | **Concurrency** | **Concurrent Open New Account submissions could produce duplicate/colliding account numbers under real production load (only tested to 20-way in a container)** | Low | Critical | Postgres sequence (atomic `nextval`) makes collisions structurally impossible regardless of concurrency level; the container test is confirmatory, not the sole safeguard | Dev team | Mitigated |
| **RISK-015** | **Code quality** | **Global Help System's hit-testing/re-render logic is a bug-prone pattern (already caused one infinite-render-loop incident during construction) and could regress silently on future page additions** | Medium | Medium | Content-keyed effects + memoized context value fix applied; no automated test guards against reintroduction | QA | Open — recommend adding a lightweight render-count assertion if the Help System gains automated test coverage |

## Risk heat map (rebased)

```
Impact →
         Low    Medium        High         Critical
Likelihood
High     R006   R004                       R001
Medium   R009   R003,R008,R015 R002,R005,R012
Low      —      R007           —           R010,R011,R013,R014
```

## Top risks for graduation viva disclosure (rebased)

1. **RISK-001** — API authorization is client-trust based (documented fix in Bug_Report)
2. **RISK-012 / BUG-014** — the live loan-assessment schema-cache error is fixed in code but **not yet re-confirmed live** — this is the single most urgent open item before demoing the credit-risk flow
3. **RISK-004** — Testing relies on static analysis + unit tests (37, up from 9); manual demo required, no E2E suite
4. **RISK-013** — AI cannot currently override the deterministic score/category by architecture, but this invariant is enforced by convention/code-structure, not by an automated regression test
5. **RISK-003** — AI features depend on third-party API credits, and are currently disabled entirely in this environment (`VITE_CREDIT_AI_FALLBACK=false`)

## Residual risk after demo fixes

Even with BUG-001 and BUG-014 fixed, production would require: penetration test, E2E suite, load testing beyond the 20-way container test, operational monitoring, and a live re-confirmation pass across every Tier 1 item in `Regression_Testing.md` — none of which this session's static/container-based verification can substitute for.
