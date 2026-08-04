import { test } from '@playwright/test';
import { createClient, type SupabaseClient, type Session } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY, hasSupabaseConfig } from '../utils/env';
import { TEST_USERS, isUserConfigured, type Role } from './api-users';

export { FASTAPI_BASE_URL } from '../utils/env';

/** A fresh anonymous client — no session. Used to prove unauthenticated access is blocked. */
export function getAnonClient(): SupabaseClient {
  if (!hasSupabaseConfig()) {
    throw new Error('VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY must be set to run Supabase API tests.');
  }
  return createClient(SUPABASE_URL as string, SUPABASE_ANON_KEY as string, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

type RoleSession = { client: SupabaseClient; session: Session };

/**
 * Cached per role for the lifetime of this test process (one process per
 * worker; playwright.api.config.ts pins workers to 1, so this is one cache
 * for the whole run). Without this, a full run performs a fresh real
 * password sign-in on every single loginAsRole() call across every test —
 * confirmed live to trip Supabase Auth's rate limit ("Request rate limit
 * reached") partway through a full suite run, cascading into unrelated
 * test failures. Reusing one real session per role avoids that while still
 * being a genuine, real Supabase Auth session (not mocked).
 */
const sessionCache = new Map<Role, RoleSession>();

/**
 * Signs in as `role` the real way (Supabase Auth signInWithPassword —
 * exactly what src/contexts/AuthContext.tsx does), returning a client that
 * carries that role's real JWT for RLS to evaluate. Skips the calling test
 * (not a hard failure) when that role's env credentials aren't set, since
 * no live Supabase test accounts are provisioned by default.
 */
export async function loginAsRole(role: Role): Promise<RoleSession> {
  if (!isUserConfigured(role)) {
    const user = TEST_USERS[role];
    test.skip(true, `Skipping: ${user.envPrefix}_EMAIL / ${user.envPrefix}_PASSWORD not set`);
  }

  const cached = sessionCache.get(role);
  if (cached) return cached;

  const user = TEST_USERS[role];
  const client = getAnonClient();
  const { data, error } = await client.auth.signInWithPassword({
    email: user.email as string,
    password: user.password as string,
  });
  if (error || !data.session) {
    throw new Error(`Login failed for role ${role} (${user.envPrefix}): ${error?.message}`);
  }
  const result = { client, session: data.session };
  sessionCache.set(role, result);
  return result;
}
