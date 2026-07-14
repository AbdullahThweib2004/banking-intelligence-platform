/**
 * Live schema drift detection for the bank-calculator columns on
 * `approval_requests` (added by migration
 * `20260711130000_loan_assessment_fields.sql` — the exact columns behind the
 * "Could not find the 'age_at_maturity' column ... in the schema cache" bug,
 * BUG-014).
 *
 * Two layers of protection:
 *   1. Compile-time: `APPROVAL_REQUESTS_LOAN_COLUMNS` (schemaVerificationMessages.ts)
 *      is typed with `satisfies readonly (keyof SavedRiskExplanation)[]` — if
 *      this list and `SavedRiskExplanation`'s fields ever drift apart (a
 *      rename, a removed field), `tsc` fails immediately. This is what
 *      generated Supabase types would normally catch; this project has none
 *      (no live project credentials to generate them from), so this is a
 *      hand-maintained equivalent scoped to the columns this bug involved.
 *   2. Runtime: `checkApprovalRequestsSchema()` calls the
 *      `verify_approval_requests_schema()` Postgres function (added by
 *      `20260713150000_verify_approval_requests_schema.sql`) to ask the LIVE
 *      database which of these columns actually exist, so a genuinely
 *      out-of-date live project is reported with one precise message instead
 *      of one cryptic Postgres error per missing column.
 *
 * The pure message-formatting helpers live in schemaVerificationMessages.ts
 * so they can be unit-tested without pulling in the Supabase client (which
 * this file needs, but which can't be imported under Node's plain `--test`
 * runner — see that file's header comment).
 */
import { supabase } from '@/integrations/supabase/client';
import {
  APPROVAL_REQUESTS_LOAN_COLUMNS,
  isSchemaCacheError,
  formatMissingColumnsMessage,
  formatSchemaCacheErrorMessage,
} from '@/lib/schemaVerificationMessages';

export {
  APPROVAL_REQUESTS_LOAN_COLUMNS,
  isSchemaCacheError,
  formatMissingColumnsMessage,
  formatSchemaCacheErrorMessage,
};

export interface SchemaCheckResult {
  ok: boolean;
  missingColumns: string[];
  checkedAt: string | null;
  /** Set when the check itself couldn't run (e.g. the verification function isn't deployed yet either). */
  checkError?: string;
}

interface VerifySchemaRpcResponse {
  missing_columns?: string[];
  checked_at?: string;
}

/**
 * Asks the LIVE database which of the bank-calculator columns are actually
 * present on `approval_requests`, via `verify_approval_requests_schema()`.
 * Never throws — a failed check is reported as `ok: false` with `checkError`
 * set, since "couldn't verify" must never be read as "verified fine".
 */
export async function checkApprovalRequestsSchema(): Promise<SchemaCheckResult> {
  const { data, error } = await supabase.rpc('verify_approval_requests_schema');

  if (error) {
    return { ok: false, missingColumns: [], checkedAt: null, checkError: error.message };
  }

  const body = data as VerifySchemaRpcResponse | null;
  const missingColumns = body?.missing_columns ?? [];

  return {
    ok: missingColumns.length === 0,
    missingColumns,
    checkedAt: body?.checked_at ?? null,
  };
}

/**
 * One-call helper for the reactive path: given a failed insert/update error,
 * returns a clear, actionable message if it matches the schema-cache
 * signature, or null if this looks like an unrelated failure (callers
 * should show the original error message in that case, never invent one).
 */
export async function explainIfSchemaCacheError(
  error: { code?: string; message?: string } | null | undefined,
  language: 'en' | 'ar' = 'en'
): Promise<string | null> {
  if (!isSchemaCacheError(error)) return null;

  const check = await checkApprovalRequestsSchema();
  if (check.missingColumns.length > 0) {
    return formatMissingColumnsMessage(check.missingColumns, language);
  }
  return formatSchemaCacheErrorMessage(language);
}
