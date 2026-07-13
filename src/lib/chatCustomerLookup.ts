/**
 * Database retrieval layer for the hybrid bank chat assistant.
 *
 * Looks up real `bank_customers` rows (and, if present, their recent
 * `approval_requests` assessment history) for the chat to answer
 * customer/account-specific questions. Uses the normal authenticated
 * Supabase client, so it is bound by the same RLS policies as every other
 * page in the app — it does not bypass access control.
 *
 * Safety rules enforced here (not just described elsewhere):
 *   - Lookup is ALWAYS by exact account number. There is no fuzzy/name-based
 *     search, so the chat can never accidentally surface the wrong customer.
 *   - A customer is only ever considered "found" when the database actually
 *     returned a matching row. Callers must treat every other case (not
 *     found, ambiguous, missing identifier) as "no data available" and must
 *     never fabricate customer fields.
 */

import { supabase } from '@/integrations/supabase/client';
import type { BankCustomerRecord } from '@/lib/bankCustomers';

export type CustomerLookupOutcome =
  | { status: 'found'; customer: BankCustomerRecord }
  | { status: 'not_found'; accountNumber: string }
  | { status: 'ambiguous'; accountNumbers: string[] }
  | { status: 'missing_identifier' };

/** Exact lookup by account number. Returns null when no row matches — never invents one. */
export async function lookupCustomerByAccountNumber(
  accountNumber: string
): Promise<BankCustomerRecord | null> {
  const { data, error } = await supabase
    .from('bank_customers')
    .select('*')
    .eq('account_number', accountNumber.trim().toUpperCase())
    .maybeSingle();

  if (error) {
    throw new Error(error.message || 'Failed to look up the customer by account number.');
  }
  return (data as BankCustomerRecord | null) ?? null;
}

/**
 * Resolves whichever account number(s) the intent classifier found in the
 * question into exactly one of: found / not_found / ambiguous / missing_identifier.
 *
 * Callers should only invoke this when the question actually needs a
 * customer lookup (intent classifier's `hasCustomerSignal`) — that's what
 * makes the no-account-number case mean "the identifier is missing" rather
 * than "no lookup was needed at all".
 */
export async function resolveCustomerForQuery(params: {
  accountNumbers: string[];
}): Promise<CustomerLookupOutcome> {
  const { accountNumbers } = params;

  if (accountNumbers.length > 1) {
    return { status: 'ambiguous', accountNumbers };
  }

  if (accountNumbers.length === 1) {
    const accountNumber = accountNumbers[0];
    const customer = await lookupCustomerByAccountNumber(accountNumber);
    return customer ? { status: 'found', customer } : { status: 'not_found', accountNumber };
  }

  return { status: 'missing_identifier' };
}

export interface AssessmentHistoryRow {
  id: string;
  assessed_at: string | null;
  risk_score: number | null;
  risk_category: string | null;
  loan_type: string | null;
  monthly_installment: number | null;
  eligibility_status: string | null;
  result_source: string | null;
  status: string | null;
}

/**
 * Recent credit-risk assessments already on file for this account, if any.
 * Best-effort: returns an empty array (never throws to the caller) if the
 * table/columns aren't available or the query fails, since assessment
 * history is supplementary context, not the core answer.
 */
export async function getRecentAssessmentsForAccount(
  accountNumber: string,
  limit = 3
): Promise<AssessmentHistoryRow[]> {
  try {
    const { data, error } = await supabase
      .from('approval_requests')
      .select(
        'id, assessed_at, risk_score, risk_category, loan_type, monthly_installment, eligibility_status, result_source, status'
      )
      .eq('account_number', accountNumber.trim().toUpperCase())
      .order('assessed_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.warn('[chatCustomerLookup] assessment history query failed:', error.message);
      return [];
    }
    return (data as AssessmentHistoryRow[] | null) ?? [];
  } catch (err) {
    console.warn('[chatCustomerLookup] assessment history unavailable:', err);
    return [];
  }
}
