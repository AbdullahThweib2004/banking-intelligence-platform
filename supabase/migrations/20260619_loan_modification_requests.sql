-- ============================================================================
-- Loan modification / objection requests (audit-safe, approval-based).
--
-- Employees do NOT edit the original application directly. They submit a
-- single-field change request here with a reason; risk_department reviews it.
--
-- RLS uses the same role pattern as the rest of the app:
--   (auth.jwt() -> 'user_metadata' ->> 'role')
--
-- Audit triggers write to public.audit_logs (must already exist from
-- 20260619_audit_logs.sql) when a request is submitted or reviewed.
-- ============================================================================

-- 1. Table ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.loan_modification_requests (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL,
  requested_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  requester_name TEXT,
  requester_role TEXT,
  field_name     TEXT NOT NULL,
  old_value      TEXT,
  new_value      TEXT,
  reason         TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at    TIMESTAMPTZ,
  review_note    TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS loan_modification_requests_app_idx
  ON public.loan_modification_requests (application_id);
CREATE INDEX IF NOT EXISTS loan_modification_requests_created_idx
  ON public.loan_modification_requests (created_at DESC);

-- 2. RLS --------------------------------------------------------------------
ALTER TABLE public.loan_modification_requests ENABLE ROW LEVEL SECURITY;

-- INSERT: a branch_employee may submit their own request.
DROP POLICY IF EXISTS "lmr_insert_employee" ON public.loan_modification_requests;
CREATE POLICY "lmr_insert_employee"
  ON public.loan_modification_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'branch_employee'
    AND requested_by = auth.uid()
  );

-- SELECT: employee sees only their own requests.
DROP POLICY IF EXISTS "lmr_select_employee" ON public.loan_modification_requests;
CREATE POLICY "lmr_select_employee"
  ON public.loan_modification_requests
  FOR SELECT
  TO authenticated
  USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'branch_employee'
    AND requested_by = auth.uid()
  );

-- SELECT: branch_manager sees all (branch visibility, consistent with app).
DROP POLICY IF EXISTS "lmr_select_manager" ON public.loan_modification_requests;
CREATE POLICY "lmr_select_manager"
  ON public.loan_modification_requests
  FOR SELECT
  TO authenticated
  USING ((auth.jwt() -> 'user_metadata' ->> 'role') = 'branch_manager');

-- SELECT: risk_department sees all.
DROP POLICY IF EXISTS "lmr_select_risk" ON public.loan_modification_requests;
CREATE POLICY "lmr_select_risk"
  ON public.loan_modification_requests
  FOR SELECT
  TO authenticated
  USING ((auth.jwt() -> 'user_metadata' ->> 'role') = 'risk_department');

-- UPDATE: only risk_department may review (status / review fields).
DROP POLICY IF EXISTS "lmr_update_risk" ON public.loan_modification_requests;
CREATE POLICY "lmr_update_risk"
  ON public.loan_modification_requests
  FOR UPDATE
  TO authenticated
  USING ((auth.jwt() -> 'user_metadata' ->> 'role') = 'risk_department')
  WITH CHECK ((auth.jwt() -> 'user_metadata' ->> 'role') = 'risk_department');

-- No DELETE policy => deletes are denied for everyone.

-- 3. Audit logging triggers --------------------------------------------------
--    Only run if audit_logs exists; otherwise skip (keeps this file safe to run
--    even if the audit migration hasn't been applied yet).
CREATE OR REPLACE FUNCTION public.log_modification_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor  UUID;
  a_name TEXT;
  a_role TEXT;
  act    TEXT;
  sev    TEXT := 'info';
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_logs
      (user_id, user_name, user_role, action, resource, resource_id, details, severity)
    VALUES (
      NEW.requested_by,
      COALESCE(NEW.requester_name, 'System'),
      NEW.requester_role,
      'Submitted modification request',
      'loan_modification_requests',
      NEW.id::text,
      'Field: ' || NEW.field_name || ' — ' || COALESCE(NEW.reason, ''),
      'info'
    );
    RETURN NEW;
  END IF;

  -- UPDATE: log only when the review status changes.
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    actor := auth.uid();
    SELECT full_name, role INTO a_name, a_role FROM public.profiles WHERE id = actor;
    IF NEW.status = 'approved' THEN
      act := 'Approved modification request';
    ELSIF NEW.status = 'rejected' THEN
      act := 'Rejected modification request';
      sev := 'warning';
    ELSE
      act := 'Updated modification request';
    END IF;

    INSERT INTO public.audit_logs
      (user_id, user_name, user_role, action, resource, resource_id, details, severity)
    VALUES (
      actor,
      COALESCE(a_name, 'System'),
      a_role,
      act,
      'loan_modification_requests',
      NEW.id::text,
      'Field: ' || NEW.field_name || COALESCE(' — ' || NEW.review_note, ''),
      sev
    );
  END IF;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.audit_logs') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_log_modification_insert ON public.loan_modification_requests;
    DROP TRIGGER IF EXISTS trg_log_modification_update ON public.loan_modification_requests;
    EXECUTE 'CREATE TRIGGER trg_log_modification_insert
             AFTER INSERT ON public.loan_modification_requests
             FOR EACH ROW EXECUTE FUNCTION public.log_modification_activity()';
    EXECUTE 'CREATE TRIGGER trg_log_modification_update
             AFTER UPDATE ON public.loan_modification_requests
             FOR EACH ROW EXECUTE FUNCTION public.log_modification_activity()';
  END IF;
END $$;
