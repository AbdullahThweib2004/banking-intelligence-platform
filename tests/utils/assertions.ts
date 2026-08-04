import { expect } from '@playwright/test';
import type { PostgrestError } from '@supabase/supabase-js';

type SelectResult<T> = { data: T[] | null; error: PostgrestError | null };

/**
 * A SELECT blocked by RLS is not an error in PostgREST — the policy simply
 * filters every row out. This is the correct way to assert "this client
 * cannot see any rows here," and holds regardless of how much data exists.
 */
export function expectNoRowsVisible<T>(result: SelectResult<T>, context: string) {
  expect(result.error, `${context}: expected no error, got ${JSON.stringify(result.error)}`).toBeNull();
  expect(result.data ?? [], `${context}: expected zero visible rows`).toHaveLength(0);
}

/** Every row a client CAN see must satisfy the role's visibility predicate. */
export function expectAllRowsMatch<T>(
  result: SelectResult<T>,
  predicate: (row: T) => boolean,
  context: string
) {
  expect(result.error, `${context}: expected no error, got ${JSON.stringify(result.error)}`).toBeNull();
  const rows = result.data ?? [];
  const violations = rows.filter((row) => !predicate(row));
  expect(violations, `${context}: found rows violating the expected visibility rule: ${JSON.stringify(violations)}`).toHaveLength(0);
}

/**
 * A write (INSERT/UPDATE) blocked by RLS either returns an explicit
 * PostgREST/Postgres error, or (when USING excludes the row) silently
 * affects zero rows with .select() chained. Either shape counts as "blocked."
 */
export function expectWriteBlocked<T>(result: SelectResult<T>, context: string) {
  const blockedByError = result.error !== null;
  const blockedBySilentFilter = result.error === null && (result.data ?? []).length === 0;
  expect(
    blockedByError || blockedBySilentFilter,
    `${context}: expected the write to be blocked (error or zero affected rows), got ${JSON.stringify(result)}`
  ).toBe(true);
}
