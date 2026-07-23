/**
 * Single entry point the "Open New Account" wizard uses to actually create
 * a customer, after the Employment Status branch (employed vs unemployed).
 *
 * Exists specifically to enforce ONE rule neither bankCustomers.ts nor
 * unemployedCustomers.ts can enforce on its own: the same national_id must
 * never end up with two accounts under two different customer categories —
 * e.g. an unemployed BOP-3 today, then a separate employed BOP-100015 later
 * for the same person, just because the wizard was run twice with a
 * different answer to "employed or unemployed". Each table's own
 * find-or-create only checks for a duplicate *within its own table*.
 */
import {
  findBankCustomerByNationalId,
  findOrCreateBankCustomerFromAccountOpening,
  type NewAccountOpeningInput,
  type FindOrCreateBankCustomerResult,
} from './bankCustomers';
import {
  findUnemployedCustomerByNationalId,
  findOrCreateUnemployedCustomerFromAccountOpening,
  type NewUnemployedAccountOpeningInput,
  type FindOrCreateUnemployedCustomerResult,
} from './unemployedCustomers';

export type AccountOpeningResult =
  | ({ category: 'employed' } & FindOrCreateBankCustomerResult)
  | ({ category: 'unemployed' } & FindOrCreateUnemployedCustomerResult);

function crossCategoryError(
  otherCategory: 'employed' | 'unemployed',
  accountNumber: string,
  customerName: string
): Error {
  return new Error(
    `This national ID already has ${otherCategory === 'employed' ? 'an employed' : 'an unemployed'}-category ` +
      `account on file (${accountNumber}, ${customerName}). A person cannot hold both an unemployed and an ` +
      'employed account — please verify the identity before continuing.'
  );
}

/**
 * Creates (or reuses) a customer under exactly one category, after checking
 * the OTHER category's table for a pre-existing account under the same
 * national_id and refusing to proceed if one is found.
 */
export async function openAccountForCustomer(
  employmentStatus: 'employed',
  input: NewAccountOpeningInput
): Promise<AccountOpeningResult>;
export async function openAccountForCustomer(
  employmentStatus: 'unemployed',
  input: NewUnemployedAccountOpeningInput
): Promise<AccountOpeningResult>;
export async function openAccountForCustomer(
  employmentStatus: 'employed' | 'unemployed',
  input: NewAccountOpeningInput | NewUnemployedAccountOpeningInput
): Promise<AccountOpeningResult> {
  const nationalId = input.nationalId.trim();

  if (employmentStatus === 'employed') {
    const existingUnemployed = await findUnemployedCustomerByNationalId(nationalId);
    if (existingUnemployed) {
      throw crossCategoryError('unemployed', existingUnemployed.account_number, existingUnemployed.customer_name);
    }
    const result = await findOrCreateBankCustomerFromAccountOpening(input as NewAccountOpeningInput);
    return { category: 'employed', ...result };
  }

  const existingEmployed = await findBankCustomerByNationalId(nationalId);
  if (existingEmployed) {
    throw crossCategoryError('employed', existingEmployed.account_number, existingEmployed.customer_name);
  }
  const result = await findOrCreateUnemployedCustomerFromAccountOpening(
    input as NewUnemployedAccountOpeningInput
  );
  return { category: 'unemployed', ...result };
}
