# Risk Register

**Date:** 2026-07-06  
**Project:** Bank of Palestine Intelligence Platform

| Risk ID | Category | Description | Likelihood | Impact | Mitigation | Owner | Status |
|---------|----------|-------------|:----------:|:------:|------------|-------|--------|
| RISK-001 | Security | FastAPI accepts forged X-User-Role (BUG-001) | High | Critical | JWT validation on API | Dev team | **Open** |
| RISK-002 | Security | JWT role desync from profiles (BUG-002) | Medium | High | Sync metadata on role change | Dev team | **Open** |
| RISK-003 | Operational | OpenRouter credit exhaustion breaks AI path | Medium | Medium | Monitor credits; fallback flag | Ops | Mitigated |
| RISK-004 | Quality | No E2E test suite — UI regressions undetected | High | Medium | Add Playwright smoke tests | QA | **Open** |
| RISK-005 | Data | Stale role in session after admin change | Medium | High | Force re-auth on role update | Dev team | **Open** |
| RISK-006 | Performance | 896 KB JS bundle slows first load | Low | Low | Code splitting | Dev team | **Open** |
| RISK-007 | Compliance | Audit log relies on RLS only — no external SIEM | Low | Medium | Export pipeline for production | Ops | Accepted (demo) |
| RISK-008 | Integration | OCR API unavailable breaks account wizard | Medium | Medium | Health check + user message | Dev team | Partial |
| RISK-009 | Data integrity | No dedup on duplicate assessments | Low | Low | Unique constraint if needed | Dev team | Accepted |
| RISK-010 | External | Supabase project outage | Low | Critical | SLA monitoring for production | Ops | Accepted (demo) |

## Risk heat map

```
Impact →
         Low    Medium   High    Critical
Likelihood
High     R006   R004              R001
Medium   R009   R003,R008         R002,R005
Low      —      R007              R010
```

## Top 3 risks for graduation viva disclosure

1. **RISK-001** — API authorization is client-trust based (documented fix in Bug_Report)
2. **RISK-004** — Testing relies on static analysis + 9 unit tests; manual demo required
3. **RISK-003** — AI features depend on third-party API credits

## Residual risk after demo fixes

Even with BUG-001 fixed, production would require: penetration test, E2E suite, load testing, and operational monitoring.
