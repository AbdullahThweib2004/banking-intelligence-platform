/**
 * Real customer creation for UNEMPLOYED applicants in the "Open New
 * Account" wizard.
 *
 * This is a deliberately separate table/module from bankCustomers.ts, not a
 * nullable "employment_status" column on bank_customers — see the migration
 * (20260723100000_unemployed_customers_and_employed_profile_fields.sql) for
 * the full reasoning: an unemployed customer is never loan-eligible, and
 * putting them in a table Credit Risk's account-number lookup never queries
 * (src/pages/CreditRisk.tsx only reads from bank_customers) enforces that
 * structurally instead of relying on a runtime flag every future feature
 * would have to remember to check.
 *
 * There is no financial-profile concept here at all — this table has no
 * income/expenses/loan columns to fill with real OR fake data. Identity
 * fields only, straight from the ID-extraction step.
 */
import { supabase } from '@/integrations/supabase/client';

export interface UnemployedCustomerRecord {
  id: string;
  account_number: string;
  customer_name: string;
  national_id: string;
  date_of_birth: string | null;
  father_name: string | null;
  mother_name: string | null;
  /** Always false — enforced by a DB CHECK constraint, not just this type. */
  loan_eligible: boolean;
  created_at: string;
}

export interface NewUnemployedAccountOpeningInput {
  customerName: string;
  nationalId: string;
  dateOfBirth?: string | null;
  fatherName?: string | null;
  motherName?: string | null;
}

export interface FindOrCreateUnemployedCustomerResult {
  customer: UnemployedCustomerRecord;
  accountNumber: string;
  /** false when a customer with this national_id already existed and was reused instead of inserted. */
  wasCreated: boolean;
}

/** Looks up an existing unemployed customer by national_id, or null if none exists. */
export async function findUnemployedCustomerByNationalId(
  nationalId: string
): Promise<UnemployedCustomerRecord | null> {
  const { data, error } = await supabase
    .from('unemployed_customers')
    .select('*')
    .eq('national_id', nationalId.trim())
    .maybeSingle();

  if (error) {
    throw new Error(error.message || 'Failed to look up the unemployed customer by national ID.');
  }
  return (data as UnemployedCustomerRecord | null) ?? null;
}

/**
 * Inserts a new `unemployed_customers` row.
 *
 * `account_number` is intentionally left out — the
 * `trg_generate_unemployed_customer_account_number` DB trigger fills it from
 * its own Postgres sequence (BOP-1, BOP-2, BOP-3, ... — deliberately a
 * different, shorter format from bank_customers' BOP-1NNNNN, so the two
 * families can never collide or be confused as strings). No financial
 * fields are ever set here — there are none on this table to set.
 */
async function insertUnemployedCustomer(input: {
  customerName: string;
  nationalId: string;
  dateOfBirth: string | null;
  fatherName: string | null;
  motherName: string | null;
}): Promise<UnemployedCustomerRecord> {
  const { data, error } = await supabase
    .from('unemployed_customers')
    .insert({
      // account_number omitted on purpose — the DB trigger generates it.
      customer_name: input.customerName,
      national_id: input.nationalId,
      date_of_birth: input.dateOfBirth,
      father_name: input.fatherName,
      mother_name: input.motherName,
      // loan_eligible omitted — column DEFAULT false, and a CHECK constraint
      // (unemployed_customers_loan_eligible_always_false) would reject `true`.
    })
    .select('*')
    .single();

  if (error) {
    if (error.code === '23505' && error.message.includes('account_number')) {
      throw new Error('Failed to generate a unique account number — please try again.');
    }
    throw error; // re-thrown so the national_id race case can be handled by the caller
  }

  return data as UnemployedCustomerRecord;
}

/**
 * Idempotent by national_id: finds an existing unemployed customer and
 * reuses their account number if one already exists, otherwise creates a
 * new row. Mirrors findOrCreateBankCustomerFromAccountOpening's exact retry
 * semantics for the employed path.
 */
export async function findOrCreateUnemployedCustomerFromAccountOpening(
  input: NewUnemployedAccountOpeningInput
): Promise<FindOrCreateUnemployedCustomerResult> {
  const customerName = input.customerName.trim();
  const nationalId = input.nationalId.trim();

  if (!customerName) throw new Error('Customer name is required to open an account.');
  if (!nationalId) throw new Error('National ID is required to open an account.');

  const existing = await findUnemployedCustomerByNationalId(nationalId);
  if (existing) {
    return { customer: existing, accountNumber: existing.account_number, wasCreated: false };
  }

  try {
    const created = await insertUnemployedCustomer({
      customerName,
      nationalId,
      dateOfBirth: input.dateOfBirth?.trim() || null,
      fatherName: input.fatherName?.trim() || null,
      motherName: input.motherName?.trim() || null,
    });
    return { customer: created, accountNumber: created.account_number, wasCreated: true };
  } catch (err) {
    const pgError = err as { code?: string; message?: string };
    if (pgError?.code === '23505' && pgError.message?.includes('national_id')) {
      const raceWinner = await findUnemployedCustomerByNationalId(nationalId);
      if (raceWinner) {
        return { customer: raceWinner, accountNumber: raceWinner.account_number, wasCreated: false };
      }
    }
    throw new Error(
      (err as Error)?.message || 'Failed to create or find the unemployed customer record.'
    );
  }
}
