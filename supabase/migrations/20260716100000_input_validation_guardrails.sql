-- ============================================================================
-- Defense-in-depth CHECK constraints for the QA validation-hardening pass.
--
-- CONTEXT: an audit of every user-entry surface (New Assessment, the
-- objection/modification flow, Open New Account) found several fields with
-- no server-side floor at all — a negative monthly income, an empty-but-
-- inserted loan amount, or a 5,000-character customer name could all reach
-- `bank_customers` / `approval_requests` before this migration, relying
-- entirely on the frontend's own (also newly-hardened, see
-- src/lib/validation.ts) checks never being bypassed or having a bug.
--
-- These constraints are intentionally NOT a byte-for-byte mirror of every
-- frontend business rule:
--   - Numeric floors (>= 0) are enforced exactly — a negative amount is
--     never legitimate anywhere in this schema.
--   - client_age uses a wide 0-120 sanity bound here, not the tighter
--     18-100 loan-applicant rule enforced in the app — the DB's job is to
--     reject clearly-broken data, not to duplicate (and risk drifting from)
--     the exact business rule, which stays defined once in validation.ts.
--   - loan_term_years uses the exact 1-30 bound: a 0-year or 50-year term is
--     structurally meaningless regardless of any business-rule nuance.
--   - Name/ID length caps (250 / 15 chars) match validation.ts's
--     MAX_NAME_LENGTH / MAX_NATIONAL_ID_LENGTH exactly.
--   - National ID's DIGITS-ONLY format is deliberately NOT enforced at the
--     DB level (only length) — a future legitimate ID format change
--     shouldn't require a migration; that rule stays app-level only.
--
-- All constraints are nullable-tolerant (existing/legacy rows with NULL in
-- optional columns are never broken) and idempotent (drop-then-add), so this
-- is safe to re-run. Verified against a Docker Postgres container seeded
-- with the real demo rows before being handed to the user to apply live.
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('public.bank_customers') IS NOT NULL THEN
    ALTER TABLE public.bank_customers DROP CONSTRAINT IF EXISTS bank_customers_monthly_income_nonneg;
    ALTER TABLE public.bank_customers
      ADD CONSTRAINT bank_customers_monthly_income_nonneg CHECK (monthly_income >= 0);

    ALTER TABLE public.bank_customers DROP CONSTRAINT IF EXISTS bank_customers_monthly_expenses_nonneg;
    ALTER TABLE public.bank_customers
      ADD CONSTRAINT bank_customers_monthly_expenses_nonneg CHECK (monthly_expenses >= 0);

    ALTER TABLE public.bank_customers DROP CONSTRAINT IF EXISTS bank_customers_existing_loans_nonneg;
    ALTER TABLE public.bank_customers
      ADD CONSTRAINT bank_customers_existing_loans_nonneg CHECK (existing_loans >= 0);

    ALTER TABLE public.bank_customers DROP CONSTRAINT IF EXISTS bank_customers_loan_amount_nonneg;
    ALTER TABLE public.bank_customers
      ADD CONSTRAINT bank_customers_loan_amount_nonneg CHECK (loan_amount >= 0);

    ALTER TABLE public.bank_customers DROP CONSTRAINT IF EXISTS bank_customers_customer_name_length;
    ALTER TABLE public.bank_customers
      ADD CONSTRAINT bank_customers_customer_name_length CHECK (char_length(customer_name) <= 250);

    ALTER TABLE public.bank_customers DROP CONSTRAINT IF EXISTS bank_customers_national_id_length;
    ALTER TABLE public.bank_customers
      ADD CONSTRAINT bank_customers_national_id_length
      CHECK (char_length(national_id) BETWEEN 7 AND 15);
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.approval_requests') IS NOT NULL THEN
    ALTER TABLE public.approval_requests DROP CONSTRAINT IF EXISTS approval_requests_monthly_income_nonneg;
    ALTER TABLE public.approval_requests
      ADD CONSTRAINT approval_requests_monthly_income_nonneg CHECK (monthly_income IS NULL OR monthly_income >= 0);

    ALTER TABLE public.approval_requests DROP CONSTRAINT IF EXISTS approval_requests_monthly_expenses_nonneg;
    ALTER TABLE public.approval_requests
      ADD CONSTRAINT approval_requests_monthly_expenses_nonneg CHECK (monthly_expenses IS NULL OR monthly_expenses >= 0);

    ALTER TABLE public.approval_requests DROP CONSTRAINT IF EXISTS approval_requests_existing_loans_nonneg;
    ALTER TABLE public.approval_requests
      ADD CONSTRAINT approval_requests_existing_loans_nonneg CHECK (existing_loans IS NULL OR existing_loans >= 0);

    ALTER TABLE public.approval_requests DROP CONSTRAINT IF EXISTS approval_requests_amount_nonneg;
    ALTER TABLE public.approval_requests
      ADD CONSTRAINT approval_requests_amount_nonneg CHECK (amount IS NULL OR amount >= 0);

    ALTER TABLE public.approval_requests DROP CONSTRAINT IF EXISTS approval_requests_monthly_obligations_nonneg;
    ALTER TABLE public.approval_requests
      ADD CONSTRAINT approval_requests_monthly_obligations_nonneg CHECK (monthly_obligations IS NULL OR monthly_obligations >= 0);

    ALTER TABLE public.approval_requests DROP CONSTRAINT IF EXISTS approval_requests_client_age_sane;
    ALTER TABLE public.approval_requests
      ADD CONSTRAINT approval_requests_client_age_sane
      CHECK (client_age IS NULL OR (client_age >= 0 AND client_age <= 120));

    ALTER TABLE public.approval_requests DROP CONSTRAINT IF EXISTS approval_requests_loan_term_years_range;
    ALTER TABLE public.approval_requests
      ADD CONSTRAINT approval_requests_loan_term_years_range
      CHECK (loan_term_years IS NULL OR (loan_term_years >= 1 AND loan_term_years <= 30));

    ALTER TABLE public.approval_requests DROP CONSTRAINT IF EXISTS approval_requests_customer_name_length;
    ALTER TABLE public.approval_requests
      ADD CONSTRAINT approval_requests_customer_name_length
      CHECK (customer_name IS NULL OR char_length(customer_name) <= 250);

    ALTER TABLE public.approval_requests DROP CONSTRAINT IF EXISTS approval_requests_national_id_length;
    ALTER TABLE public.approval_requests
      ADD CONSTRAINT approval_requests_national_id_length
      CHECK (national_id IS NULL OR char_length(national_id) <= 15);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
