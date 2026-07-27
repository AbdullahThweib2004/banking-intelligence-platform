-- ============================================================================
-- Audit stage: a fourth and FINAL workflow step after Risk approval.
--
--   employee signs -> pending_branch_manager_approval
--   -> branch_manager approves -> pending            (unchanged, Risk's queue)
--   -> risk_department approves -> pending_audit_approval  (NEW — used to be
--        the terminal 'approved'; Risk approving is no longer the end)
--   -> audit_department approves -> audit_approved    (NEW, final: ready for
--        execution/disbursement, which remains out of scope)
--
-- Rejections at ANY stage are a SOFT reject (status = 'rejected', row kept),
-- consistent with the existing Branch-Manager-gate and Risk-stage behavior.
-- For Audit specifically this is a deliberate choice, not just consistency:
-- Audit exists FOR compliance/audit-trail purposes, so silently destroying a
-- record of what Audit rejected and why would defeat the department's own
-- purpose. `audit_decision_by`/`audit_decision_at` (like the existing
-- `manager_decision_by`/`manager_decision_at`) record who decided and when;
-- `risk_decision_by`/`risk_decision_at` are added too, filling a pre-existing
-- gap where only `approved_at` was recorded for Risk's own decision with no
-- accompanying "by whom".
--
-- Idempotent + safe to re-run: column adds are IF NOT EXISTS, every policy is
-- dropped before being recreated. No existing row's data or foreign key
-- relationship is touched. Per explicit confirmation, there are no existing
-- 'approved' rows on this project yet, so no data backfill/migration of
-- historical rows is needed — only NEW Risk approvals are affected.
-- ============================================================================

-- -----------------------------------------------------------------------------
-- 1. New columns.
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.approval_requests') IS NOT NULL THEN
    ALTER TABLE public.approval_requests ADD COLUMN IF NOT EXISTS risk_decision_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
    ALTER TABLE public.approval_requests ADD COLUMN IF NOT EXISTS risk_decision_at TIMESTAMPTZ;
    ALTER TABLE public.approval_requests ADD COLUMN IF NOT EXISTS audit_decision_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
    ALTER TABLE public.approval_requests ADD COLUMN IF NOT EXISTS audit_decision_at TIMESTAMPTZ;
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 2. profiles.role — add the new role.
-- -----------------------------------------------------------------------------
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('branch_employee', 'branch_manager', 'risk_department', 'audit_department'));

-- -----------------------------------------------------------------------------
-- 3. approval_requests.status — add the two new statuses.
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.approval_requests') IS NOT NULL THEN
    ALTER TABLE public.approval_requests DROP CONSTRAINT IF EXISTS approval_requests_status_check;
    ALTER TABLE public.approval_requests
      ADD CONSTRAINT approval_requests_status_check
      CHECK (status IN (
        'pending',
        'approved',
        'rejected',
        'awaiting_approval',
        'pending_branch_manager_approval',
        'pending_audit_approval',
        'audit_approved'
      ));
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 4. RLS: audit_department visibility — ONLY rows that passed Risk approval
--    (pending_audit_approval, audit_approved), plus its OWN rejections (for
--    its own history — NOT rows rejected earlier at the Manager/Risk stage).
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.approval_requests') IS NOT NULL THEN
    DROP POLICY IF EXISTS "audit_select_requests" ON public.approval_requests;
    EXECUTE $pol$
      CREATE POLICY "audit_select_requests"
      ON public.approval_requests FOR SELECT
      USING (
        (auth.jwt() -> 'user_metadata' ->> 'role') = 'audit_department'
        AND (
          status IN ('pending_audit_approval', 'audit_approved')
          OR (status = 'rejected' AND audit_decision_by IS NOT NULL)
        )
      )
    $pol$;
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 5. RLS: audit_department may decide (approve -> 'audit_approved', reject ->
--    'rejected') ONLY while a row is exactly at the audit gate.
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.approval_requests') IS NOT NULL THEN
    DROP POLICY IF EXISTS "audit_decision_requests" ON public.approval_requests;
    EXECUTE $pol$
      CREATE POLICY "audit_decision_requests"
      ON public.approval_requests FOR UPDATE
      USING (
        (auth.jwt() -> 'user_metadata' ->> 'role') = 'audit_department'
        AND status = 'pending_audit_approval'
      )
      WITH CHECK (
        (auth.jwt() -> 'user_metadata' ->> 'role') = 'audit_department'
        AND status IN ('audit_approved', 'rejected')
      )
    $pol$;
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 6. RLS: tighten risk_approve_requests. Previously USING allowed acting on
--    ANY row except one still at the Manager gate — which meant risk_department
--    could technically re-UPDATE a row that had already moved past their own
--    stage (pending_audit_approval / audit_approved), and WITH CHECK allowed
--    setting status to anything. Both are now scoped to exactly Risk's own
--    stage, matching the same "act only on your own gate" pattern as the
--    Manager and (new) Audit policies — this also structurally prevents a
--    request from ever skipping a stage (e.g. jumping straight to Audit).
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.approval_requests') IS NOT NULL THEN
    DROP POLICY IF EXISTS "risk_approve_requests" ON public.approval_requests;
    EXECUTE $pol$
      CREATE POLICY "risk_approve_requests"
      ON public.approval_requests FOR UPDATE
      USING (
        (auth.jwt() -> 'user_metadata' ->> 'role') = 'risk_department'
        AND status = 'pending'
      )
      WITH CHECK (
        (auth.jwt() -> 'user_metadata' ->> 'role') = 'risk_department'
        AND status IN ('pending_audit_approval', 'rejected')
      )
    $pol$;
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 7. Defense in depth (mirrors the existing DBR-override constraint):
--    Audit cannot approve a row missing the Risk-stage eligibility result.
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.approval_requests') IS NOT NULL THEN
    ALTER TABLE public.approval_requests DROP CONSTRAINT IF EXISTS approval_requests_audit_requires_eligibility_check;
    ALTER TABLE public.approval_requests
      ADD CONSTRAINT approval_requests_audit_requires_eligibility_check
      CHECK (NOT (status = 'audit_approved' AND eligibility_status IS NULL)) NOT VALID;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- Verify (optional, run in the SQL Editor):
--
--   -- audit_department must not see rows still at Manager/Risk stage:
--   SELECT count(*) FROM public.approval_requests
--   WHERE status IN ('pending_branch_manager_approval', 'pending');
--   -- (run as audit_department — expect 0)
--
--   -- risk_department can no longer act on a row already past their stage:
--   -- UPDATE public.approval_requests SET status = 'rejected'
--   -- WHERE status = 'pending_audit_approval';
--   -- (run as risk_department — expect 0 rows updated, RLS USING excludes it)
--
--   -- Audit cannot approve a row with no eligibility_status:
--   -- UPDATE public.approval_requests SET status = 'audit_approved'
--   -- WHERE eligibility_status IS NULL;
--   -- (expect: CHECK violation)
-- ============================================================================
