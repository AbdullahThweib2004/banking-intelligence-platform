-- =============================================================================
-- RBAC migration: profiles + roles (branch_employee, branch_manager, risk_department)
--
-- Run this in the Supabase SQL Editor (it runs as the `postgres` role, which is
-- required to create a trigger on auth.users). Safe to re-run (idempotent).
--
-- SECURITY NOTE on auth.jwt():
--   These policies read the role from (auth.jwt() -> 'user_metadata' ->> 'role').
--   * user_metadata is editable by the end user (supabase.auth.updateUser), so for
--     a hardened production system prefer app_metadata, which only the service role
--     can change: (auth.jwt() -> 'app_metadata' ->> 'role'). For this graduation
--     project the user_metadata pattern is used as requested.
--   * The JWT reflects metadata at token-issue time. If you change a user's role,
--     they must sign out / sign in again for the new role to appear in auth.jwt().
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. profiles table (reconcile if it already exists)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name  TEXT,
  role       TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Ensure columns exist even if a previous/different profiles table was present.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS full_name  TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role       TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

-- Reconcile the role CHECK constraint to the 3 supported roles (re-runnable).
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('branch_employee', 'branch_manager', 'risk_department'));

-- -----------------------------------------------------------------------------
-- 2. Enable Row Level Security
-- -----------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- 3. RLS policies on profiles (recursion-safe: NO subquery into profiles)
-- -----------------------------------------------------------------------------

-- SELECT: a user can always read their own profile row.
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

-- SELECT: a branch_manager can read all profile rows.
DROP POLICY IF EXISTS "profiles_select_branch_manager" ON public.profiles;
CREATE POLICY "profiles_select_branch_manager"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING ((auth.jwt() -> 'user_metadata' ->> 'role') = 'branch_manager');

-- UPDATE: only a branch_manager can update profile rows.
DROP POLICY IF EXISTS "profiles_update_branch_manager" ON public.profiles;
CREATE POLICY "profiles_update_branch_manager"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING      ((auth.jwt() -> 'user_metadata' ->> 'role') = 'branch_manager')
  WITH CHECK ((auth.jwt() -> 'user_metadata' ->> 'role') = 'branch_manager');

-- -----------------------------------------------------------------------------
-- 4. Loan-approval UPDATE restricted to risk_department
--    `loan_applications` may not exist in this project; the real table used by
--    the app is `approval_requests`. Both are handled conditionally so this file
--    runs regardless of which tables are present.
-- -----------------------------------------------------------------------------

-- 4a. loan_applications (only if the table exists)
DO $$
BEGIN
  IF to_regclass('public.loan_applications') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.loan_applications ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "loan_applications_update_risk_department" ON public.loan_applications';
    EXECUTE $pol$
      CREATE POLICY "loan_applications_update_risk_department"
      ON public.loan_applications
      FOR UPDATE
      TO authenticated
      USING      ((auth.jwt() -> 'user_metadata' ->> 'role') = 'risk_department')
      WITH CHECK ((auth.jwt() -> 'user_metadata' ->> 'role') = 'risk_department')
    $pol$;
  END IF;
END $$;

-- 4b. approval_requests (the table the Approvals / Credit Risk UI actually updates).
--     Supersede the older manager-based update policy from 20260617 so approve/
--     reject is consistent with the new RBAC: only risk_department may decide.
DO $$
BEGIN
  IF to_regclass('public.approval_requests') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.approval_requests ENABLE ROW LEVEL SECURITY';
    -- remove the previous manager-based policy if present
    EXECUTE 'DROP POLICY IF EXISTS "approval_requests_update" ON public.approval_requests';
    EXECUTE 'DROP POLICY IF EXISTS "approval_requests_update_risk_department" ON public.approval_requests';
    EXECUTE $pol$
      CREATE POLICY "approval_requests_update_risk_department"
      ON public.approval_requests
      FOR UPDATE
      TO authenticated
      USING      ((auth.jwt() -> 'user_metadata' ->> 'role') = 'risk_department')
      WITH CHECK ((auth.jwt() -> 'user_metadata' ->> 'role') = 'risk_department')
    $pol$;
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 5. Auto-create a profile row whenever an auth user is created
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data ->> 'full_name',
    -- default to branch_employee if no role was provided in metadata
    COALESCE(NEW.raw_user_meta_data ->> 'role', 'branch_employee')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- -----------------------------------------------------------------------------
-- 6. Seed the 3 demo accounts' profiles.
--    Create the auth users first (Dashboard - Authentication - Add user) with the
--    matching emails. This block looks up their UUIDs by email and upserts the
--    correct role. If a user doesn't exist yet, its row is simply skipped; re-run
--    after creating the users.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT *
    FROM (VALUES
      ('employee@bop.ps', 'Branch Employee', 'branch_employee'),
      ('manager@bop.ps',  'Branch Manager',  'branch_manager'),
      ('risk@bop.ps',     'Risk Department', 'risk_department')
    ) AS t(email, full_name, role)
  LOOP
    INSERT INTO public.profiles (id, full_name, role)
    SELECT u.id, r.full_name, r.role
    FROM auth.users u
    WHERE u.email = r.email
    ON CONFLICT (id) DO UPDATE
      SET role = EXCLUDED.role,
          full_name = EXCLUDED.full_name;
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- Verify (optional): should list the seeded rows with their roles.
-- SELECT p.id, p.full_name, p.role
-- FROM public.profiles p
-- JOIN auth.users u ON u.id = p.id
-- WHERE u.email IN ('employee@bop.ps','manager@bop.ps','risk@bop.ps');
-- =============================================================================
