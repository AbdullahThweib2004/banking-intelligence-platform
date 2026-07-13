/**
 * Eligibility business rules — the hard pass/fail gates a loan calculator
 * applies on top of the raw EMI numbers:
 *
 *   1. Debt burden ratio (DBR):
 *        (existing monthly obligations + new monthly installment) / monthly
 *        salary <= 50%
 *   2. Age-at-maturity:
 *        client age + loan term (years) <= 70
 *
 * Both are deterministic and never touched by AI. `eligible` is a hard gate:
 * a technically "medium risk" score can still be `not_eligible` if either
 * rule is breached, and callers should treat that as a stronger signal than
 * the soft score.
 */

export const DBR_CAP = 0.5;
export const AGE_AT_MATURITY_CAP = 70;

export type ClientSegment = 'standard' | 'freelancer_housing';

/**
 * Segment-specific overrides, structured so a stricter freelancer/housing
 * rule (e.g. a lower age cap and a housing amount cap, per the source
 * research) can be added later without reshaping the eligibility API. Not
 * populated yet — this project doesn't currently capture the employment
 * segmentation (freelancer vs. salaried) needed to apply it correctly, so
 * only the 'standard' segment is implemented. Extend this map when that data
 * becomes available; `evaluateEligibility` already reads from it.
 */
const SEGMENT_RULES: Partial<Record<ClientSegment, { ageAtMaturityCap: number }>> = {
  standard: { ageAtMaturityCap: AGE_AT_MATURITY_CAP },
  // freelancer_housing: { ageAtMaturityCap: 65 }, // + a housing amount cap, when supported
};

export type EligibilityStatus = 'eligible' | 'not_eligible';

export interface EligibilityInput {
  /** Existing monthly obligations, in the salary's currency. */
  monthlyObligations: number;
  /** The new loan's monthly installment, in the salary's currency. */
  monthlyInstallment: number;
  monthlySalary: number;
  /** Null when the client's age wasn't provided — the age rule is then skipped, not assumed to pass. */
  clientAge: number | null;
  loanTermYears: number;
  segment?: ClientSegment;
}

export interface EligibilityResult {
  debtBurdenRatio: number;
  dbrCap: number;
  dbrExceeded: boolean;
  ageAtMaturity: number | null;
  ageAtMaturityCap: number;
  ageExceeded: boolean;
  status: EligibilityStatus;
  reasons: string[];
}

/** (existing monthly obligations + new monthly installment) / monthly salary. */
export function computeDebtBurdenRatio(params: {
  monthlyObligations: number;
  monthlyInstallment: number;
  monthlySalary: number;
}): number {
  const { monthlyObligations, monthlyInstallment, monthlySalary } = params;
  if (monthlySalary <= 0) return monthlyObligations + monthlyInstallment > 0 ? 1 : 0;
  return (Math.max(0, monthlyObligations) + Math.max(0, monthlyInstallment)) / monthlySalary;
}

/** client age + loan term in years. Null when age is unknown. */
export function computeAgeAtMaturity(params: {
  clientAge: number | null;
  loanTermYears: number;
}): number | null {
  if (params.clientAge == null || !Number.isFinite(params.clientAge)) return null;
  return params.clientAge + Math.max(0, params.loanTermYears);
}

export function evaluateEligibility(input: EligibilityInput): EligibilityResult {
  const segment = input.segment ?? 'standard';
  const ageAtMaturityCap = SEGMENT_RULES[segment]?.ageAtMaturityCap ?? AGE_AT_MATURITY_CAP;

  const debtBurdenRatio = computeDebtBurdenRatio(input);
  const dbrExceeded = debtBurdenRatio > DBR_CAP;

  const ageAtMaturity = computeAgeAtMaturity(input);
  const ageExceeded = ageAtMaturity != null && ageAtMaturity > ageAtMaturityCap;

  const reasons: string[] = [];
  if (dbrExceeded) {
    reasons.push(
      `Debt burden ratio ${(debtBurdenRatio * 100).toFixed(1)}% exceeds the ${(DBR_CAP * 100).toFixed(0)}% cap.`
    );
  }
  if (ageExceeded) {
    reasons.push(
      `Client age at loan maturity (${ageAtMaturity}) exceeds the cap of ${ageAtMaturityCap}.`
    );
  }

  return {
    debtBurdenRatio,
    dbrCap: DBR_CAP,
    dbrExceeded,
    ageAtMaturity,
    ageAtMaturityCap,
    ageExceeded,
    status: dbrExceeded || ageExceeded ? 'not_eligible' : 'eligible',
    reasons,
  };
}
