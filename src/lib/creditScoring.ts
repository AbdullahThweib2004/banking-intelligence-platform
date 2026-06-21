/**
 * Deterministic credit risk scoring with transparent feature attribution.
 *
 * Uses the employee-entered requested loan amount (not the DB profile default).
 * Feature impacts are additive (SHAP-equivalent for this linear model).
 */

export interface CreditScoreInput {
  monthlyIncome: number;
  monthlyExpenses: number;
  existingLoans: number;
  /** Employee-entered requested amount at submission time. */
  requestedLoanAmount: number;
  employmentType: string;
  loanPurpose?: string;
}

export interface DerivedFeatures {
  monthly_income: number;
  monthly_expenses: number;
  existing_loans: number;
  requested_loan_amount: number;
  existing_loan_monthly_payment: number;
  estimated_new_loan_payment: number;
  total_monthly_debt_service: number;
  debt_service_ratio: number;
  loan_to_annual_income_ratio: number;
  loan_to_monthly_income_ratio: number;
  disposable_income: number;
  employment_type: string;
  loan_purpose: string;
}

export interface FeatureContribution {
  key: string;
  labelEn: string;
  labelAr: string;
  /** Raw feature value shown to the user. */
  displayValue: string;
  /** Points added to the risk score (positive = higher risk). */
  impact: number;
}

/** Qualitative factor shape returned by the AI assessment service. */
export interface AiTopFactor {
  label: string;
  /** Qualitative magnitude: "high" | "medium" | "low". */
  impact: string;
  /** "increases risk" | "decreases risk". */
  direction: string;
  /** Short human-readable value, e.g. "64%". */
  value: string;
}

/** A saved top factor may originate from the AI service or the legacy math engine. */
export type SavedTopFactor = AiTopFactor | FeatureContribution;

export type RecommendedAction = 'approve' | 'manual_review' | 'reject';
export type ResultSource = 'ai' | 'algorithm';

export interface CreditScoreResult {
  score: number;
  category: 'low' | 'medium' | 'high';
  features: DerivedFeatures;
  contributions: FeatureContribution[];
  /** Full payload logged at inference time. */
  inferencePayload: {
    input: CreditScoreInput;
    derived: DerivedFeatures;
    contributions: FeatureContribution[];
    score: number;
    category: 'low' | 'medium' | 'high';
  };
}

/** Snapshot persisted on approval_requests and shown in the view modal. */
export interface SavedRiskExplanation {
  risk_score: number;
  risk_category: 'low' | 'medium' | 'high';
  risk_confidence?: number | null;
  risk_explanation_summary: string;
  risk_top_factors: SavedTopFactor[];
  risk_derived_features: DerivedFeatures;
  recommended_action?: RecommendedAction | null;
  result_source?: ResultSource | null;
  assessed_at: string;
}

export function buildExplanationSummary(
  result: CreditScoreResult,
  language: 'en' | 'ar' = 'en'
): string {
  const top = result.contributions.filter((c) => Math.abs(c.impact) >= 0.5).slice(0, 3);
  const dsr = (result.features.debt_service_ratio * 100).toFixed(1);
  const loan = result.features.requested_loan_amount.toLocaleString();

  if (language === 'ar') {
    const factors = top
      .map((f) => `${f.labelAr} (${f.impact > 0 ? '+' : ''}${f.impact.toFixed(1)})`)
      .join('؛ ');
    return `تم احتساب درجة ${result.score} (${result.category}) بناءً على نسبة خدمة الدين ${dsr}% وقرض مطلوب ₪${loan}. أهم العوامل: ${factors || '—'}.`;
  }

  const factors = top
    .map((f) => `${f.labelEn} (${f.impact > 0 ? '+' : ''}${f.impact.toFixed(1)} pts)`)
    .join('; ');
  return `Score ${result.score} (${result.category} risk) driven by a ${dsr}% debt service ratio and requested loan of ₪${loan}. Top factors: ${factors || '—'}.`;
}

export function serializeRiskExplanation(result: CreditScoreResult): SavedRiskExplanation {
  const topFactors = result.contributions
    .filter((c) => Math.abs(c.impact) >= 0.5)
    .slice(0, 6);

  const recommended_action: RecommendedAction =
    result.category === 'low' ? 'approve' : result.category === 'medium' ? 'manual_review' : 'reject';

  return {
    risk_score: result.score,
    risk_category: result.category,
    risk_confidence: null,
    risk_explanation_summary: buildExplanationSummary(result, 'en'),
    risk_top_factors: topFactors,
    risk_derived_features: result.features,
    recommended_action,
    result_source: 'algorithm',
    assessed_at: new Date().toISOString(),
  };
}

export function hasSavedRiskExplanation(row: {
  risk_top_factors?: unknown;
  risk_derived_features?: unknown;
  assessed_at?: string | null;
}): boolean {
  return (
    row.risk_top_factors != null &&
    row.risk_derived_features != null &&
    row.assessed_at != null
  );
}

const LOAN_TERM_MONTHS = 60;
const ANNUAL_INTEREST_RATE = 0.09;

const EMPLOYMENT_RISK: Record<string, number> = {
  employed: 0,
  'self-employed': 6,
  business: 4,
};

/** Standard amortizing monthly payment estimate. */
export function estimateMonthlyLoanPayment(
  principal: number,
  months = LOAN_TERM_MONTHS,
  annualRate = ANNUAL_INTEREST_RATE
): number {
  if (principal <= 0) return 0;
  const r = annualRate / 12;
  if (r <= 0) return principal / months;
  const factor = Math.pow(1 + r, months);
  return (principal * r * factor) / (factor - 1);
}

export function buildDerivedFeatures(input: CreditScoreInput): DerivedFeatures {
  const income = Math.max(0, input.monthlyIncome);
  const expenses = Math.max(0, input.monthlyExpenses);
  const existing = Math.max(0, input.existingLoans);
  const requested = Math.max(0, input.requestedLoanAmount);

  const existingMonthly = existing / 12;
  const newPayment = estimateMonthlyLoanPayment(requested);
  const totalDebtService = expenses + existingMonthly + newPayment;
  const debtServiceRatio = income > 0 ? totalDebtService / income : 1;
  const annualIncome = income * 12;
  const loanToAnnualIncome = annualIncome > 0 ? requested / annualIncome : requested > 0 ? 99 : 0;
  const loanToMonthlyIncome = income > 0 ? requested / income : requested > 0 ? 99 : 0;
  const disposable = income - totalDebtService;

  return {
    monthly_income: income,
    monthly_expenses: expenses,
    existing_loans: existing,
    requested_loan_amount: requested,
    existing_loan_monthly_payment: round2(existingMonthly),
    estimated_new_loan_payment: round2(newPayment),
    total_monthly_debt_service: round2(totalDebtService),
    debt_service_ratio: round4(debtServiceRatio),
    loan_to_annual_income_ratio: round4(loanToAnnualIncome),
    loan_to_monthly_income_ratio: round4(loanToMonthlyIncome),
    disposable_income: round2(disposable),
    employment_type: input.employmentType || 'unknown',
    loan_purpose: input.loanPurpose || 'unknown',
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function clampScore(score: number): number {
  return Math.min(100, Math.max(0, Math.round(score)));
}

function categoryFromScore(score: number): 'low' | 'medium' | 'high' {
  if (score < 40) return 'low';
  if (score < 70) return 'medium';
  return 'high';
}

function fmtMoney(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function fmtPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

/**
 * Compute risk score and per-feature impacts (additive attribution).
 */
export function computeCreditScore(input: CreditScoreInput): CreditScoreResult {
  const features = buildDerivedFeatures(input);
  const contributions: FeatureContribution[] = [];

  const dsrImpact = Math.min(38, Math.max(0, (features.debt_service_ratio - 0.3) * 65));
  contributions.push({
    key: 'debt_service_ratio',
    labelEn: 'Debt service ratio (expenses + loans + new payment / income)',
    labelAr: 'نسبة خدمة الدين (مصاريف + قروض + دفعة جديدة / الدخل)',
    displayValue: fmtPct(features.debt_service_ratio),
    impact: round2(dsrImpact),
  });

  const loanAmountImpact = Math.min(
    22,
    Math.max(0, (features.loan_to_monthly_income_ratio - 2) * 4.5)
  );
  contributions.push({
    key: 'requested_loan_amount',
    labelEn: 'Requested loan amount (relative to monthly income)',
    labelAr: 'مبلغ القرض المطلوب (نسبة إلى الدخل الشهري)',
    displayValue: `${fmtMoney(features.requested_loan_amount)} (${features.loan_to_monthly_income_ratio.toFixed(1)}× monthly income)`,
    impact: round2(loanAmountImpact),
  });

  const newPaymentImpact = Math.min(
    18,
    Math.max(0, (features.estimated_new_loan_payment / Math.max(features.monthly_income, 1) - 0.15) * 55)
  );
  contributions.push({
    key: 'estimated_new_loan_payment',
    labelEn: 'Estimated new loan monthly payment',
    labelAr: 'القسط الشهري المقدر للقرض الجديد',
    displayValue: fmtMoney(features.estimated_new_loan_payment),
    impact: round2(newPaymentImpact),
  });

  const existingImpact = Math.min(
    12,
    Math.max(0, (features.existing_loan_monthly_payment / Math.max(features.monthly_income, 1)) * 45)
  );
  contributions.push({
    key: 'existing_loans',
    labelEn: 'Existing loan obligations',
    labelAr: 'القروض الحالية',
    displayValue: fmtMoney(features.existing_loans),
    impact: round2(existingImpact),
  });

  const expenseImpact = Math.min(
    10,
    Math.max(0, (features.monthly_expenses / Math.max(features.monthly_income, 1) - 0.35) * 22)
  );
  contributions.push({
    key: 'monthly_expenses',
    labelEn: 'Monthly expenses burden',
    labelAr: 'عبء المصاريف الشهرية',
    displayValue: fmtMoney(features.monthly_expenses),
    impact: round2(expenseImpact),
  });

  let disposableImpact = 0;
  if (features.disposable_income < 0) {
    disposableImpact = Math.min(20, 12 + Math.abs(features.disposable_income) / 100);
  } else if (features.monthly_income > 0) {
    const disposableRatio = features.disposable_income / features.monthly_income;
    disposableImpact = Math.min(12, Math.max(0, (0.12 - disposableRatio) * 40));
  }
  contributions.push({
    key: 'disposable_income',
    labelEn: 'Disposable income after all obligations',
    labelAr: 'الدخل المتاح بعد جميع الالتزامات',
    displayValue: fmtMoney(features.disposable_income),
    impact: round2(disposableImpact),
  });

  const incomeImpact =
    features.monthly_income < 2000
      ? Math.min(8, (2000 - features.monthly_income) / 250)
      : Math.max(-5, Math.min(0, (features.monthly_income - 6000) / -800));
  contributions.push({
    key: 'monthly_income',
    labelEn: 'Monthly salary / income level',
    labelAr: 'الراتب / مستوى الدخل الشهري',
    displayValue: fmtMoney(features.monthly_income),
    impact: round2(incomeImpact),
  });

  const employmentImpact = EMPLOYMENT_RISK[features.employment_type] ?? 5;
  contributions.push({
    key: 'employment_type',
    labelEn: 'Employment stability',
    labelAr: 'استقرار التوظيف',
    displayValue: features.employment_type,
    impact: employmentImpact,
  });

  contributions.sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact));

  const rawScore =
    8 +
    contributions.reduce((sum, c) => sum + c.impact, 0);

  const score = clampScore(rawScore);
  const category = categoryFromScore(score);

  const inferencePayload = {
    input: { ...input },
    derived: features,
    contributions,
    score,
    category,
  };

  console.info('[credit-scoring] inference payload:', inferencePayload);

  return {
    score,
    category,
    features,
    contributions,
    inferencePayload,
  };
}
