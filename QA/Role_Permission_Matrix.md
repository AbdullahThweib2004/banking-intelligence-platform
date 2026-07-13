# Role Permission Matrix

**Source:** `src/lib/roles.ts`, `App.tsx`, RLS migrations
**Rebased 2026-07-13:** route/action matrix itself is unchanged (no code changes detected in `roles.ts` or `App.tsx` this cycle); the new `bank_customers` INSERT policy is added to the Data visibility table below.

## Route access (frontend)

| Route | branch_employee | branch_manager | risk_department | Guard |
|-------|:---------------:|:--------------:|:---------------:|-------|
| /dashboard | ✅ | ✅ | ✅ | RequireAuth |
| /credit-risk | ✅ | ✅ | ✅ | RequireAuth |
| /documents | ✅ | ✅ | ✅ | RequireAuth |
| /ai-assistant | ✅ | ✅ | ✅ | RequireAuth |
| /approvals | ✅ | ✅ | ✅ | RequireAuth |
| /modification-requests | ❌ | ✅ | ✅ | ProtectedRoute |
| /user-management | ❌ | ✅ | ❌ | ProtectedRoute |
| /audit-log | ❌ | ❌ | ✅ | ProtectedRoute |

## Action permissions (application logic)

| Action | employee | manager | risk |
|--------|:--------:|:-------:|:----:|
| New credit assessment | ✅ | ✅ | ✅ |
| Approve/reject application | ❌ | ❌ | ✅ |
| Objection/modification submit | ✅ | ✅ | ✅ |
| Open new account (Documents) | ✅ | ✅ | ❌ |
| View audit log | ❌ | ❌ | ✅ |
| Create/delete users | ❌ | ✅ | ❌ |
| Review modification requests | ❌ | view | approve |

## Data visibility (Supabase RLS)

| Table | employee | manager | risk |
|-------|----------|---------|------|
| approval_requests SELECT | own rows | all | all |
| approval_requests UPDATE | ❌ | ❌ | ✅ |
| audit_logs SELECT | ❌ | ❌ | ✅ |
| documents SELECT | all (branch roles) | all | all |
| documents DELETE own | ✅ | ✅ all | ✅ all |
| profiles SELECT | own | all (policy) | own |
| **bank_customers INSERT [new]** | ✅ | ✅ | ❌ |
| **bank_customers SELECT** | all (unchanged from baseline) | all | all |

## Test result

Static matrix matches implementation: **PASS** — including the new `bank_customers` INSERT row, which correctly mirrors the existing "risk cannot open account" rule already covered by `TC-RBAC-05`  
Live RLS enforcement: **BLOCKED** (requires multi-user session test) — unchanged limitation, now also applies to the new INSERT policy
