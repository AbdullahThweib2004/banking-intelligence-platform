-- ============================================================================
-- Persist credit risk explanation snapshot on approval_requests (credit type).
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('public.approval_requests') IS NOT NULL THEN
    ALTER TABLE public.approval_requests
      ADD COLUMN IF NOT EXISTS risk_explanation_summary TEXT;

    ALTER TABLE public.approval_requests
      ADD COLUMN IF NOT EXISTS risk_top_factors JSONB;

    ALTER TABLE public.approval_requests
      ADD COLUMN IF NOT EXISTS risk_derived_features JSONB;

    ALTER TABLE public.approval_requests
      ADD COLUMN IF NOT EXISTS assessed_at TIMESTAMPTZ;
  END IF;
END $$;
