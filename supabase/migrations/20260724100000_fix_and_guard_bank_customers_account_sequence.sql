-- ============================================================================
-- Recurring incident: bank_customers_account_number_seq keeps drifting into
-- the BOP-2xxxxx range — first BOP-200013 (fixed by
-- 20260711120000_fix_bank_customers_account_sequence.sql), then BOP-200018,
-- and now BOP-200019 appeared even AFTER BOP-200018 was deleted from the
-- table.
--
-- ROOT CAUSE of "I deleted the row and the next one was STILL wrong":
-- deleting a bank_customers ROW has ZERO effect on the SEQUENCE OBJECT's
-- internal counter — in Postgres these are two entirely separate things.
-- account_number values come from nextval() on
-- public.bank_customers_account_number_seq, a standalone counter that only
-- remembers the last value it handed out; it is never recomputed from the
-- table's current contents on each insert. If that counter's internal
-- position was ever advanced into the 200000s (e.g. because
-- 20260711120000's fix was never actually applied to this project, or an
-- out-of-family row was present the one time it fast-forwarded), every
-- future insert just keeps incrementing from wherever the sequence itself
-- currently sits — 200018 -> 200019 -> 200020 -> ... — regardless of which
-- rows exist, are deleted, or ever existed in the table.
--
-- THIS MIGRATION:
--   1. Forcibly recomputes and resets the sequence RIGHT NOW to the correct
--      family-scoped maximum (same logic as 20260711120000 — safe/idempotent
--      to re-run). This is what actually fixes the CURRENT wrong position,
--      regardless of whether that earlier migration ever ran here.
--   2. Adds a CHECK constraint making it structurally impossible for ANY
--      future account_number — from the trigger, or any other insert path —
--      to ever land outside the BOP-1NNNNN family again. Added NOT VALID so
--      it enforces the rule for all new/updated rows immediately without
--      requiring a blocking bulk-validation of historical rows (any other
--      stray row already in the table is left alone, but see the verify
--      query at the bottom to find them).
-- ============================================================================

DO $$
DECLARE
  corrected_max INTEGER;
BEGIN
  IF to_regclass('public.bank_customers_account_number_seq') IS NULL THEN
    RETURN;
  END IF;

  SELECT COALESCE(
    MAX((regexp_match(account_number, '^BOP-(1\d{5})$'))[1]::int),
    100010
  )
  INTO corrected_max
  FROM public.bank_customers;

  PERFORM setval('public.bank_customers_account_number_seq', corrected_max, true);
END $$;

DO $$
BEGIN
  IF to_regclass('public.bank_customers') IS NOT NULL THEN
    ALTER TABLE public.bank_customers DROP CONSTRAINT IF EXISTS bank_customers_account_number_family_check;
    ALTER TABLE public.bank_customers
      ADD CONSTRAINT bank_customers_account_number_family_check
      CHECK (account_number ~ '^BOP-1\d{5}$') NOT VALID;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- Verify (optional, run in the SQL Editor):
--
--   -- Confirm the sequence is now correctly positioned (should be 100010,
--   -- or the highest real BOP-1NNNNN account number you actually have):
--   SELECT last_value FROM public.bank_customers_account_number_seq;
--
--   -- Check for any OTHER stray/out-of-family rows still in the table —
--   -- the CHECK constraint above blocks NEW ones but does not remove any
--   -- that already exist:
--   SELECT account_number, customer_name, national_id, created_at
--   FROM public.bank_customers
--   WHERE account_number !~ '^BOP-1\d{5}$'
--   ORDER BY account_number;
--
--   -- Confirm the guardrail actually rejects a bad value:
--   -- INSERT INTO public.bank_customers
--   --   (account_number, customer_name, national_id, employment_type, loan_purpose)
--   -- VALUES ('BOP-999999', 'Guardrail Test', '000000000000', 'employed', 'personal');
--   -- (expect: ERROR — violates check constraint "bank_customers_account_number_family_check")
-- ============================================================================
