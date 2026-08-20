-- ============================================================================
-- DEMO-ONLY "forgot password" verification codes.
--
-- Prototype behavior (explicitly confirmed, not a production design): a
-- verification code for ANY existing bank-account email is delivered to one
-- fixed inbox (abdullahthweib111@gmail.com — see the
-- DEMO_RESET_RECIPIENT_EMAIL secret in supabase/functions/demo-password-reset),
-- never to the account's own email. This is a deliberate, temporary
-- single-operator demo shortcut and collapses per-account isolation on this
-- one flow — see supabase/functions/demo-password-reset/index.ts's header
-- comment for the full security-limitations note before reusing this
-- pattern anywhere real.
--
-- This table never touches auth.users.encrypted_password and is never
-- reachable from any client role — only the service-role client inside the
-- demo-password-reset Edge Function ever reads/writes it (RLS is enabled
-- with zero policies granted to authenticated/anon: default-deny).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.demo_password_reset_codes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  code_hash   TEXT NOT NULL,           -- SHA-256 hex digest — never plaintext.
  attempts    INTEGER NOT NULL DEFAULT 0,
  expires_at  TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,             -- set once verified; blocks reuse.
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS demo_password_reset_codes_email_idx
  ON public.demo_password_reset_codes (email, created_at DESC);

ALTER TABLE public.demo_password_reset_codes ENABLE ROW LEVEL SECURITY;
-- No policies added on purpose. RLS with zero grants = every role except
-- service_role (which bypasses RLS entirely) is denied by default.

NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- Verify (optional, run in the SQL Editor):
--   SELECT count(*) FROM public.demo_password_reset_codes; -- as service role, fine
--   -- As any authenticated/anon role, any select/insert against this table
--   -- must be rejected outright (no policy exists to permit it).
-- ============================================================================
