# Role Permission Matrix

**Source:** `src/lib/roles.ts`, `App.tsx`, RLS migrations

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

## Test result

Static matrix matches implementation: **PASS**  
Live RLS enforcement: **BLOCKED** (requires multi-user session test)
