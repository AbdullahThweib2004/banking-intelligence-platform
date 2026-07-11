/**
 * Real customer creation for the "Open New Account" wizard.
 *
 * This is what actually persists a new customer to Supabase — the FastAPI
 * `/accounts/open-new` call (see accountApi.ts) only generates the PDF form
 * and a throwaway reference id; it never touches the database. This module
 * is what makes account opening real: it finds-or-creates a row in
 * `public.bank_customers` and lets the database assign the account number.
 */
import { supabase } from '@/integrations/supabase/client';
import { generateDefaultCustomerFinancialProfile } from '@/lib/accountOpeningDefaults';

export interface BankCustomerRecord {
  id: string;
  account_number: string;
  customer_name: string;
  national_id: string;
  monthly_income: number;
  monthly_expenses: number;
  existing_loans: number;
  employment_type: string;
  loan_amount: number;
  loan_purpose: string;
  loan_restricted: boolean;
  restriction_reason: string | null;
  created_at: string;
}

export interface NewAccountOpeningInput {
  /** OCR/wizard-confirmed identity fields — real customer data. */
  customerName: string;
  nationalId: string;
}

export interface FindOrCreateBankCustomerResult {
  customer: BankCustomerRecord;
  accountNumber: string;
  /** false when a customer with this national_id already existed and was reused instead of inserted. */
  wasCreated: boolean;
}

/** Looks up an existing customer by national_id, or null if none exists. */
export async function findBankCustomerByNationalId(
  nationalId: string
): Promise<BankCustomerRecord | null> {
  const { data, error } = await supabase
    .from('bank_customers')
    .select('*')
    .eq('national_id', nationalId.trim())
    .maybeSingle();

  if (error) {
    throw new Error(error.message || 'Failed to look up the customer by national ID.');
  }
  return (data as BankCustomerRecord | null) ?? null;
}

/**
 * Inserts a new `bank_customers` row.
 *
 * `account_number` is intentionally left out of the insert payload — the
 * `trg_generate_bank_customer_account_number` DB trigger (see migration
 * `20260711100000_bank_customers_account_sequence.sql`, corrected by
 * `20260711120000_fix_bank_customers_account_sequence.sql`) fills it from a
 * Postgres sequence. That is the only race-free way to hand out sequential
 * BOP-1NNNNN numbers under concurrent inserts — this function must never
 * compute or guess the number itself.
 *
 * Fields not available from ID OCR (income, expenses, existing debt,
 * employment, loan purpose/amount) are filled with the clearly-labeled
 * TEMPORARY random defaults from `generateDefaultCustomerFinancialProfile()`.
 */
async function insertBankCustomer(input: {
  customerName: string;
  nationalId: string;
}): Promise<BankCustomerRecord> {
  // Temporary generated defaults — NOT from OCR. See accountOpeningDefaults.ts.
  const defaults = generateDefaultCustomerFinancialProfile();

  const { data, error } = await supabase
    .from('bank_customers')
    .insert({
      // account_number omitted on purpose — the DB trigger generates it.
      customer_name: input.customerName,
      national_id: input.nationalId,
      monthly_income: defaults.monthlyIncome,
      monthly_expenses: defaults.monthlyExpenses,
      existing_loans: defaults.existingLoans,
      employment_type: defaults.employmentType,
      loan_amount: defaults.loanAmount,
      loan_purpose: defaults.loanPurpose,
    })
    .select('*')
    .single();

  if (error) {
    if (error.code === '23505' && error.message.includes('account_number')) {
      throw new Error('Failed to generate a unique account number — please try again.');
    }
    throw error; // re-thrown so the national_id race case can be handled by the caller
  }

  return data as BankCustomerRecord;
}

/**
 * Idempotent by national_id: finds an existing customer and reuses their
 * account number if one already exists, otherwise creates a new row.
 *
 * This is what the "Open New Account" wizard calls. Retrying with the same
 * ID (same national_id extracted by OCR) is safe — it will never insert a
 * duplicate row or throw a raw "already exists" error; it returns the
 * existing customer instead, with `wasCreated: false` so the UI can show a
 * "customer already exists, reusing account BOP-…" message instead of
 * treating it as a failure.
 */
export async function findOrCreateBankCustomerFromAccountOpening(
  input: NewAccountOpeningInput
): Promise<FindOrCreateBankCustomerResult> {
  const customerName = input.customerName.trim();
  const nationalId = input.nationalId.trim();

  if (!customerName) throw new Error('Customer name is required to open an account.');
  if (!nationalId) throw new Error('National ID is required to open an account.');

  // 1. Check first — the common, non-racy path for a deliberate retry.
  const existing = await findBankCustomerByNationalId(nationalId);
  if (existing) {
    return { customer: existing, accountNumber: existing.account_number, wasCreated: false };
  }

  // 2. Not found — try to create it.
  try {
    const created = await insertBankCustomer({ customerName, nationalId });
    return { customer: created, accountNumber: created.account_number, wasCreated: true };
  } catch (err) {
    const pgError = err as { code?: string; message?: string };
    // Another concurrent request created the same national_id between our
    // check and our insert — fetch and reuse the row it created instead of
    // surfacing a raw duplicate-key error.
    if (pgError?.code === '23505' && pgError.message?.includes('national_id')) {
      const raceWinner = await findBankCustomerByNationalId(nationalId);
      if (raceWinner) {
        return { customer: raceWinner, accountNumber: raceWinner.account_number, wasCreated: false };
      }
    }
    throw new Error(
      (err as Error)?.message || 'Failed to create or find the customer record.'
    );
  }
}

/** Most recently created customer — used to surface a "latest account number" hint. */
export async function getLatestBankCustomer(): Promise<BankCustomerRecord | null> {
  const { data, error } = await supabase
    .from('bank_customers')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('Failed to load latest bank customer:', error);
    return null;
  }
  return (data as BankCustomerRecord | null) ?? null;
}
