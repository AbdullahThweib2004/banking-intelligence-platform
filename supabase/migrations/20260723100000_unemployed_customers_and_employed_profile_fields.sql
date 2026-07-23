-- ============================================================================
-- Splits "Open New Account" into two genuinely separate customer categories,
-- per the redesigned business logic:
--
--   EMPLOYED    -> public.bank_customers (unchanged table, now explicitly
--                  "the employed/loan-eligible customer table"; gains two
--                  columns captured from the employment-proof contract).
--                  Account numbers: BOP-100011, BOP-100012, ... (unchanged
--                  sequence from 20260711100000_bank_customers_account_sequence.sql).
--
--   UNEMPLOYED  -> public.unemployed_customers (NEW table, identity-only,
--                  no financial columns at all — there is nothing to fill
--                  with real OR fake data for this category).
--                  Account numbers: BOP-1, BOP-2, BOP-3, ... — a
--                  deliberately distinct, shorter format from the employed
--                  BOP-1NNNNN family so the two can never be confused or
--                  collide as strings.
--
-- WHY A SEPARATE TABLE (not a nullable "employment_status" column on
-- bank_customers): an unemployed customer is not loan-eligible, ever — by
-- putting them in a table Credit Risk's account-number lookup never queries
-- (src/pages/CreditRisk.tsx only reads from bank_customers), loan-ineligibility
-- is enforced structurally, not by a runtime flag that every future feature
-- would have to remember to check. This is the same reasoning as the
-- financial_profile_source column: prefer a fact that can't be forgotten
-- over a rule that has to be re-checked everywhere.
-- ============================================================================

-- 1. bank_customers: fields captured from the employment-proof contract -------
--    that weren't tracked before (salary currency, job role/title). Additive
--    and NOT NULL-with-default, so existing rows (including the 10 seed
--    rows) remain valid without a backfill.
DO $$
BEGIN
  IF to_regclass('public.bank_customers') IS NOT NULL THEN
    ALTER TABLE public.bank_customers
      ADD COLUMN IF NOT EXISTS salary_currency TEXT NOT NULL DEFAULT 'ILS';
    ALTER TABLE public.bank_customers
      ADD COLUMN IF NOT EXISTS job_role TEXT;

    ALTER TABLE public.bank_customers DROP CONSTRAINT IF EXISTS bank_customers_salary_currency_check;
    ALTER TABLE public.bank_customers
      ADD CONSTRAINT bank_customers_salary_currency_check
      CHECK (salary_currency IN ('ILS', 'USD', 'JOD'));
  END IF;
END $$;

-- 2. unemployed_customers: identity-only, no financial columns ---------------
CREATE TABLE IF NOT EXISTS public.unemployed_customers (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_number TEXT NOT NULL UNIQUE,
  customer_name  TEXT NOT NULL,
  national_id    TEXT NOT NULL UNIQUE,
  date_of_birth  DATE,
  father_name    TEXT,
  mother_name    TEXT,
  -- Always false. Not derived at query time on purpose — an explicit,
  -- self-documenting column beats a rule a future reader has to infer from
  -- "which table is this" or "does this table even have financial columns".
  loan_eligible  BOOLEAN NOT NULL DEFAULT false,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.unemployed_customers DROP CONSTRAINT IF EXISTS unemployed_customers_loan_eligible_always_false;
ALTER TABLE public.unemployed_customers
  ADD CONSTRAINT unemployed_customers_loan_eligible_always_false CHECK (loan_eligible = false);

ALTER TABLE public.unemployed_customers DROP CONSTRAINT IF EXISTS unemployed_customers_customer_name_length;
ALTER TABLE public.unemployed_customers
  ADD CONSTRAINT unemployed_customers_customer_name_length CHECK (char_length(customer_name) <= 250);

ALTER TABLE public.unemployed_customers DROP CONSTRAINT IF EXISTS unemployed_customers_national_id_length;
ALTER TABLE public.unemployed_customers
  ADD CONSTRAINT unemployed_customers_national_id_length CHECK (char_length(national_id) BETWEEN 7 AND 15);

CREATE INDEX IF NOT EXISTS unemployed_customers_account_number_idx
  ON public.unemployed_customers (account_number);

-- 3. Account-number generation: BOP-1, BOP-2, BOP-3, ... ----------------------
--    Deliberately a plain, unpadded integer suffix (not BOP-1NNNNN like
--    bank_customers) so the two formats can never collide or be confused as
--    strings, and so an exact-match lookup against one table can never
--    accidentally hit a row that belongs to the other.
CREATE SEQUENCE IF NOT EXISTS public.unemployed_customers_account_number_seq;

DO $$
DECLARE
  current_max INTEGER;
BEGIN
  SELECT MAX((regexp_match(account_number, '^BOP-(\d+)$'))[1]::int)
  INTO current_max
  FROM public.unemployed_customers;

  -- A brand-new/empty table has no rows to fast-forward past — a freshly
  -- created sequence's first nextval() is already 1, and setval() itself
  -- would reject 0 (below the sequence's MINVALUE 1). Only advance the
  -- sequence when there's an actual existing max to continue after.
  IF current_max IS NOT NULL THEN
    PERFORM setval('public.unemployed_customers_account_number_seq', current_max, true);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.generate_unemployed_customer_account_number()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.account_number IS NULL OR btrim(NEW.account_number) = '' THEN
    NEW.account_number := 'BOP-' || nextval('public.unemployed_customers_account_number_seq')::text;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_generate_unemployed_customer_account_number ON public.unemployed_customers;
CREATE TRIGGER trg_generate_unemployed_customer_account_number
  BEFORE INSERT ON public.unemployed_customers
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_unemployed_customer_account_number();

-- 4. RLS: same shape as bank_customers (SELECT for all authenticated staff,
--    INSERT restricted to the two account-opening roles) --------------------
ALTER TABLE public.unemployed_customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS unemployed_customers_select_authenticated ON public.unemployed_customers;
CREATE POLICY unemployed_customers_select_authenticated
  ON public.unemployed_customers
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS unemployed_customers_insert_account_opening ON public.unemployed_customers;
CREATE POLICY unemployed_customers_insert_account_opening
  ON public.unemployed_customers
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (auth.jwt() -> 'user_metadata' ->> 'role') IN ('branch_employee', 'branch_manager')
  );

-- 5. Realtime, matching bank_customers ---------------------------------------
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.unemployed_customers;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- Verify (optional):
--   INSERT INTO public.unemployed_customers (customer_name, national_id)
--   VALUES ('Test Unemployed', '999999999998')
--   RETURNING account_number;  -- expect BOP-1 on a freshly created table
--
--   INSERT INTO public.bank_customers
--     (customer_name, national_id, employment_type, loan_purpose, salary_currency, job_role)
--   VALUES ('Test Employed', '999999999999', 'employed', 'personal', 'USD', 'Manager')
--   RETURNING account_number, salary_currency, job_role;
-- ============================================================================
