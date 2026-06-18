-- ============================================================================
-- Global platform statistics for the top summary cards.
--
-- WHY A SECURITY DEFINER FUNCTION:
--   The role-aware RLS policies restrict branch_employee to their OWN rows.
--   A plain count(*) from an employee would therefore return only their own
--   numbers. These top cards must be IDENTICAL for all three roles, so we
--   compute the aggregates inside a SECURITY DEFINER function that runs with
--   the definer's privileges (bypassing RLS) and only ever returns aggregate
--   counts -- never individual rows. Safe to expose to every authenticated user.
--
-- DATA SOURCE: approval_requests is the table the app actually populates
-- (the New Assessment form inserts loan/credit rows there). credit_applications
-- is effectively empty, so ALL aggregates below read from approval_requests.
-- The JSON keys keep the original "credit_*" names so the frontend mapping is
-- unchanged.
--
-- Exact column values used (taken from the app's own enums):
--   approval_requests.status        : pending | approved | rejected
--   approval_requests.risk_category : low | medium | high
--   approval_requests.priority      : normal | high | urgent
--
-- Re-runnable: CREATE OR REPLACE.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_platform_stats()
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT json_build_object(
    -- Dashboard cards (sourced from approval_requests)
    'credit_total',
      (SELECT count(*) FROM approval_requests),
    'credit_pending',
      (SELECT count(*) FROM approval_requests WHERE status = 'pending'),
    'credit_approved_today',
      (SELECT count(*) FROM approval_requests
        WHERE status = 'approved'
          AND approved_at >= date_trunc('day', now())),
    'credit_avg_risk',
      (SELECT COALESCE(round(avg(risk_score)::numeric, 1), 0)
        FROM approval_requests WHERE risk_score IS NOT NULL),

    -- Credit Risk cards (sourced from approval_requests)
    'credit_low',
      (SELECT count(*) FROM approval_requests WHERE risk_category = 'low'),
    'credit_medium',
      (SELECT count(*) FROM approval_requests WHERE risk_category = 'medium'),
    'credit_high',
      (SELECT count(*) FROM approval_requests WHERE risk_category = 'high'),

    -- Approvals cards
    'approvals_pending',
      (SELECT count(*) FROM approval_requests WHERE status = 'pending'),
    'approvals_urgent',
      (SELECT count(*) FROM approval_requests WHERE priority = 'urgent'),
    'approvals_approved_today',
      (SELECT count(*) FROM approval_requests
        WHERE status = 'approved'
          AND approved_at >= date_trunc('day', now())),
    'approvals_avg_hours',
      (SELECT COALESCE(
          round((avg(extract(epoch FROM (approved_at - created_at)) / 3600.0))::numeric, 1),
          0)
        FROM approval_requests
        WHERE status = 'approved' AND approved_at IS NOT NULL)
  );
$$;

-- Aggregates only -> safe for every signed-in user (and anon if you want public stats).
GRANT EXECUTE ON FUNCTION public.get_platform_stats() TO anon, authenticated;
