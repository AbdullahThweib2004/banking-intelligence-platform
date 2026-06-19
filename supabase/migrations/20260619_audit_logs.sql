-- ============================================================================
-- Audit Log: append-only activity log readable only by risk_department.
--
-- - Table is idempotent (CREATE TABLE IF NOT EXISTS + ADD COLUMN IF NOT EXISTS).
-- - RLS: risk_department reads all; any authenticated user may insert their own
--   row; NO update / delete policies => the log is append-only.
-- - Auto-logging triggers fill the log from real activity on approval_requests
--   (INSERT/UPDATE) and profiles (UPDATE). Trigger functions are SECURITY
--   DEFINER (owned by postgres) so their inserts bypass RLS.
-- ============================================================================

-- 1. Table ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_name   TEXT,
  user_role   TEXT,
  action      TEXT NOT NULL,
  resource    TEXT,
  resource_id TEXT,
  details     TEXT,
  ip_address  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  severity    TEXT DEFAULT 'info'
);

-- Reconcile columns if an older audit_logs table already existed.
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS user_id     UUID;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS user_name   TEXT;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS user_role   TEXT;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS action      TEXT;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS resource    TEXT;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS resource_id TEXT;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS details     TEXT;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS ip_address  TEXT;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS created_at  TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS severity    TEXT DEFAULT 'info';

ALTER TABLE public.audit_logs DROP CONSTRAINT IF EXISTS audit_logs_severity_check;
ALTER TABLE public.audit_logs
  ADD CONSTRAINT audit_logs_severity_check
  CHECK (severity IN ('info', 'warning', 'error'));

CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx ON public.audit_logs (created_at DESC);

-- 2. RLS --------------------------------------------------------------------
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- SELECT: only risk_department can read the logs.
DROP POLICY IF EXISTS "audit_logs_select_risk" ON public.audit_logs;
CREATE POLICY "audit_logs_select_risk"
  ON public.audit_logs
  FOR SELECT
  TO authenticated
  USING ((auth.jwt() -> 'user_metadata' ->> 'role') = 'risk_department');

-- INSERT: any authenticated user may insert their own log entry.
DROP POLICY IF EXISTS "audit_logs_insert_own" ON public.audit_logs;
CREATE POLICY "audit_logs_insert_own"
  ON public.audit_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- No UPDATE / DELETE policies => append-only (all updates/deletes denied).

-- 3. Auto-logging triggers --------------------------------------------------

-- 3a. approval_requests (INSERT + UPDATE)
CREATE OR REPLACE FUNCTION public.log_approval_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor   UUID := auth.uid();
  a_name  TEXT;
  a_role  TEXT;
  act     TEXT;
  sev     TEXT := 'info';
BEGIN
  SELECT full_name, role INTO a_name, a_role FROM public.profiles WHERE id = actor;

  IF TG_OP = 'INSERT' THEN
    act := 'Created approval request';
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      act := 'Changed status to ' || COALESCE(NEW.status, 'unknown');
      IF NEW.status = 'rejected' THEN sev := 'warning'; END IF;
    ELSE
      act := 'Updated approval request';
    END IF;
  END IF;

  INSERT INTO public.audit_logs
    (user_id, user_name, user_role, action, resource, resource_id, details, severity)
  VALUES
    (actor, COALESCE(a_name, 'System'), a_role, act, 'approval_requests',
     NEW.id::text, COALESCE(NEW.customer_name, ''), sev);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_approval_insert ON public.approval_requests;
DROP TRIGGER IF EXISTS trg_log_approval_update ON public.approval_requests;

DO $$
BEGIN
  IF to_regclass('public.approval_requests') IS NOT NULL THEN
    EXECUTE 'CREATE TRIGGER trg_log_approval_insert
             AFTER INSERT ON public.approval_requests
             FOR EACH ROW EXECUTE FUNCTION public.log_approval_activity()';
    EXECUTE 'CREATE TRIGGER trg_log_approval_update
             AFTER UPDATE ON public.approval_requests
             FOR EACH ROW EXECUTE FUNCTION public.log_approval_activity()';
  END IF;
END $$;

-- 3b. profiles (UPDATE)
CREATE OR REPLACE FUNCTION public.log_profile_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor   UUID := auth.uid();
  a_name  TEXT;
  a_role  TEXT;
  act     TEXT := 'Updated profile';
  sev     TEXT := 'info';
BEGIN
  SELECT full_name, role INTO a_name, a_role FROM public.profiles WHERE id = actor;

  IF NEW.role IS DISTINCT FROM OLD.role THEN
    act := 'Changed role from ' || COALESCE(OLD.role, '-') || ' to ' || COALESCE(NEW.role, '-');
    sev := 'warning';
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    act := 'Changed status to ' || COALESCE(NEW.status, '-');
    IF NEW.status = 'suspended' THEN sev := 'warning'; END IF;
  END IF;

  INSERT INTO public.audit_logs
    (user_id, user_name, user_role, action, resource, resource_id, details, severity)
  VALUES
    (actor, COALESCE(a_name, 'System'), a_role, act, 'profiles',
     NEW.id::text, COALESCE(NEW.full_name, NEW.email, ''), sev);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_profile_update ON public.profiles;
CREATE TRIGGER trg_log_profile_update
  AFTER UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.log_profile_activity();
