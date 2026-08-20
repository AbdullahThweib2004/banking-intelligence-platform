import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { getAnonClient } from '../fixtures/api-context';
import { getAdminClient } from '../fixtures/supabase-admin';
import { TEST_USERS, ROLES, isUserConfigured } from '../fixtures/api-users';
import { SUPABASE_URL, SUPABASE_ANON_KEY, hasSupabaseConfig, hasServiceRole } from '../utils/env';
import { expectNoRowsVisible } from '../utils/assertions';

/**
 * Tests for the DEMO-ONLY demo-password-reset edge function + the
 * demo_password_reset_codes table. PROTOTYPE behavior, confirmed by the
 * project owner: codes for any bank-account email are delivered to one
 * fixed inbox, never the account's own — see the migration/edge-function
 * header comments for the full design and limitations.
 *
 * The "successful login" path can't be driven end-to-end through real
 * email delivery from an API test (same limitation as the OpenRouter live
 * test — we don't control the deployed function's internals, and codes are
 * deliberately never stored in plaintext, so there is nothing to read
 * back). Instead, the verify-side mechanics are tested deterministically by
 * seeding a KNOWN code's hash directly via the service-role admin client
 * (the same SHA-256 hex the edge function itself computes), which tests
 * the real verify → generateLink → verifyOtp chain without depending on
 * actual mail delivery.
 *
 * Everything here requires demo-password-reset to actually be deployed and
 * the migration to be applied — both skip gracefully (not fail) if not.
 */

async function callFunction(request: import('@playwright/test').APIRequestContext, body: unknown) {
  return request.post(`${SUPABASE_URL}/functions/v1/demo-password-reset`, {
    headers: {
      apikey: SUPABASE_ANON_KEY as string,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    data: body,
    failOnStatusCode: false,
  });
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

const TEST_CODE = '123456';

/** Seeds a known code directly (bypassing the "request" step) so verify-side tests are deterministic. */
async function seedCode(
  userId: string,
  email: string,
  overrides: Partial<{ attempts: number; expiresAt: string; consumedAt: string | null }> = {}
) {
  const admin = getAdminClient();
  const codeHash = await sha256Hex(TEST_CODE);
  await admin.from('demo_password_reset_codes').delete().eq('email', email); // clean slate per test
  const { data, error } = await admin
    .from('demo_password_reset_codes')
    .insert({
      user_id: userId,
      email,
      code_hash: codeHash,
      attempts: overrides.attempts ?? 0,
      expires_at: overrides.expiresAt ?? new Date(Date.now() + 10 * 60_000).toISOString(),
      consumed_at: overrides.consumedAt ?? null,
    })
    .select('id')
    .single();
  if (error) throw new Error(`seedCode failed: ${error.message}`);
  return data.id as string;
}

test.describe('Demo password reset (prototype-only)', () => {
  test.beforeEach(async () => {
    test.skip(!hasSupabaseConfig(), 'VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY not set');
    test.skip(!isUserConfigured(ROLES.EMPLOYEE), 'E2E_EMPLOYEE_EMAIL/PASSWORD not set');
    test.skip(!hasServiceRole(), 'SUPABASE_SERVICE_ROLE_KEY not set — needed to seed/verify codes');

    // Migration not applied yet? Skip cleanly instead of every test failing
    // on a raw "table not found" error.
    if (hasServiceRole()) {
      const probe = await getAdminClient().from('demo_password_reset_codes').select('id').limit(1);
      test.skip(
        probe.error?.code === 'PGRST205' || probe.error?.code === '42P01',
        'demo_password_reset_codes does not exist yet — apply supabase/migrations/20260821090000_demo_password_reset_codes.sql first'
      );
    }
  });

  test.afterEach(async () => {
    if (!hasServiceRole() || !isUserConfigured(ROLES.EMPLOYEE)) return;
    const admin = getAdminClient();
    await admin.from('demo_password_reset_codes').delete().eq('email', TEST_USERS[ROLES.EMPLOYEE].email as string);
  });

  test('request: an existing bank email creates a code row and returns the generic response', async ({ request }) => {
    const email = TEST_USERS[ROLES.EMPLOYEE].email as string;
    let response;
    try {
      response = await callFunction(request, { action: 'request', email });
    } catch (err) {
      test.skip(true, `demo-password-reset not reachable (not deployed yet?): ${err}`);
      return;
    }
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);

    const admin = getAdminClient();
    const row = await admin.from('demo_password_reset_codes').select('id, code_hash').eq('email', email).maybeSingle();
    expect(row.data).not.toBeNull();
    // Never plaintext — the stored value must not equal any 6-digit code as-is.
    expect(row.data?.code_hash).not.toMatch(/^\d{6}$/);
  });

  test('request: a non-existent email returns the identical generic response and creates no row (no enumeration)', async ({ request }) => {
    const email = `no-such-account-${Date.now()}@bankofpalestine.com`;
    let response;
    try {
      response = await callFunction(request, { action: 'request', email });
    } catch (err) {
      test.skip(true, `demo-password-reset not reachable: ${err}`);
      return;
    }
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);

    const admin = getAdminClient();
    const row = await admin.from('demo_password_reset_codes').select('id').eq('email', email).maybeSingle();
    expect(row.data).toBeNull();
  });

  test('verify: correct code establishes a real Supabase session, without touching the password', async ({ request }) => {
    const user = TEST_USERS[ROLES.EMPLOYEE];
    const email = user.email as string;
    const admin = getAdminClient();
    const profile = await admin.from('profiles').select('id').eq('email', email).maybeSingle();
    test.skip(!profile.data, `No profiles row for ${email} — cannot seed a code without a real user_id`);

    await seedCode(profile.data!.id, email);

    let response;
    try {
      response = await callFunction(request, { action: 'verify', email, code: TEST_CODE });
    } catch (err) {
      test.skip(true, `demo-password-reset not reachable: ${err}`);
      return;
    }
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(typeof body.token_hash).toBe('string');
    expect(body.type).toBe('magiclink');

    // Exchange the real Supabase-issued token for an actual session — the
    // same call the browser makes. This is the real proof the session is
    // genuine, not a client-side bypass.
    const client = createClient(SUPABASE_URL as string, SUPABASE_ANON_KEY as string);
    const { data: otpData, error: otpError } = await client.auth.verifyOtp({
      token_hash: body.token_hash,
      type: body.type,
    });
    expect(otpError).toBeNull();
    expect(otpData.session).not.toBeNull();
    expect(otpData.user?.email).toBe(email);

    // Password login still works afterward, unchanged — sign out first.
    await client.auth.signOut();
    const passwordLogin = await client.auth.signInWithPassword({ email, password: user.password as string });
    expect(passwordLogin.error).toBeNull();
    expect(passwordLogin.data.session).not.toBeNull();
  });

  test('verify: wrong code is rejected and counts as an attempt', async ({ request }) => {
    const email = TEST_USERS[ROLES.EMPLOYEE].email as string;
    const admin = getAdminClient();
    const profile = await admin.from('profiles').select('id').eq('email', email).maybeSingle();
    test.skip(!profile.data, `No profiles row for ${email}`);
    const codeId = await seedCode(profile.data!.id, email);

    let response;
    try {
      response = await callFunction(request, { action: 'verify', email, code: '000000' });
    } catch (err) {
      test.skip(true, `demo-password-reset not reachable: ${err}`);
      return;
    }
    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body.ok).toBe(false);

    const row = await admin.from('demo_password_reset_codes').select('attempts').eq('id', codeId).single();
    expect(row.data?.attempts).toBe(1);
  });

  test('verify: an expired code is rejected even if correct', async ({ request }) => {
    const email = TEST_USERS[ROLES.EMPLOYEE].email as string;
    const admin = getAdminClient();
    const profile = await admin.from('profiles').select('id').eq('email', email).maybeSingle();
    test.skip(!profile.data, `No profiles row for ${email}`);
    await seedCode(profile.data!.id, email, { expiresAt: new Date(Date.now() - 60_000).toISOString() });

    let response;
    try {
      response = await callFunction(request, { action: 'verify', email, code: TEST_CODE });
    } catch (err) {
      test.skip(true, `demo-password-reset not reachable: ${err}`);
      return;
    }
    expect(response.status()).toBe(401);
    expect((await response.json()).ok).toBe(false);
  });

  test('verify: too many prior attempts locks out the code, even with the correct value', async ({ request }) => {
    const email = TEST_USERS[ROLES.EMPLOYEE].email as string;
    const admin = getAdminClient();
    const profile = await admin.from('profiles').select('id').eq('email', email).maybeSingle();
    test.skip(!profile.data, `No profiles row for ${email}`);
    await seedCode(profile.data!.id, email, { attempts: 5 }); // MAX_ATTEMPTS in the edge function

    let response;
    try {
      response = await callFunction(request, { action: 'verify', email, code: TEST_CODE });
    } catch (err) {
      test.skip(true, `demo-password-reset not reachable: ${err}`);
      return;
    }
    expect(response.status()).toBe(401);
    expect((await response.json()).ok).toBe(false);
  });

  test('verify: an already-consumed code cannot be reused', async ({ request }) => {
    const email = TEST_USERS[ROLES.EMPLOYEE].email as string;
    const admin = getAdminClient();
    const profile = await admin.from('profiles').select('id').eq('email', email).maybeSingle();
    test.skip(!profile.data, `No profiles row for ${email}`);
    await seedCode(profile.data!.id, email, { consumedAt: new Date().toISOString() });

    let response;
    try {
      response = await callFunction(request, { action: 'verify', email, code: TEST_CODE });
    } catch (err) {
      test.skip(true, `demo-password-reset not reachable: ${err}`);
      return;
    }
    expect(response.status()).toBe(401);
    expect((await response.json()).ok).toBe(false);
  });

  test('unauthenticated (anon) client cannot read the codes table directly (RLS default-deny)', async () => {
    const anon = getAnonClient();
    const result = await anon.from('demo_password_reset_codes').select('*');
    expectNoRowsVisible(result, 'anon client reading demo_password_reset_codes');
  });
});
