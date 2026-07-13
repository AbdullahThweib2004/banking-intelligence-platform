/**
 * Deterministic loan payment calculation — the standard declining-balance
 * annuity/EMI formula:
 *
 *   M = P * [ r(1+r)^n ] / [ (1+r)^n - 1 ]
 *
 * Where P = principal, r = monthly rate (annual rate / 12), n = number of
 * months, M = monthly installment.
 *
 * This is pure, synchronous, and has no external dependency — it is the
 * source of truth for every displayed installment/interest figure. Nothing
 * about the loan's monthly payment is ever decided by AI.
 */

export interface LoanCalculationInput {
  /** Loan principal, in the loan's own currency. */
  principal: number;
  /** Annual interest rate as a decimal, e.g. 0.085 = 8.5%. */
  annualRate: number;
  /** Loan term in years. */
  termYears: number;
}

export interface LoanCalculationResult {
  monthlyInstallment: number;
  totalRepaid: number;
  totalInterest: number;
  months: number;
  monthlyRate: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Computes the monthly installment, total repaid, and total interest for a
 * loan using the standard annuity/EMI formula.
 *
 * Edge cases handled explicitly rather than left to divide-by-zero:
 *   - principal <= 0            -> everything is 0
 *   - termYears <= 0             -> everything is 0 (no valid term)
 *   - annualRate <= 0            -> straight-line principal / months, no interest
 */
export function calculateLoanPayment(input: LoanCalculationInput): LoanCalculationResult {
  const principal = Math.max(0, input.principal);
  const termYears = Math.max(0, input.termYears);
  const months = Math.round(termYears * 12);
  const monthlyRate = Math.max(0, input.annualRate) / 12;

  if (principal <= 0 || months <= 0) {
    return { monthlyInstallment: 0, totalRepaid: 0, totalInterest: 0, months, monthlyRate };
  }

  if (monthlyRate <= 0) {
    const monthlyInstallment = round2(principal / months);
    const totalRepaid = round2(monthlyInstallment * months);
    return { monthlyInstallment, totalRepaid, totalInterest: round2(totalRepaid - principal), months, monthlyRate };
  }

  const factor = Math.pow(1 + monthlyRate, months);
  const monthlyInstallment = round2((principal * monthlyRate * factor) / (factor - 1));
  const totalRepaid = round2(monthlyInstallment * months);
  const totalInterest = round2(totalRepaid - principal);

  return { monthlyInstallment, totalRepaid, totalInterest, months, monthlyRate };
}
