/**
 * Deterministic, bilingual fallback explanation — used whenever the AI
 * narrative layer is unavailable, fails, or times out. Built ONLY from
 * already-computed fields (never invents a number), so the employee always
 * gets a complete, readable result even with AI fully disabled.
 */
import type { RiskCategory } from './loanRiskScoring.ts';
import type { LoanCurrency, LoanProductId } from './loanProducts.ts';
import { LOAN_PRODUCTS } from './loanProducts.ts';

export interface DeterministicExplanationInput {
  loanType: LoanProductId;
  loanCurrency: LoanCurrency;
  annualRate: number;
  monthlyInstallment: number;
  totalInterest: number;
  totalRepaid: number;
  debtBurdenRatio: number;
  dbrCap: number;
  ageAtMaturity: number | null;
  ageAtMaturityCap: number;
  eligible: boolean;
  score: number;
  category: RiskCategory;
}

function fmtMoney(n: number, currency: LoanCurrency): string {
  return `${currency} ${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function fmtPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

const CATEGORY_LABEL: Record<RiskCategory, { en: string; ar: string }> = {
  low: { en: 'low', ar: 'منخفضة' },
  medium: { en: 'medium', ar: 'متوسطة' },
  high: { en: 'high', ar: 'مرتفعة' },
};

/** Builds a complete, self-contained explanation from the deterministic result — no AI involved. */
export function buildDeterministicExplanation(
  input: DeterministicExplanationInput,
  language: 'en' | 'ar' = 'en'
): string {
  const product = LOAN_PRODUCTS[input.loanType];
  const productLabel = language === 'ar' ? product.labelAr : product.labelEn;

  if (language === 'ar') {
    const dbrLine = `نسبة عبء الدين ${fmtPct(input.debtBurdenRatio)} من حد ${fmtPct(input.dbrCap)}${input.debtBurdenRatio > input.dbrCap ? ' (تتجاوز الحد المسموح)' : ''}.`;
    const ageLine =
      input.ageAtMaturity == null
        ? 'لم يُحدَّد عمر العميل، لذا لم يُطبَّق شرط العمر عند الاستحقاق.'
        : `عمر العميل عند استحقاق القرض ${input.ageAtMaturity} سنة من حد ${input.ageAtMaturityCap} سنة${input.ageAtMaturity > input.ageAtMaturityCap ? ' (يتجاوز الحد المسموح)' : ''}.`;
    const eligibilityLine = input.eligible
      ? 'الطلب مؤهل بناءً على قواعد النسبة والعمر.'
      : 'الطلب غير مؤهل: تم تجاوز أحد الحدين (نسبة عبء الدين أو العمر عند الاستحقاق)، لذا يُنصح بالرفض بغض النظر عن الدرجة المحسوبة.';

    return [
      `${productLabel}: القسط الشهري ${fmtMoney(input.monthlyInstallment, input.loanCurrency)} بمعدل فائدة سنوي ${fmtPct(input.annualRate)}.`,
      `إجمالي المبلغ المسدد ${fmtMoney(input.totalRepaid, input.loanCurrency)}، منه فوائد ${fmtMoney(input.totalInterest, input.loanCurrency)}.`,
      dbrLine,
      ageLine,
      eligibilityLine,
      `درجة المخاطر المحسوبة ${input.score} (مخاطر ${CATEGORY_LABEL[input.category].ar}).`,
    ].join(' ');
  }

  const dbrLine = `Debt burden ratio is ${fmtPct(input.debtBurdenRatio)} of the ${fmtPct(input.dbrCap)} cap${input.debtBurdenRatio > input.dbrCap ? ' (exceeds the allowed limit)' : ''}.`;
  const ageLine =
    input.ageAtMaturity == null
      ? "Client age was not provided, so the age-at-maturity rule was not applied."
      : `Client age at loan maturity is ${input.ageAtMaturity} against a cap of ${input.ageAtMaturityCap}${input.ageAtMaturity > input.ageAtMaturityCap ? ' (exceeds the allowed limit)' : ''}.`;
  const eligibilityLine = input.eligible
    ? 'The application is eligible under the debt-burden and age-at-maturity rules.'
    : 'The application is NOT eligible: at least one hard rule (debt burden ratio or age-at-maturity) was breached, so rejection is recommended regardless of the computed score.';

  return [
    `${productLabel}: monthly installment ${fmtMoney(input.monthlyInstallment, input.loanCurrency)} at an annual rate of ${fmtPct(input.annualRate)}.`,
    `Total repaid over the term is ${fmtMoney(input.totalRepaid, input.loanCurrency)}, including ${fmtMoney(input.totalInterest, input.loanCurrency)} in interest.`,
    dbrLine,
    ageLine,
    eligibilityLine,
    `Computed risk score: ${input.score} (${CATEGORY_LABEL[input.category].en} risk).`,
  ].join(' ');
}
