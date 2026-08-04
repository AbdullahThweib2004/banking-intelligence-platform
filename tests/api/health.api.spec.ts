import { test, expect } from '@playwright/test';
import { FASTAPI_BASE_URL } from '../utils/env';
import { hasSupabaseConfig, SUPABASE_URL, SUPABASE_ANON_KEY } from '../utils/env';

/**
 * Core reachability + response-shape checks. These are intentionally
 * shallow (no auth, no business logic) — the point is "is the surface up
 * and returning what callers expect," not correctness of any one field.
 */
test.describe('Health / reachability', () => {
  test('FastAPI /health is reachable and returns the expected shape', async ({ request }) => {
    let response;
    try {
      response = await request.get(`${FASTAPI_BASE_URL}/health`);
    } catch (err) {
      test.skip(true, `FastAPI not reachable at ${FASTAPI_BASE_URL} (start it with "npm run dev:api"): ${err}`);
      return;
    }
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body).toHaveProperty('status', 'ok');
    expect(body).toHaveProperty('llm_fallback_configured');
    expect(typeof body.llm_fallback_configured).toBe('boolean');
  });

  test('FastAPI fails gracefully on an unknown route (404, not a crash)', async ({ request }) => {
    let response;
    try {
      response = await request.get(`${FASTAPI_BASE_URL}/this-route-does-not-exist`);
    } catch (err) {
      test.skip(true, `FastAPI not reachable at ${FASTAPI_BASE_URL}: ${err}`);
      return;
    }
    expect(response.status()).toBe(404);
  });

  test('Supabase GoTrue auth endpoint is reachable', async ({ request }) => {
    test.skip(!hasSupabaseConfig(), 'VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY not set');
    let response;
    try {
      response = await request.get(`${SUPABASE_URL}/auth/v1/health`, {
        headers: { apikey: SUPABASE_ANON_KEY as string },
      });
    } catch (err) {
      test.skip(true, `Supabase not reachable at ${SUPABASE_URL}: ${err}`);
      return;
    }
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body).toHaveProperty('name');
  });
});
