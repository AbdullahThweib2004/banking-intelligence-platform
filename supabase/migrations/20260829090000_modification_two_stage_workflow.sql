-- ============================================================================
-- Two-stage approval workflow for loan modification / objection requests.
--
--   employee submits            -> 'pending_branch_manager_review'
--   branch_manager approves     -> 'pending_risk_review'
--   branch_manager rejects      -> 'rejected'          (source app untouched)
--   risk_department approves    -> 'approved'          (field APPLIED here, and
--                                                       only here)
--   risk_department rejects     -> 'rejected'          (source app untouched)
--
-- BEFORE THIS MIGRATION the flow was single-stage: an employee submitted with
-- status 'pending' and risk_department decided immediately via
-- review_loan_modification_request(), which applied the field change. The
-- branch manager had no gate at all, and lmr_update_risk was an UNSCOPED
-- UPDATE policy — risk_department could update a request at any status,
-- including re-deciding an already-terminal one.
--
-- STATUS NAMING: this table's own vocabulary is "review" (reviewed_by,
-- reviewed_at, review_note, review_loan_modification_request), so the new
-- statuses use the `_review` suffix rather than the `_approval` suffix that
-- public.approval_requests uses for the separate loan workflow. Keeping the
-- two vocabularies distinct makes it impossible to confuse a modification
-- status with a loan status in a query, a policy, or a log line.
--
-- LEGACY COMPATIBILITY: existing rows keep status 'pending'. Under the old
-- design that meant "awaiting risk review", so 'pending' stays in the CHECK
-- constraint and is treated as risk-actionable everywhere. No existing row is
-- rewritten, renumbered, or deleted. Nothing writes 'pending' any more.
--
-- Idempotent and safe to re-run: every column add is IF NOT EXISTS, every
-- constraint/policy/trigger is dropped before being recreated, and the whole
-- file is guarded on table existence (this repo's migrations are a partial,
-- corrective record over a schema partly created outside version control —
-- see 20260724110000 and 20260804090000 for prior out-of-band objects).
--
-- APPLY MANUALLY in the Supabase SQL Editor. Verification block at the bottom.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Manager-decision columns (reuse if a prior attempt already added them).
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.loan_modification_requests') IS NULL THEN
    RAISE NOTICE 'public.loan_modification_requests does not exist — skipping.';
    RETURN;
  END IF;

  ALTER TABLE public.loan_modification_requests
    ADD COLUMN IF NOT EXISTS manager_decision_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL;
  ALTER TABLE public.loan_modification_requests
    ADD COLUMN IF NOT EXISTS manager_decision_at   TIMESTAMPTZ;
  ALTER TABLE public.loan_modification_requests
    ADD COLUMN IF NOT EXISTS manager_decision      TEXT;
  ALTER TABLE public.loan_modification_requests
    ADD COLUMN IF NOT EXISTS manager_decision_note TEXT;

  ALTER TABLE public.loan_modification_requests
    DROP CONSTRAINT IF EXISTS lmr_manager_decision_check;
  ALTER TABLE public.loan_modification_requests
    ADD CONSTRAINT lmr_manager_decision_check
    CHECK (manager_decision IS NULL OR manager_decision IN ('approved', 'rejected'));
END $$;

-- ---------------------------------------------------------------------------
-- 2. Status domain. 'pending' is retained ONLY for pre-existing rows.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.loan_modification_requests') IS NULL THEN RETURN; END IF;

  ALTER TABLE public.loan_modification_requests
    DROP CONSTRAINT IF EXISTS loan_modification_requests_status_check;
  ALTER TABLE public.loan_modification_requests
    ADD CONSTRAINT loan_modification_requests_status_check
    CHECK (status IN (
      'pending',                          -- legacy, read-only going forward
      'pending_branch_manager_review',
      'pending_risk_review',
      'approved',
      'rejected'
    ));

  -- New submissions default to the manager gate even if a client omits status.
  ALTER TABLE public.loan_modification_requests
    ALTER COLUMN status SET DEFAULT 'pending_branch_manager_review';
END $$;

-- Index supporting the per-stage queue queries the UI now issues.
CREATE INDEX IF NOT EXISTS loan_modification_requests_status_idx
  ON public.loan_modification_requests (status, created_at DESC);

-- ---------------------------------------------------------------------------
-- 3. Stage-transition trigger — the strongest guarantee available here.
--
--    A CHECK constraint cannot see OLD, so the transition rule is enforced by
--    a BEFORE UPDATE trigger instead. Unlike RLS this also binds SECURITY
--    DEFINER functions and the service_role, so no caller can skip a stage or
--    revive a terminal request. Mirrors ALLOWED_TRANSITIONS in
--    src/lib/modificationWorkflow.ts exactly.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_modification_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Unchanged status: an unrelated column edit, always allowed.
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'pending_branch_manager_review'
     AND NEW.status IN ('pending_risk_review', 'rejected') THEN
    RETURN NEW;
  END IF;

  -- 'pending' is the legacy single-stage equivalent of pending_risk_review.
  IF OLD.status IN ('pending_risk_review', 'pending')
     AND NEW.status IN ('approved', 'rejected') THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION
    'Invalid modification-request status transition: % -> %. A rejected or approved request cannot be re-decided; submit a new request instead.',
    OLD.status, NEW.status
    USING ERRCODE = 'check_violation';
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.loan_modification_requests') IS NULL THEN RETURN; END IF;
  DROP TRIGGER IF EXISTS trg_enforce_modification_status_transition
    ON public.loan_modification_requests;
  EXECUTE 'CREATE TRIGGER trg_enforce_modification_status_transition
           BEFORE UPDATE ON public.loan_modification_requests
           FOR EACH ROW EXECUTE FUNCTION public.enforce_modification_status_transition()';
END $$;

-- ---------------------------------------------------------------------------
-- 4. RLS — per-stage, per-role. Replaces the unscoped lmr_update_risk.
-- ---------------------------------------------------------------------------
ALTER TABLE public.loan_modification_requests ENABLE ROW LEVEL SECURITY;

-- 4a. INSERT: the three branch-side roles may submit their OWN request, and
--     only into the manager gate. Defense in depth — the app also sets this,
--     but the DB enforces it regardless of client bugs or a stale bundle.
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
    AND status = 'pending_branch_manager_review'
  );

-- 4b. SELECT: employee sees only their own (unchanged).
DROP POLICY IF EXISTS "lmr_select_employee" ON public.loan_modification_requests;
CREATE POLICY "lmr_select_employee"
  ON public.loan_modification_requests
  FOR SELECT
  TO authenticated
  USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'branch_employee'
    AND requested_by = auth.uid()
  );

-- 4c. SELECT: branch_manager sees every request at every stage (unchanged) —
--     the manager needs the full history, not just their own queue.
DROP POLICY IF EXISTS "lmr_select_manager" ON public.loan_modification_requests;
CREATE POLICY "lmr_select_manager"
  ON public.loan_modification_requests
  FOR SELECT
  TO authenticated
  USING ((auth.jwt() -> 'user_metadata' ->> 'role') = 'branch_manager');

-- 4d. SELECT: risk_department must NOT see a request still at the manager
--     gate. Same shape as risk_select_all_requests on approval_requests
--     (20260727130000). Manager-rejected requests remain visible for audit
--     but are not actionable — the UPDATE policy below is what blocks action.
DROP POLICY IF EXISTS "lmr_select_risk" ON public.loan_modification_requests;
CREATE POLICY "lmr_select_risk"
  ON public.loan_modification_requests
  FOR SELECT
  TO authenticated
  USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'risk_department'
    AND status <> 'pending_branch_manager_review'
  );

-- 4e. UPDATE: branch_manager may decide ONLY at the manager gate, and may
--     only move the request to the risk gate or reject it.
DROP POLICY IF EXISTS "lmr_manager_decision" ON public.loan_modification_requests;
CREATE POLICY "lmr_manager_decision"
  ON public.loan_modification_requests
  FOR UPDATE
  TO authenticated
  USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'branch_manager'
    AND status = 'pending_branch_manager_review'
  )
  WITH CHECK (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'branch_manager'
    AND status IN ('pending_risk_review', 'rejected')
  );

-- 4f. UPDATE: risk_department may decide ONLY at the risk gate (or on a
--     legacy 'pending' row), and may only finalize.
--
--     CRITICAL: the old "lmr_update_risk" policy had no status scoping at
--     all. Since permissive policies are OR'd together, leaving it in place
--     would let risk_department bypass the manager gate entirely. It is
--     fully superseded and is dropped outright.
DROP POLICY IF EXISTS "lmr_update_risk"    ON public.loan_modification_requests;
DROP POLICY IF EXISTS "lmr_risk_decision"  ON public.loan_modification_requests;
CREATE POLICY "lmr_risk_decision"
  ON public.loan_modification_requests
  FOR UPDATE
  TO authenticated
  USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'risk_department'
    AND status IN ('pending_risk_review', 'pending')
  )
  WITH CHECK (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'risk_department'
    AND status IN ('approved', 'rejected')
  );

-- No DELETE policy => deletes remain denied for every role.

-- ---------------------------------------------------------------------------
-- 5. Stage-specific audit logging.
--    Replaces the previous generic "Approved/Rejected modification request"
--    text so the audit log distinguishes WHICH stage decided.
-- ---------------------------------------------------------------------------
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
  note   TEXT;
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

  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  actor := auth.uid();
  SELECT full_name, role INTO a_name, a_role FROM public.profiles WHERE id = actor;

  IF OLD.status = 'pending_branch_manager_review'
     AND NEW.status = 'pending_risk_review' THEN
    act  := 'Branch Manager approved modification request (sent to Risk Department)';
    note := NEW.manager_decision_note;
  ELSIF OLD.status = 'pending_branch_manager_review'
     AND NEW.status = 'rejected' THEN
    act  := 'Branch Manager rejected modification request';
    note := NEW.manager_decision_note;
    sev  := 'warning';
  ELSIF NEW.status = 'approved' THEN
    act  := 'Risk Department approved modification request';
    note := NEW.review_note;
  ELSIF NEW.status = 'rejected' THEN
    act  := 'Risk Department rejected modification request';
    note := NEW.review_note;
    sev  := 'warning';
  ELSE
    act  := 'Updated modification request';
    note := NEW.review_note;
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
    'Field: ' || NEW.field_name || COALESCE(' — ' || note, ''),
    sev
  );

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. Stage-separated decision RPCs.
--
--    The manager path deliberately CANNOT apply a field change — that logic
--    exists only in the risk path, so a manager decision is structurally
--    incapable of touching the source application.
-- ---------------------------------------------------------------------------

-- 6a. Branch Manager decision. Never applies the modification.
CREATE OR REPLACE FUNCTION public.decide_modification_request_as_manager(
  request_id    UUID,
  approve       BOOLEAN,
  decision_note TEXT DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_variable
DECLARE
  req        public.loan_modification_requests%ROWTYPE;
  new_status TEXT;
BEGIN
  IF (auth.jwt() -> 'user_metadata' ->> 'role') IS DISTINCT FROM 'branch_manager' THEN
    RAISE EXCEPTION 'Only branch_manager can perform the manager review step';
  END IF;

  SELECT * INTO req FROM public.loan_modification_requests WHERE id = request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Modification request % not found', request_id;
  END IF;

  IF req.status <> 'pending_branch_manager_review' THEN
    RAISE EXCEPTION
      'Request is not awaiting branch-manager review (current status: %)', req.status;
  END IF;

  new_status := CASE WHEN approve THEN 'pending_risk_review' ELSE 'rejected' END;

  UPDATE public.loan_modification_requests
  SET status                = new_status,
      manager_decision      = CASE WHEN approve THEN 'approved' ELSE 'rejected' END,
      manager_decision_by   = auth.uid(),
      manager_decision_at   = now(),
      manager_decision_note = decision_note
  WHERE id = request_id;

  RETURN json_build_object(
    'ok', true,
    'status', new_status,
    'stage', 'branch_manager',
    'applied', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.decide_modification_request_as_manager(UUID, BOOLEAN, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.decide_modification_request_as_manager(UUID, BOOLEAN, TEXT) TO authenticated;

-- 6b. Risk Department decision. The ONLY path that applies a field change.
--
--     The allow-list, the information_schema re-validation, and the
--     format(%I) identifier quoting are carried over verbatim from the
--     original review_loan_modification_request() — there is no injection
--     surface and that property must not regress.
CREATE OR REPLACE FUNCTION public.decide_modification_request_as_risk(
  request_id  UUID,
  approve     BOOLEAN,
  review_note TEXT DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_variable
DECLARE
  req      public.loan_modification_requests%ROWTYPE;
  allowed  TEXT[] := ARRAY[
    'customer_name', 'national_id', 'monthly_income', 'monthly_expenses',
    'existing_loans', 'employment_type', 'loan_amount', 'amount',
    'loan_purpose', 'notes'
  ];
  tbl      TEXT;
  col_type TEXT;
BEGIN
  IF (auth.jwt() -> 'user_metadata' ->> 'role') IS DISTINCT FROM 'risk_department' THEN
    RAISE EXCEPTION 'Only risk_department can perform the final review step';
  END IF;

  SELECT * INTO req FROM public.loan_modification_requests WHERE id = request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Modification request % not found', request_id;
  END IF;

  -- 'pending' is the legacy single-stage equivalent of pending_risk_review.
  IF req.status NOT IN ('pending_risk_review', 'pending') THEN
    IF req.status = 'pending_branch_manager_review' THEN
      RAISE EXCEPTION
        'Request is still awaiting branch-manager review and cannot be finalized by risk_department';
    END IF;
    RAISE EXCEPTION 'Request already reviewed (current status: %)', req.status;
  END IF;

  IF approve THEN
    IF NOT (req.field_name = ANY(allowed)) THEN
      RAISE EXCEPTION 'Field "%" is not allowed to be modified', req.field_name;
    END IF;

    IF EXISTS (SELECT 1 FROM public.approval_requests WHERE id = req.application_id) THEN
      tbl := 'approval_requests';
    ELSIF to_regclass('public.credit_applications') IS NOT NULL
          AND EXISTS (SELECT 1 FROM public.credit_applications WHERE id = req.application_id) THEN
      tbl := 'credit_applications';
    ELSE
      RAISE EXCEPTION
        'Source application % not found in approval_requests or credit_applications',
        req.application_id;
    END IF;

    SELECT data_type INTO col_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = tbl AND column_name = req.field_name;
    IF col_type IS NULL THEN
      RAISE EXCEPTION 'Column "%" does not exist on %', req.field_name, tbl;
    END IF;

    EXECUTE format('UPDATE public.%I SET %I = $1::%s WHERE id = $2', tbl, req.field_name, col_type)
    USING NULLIF(req.new_value, ''), req.application_id;

    UPDATE public.loan_modification_requests
    SET status      = 'approved',
        reviewed_by = auth.uid(),
        reviewed_at = now(),
        review_note = review_note
    WHERE id = request_id;

    RETURN json_build_object(
      'ok', true,
      'status', 'approved',
      'stage', 'risk_department',
      'applied', true,
      'table', tbl,
      'field', req.field_name
    );
  ELSE
    UPDATE public.loan_modification_requests
    SET status      = 'rejected',
        reviewed_by = auth.uid(),
        reviewed_at = now(),
        review_note = review_note
    WHERE id = request_id;

    RETURN json_build_object(
      'ok', true,
      'status', 'rejected',
      'stage', 'risk_department',
      'applied', false
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.decide_modification_request_as_risk(UUID, BOOLEAN, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.decide_modification_request_as_risk(UUID, BOOLEAN, TEXT) TO authenticated;

-- 6c. Backward-compatible wrapper.
--
--     review_loan_modification_request() previously performed the ONLY review
--     step and applied the change straight from 'pending'. It is kept so a
--     cached client bundle keeps working, but it now delegates to the risk
--     path — which means it can no longer finalize a request that is still
--     awaiting branch-manager review. Its old behaviour of approving directly
--     out of the manager stage is gone by construction, not by convention.
CREATE OR REPLACE FUNCTION public.review_loan_modification_request(
  request_id  UUID,
  approve     BOOLEAN,
  review_note TEXT DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_variable
BEGIN
  RETURN public.decide_modification_request_as_risk(request_id, approve, review_note);
END;
$$;

GRANT EXECUTE ON FUNCTION public.review_loan_modification_request(UUID, BOOLEAN, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- VERIFICATION — run these separately in the Supabase SQL Editor AFTER
-- applying the migration. Every query below is read-only except the two
-- clearly-marked negative tests at the end, which are wrapped in a
-- transaction that is ROLLED BACK.
-- ============================================================================
--
-- -- 1. Columns exist:
-- SELECT column_name, data_type
-- FROM information_schema.columns
-- WHERE table_schema = 'public'
--   AND table_name = 'loan_modification_requests'
--   AND column_name LIKE 'manager_decision%'
-- ORDER BY column_name;
-- -- expect 4 rows: manager_decision, manager_decision_at, manager_decision_by,
-- --                manager_decision_note
--
-- -- 2. Status domain updated:
-- SELECT pg_get_constraintdef(oid)
-- FROM pg_constraint
-- WHERE conname = 'loan_modification_requests_status_check';
-- -- expect all five values incl. 'pending_branch_manager_review'
--
-- -- 3. Policies are per-stage (the unscoped lmr_update_risk must be GONE):
-- SELECT policyname, cmd, qual, with_check
-- FROM pg_policies
-- WHERE schemaname = 'public' AND tablename = 'loan_modification_requests'
-- ORDER BY cmd, policyname;
-- -- expect: lmr_insert_roles (INSERT), lmr_select_employee/manager/risk
-- --         (SELECT), lmr_manager_decision + lmr_risk_decision (UPDATE).
-- --         "lmr_update_risk" must NOT appear.
--
-- -- 4. Transition trigger installed:
-- SELECT tgname FROM pg_trigger
-- WHERE tgrelid = 'public.loan_modification_requests'::regclass
--   AND NOT tgisinternal
-- ORDER BY tgname;
-- -- expect: trg_enforce_modification_status_transition,
-- --         trg_log_modification_insert, trg_log_modification_update
--
-- -- 5. Existing rows untouched (legacy 'pending' preserved):
-- SELECT status, count(*)
-- FROM public.loan_modification_requests
-- GROUP BY status ORDER BY status;
--
-- -- 6. NEGATIVE TEST — stage skipping is blocked. Rolled back, changes nothing:
-- -- BEGIN;
-- --   UPDATE public.loan_modification_requests
-- --   SET status = 'approved'
-- --   WHERE status = 'pending_branch_manager_review';
-- --   -- expect: ERROR ... Invalid modification-request status transition
-- -- ROLLBACK;
--
-- -- 7. NEGATIVE TEST — a terminal request cannot be revived. Rolled back:
-- -- BEGIN;
-- --   UPDATE public.loan_modification_requests
-- --   SET status = 'pending_risk_review'
-- --   WHERE status = 'rejected';
-- --   -- expect: ERROR ... Invalid modification-request status transition
-- -- ROLLBACK;
-- ============================================================================
