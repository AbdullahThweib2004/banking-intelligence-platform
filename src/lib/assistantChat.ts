/**
 * Client wrapper for the assistant-chat edge function — the hybrid answer
 * composition layer for the bank chat assistant.
 *
 * This module only shapes the request/response; it does not decide what to
 * retrieve. src/lib/chatHybridAnswer.ts assembles the policy chunks,
 * customer context, and advisory result, and calls requestHybridAnswer()
 * with all of it. The edge function is instructed to never invent customer
 * data or loan numbers — it only explains what it was actually given.
 */

import { supabase } from '@/integrations/supabase/client';
import type { Lang, ChatTurn } from '@/lib/rag';

export type AssistantSource = 'file' | 'database' | 'both' | 'general';

export interface AssistantChatResult {
  answer: string;
  source: AssistantSource;
}

export interface AssistantPolicyChunkInput {
  title: string;
  body: string;
  fileName: string;
}

export interface AssistantAssessmentSummary {
  assessedAt: string | null;
  riskScore: number | null;
  riskCategory: string | null;
  loanType: string | null;
  monthlyInstallment: number | null;
  eligibilityStatus: string | null;
  status: string | null;
}

export type AssistantCustomerContext =
  | {
      found: true;
      accountNumber: string;
      customerName: string;
      monthlyIncome: number;
      monthlyExpenses: number;
      existingLoans: number;
      employmentType: string;
      loanAmount: number;
      loanPurpose: string;
      loanRestricted: boolean;
      restrictionReason: string | null;
      recentAssessments: AssistantAssessmentSummary[];
    }
  | {
      found: false;
      reason: 'not_found' | 'ambiguous' | 'missing_identifier';
      accountNumber?: string;
      accountNumbers?: string[];
    };

export type AssistantAdvisoryResult =
  | { kind: 'missing_inputs'; missing: string[] }
  | {
      kind: 'term_recommendation';
      status: 'ok';
      recommendedTermYears: number;
      monthlyInstallment: number;
      totalInterest: number;
      totalRepaid: number;
      debtBurdenRatio: number;
      dbrCap: number;
      ageAtMaturity: number | null;
      ageAtMaturityCap: number;
      annualRate: number;
      rateLabel: string;
      loanAmount: number;
      loanAmountSource: 'query' | 'on_file';
      loanCurrency: string;
      loanType: string;
    }
  | {
      kind: 'term_recommendation';
      status: 'not_affordable';
      loanAmount: number;
      loanAmountSource: 'query' | 'on_file';
      loanCurrency: string;
      loanType: string;
      dbrCap: number;
      bestAttempt: { termYears: number; monthlyInstallment: number; debtBurdenRatio: number };
    }
  | {
      kind: 'affordability_headroom';
      monthlySalary: number;
      monthlyObligations: number;
      currentDebtBurdenRatio: number;
      dbrCap: number;
      maxAdditionalMonthlyInstallment: number;
      currentlyOverCap: boolean;
    }
  | {
      /** The requested/on-file loan amount is below the bank-wide minimum (8,000 USD or currency equivalent) — never silently computed against anyway. */
      kind: 'below_minimum';
      loanAmount: number;
      loanAmountSource: 'query' | 'on_file';
      loanCurrency: string;
      minimumRequired: number;
    };

const EDGE_FUNCTION = 'assistant-chat';
/** Never let the hybrid answer request hang the chat UI. */
const AI_TIMEOUT_MS = 15_000;

/**
 * Controlled by VITE_ASSISTANT_AI_FALLBACK. Set to "false" to disable the AI
 * answer-composition layer entirely — callers then fall back to a
 * deterministic, template-based summary of whatever was retrieved.
 */
export function assistantAiEnabled(): boolean {
  return import.meta.env.VITE_ASSISTANT_AI_FALLBACK !== 'false';
}

async function extractFunctionError(error: { message: string; context?: Response }): Promise<string> {
  let detail = error.message;
  try {
    const ctx = error.context;
    if (ctx && typeof ctx.text === 'function') {
      const text = await ctx.text();
      if (text) {
        try {
          const parsed = JSON.parse(text) as { error?: string };
          detail = parsed.error ?? text;
        } catch {
          detail = text;
        }
      }
    }
  } catch {
    /* ignore */
  }
  return detail;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(message)), timeoutMs);
    }),
  ]);
}

interface AssistantChatResponse {
  answer?: string;
  source?: string;
  error?: string;
}

/**
 * Requests one final hybrid answer from the assistant-chat edge function.
 * Throws on any failure — callers must treat that as "AI composition
 * unavailable right now", not as "no answer exists".
 */
export async function requestHybridAnswer(params: {
  query: string;
  language: Lang;
  /** The classifier's best guess (greeting/capability/policy/customer/hybrid/general) — an advisory signal only; the model still decides "source" from what it actually used. */
  intentHint?: string;
  policyChunks: AssistantPolicyChunkInput[];
  customer: AssistantCustomerContext | null;
  advisory: AssistantAdvisoryResult | null;
  history?: ChatTurn[];
}): Promise<AssistantChatResult> {
  const payload = {
    query: params.query,
    language: params.language,
    intentHint: params.intentHint ?? null,
    policyChunks: params.policyChunks,
    customer: params.customer,
    advisory: params.advisory,
    history: (params.history ?? []).slice(-6).map((h) => ({ role: h.role, content: h.content })),
  };

  const invokePromise = supabase.functions.invoke(EDGE_FUNCTION, { body: payload });
  const { data, error } = await withTimeout(invokePromise, AI_TIMEOUT_MS, 'Assistant request timed out');

  if (error) {
    const detail = await extractFunctionError(error as { message: string; context?: Response });
    throw new Error(detail);
  }

  const body = data as AssistantChatResponse | null;
  if (body?.error) {
    throw new Error(String(body.error));
  }

  const answer = body?.answer?.trim();
  if (!answer) {
    throw new Error('Assistant response missing an answer');
  }

  const source: AssistantSource =
    body?.source === 'file' || body?.source === 'database' || body?.source === 'both'
      ? body.source
      : 'general';

  return { answer, source };
}
