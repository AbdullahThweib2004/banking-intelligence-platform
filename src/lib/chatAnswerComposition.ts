/**
 * Pure answer-composition logic for the hybrid bank chat assistant — split
 * out from chatHybridAnswer.ts so it can be unit-tested under Node's plain
 * `--test` runner without pulling in the Supabase client. assistantChat.ts
 * and rag.ts need Supabase for real I/O, but that client reads
 * `import.meta.env` (a Vite-only global) and crashes immediately if loaded
 * outside Vite/the browser — same reasoning as schemaVerification.ts's split.
 *
 * Everything here operates only on data already handed to it: no network
 * calls, no Supabase, no side effects. That's what makes it possible to test
 * routing/composition decisions (clarification-needed, not-found, hybrid
 * source combination, greeting/capability fallbacks) directly and fast.
 *
 * Relative imports use explicit `.ts` extensions, and all cross-module type
 * imports use the plain `import type { ... }` form specifically so Node's
 * `--experimental-strip-types` elides them entirely at parse time — the
 * modules they come from are never actually loaded at runtime by this file
 * or by anything that only needs its types.
 */
import type { Lang, PolicyChunk, Citation } from './rag.ts';
import type { AssistantCustomerContext, AssistantAdvisoryResult } from './assistantChat.ts';
import type { ChatIntent } from './chatIntent.ts';
import type { BankCustomerRecord } from './bankCustomers.ts';
import type { CustomerLookupOutcome, AssessmentHistoryRow } from './chatCustomerLookup.ts';
import {
  recommendInstallmentTerm,
  computeAffordabilityHeadroom,
  monthlyObligationsFromExistingLoans,
  resolveAdvisoryInputs,
  parseLoanAmountFromText,
} from './chatLoanAdvisory.ts';
import { extractAccountNumbers } from './chatIntent.ts';
import { getMinimumLoanAmount } from './loanProducts.ts';

/** Minimal shape needed from a history turn — avoids importing rag.ts's ChatTurn just for this. */
export interface ChatTurnLike {
  role: 'user' | 'assistant';
  content: string;
}

export type AnswerSource =
  | 'file'
  | 'database'
  | 'both'
  | 'general'
  | 'unavailable'
  | 'clarification'
  | 'not_found';

export interface ChatAnswerResult {
  answer: string;
  language: Lang;
  source: AnswerSource;
  intent: ChatIntent;
  citations: Citation[];
  /** True when a database record was actually found and used. */
  foundCustomer: boolean;
  /** True when the question needed a customer lookup that came up empty/ambiguous/unidentified. */
  customerNotFound: boolean;
}

const SOURCE_LABEL: Record<AnswerSource, Record<Lang, string>> = {
  file: { en: 'Policy files', ar: 'ملفات السياسة' },
  database: { en: 'Customer database', ar: 'قاعدة بيانات العملاء' },
  both: { en: 'Policy files + customer database', ar: 'ملفات السياسة + قاعدة بيانات العملاء' },
  general: { en: 'General answer', ar: 'إجابة عامة' },
  clarification: { en: 'Clarification needed', ar: 'مطلوب توضيح' },
  not_found: { en: 'Customer not found', ar: 'العميل غير موجود' },
  unavailable: { en: 'No source available', ar: 'لا يوجد مصدر متاح' },
};

/** Short, localized badge text describing where an answer's content came from. */
export function formatSourceLabel(source: AnswerSource, language: Lang): string {
  return SOURCE_LABEL[source][language];
}

export const NOT_FOUND_TEXT: Record<Lang, (accountNumber: string) => string> = {
  en: (a) => `I couldn't find any customer/account matching ${a}. Please double-check the account number.`,
  ar: (a) => `لم أتمكن من العثور على أي عميل/حساب مطابق لـ ${a}. يرجى التحقق من رقم الحساب.`,
};

export const AMBIGUOUS_TEXT: Record<Lang, (accounts: string[]) => string> = {
  en: (accts) => `You mentioned more than one account number (${accts.join(', ')}). Which one should I look up?`,
  ar: (accts) => `لقد ذكرت أكثر من رقم حساب (${accts.join(', ')}). أي رقم تريد أن أبحث عنه؟`,
};

export const MISSING_IDENTIFIER_TEXT: Record<Lang, string> = {
  en: 'Which account number should I look this up for?',
  ar: 'ما هو رقم الحساب الذي تريد أن أبحث عنه؟',
};

export const AI_UNAVAILABLE_TEXT: Record<Lang, string> = {
  en: "I couldn't reach the assistant service right now, and there's nothing else I can use to answer that. Please try again in a moment.",
  ar: 'تعذّر الوصول إلى خدمة المساعد الآن، ولا تتوفر لدي وسيلة أخرى للإجابة على ذلك. يرجى المحاولة مرة أخرى بعد قليل.',
};

// Greetings and "what can you do" are fully scriptable (unlike open-ended
// general knowledge), so they get a real deterministic answer even when the
// AI layer is disabled/unreachable — the assistant should never feel broken
// on the most basic conversational turns.
export const GREETING_FALLBACK: Record<Lang, string> = {
  en: "Hello! I'm the Bank of Palestine assistant. I can help with bank policy questions, look up a specific customer/account, work out loan eligibility and installment terms, or just chat. What would you like to do?",
  ar: 'مرحباً! أنا مساعد بنك فلسطين. يمكنني مساعدتك في أسئلة السياسات المصرفية، البحث عن بيانات عميل أو حساب محدد، حساب أهلية القرض ومدة الأقساط، أو مجرد الدردشة. كيف يمكنني مساعدتك؟',
};

export const CAPABILITY_FALLBACK: Record<Lang, string> = {
  en: 'I can help with: (1) bank policy, procedures, and product questions — answered from the bank\'s policy documents; (2) specific customer/account questions, like salary, obligations, or loan status — looked up from the live customer database by exact account number; (3) loan eligibility and installment-term recommendations, calculated with the bank\'s deterministic affordability rules; and (4) general conversation. Just ask.',
  ar: 'يمكنني مساعدتك في: (1) أسئلة السياسات والإجراءات والمنتجات المصرفية — من مستندات سياسة البنك؛ (2) أسئلة خاصة بعميل أو حساب محدد، مثل الراتب أو الالتزامات أو حالة القرض — من قاعدة بيانات العملاء الحية باستخدام رقم الحساب الدقيق؛ (3) أهلية القرض والمدة المناسبة للأقساط، بحساب قواعد القدرة على السداد الخاصة بالبنك؛ (4) الدردشة العامة. فقط اسأل.',
};

/**
 * Some facts are known to the orchestrator itself (not the AI/LLM) and must
 * always win regardless of what the AI layer reports or the deterministic
 * fallback assembled: a customer lookup that came up empty is always
 * "not_found", and an advisory calculation blocked on missing inputs is
 * always "clarification" — these are never left for the model to guess.
 */
export function resolveFinalSource(
  rawSource: AnswerSource,
  customerContext: AssistantCustomerContext | null,
  advisory: AssistantAdvisoryResult | null
): AnswerSource {
  if (customerContext && customerContext.found === false) return 'not_found';
  if (advisory && (advisory.kind === 'missing_inputs' || advisory.kind === 'below_minimum')) return 'clarification';
  return rawSource;
}

/** Reuses the account number from the most recent user turn that mentioned exactly one, for account-less follow-up questions. */
export function inheritAccountNumberFromHistory(history: ChatTurnLike[] | undefined): string[] {
  if (!history?.length) return [];
  for (let i = history.length - 1; i >= 0; i--) {
    const turn = history[i];
    if (turn.role !== 'user') continue;
    const found = extractAccountNumbers(turn.content);
    if (found.length === 1) return found;
  }
  return [];
}

export function toFoundCustomerContext(
  customer: BankCustomerRecord,
  assessments: AssessmentHistoryRow[]
): AssistantCustomerContext {
  return {
    found: true,
    accountNumber: customer.account_number,
    customerName: customer.customer_name,
    monthlyIncome: customer.monthly_income,
    monthlyExpenses: customer.monthly_expenses,
    existingLoans: customer.existing_loans,
    employmentType: customer.employment_type,
    loanAmount: customer.loan_amount,
    loanPurpose: customer.loan_purpose,
    loanRestricted: customer.loan_restricted,
    restrictionReason: customer.restriction_reason,
    recentAssessments: assessments.map((a) => ({
      assessedAt: a.assessed_at,
      riskScore: a.risk_score,
      riskCategory: a.risk_category,
      loanType: a.loan_type,
      monthlyInstallment: a.monthly_installment,
      eligibilityStatus: a.eligibility_status,
      status: a.status,
    })),
  };
}

export function toNotFoundCustomerContext(
  outcome: Extract<CustomerLookupOutcome, { status: 'not_found' | 'ambiguous' | 'missing_identifier' }>
): AssistantCustomerContext {
  if (outcome.status === 'not_found') {
    return { found: false, reason: 'not_found', accountNumber: outcome.accountNumber };
  }
  if (outcome.status === 'ambiguous') {
    return { found: false, reason: 'ambiguous', accountNumbers: outcome.accountNumbers };
  }
  return { found: false, reason: 'missing_identifier' };
}

/**
 * Builds the deterministic loan-term-recommendation, affordability-headroom,
 * or missing-inputs advisory result for a FOUND customer only.
 *
 * `seeksSpecificTerm` (from the intent classifier) decides what happens when
 * no loan amount is available anywhere: a question that explicitly wants a
 * concrete term ("best term", "how many years") gets a clarifying question
 * instead, since a term genuinely cannot be computed without an amount — it
 * must never silently fall back to a different, less specific answer. A
 * general qualification question ("does he qualify?") still gets the
 * qualitative affordability-headroom summary, which doesn't need one.
 */
export function buildAdvisoryResult(
  customer: BankCustomerRecord,
  query: string,
  seeksSpecificTerm: boolean
): AssistantAdvisoryResult {
  const monthlyObligations = monthlyObligationsFromExistingLoans(customer.existing_loans);
  const hasAnyAmountSignal = parseLoanAmountFromText(query) != null || customer.loan_amount > 0;

  if (!hasAnyAmountSignal) {
    if (seeksSpecificTerm) {
      return { kind: 'missing_inputs', missing: ['loanAmount'] };
    }
    const headroom = computeAffordabilityHeadroom({
      monthlySalary: customer.monthly_income,
      monthlyObligations,
    });
    return {
      kind: 'affordability_headroom',
      monthlySalary: headroom.monthlySalary,
      monthlyObligations: headroom.monthlyObligations,
      currentDebtBurdenRatio: headroom.currentDebtBurdenRatio,
      dbrCap: headroom.dbrCap,
      maxAdditionalMonthlyInstallment: headroom.maxAdditionalMonthlyInstallment,
      currentlyOverCap: headroom.currentlyOverCap,
    };
  }

  const inputs = resolveAdvisoryInputs(query, customer);
  if (inputs.missingRequired.length > 0) {
    return { kind: 'missing_inputs', missing: inputs.missingRequired };
  }

  // Bank-wide minimum (8,000 USD or currency equivalent — same rule and
  // same FX table as the New Assessment form's validateLoanAmount) applies
  // here too: never silently compute and recommend a term for an amount
  // that could never actually be approved.
  const minimumRequired = getMinimumLoanAmount(inputs.loanCurrency);
  if (inputs.loanAmount < minimumRequired) {
    return {
      kind: 'below_minimum',
      loanAmount: inputs.loanAmount,
      loanAmountSource: inputs.loanAmountSource === 'query' ? 'query' : 'on_file',
      loanCurrency: inputs.loanCurrency,
      minimumRequired,
    };
  }

  const result = recommendInstallmentTerm({
    loanAmount: inputs.loanAmount,
    loanCurrency: inputs.loanCurrency,
    loanType: inputs.loanType,
    monthlySalary: customer.monthly_income,
    monthlyObligations,
  });

  const loanAmountSource = inputs.loanAmountSource === 'query' ? 'query' : 'on_file';

  if (result.status === 'ok') {
    return {
      kind: 'term_recommendation',
      status: 'ok',
      recommendedTermYears: result.recommendedTermYears,
      monthlyInstallment: result.recommended.monthlyInstallment,
      totalInterest: result.recommended.totalInterest,
      totalRepaid: result.recommended.totalRepaid,
      debtBurdenRatio: result.recommended.debtBurdenRatio,
      dbrCap: result.dbrCap,
      ageAtMaturity: result.recommended.ageAtMaturity,
      ageAtMaturityCap: result.ageAtMaturityCap,
      annualRate: result.annualRate,
      rateLabel: result.rateLabel,
      loanAmount: result.loanAmount,
      loanAmountSource,
      loanCurrency: result.loanCurrency,
      loanType: result.loanType,
    };
  }

  return {
    kind: 'term_recommendation',
    status: 'not_affordable',
    loanAmount: result.loanAmount,
    loanAmountSource,
    loanCurrency: result.loanCurrency,
    loanType: result.loanType,
    dbrCap: result.dbrCap,
    bestAttempt: {
      termYears: result.bestAttempt.termYears,
      monthlyInstallment: result.bestAttempt.monthlyInstallment,
      debtBurdenRatio: result.bestAttempt.debtBurdenRatio,
    },
  };
}

function fmtMoney(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}
function fmtPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

export function formatChunkSummary(chunk: PolicyChunk, language: Lang): string {
  const title = language === 'ar' ? chunk.sectionTitleAr : chunk.sectionTitleEn;
  const rawBody = language === 'ar' ? chunk.textAr || chunk.textEn : chunk.textEn || chunk.textAr;
  const body = rawBody.slice(0, 400).trim();
  return `**${title}**\n${body}${rawBody.length > 400 ? '…' : ''}`;
}

export function formatCustomerSummary(customer: BankCustomerRecord, language: Lang): string {
  const restriction = customer.loan_restricted
    ? language === 'ar'
      ? ` ملاحظة: هذا العميل مقيّد من طلبات القروض${customer.restriction_reason ? `: ${customer.restriction_reason}` : '.'}`
      : ` Note: this customer is restricted from loan applications${customer.restriction_reason ? `: ${customer.restriction_reason}` : '.'}`
    : '';

  if (language === 'ar') {
    return `العميل ${customer.customer_name} (${customer.account_number}): الدخل الشهري ${fmtMoney(customer.monthly_income)}، المصاريف الشهرية ${fmtMoney(customer.monthly_expenses)}، القروض الحالية ${fmtMoney(customer.existing_loans)}، نوع العمل ${customer.employment_type}.${restriction}`;
  }
  return `Customer ${customer.customer_name} (${customer.account_number}): monthly income ${fmtMoney(customer.monthly_income)}, monthly expenses ${fmtMoney(customer.monthly_expenses)}, existing loans ${fmtMoney(customer.existing_loans)}, employment type ${customer.employment_type}.${restriction}`;
}

export function formatAdvisorySummary(advisory: AssistantAdvisoryResult, language: Lang): string {
  if (advisory.kind === 'missing_inputs') {
    return language === 'ar'
      ? `أحتاج إلى مزيد من التفاصيل لحساب ذلك: ${advisory.missing.join(', ')}.`
      : `I need a bit more detail to calculate that: ${advisory.missing.join(', ')}.`;
  }

  if (advisory.kind === 'affordability_headroom') {
    return language === 'ar'
      ? `نسبة عبء الدين الحالية ${fmtPct(advisory.currentDebtBurdenRatio)} من حد ${fmtPct(advisory.dbrCap)}. الحد الأقصى لقسط شهري إضافي قبل تجاوز الحد هو ${fmtMoney(advisory.maxAdditionalMonthlyInstallment)}.`
      : `Current debt burden ratio is ${fmtPct(advisory.currentDebtBurdenRatio)} of the ${fmtPct(advisory.dbrCap)} cap. Maximum additional monthly installment before hitting that cap is ${fmtMoney(advisory.maxAdditionalMonthlyInstallment)}.`;
  }

  if (advisory.kind === 'below_minimum') {
    const amountNote =
      advisory.loanAmountSource === 'on_file'
        ? language === 'ar'
          ? ' (المسجل في الملف)'
          : ' (on file)'
        : '';
    return language === 'ar'
      ? `مبلغ القرض ${advisory.loanCurrency} ${fmtMoney(advisory.loanAmount)}${amountNote} أقل من الحد الأدنى المسموح به وهو ${advisory.loanCurrency} ${fmtMoney(advisory.minimumRequired)}. يرجى استخدام مبلغ أكبر.`
      : `The loan amount of ${advisory.loanCurrency} ${fmtMoney(advisory.loanAmount)}${amountNote} is below the minimum allowed of ${advisory.loanCurrency} ${fmtMoney(advisory.minimumRequired)}. Please use a larger amount.`;
  }

  if (advisory.status === 'ok') {
    const amountNote =
      advisory.loanAmountSource === 'on_file'
        ? language === 'ar'
          ? ' (باستخدام مبلغ القرض المسجل)'
          : ' (using the loan amount on file)'
        : '';
    return language === 'ar'
      ? `بناءً على مبلغ قرض ${advisory.loanCurrency} ${fmtMoney(advisory.loanAmount)}${amountNote}، المدة الموصى بها هي ${advisory.recommendedTermYears} سنة بقسط شهري ${fmtMoney(advisory.monthlyInstallment)}. نسبة عبء الدين ${fmtPct(advisory.debtBurdenRatio)} من حد ${fmtPct(advisory.dbrCap)}.`
      : `Based on a loan amount of ${advisory.loanCurrency} ${fmtMoney(advisory.loanAmount)}${amountNote}, the recommended term is ${advisory.recommendedTermYears} years with a monthly installment of ${advisory.loanCurrency} ${fmtMoney(advisory.monthlyInstallment)}. Debt burden ratio is ${fmtPct(advisory.debtBurdenRatio)} of the ${fmtPct(advisory.dbrCap)} cap.`;
  }

  return language === 'ar'
    ? `حتى عند أطول مدة متاحة (${advisory.bestAttempt.termYears} سنة)، لا يزال القسط الشهري ${fmtMoney(advisory.bestAttempt.monthlyInstallment)} يتجاوز حد نسبة عبء الدين ${fmtPct(advisory.dbrCap)}. قد لا يكون مبلغ القرض هذا مناسبًا حاليًا.`
    : `Even at the longest available term (${advisory.bestAttempt.termYears} years), the monthly installment of ${advisory.loanCurrency} ${fmtMoney(advisory.bestAttempt.monthlyInstallment)} still exceeds the ${fmtPct(advisory.dbrCap)} debt-burden cap. This loan amount may not be affordable right now.`;
}

// ===========================================================================
// STRUCTURED CUSTOMER ANSWER BUILDERS
//
// These render the deterministic result as a readable, sectioned briefing
// instead of a field dump. They are used TWICE:
//   1. as the deterministic fallback shown when OpenRouter is unavailable, and
//   2. as a `structured_summary` handed to the model as grounding, so the AI
//      rewrites an already-correct answer rather than assembling one itself.
//
// Every number here comes from the customer record or the deterministic
// advisory result. Nothing is computed, rounded differently, or invented. A
// field that is absent is stated as absent, never guessed.
// ===========================================================================

const L = {
  customerSummary: { en: 'Customer Financial Summary', ar: 'الملخص المالي للعميل' },
  accountNumber: { en: 'Account number', ar: 'رقم الحساب' },
  customerName: { en: 'Customer', ar: 'العميل' },
  monthlyIncome: { en: 'Monthly income', ar: 'الدخل الشهري' },
  monthlyObligations: { en: 'Monthly obligations', ar: 'الالتزامات الشهرية' },
  existingLoans: { en: 'Existing loans', ar: 'القروض الحالية' },
  employmentType: { en: 'Employment type', ar: 'نوع العمل' },
  assessment: { en: 'Deterministic Loan Assessment', ar: 'التقييم الحسابي للقرض' },
  loanAmount: { en: 'Loan amount', ar: 'مبلغ القرض' },
  requestedTerm: { en: 'Requested term', ar: 'المدة المطلوبة' },
  recommendedTerm: { en: 'Recommended term', ar: 'المدة الموصى بها' },
  installment: { en: 'Estimated monthly installment', ar: 'القسط الشهري التقديري' },
  dbr: { en: 'Debt burden ratio (DBR)', ar: 'نسبة عبء الدين (DBR)' },
  ageAtMaturity: { en: 'Age at maturity', ar: 'العمر عند الاستحقاق' },
  eligibility: { en: 'Eligibility', ar: 'الأهلية' },
  eligible: { en: 'Appears eligible for this scenario', ar: 'يبدو مؤهلاً لهذا السيناريو' },
  notEligible: { en: 'Not eligible for this scenario', ar: 'غير مؤهل لهذا السيناريو' },
  conclusion: { en: 'Conclusion', ar: 'الخلاصة' },
  infoNeeded: { en: 'Information Needed', ar: 'معلومات مطلوبة' },
  nextStep: { en: 'Next Step', ar: 'الخطوة التالية' },
  source: { en: 'Source', ar: 'المصدر' },
  customerRecord: { en: 'Customer Record', ar: 'سجل العميل' },
  calculator: { en: 'Deterministic Loan Calculator', ar: 'حاسبة القروض الحسابية' },
  years: { en: 'years', ar: 'سنة' },
  notOnFile: { en: 'not on file', ar: 'غير مسجل' },
  restricted: { en: 'Loan restriction', ar: 'قيد على القروض' },
  approvalNote: {
    en: 'Final loan approval remains subject to the bank\'s four-stage approval workflow: Branch Employee submission, Branch Manager review, Risk Department review, and Audit Department final decision.',
    ar: 'تبقى الموافقة النهائية على القرض خاضعة لسير الموافقات ذي المراحل الأربع: تقديم موظف الفرع، ثم مراجعة مدير الفرع، ثم مراجعة قسم المخاطر، ثم القرار النهائي لقسم التدقيق.',
  },
  overrideNote: {
    en: 'A Risk Department override, if permitted by bank policy, requires a documented reason and remains subject to the approval workflow.',
    ar: 'أي تجاوز من قسم المخاطر، إن سمحت به سياسة البنك، يتطلب سبباً موثقاً ويبقى خاضعاً لسير الموافقات.',
  },
  historicalNote: {
    en: 'This is based on a previous assessment and is not a new loan decision.',
    ar: 'هذا مبني على تقييم سابق وليس قراراً جديداً بشأن القرض.',
  },
} as const;

const t = (key: keyof typeof L, lang: Lang): string => L[key][lang];

const MISSING_INPUT_LABEL: Record<string, Record<Lang, string>> = {
  loanAmount: { en: 'Requested loan amount', ar: 'مبلغ القرض المطلوب' },
  loanTerm: { en: 'Repayment term', ar: 'مدة السداد' },
};

function labelMissing(field: string, lang: Lang): string {
  return MISSING_INPUT_LABEL[field]?.[lang] ?? field;
}

/** "Customer Financial Summary" block — facts only, straight from the record. */
export function buildCustomerFinancialBlock(customer: BankCustomerRecord, lang: Lang): string {
  const monthlyObligations = monthlyObligationsFromExistingLoans(customer.existing_loans);
  const lines = [
    `${t('customerSummary', lang)}`,
    `- ${t('customerName', lang)}: ${customer.customer_name}`,
    `- ${t('accountNumber', lang)}: ${customer.account_number}`,
    `- ${t('monthlyIncome', lang)}: ${fmtMoney(customer.monthly_income)}`,
    `- ${t('monthlyObligations', lang)}: ${fmtMoney(monthlyObligations)}`,
    `- ${t('existingLoans', lang)}: ${fmtMoney(customer.existing_loans)}`,
    `- ${t('employmentType', lang)}: ${customer.employment_type}`,
  ];
  if (customer.loan_restricted) {
    lines.push(
      `- ${t('restricted', lang)}: ${customer.restriction_reason ?? (lang === 'ar' ? 'مقيّد' : 'restricted')}`
    );
  }
  return lines.join('\n');
}

/** Source footer — only ever names sources that were genuinely used. */
function buildSourceBlock(accountNumber: string, usedCalculator: boolean, lang: Lang): string {
  const lines = [`${t('source', lang)}`, `- ${t('customerRecord', lang)}: ${accountNumber}`];
  if (usedCalculator) lines.push(`- ${t('calculator', lang)}`);
  return lines.join('\n');
}

/**
 * Full structured customer answer. Chooses the right shape from the advisory
 * result: a completed calculation, a missing-input follow-up, a below-minimum
 * notice, or a qualitative headroom summary.
 */
export function buildStructuredCustomerAnswer(params: {
  customer: BankCustomerRecord;
  advisory: AssistantAdvisoryResult | null;
  language: Lang;
  requestedTermYears?: number | null;
}): string {
  const { customer, advisory, language: lang, requestedTermYears } = params;
  const blocks: string[] = [buildCustomerFinancialBlock(customer, lang)];

  if (!advisory) {
    blocks.push(buildSourceBlock(customer.account_number, false, lang));
    return blocks.join('\n\n');
  }

  // --- Missing inputs: ask, never assume. -------------------------------
  if (advisory.kind === 'missing_inputs') {
    const missing = advisory.missing.map((m) => `- ${labelMissing(m, lang)}`);
    if (!advisory.missing.includes('loanTerm')) missing.push(`- ${labelMissing('loanTerm', lang)}`);
    blocks.push(`${t('infoNeeded', lang)}\n${missing.join('\n')}`);
    blocks.push(
      `${t('nextStep', lang)}\n` +
        (lang === 'ar'
          ? 'يرجى تزويدي بمبلغ القرض المطلوب ومدة السداد لتقدير الأهلية.'
          : 'Please provide the requested loan amount and repayment term so I can estimate eligibility.')
    );
    blocks.push(buildSourceBlock(customer.account_number, false, lang));
    return blocks.join('\n\n');
  }

  // --- Below the bank-wide minimum: stated, never computed around. -------
  if (advisory.kind === 'below_minimum') {
    blocks.push(
      `${t('assessment', lang)}\n` +
        `- ${t('loanAmount', lang)}: ${advisory.loanCurrency} ${fmtMoney(advisory.loanAmount)}\n` +
        `- ${t('eligibility', lang)}: ${
          lang === 'ar'
            ? `أقل من الحد الأدنى (${advisory.loanCurrency} ${fmtMoney(advisory.minimumRequired)})`
            : `Below the minimum of ${advisory.loanCurrency} ${fmtMoney(advisory.minimumRequired)}`
        }`
    );
    blocks.push(
      `${t('nextStep', lang)}\n` +
        (lang === 'ar'
          ? 'يرجى تزويدي بمبلغ أكبر لإجراء الحساب.'
          : 'Please provide a larger amount so the calculation can be run.')
    );
    blocks.push(buildSourceBlock(customer.account_number, true, lang));
    return blocks.join('\n\n');
  }

  // --- Qualitative headroom (no specific amount named anywhere). ---------
  if (advisory.kind === 'affordability_headroom') {
    blocks.push(
      `${t('assessment', lang)}\n` +
        `- ${t('dbr', lang)}: ${fmtPct(advisory.currentDebtBurdenRatio)} / ${fmtPct(advisory.dbrCap)}\n` +
        `- ${t('installment', lang)}: ${
          lang === 'ar'
            ? `حتى ${fmtMoney(advisory.maxAdditionalMonthlyInstallment)} إضافية قبل بلوغ الحد`
            : `up to ${fmtMoney(advisory.maxAdditionalMonthlyInstallment)} more before reaching the cap`
        }`
    );
    blocks.push(
      `${t('infoNeeded', lang)}\n- ${labelMissing('loanAmount', lang)}\n- ${labelMissing('loanTerm', lang)}`
    );
    blocks.push(buildSourceBlock(customer.account_number, true, lang));
    blocks.push(t('approvalNote', lang));
    return blocks.join('\n\n');
  }

  // --- Completed deterministic calculation. ------------------------------
  const assessment: string[] = [t('assessment', lang)];
  assessment.push(`- ${t('loanAmount', lang)}: ${advisory.loanCurrency} ${fmtMoney(advisory.loanAmount)}`);
  if (requestedTermYears != null) {
    assessment.push(`- ${t('requestedTerm', lang)}: ${requestedTermYears} ${t('years', lang)}`);
  }

  if (advisory.status === 'ok') {
    assessment.push(`- ${t('recommendedTerm', lang)}: ${advisory.recommendedTermYears} ${t('years', lang)}`);
    assessment.push(`- ${t('installment', lang)}: ${advisory.loanCurrency} ${fmtMoney(advisory.monthlyInstallment)}`);
    assessment.push(`- ${t('dbr', lang)}: ${fmtPct(advisory.debtBurdenRatio)} / ${fmtPct(advisory.dbrCap)}`);
    assessment.push(
      `- ${t('ageAtMaturity', lang)}: ${
        advisory.ageAtMaturity == null
          ? t('notOnFile', lang)
          : `${advisory.ageAtMaturity} / ${advisory.ageAtMaturityCap}`
      }`
    );
    assessment.push(`- ${t('eligibility', lang)}: ${t('eligible', lang)}`);
    blocks.push(assessment.join('\n'));

    blocks.push(
      `${t('conclusion', lang)}\n` +
        (lang === 'ar'
          ? `بما أن نسبة عبء الدين ${fmtPct(advisory.debtBurdenRatio)} ضمن حد ${fmtPct(advisory.dbrCap)}${advisory.ageAtMaturity == null ? '' : ' وقاعدة العمر عند الاستحقاق مستوفاة'}، فإن العميل يبدو مؤهلاً مبدئياً لهذا السيناريو.`
          : `Because the debt burden ratio of ${fmtPct(advisory.debtBurdenRatio)} is within the ${fmtPct(advisory.dbrCap)} limit${advisory.ageAtMaturity == null ? '' : ' and the age-at-maturity rule is satisfied'}, the customer appears eligible for this scenario.`)
    );
  } else {
    assessment.push(`- ${t('recommendedTerm', lang)}: ${advisory.bestAttempt.termYears} ${t('years', lang)}`);
    assessment.push(
      `- ${t('installment', lang)}: ${advisory.loanCurrency} ${fmtMoney(advisory.bestAttempt.monthlyInstallment)}`
    );
    assessment.push(`- ${t('dbr', lang)}: ${fmtPct(advisory.bestAttempt.debtBurdenRatio)} / ${fmtPct(advisory.dbrCap)}`);
    assessment.push(`- ${t('eligibility', lang)}: ${t('notEligible', lang)}`);
    blocks.push(assessment.join('\n'));

    blocks.push(
      `${t('conclusion', lang)}\n` +
        (lang === 'ar'
          ? `حتى عند أطول مدة متاحة (${advisory.bestAttempt.termYears} سنة)، تبلغ نسبة عبء الدين ${fmtPct(advisory.bestAttempt.debtBurdenRatio)} وهي تتجاوز حد ${fmtPct(advisory.dbrCap)}. لذلك العميل غير مؤهل لهذا السيناريو وفق القواعد الحسابية الحالية.`
          : `Even at the longest available term (${advisory.bestAttempt.termYears} years), the debt burden ratio is ${fmtPct(advisory.bestAttempt.debtBurdenRatio)}, which exceeds the ${fmtPct(advisory.dbrCap)} limit. The customer is therefore not eligible for this scenario under the current deterministic rules.`)
    );
    blocks.push(t('overrideNote', lang));
  }

  blocks.push(buildSourceBlock(customer.account_number, true, lang));
  blocks.push(t('approvalNote', lang));
  return blocks.join('\n\n');
}

/** "No customer record was found …" — the only correct answer to a failed lookup. */
export function buildNotFoundAnswer(
  context: Extract<AssistantCustomerContext, { found: false }>,
  lang: Lang
): string {
  if (context.reason === 'not_found') {
    return lang === 'ar'
      ? `لم يتم العثور على أي سجل عميل لرقم الحساب ${context.accountNumber ?? ''}.\nيرجى التحقق من رقم الحساب والمحاولة مرة أخرى.`
      : `No customer record was found for account number ${context.accountNumber ?? ''}.\nPlease verify the account number and try again.`;
  }
  if (context.reason === 'ambiguous') return AMBIGUOUS_TEXT[lang](context.accountNumbers ?? []);
  return MISSING_IDENTIFIER_TEXT[lang];
}

export function formatNotFoundSummary(
  context: Extract<AssistantCustomerContext, { found: false }>,
  language: Lang
): string {
  if (context.reason === 'not_found') return NOT_FOUND_TEXT[language](context.accountNumber ?? '');
  if (context.reason === 'ambiguous') return AMBIGUOUS_TEXT[language](context.accountNumbers ?? []);
  return MISSING_IDENTIFIER_TEXT[language];
}

/** Deterministic, template-based summary — used when the AI composition layer is disabled or unreachable. */
export function deterministicAnswer(params: {
  language: Lang;
  intent: ChatIntent;
  policyChunks: PolicyChunk[];
  customer: BankCustomerRecord | null;
  customerContext: AssistantCustomerContext | null;
  advisory: AssistantAdvisoryResult | null;
  citations: Citation[];
  /** Term named in the question, echoed back for context. Never overrides the engine. */
  requestedTermYears?: number | null;
}): ChatAnswerResult {
  const { language, intent, policyChunks, customer, customerContext, advisory, citations } = params;
  const parts: string[] = [];
  let usedFile = false;
  let usedDb = false;

  if (policyChunks.length > 0) {
    parts.push(policyChunks.map((c) => formatChunkSummary(c, language)).join('\n\n'));
    usedFile = true;
  }
  if (customer) {
    // Structured briefing rather than a one-line field dump: this is what the
    // user actually sees whenever OpenRouter is unavailable, so it has to be
    // readable on its own and carry the same sections the AI answer would.
    parts.push(
      buildStructuredCustomerAnswer({
        customer,
        advisory,
        language,
        requestedTermYears: params.requestedTermYears ?? null,
      })
    );
    usedDb = true;
  } else if (customerContext && customerContext.found === false) {
    parts.push(buildNotFoundAnswer(customerContext, language));
    usedDb = true;
  } else if (advisory) {
    // Advisory without a customer record should not happen (the advisory is
    // only ever built for a found customer), but never silently drop it.
    parts.push(formatAdvisorySummary(advisory, language));
    usedDb = true;
  }

  if (parts.length === 0) {
    // Greetings and capability questions are fully scriptable — answer them
    // for real instead of claiming the assistant is unavailable.
    if (intent === 'greeting') {
      return {
        answer: GREETING_FALLBACK[language],
        language,
        source: 'general',
        intent,
        citations: [],
        foundCustomer: false,
        customerNotFound: false,
      };
    }
    if (intent === 'capability') {
      return {
        answer: CAPABILITY_FALLBACK[language],
        language,
        source: 'general',
        intent,
        citations: [],
        foundCustomer: false,
        customerNotFound: false,
      };
    }
    return {
      answer: AI_UNAVAILABLE_TEXT[language],
      language,
      source: 'unavailable',
      intent,
      citations: [],
      foundCustomer: false,
      customerNotFound: false,
    };
  }

  const rawSource: AnswerSource = usedFile && usedDb ? 'both' : usedFile ? 'file' : 'database';

  return {
    answer: parts.join('\n\n'),
    language,
    source: resolveFinalSource(rawSource, customerContext, advisory),
    intent,
    citations,
    foundCustomer: Boolean(customer),
    customerNotFound: Boolean(customerContext && !customerContext.found),
  };
}
