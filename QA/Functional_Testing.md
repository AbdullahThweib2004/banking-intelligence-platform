# Functional Testing Report

**Date:** 2026-07-06

## Scope

All user-facing modules per PRB-001–PRB-028.

## Results by feature

| Feature | Implemented | Verified | Status |
|---------|:-----------:|:--------:|--------|
| Login/logout | Yes | Static | Partial |
| 3-role RBAC | Yes | UT+Static | **Pass** |
| Dashboard stats | Yes | Blocked live | Partial |
| Recent activity | Yes | Blocked live | Partial |
| New credit assessment | Yes | Blocked live | Partial |
| AI scoring | Yes | Blocked | Partial |
| Algorithm fallback | Yes | UT | **Pass** |
| Approve/reject | Yes | Static gates | Partial |
| Objection flow | Yes | Blocked | Partial |
| Approvals queue | Yes | Blocked | Partial |
| Documents list/CRUD | Yes | Blocked | Partial |
| Account opening wizard | Yes | Blocked | Partial |
| AI Assistant chat | Yes | Blocked | Partial |
| Audit log | Yes | Static RLS | **Pass** |
| User management | Yes | Blocked | Partial |
| Modification requests | Yes | Blocked | Partial |
| EN/AR toggle | Yes | Static | **Pass** |
| Onboarding tours | Yes | Manual | Partial |
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

## Conclusion

Functionality appears **complete in code** for graduation scope. Live functional pass rate pending manual execution with demo environment.
