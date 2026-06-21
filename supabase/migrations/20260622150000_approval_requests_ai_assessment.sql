-- ============================================================================
-- AI-powered credit assessment snapshot columns on approval_requests.
-- Builds on 20260622140000_approval_requests_risk_explanation.sql.
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('public.approval_requests') IS NOT NULL THEN
    -- Model confidence in the assessment (0..1), nullable.
    ALTER TABLE public.approval_requests
      ADD COLUMN IF NOT EXISTS risk_confidence NUMERIC(5, 4);

    -- AI recommended action: approve | manual_review | reject.
    ALTER TABLE public.approval_requests
      ADD COLUMN IF NOT EXISTS recommended_action TEXT;

    -- Where the result came from: 'ai' | 'algorithm'.
    ALTER TABLE public.approval_requests
      ADD COLUMN IF NOT EXISTS result_source TEXT;
  END IF;
END $$;
