/**
 * Real customer creation for the "Open New Account" wizard.
 *
 * This is what actually persists a new customer to Supabase — the FastAPI
 * `/accounts/open-new` call (see accountApi.ts) only generates the PDF form
 * and a throwaway reference id; it never touches the database. This module
 * is what makes account opening real: it inserts a row into
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

/**
 * Creates a real `bank_customers` row for a newly opened account.
 *
 * `account_number` is intentionally left out of the insert payload — the
 * `trg_generate_bank_customer_account_number` DB trigger (see migration
 * `20260711100000_bank_customers_account_sequence.sql`) fills it from a
 * Postgres sequence. That is the only race-free way to hand out sequential
 * BOP-NNNNNN numbers under concurrent inserts — this function must never
 * compute or guess the number itself.
 *
 * Fields not available from ID OCR (income, expenses, existing debt,
 * employment, loan purpose/amount) are filled with the clearly-labeled
 * TEMPORARY random defaults from `generateDefaultCustomerFinancialProfile()`.
 */
export async function createBankCustomerFromAccountOpening(
  input: NewAccountOpeningInput
): Promise<BankCustomerRecord> {
  const customerName = input.customerName.trim();
  const nationalId = input.nationalId.trim();

  if (!customerName) throw new Error('Customer name is required to open an account.');
  if (!nationalId) throw new Error('National ID is required to open an account.');

  // Temporary generated defaults — NOT from OCR. See accountOpeningDefaults.ts.
  const defaults = generateDefaultCustomerFinancialProfile();

  const { data, error } = await supabase
    .from('bank_customers')
    .insert({
      // account_number omitted on purpose — the DB trigger generates it.
      customer_name: customerName,
      national_id: nationalId,
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
    if (error.code === '23505' && error.message.includes('national_id')) {
      throw new Error(
        `A customer with national ID "${nationalId}" already exists in the database.`
      );
    }
    if (error.code === '23505' && error.message.includes('account_number')) {
      throw new Error('Failed to generate a unique account number — please try again.');
    }
    throw new Error(error.message || 'Failed to create the customer record.');
  }

  return data as BankCustomerRecord;
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
