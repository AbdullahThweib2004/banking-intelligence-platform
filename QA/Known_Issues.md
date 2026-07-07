# Known Issues

**Date:** 2026-07-06  
**Status:** Active at QA audit completion

## Confirmed defects

See `Bug_Report.md` for full reproduction steps. Summary:

| ID | Severity | Summary |
|----|----------|---------|
| BUG-001 | Critical | FastAPI X-User-Role spoofable |
| BUG-002 | High | JWT role desync from profiles |
| BUG-003 | Medium | Dashboard module cards hardcoded KPIs |
| BUG-004 | Low | Debug console.log in useStats |
| BUG-005 | Medium | No E2E test framework |
| BUG-006 | Low | ESLint 3 errors fail lint gate |
| BUG-007 | Low | Orphan Index.tsx not routed |
| BUG-008 | Medium | OpenRouter credit dependency |
| BUG-009 | Low | CORS wildcard (accepted for demo) |
| BUG-010 | Low | Large JS bundle >500 KB |
| BUG-011 | Low | creditScoring logs full payload to console |
| BUG-012 | Low | Approvals route not ProtectedRoute (by design) |

## Limitations (not bugs)

| Item | Description |
|------|-------------|
| SRS file | No standalone SRS document in repo; baseline reconstructed in `SRS_Baseline.md` |
| Demo data | bank_customers BOP-100001–010 are seeded demo accounts only |
| AI dependency | Credit assessment and policy search require OpenRouter API |
| OCR dependency | Account opening requires local FastAPI + Tesseract + optional WeasyPrint |
| Role re-login | Admin role changes may require user to sign out/in |
| Realtime | Subscription behavior not verified under network interruption |

## Environment blockers (test execution)

| Blocker | Impact |
|---------|--------|
| Live Supabase credentials | 68 test cases BLOCKED |
| OpenRouter API key / credits | AI path tests BLOCKED |
| FastAPI server not running in QA sandbox | OCR tests BLOCKED |
| No Playwright/Cypress | Browser E2E BLOCKED |

## Testability limitations

1. Edge functions require deployed Supabase project or local CLI stack
2. RLS policies need multi-user session testing — not automatable without test harness
3. OCR quality depends on image input — subjective validation
4. Unit tests use Node strip-types — may differ from browser TS compilation edge cases

## Deferred risks

- Load testing under concurrent branch users
- Penetration testing by external auditor
- Accessibility (WCAG) audit
- Mobile device physical testing (only responsive CSS reviewed)

## Workarounds for demo

| Issue | Workaround |
|-------|------------|
| BUG-001 | Do not expose FastAPI publicly; demo via trusted local network only |
| BUG-008 | Ensure OpenRouter credits before viva; set `VITE_CREDIT_AI_FALLBACK=true` |
| BUG-003 | Do not highlight module overview cards during demo; use top stat cards instead |
| BUG-002 | Re-login demo users after any role change in User Management |

## Sign-off note

These issues are **documented and acceptable for graduation demo** with explicit disclosure. Not acceptable for production banking deployment without remediation.
