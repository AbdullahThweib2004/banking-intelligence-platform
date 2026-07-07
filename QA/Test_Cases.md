# Test Cases

**Document ID:** QA-TC-001  
**Total cases:** 96 (representative sample below; full IDs referenced in RTM)

## Sample test cases

| TC ID | Req | Module | Scenario | Expected | Actual | Status |
|-------|-----|--------|----------|----------|--------|--------|
| TC-AUTH-01 | PRB-002 | Auth | Valid login employee@bop.ps | Redirect to dashboard | — | BLOCKED |
| TC-AUTH-02 | PRB-002 | Auth | Invalid password | Error message, stay on /auth | — | BLOCKED |
| TC-AUTH-03 | PRB-002 | Auth | Logout | Session cleared, /auth | — | BLOCKED |
| TC-AUTH-04 | PRB-002 | Auth | Access /dashboard without login | Redirect /auth | Static: RequireAuth wraps routes | **PASS** static |
| TC-RBAC-01 | PRB-001 | RBAC | Employee canAccess /dashboard | true | true (UT) | **PASS** |
| TC-RBAC-02 | PRB-001 | RBAC | Employee cannot /audit-log | false | false (UT) | **PASS** |
| TC-RBAC-03 | PRB-001 | RBAC | Manager /user-management | true | true (UT) | **PASS** |
| TC-RBAC-04 | PRB-001 | RBAC | Risk /audit-log | true | true (UT) | **PASS** |
| TC-RBAC-05 | PRB-015 | RBAC | Risk cannot open account | canOpenAccount false | false (UT) | **PASS** |
| TC-RBAC-06 | PRB-004 | RBAC | Employee hits /user-management URL | /unauthorized | ProtectedRoute logic | **PASS** static |
| TC-RBAC-07 | PRB-004 | RBAC | Sidebar hides audit for employee | No nav link | canAccess filter | **PASS** static |
| TC-CR-01 | PRB-007 | Credit | Load BOP-100001 | Form populated | — | BLOCKED |
| TC-CR-05 | PRB-008 | Credit | Submit assessment AI path | result_source=ai | — | BLOCKED |
| TC-CR-09 | PRB-009 | Credit | Algorithm fallback scoring | score 0-100, algorithm | UT verified | **PASS** |
| TC-CR-11 | PRB-011 | Credit | Employee approve pending | No approve buttons | isRole(RISK) gate | **PASS** static |
| TC-CR-15 | PRB-016 | Credit | Restricted customer BOP-100004 | Block assessment | — | BLOCKED |
| TC-DOC-01 | PRB-014 | Documents | Upload document | Row in Supabase + storage | — | BLOCKED |
| TC-DOC-03 | PRB-014 | Documents | Delete own document | Row removed after refresh | — | BLOCKED |
| TC-DOC-07 | PRB-015 | Documents | OCR extract-id | document_id returned | — | BLOCKED |
| TC-DOC-08 | PRB-015 | API | Forge X-User-Role manager | Should 403 without valid JWT role | Accepts header | **FAIL** BUG-001 |
| TC-DASH-01 | PRB-005 | Dashboard | Stats cards load | Numeric values from RPC | — | BLOCKED |
| TC-DASH-04 | PRB-006 | Dashboard | Recent activity | Real rows merged | — | BLOCKED |
| TC-DASH-07 | PRB-003 | Dashboard | Module KPIs | Live or N/A | Static fake values | **FAIL** BUG-003 |
| TC-AUD-01 | PRB-019 | Audit | Employee SELECT audit_logs | RLS denial | Policy risk-only | **PASS** static |
| TC-AI-01 | PRB-017 | AI | Policy question | Grounded answer + citations | — | BLOCKED |
| TC-ADM-01 | PRB-020 | Admin | Manager create user | Edge function 200 | — | BLOCKED |
| TC-VAL-01 | PRB-007 | Validation | Empty customer name submit | Toast error | Code checks trim | **PASS** static |
| TC-VAL-02 | PRB-007 | Validation | Empty loan amount | Toast error | Code checks | **PASS** static |
| TC-VAL-03 | PRB-012 | Validation | Objection without reason | Submit disabled / error | disabled when empty | **PASS** static |
| TC-SEC-01 | NFR-001 | Security | RLS on approval_requests | Employee sees own only | Migration policy | **PASS** review |
| TC-SEC-04 | — | Security | XSS in customer name | Escaped in React text | React default escape | **PASS** static |
| TC-BLD-01 | NFR-004 | Build | npm run build | Exit 0 | Exit 0 | **PASS** |
| UT-01 | PRB-001 | Unit | canAccess all core routes | all true | Pass | **PASS** |
| UT-05 | PRB-009 | Unit | weak profile higher score | weak > strong | Pass | **PASS** |

## Detailed example — TC-DOC-08

| Field | Value |
|-------|-------|
| **Priority** | P0 |
| **Severity** | Critical |
| **Preconditions** | API running on :8000 |
| **Steps** | 1. curl -X POST /documents/extract-id -H "X-User-Role: branch_manager" -F file=@id.png |
| **Expected** | 401/403 unless JWT proves manager role |
| **Actual** | 403 only if header missing/wrong; any forged allowed role succeeds |
| **Defect** | BUG-001 |

## Execution summary

| Status | Count |
|--------|------:|
| PASS | 22 |
| FAIL | 2 |
| BLOCKED | 68 |
| PARTIAL | 4 |

See `Test_Summary.md` for roll-up.
