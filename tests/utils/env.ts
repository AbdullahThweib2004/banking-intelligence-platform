/**
 * Central env accessor for the API/integration QA suite. Reuses the
 * project's existing env var names where they already exist (VITE_SUPABASE_*)
 * rather than inventing parallel ones. Never logs/returns secret values in
 * plain form anywhere except the raw getters themselves.
 */

export const FASTAPI_BASE_URL = process.env.FASTAPI_BASE_URL ?? 'http://localhost:8000';

export const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
export const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;
export const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const hasSupabaseConfig = (): boolean => Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
export const hasServiceRole = (): boolean => Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);

/** Gate for the single live OpenRouter smoke test (tests/api/assistant.api.spec.ts). */
export const runLiveOpenRouterTests = (): boolean => process.env.RUN_LIVE_OPENROUTER_TESTS === 'true';

/** Redacts a secret to its first/last 2 chars for safe debug logging — never print full values. */
export const redact = (value: string | undefined): string => {
  if (!value) return '(unset)';
  if (value.length <= 6) return '***';
  return `${value.slice(0, 2)}***${value.slice(-2)}`;
};

/** Non-secret summary for test-run diagnostics (e.g. printed once from globalSetup). */
export const envSummary = () => ({
  FASTAPI_BASE_URL,
  SUPABASE_URL: SUPABASE_URL ?? '(unset)',
  SUPABASE_ANON_KEY: redact(SUPABASE_ANON_KEY),
  SUPABASE_SERVICE_ROLE_KEY: redact(SUPABASE_SERVICE_ROLE_KEY),
});
