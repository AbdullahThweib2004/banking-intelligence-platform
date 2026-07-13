# Coverage Map

**Date:** 2026-07-06; **rebased 2026-07-13**

## Requirement coverage

| Req group | Total | Fully verified | Partial | Blocked | Fail |
|-----------|------:|---------------:|--------:|--------:|-----:|
| PRB (functional) | 38 (was 28) | 12 (was 8) | 22 | 2 | 2 |
| NFR (non-functional) | 8 (was 6) | 6 (was 5) | 2 | 0 | 0 |
| **Total** | **46** (was 34) | **18** (was 13) | **24** | **2** | **2** |

*Note: the RTM's own row count is 44 (34 carried forward + 10 new PRB/NFR rows); this table's 46 reflects PRB-029–038 (10) + NFR-007–008 (2) = 12 new items added to the prior 34, consistent with the RTM.*

## Module coverage

| Module | Routes | Static review | Unit tests | E2E | Coverage % |
|--------|--------|:-------------:|:----------:|:---:|-----------:|
| Auth | /auth | ✅ | — | ❌ | 40% |
| Dashboard | /dashboard | ✅ | — | ❌ | 50% |
| Credit Risk | /credit-risk | ✅ | ✅ (scoring + **loan engine, 28 new tests**) | ❌ | **65%** (was 55%) |
| Approvals | /approvals | ✅ | — | ❌ | 35% |
| Documents | /documents | ✅ | — | ❌ | **45%** (was 40% — now includes a container-verified real write path) |
| AI Assistant | /ai-assistant | ✅ | — | ❌ | 30% |
| Audit Log | /audit-log | ✅ | ✅ (roles) | ❌ | 60% |
| User Management | /user-management | ✅ | ✅ (roles) | ❌ | 45% |
| Modification Requests | /modification-requests | ✅ | — | ❌ | 35% |
| FastAPI OCR | external | ✅ | ❌ | ❌ | 25% |
| Edge Functions | external | ✅ | ❌ | ❌ | 20% |
| **Help System [new]** | 8 pages | ✅ | — | ❌ | 30% |
| **Account Opening / bank_customers [new]** | via Documents | ✅ | ❌ (container-tested, not unit) | ❌ | **35%** — highest-confidence non-unit evidence in the project (Docker container proof), still no live or E2E confirmation |

*Coverage % = weighted estimate: static (40%) + unit (30%) + E2E (30%)*

## Test type coverage

| Test type | Planned | Executed | Pass rate |
|-----------|--------:|---------:|----------:|
| Unit | 37 (was 9) | 37 | 100% |
| Static / code review | 46 reqs (was 34) | 46 | 88% compliant (unchanged ratio) |
| Integration | 20 | 0 | — |
| E2E | 74 (was 68) | 0 | — |
| Security | 14 (was 12, +2 new bank_customers checks) | 12 | 86% |
| Performance | 5 | 2 | Partial |
| **Container-based DB verification [new category]** | 3 (sequencing, concurrency, poisoning-row regression) | 3 | 100% (not live — see caveat throughout) |

## Code path coverage (automated)

| File | Lines (approx) | Covered by UT |
|------|---------------:|:-------------:|
| src/lib/roles.ts | ~80 | ✅ Partial (canAccess, canOpenAccount) |
| src/lib/creditScoring.ts | ~450 | ✅ Partial (orchestration paths) |
| **src/lib/loanCalculator.ts [new]** | ~67 | ✅ Full (EMI formula + edge cases) |
| **src/lib/loanEligibility.ts [new]** | ~113 | ✅ Full (DBR + age-at-maturity gates) |
| **src/lib/loanRiskScoring.ts [new]** | ~175 | ✅ Partial (monotonicity checks) |
| **src/lib/loanProducts.ts [new]** | ~165 | ✅ Partial (rate resolution) |
| **src/lib/loanExplanation.ts [new]** | ~86 | ❌ (formatting only, indirectly exercised) |
| **src/lib/bankCustomers.ts [new]** | ~120 (est.) | ❌ (container-tested at the SQL layer, not unit-tested at the TS layer) |
| src/pages/*.tsx | ~8500+ (grew) | ❌ |
| backend/**/*.py | ~2000+ | ❌ |
| supabase/functions/* | ~700+ (grew, `credit-assessment` rewritten) | ❌ |

## Gaps (untested critical paths)

1. Full credit assessment INSERT + Realtime update
2. Document upload → storage → delete persistence
3. OCR wizard end-to-end
4. admin-users create/delete user
5. RLS enforcement with live JWT per role
6. **[New] Live re-confirmation of the account-creation and loan-assessment write paths — currently only container/inspection-verified**
7. **[New] Live AI-narrative ("hybrid") path — currently disabled in this environment (`VITE_CREDIT_AI_FALLBACK=false`), never exercised end to end**
8. **[New] TypeScript-level unit coverage for `bankCustomers.ts` itself (only SQL-layer behavior was container-tested)**

## Map to deliverables

| Artifact | Reference |
|----------|-----------|
| Change inventory | `Change_Impact_Assessment.md` **[new]** |
| Requirements → tests | `Requirements_Traceability_Matrix.md` (44 rows) |
| Test cases | `Test_Cases.md` (122 cases, was 96) |
| Defects | `Bug_Report.md` (14 items, was 12) |
| Automation | `Automation_Testing.md` |
| Executive summary | `QA_Summary_After_Rebase.md` **[new]** |
