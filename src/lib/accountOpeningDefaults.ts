/**
 * Placeholder financial-profile generator for newly onboarded customers.
 *
 * The "Open New Account" wizard only captures identity fields from ID OCR —
 * name, date of birth, parents' names, national ID. It has no way to know a
 * brand-new customer's real income, expenses, existing debt, or intended
 * loan, and `bank_customers` has NOT NULL columns for all of those. Until a
 * real onboarding/KYC financial questionnaire exists, this module fills them
 * with reasonable randomized defaults so the insert succeeds and the
 * customer is immediately usable for a Credit Risk assessment.
 *
 * TEMPORARY — every value produced here is fake. Replace this module with
 * real captured data once the wizard (or a follow-up onboarding step)
 * actually collects it. Callers must not treat these numbers as real
 * financial data.
 */

export type GeneratedEmploymentType = 'employed' | 'self-employed' | 'business';
export type GeneratedLoanPurpose = 'personal' | 'car' | 'home' | 'business';

export interface GeneratedCustomerFinancialProfile {
  monthlyIncome: number;
  monthlyExpenses: number;
  existingLoans: number;
  employmentType: GeneratedEmploymentType;
  loanAmount: number;
  loanPurpose: GeneratedLoanPurpose;
}

const EMPLOYMENT_TYPES: GeneratedEmploymentType[] = [
  'employed',
  'employed',
  'employed',
  'self-employed',
  'business',
];

const LOAN_PURPOSES: GeneratedLoanPurpose[] = ['personal', 'car', 'home', 'business'];

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(items: readonly T[]): T {
  return items[randomInt(0, items.length - 1)];
}

/** Generates a plausible-but-fake financial profile for a new customer. */
export function generateDefaultCustomerFinancialProfile(): GeneratedCustomerFinancialProfile {
  const monthlyIncome = randomInt(2500, 9000);
  const monthlyExpenses = Math.round(monthlyIncome * (randomInt(30, 45) / 100));
  const existingLoans = Math.random() < 0.5 ? 0 : randomInt(500, 3000);
  const loanAmount = randomInt(5000, 50000);

  return {
    monthlyIncome,
    monthlyExpenses,
    existingLoans,
    employmentType: pick(EMPLOYMENT_TYPES),
    loanAmount,
    loanPurpose: pick(LOAN_PURPOSES),
  };
}
