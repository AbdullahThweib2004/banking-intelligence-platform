-- ============================================================================
-- Fix: bank_customers account-number sequence produced BOP-200013 instead of
-- BOP-100011 on its first real use.
--
-- ROOT CAUSE
-- ----------
-- The previous migration (20260711100000_bank_customers_account_sequence.sql)
-- fast-forwards the sequence with:
--
--   SELECT COALESCE(MAX((regexp_match(account_number, '^BOP-(\d+)$'))[1]::int), 100010)
--   FROM public.bank_customers;
--
-- That regex — '^BOP-(\d+)$' — matches ANY "BOP-<digits>" value, regardless of
-- how many digits or what range. The 10 demo seed rows are all in the
-- intended BOP-100001..BOP-100010 family, but the live table already
-- contained at least one row whose account_number was in a DIFFERENT,
-- unrelated numeric family (e.g. something like BOP-200012, created outside
-- this migration/app — there is no code path anywhere in this repo that ever
-- wrote a BOP-200… value, so that row predates or is external to this
-- feature). MAX() picked up that larger, out-of-family number, the sequence
-- was fast-forwarded to it, and the very next real insert got BOP-200013.
--
-- There was never a hardcoded "200000" offset anywhere in the SQL, the
-- trigger function, or the frontend — the trigger has always just done
-- 'BOP-' || nextval(seq). The bug was the MAX scan being poisoned by a single
-- pre-existing out-of-family row.
--
-- THE FIX
-- -------
-- Restrict the scan to the ONLY family this feature is allowed to produce or
-- consider: 'BOP-1' followed by exactly 5 digits (BOP-100000..BOP-199999).
-- Any row outside that family (like the stray BOP-200013) is now completely
-- invisible to this computation, permanently — not just today. This also
-- future-proofs the sequence against any other out-of-family row that might
-- ever show up in the table (manual test inserts, imports, etc.).
--
-- Re-running this migration is always safe: it recomputes from the current
-- table contents every time and only ever moves the sequence forward to the
-- correct next value for the BOP-1xxxxx family.
-- ============================================================================

DO $$
DECLARE
  corrected_max INTEGER;
BEGIN
  SELECT COALESCE(
    MAX((regexp_match(account_number, '^BOP-(1\d{5})$'))[1]::int),
    100010
  )
  INTO corrected_max
  FROM public.bank_customers;

  PERFORM setval('public.bank_customers_account_number_seq', corrected_max, true);
END $$;

-- ============================================================================
-- Existing bad row (e.g. BOP-200013), if one was already created by the
-- earlier bug:
--
-- It is intentionally NOT renumbered by this migration. That customer row
-- (name, national_id, financial profile) is still valid, real data — only
-- its account_number is outside the intended family. Renumbering it
-- automatically is riskier than leaving it: bank_customers.account_number is
-- looked up by exact text elsewhere in the app (Credit Risk's "New
-- Assessment" account lookup, the Approvals/Credit Risk "account_number"
-- snapshot column), so silently changing it here could desync anything that
-- already captured the old value.
--
-- If you want that specific row renumbered into the correct family, run this
-- MANUALLY after confirming nothing already references it — replace the
-- national_id filter with the actual customer to correct:
--
--   UPDATE public.bank_customers
--   SET account_number = 'BOP-' || nextval('public.bank_customers_account_number_seq')
--   WHERE account_number = 'BOP-200013';
--
-- (Leaving the row as-is, with its out-of-family number, is also completely
-- fine — it no longer affects future numbering after this migration.)
-- ============================================================================

-- ============================================================================
-- Verify (optional):
--   SELECT nextval('public.bank_customers_account_number_seq');  -- next issued number
--   -- roll it back so verifying doesn't burn a real number:
--   SELECT setval('public.bank_customers_account_number_seq',
--                  currval('public.bank_customers_account_number_seq') - 1, true);
-- ============================================================================
