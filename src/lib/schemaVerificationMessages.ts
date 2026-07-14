/**
 * Pure schema-drift helpers, split out from schemaVerification.ts so they
 * can be unit-tested under Node's plain `--test` runner without pulling in
 * the Supabase client — `../integrations/supabase/client.ts` reads
 * `import.meta.env`, a Vite-only global that doesn't exist under plain Node
 * and throws immediately on import outside Vite/the browser.
 *
 * Relative imports use explicit `.ts` extensions for the same reason —
 * same convention as creditScoring.ts and the loan*.ts modules.
 */
import type { SavedRiskExplanation } from './creditScoring.ts';

/**
 * The exact 14 columns added by `20260711130000_loan_assessment_fields.sql`
 * (the columns behind the "age_at_maturity ... schema cache" bug, BUG-014).
 * The `satisfies` clause ties this list to `SavedRiskExplanation` at compile
 * time — renaming or removing a field on one side without the other fails
 * `tsc`, not just a live insert months later.
 */
export const APPROVAL_REQUESTS_LOAN_COLUMNS = [
  'loan_type',
  'loan_currency',
  'salary_currency',
  'monthly_obligations',
  'client_age',
  'loan_term_years',
  'annual_interest_rate_used',
  'monthly_installment',
  'total_interest',
  'total_repaid',
  'debt_burden_ratio',
  'age_at_maturity',
  'eligibility_status',
  'ai_explanation',
] as const satisfies readonly (keyof SavedRiskExplanation)[];

export const SCHEMA_CACHE_MIGRATION_FILE = '20260711130000_loan_assessment_fields.sql';

/** True for the specific PostgREST failure shape this module exists to catch. */
export function isSchemaCacheError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === 'PGRST204') return true;
  return /schema cache/i.test(error.message ?? '');
}

/** Precise message once the live database confirms exactly which columns are missing. */
export function formatMissingColumnsMessage(missingColumns: string[], language: 'en' | 'ar' = 'en'): string {
  if (language === 'ar') {
    return `قاعدة البيانات الحية تفتقد إلى الأعمدة التالية في جدول approval_requests: ${missingColumns.join(', ')}. يرجى إعادة تشغيل الترحيل ${SCHEMA_CACHE_MIGRATION_FILE} في محرر SQL الخاص بـ Supabase، ثم إعادة المحاولة.`;
  }
  return `The live database is missing these approval_requests columns: ${missingColumns.join(', ')}. Please re-run migration ${SCHEMA_CACHE_MIGRATION_FILE} in the Supabase SQL Editor, then try again.`;
}

/** Fallback message when a schema-cache error was detected but the verification check itself couldn't confirm specifics (e.g. it isn't deployed yet either). */
export function formatSchemaCacheErrorMessage(language: 'en' | 'ar' = 'en'): string {
  if (language === 'ar') {
    return `يبدو أن ذاكرة تخزين مخطط قاعدة البيانات قديمة. يرجى إعادة تشغيل الترحيل ${SCHEMA_CACHE_MIGRATION_FILE} في محرر SQL الخاص بـ Supabase (يتضمن الآن أمر تحديث الذاكرة المؤقتة) ثم إعادة المحاولة.`;
  }
  return `The database schema cache looks out of date. Please re-run migration ${SCHEMA_CACHE_MIGRATION_FILE} in the Supabase SQL Editor (it now includes a schema-cache refresh) and try again.`;
}
