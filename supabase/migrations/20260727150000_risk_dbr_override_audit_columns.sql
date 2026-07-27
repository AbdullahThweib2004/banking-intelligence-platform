-- ============================================================================
-- Risk-stage override audit trail for the DBR/age-at-maturity rule engine.
--
-- The deterministic DBR (Debt Burden Ratio) and age-at-maturity rule engine
-- already exists (src/lib/loanEligibility.ts) and its result is already
-- stored per-row as `eligibility_status` ('eligible' | 'not_eligible') plus
-- the full breakdown inside `risk_derived_features` (debt_burden_ratio,
-- age_at_maturity, eligibility_reasons). This migration does NOT change that
-- engine or its thresholds — it only adds columns to record when
-- risk_department chooses to approve a request DESPITE a failed rule
-- ('not_eligible'), which the app now requires an explicit typed reason for.
--
-- Idempotent + safe to re-run: column adds are IF NOT EXISTS.
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('public.approval_requests') IS NOT NULL THEN
    ALTER TABLE public.approval_requests ADD COLUMN IF NOT EXISTS risk_override_reason TEXT;
    ALTER TABLE public.approval_requests ADD COLUMN IF NOT EXISTS risk_override_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
    ALTER TABLE public.approval_requests ADD COLUMN IF NOT EXISTS risk_override_at TIMESTAMPTZ;

    -- Defense in depth: the app already disables Approve client-side until an
    -- override reason is typed for a 'not_eligible' request, but the DB
    -- enforces it too so a stale client can't bypass it. Added NOT VALID so
    -- it enforces the rule for all new/updated rows immediately without a
    -- blocking bulk-validation of historical rows (approvals made before this
    -- requirement existed are left alone).
    ALTER TABLE public.approval_requests DROP CONSTRAINT IF EXISTS approval_requests_risk_override_required_check;
    ALTER TABLE public.approval_requests
      ADD CONSTRAINT approval_requests_risk_override_required_check
      CHECK (
        NOT (status = 'approved' AND eligibility_status = 'not_eligible' AND risk_override_reason IS NULL)
      ) NOT VALID;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- Verify (optional, run in the SQL Editor):
--   SELECT column_name FROM information_schema.columns
--   WHERE table_schema = 'public' AND table_name = 'approval_requests'
--     AND column_name LIKE 'risk_override%';
-- ============================================================================
