import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * QA-namespaced bank_customers row builders — mirrors the exact insert
 * shape src/lib/bankCustomers.ts's insertBankCustomer() uses (see
 * supabase/migrations/20260621100000_bank_customers.sql,
 * 20260711100000_bank_customers_account_sequence.sql,
 * 20260716110000_bank_customers_financial_profile_source.sql,
 * 20260716100000_input_validation_guardrails.sql for the exact
 * columns/constraints this must satisfy):
 *   - account_number is NEVER set here — the DB trigger generates it.
 *   - national_id must be 7-15 chars and UNIQUE; QA rows use a
 *     "999"-prefixed id so they can never collide with the real
 *     BOP-100001..BOP-100010 seed rows (all start with '40').
 */

const QA_NAME_PREFIX = 'QA Test Customer';

export function qaNationalId(suffix: string | number): string {
  const s = String(suffix).padStart(8, '0').slice(-8);
  return `999${s}`; // 11 chars, well within the 7-15 bound.
}

export interface QaBankCustomerInput {
  nationalId: string;
  customerName?: string;
  monthlyIncome?: number;
  employmentType?: string;
  financialProfileSource?:
    | 'database_match'
    | 'employment_proof_extracted'
    | 'manual_entry'
    | 'unresolved_needs_review'
    | 'unknown';
  salaryCurrency?: string;
  jobRole?: string | null;
  loanPurpose?: string;
}

/** Inserts a single QA bank_customers row as the given (already-authenticated) client. */
export async function insertQaBankCustomer(client: SupabaseClient, input: QaBankCustomerInput) {
  return client
    .from('bank_customers')
    .insert({
      customer_name: input.customerName ?? `${QA_NAME_PREFIX} ${input.nationalId}`,
      national_id: input.nationalId,
      monthly_income: input.monthlyIncome ?? 0,
      monthly_expenses: 0,
      existing_loans: 0,
      employment_type: input.employmentType ?? 'unknown',
      loan_amount: 0,
      loan_purpose: input.loanPurpose ?? 'unknown',
      financial_profile_source: input.financialProfileSource ?? 'unresolved_needs_review',
      salary_currency: input.salaryCurrency ?? 'ILS',
      job_role: input.jobRole ?? null,
    })
    .select('*')
    .single();
}

/** Deletes every QA-namespaced bank_customers row (national_id starting with "999"). */
export async function cleanupQaBankCustomers(admin: SupabaseClient) {
  const { error } = await admin.from('bank_customers').delete().like('national_id', '999%');
  if (error) throw new Error(`Cleanup failed for QA bank_customers rows: ${error.message}`);
}
