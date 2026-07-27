-- ============================================================================
-- Branch Manager approval gate for new credit assessments (Loan Application
-- workflow, phase 1 — revised design).
--
-- Every new credit assessment submitted from the Credit Risk page's "New
-- Assessment" flow now requires the CUSTOMER'S SIGNATURE (captured in-app)
-- and a BRANCH MANAGER decision before it becomes visible to risk_department:
--
--   employee assesses risk (AI/formula score, unchanged) -> customer signs
--   the generated document -> row is inserted with
--   status = 'pending_branch_manager_approval' -> ONLY branch_manager and the
--   submitting employee can see it -> branch_manager either:
--     - APPROVES: status -> 'pending' (i.e. it now enters risk_department's
--       existing queue, completely unchanged from today's behavior)
--     - REJECTS: status -> 'rejected' (soft reject — the row is KEPT, not
--       hard-deleted, so it still shows in Approvals' processed/rejected
--       history, same as any other rejection today)
--   In both cases manager_decision_by / manager_decision_at record who
--   decided and when, for traceability, distinct from the existing
--   approved_at column (which continues to mean "risk_department's own final
--   decision timestamp" and is untouched by this migration).
--
-- This SUPERSEDES the separate `loan_applications` table approach from an
-- earlier iteration of this feature (never relied upon in production); any
-- trace of it is dropped for a clean, idempotent re-run.
--
-- Idempotent + safe to re-run: column adds are IF NOT EXISTS, every policy is
-- dropped before being recreated. No existing row's data or foreign key
-- relationship is touched.
-- ============================================================================

-- -----------------------------------------------------------------------------
-- 0. Clean up the superseded loan_applications table, if it was ever applied.
--    Explicitly guarded on table existence (rather than relying on DROP
--    TRIGGER/FUNCTION/TABLE's own IF EXISTS) since some hosted SQL runners
--    surface the "relation does not exist" NOTICE that IF EXISTS normally
--    produces as a hard error instead.
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.loan_applications') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_log_loan_application_insert ON public.loan_applications;
    DROP TRIGGER IF EXISTS trg_log_loan_application_update ON public.loan_applications;
    DROP TRIGGER IF EXISTS trg_log_loan_application_delete ON public.loan_applications;
    DROP TRIGGER IF EXISTS trg_loan_applications_updated_at ON public.loan_applications;
    DROP TABLE public.loan_applications;
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.log_loan_application_activity();
DROP FUNCTION IF EXISTS public.set_loan_applications_updated_at();

-- -----------------------------------------------------------------------------
-- 1. New columns on approval_requests.
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.approval_requests') IS NOT NULL THEN
    ALTER TABLE public.approval_requests ADD COLUMN IF NOT EXISTS signature_data_url TEXT;
    ALTER TABLE public.approval_requests ADD COLUMN IF NOT EXISTS manager_decision_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
    ALTER TABLE public.approval_requests ADD COLUMN IF NOT EXISTS manager_decision_at TIMESTAMPTZ;
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 2. INSERT: every new row from the employee flow must start at the manager
--    gate (defense in depth — the app also sets this, but the DB enforces it
--    regardless of client bugs).
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.approval_requests') IS NOT NULL THEN
    DROP POLICY IF EXISTS "approval_requests_insert_roles" ON public.approval_requests;
    EXECUTE $pol$
      CREATE POLICY "approval_requests_insert_roles"
      ON public.approval_requests
      FOR INSERT
      TO authenticated
      WITH CHECK (
        (auth.jwt() -> 'user_metadata' ->> 'role')
          IN ('branch_employee', 'branch_manager', 'risk_department')
        AND employee_id = auth.uid()
        AND status = 'pending_branch_manager_approval'
      )
    $pol$;
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 3. SELECT: risk_department must NOT see rows still awaiting the manager's
--    decision. (employee_select_own_requests / manager_select_all_requests
--    are unchanged — the employee already sees their own row regardless of
--    status, and the manager already sees every row regardless of status.)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.approval_requests') IS NOT NULL THEN
    DROP POLICY IF EXISTS "risk_select_all_requests" ON public.approval_requests;
    EXECUTE $pol$
      CREATE POLICY "risk_select_all_requests"
      ON public.approval_requests FOR SELECT
      USING (
        (auth.jwt() -> 'user_metadata' ->> 'role') = 'risk_department'
        AND status <> 'pending_branch_manager_approval'
      )
    $pol$;
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 4. UPDATE: branch_manager may decide (approve -> 'pending', reject ->
--    'rejected') ONLY while a row is still at the gate. risk_department's own
--    approve/reject UPDATE policy is narrowed the same way as its SELECT
--    policy, so a stale JWT/client cannot bypass the gate via a direct UPDATE
--    call even though RLS SELECT and UPDATE are independent checks.
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.approval_requests') IS NOT NULL THEN
    DROP POLICY IF EXISTS "manager_gate_decision_requests" ON public.approval_requests;
    EXECUTE $pol$
      CREATE POLICY "manager_gate_decision_requests"
      ON public.approval_requests FOR UPDATE
      USING (
        (auth.jwt() -> 'user_metadata' ->> 'role') = 'branch_manager'
        AND status = 'pending_branch_manager_approval'
      )
      WITH CHECK (
        (auth.jwt() -> 'user_metadata' ->> 'role') = 'branch_manager'
        AND status IN ('pending', 'rejected')
      )
    $pol$;

    DROP POLICY IF EXISTS "risk_approve_requests" ON public.approval_requests;
    EXECUTE $pol$
      CREATE POLICY "risk_approve_requests"
      ON public.approval_requests FOR UPDATE
      USING (
        (auth.jwt() -> 'user_metadata' ->> 'role') = 'risk_department'
        AND status <> 'pending_branch_manager_approval'
      )
      WITH CHECK (
        (auth.jwt() -> 'user_metadata' ->> 'role') = 'risk_department'
      )
    $pol$;

    -- CRITICAL: an older migration (20260618103000_rbac_profiles.sql) also
    -- creates "approval_requests_update_risk_department", an UNSCOPED
    -- UPDATE-for-risk_department policy with no status restriction at all.
    -- Since RLS OR's multiple permissive policies together for the same
    -- command, leaving this in place would let risk_department bypass the
    -- gate above entirely. It is fully superseded by risk_approve_requests,
    -- so it is dropped outright rather than recreated.
    DROP POLICY IF EXISTS "approval_requests_update_risk_department" ON public.approval_requests;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- Verify (optional, run in the SQL Editor):
--
--   -- A stale/direct INSERT that tries to skip the gate must fail:
--   -- INSERT INTO public.approval_requests (..., status) VALUES (..., 'pending');
--   -- (expect: RLS violation, since WITH CHECK requires
--   --  status = 'pending_branch_manager_approval')
--
--   -- risk_department must not see gated rows:
--   SELECT count(*) FROM public.approval_requests WHERE status = 'pending_branch_manager_approval';
--   -- (run as risk_department — expect 0, even if rows exist for other roles)
--
--   -- After a branch_manager UPDATE ... SET status = 'pending', the same row
--   -- must now be visible to risk_department.
-- ============================================================================
