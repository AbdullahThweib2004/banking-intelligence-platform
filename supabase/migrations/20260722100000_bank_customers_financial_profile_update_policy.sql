-- ============================================================================
-- Allows account-opening roles to UPDATE bank_customers rows.
--
-- CONTEXT: bank_customers previously only had SELECT and INSERT RLS
-- policies (20260621100000_bank_customers.sql,
-- 20260711100000_bank_customers_account_sequence.sql) — there was never a
-- legitimate reason to update a row after creation.
--
-- That changed with the "Employment Proof Upload" step
-- (src/lib/bankCustomers.ts: refreshStaleFinancialProfile): reopening the
-- Open New Account wizard on an ALREADY-EXISTING customer (same national_id
-- — e.g. a legacy row created before that feature existed, still carrying
-- the old random-default financial profile) now upgrades that row's
-- financial-profile columns with newly resolved real data, instead of
-- silently returning the old fake numbers forever. Without an UPDATE
-- policy, that call is silently blocked by RLS and the code path falls back
-- to keeping the stale row untouched (fails safe, but the refresh never
-- actually happens) — this migration is what makes the refresh work.
--
-- Scoped identically to the existing INSERT policy: only the two
-- account-opening roles, matching who is allowed to run the wizard at all
-- (see src/lib/roles.ts ACCOUNT_OPENING_ROLES). The application-level logic
-- in refreshStaleFinancialProfile() is what keeps this narrow in practice —
-- it only ever upgrades a row whose financial_profile_source is 'unknown'
-- or 'unresolved_needs_review', never a row that already has real data.
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('public.bank_customers') IS NOT NULL THEN
    DROP POLICY IF EXISTS bank_customers_update_account_opening ON public.bank_customers;
    CREATE POLICY bank_customers_update_account_opening
      ON public.bank_customers
      FOR UPDATE
      TO authenticated
      USING (
        (auth.jwt() -> 'user_metadata' ->> 'role') IN ('branch_employee', 'branch_manager')
      )
      WITH CHECK (
        (auth.jwt() -> 'user_metadata' ->> 'role') IN ('branch_employee', 'branch_manager')
      );
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
