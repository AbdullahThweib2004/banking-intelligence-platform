import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Deletes a row created during test setup, via the service-role admin
 * client. PART 1's RLS tests are structural/invariant-based and do not
 * seed rows (see supabase-rls.api.spec.ts for why), but this is kept
 * available for PART 2's workflow tests, which will need to create and
 * tear down real approval_requests/documents rows.
 */
export async function deleteRow(admin: SupabaseClient, table: string, id: string) {
  const { error } = await admin.from(table).delete().eq('id', id);
  if (error) {
    // Cleanup failures must be visible, not swallowed — leftover test data
    // in a shared project is exactly the kind of thing that causes other
    // tests to silently start failing (or passing for the wrong reason).
    throw new Error(`Cleanup failed for ${table}/${id}: ${error.message}`);
  }
}
