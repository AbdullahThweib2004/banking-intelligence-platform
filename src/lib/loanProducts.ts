/**
 * Loan product catalogue + rate resolution — modeled on the Bank of
 * Palestine public loan-calculator structure (Personal / Personal Housing /
 * Mortgage Program), reconstructed from published rate-band descriptions
 * since the bank's actual calculator source is not available to this
 * project.
 *
 * IMPORTANT — what is real vs. simulated:
 *   - The PRODUCT STRUCTURE (fixed-rate Personal loans vs. index-based
 *     Personal Housing / Mortgage Program, with a floor/cap band) mirrors
 *     how the bank's calculator is publicly described to work.
 *   - The ACTUAL NUMBERS below (index rates, margins, floors, caps, fixed
 *     bands) are NOT a live feed of SOFR / JODIBOR / Prime. There is no live
 *     index integration anywhere in this project. Every number in
 *     `INDEX_RATE_CONFIG` and `FIXED_RATE_BANDS` is a configured, manually
 *     maintained placeholder — clearly namespaced as "(configured)" in the
 *     label shown to staff — until a real index/rate feed is wired in.
 *   - Swap these constants for a real feed (or an admin-editable settings
 *     table) without touching any other file; every caller goes through
 *     `resolveEffectiveAnnualRate()`.
 */

export type LoanProductId = 'personal' | 'personal_housing' | 'mortgage_program';
export type LoanCurrency = 'ILS' | 'USD' | 'JOD';

export interface LoanProductDefinition {
  id: LoanProductId;
  labelEn: string;
  labelAr: string;
  rateModel: 'fixed' | 'index';
  descriptionEn: string;
  descriptionAr: string;
}

export const LOAN_PRODUCTS: Record<LoanProductId, LoanProductDefinition> = {
  personal: {
    id: 'personal',
    labelEn: 'Personal Loan',
    labelAr: 'قرض شخصي',
    rateModel: 'fixed',
    descriptionEn: 'Fixed annual rate within a published band, by currency.',
    descriptionAr: 'معدل فائدة سنوي ثابت ضمن نطاق معلن، حسب العملة.',
  },
  personal_housing: {
    id: 'personal_housing',
    labelEn: 'Personal Housing Loan',
    labelAr: 'قرض إسكان شخصي',
    rateModel: 'index',
    descriptionEn: 'Index-based rate (index + margin), bounded by a floor/cap.',
    descriptionAr: 'معدل مرتبط بمؤشر (مؤشر + هامش)، محصور بحد أدنى وأقصى.',
  },
  mortgage_program: {
    id: 'mortgage_program',
    labelEn: 'Mortgage Program',
    labelAr: 'برنامج الرهن العقاري',
    rateModel: 'index',
    descriptionEn: 'Index-based rate (index + margin), bounded by a floor/cap.',
    descriptionAr: 'معدل مرتبط بمؤشر (مؤشر + هامش)، محصور بحد أدنى وأقصى.',
  },
};

export const LOAN_PRODUCT_IDS = Object.keys(LOAN_PRODUCTS) as LoanProductId[];
export const LOAN_CURRENCIES: LoanCurrency[] = ['ILS', 'USD', 'JOD'];

// ============================================================================
// CONFIGURED, NOT LIVE. See file-level comment above.
// ============================================================================

interface IndexRateConfig {
  /** Name of the reference index this currency's index-based products track. */
  indexName: string;
  /** Configured index level (decimal, e.g. 0.061 = 6.1%). NOT a live feed. */
  indexRate: number;
  /** Bank margin added on top of the index. */
  margin: number;
  /** Minimum effective annual rate regardless of index movement. */
  floor: number;
  /** Maximum effective annual rate regardless of index movement. */
  cap: number;
}

const INDEX_RATE_CONFIG: Record<LoanCurrency, IndexRateConfig> = {
  ILS: { indexName: 'Prime (configured)', indexRate: 0.061, margin: 0.02, floor: 0.05, cap: 0.12 },
  USD: { indexName: 'SOFR (configured)', indexRate: 0.045, margin: 0.025, floor: 0.05, cap: 0.11 },
  JOD: { indexName: 'JODIBOR (configured)', indexRate: 0.065, margin: 0.02, floor: 0.06, cap: 0.13 },
};

interface FixedRateBand {
  min: number;
  default: number;
  max: number;
}

const FIXED_RATE_BANDS: Record<LoanCurrency, FixedRateBand> = {
  ILS: { min: 0.07, default: 0.085, max: 0.11 },
  USD: { min: 0.06, default: 0.075, max: 0.1 },
  JOD: { min: 0.075, default: 0.09, max: 0.115 },
};

/**
 * Static FX table used ONLY to normalize a loan installment into the
 * customer's salary currency for the debt-burden-ratio calculation, when the
 * loan and salary currencies differ. CONFIGURED, NOT a live FX feed — update
 * these numbers manually, or replace with a real FX integration later.
 */
const FX_TO_ILS: Record<LoanCurrency, number> = {
  ILS: 1,
  USD: 3.6,
  JOD: 5.1,
};

export function convertCurrency(amount: number, from: LoanCurrency, to: LoanCurrency): number {
  if (from === to) return amount;
  const amountInIls = amount * FX_TO_ILS[from];
  return amountInIls / FX_TO_ILS[to];
}

export interface ResolvedRate {
  /** Effective annual rate as a decimal, e.g. 0.085 = 8.5%. */
  annualRate: number;
  source: 'fixed' | 'index';
  /** Human-readable label for what produced this rate (shown to staff). */
  label: string;
  /** One-line explanation of how the number was derived. */
  details: string;
}

/**
 * Resolves the effective annual interest rate for a product + currency.
 *
 * - Personal: the configured default within the published fixed band for
 *   that currency (an override could be added later for a promo rate, kept
 *   within [min, max]).
 * - Personal Housing / Mortgage Program: index + margin, clamped to
 *   [floor, cap].
 */
export function resolveEffectiveAnnualRate(
  productId: LoanProductId,
  currency: LoanCurrency,
  options?: { fixedRateOverride?: number }
): ResolvedRate {
  const product = LOAN_PRODUCTS[productId];

  if (product.rateModel === 'fixed') {
    const band = FIXED_RATE_BANDS[currency];
    const requested = options?.fixedRateOverride ?? band.default;
    const annualRate = Math.min(band.max, Math.max(band.min, requested));
    return {
      annualRate,
      source: 'fixed',
      label: `${product.labelEn} fixed rate (${currency}, configured)`,
      details: `Fixed annual rate ${(annualRate * 100).toFixed(2)}% within the configured ${currency} band [${(band.min * 100).toFixed(2)}%–${(band.max * 100).toFixed(2)}%].`,
    };
  }

  const idx = INDEX_RATE_CONFIG[currency];
  const raw = idx.indexRate + idx.margin;
  const annualRate = Math.min(idx.cap, Math.max(idx.floor, raw));
  return {
    annualRate,
    source: 'index',
    label: `${product.labelEn} — ${idx.indexName} + margin`,
    details: `${idx.indexName} ${(idx.indexRate * 100).toFixed(2)}% + margin ${(idx.margin * 100).toFixed(2)}% = ${(raw * 100).toFixed(2)}%, clamped to the configured [${(idx.floor * 100).toFixed(2)}%–${(idx.cap * 100).toFixed(2)}%] band → ${(annualRate * 100).toFixed(2)}%.`,
  };
}
