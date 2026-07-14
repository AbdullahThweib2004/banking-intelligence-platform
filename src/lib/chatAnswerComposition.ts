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
  if (advisory && advisory.kind === 'missing_inputs') return 'clarification';
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
    parts.push(formatCustomerSummary(customer, language));
    usedDb = true;
  } else if (customerContext && customerContext.found === false) {
    parts.push(formatNotFoundSummary(customerContext, language));
    usedDb = true;
  }
  if (advisory) {
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
