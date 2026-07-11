-- ============================================================================
-- Real account-number generation for bank_customers.
--
-- Previously the only bank_customers rows were the 10 fixed demo seed rows
-- (BOP-100001..BOP-100010) inserted directly by earlier migrations with an
-- explicit account_number. There was no mechanism for the app itself to
-- create a NEW customer with a real, unique, sequential account number — the
-- "Open New Account" wizard on the Documents page only produced a PDF and a
-- `documents` row, never a `bank_customers` row.
--
-- This migration adds:
--   1. A Postgres sequence seeded to continue after the highest existing
--      BOP-NNNNNN account number currently in the table, so the very first
--      customer created after this migration gets BOP-100011, the next gets
--      BOP-100012, and so on.
--   2. A BEFORE INSERT trigger that fills bank_customers.account_number from
--      that sequence whenever the caller leaves it NULL/blank. This is the
--      only safe way to hand out account numbers: sequence nextval() is
--      atomic and race-free under concurrent inserts, unlike "read the
--      current max row and add 1" logic computed in application code, which
--      can double-assign the same number under concurrent requests.
--   3. A UNIQUE constraint on national_id (all 10 seed rows already have
--      distinct ids, so this is safe to add) so the same person can't be
--      onboarded twice.
--   4. An INSERT policy so branch_employee / branch_manager (the two roles
--      allowed to open accounts — see ACCOUNT_OPENING_ROLES in
--      src/lib/roles.ts) can actually write the row. bank_customers
--      previously only had a SELECT policy.
--   5. Realtime publication for bank_customers, so the frontend can show a
--      live "most recently added customer" hint without polling.
--
-- Idempotent: safe to re-run.
-- ============================================================================

-- 1. Sequence -----------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS public.bank_customers_account_number_seq;

-- Fast-forward the sequence to continue after the highest existing
-- BOP-1NNNNN account number currently in the table. Falls back to 100010 if
-- the table is empty or has no numeric BOP-1* rows yet, so the very first
-- generated number is still BOP-100011 either way.
--
-- The scan is deliberately restricted to the BOP-1##### family (100000..
-- 199999) rather than matching any "BOP-<digits>" value — a table that ever
-- contains an out-of-family account_number (manual test data, an import,
-- etc.) must never be able to skew this computation. See
-- 20260711120000_fix_bank_customers_account_sequence.sql for the incident
-- this specifically guards against.
DO $$
DECLARE
  current_max INTEGER;
BEGIN
  SELECT COALESCE(
    MAX((regexp_match(account_number, '^BOP-(1\d{5})$'))[1]::int),
    100010
  )
  INTO current_max
  FROM public.bank_customers;

  PERFORM setval('public.bank_customers_account_number_seq', current_max, true);
END $$;

-- 2. Trigger function + trigger ------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_bank_customer_account_number()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.account_number IS NULL OR btrim(NEW.account_number) = '' THEN
    NEW.account_number := 'BOP-' || nextval('public.bank_customers_account_number_seq')::text;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_generate_bank_customer_account_number ON public.bank_customers;
CREATE TRIGGER trg_generate_bank_customer_account_number
  BEFORE INSERT ON public.bank_customers
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_bank_customer_account_number();

-- 3. Prevent onboarding the same person twice ----------------------------------
ALTER TABLE public.bank_customers DROP CONSTRAINT IF EXISTS bank_customers_national_id_key;
ALTER TABLE public.bank_customers ADD CONSTRAINT bank_customers_national_id_key UNIQUE (national_id);

-- 4. RLS: allow the two account-opening roles to insert ------------------------
ALTER TABLE public.bank_customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bank_customers_insert_account_opening ON public.bank_customers;
CREATE POLICY bank_customers_insert_account_opening
  ON public.bank_customers
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (auth.jwt() -> 'user_metadata' ->> 'role') IN ('branch_employee', 'branch_manager')
  );

-- 5. Realtime -------------------------------------------------------------------
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.bank_customers;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- Verify (optional):
--   INSERT INTO public.bank_customers
--     (customer_name, national_id, employment_type, loan_purpose)
--   VALUES ('Test Customer', '999999999999', 'employed', 'personal')
--   RETURNING account_number;  -- expect BOP-100011 on a freshly seeded DB
-- ============================================================================
