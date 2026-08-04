import { test, expect } from '@playwright/test';
import { getAnonClient, loginAsRole } from '../fixtures/api-context';
import { ROLES } from '../fixtures/api-users';
import { hasSupabaseConfig } from '../utils/env';
import { expectNoRowsVisible } from '../utils/assertions';

/**
 * Auth/session tests against the REAL Supabase Auth API (GoTrue) — same
 * signInWithPassword flow the app itself uses in
 * src/contexts/AuthContext.tsx. No mocked sessions.
 */
test.describe('Auth (Supabase)', () => {
  test.beforeEach(() => {
    test.skip(!hasSupabaseConfig(), 'VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY not set');
  });

  test('invalid credentials are rejected with no session issued', async () => {
    const client = getAnonClient();
    const { data, error } = await client.auth.signInWithPassword({
      email: 'not-a-real-user@example.com',
      password: 'definitely-wrong-password',
    });
    expect(error).not.toBeNull();
    expect(data.session).toBeNull();
  });

  test('unauthenticated (anon) client cannot read a protected table', async () => {
    const client = getAnonClient();
    const result = await client.from('profiles').select('id');
    expectNoRowsVisible(result, 'anon client reading profiles');
  });

  for (const role of Object.values(ROLES)) {
    test(`valid login for ${role} issues a session with a matching role claim`, async () => {
      const { session } = await loginAsRole(role);

      expect(session.access_token).toBeTruthy();
      expect(session.user?.id).toBeTruthy();
      // Role lives in user_metadata (see rbac_profiles.sql) — this is also
      // the exact claim every RLS policy in the schema reads from.
      expect(session.user?.user_metadata?.role).toBe(role);
    });
  }

  test('session/token retrieval: getSession reflects the just-issued session', async () => {
    const { client, session } = await loginAsRole(ROLES.EMPLOYEE);
    const { data, error } = await client.auth.getSession();
    expect(error).toBeNull();
    expect(data.session?.access_token).toBe(session.access_token);
  });

  // TODO(PART 2): a "role changed after login, must re-auth to take effect"
  // test, and a dedicated privilege-escalation check for the user_metadata
  // self-edit gap noted in tests/api/supabase-rls.api.spec.ts, both need a
  // disposable test account we can safely mutate — deferred so PART 1 never
  // mutates the configured role test accounts.
  test.skip('role changes require re-authentication to take effect in RLS', async () => {
    // Intentionally not implemented — see comment above.
  });
});
