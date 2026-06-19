-- ============================================================================
-- User Management support: extend `profiles` with the columns the User
-- Management page needs (email, department, status) so the table can be backed
-- entirely by Supabase without the browser ever touching auth.users.
--
-- The privileged operations (create / delete auth users) are handled by the
-- `admin-users` Edge Function with the service role key. This migration only
-- prepares the read model + keeps the auto-profile trigger in sync.
--
-- Re-runnable (IF NOT EXISTS / CREATE OR REPLACE / idempotent backfill).
-- ============================================================================

-- 1. New columns ------------------------------------------------------------
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email      TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS department TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS status     TEXT NOT NULL DEFAULT 'active';

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_status_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_status_check
  CHECK (status IN ('active', 'inactive', 'suspended'));

-- 2. Backfill email for any existing profiles from auth.users ---------------
UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE u.id = p.id
  AND p.email IS DISTINCT FROM u.email;

-- 3. Keep the auto-profile trigger in sync with the new columns -------------
--    Runs when an auth user is created (including via the admin-users function).
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role, email, department, status)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data ->> 'full_name',
    COALESCE(NEW.raw_user_meta_data ->> 'role', 'branch_employee'),
    NEW.email,
    NEW.raw_user_meta_data ->> 'department',
    'active'
  )
  ON CONFLICT (id) DO UPDATE
    SET email = COALESCE(EXCLUDED.email, public.profiles.email);
  RETURN NEW;
END;
$$;

-- Trigger itself was created in 20260618_rbac_profiles.sql; re-create to be safe.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- 4. (Optional) allow a branch_manager to INSERT profile rows directly.
--    Not required by the Edge Function (it uses the service role), but harmless
--    and useful if you ever insert from a manager session.
DROP POLICY IF EXISTS "profiles_insert_branch_manager" ON public.profiles;
CREATE POLICY "profiles_insert_branch_manager"
  ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK ((auth.jwt() -> 'user_metadata' ->> 'role') = 'branch_manager');
