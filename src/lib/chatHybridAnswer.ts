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
 * note, and the reported source is forced to "not_found" regardless of what
 * the AI says. The advisory (loan-calculation) layer only ever runs against
 * a customer record that was actually found in the database — it is never
 * invoked with guessed or invented figures, and a "missing_inputs" advisory
 * always forces the reported source to "clarification".
 *
 * All actual decision/composition logic (intent-aware routing helpers,
 * deterministic fallback answers, source-label formatting) lives in
 * chatAnswerComposition.ts, which has no Supabase dependency and is unit
 * tested directly. This file only adds the real I/O: retrieval, DB lookups,
 * and the AI composition call.
 */

import { detectLanguage, retrieveRemote, retrieveLocal, type Lang, type ChatTurn, type PolicyChunk } from '@/lib/rag';
import { classifyIntent, type ChatIntent } from '@/lib/chatIntent';
import { resolveCustomerForQuery, getRecentAssessmentsForAccount, type CustomerLookupOutcome, type AssessmentHistoryRow } from '@/lib/chatCustomerLookup';
import { requestHybridAnswer, assistantAiEnabled, type AssistantCustomerContext, type AssistantAdvisoryResult } from '@/lib/assistantChat';
import type { BankCustomerRecord } from '@/lib/bankCustomers';
import {
  type AnswerSource,
  type ChatAnswerResult,
  formatSourceLabel,
  resolveFinalSource,
  inheritAccountNumberFromHistory,
  toFoundCustomerContext,
  toNotFoundCustomerContext,
  buildAdvisoryResult,
  deterministicAnswer,
} from '@/lib/chatAnswerComposition';

export type { AnswerSource, ChatAnswerResult };
export { formatSourceLabel };

export interface HybridAnswerOptions {
  history?: ChatTurn[];
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
  const { intent, accountNumbers: mentionedAccountNumbers, hasCustomerSignal, hasPolicySignal, isAdvisory, seeksSpecificTerm } =
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
      advisory = buildAdvisoryResult(customer, query, seeksSpecificTerm);
    }
  }

  const customerContext: AssistantCustomerContext | null =
    customer && customerOutcome?.status === 'found'
      ? toFoundCustomerContext(customer, assessments)
      : customerOutcome && customerOutcome.status !== 'found'
        ? toNotFoundCustomerContext(customerOutcome)
        : null;

  const citations: ChatAnswerResult['citations'] = policyChunks.map((c) => ({
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
      intentHint: intent,
      policyChunks: policyChunks.map((c) => ({
        title: language === 'ar' ? c.sectionTitleAr : c.sectionTitleEn,
        body: language === 'ar' ? c.textAr || c.textEn : c.textEn || c.textAr,
        fileName: c.fileName,
      })),
      customer: customerContext,
      advisory,
      history: options.history,
    });

    const finalSource = resolveFinalSource(source, customerContext, advisory);
    const noSourceUsed = finalSource === 'general';

    return {
      answer,
      language,
      source: finalSource,
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
