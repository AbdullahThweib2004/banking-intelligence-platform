# Non-Functional Testing Report

**Date:** 2026-07-06  
**Scope:** NFR-001 through NFR-006 per `SRS_Baseline.md`

## Summary

| NFR ID | Requirement | Method | Result | Notes |
|--------|-------------|--------|--------|-------|
| NFR-001 | Row Level Security | Migration static review | **PASS** | Policies on approval_requests, audit_logs, documents, profiles |
| NFR-002 | Append-only audit | Policy review | **PASS** | No UPDATE/DELETE on audit_logs |
| NFR-003 | Responsive layout | Code review | **PASS** | Mobile sidebar, Tailwind breakpoints |
| NFR-004 | Production build | `npm run build` | **PASS** | 3.01s, dist generated |
| NFR-005 | Credential hygiene | Repo scan | **PASS** | `.env` gitignored; no keys in source |
| NFR-006 | Performance | Bundle analysis | **PARTIAL** | 896 KB JS chunk (BUG-010) |

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
| ESLint | 3 errors, 14 warnings (BUG-006) |
| TypeScript strict | Build passes |
| Modular hooks/services | Good separation |
| Dead code | `Index.tsx` orphan (BUG-007) |

## Scalability (not load-tested)

- No pagination on some large tables (Credit Risk applications list) — risk for production scale
- Single JS bundle — no code splitting
- Supabase RPC `get_platform_stats()` — appropriate for demo scale

## Conclusion

Non-functional requirements are **adequate for graduation demo**. Performance and scalability need work before production deployment.
