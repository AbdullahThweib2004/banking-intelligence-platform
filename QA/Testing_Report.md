# Testing Report

**Date:** 2026-07-06; **rebased 2026-07-13**  
**Tester:** QA Audit Agent  
**Build:** production Vite build (pass — bundle now 957.39 kB / 281.39 kB gzip, was 896.69 KB / 262.59 KB)

> **Rebase note:** re-executed all checks below on 2026-07-13 against the current codebase (post Help System, real account creation, loan-engine refactor). See `Change_Impact_Assessment.md` for the full diff.

## 1. Activities performed

| # | Activity | Outcome |
|---|----------|---------|
| 1 | Repository structure analysis | Complete |
| 2 | SRS baseline reconstruction | `SRS_Baseline.md` |
| 3 | Static code review (auth, RLS, API) | 12 findings |
| 4 | Route & role matrix verification | Pass |
| 5 | `npm run build` | Pass |
| 6 | `npm run lint` | 3 errors (baseline); **[rebased] 6 errors, 15 warnings — 3 new since Jul 7, see BUG-013** |
| 7 | `npm test` (9 unit tests) | 9/9 pass; **[rebased] 37/37 pass, 8 suites** |
| 8 | Edge function contract review | 3 functions; **[rebased] 4 directories, 1 (`manage-users`) confirmed empty/orphaned** |
| 9 | Migration / RLS policy review | 19 files; **[rebased] 22 files (+3: bank_customers account sequence, its fix, loan assessment fields)** |
| 10 | Manual E2E browser testing | Not executed (no framework) — unchanged at rebase |

## 2. Module results

| Module | Static | Dynamic | Notes |
|--------|--------|---------|-------|
| Auth | Pass | Blocked | Needs live Supabase |
| RBAC | Pass | Partial | UT covers matrix |
| Dashboard | Partial | Blocked | BUG-003 static KPIs |
| Credit Risk | Pass logic | Blocked | **[rebased]** now a decomposed deterministic engine + optional AI narrative, 28 new unit tests; AI narrative path BLOCKED in this env (`VITE_CREDIT_AI_FALLBACK=false`) |
| Documents | Partial | Blocked | OCR needs API+Tesseract; **[rebased]** now also triggers a real `bank_customers` write, container-verified only |
| Approvals | Pass UI gates | Blocked | Re-checked against widened `approval_requests` schema, no breakage found by inspection |
| AI Assistant | Pass structure | Blocked | Needs ingested policies |
| Audit Log | Pass RLS | Blocked | — |
| User Admin | Pass EF auth | Blocked | — |
| FastAPI | **Fail auth** | Blocked | BUG-001 |
| **Help System [new]** | Pass structure | Blocked | Code-inspected across all 8 covered pages; live interaction BLOCKED |
| **Account Opening [new]** | Pass logic | Container-verified | Sequential numbering + concurrency verified in Docker Postgres, not live |

## 3. Evidence

- Unit test output: 9 passed (baseline); **[rebased] 37 passed** (see `Automation_Testing.md`)
- Build artifact: `dist/` generated successfully; **[rebased]** 957.39 kB / 281.39 kB gzip
- Lint log: 17 problems (3 errors) baseline; **[rebased] 21 problems (6 errors, 15 warnings)**

## 4. Conclusion

Core business rules (roles, credit scoring, and now the loan calculation engine) behave as specified in static analysis and unit tests. End-to-end verification blocked by environment, same limitation as baseline. **Critical security defect** in FastAPI authorization (BUG-001) must be fixed before production. **[Rebased]** A new high-priority defect (BUG-014, schema-cache miss on the new loan-assessment columns) was found and fixed in code this cycle but needs live re-confirmation — see `Known_Issues.md`.
