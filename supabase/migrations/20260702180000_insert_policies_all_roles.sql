-- ============================================================================
-- Fix: allow branch_employee, branch_manager AND risk_department to create
-- records, so "New Assessment" (approval_requests) and "Objection /
-- Modification" (loan_modification_requests) no longer fail with:
--   "new row violates row-level security policy"
--
-- Previously the INSERT policies were restricted to branch_employee only, so a
-- manager or risk-department user could load the form but not save.
--
-- Keeps the project's established, recursion-safe role check
-- (auth.jwt() -> 'user_metadata' ->> 'role') and the per-user ownership check.
-- RLS stays ENABLED. SELECT / UPDATE / DELETE policies are left unchanged.
-- Idempotent (each policy is dropped before being recreated).
-- ============================================================================

-- 1. approval_requests -------------------------------------------------------
ALTER TABLE public.approval_requests ENABLE ROW LEVEL SECURITY;

-- Replace the employee-only INSERT policy with one covering all three roles.
DROP POLICY IF EXISTS "employee_insert_requests"        ON public.approval_requests;
DROP POLICY IF EXISTS "approval_requests_insert"        ON public.approval_requests;
DROP POLICY IF EXISTS "approval_requests_insert_roles"  ON public.approval_requests;
CREATE POLICY "approval_requests_insert_roles"
  ON public.approval_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (auth.jwt() -> 'user_metadata' ->> 'role')
      IN ('branch_employee', 'branch_manager', 'risk_department')
    AND employee_id = auth.uid()
  );

-- 2. loan_modification_requests ---------------------------------------------
ALTER TABLE public.loan_modification_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lmr_insert_employee" ON public.loan_modification_requests;
DROP POLICY IF EXISTS "lmr_insert_roles"    ON public.loan_modification_requests;
CREATE POLICY "lmr_insert_roles"
  ON public.loan_modification_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (auth.jwt() -> 'user_metadata' ->> 'role')
      IN ('branch_employee', 'branch_manager', 'risk_department')
    AND requested_by = auth.uid()
  );

-- ============================================================================
-- Verify:
--   SELECT policyname, cmd, roles, with_check
--   FROM pg_policies
--   WHERE tablename IN ('approval_requests', 'loan_modification_requests')
--     AND cmd = 'INSERT';
-- ============================================================================
