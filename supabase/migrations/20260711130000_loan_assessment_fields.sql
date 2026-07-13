-- ============================================================================
-- Bank-calculator-style loan assessment fields on approval_requests.
--
-- Context: the Credit Risk assessment flow is being refactored to model the
-- Bank of Palestine loan-calculator business rules (debt burden ratio cap,
-- age-at-maturity cap, EMI/annuity installment, product-based rate model)
-- instead of the previous ad hoc "debt service ratio" heuristic. This adds
-- the structured fields the new deterministic engine (src/lib/loan*.ts)
-- reads and writes, alongside the existing risk_* columns — nothing already
-- in use is removed or renamed.
--
-- All additive, idempotent (IF NOT EXISTS), safe to re-run. Existing rows get
-- NULL for every new column, which every reader treats as "not available /
-- legacy assessment" rather than erroring.
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('public.approval_requests') IS NOT NULL THEN

    -- Loan product + currencies (drive which rate model/band applies).
    ALTER TABLE public.approval_requests ADD COLUMN IF NOT EXISTS loan_type TEXT;
    ALTER TABLE public.approval_requests ADD COLUMN IF NOT EXISTS loan_currency TEXT;
    ALTER TABLE public.approval_requests ADD COLUMN IF NOT EXISTS salary_currency TEXT;

    -- Bank-calculator inputs not previously captured.
    ALTER TABLE public.approval_requests ADD COLUMN IF NOT EXISTS monthly_obligations NUMERIC(12, 2);
    ALTER TABLE public.approval_requests ADD COLUMN IF NOT EXISTS client_age INTEGER;
    ALTER TABLE public.approval_requests ADD COLUMN IF NOT EXISTS loan_term_years INTEGER;

    -- Deterministic calculation outputs (EMI/annuity + eligibility).
    ALTER TABLE public.approval_requests ADD COLUMN IF NOT EXISTS annual_interest_rate_used NUMERIC(6, 4);
    ALTER TABLE public.approval_requests ADD COLUMN IF NOT EXISTS monthly_installment NUMERIC(12, 2);
    ALTER TABLE public.approval_requests ADD COLUMN IF NOT EXISTS total_interest NUMERIC(14, 2);
    ALTER TABLE public.approval_requests ADD COLUMN IF NOT EXISTS total_repaid NUMERIC(14, 2);
    ALTER TABLE public.approval_requests ADD COLUMN IF NOT EXISTS debt_burden_ratio NUMERIC(6, 4);
    ALTER TABLE public.approval_requests ADD COLUMN IF NOT EXISTS age_at_maturity INTEGER;
    ALTER TABLE public.approval_requests ADD COLUMN IF NOT EXISTS eligibility_status TEXT;

    -- Raw AI narrative, kept separate from risk_explanation_summary (which is
    -- "whatever explanation is actually shown" — AI's if available, otherwise
    -- the deterministic fallback narrative). ai_explanation is NULL whenever
    -- AI did not run or failed, so its presence alone tells you AI succeeded.
    ALTER TABLE public.approval_requests ADD COLUMN IF NOT EXISTS ai_explanation TEXT;

    -- Constraints (idempotent: drop-then-add so re-running never fails).
    ALTER TABLE public.approval_requests DROP CONSTRAINT IF EXISTS approval_requests_loan_type_check;
    ALTER TABLE public.approval_requests
      ADD CONSTRAINT approval_requests_loan_type_check
      CHECK (loan_type IS NULL OR loan_type IN ('personal', 'personal_housing', 'mortgage_program'));

    ALTER TABLE public.approval_requests DROP CONSTRAINT IF EXISTS approval_requests_loan_currency_check;
    ALTER TABLE public.approval_requests
      ADD CONSTRAINT approval_requests_loan_currency_check
      CHECK (loan_currency IS NULL OR loan_currency IN ('ILS', 'USD', 'JOD'));

    ALTER TABLE public.approval_requests DROP CONSTRAINT IF EXISTS approval_requests_salary_currency_check;
    ALTER TABLE public.approval_requests
      ADD CONSTRAINT approval_requests_salary_currency_check
      CHECK (salary_currency IS NULL OR salary_currency IN ('ILS', 'USD', 'JOD'));

    ALTER TABLE public.approval_requests DROP CONSTRAINT IF EXISTS approval_requests_eligibility_status_check;
    ALTER TABLE public.approval_requests
      ADD CONSTRAINT approval_requests_eligibility_status_check
      CHECK (eligibility_status IS NULL OR eligibility_status IN ('eligible', 'not_eligible'));

    -- result_source previously allowed only 'ai' | 'algorithm' (enforced only in
    -- application code, no DB CHECK existed). The refactor introduces 'formula'
    -- (deterministic engine, no AI narrative) and 'hybrid' (deterministic engine
    -- + AI narrative on top). Old rows already stored as 'ai' or 'algorithm' are
    -- left untouched — both remain valid values for backward compatibility.
    ALTER TABLE public.approval_requests DROP CONSTRAINT IF EXISTS approval_requests_result_source_check;
    ALTER TABLE public.approval_requests
      ADD CONSTRAINT approval_requests_result_source_check
      CHECK (result_source IS NULL OR result_source IN ('ai', 'algorithm', 'formula', 'hybrid'));

  END IF;
END $$;

-- Tell PostgREST to pick up the new columns immediately. Supabase's DDL event
-- trigger normally does this automatically, but forcing it removes any doubt
-- / lag — without it, inserts referencing a brand-new column can fail with
-- "Could not find the '<column>' column of 'approval_requests' in the schema
-- cache" for a short window right after the migration runs.
NOTIFY pgrst, 'reload schema';
