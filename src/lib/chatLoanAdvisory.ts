/**
 * Deterministic loan advisory logic for the hybrid bank chat assistant.
 *
 * Reuses the SAME deterministic engine as the Credit Risk assessment flow
 * (loanCalculator.ts / loanEligibility.ts / loanProducts.ts) — this module
 * adds no new business rules, it only searches across candidate installment
 * terms to answer "what term is best for this customer" style questions.
 * As with the rest of the loan engine, AI never computes these numbers; it
 * only explains a result that was already decided here.
 *
 * Relative imports use explicit `.ts` extensions so this module (and its
 * unit tests) resolve correctly under Node's plain `--test` runner, in
 * addition to Vite/tsc — same convention as loanEngine.test.ts.
 */
import { calculateLoanPayment } from './loanCalculator.ts';
import {
  resolveEffectiveAnnualRate,
  convertCurrency,
  type LoanProductId,
  type LoanCurrency,
} from './loanProducts.ts';
import {
  computeDebtBurdenRatio,
  computeAgeAtMaturity,
  DBR_CAP,
  AGE_AT_MATURITY_CAP,
} from './loanEligibility.ts';
import type { BankCustomerRecord } from './bankCustomers.ts';

const MIN_TERM_YEARS = 1;
const MAX_TERM_YEARS = 30;

export interface LoanAdvisoryTermOption {
  termYears: number;
  monthlyInstallment: number;
  totalInterest: number;
  totalRepaid: number;
  debtBurdenRatio: number;
  ageAtMaturity: number | null;
  eligible: boolean;
}

export type LoanAdvisoryResult =
  | {
      status: 'ok';
      recommendedTermYears: number;
      recommended: LoanAdvisoryTermOption;
      annualRate: number;
      rateLabel: string;
      loanAmount: number;
      loanCurrency: LoanCurrency;
      loanType: LoanProductId;
      monthlySalary: number;
      monthlyObligations: number;
      dbrCap: number;
      ageAtMaturityCap: number;
      allOptions: LoanAdvisoryTermOption[];
    }
  | {
      status: 'not_affordable';
      loanAmount: number;
      loanCurrency: LoanCurrency;
      loanType: LoanProductId;
      monthlySalary: number;
      monthlyObligations: number;
      dbrCap: number;
      /** The result at the longest allowed term — still not eligible. */
      bestAttempt: LoanAdvisoryTermOption;
    };

function evaluateTerm(params: {
  loanAmount: number;
  loanCurrency: LoanCurrency;
  loanType: LoanProductId;
  termYears: number;
  monthlySalary: number;
  monthlyObligations: number;
  salaryCurrency: LoanCurrency;
  clientAge: number | null;
}): LoanAdvisoryTermOption {
  const rate = resolveEffectiveAnnualRate(params.loanType, params.loanCurrency);
  const payment = calculateLoanPayment({
    principal: params.loanAmount,
    annualRate: rate.annualRate,
    termYears: params.termYears,
  });
  const installmentInSalaryCurrency = convertCurrency(
    payment.monthlyInstallment,
    params.loanCurrency,
    params.salaryCurrency
  );
  const debtBurdenRatio = computeDebtBurdenRatio({
    monthlyObligations: params.monthlyObligations,
    monthlyInstallment: installmentInSalaryCurrency,
    monthlySalary: params.monthlySalary,
  });
  const ageAtMaturity = computeAgeAtMaturity({
    clientAge: params.clientAge,
    loanTermYears: params.termYears,
  });
  const ageOk = ageAtMaturity == null || ageAtMaturity <= AGE_AT_MATURITY_CAP;
  const dbrOk = debtBurdenRatio <= DBR_CAP;

  return {
    termYears: params.termYears,
    monthlyInstallment: payment.monthlyInstallment,
    totalInterest: payment.totalInterest,
    totalRepaid: payment.totalRepaid,
    debtBurdenRatio,
    ageAtMaturity,
    eligible: dbrOk && ageOk,
  };
}

/**
 * Finds the shortest (lowest-total-interest) installment term that keeps the
 * debt burden ratio (and age-at-maturity, if a client age is known) within
 * the bank's caps. Returns `not_affordable` when no term in range works.
 */
export function recommendInstallmentTerm(input: {
  loanAmount: number;
  loanCurrency: LoanCurrency;
  loanType: LoanProductId;
  monthlySalary: number;
  monthlyObligations: number;
  salaryCurrency?: LoanCurrency;
  clientAge?: number | null;
  minTermYears?: number;
  maxTermYears?: number;
}): LoanAdvisoryResult {
  const salaryCurrency = input.salaryCurrency ?? 'ILS';
  const clientAge = input.clientAge ?? null;
  const minTerm = input.minTermYears ?? MIN_TERM_YEARS;
  const maxTerm = input.maxTermYears ?? MAX_TERM_YEARS;
  const rate = resolveEffectiveAnnualRate(input.loanType, input.loanCurrency);

  const options: LoanAdvisoryTermOption[] = [];
  for (let term = minTerm; term <= maxTerm; term++) {
    options.push(
      evaluateTerm({
        loanAmount: input.loanAmount,
        loanCurrency: input.loanCurrency,
        loanType: input.loanType,
        termYears: term,
        monthlySalary: input.monthlySalary,
        monthlyObligations: input.monthlyObligations,
        salaryCurrency,
        clientAge,
      })
    );
  }

  const firstEligible = options.find((o) => o.eligible);

  if (firstEligible) {
    return {
      status: 'ok',
      recommendedTermYears: firstEligible.termYears,
      recommended: firstEligible,
      annualRate: rate.annualRate,
      rateLabel: rate.label,
      loanAmount: input.loanAmount,
      loanCurrency: input.loanCurrency,
      loanType: input.loanType,
      monthlySalary: input.monthlySalary,
      monthlyObligations: input.monthlyObligations,
      dbrCap: DBR_CAP,
      ageAtMaturityCap: AGE_AT_MATURITY_CAP,
      allOptions: options,
    };
  }

  return {
    status: 'not_affordable',
    loanAmount: input.loanAmount,
    loanCurrency: input.loanCurrency,
    loanType: input.loanType,
    monthlySalary: input.monthlySalary,
    monthlyObligations: input.monthlyObligations,
    dbrCap: DBR_CAP,
    bestAttempt: options[options.length - 1],
  };
}

export interface AffordabilityHeadroom {
  monthlySalary: number;
  monthlyObligations: number;
  currentDebtBurdenRatio: number;
  dbrCap: number;
  /** How much additional monthly installment (in salary currency) the customer could take before hitting the DBR cap, from existing obligations alone. */
  maxAdditionalMonthlyInstallment: number;
  currentlyOverCap: boolean;
}

/**
 * Qualitative affordability snapshot from existing obligations alone — used
 * when the question doesn't name a specific new loan amount (e.g. "does this
 * customer likely qualify for a personal loan?").
 */
export function computeAffordabilityHeadroom(params: {
  monthlySalary: number;
  monthlyObligations: number;
}): AffordabilityHeadroom {
  const currentDebtBurdenRatio =
    params.monthlySalary > 0
      ? params.monthlyObligations / params.monthlySalary
      : params.monthlyObligations > 0
        ? 1
        : 0;
  const maxTotalDebt = params.monthlySalary * DBR_CAP;
  const maxAdditionalMonthlyInstallment = Math.max(0, maxTotalDebt - params.monthlyObligations);

  return {
    monthlySalary: params.monthlySalary,
    monthlyObligations: params.monthlyObligations,
    currentDebtBurdenRatio,
    dbrCap: DBR_CAP,
    maxAdditionalMonthlyInstallment,
    currentlyOverCap: currentDebtBurdenRatio > DBR_CAP,
  };
}

/** Matches the rest of the app's established convention (creditScoring.ts resolveInput): a lump existing-loans balance approximates to a monthly obligation as balance / 12. */
export function monthlyObligationsFromExistingLoans(existingLoans: number): number {
  return Math.max(0, existingLoans) / 12;
}

const LOAN_TYPE_KEYWORDS: Record<LoanProductId, string[]> = {
  personal: ['personal loan', 'قرض شخصي', 'personal'],
  personal_housing: ['housing loan', 'home loan', 'قرض إسكان', 'قرض سكني', 'housing', 'إسكان'],
  mortgage_program: ['mortgage', 'رهن عقاري', 'رهن'],
};

/** Best-effort loan-product keyword match from free text. Returns null when nothing matches. */
export function parseLoanTypeFromText(query: string): LoanProductId | null {
  const n = query.toLowerCase();
  for (const [id, keywords] of Object.entries(LOAN_TYPE_KEYWORDS) as [LoanProductId, string[]][]) {
    if (keywords.some((k) => n.includes(k))) return id;
  }
  return null;
}

const CURRENCY_KEYWORDS: Record<LoanCurrency, string[]> = {
  ILS: ['ils', 'shekel', 'شيكل', '₪'],
  USD: ['usd', 'dollar', 'دولار', '$'],
  JOD: ['jod', 'dinar', 'دينار'],
};

/** Best-effort currency keyword match from free text. Returns null when nothing matches. */
export function parseLoanCurrencyFromText(query: string): LoanCurrency | null {
  const n = query.toLowerCase();
  for (const [currency, keywords] of Object.entries(CURRENCY_KEYWORDS) as [LoanCurrency, string[]][]) {
    if (keywords.some((k) => n.includes(k))) return currency;
  }
  return null;
}

// Matches either comma-grouped amounts ("30,000", "30,000.50") or plain runs
// of 4+ digits ("30000") — loan amounts are typed both ways in practice.
const AMOUNT_RE = /\b\d{1,3}(?:,\d{3})+(?:\.\d+)?\b|\b\d{4,}(?:\.\d+)?\b/g;

/**
 * Best-effort loan-amount extraction from free text. Account numbers
 * (`BOP-100011`) are stripped first so their digits are never mistaken for a
 * requested amount. Amounts under 1000 are ignored as too small to be a
 * realistic loan principal (more likely a stray year/count).
 */
export function parseLoanAmountFromText(query: string): number | null {
  const withoutAccountNumbers = query.replace(/\bBOP-\d+\b/gi, ' ');
  const matches = withoutAccountNumbers.match(AMOUNT_RE);
  if (!matches) return null;
  const numbers = matches
    .map((m) => Number(m.replace(/,/g, '')))
    .filter((n) => Number.isFinite(n) && n >= 1000);
  return numbers.length > 0 ? numbers[0] : null;
}

export interface ResolvedAdvisoryInputs {
  loanAmount: number;
  loanAmountSource: 'query' | 'on_file' | 'missing';
  loanType: LoanProductId;
  loanTypeSource: 'query' | 'default';
  loanCurrency: LoanCurrency;
  loanCurrencySource: 'query' | 'default';
  missingRequired: Array<'loanAmount'>;
}

/**
 * Resolves the inputs an advisory calculation needs from whatever the query
 * states explicitly, falling back to the customer's on-file loan_amount, and
 * finally to the same defaults creditScoring.ts uses elsewhere in the app
 * (personal / ILS). Only reports `missingRequired` when there's truly no
 * usable loan amount anywhere — that's the one case that must ask the user,
 * rather than silently assuming a number.
 */
export function resolveAdvisoryInputs(
  query: string,
  customer: Pick<BankCustomerRecord, 'loan_amount'>
): ResolvedAdvisoryInputs {
  const parsedAmount = parseLoanAmountFromText(query);
  const parsedType = parseLoanTypeFromText(query);
  const parsedCurrency = parseLoanCurrencyFromText(query);

  let loanAmount: number;
  let loanAmountSource: ResolvedAdvisoryInputs['loanAmountSource'];
  if (parsedAmount != null) {
    loanAmount = parsedAmount;
    loanAmountSource = 'query';
  } else if (customer.loan_amount > 0) {
    loanAmount = customer.loan_amount;
    loanAmountSource = 'on_file';
  } else {
    loanAmount = 0;
    loanAmountSource = 'missing';
  }

  return {
    loanAmount,
    loanAmountSource,
    loanType: parsedType ?? 'personal',
    loanTypeSource: parsedType ? 'query' : 'default',
    loanCurrency: parsedCurrency ?? 'ILS',
    loanCurrencySource: parsedCurrency ? 'query' : 'default',
    missingRequired: loanAmountSource === 'missing' ? ['loanAmount'] : [],
  };
}
