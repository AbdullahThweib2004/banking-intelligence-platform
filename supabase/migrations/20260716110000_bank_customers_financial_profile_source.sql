-- ============================================================================
-- Adds provenance tracking for a bank_customers row's financial profile
-- (monthly_income, monthly_expenses, existing_loans, employment_type,
-- loan_amount, loan_purpose).
--
-- CONTEXT: the "Open New Account" wizard used to fill these NOT NULL columns
-- with random, clearly-fake placeholder values (see the now-removed call to
-- generateDefaultCustomerFinancialProfile() in src/lib/bankCustomers.ts).
-- The wizard now has a real "Employment Proof Upload" step that retrieves an
-- existing customer's real financial data from this same table when a
-- reliable match exists, instead of inventing numbers.
--
-- Because these columns are NOT NULL (a real, structural constraint — see
-- 20260621100000_bank_customers.sql), an unresolved profile can't be left as
-- SQL NULL. Instead it's written as the columns' own zero/neutral defaults
-- AND flagged via this new column, so nothing downstream (Credit Risk
-- scoring, the chat assistant, reporting) can mistake "we don't know yet"
-- for "verified zero income" without also seeing the flag.
--
-- Values:
--   'database_match'          — retrieved from an existing bank_customers
--                                row matched by exact national_id.
--   'employment_proof_extracted' — taken from the OCR'd employment-proof
--                                document itself (no DB match existed).
--   'manual_entry'             — staff typed the values in during review.
--   'unresolved_needs_review'  — no reliable source was found; numeric
--                                columns hold their zero/neutral defaults
--                                and MUST NOT be treated as real data.
--   'unknown'                  — default for rows created before this
--                                migration (including the seed/demo rows) —
--                                deliberately not reclassified retroactively,
--                                since their real provenance isn't known.
--
-- Idempotent (drop-then-add) and safe to re-run.
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('public.bank_customers') IS NOT NULL THEN
    ALTER TABLE public.bank_customers
      ADD COLUMN IF NOT EXISTS financial_profile_source TEXT NOT NULL DEFAULT 'unknown';

    ALTER TABLE public.bank_customers DROP CONSTRAINT IF EXISTS bank_customers_financial_profile_source_check;
    ALTER TABLE public.bank_customers
      ADD CONSTRAINT bank_customers_financial_profile_source_check
      CHECK (financial_profile_source IN (
        'database_match',
        'employment_proof_extracted',
        'manual_entry',
        'unresolved_needs_review',
        'unknown'
      ));
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
