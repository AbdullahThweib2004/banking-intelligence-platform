# Regression Testing Report

**Date:** 2026-07-06  
**Release under test:** Graduation build (post UI redesign + AI fix)

## Regression scope

Areas changed recently (from development history) that require re-verification:

| Change area | Risk | Regression tests |
|-------------|------|------------------|
| Dashboard recent activity | Medium | TC-DASH-04, TC-DASH-05 |
| AI credit assessment path | High | TC-CR-05, TC-CR-09 |
| Credit Risk UI (Info button removed) | Low | TC-CR-UI-01 |
| UI redesign (Dashboard, Credit, Documents) | Medium | TC-UI-04–06 |
| FastAPI OCR pipeline | Medium | TC-DOC-07–12 |

## Automated regression suite

| Suite | Command | Last run | Result |
|-------|---------|----------|--------|
| Unit (roles + scoring) | `npm test` | 2026-07-06 | **9/9 PASS** |
| Production build | `npm run build` | 2026-07-06 | **PASS** |
| Lint | `npm run lint` | 2026-07-06 | **FAIL** (3 errors) |

## Manual regression checklist (for demo rehearsal)

### Smoke (15 min)

- [ ] Login as each demo user
- [ ] Dashboard loads stats + 5 recent activities
- [ ] New credit assessment for BOP-100001 completes
- [ ] Risk user approves/rejects one application
- [ ] Upload and delete a document
- [ ] AI Assistant answers one policy question
- [ ] Language toggle EN ↔ AR

### Full regression (2–3 hr)

See `Test_Cases.md` — 96 cases; 68 blocked without live env.

## Known regression risks (no E2E automation)

| Risk | Mitigation |
|------|------------|
| UI refactor broke dialogs | Manual smoke on Credit Risk objection flow |
| Realtime duplicate events | Manual test with two browser tabs |
| Role change without re-login | Test BUG-002 scenario |

## Result

**Automated regression: PASS** (9 unit tests + build).  
**Full UI regression: NOT EXECUTED** — requires manual pass before viva.
