/**
 * Deterministic, explainable risk-percentage model.
 *
 * This replaces the old ad hoc "debt service ratio" heuristic with a
 * transparent weighted model grounded directly in the bank-calculator
 * business rules (DBR cap, age-at-maturity cap) plus loan-shape stress
 * factors. Every contribution is a named, documented formula — never a
 * black box, and never produced by AI.
 *
 * score = base + dbrComponent + ageComponent + termComponent
 *              + loanToIncomeComponent + obligationsPressureComponent
 *              + employmentAdjustment
 * clamped to [0, 100].
 *
 * Category bands are unchanged from the legacy model (low < 40, medium
 * 40–69, high >= 70) so every existing consumer (Approvals/Dashboard badge
 * colors, risk_category counts) keeps working without modification.
 *
 * Eligibility is a HARD override on top of the soft score: an ineligible
 * application (DBR or age-at-maturity breach) is always shown as high risk
 * and recommended for rejection, regardless of what the weighted score
 * alone would say — see applyEligibilityOverride().
 */

export interface FeatureContribution {
  key: string;
  labelEn: string;
  labelAr: string;
  /** Raw feature value shown to the user. */
  displayValue: string;
  /** Points added to the risk score (positive = higher risk). */
  impact: number;
}

export type RiskCategory = 'low' | 'medium' | 'high';

export interface RiskScoringInput {
  debtBurdenRatio: number;
  dbrCap: number;
  /** Null when age was not provided — the age component is then skipped (0 impact), not assumed safe. */
  ageAtMaturity: number | null;
  ageAtMaturityCap: number;
  loanTermYears: number;
  requestedLoanAmountInSalaryCurrency: number;
  monthlySalary: number;
  monthlyObligations: number;
  employmentType: string;
}

export interface RiskScoringResult {
  score: number;
  category: RiskCategory;
  contributions: FeatureContribution[];
}

export const BASE_SCORE = 5;
const MAX_TERM_YEARS_REFERENCE = 30;
const LOAN_TO_ANNUAL_INCOME_REFERENCE = 5; // "5x annual salary" treated as a high-stress reference point
const OBLIGATIONS_TO_SALARY_REFERENCE = 0.3; // 30% of salary already committed is treated as a stress reference point

const EMPLOYMENT_RISK_ADJUSTMENT: Record<string, number> = {
  employed: 0,
  business: 2,
  'self-employed': 3,
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function categoryFromScore(score: number): RiskCategory {
  if (score < 40) return 'low';
  if (score < 70) return 'medium';
  return 'high';
}

/** Deterministic 0-100+ (pre-clamp) risk score with a fully itemized breakdown. */
export function computeFormulaRiskScore(input: RiskScoringInput): RiskScoringResult {
  const contributions: FeatureContribution[] = [];

  // 1. Debt burden ratio utilization — the single biggest factor, since DBR
  //    breaching the cap is also a hard eligibility failure.
  const dbrComponent = round2((input.debtBurdenRatio / input.dbrCap) * 40);
  contributions.push({
    key: 'debt_burden_ratio',
    labelEn: 'Debt burden ratio utilization (of the 50% cap)',
    labelAr: 'استخدام نسبة عبء الدين (من الحد الأقصى 50%)',
    displayValue: `${(input.debtBurdenRatio * 100).toFixed(1)}%`,
    impact: dbrComponent,
  });

  // 2. Age-at-maturity proximity to the cap.
  const ageComponent =
    input.ageAtMaturity == null
      ? 0
      : round2(Math.min(30, (input.ageAtMaturity / input.ageAtMaturityCap) * 20));
  contributions.push({
    key: 'age_at_maturity',
    labelEn: 'Age at loan maturity (relative to the age cap)',
    labelAr: 'العمر عند استحقاق القرض (نسبة إلى الحد الأقصى للعمر)',
    displayValue: input.ageAtMaturity == null ? 'unknown' : `${input.ageAtMaturity} yrs (cap ${input.ageAtMaturityCap})`,
    impact: ageComponent,
  });

  // 3. Loan term stress — longer commitments carry more risk exposure.
  const termComponent = round2(
    Math.min(15, (Math.max(0, input.loanTermYears) / MAX_TERM_YEARS_REFERENCE) * 15)
  );
  contributions.push({
    key: 'loan_term',
    labelEn: 'Loan term length',
    labelAr: 'مدة القرض',
    displayValue: `${input.loanTermYears} yrs`,
    impact: termComponent,
  });

  // 4. Loan amount relative to annual income.
  const annualSalary = Math.max(1, input.monthlySalary * 12);
  const loanToAnnualIncome = input.requestedLoanAmountInSalaryCurrency / annualSalary;
  const loanToIncomeComponent = round2(
    Math.min(20, (loanToAnnualIncome / LOAN_TO_ANNUAL_INCOME_REFERENCE) * 15)
  );
  contributions.push({
    key: 'loan_to_income',
    labelEn: 'Requested loan amount relative to annual income',
    labelAr: 'مبلغ القرض المطلوب نسبة إلى الدخل السنوي',
    displayValue: `${loanToAnnualIncome.toFixed(2)}× annual income`,
    impact: loanToIncomeComponent,
  });

  // 5. Existing obligations pressure, independent of this new loan.
  const obligationsRatio = input.monthlySalary > 0 ? input.monthlyObligations / input.monthlySalary : 1;
  const obligationsComponent = round2(
    Math.min(10, (obligationsRatio / OBLIGATIONS_TO_SALARY_REFERENCE) * 10)
  );
  contributions.push({
    key: 'obligations_pressure',
    labelEn: 'Existing obligations relative to salary',
    labelAr: 'الالتزامات الحالية نسبة إلى الراتب',
    displayValue: `${(obligationsRatio * 100).toFixed(1)}%`,
    impact: obligationsComponent,
  });

  // 6. Minor employment-stability adjustment (kept from the legacy model).
  const employmentAdjustment = EMPLOYMENT_RISK_ADJUSTMENT[input.employmentType] ?? 2;
  contributions.push({
    key: 'employment_type',
    labelEn: 'Employment stability',
    labelAr: 'استقرار التوظيف',
    displayValue: input.employmentType,
    impact: employmentAdjustment,
  });

  contributions.sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact));

  const rawScore = BASE_SCORE + contributions.reduce((sum, c) => sum + c.impact, 0);
  const score = Math.min(100, Math.max(0, Math.round(rawScore)));

  return { score, category: categoryFromScore(score), contributions };
}

/**
 * Eligibility is a hard gate: an ineligible application is always surfaced
 * as high risk / reject, regardless of the soft weighted score. The
 * original score is preserved in the contributions/result for transparency
 * ("the model said medium, but the application is ineligible") rather than
 * silently rewritten.
 */
export function applyEligibilityOverride(
  result: RiskScoringResult,
  eligible: boolean
): RiskScoringResult {
  if (eligible) return result;
  return { ...result, category: 'high' };
}
