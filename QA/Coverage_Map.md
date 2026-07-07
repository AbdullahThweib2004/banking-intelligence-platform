# Coverage Map

**Date:** 2026-07-06

## Requirement coverage

| Req group | Total | Fully verified | Partial | Blocked | Fail |
|-----------|------:|---------------:|--------:|--------:|-----:|
| PRB (functional) | 28 | 8 | 16 | 2 | 2 |
| NFR (non-functional) | 6 | 5 | 1 | 0 | 0 |
| **Total** | **34** | **13** | **17** | **2** | **2** |

## Module coverage

| Module | Routes | Static review | Unit tests | E2E | Coverage % |
|--------|--------|:-------------:|:----------:|:---:|-----------:|
| Auth | /auth | ✅ | — | ❌ | 40% |
| Dashboard | /dashboard | ✅ | — | ❌ | 50% |
| Credit Risk | /credit-risk | ✅ | ✅ (scoring) | ❌ | 55% |
| Approvals | /approvals | ✅ | — | ❌ | 35% |
| Documents | /documents | ✅ | — | ❌ | 40% |
| AI Assistant | /ai-assistant | ✅ | — | ❌ | 30% |
| Audit Log | /audit-log | ✅ | ✅ (roles) | ❌ | 60% |
| User Management | /user-management | ✅ | ✅ (roles) | ❌ | 45% |
| Modification Requests | /modification-requests | ✅ | — | ❌ | 35% |
| FastAPI OCR | external | ✅ | ❌ | ❌ | 25% |
| Edge Functions | external | ✅ | ❌ | ❌ | 20% |

*Coverage % = weighted estimate: static (40%) + unit (30%) + E2E (30%)*

## Test type coverage

| Test type | Planned | Executed | Pass rate |
|-----------|--------:|---------:|----------:|
| Unit | 9 | 9 | 100% |
| Static / code review | 34 reqs | 34 | 88% compliant |
| Integration | 20 | 0 | — |
| E2E | 68 | 0 | — |
| Security | 12 | 10 | 80% |
| Performance | 5 | 2 | Partial |

## Code path coverage (automated)

| File | Lines (approx) | Covered by UT |
|------|---------------:|:-------------:|
| src/lib/roles.ts | ~80 | ✅ Partial (canAccess, canOpenAccount) |
| src/lib/creditScoring.ts | ~400 | ✅ Partial (5 functions) |
| src/pages/*.tsx | ~8000+ | ❌ |
| backend/**/*.py | ~2000+ | ❌ |
| supabase/functions/* | ~600+ | ❌ |

## Gaps (untested critical paths)

1. Full credit assessment INSERT + Realtime update
2. Document upload → storage → delete persistence
3. OCR wizard end-to-end
4. admin-users create/delete user
5. RLS enforcement with live JWT per role

## Map to deliverables

| Artifact | Reference |
|----------|-----------|
| Requirements → tests | `Requirements_Traceability_Matrix.md` |
| Test cases | `Test_Cases.md` (96 cases) |
| Defects | `Bug_Report.md` (12 items) |
| Automation | `Automation_Testing.md` |
