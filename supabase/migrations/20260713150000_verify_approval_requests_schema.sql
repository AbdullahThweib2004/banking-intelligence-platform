-- ============================================================================
-- Live schema self-check for the bank-calculator columns added by
-- 20260711130000_loan_assessment_fields.sql.
--
-- WHY: that migration already appends `NOTIFY pgrst, 'reload schema';` to
-- force PostgREST to pick up the new columns immediately, which fixes the
-- "Could not find the 'age_at_maturity' column ... in the schema cache"
-- error going forward IF the migration has actually been (re-)applied to
-- this project. What it can't do is tell you, before you hit that error
-- live, whether the migration has actually run here yet. This function
-- closes that gap: the frontend (src/lib/schemaVerification.ts) calls it
-- right after any insert/update that fails with a schema-cache-shaped
-- error, so the user gets one precise list of every missing column instead
-- of discovering them one at a time across repeated failed submissions.
--
-- SECURITY DEFINER is required only to read `information_schema.columns`
-- (bypassing nothing but RLS on approval_requests itself is irrelevant here
-- — this function never reads a single row of application data, only
-- column metadata). Same pattern as get_platform_stats().
--
-- Safe to re-run: CREATE OR REPLACE.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.verify_approval_requests_schema()
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT json_build_object(
    'missing_columns',
      (SELECT COALESCE(array_agg(t.col ORDER BY t.col), ARRAY[]::text[])
       FROM unnest(ARRAY[
         'loan_type', 'loan_currency', 'salary_currency', 'monthly_obligations',
         'client_age', 'loan_term_years', 'annual_interest_rate_used',
         'monthly_installment', 'total_interest', 'total_repaid',
         'debt_burden_ratio', 'age_at_maturity', 'eligibility_status', 'ai_explanation'
       ]) AS t(col)
       WHERE t.col NOT IN (
         SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'approval_requests'
       )),
    'checked_at', now()
  );
$$;

-- Column metadata only, never row data -> safe for every signed-in user.
GRANT EXECUTE ON FUNCTION public.verify_approval_requests_schema() TO authenticated;

-- Re-assert the schema-cache refresh in case this migration runs before
-- 20260711130000 has ever successfully notified PostgREST in this project.
NOTIFY pgrst, 'reload schema';
