-- ============================================================================
-- Seed the Audit demo account's profile + JWT role claim.
--
-- PREREQUISITE (must be done manually, ONCE, before running this migration):
--   This repo has no access to Supabase's Admin API / service-role key, so
--   the actual auth.users row (with a real, properly-hashed password) cannot
--   be created by a SQL migration — it must be created via the Supabase
--   Dashboard:
--     Authentication -> Users -> Add User
--       Email:    audit@bop.ps
--       Password: Audit@2025
--     (check "Auto Confirm User" so no email-verification step is required)
--
-- Once that user exists, running this migration will:
--   1. Create/update its `public.profiles` row with role = 'audit_department'.
--   2. Sync that role into `auth.users.raw_user_meta_data` (the same
--      established pattern used for employee@bop.ps/manager@bop.ps/risk@bop.ps
--      in 20260618103000_rbac_profiles.sql), since every RLS policy in this
--      project reads the role from `auth.jwt() -> 'user_metadata' ->> 'role'`.
--
-- OPERATIONAL NOTE: after this runs, the audit@bop.ps user must sign out and
-- sign back in (or refresh their session) for the new role claim to appear
-- in a fresh JWT — the same requirement as every other role change in this
-- project.
--
-- Idempotent + safe to re-run: uses ON CONFLICT DO UPDATE; does nothing if
-- the auth user hasn't been created yet (the SELECT simply returns no rows).
-- ============================================================================

DO $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role)
  SELECT u.id, 'Audit Department', 'audit_department'
  FROM auth.users u
  WHERE u.email = 'audit@bop.ps'
  ON CONFLICT (id) DO UPDATE
    SET role = EXCLUDED.role,
        full_name = EXCLUDED.full_name;
END $$;

UPDATE auth.users AS u
SET raw_user_meta_data =
  coalesce(u.raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('role', p.role)
FROM public.profiles AS p
WHERE u.id = p.id
  AND u.email = 'audit@bop.ps'
  AND coalesce(u.raw_user_meta_data ->> 'role', '') IS DISTINCT FROM p.role;

-- ============================================================================
-- Verify (optional, run in the SQL Editor):
--   SELECT p.id, p.full_name, p.role, u.email, u.raw_user_meta_data ->> 'role' AS jwt_role
--   FROM public.profiles p
--   JOIN auth.users u ON u.id = p.id
--   WHERE u.email = 'audit@bop.ps';
--   -- expect: role = 'audit_department', jwt_role = 'audit_department'
-- ============================================================================
