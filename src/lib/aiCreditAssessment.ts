/**
 * AI explanation layer for credit risk assessment.
 *
 * ARCHITECTURE: the deterministic engine (creditScoring.ts, backed by
 * loanCalculator/loanEligibility/loanRiskScoring) is ALWAYS the source of
 * truth for the score, category, eligibility, and every monetary figure.
 * This module never asks AI to compute those — it only asks AI to explain
 * an already-final result in natural language. If AI is disabled, fails, or
 * times out, the deterministic engine's own explanation
 * (loanExplanation.ts) is used instead, so the employee never sees a blank
 * or broken result.
 *
 * Flow:
 *   1. computeCreditScore(input)              — always runs, cannot fail
 *   2. serializeRiskExplanation(result)        — the guaranteed-valid snapshot
 *   3. (if enabled) ask the edge function for a narrative built FROM the
 *      already-computed numbers; on success, layer the narrative on top
 *      (result_source: 'hybrid'); on any failure, keep the snapshot as-is
 *      (result_source: 'formula').
 */

import { supabase } from '@/integrations/supabase/client';
import {
  computeCreditScore,
  serializeRiskExplanation,
  type CreditScoreInput,
  type CreditScoreResult,
  type ResultSource,
  type SavedRiskExplanation,
} from '@/lib/creditScoring';

export interface AssessmentOutcome {
  snapshot: SavedRiskExplanation;
  source: ResultSource;
  /** Set when the AI narrative layer did not run or did not succeed. */
  aiUnavailableReason?: string;
  debug?: AssessmentDebugInfo;
}

export interface AssessmentDebugInfo {
  formula_score: number;
  formula_category: string;
  ai_attempted: boolean;
  ai_succeeded: boolean;
  ai_error_message?: string;
  result_source: ResultSource;
}

const EDGE_FUNCTION = 'credit-assessment';
/** Give the AI narrative a bounded window; never let it hang the assessment. */
const AI_TIMEOUT_MS = 12_000;

/**
 * Controlled by VITE_CREDIT_AI_FALLBACK (kept as the existing env var name
 * for continuity with prior configuration — its meaning has shifted from
 * "attempt algorithmic fallback on AI failure" to "attempt the AI narrative
 * layer at all", since the algorithm/formula is no longer a fallback, it's
 * always the primary calculation). Set to "false" to skip AI entirely and
 * always use the deterministic explanation.
 */
function aiExplanationEnabled(): boolean {
  return import.meta.env.VITE_CREDIT_AI_FALLBACK !== 'false';
}

function formatAssessmentError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  try {
    const parsed = JSON.parse(raw) as { error?: string };
    if (parsed.error) return parsed.error;
  } catch {
    /* not JSON */
  }
  if (/402|credits|max_tokens/i.test(raw)) {
    return (
      'OpenRouter credit limit reached (HTTP 402). Add credits at openrouter.ai, ' +
      'lower CREDIT_MAX_TOKENS on the edge function, or set VITE_CREDIT_AI_FALLBACK=false ' +
      'to skip the AI narrative and use the deterministic explanation only.'
    );
  }
  if (/OPENROUTER_API_KEY/i.test(raw)) {
    return 'OPENROUTER_API_KEY is not configured on Supabase. Run: supabase secrets set OPENROUTER_API_KEY=...';
  }
  if (/timed out/i.test(raw)) {
    return 'AI explanation request timed out.';
  }
  return raw || 'AI explanation failed';
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

/** Compact context sent to the AI — the already-final numbers, never invented by it. */
function buildNarrativePayload(input: CreditScoreInput, result: CreditScoreResult) {
  const f = result.features;
  return {
    input: {
      employment_type: f.employment_type,
      loan_purpose: f.loan_purpose,
    },
    formula_result: {
      score: result.score,
      category: result.category,
      eligibility_status: f.eligibility_status,
      eligibility_reasons: f.eligibility_reasons,
      debt_burden_ratio: f.debt_burden_ratio,
      debt_burden_ratio_cap: 0.5,
      age_at_maturity: f.age_at_maturity,
      age_at_maturity_cap: 70,
      loan_type: f.loan_type,
      loan_currency: f.loan_currency,
      loan_term_years: f.loan_term_years,
      annual_interest_rate_used: f.annual_interest_rate_used,
      monthly_installment: f.monthly_installment,
      total_interest: f.total_interest,
      total_repaid: f.total_repaid,
      requested_loan_amount: f.requested_loan_amount,
      monthly_income: f.monthly_income,
      monthly_obligations: f.monthly_obligations,
      top_contributions: result.contributions.slice(0, 5),
    },
  };
}

interface AiNarrativeResponse {
  explanation?: string;
  error?: string;
}

/**
 * Requests a natural-language explanation of the ALREADY-COMPUTED formula
 * result. Throws on any failure — callers must treat that as "no AI
 * narrative available" and keep the deterministic explanation, never as
 * "no result available".
 */
async function requestAiNarrative(
  input: CreditScoreInput,
  result: CreditScoreResult
): Promise<string> {
  const payload = buildNarrativePayload(input, result);

  const invokePromise = supabase.functions.invoke(EDGE_FUNCTION, { body: payload });
  const { data, error } = await withTimeout(
    invokePromise,
    AI_TIMEOUT_MS,
    'AI explanation request timed out'
  );

  if (error) {
    const detail = await extractFunctionError(error as { message: string; context?: Response });
    throw new Error(detail);
  }

  const body = data as AiNarrativeResponse | null;
  if (body?.error) {
    throw new Error(String(body.error));
  }

  const explanation = body?.explanation?.trim();
  if (!explanation) {
    throw new Error('AI response missing an explanation');
  }

  return explanation;
}

/**
 * Runs the credit assessment. The deterministic engine always produces the
 * final score/category/eligibility/numbers; this function only decides
 * whether an AI-authored narrative gets layered on top of them.
 */
export async function assessCreditRisk(input: CreditScoreInput): Promise<AssessmentOutcome> {
  // 1. Deterministic engine — the source of truth. Cannot fail: pure, synchronous.
  const formulaResult = computeCreditScore(input);
  const baseSnapshot = serializeRiskExplanation(formulaResult);

  const debug: AssessmentDebugInfo = {
    formula_score: formulaResult.score,
    formula_category: formulaResult.category,
    ai_attempted: false,
    ai_succeeded: false,
    result_source: 'formula',
  };

  if (!aiExplanationEnabled()) {
    console.info(
      '[credit-assessment] AI explanation disabled (VITE_CREDIT_AI_FALLBACK=false) — using the deterministic result and explanation.'
    );
    return { snapshot: baseSnapshot, source: 'formula', debug };
  }

  debug.ai_attempted = true;

  try {
    const explanation = await requestAiNarrative(input, formulaResult);
    debug.ai_succeeded = true;
    debug.result_source = 'hybrid';

    console.info('[credit-assessment] AI narrative succeeded — result_source: hybrid', {
      score: formulaResult.score,
      category: formulaResult.category,
    });

    const hybridSnapshot: SavedRiskExplanation = {
      ...baseSnapshot,
      risk_explanation_summary: explanation,
      ai_explanation: explanation,
      result_source: 'hybrid',
    };

    return { snapshot: hybridSnapshot, source: 'hybrid', debug };
  } catch (err) {
    const message = formatAssessmentError(err);
    debug.ai_error_message = message;
    console.warn(
      '[credit-assessment] AI narrative unavailable — falling back to the deterministic explanation:',
      message
    );
    return { snapshot: baseSnapshot, source: 'formula', aiUnavailableReason: message, debug };
  }
}
