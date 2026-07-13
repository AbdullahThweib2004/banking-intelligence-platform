/**
 * Hybrid orchestrator for the bank chat assistant.
 *
 * Routes each question to whichever combination of sources it actually
 * needs — the bank's 3 policy documents (rag.ts retrieval), the live
 * bank_customers database (chatCustomerLookup.ts), and/or the deterministic
 * loan-affordability engine (chatLoanAdvisory.ts) — then asks the
 * assistant-chat edge function to write one final natural-language answer
 * from whatever was actually found.
 *
 * Hard rule enforced here, not just in the prompt: if a customer/account
 * lookup was needed and it did not find a match, that fact is passed
 * through as a structured "not found / ambiguous / missing identifier"
 * note. The advisory (loan-calculation) layer only ever runs against a
 * customer record that was actually found in the database — it is never
 * invoked with guessed or invented figures.
 */

import {
  detectLanguage,
  retrieveRemote,
  retrieveLocal,
  type Lang,
  type ChatTurn,
  type Citation,
  type PolicyChunk,
} from '@/lib/rag';
import { classifyIntent, extractAccountNumbers, type ChatIntent } from '@/lib/chatIntent';
import {
  resolveCustomerForQuery,
  getRecentAssessmentsForAccount,
  type CustomerLookupOutcome,
  type AssessmentHistoryRow,
} from '@/lib/chatCustomerLookup';
import {
  recommendInstallmentTerm,
  computeAffordabilityHeadroom,
  monthlyObligationsFromExistingLoans,
  resolveAdvisoryInputs,
  parseLoanAmountFromText,
} from '@/lib/chatLoanAdvisory';
import {
  requestHybridAnswer,
  assistantAiEnabled,
  type AssistantCustomerContext,
  type AssistantAdvisoryResult,
  type AssistantSource,
} from '@/lib/assistantChat';
import type { BankCustomerRecord } from '@/lib/bankCustomers';

export type AnswerSource = AssistantSource | 'unavailable';

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

export interface HybridAnswerOptions {
  history?: ChatTurn[];
}

const SOURCE_LABEL: Record<AnswerSource, Record<Lang, string>> = {
  file: { en: 'Source: Policy files', ar: 'المصدر: ملفات السياسة' },
  database: { en: 'Source: Customer database', ar: 'المصدر: قاعدة بيانات العملاء' },
  both: { en: 'Source: Policy files + customer database', ar: 'المصدر: ملفات السياسة + قاعدة بيانات العملاء' },
  general: { en: 'General answer (not from files/database)', ar: 'إجابة عامة (ليست من الملفات/قاعدة البيانات)' },
  unavailable: { en: 'No source available', ar: 'لا يوجد مصدر متاح' },
};

/** Short, localized badge text describing where an answer's content came from. */
export function formatSourceLabel(source: AnswerSource, language: Lang): string {
  return SOURCE_LABEL[source][language];
}

const NOT_FOUND_TEXT: Record<Lang, (accountNumber: string) => string> = {
  en: (a) => `I couldn't find any customer/account matching ${a}. Please double-check the account number.`,
  ar: (a) => `لم أتمكن من العثور على أي عميل/حساب مطابق لـ ${a}. يرجى التحقق من رقم الحساب.`,
};

const AMBIGUOUS_TEXT: Record<Lang, (accounts: string[]) => string> = {
  en: (accts) => `You mentioned more than one account number (${accts.join(', ')}). Which one should I look up?`,
  ar: (accts) => `لقد ذكرت أكثر من رقم حساب (${accts.join(', ')}). أي رقم تريد أن أبحث عنه؟`,
};

const MISSING_IDENTIFIER_TEXT: Record<Lang, string> = {
  en: 'Which account number should I look this up for?',
  ar: 'ما هو رقم الحساب الذي تريد أن أبحث عنه؟',
};

const AI_UNAVAILABLE_TEXT: Record<Lang, string> = {
  en: "I couldn't reach the assistant service right now, and there's nothing else I can use to answer that. Please try again in a moment.",
  ar: 'تعذّر الوصول إلى خدمة المساعد الآن، ولا تتوفر لدي وسيلة أخرى للإجابة على ذلك. يرجى المحاولة مرة أخرى بعد قليل.',
};

/** Reuses the account number from the most recent user turn that mentioned exactly one, for account-less follow-up questions. */
function inheritAccountNumberFromHistory(history: ChatTurn[] | undefined): string[] {
  if (!history?.length) return [];
  for (let i = history.length - 1; i >= 0; i--) {
    const turn = history[i];
    if (turn.role !== 'user') continue;
    const found = extractAccountNumbers(turn.content);
    if (found.length === 1) return found;
  }
  return [];
}

async function retrievePolicyChunks(query: string, language: Lang, topK = 3): Promise<PolicyChunk[]> {
  try {
    const remote = await retrieveRemote(query, Math.max(topK, 4));
    return remote.slice(0, topK);
  } catch (err) {
    console.warn('[chatHybridAnswer] semantic retrieval unavailable, using local fallback:', err);
    return retrieveLocal(query, topK, language);
  }
}

function toFoundCustomerContext(
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

function toNotFoundCustomerContext(
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

/** Builds the deterministic loan-term-recommendation or affordability-headroom advisory result for a FOUND customer only. */
function buildAdvisoryResult(customer: BankCustomerRecord, query: string): AssistantAdvisoryResult {
  const monthlyObligations = monthlyObligationsFromExistingLoans(customer.existing_loans);
  const hasAnyAmountSignal = parseLoanAmountFromText(query) != null || customer.loan_amount > 0;

  if (!hasAnyAmountSignal) {
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

function formatChunkSummary(chunk: PolicyChunk, language: Lang): string {
  const title = language === 'ar' ? chunk.sectionTitleAr : chunk.sectionTitleEn;
  const rawBody = language === 'ar' ? chunk.textAr || chunk.textEn : chunk.textEn || chunk.textAr;
  const body = rawBody.slice(0, 400).trim();
  return `**${title}**\n${body}${rawBody.length > 400 ? '…' : ''}`;
}

function formatCustomerSummary(customer: BankCustomerRecord, language: Lang): string {
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

function formatAdvisorySummary(advisory: AssistantAdvisoryResult, language: Lang): string {
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

function formatNotFoundSummary(
  context: Extract<AssistantCustomerContext, { found: false }>,
  language: Lang
): string {
  if (context.reason === 'not_found') return NOT_FOUND_TEXT[language](context.accountNumber ?? '');
  if (context.reason === 'ambiguous') return AMBIGUOUS_TEXT[language](context.accountNumbers ?? []);
  return MISSING_IDENTIFIER_TEXT[language];
}

/** Deterministic, template-based summary — used when the AI composition layer is disabled or unreachable. */
function deterministicAnswer(params: {
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

  const source: AnswerSource = usedFile && usedDb ? 'both' : usedFile ? 'file' : 'database';

  return {
    answer: parts.join('\n\n'),
    language,
    source,
    intent,
    citations,
    foundCustomer: Boolean(customer),
    customerNotFound: Boolean(customerContext && !customerContext.found),
  };
}

/**
 * Answers any user question in the bank chat, routing between the policy
 * documents, the live customer/account database, and the deterministic loan
 * advisory engine based on what the question actually needs. Falls back to
 * a deterministic, template-based answer if the AI composition layer is
 * disabled or unreachable — file/database data is never lost, only the
 * natural-language polish.
 */
export async function answerHybridQuestion(
  query: string,
  options: HybridAnswerOptions = {}
): Promise<ChatAnswerResult> {
  const language = detectLanguage(query);
  const { intent, accountNumbers: mentionedAccountNumbers, hasCustomerSignal, hasPolicySignal, isAdvisory } =
    classifyIntent(query);

  // A follow-up like "does this customer likely qualify?" often doesn't repeat
  // the account number — inherit it from the last user turn that mentioned
  // exactly one, the same way rag.ts expands follow-up policy questions.
  const accountNumbers =
    mentionedAccountNumbers.length === 0 && hasCustomerSignal
      ? inheritAccountNumberFromHistory(options.history)
      : mentionedAccountNumbers;

  const shouldTryPolicy = hasPolicySignal || hasCustomerSignal;
  const policyChunksPromise: Promise<PolicyChunk[]> = shouldTryPolicy
    ? retrievePolicyChunks(query, language)
    : Promise.resolve([]);

  const customerOutcomePromise: Promise<CustomerLookupOutcome | null> = hasCustomerSignal
    ? resolveCustomerForQuery({ accountNumbers })
    : Promise.resolve(null);

  const [policyChunks, customerOutcome] = await Promise.all([policyChunksPromise, customerOutcomePromise]);

  let customer: BankCustomerRecord | null = null;
  let assessments: AssessmentHistoryRow[] = [];
  let advisory: AssistantAdvisoryResult | null = null;

  if (customerOutcome?.status === 'found') {
    customer = customerOutcome.customer;
    assessments = await getRecentAssessmentsForAccount(customer.account_number);
    if (isAdvisory) {
      advisory = buildAdvisoryResult(customer, query);
    }
  }

  const customerContext: AssistantCustomerContext | null =
    customer && customerOutcome?.status === 'found'
      ? toFoundCustomerContext(customer, assessments)
      : customerOutcome && customerOutcome.status !== 'found'
        ? toNotFoundCustomerContext(customerOutcome)
        : null;

  const citations: Citation[] = policyChunks.map((c) => ({
    fileName: c.fileName,
    sectionTitle: language === 'ar' ? c.sectionTitleAr : c.sectionTitleEn,
  }));
  if (customer) {
    citations.push({
      fileName: language === 'ar' ? 'سجل العميل' : 'Customer Record',
      sectionTitle: `${customer.account_number} — ${customer.customer_name}`,
    });
  }

  if (!assistantAiEnabled()) {
    return deterministicAnswer({ language, intent, policyChunks, customer, customerContext, advisory, citations });
  }

  try {
    const { answer, source } = await requestHybridAnswer({
      query,
      language,
      policyChunks: policyChunks.map((c) => ({
        title: language === 'ar' ? c.sectionTitleAr : c.sectionTitleEn,
        body: language === 'ar' ? c.textAr || c.textEn : c.textEn || c.textAr,
        fileName: c.fileName,
      })),
      customer: customerContext,
      advisory,
      history: options.history,
    });

    const noSourceUsed = source === 'general';

    return {
      answer,
      language,
      source,
      intent,
      citations: noSourceUsed ? [] : citations,
      foundCustomer: Boolean(customer),
      customerNotFound: Boolean(customerContext && !customerContext.found),
    };
  } catch (err) {
    console.warn('[chatHybridAnswer] AI composition unavailable, degrading:', err);
    return deterministicAnswer({ language, intent, policyChunks, customer, customerContext, advisory, citations });
  }
}
