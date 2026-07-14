/**
 * Credit risk assessment — orchestration layer.
 *
 * This module is the stable, backward-compatible API the rest of the app
 * calls (`computeCreditScore`, `buildDerivedFeatures`, `serializeRiskExplanation`,
 * the `CreditScoreInput` / `DerivedFeatures` / `SavedRiskExplanation` shapes).
 * Internally it now delegates the actual banking math to dedicated modules:
 *
 *   - loanProducts.ts     product catalogue + rate resolution (fixed/index)
 *   - loanCalculator.ts   EMI/annuity monthly installment formula
 *   - loanEligibility.ts  debt-burden-ratio (50% cap) + age-at-maturity (70) rules
 *   - loanRiskScoring.ts  deterministic, weighted 0-100 risk score
 *   - loanExplanation.ts  deterministic bilingual fallback narrative
 *
 * This is the DETERMINISTIC engine and is always the source of truth for the
 * score/category/eligibility/installment numbers. AI (see aiCreditAssessment.ts)
 * only ever adds a narrative explanation on top — it never computes or
 * overrides any number here.
 *
 * Backward compatibility: every field on `CreditScoreInput` beyond the
 * original six (monthlyIncome, monthlyExpenses, existingLoans,
 * requestedLoanAmount, employmentType, loanPurpose) is OPTIONAL, with a
 * documented default applied in `resolveInput()`. Existing callers (and old
 * saved assessments re-run through modification re-analysis) keep working
 * unchanged; new callers can supply the full bank-calculator-style input for
 * an accurate result.
 */

// NOTE: relative (not "@/lib/...") imports are deliberate here — this file
// (and the loan* modules it composes) must resolve correctly under Node's
// plain `--test` runner (used by `npm test`), which has no bundler-style
// path-alias resolution, in addition to Vite.
import {
  resolveEffectiveAnnualRate,
  convertCurrency,
  type LoanCurrency,
  type LoanProductId,
} from './loanProducts.ts';
import { calculateLoanPayment } from './loanCalculator.ts';
import {
  DBR_CAP,
  AGE_AT_MATURITY_CAP,
  evaluateEligibility,
  type EligibilityStatus,
} from './loanEligibility.ts';
import {
  computeFormulaRiskScore,
  applyEligibilityOverride,
  type FeatureContribution,
  type RiskCategory,
} from './loanRiskScoring.ts';
import { buildDeterministicExplanation } from './loanExplanation.ts';

export type { LoanProductId, LoanCurrency } from './loanProducts.ts';
export type { EligibilityStatus } from './loanEligibility.ts';
export type { FeatureContribution } from './loanRiskScoring.ts';
export { LOAN_PRODUCTS, resolveEffectiveAnnualRate } from './loanProducts.ts';
export { DBR_CAP, AGE_AT_MATURITY_CAP } from './loanEligibility.ts';

export interface CreditScoreInput {
  monthlyIncome: number;
  monthlyExpenses: number;
  existingLoans: number;
  /** Employee-entered requested amount at submission time. */
  requestedLoanAmount: number;
  employmentType: string;
  loanPurpose?: string;

  // --- Bank-calculator-style fields (optional; defaulted in resolveInput()) ---
  /** Loan product family — drives which rate model applies. Default: 'personal'. */
  loanType?: LoanProductId;
  /** Currency the loan is disbursed in. Default: 'ILS'. */
  loanCurrency?: LoanCurrency;
  /** Currency the client's salary is paid in. Default: 'ILS'. */
  salaryCurrency?: LoanCurrency;
  /** Existing monthly loan/credit obligations (for DBR). Default: existingLoans / 12. */
  monthlyObligations?: number;
  /** Client age. Default: null (age-at-maturity rule is then skipped, not assumed to pass). */
  clientAge?: number | null;
  /** Loan term in years. Default: 5 (keeps the legacy 60-month assumption). */
  loanTermYears?: number;
}

export interface DerivedFeatures {
  // --- legacy fields, kept for backward compatibility with old saved assessments ---
  monthly_income: number;
  monthly_expenses: number;
  existing_loans: number;
  requested_loan_amount: number;
  existing_loan_monthly_payment: number;
  /** Same value as monthly_installment — kept under the old name for old readers. */
  estimated_new_loan_payment: number;
  total_monthly_debt_service: number;
  /** Same value as debt_burden_ratio — kept under the old name for old readers. */
  debt_service_ratio: number;
  loan_to_annual_income_ratio: number;
  loan_to_monthly_income_ratio: number;
  disposable_income: number;
  employment_type: string;
  loan_purpose: string;

  // --- bank-calculator-style fields ---
  loan_type: LoanProductId;
  loan_currency: LoanCurrency;
  salary_currency: LoanCurrency;
  monthly_obligations: number;
  client_age: number | null;
  loan_term_years: number;
  annual_interest_rate_used: number;
  rate_label: string;
  rate_details: string;
  monthly_installment: number;
  total_interest: number;
  total_repaid: number;
  debt_burden_ratio: number;
  age_at_maturity: number | null;
  eligibility_status: EligibilityStatus;
  eligibility_reasons: string[];
}

/** Qualitative factor shape returned by the AI explanation service. */
export interface AiTopFactor {
  label: string;
  /** Qualitative magnitude: "high" | "medium" | "low". */
  impact: string;
  /** "increases risk" | "decreases risk". */
  direction: string;
  /** Short human-readable value, e.g. "64%". */
  value: string;
}

/** A saved top factor may originate from the AI narrative layer or the formula engine. */
export type SavedTopFactor = AiTopFactor | FeatureContribution;

export type RecommendedAction = 'approve' | 'manual_review' | 'reject';
/**
 * 'ai' | 'algorithm' are the legacy values (from before this refactor, when
 * the AI edge function computed the whole result, or the old math fallback
 * ran alone). New assessments use 'formula' (deterministic engine only, no
 * AI narrative) or 'hybrid' (deterministic engine + AI narrative on top).
 */
export type ResultSource = 'ai' | 'algorithm' | 'formula' | 'hybrid';

export interface CreditScoreResult {
  score: number;
  category: RiskCategory;
  features: DerivedFeatures;
  contributions: FeatureContribution[];
  /** Full payload logged at inference time. */
  inferencePayload: {
    input: CreditScoreInput;
    derived: DerivedFeatures;
    contributions: FeatureContribution[];
    score: number;
    category: RiskCategory;
  };
}

/** Snapshot persisted on approval_requests and shown in the view modal. */
export interface SavedRiskExplanation {
  risk_score: number;
  risk_category: RiskCategory;
  risk_confidence?: number | null;
  risk_explanation_summary: string;
  risk_top_factors: SavedTopFactor[];
  risk_derived_features: DerivedFeatures;
  recommended_action?: RecommendedAction | null;
  result_source?: ResultSource | null;
  assessed_at: string;

  // --- bank-calculator-style fields (optional: absent on assessments saved before this refactor) ---
  loan_type?: LoanProductId | null;
  loan_currency?: LoanCurrency | null;
  salary_currency?: LoanCurrency | null;
  monthly_obligations?: number | null;
  client_age?: number | null;
  loan_term_years?: number | null;
  annual_interest_rate_used?: number | null;
  monthly_installment?: number | null;
  total_interest?: number | null;
  total_repaid?: number | null;
  debt_burden_ratio?: number | null;
  age_at_maturity?: number | null;
  eligibility_status?: EligibilityStatus | null;
  /** Raw AI narrative text, if AI succeeded. Null whenever result_source is 'formula'. */
  ai_explanation?: string | null;
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

const DEFAULT_LOAN_TERM_YEARS = 5; // keeps the legacy hardcoded 60-month assumption
const DEFAULT_CURRENCY: LoanCurrency = 'ILS';
const DEFAULT_LOAN_TYPE: LoanProductId = 'personal';

// Kept for estimateMonthlyLoanPayment()'s backward-compatible defaults.
const LOAN_TERM_MONTHS = 60;
const ANNUAL_INTEREST_RATE = 0.09;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

interface ResolvedCreditScoreInput {
  monthlyIncome: number;
  monthlyExpenses: number;
  existingLoans: number;
  requestedLoanAmount: number;
  employmentType: string;
  loanPurpose: string;
  loanType: LoanProductId;
  loanCurrency: LoanCurrency;
  salaryCurrency: LoanCurrency;
  monthlyObligations: number;
  clientAge: number | null;
  loanTermYears: number;
}

function resolveInput(input: CreditScoreInput): ResolvedCreditScoreInput {
  const existingLoans = Math.max(0, input.existingLoans);
  return {
    monthlyIncome: Math.max(0, input.monthlyIncome),
    monthlyExpenses: Math.max(0, input.monthlyExpenses),
    existingLoans,
    requestedLoanAmount: Math.max(0, input.requestedLoanAmount),
    employmentType: input.employmentType || 'unknown',
    loanPurpose: input.loanPurpose || 'unknown',
    loanType: input.loanType ?? DEFAULT_LOAN_TYPE,
    loanCurrency: input.loanCurrency ?? DEFAULT_CURRENCY,
    salaryCurrency: input.salaryCurrency ?? DEFAULT_CURRENCY,
    // Legacy callers only ever supplied a lump existingLoans balance, never a
    // monthly obligation figure — approximate it the same way the old
    // "existing_loan_monthly_payment" derivation did (balance / 12), so
    // pre-refactor callers keep producing a sane DBR instead of one that
    // silently ignores existing debt.
    monthlyObligations: input.monthlyObligations ?? existingLoans / 12,
    clientAge: input.clientAge ?? null,
    loanTermYears: input.loanTermYears ?? DEFAULT_LOAN_TERM_YEARS,
  };
}

/**
 * Standard amortizing monthly payment estimate. Kept for backward
 * compatibility (existing callers/tests use months + a flat annual rate);
 * internally now a thin wrapper over calculateLoanPayment().
 */
export function estimateMonthlyLoanPayment(
  principal: number,
  months = LOAN_TERM_MONTHS,
  annualRate = ANNUAL_INTEREST_RATE
): number {
  return calculateLoanPayment({ principal, annualRate, termYears: months / 12 }).monthlyInstallment;
}

export function buildDerivedFeatures(input: CreditScoreInput): DerivedFeatures {
  const resolved = resolveInput(input);

  const rate = resolveEffectiveAnnualRate(resolved.loanType, resolved.loanCurrency);
  const payment = calculateLoanPayment({
    principal: resolved.requestedLoanAmount,
    annualRate: rate.annualRate,
    termYears: resolved.loanTermYears,
  });

  const installmentInSalaryCurrency = convertCurrency(
    payment.monthlyInstallment,
    resolved.loanCurrency,
    resolved.salaryCurrency
  );
  const requestedLoanAmountInSalaryCurrency = convertCurrency(
    resolved.requestedLoanAmount,
    resolved.loanCurrency,
    resolved.salaryCurrency
  );

  const eligibility = evaluateEligibility({
    monthlyObligations: resolved.monthlyObligations,
    monthlyInstallment: installmentInSalaryCurrency,
    monthlySalary: resolved.monthlyIncome,
    clientAge: resolved.clientAge,
    loanTermYears: resolved.loanTermYears,
  });

  // Legacy-named fields — kept for old readers, always consistent with
  // (derived from) the new bank-calculator-style fields below.
  const existingMonthlyPayment = round2(resolved.existingLoans / 12);
  const totalMonthlyDebtService = round2(
    resolved.monthlyExpenses + resolved.monthlyObligations + payment.monthlyInstallment
  );
  const disposableIncome = round2(resolved.monthlyIncome - totalMonthlyDebtService);
  const annualSalary = Math.max(1, resolved.monthlyIncome * 12);

  return {
    monthly_income: resolved.monthlyIncome,
    monthly_expenses: resolved.monthlyExpenses,
    existing_loans: resolved.existingLoans,
    requested_loan_amount: resolved.requestedLoanAmount,
    existing_loan_monthly_payment: existingMonthlyPayment,
    estimated_new_loan_payment: payment.monthlyInstallment,
    total_monthly_debt_service: totalMonthlyDebtService,
    debt_service_ratio: round4(eligibility.debtBurdenRatio),
    loan_to_annual_income_ratio: round4(requestedLoanAmountInSalaryCurrency / annualSalary),
    loan_to_monthly_income_ratio: round4(
      requestedLoanAmountInSalaryCurrency / Math.max(1, resolved.monthlyIncome)
    ),
    disposable_income: disposableIncome,
    employment_type: resolved.employmentType,
    loan_purpose: resolved.loanPurpose,

    loan_type: resolved.loanType,
    loan_currency: resolved.loanCurrency,
    salary_currency: resolved.salaryCurrency,
    monthly_obligations: round2(resolved.monthlyObligations),
    client_age: resolved.clientAge,
    loan_term_years: resolved.loanTermYears,
    annual_interest_rate_used: rate.annualRate,
    rate_label: rate.label,
    rate_details: rate.details,
    monthly_installment: payment.monthlyInstallment,
    total_interest: payment.totalInterest,
    total_repaid: payment.totalRepaid,
    debt_burden_ratio: round4(eligibility.debtBurdenRatio),
    age_at_maturity: eligibility.ageAtMaturity,
    eligibility_status: eligibility.status,
    eligibility_reasons: eligibility.reasons,
  };
}

export function buildExplanationSummary(
  result: CreditScoreResult,
  language: 'en' | 'ar' = 'en'
): string {
  return buildDeterministicExplanation(
    {
      loanType: result.features.loan_type,
      loanCurrency: result.features.loan_currency,
      annualRate: result.features.annual_interest_rate_used,
      monthlyInstallment: result.features.monthly_installment,
      totalInterest: result.features.total_interest,
      totalRepaid: result.features.total_repaid,
      debtBurdenRatio: result.features.debt_burden_ratio,
      dbrCap: DBR_CAP,
      ageAtMaturity: result.features.age_at_maturity,
      ageAtMaturityCap: AGE_AT_MATURITY_CAP,
      eligible: result.features.eligibility_status === 'eligible',
      score: result.score,
      category: result.category,
    },
    language
  );
}

/**
 * Compute risk score and per-feature impacts (additive attribution), using
 * the bank-calculator-style deterministic engine. This is always the source
 * of truth — AI never computes or overrides these numbers.
 */
export function computeCreditScore(input: CreditScoreInput): CreditScoreResult {
  const features = buildDerivedFeatures(input);

  const requestedLoanAmountInSalaryCurrency = convertCurrency(
    features.requested_loan_amount,
    features.loan_currency,
    features.salary_currency
  );

  const scoring = computeFormulaRiskScore({
    debtBurdenRatio: features.debt_burden_ratio,
    dbrCap: DBR_CAP,
    ageAtMaturity: features.age_at_maturity,
    ageAtMaturityCap: AGE_AT_MATURITY_CAP,
    loanTermYears: features.loan_term_years,
    requestedLoanAmountInSalaryCurrency,
    monthlySalary: features.monthly_income,
    monthlyObligations: features.monthly_obligations,
    employmentType: features.employment_type,
  });

  const eligible = features.eligibility_status === 'eligible';
  const { score, category, contributions } = applyEligibilityOverride(scoring, eligible);

  const inferencePayload = {
    input: { ...input },
    derived: features,
    contributions,
    score,
    category,
  };

  console.info('[credit-scoring] inference payload:', inferencePayload);

  return { score, category, features, contributions, inferencePayload };
}

export function serializeRiskExplanation(result: CreditScoreResult): SavedRiskExplanation {
  const topFactors = result.contributions
    .filter((c) => Math.abs(c.impact) >= 0.5)
    .slice(0, 6);

  const eligible = result.features.eligibility_status === 'eligible';
  // Eligibility is a hard gate: an ineligible application is always
  // recommended for rejection, regardless of the soft category.
  const recommended_action: RecommendedAction = !eligible
    ? 'reject'
    : result.category === 'low'
      ? 'approve'
      : result.category === 'medium'
        ? 'manual_review'
        : 'reject';

  return {
    risk_score: result.score,
    risk_category: result.category,
    risk_confidence: null,
    risk_explanation_summary: buildExplanationSummary(result, 'en'),
    risk_top_factors: topFactors,
    risk_derived_features: result.features,
    recommended_action,
    result_source: 'formula',
    assessed_at: new Date().toISOString(),

    loan_type: result.features.loan_type,
    loan_currency: result.features.loan_currency,
    salary_currency: result.features.salary_currency,
    monthly_obligations: result.features.monthly_obligations,
    client_age: result.features.client_age,
    loan_term_years: result.features.loan_term_years,
    annual_interest_rate_used: result.features.annual_interest_rate_used,
    monthly_installment: result.features.monthly_installment,
    total_interest: result.features.total_interest,
    total_repaid: result.features.total_repaid,
    debt_burden_ratio: result.features.debt_burden_ratio,
    age_at_maturity: result.features.age_at_maturity,
    eligibility_status: result.features.eligibility_status,
    ai_explanation: null,
  };
}

/**
 * Layers an AI-authored narrative on top of an already-final formula
 * snapshot. This is the ONLY place an AI narrative is allowed to touch a
 * saved assessment, and it is deliberately narrow: it can only ever replace
 * `risk_explanation_summary`, set `ai_explanation`, and flip `result_source`
 * to 'hybrid'. Every other field — the score, category, eligibility, and
 * every monetary figure — is spread from `base` untouched, so this function
 * is structurally incapable of letting an AI response change a number,
 * no matter what that response contains. Kept here (not in
 * aiCreditAssessment.ts) so it's covered by the same plain Node test runner
 * as the rest of the deterministic engine.
 */
export function mergeAiNarrativeIntoSnapshot(
  base: SavedRiskExplanation,
  explanation: string
): SavedRiskExplanation {
  return {
    ...base,
    risk_explanation_summary: explanation,
    ai_explanation: explanation,
    result_source: 'hybrid',
  };
}
