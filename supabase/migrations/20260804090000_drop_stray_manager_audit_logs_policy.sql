-- ============================================================================
-- Removes a stray "manager_select_audit_logs" SELECT policy on audit_logs.
--
-- FOUND BY: the PART 1/2 API/integration QA suite (tests/api/supabase-rls.api.spec.ts)
-- running live against this project — branch_manager was able to read all
-- rows of audit_logs, when the only policy this table's own migration
-- (20260619100000_audit_logs.sql) ever defines is audit_logs_select_risk,
-- scoped to risk_department only. "manager_select_audit_logs" was never
-- created by anything in supabase/migrations/ — it must have been added
-- directly against this project (e.g. via the SQL Editor) and never
-- captured back into a migration, so a fresh/other environment applying
-- only these migrations would NOT have had this gap.
--
-- This is excess privilege with no legitimate use in the app: audit_logs
-- is a compliance/activity log, and src/lib/roles.ts's ROUTE_PERMISSIONS
-- for '/audit-log' only allows risk_department — branch_manager never sees
-- this page in the UI at all, so the policy only ever mattered as a way to
-- read the table directly (devtools/API), never as a real product need.
--
-- Idempotent + safe to re-run.
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('public.audit_logs') IS NOT NULL THEN
    DROP POLICY IF EXISTS "manager_select_audit_logs" ON public.audit_logs;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- Verify (optional, run in the SQL Editor):
--   SELECT policyname, cmd, roles FROM pg_policies
--   WHERE schemaname = 'public' AND tablename = 'audit_logs';
--   -- expect only: audit_logs_select_risk (SELECT), audit_logs_insert_own
--   -- (INSERT), and authenticated_insert_audit (INSERT) if that one is
--   -- also intentionally kept — see the separate note about it below.
-- ============================================================================
