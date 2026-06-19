-- ============================================================================
-- Role-aware visibility for loan/credit assessment records.
--
-- IMPORTANT (adapted to THIS project's real schema):
--   * The app's only loan/assessment table is `approval_requests`
--     (there is NO `credit_assessments` / `loan_applications` table).
--   * The creator column is `employee_id` (NOT `created_by`). It already
--     exists and is populated on insert, so no column needs to be added.
--   * Role checks use auth.jwt() -> user_metadata ->> 'role' to stay
--     recursion-safe (never query profiles inside an RLS policy).
--
-- Visibility matrix:
--   branch_employee  -> only their own rows (employee_id = auth.uid())
--   branch_manager   -> all rows
--   risk_department  -> all rows (and can approve/reject)
--
-- Re-runnable: every policy is dropped before being (re)created.
-- ============================================================================

ALTER TABLE public.approval_requests ENABLE ROW LEVEL SECURITY;

-- ── Remove any prior / overly-permissive or overly-restrictive policies ──────
-- The permissive "SELECT to all authenticated" policy from the earlier
-- migration MUST be dropped, otherwise (policies are OR'd) employees would
-- still see every row and the role-aware rules below would have no effect.
DROP POLICY IF EXISTS "approval_requests_select"            ON public.approval_requests;
DROP POLICY IF EXISTS "approval_requests_insert"            ON public.approval_requests;
DROP POLICY IF EXISTS "Users see own requests"              ON public.approval_requests;
DROP POLICY IF EXISTS "own_requests_select"                 ON public.approval_requests;
DROP POLICY IF EXISTS "employee_select_own_requests"        ON public.approval_requests;
DROP POLICY IF EXISTS "manager_select_all_requests"         ON public.approval_requests;
DROP POLICY IF EXISTS "risk_select_all_requests"            ON public.approval_requests;
DROP POLICY IF EXISTS "employee_insert_requests"            ON public.approval_requests;
DROP POLICY IF EXISTS "risk_approve_requests"               ON public.approval_requests;
DROP POLICY IF EXISTS "approval_requests_update_risk_department" ON public.approval_requests;

-- ── SELECT ───────────────────────────────────────────────────────────────────
-- Employee: only their own submissions
CREATE POLICY "employee_select_own_requests"
ON public.approval_requests FOR SELECT
USING (
  (auth.jwt() -> 'user_metadata' ->> 'role') = 'branch_employee'
  AND employee_id = auth.uid()
);

-- Manager: all requests
CREATE POLICY "manager_select_all_requests"
ON public.approval_requests FOR SELECT
USING (
  (auth.jwt() -> 'user_metadata' ->> 'role') = 'branch_manager'
);

-- Risk department: all requests
CREATE POLICY "risk_select_all_requests"
ON public.approval_requests FOR SELECT
USING (
  (auth.jwt() -> 'user_metadata' ->> 'role') = 'risk_department'
);

-- ── INSERT ───────────────────────────────────────────────────────────────────
-- Employees create new assessments/requests tagged with their own id.
-- NOTE: if managers/risk should ALSO be able to create assessments, add
-- matching INSERT policies for those roles (the Credit Risk page is visible
-- to all roles in the UI).
CREATE POLICY "employee_insert_requests"
ON public.approval_requests FOR INSERT
WITH CHECK (
  (auth.jwt() -> 'user_metadata' ->> 'role') = 'branch_employee'
  AND employee_id = auth.uid()
);

-- ── UPDATE ───────────────────────────────────────────────────────────────────
-- Only risk department approves / rejects.
CREATE POLICY "risk_approve_requests"
ON public.approval_requests FOR UPDATE
USING (
  (auth.jwt() -> 'user_metadata' ->> 'role') = 'risk_department'
)
WITH CHECK (
  (auth.jwt() -> 'user_metadata' ->> 'role') = 'risk_department'
);

-- ============================================================================
-- OPTIONAL: same role-aware SELECT for `credit_applications` IF it exists.
-- (The current app does not query this table, but this keeps it consistent
--  in case you wire it up later. It also uses `employee_id` as the creator.)
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'credit_applications'
  ) THEN
    EXECUTE 'ALTER TABLE public.credit_applications ENABLE ROW LEVEL SECURITY';

    EXECUTE 'DROP POLICY IF EXISTS "employee_select_own_applications" ON public.credit_applications';
    EXECUTE 'DROP POLICY IF EXISTS "manager_select_all_applications"  ON public.credit_applications';
    EXECUTE 'DROP POLICY IF EXISTS "risk_select_all_applications"     ON public.credit_applications';
    EXECUTE 'DROP POLICY IF EXISTS "employee_insert_applications"     ON public.credit_applications';

    EXECUTE $p$
      CREATE POLICY "employee_select_own_applications"
      ON public.credit_applications FOR SELECT
      USING (
        (auth.jwt() -> 'user_metadata' ->> 'role') = 'branch_employee'
        AND employee_id = auth.uid()
      )$p$;

    EXECUTE $p$
      CREATE POLICY "manager_select_all_applications"
      ON public.credit_applications FOR SELECT
      USING ((auth.jwt() -> 'user_metadata' ->> 'role') = 'branch_manager')$p$;

    EXECUTE $p$
      CREATE POLICY "risk_select_all_applications"
      ON public.credit_applications FOR SELECT
      USING ((auth.jwt() -> 'user_metadata' ->> 'role') = 'risk_department')$p$;

    EXECUTE $p$
      CREATE POLICY "employee_insert_applications"
      ON public.credit_applications FOR INSERT
      WITH CHECK (
        (auth.jwt() -> 'user_metadata' ->> 'role') = 'branch_employee'
        AND employee_id = auth.uid()
      )$p$;
  END IF;
END $$;

-- ============================================================================
-- CRITICAL: make the JWT carry the role.
--
-- These policies read the role from auth.jwt() -> 'user_metadata' ->> 'role'.
-- That value comes from auth.users.raw_user_meta_data and is baked into the
-- access token at login. If an account was created without role metadata, the
-- check returns NULL and the user sees NOTHING. This syncs the role from the
-- profiles table into auth user-metadata for every existing user.
--
-- After running this, each affected user MUST sign out and sign back in
-- (or refresh their session) so a fresh JWT is issued with the role claim.
-- ============================================================================
UPDATE auth.users AS u
SET raw_user_meta_data =
  coalesce(u.raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('role', p.role)
FROM public.profiles AS p
WHERE u.id = p.id
  AND coalesce(u.raw_user_meta_data ->> 'role', '') IS DISTINCT FROM p.role;

-- ============================================================================
-- DIAGNOSTIC: verify the policies after running.
--   SELECT schemaname, tablename, policyname, cmd, qual
--   FROM pg_policies
--   WHERE tablename IN ('approval_requests', 'credit_applications')
--   ORDER BY tablename, cmd;
-- ============================================================================
