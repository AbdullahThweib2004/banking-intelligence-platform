import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, hasServiceRole } from '../utils/env';

/**
 * Service-role client — SETUP AND VERIFICATION ONLY, never used to assert
 * what an end-user role "should" be able to do (that would defeat the
 * point of testing RLS with real per-role clients). Used here only as
 * ground truth for counts (e.g. "did branch_manager really see every
 * profile row that exists").
 */
export function getAdminClient(): SupabaseClient {
  if (!hasServiceRole()) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY (and VITE_SUPABASE_URL) must be set to use the admin client. ' +
        'This should only be needed in test setup/verification code, never in assertions about role permissions.'
    );
  }
  return createClient(SUPABASE_URL as string, SUPABASE_SERVICE_ROLE_KEY as string, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
