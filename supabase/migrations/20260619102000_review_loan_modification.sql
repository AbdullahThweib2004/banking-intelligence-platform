-- ============================================================================
-- Risk review + apply workflow for loan modification requests.
--
-- public.review_loan_modification_request(request_id, approve, review_note)
--   * Only risk_department may call it (checked from the JWT).
--   * On approve: applies the single requested field to the real source record
--     (approval_requests first, then credit_applications), then marks the
--     request approved.
--   * On reject: marks the request rejected; the source record is untouched.
--   * Always sets reviewed_by / reviewed_at / review_note.
--
-- SAFETY: the column to change is validated against a fixed allow-list AND
-- against information_schema, and the UPDATE is built with format(%I) so there
-- is no SQL injection surface. The value is cast to the column's real type.
--
-- Audit logging keeps working via the AFTER UPDATE trigger on
-- loan_modification_requests (status change) added in the previous migration.
-- ============================================================================

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
DECLARE
  req       public.loan_modification_requests%ROWTYPE;
  allowed   TEXT[] := ARRAY[
    'customer_name', 'national_id', 'monthly_income', 'monthly_expenses',
    'existing_loans', 'employment_type', 'loan_amount', 'amount',
    'loan_purpose', 'notes'
  ];
  tbl       TEXT;
  col_type  TEXT;
BEGIN
  -- 1. Authorize: risk_department only.
  IF (auth.jwt() -> 'user_metadata' ->> 'role') IS DISTINCT FROM 'risk_department' THEN
    RAISE EXCEPTION 'Only risk_department can review modification requests';
  END IF;

  -- 2. Load the request and make sure it is still pending.
  SELECT * INTO req FROM public.loan_modification_requests WHERE id = request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Modification request % not found', request_id;
  END IF;
  IF req.status <> 'pending' THEN
    RAISE EXCEPTION 'Request already reviewed (current status: %)', req.status;
  END IF;

  IF approve THEN
    -- 3. Validate the field against the allow-list.
    IF NOT (req.field_name = ANY(allowed)) THEN
      RAISE EXCEPTION 'Field "%" is not allowed to be modified', req.field_name;
    END IF;

    -- 4. Resolve the source table (same order as the employee load flow).
    IF EXISTS (SELECT 1 FROM public.approval_requests WHERE id = req.application_id) THEN
      tbl := 'approval_requests';
    ELSIF to_regclass('public.credit_applications') IS NOT NULL
          AND EXISTS (SELECT 1 FROM public.credit_applications WHERE id = req.application_id) THEN
      tbl := 'credit_applications';
    ELSE
      RAISE EXCEPTION 'Source application % not found in approval_requests or credit_applications', req.application_id;
    END IF;

    -- 5. Defense in depth: confirm the column exists on that table.
    SELECT data_type INTO col_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = tbl AND column_name = req.field_name;
    IF col_type IS NULL THEN
      RAISE EXCEPTION 'Column "%" does not exist on %', req.field_name, tbl;
    END IF;

    -- 6. Apply the change to the single requested field, cast to its real type.
    EXECUTE format('UPDATE public.%I SET %I = $1::%s WHERE id = $2', tbl, req.field_name, col_type)
    USING NULLIF(req.new_value, ''), req.application_id;

    UPDATE public.loan_modification_requests
    SET status      = 'approved',
        reviewed_by = auth.uid(),
        reviewed_at = now(),
        review_note = review_note
    WHERE id = request_id;

    RETURN json_build_object('ok', true, 'status', 'approved', 'table', tbl, 'field', req.field_name);
  ELSE
    UPDATE public.loan_modification_requests
    SET status      = 'rejected',
        reviewed_by = auth.uid(),
        reviewed_at = now(),
        review_note = review_note
    WHERE id = request_id;

    RETURN json_build_object('ok', true, 'status', 'rejected');
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.review_loan_modification_request(UUID, BOOLEAN, TEXT) TO authenticated;
