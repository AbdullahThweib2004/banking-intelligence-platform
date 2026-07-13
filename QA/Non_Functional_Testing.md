# Non-Functional Testing Report

**Date:** 2026-07-06; **rebased 2026-07-13**  
**Scope:** NFR-001 through NFR-008 per `SRS_Baseline.md` (was NFR-001–006; +2 this rebase)

## Summary

| NFR ID | Requirement | Method | Result | Notes |
|--------|-------------|--------|--------|-------|
| NFR-001 | Row Level Security | Migration static review | **PASS** | Policies on approval_requests, audit_logs, documents, profiles, **+ new `bank_customers` INSERT policy restricted to branch_employee/branch_manager** |
| NFR-002 | Append-only audit | Policy review | **PASS** | No UPDATE/DELETE on audit_logs |
| NFR-003 | Responsive layout | Code review | **PASS** | Mobile sidebar, Tailwind breakpoints |
| NFR-004 | Production build | `npm run build` | **PASS** | Re-executed 2026-07-13, exit 0 |
| NFR-005 | Credential hygiene | Repo scan | **PASS** | `.env` gitignored; no keys in source |
| NFR-006 | Performance | Bundle analysis | **PARTIAL** | **957.39 kB / 281.39 kB gzip (was 896 KB / 262.59 KB) — grew further, BUG-010 figure updated** |
| **NFR-007** | **Schema-cache consistency after DDL** | Migration review | **PARTIAL** | `NOTIFY pgrst, 'reload schema';` added; live re-confirmation pending (BUG-014) |
| **NFR-008** | **Migration idempotency** | Migration review | **PASS** | All 3 new migrations use `IF NOT EXISTS`/drop-then-recreate |

## Usability (informal)

| Area | Finding | Status |
|------|---------|--------|
| Bilingual EN/AR | LanguageContext toggles labels | Pass (static) |
| Loading states | Skeletons on Dashboard, Credit Risk | Pass (static) |
| Empty states | Recent activity, documents | Pass (static) |
| Error toasts | Sonner used across flows | Pass (static) |
| Onboarding tours | Session-scoped driver.js | Partial (manual) |

## Reliability

| Check | Result |
|-------|--------|
| AI fallback when OpenRouter fails | Implemented (`aiCreditAssessment.ts`) |
| OCR LLM fallback when key missing | Warning logged at API startup |
| Realtime reconnect | Supabase client default behavior — unverified live |

## Maintainability

| Check | Result |
|-------|--------|
| ESLint | **[rebased] 6 errors, 15 warnings** (BUG-006 + new BUG-013 — 3 errors introduced by the Help System build on 2026-07-07, went undocumented for a week) |
| TypeScript strict | Build passes; 6 pre-existing `tsc` errors in `AIChatContext.tsx`, unrelated to any recent work |
| Modular hooks/services | Good separation; **the loan-engine refactor further improved this by decomposing scoring into 5 focused modules (`loanCalculator.ts`, `loanEligibility.ts`, `loanRiskScoring.ts`, `loanExplanation.ts`, `loanProducts.ts`)** |
| Dead code | `Index.tsx` orphan (BUG-007); **new: `supabase/functions/manage-users/` confirmed empty/orphaned, same category, not given test coverage** |

## Scalability (not load-tested)

- No pagination on some large tables (Credit Risk applications list) — risk for production scale
- Single JS bundle — no code splitting (bundle grew further this cycle, now 957.39 kB)
- Supabase RPC `get_platform_stats()` — appropriate for demo scale
- **New: sequential account-number generation via a Postgres sequence is safe under concurrency by construction (atomic `nextval`) — verified with 20 concurrent inserts in a Docker container, zero collisions**

## Conclusion

Non-functional requirements are **adequate for graduation demo**. Performance and scalability need work before production deployment — the bundle-size gap has widened rather than closed since the Jul 6 baseline. The new schema-cache-consistency requirement (NFR-007) needs a live re-confirmation before this section can be marked fully passing — see BUG-014.
