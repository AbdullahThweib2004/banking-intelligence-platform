# Functional Testing Report

**Date:** 2026-07-06; **rebased 2026-07-13**

## Scope

All user-facing modules per PRB-001–PRB-038 (was PRB-028; +10 new requirements this rebase — see `Requirements_Traceability_Matrix.md`).

## Results by feature

| Feature | Implemented | Verified | Status |
|---------|:-----------:|:--------:|--------|
| Login/logout | Yes | Static | Partial |
| 3-role RBAC | Yes | UT+Static | **Pass** |
| Dashboard stats | Yes | Blocked live | Partial |
| Recent activity | Yes | Blocked live | Partial |
| New credit assessment | Yes | Blocked live | Partial |
| **Loan calculation engine (EMI/DBR/age-at-maturity) [new]** | Yes | UT | **Pass** |
| **Deterministic weighted risk scoring [new]** | Yes | UT | **Pass** |
| AI narrative (explanation-only, was "AI scoring") | Yes | Blocked in this env (`VITE_CREDIT_AI_FALLBACK=false`) | Partial — **re-scoped: AI no longer computes the score, only explains it** |
| Deterministic fallback explanation (was "Algorithm fallback") | Yes | UT + Static | **Pass** |
| Approve/reject | Yes | Static gates | Partial |
| Objection flow / reanalysis | Yes | Blocked; reanalysis extended for new loan fields | Partial |
| Approvals queue | Yes | Blocked | Partial |
| Documents list/CRUD | Yes | Blocked | Partial |
| **Account opening wizard → real `bank_customers` write [was mock, now real]** | Yes | Container-verified (Docker Postgres), live Blocked | Partial |
| **Sequential account numbering [new]** | Yes | Container-verified | Partial |
| **Duplicate national-ID idempotent handling [new]** | Yes | Code inspection | Partial |
| AI Assistant chat | Yes | Blocked | Partial |
| Audit log | Yes | Static RLS | **Pass** |
| User management | Yes | Blocked | Partial |
| Modification requests | Yes | Blocked | Partial |
| EN/AR toggle | Yes | Static; extended to new loan-calculator UI strings | **Pass** |
| Onboarding tours | Yes | Manual; now coordinates with Help System | Partial |
| **Global Help System (8 pages) [new]** | Yes | Code inspection | Partial |
| 404 / Unauthorized | Yes | Static | **Pass** |

## Workflow tests (manual checklist)

### WF-01 Credit assessment happy path
1. Login as employee → Credit Risk → New Assessment  
2. Enter BOP-100001 → Load customer → Assess Risk  
3. Verify row in approval_requests with risk_score  
**Status:** BLOCKED (needs Supabase)

### WF-02 Risk approval
1. Login as risk → approve pending application  
**Status:** BLOCKED

### WF-03 Document delete persistence
1. Upload → Delete → Refresh  
**Status:** BLOCKED (RLS DELETE policy present in migration — static pass)

### WF-04 Open New Account, real customer creation [new]
1. Login as employee → Documents → Open New Account wizard
2. Complete OCR step → submit
3. Verify a new `bank_customers` row with a `BOP-1000xx` account number
**Status:** BLOCKED live; container-verified (Docker Postgres) including the sequential numbering and duplicate-national-ID scenarios

### WF-05 New loan assessment with the calculator engine [new]
1. Login as risk/employee → Credit Risk → New Assessment
2. Select loan type/currency, enter term/age/obligations → submit
3. Verify installment/DBR/age-at-maturity/eligibility display and `result_source` reads `formula` (AI disabled in this env)
**Status:** BLOCKED live for the full round trip; unit-tested for the calculation core; **BUG-014 (schema-cache miss) must be re-confirmed fixed live before this workflow can be marked passing end to end**

## Conclusion

Functionality appears **complete in code** for graduation scope, including the loan-calculation engine and real account-creation flow added since the Jul 6 baseline. Live functional pass rate pending manual execution with demo environment — see `QA_Summary_After_Rebase.md` for the priority order to test these manually.
