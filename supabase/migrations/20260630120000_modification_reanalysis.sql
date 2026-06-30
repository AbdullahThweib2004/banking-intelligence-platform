-- ============================================================================
-- Re-analysis after an approved loan modification.
--
-- When the Risk Department approves a modification that changes a scoring input
-- (loan amount, income, expenses, existing loans, employment), the app reruns
-- the SAME AI credit-assessment pipeline and overwrites the score/category on
-- approval_requests. This migration adds:
--   * reanalysis_status / reanalysis_at / reanalysis_error on approval_requests
--   * risk_reanalysis_history (audit/comparison trail: old vs new score)
--
-- Idempotent + additive. No existing column/policy is removed destructively.
-- ============================================================================

-- 1. Re-analysis status columns on approval_requests ------------------------
DO $$
BEGIN
  IF to_regclass('public.approval_requests') IS NOT NULL THEN
    ALTER TABLE public.approval_requests ADD COLUMN IF NOT EXISTS reanalysis_status TEXT;
    ALTER TABLE public.approval_requests ADD COLUMN IF NOT EXISTS reanalysis_at     TIMESTAMPTZ;
    ALTER TABLE public.approval_requests ADD COLUMN IF NOT EXISTS reanalysis_error  TEXT;

    ALTER TABLE public.approval_requests DROP CONSTRAINT IF EXISTS approval_requests_reanalysis_status_check;
    ALTER TABLE public.approval_requests
      ADD CONSTRAINT approval_requests_reanalysis_status_check
      CHECK (reanalysis_status IS NULL OR reanalysis_status IN ('pending', 'completed', 'failed'));
  END IF;
END $$;

-- 2. History table -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.risk_reanalysis_history (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL,
  old_score      NUMERIC,
  new_score      NUMERIC,
  old_category   TEXT,
  new_category   TEXT,
  modified_fields TEXT,
  status         TEXT NOT NULL DEFAULT 'completed',
  actor_id       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_name     TEXT,
  error_message  TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.risk_reanalysis_history DROP CONSTRAINT IF EXISTS risk_reanalysis_history_status_check;
ALTER TABLE public.risk_reanalysis_history
  ADD CONSTRAINT risk_reanalysis_history_status_check
  CHECK (status IN ('completed', 'failed'));

CREATE INDEX IF NOT EXISTS risk_reanalysis_history_app_idx
  ON public.risk_reanalysis_history (application_id, created_at DESC);

-- 3. RLS ---------------------------------------------------------------------
ALTER TABLE public.risk_reanalysis_history ENABLE ROW LEVEL SECURITY;

-- SELECT: risk_department and branch_manager can read the trail.
DROP POLICY IF EXISTS "risk_reanalysis_history_select" ON public.risk_reanalysis_history;
CREATE POLICY "risk_reanalysis_history_select"
  ON public.risk_reanalysis_history
  FOR SELECT
  TO authenticated
  USING ((auth.jwt() -> 'user_metadata' ->> 'role') IN ('risk_department', 'branch_manager'));

-- INSERT: the acting reviewer records their own re-analysis row.
DROP POLICY IF EXISTS "risk_reanalysis_history_insert" ON public.risk_reanalysis_history;
CREATE POLICY "risk_reanalysis_history_insert"
  ON public.risk_reanalysis_history
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = actor_id);

-- No UPDATE / DELETE policies => append-only history.
