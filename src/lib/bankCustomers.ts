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
import { resolveEmploymentMatch, type EmploymentMatchOutcome } from '@/lib/employmentMatch';

export type { EmploymentMatchOutcome } from '@/lib/employmentMatch';

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
  /** Provenance of the financial-profile fields above — see ResolvedFinancialProfile. */
  financial_profile_source: string;
  created_at: string;
}

/**
 * Where a customer's financial-profile fields (income, expenses, existing
 * debt, employment, loan amount/purpose) actually came from. Replaces the
 * old always-random `generateDefaultCustomerFinancialProfile()` — every new
 * `bank_customers` row must now carry an honest source instead of silently
 * invented numbers.
 */
export type FinancialProfileSource =
  | 'database_match'
  | 'employment_proof_extracted'
  | 'manual_entry'
  | 'unresolved_needs_review';

export interface ResolvedFinancialProfile {
  monthlyIncome: number;
  monthlyExpenses: number;
  existingLoans: number;
  employmentType: string;
  loanAmount: number;
  loanPurpose: string;
  source: FinancialProfileSource;
}

/**
 * The only fallback used when no real financial data could be resolved
 * (no database match, no usable employment-proof extraction, and staff did
 * not manually enter values). Uses the same NOT-NULL-column defaults the
 * database itself would use (0 / 'unknown') rather than a plausible-looking
 * random number, and is explicitly flagged via `source` so downstream
 * consumers (Credit Risk scoring, the chat assistant, reporting) never
 * mistake "unknown" for "verified zero income" — 'unknown' is the same
 * sentinel already used elsewhere in this codebase for unset
 * employment_type/loan_purpose (see src/lib/creditScoring.ts).
 */
export const UNRESOLVED_FINANCIAL_PROFILE: ResolvedFinancialProfile = {
  monthlyIncome: 0,
  monthlyExpenses: 0,
  existingLoans: 0,
  employmentType: 'unknown',
  loanAmount: 0,
  loanPurpose: 'unknown',
  source: 'unresolved_needs_review',
};

export interface NewAccountOpeningInput {
  /** OCR/wizard-confirmed identity fields — real customer data. */
  customerName: string;
  nationalId: string;
  /** Resolved during the Employment Proof step — never randomly generated. */
  financialProfile: ResolvedFinancialProfile;
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
 * Financial-profile fields (income, expenses, existing debt, employment,
 * loan purpose/amount) come from the caller's resolved `financialProfile` —
 * real data retrieved during the Employment Proof step, or the explicit
 * `UNRESOLVED_FINANCIAL_PROFILE` sentinel when no reliable source was
 * found. This function never generates or guesses these values itself.
 */
async function insertBankCustomer(input: {
  customerName: string;
  nationalId: string;
  financialProfile: ResolvedFinancialProfile;
}): Promise<BankCustomerRecord> {
  const profile = input.financialProfile;

  const { data, error } = await supabase
    .from('bank_customers')
    .insert({
      // account_number omitted on purpose — the DB trigger generates it.
      customer_name: input.customerName,
      national_id: input.nationalId,
      monthly_income: profile.monthlyIncome,
      monthly_expenses: profile.monthlyExpenses,
      existing_loans: profile.existingLoans,
      employment_type: profile.employmentType,
      loan_amount: profile.loanAmount,
      loan_purpose: profile.loanPurpose,
      financial_profile_source: profile.source,
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
 * financial_profile_source values that mean "nothing real was ever
 * confirmed" — either a legacy row (created before this table tracked
 * provenance, including the old random-default generator) or a row that was
 * explicitly left unresolved. Only these are ever eligible to be refreshed
 * by refreshStaleFinancialProfile(); anything else is treated as already
 * real/verified data and is never silently overwritten.
 */
const STALE_FINANCIAL_SOURCES = new Set<string>(['unknown', 'unresolved_needs_review']);

/**
 * When the wizard is reopened on an already-existing customer (same
 * national_id), this upgrades a stale/never-resolved financial profile with
 * newly resolved real data from this run's Employment Proof step — without
 * this, a legacy row's old fake numbers (e.g. from the pre-this-feature
 * random-default generator) would be returned and silently reused forever,
 * even after the customer's real employment proof / a real database match
 * has since become available.
 *
 * Deliberately conservative: only upgrades when the EXISTING row is stale
 * AND the NEW profile is actually resolved — an already-real profile
 * (database_match / employment_proof_extracted / manual_entry) is never
 * downgraded or overwritten, and a still-unresolved new attempt never wipes
 * out a row that already has real data.
 */
async function refreshStaleFinancialProfile(
  existing: BankCustomerRecord,
  newProfile: ResolvedFinancialProfile
): Promise<BankCustomerRecord> {
  const existingIsStale = STALE_FINANCIAL_SOURCES.has(existing.financial_profile_source);
  const newIsResolved = newProfile.source !== 'unresolved_needs_review';
  if (!existingIsStale || !newIsResolved) {
    return existing;
  }

  const { data, error } = await supabase
    .from('bank_customers')
    .update({
      monthly_income: newProfile.monthlyIncome,
      monthly_expenses: newProfile.monthlyExpenses,
      existing_loans: newProfile.existingLoans,
      employment_type: newProfile.employmentType,
      loan_amount: newProfile.loanAmount,
      loan_purpose: newProfile.loanPurpose,
      financial_profile_source: newProfile.source,
    })
    .eq('id', existing.id)
    .select('*')
    .single();

  if (error) {
    console.warn('Failed to refresh a stale financial profile — keeping the existing row as-is:', error.message);
    return existing;
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
    const refreshed = await refreshStaleFinancialProfile(existing, input.financialProfile);
    return { customer: refreshed, accountNumber: refreshed.account_number, wasCreated: false };
  }

  // 2. Not found — try to create it.
  try {
    const created = await insertBankCustomer({
      customerName,
      nationalId,
      financialProfile: input.financialProfile,
    });
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

/** Looks up existing customers by exact (case-insensitive) full name. Never a fuzzy/partial match. */
async function findBankCustomersByName(fullName: string): Promise<BankCustomerRecord[]> {
  const trimmed = fullName.trim();
  if (!trimmed) return [];

  const { data, error } = await supabase
    .from('bank_customers')
    .select('*')
    .ilike('customer_name', trimmed);

  if (error) {
    throw new Error(error.message || 'Failed to search for a matching customer by name.');
  }
  return (data as BankCustomerRecord[] | null) ?? [];
}

/**
 * Used by the Employment Proof step to retrieve a customer's REAL financial
 * profile instead of inventing one. Tries an exact national_id match first
 * (the only outcome ever auto-applied); falls back to a name-only search
 * whose result is surfaced for staff confirmation, never auto-applied — see
 * employmentMatch.ts for the full reasoning behind this split.
 */
export async function matchCustomerFinancialRecord(input: {
  nationalId: string;
  fullName: string;
}): Promise<EmploymentMatchOutcome> {
  const nationalId = input.nationalId.trim();
  const nationalIdMatch = nationalId ? await findBankCustomerByNationalId(nationalId) : null;
  const nameMatches = nationalIdMatch ? [] : await findBankCustomersByName(input.fullName);
  return resolveEmploymentMatch(nationalIdMatch, nameMatches);
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
