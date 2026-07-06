/**
 * AI-powered credit risk assessment.
 *
 * The AI service is the SOURCE OF TRUTH for the score, category, recommended
 * action and explanation. This module is responsible only for:
 *   1. building a structured financial payload (deterministic feature eng.),
 *   2. requesting the assessment from the secure edge function,
 *   3. strictly parsing/validating the AI JSON response,
 *   4. producing the persistence snapshot (DB columns),
 *   5. optionally falling back to the legacy math engine behind a flag.
 *
 * Modules are intentionally separate: data retrieval lives in the page,
 * AI request building + parsing live here, persistence shape is returned here,
 * and UI rendering reuses SavedRiskExplanationView.
 */

import { supabase } from '@/integrations/supabase/client';
import {
  buildDerivedFeatures,
  computeCreditScore,
  serializeRiskExplanation,
  type AiTopFactor,
  type CreditScoreInput,
  type DerivedFeatures,
  type RecommendedAction,
  type SavedRiskExplanation,
} from '@/lib/creditScoring';

/** Compact financial payload sent to the AI (the structured banking fields). */
export interface AiAssessmentPayload {
  input: {
    monthly_income: number;
    monthly_expenses: number;
    existing_loans: number;
    requested_loan_amount: number;
    employment_type: string;
    loan_purpose: string;
  };
  derived: {
    monthly_income: number;
    monthly_expenses: number;
    existing_loans: number;
    requested_loan_amount: number;
    estimated_new_loan_payment: number;
    debt_service_ratio: number;
    loan_to_income_ratio: number;
    disposable_income: number;
    employment_type: string;
    loan_purpose: string;
  };
}

/** Validated AI result, normalized for the app. */
export interface AiCreditResult {
  score: number;
  category: 'low' | 'medium' | 'high';
  confidence: number | null;
  summary: string;
  top_factors: AiTopFactor[];
  derived_features: DerivedFeatures;
  recommended_action: RecommendedAction;
  assessed_at: string;
  result_source: 'ai';
}

export interface AssessmentOutcome {
  snapshot: SavedRiskExplanation;
  source: 'ai' | 'algorithm';
}

const EDGE_FUNCTION = 'credit-assessment';

/** Feature flag: allow falling back to the legacy math engine. Always on in local dev. */
function fallbackEnabled(): boolean {
  if (import.meta.env.DEV) return true;
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
    return 'OpenRouter credit limit reached. Add credits at openrouter.ai or enable the local fallback engine.';
  }
  if (/OPENROUTER_API_KEY/i.test(raw)) {
    return 'OPENROUTER_API_KEY is not configured on Supabase. Run: supabase secrets set OPENROUTER_API_KEY=...';
  }
  return raw || 'AI assessment failed';
}

/** Build the structured financial payload from raw form input. */
export function buildAssessmentPayload(
  input: CreditScoreInput,
  derived: DerivedFeatures
): AiAssessmentPayload {
  return {
    input: {
      monthly_income: input.monthlyIncome,
      monthly_expenses: input.monthlyExpenses,
      existing_loans: input.existingLoans,
      requested_loan_amount: input.requestedLoanAmount,
      employment_type: input.employmentType || 'unknown',
      loan_purpose: input.loanPurpose || 'unknown',
    },
    derived: {
      monthly_income: derived.monthly_income,
      monthly_expenses: derived.monthly_expenses,
      existing_loans: derived.existing_loans,
      requested_loan_amount: derived.requested_loan_amount,
      estimated_new_loan_payment: derived.estimated_new_loan_payment,
      debt_service_ratio: derived.debt_service_ratio,
      loan_to_income_ratio: derived.loan_to_monthly_income_ratio,
      disposable_income: derived.disposable_income,
      employment_type: derived.employment_type,
      loan_purpose: derived.loan_purpose,
    },
  };
}

function asNumber(value: unknown): number | null {
  const n = typeof value === 'string' ? Number(value) : (value as number);
  return Number.isFinite(n) ? n : null;
}

function normalizeCategory(value: unknown, score: number): 'low' | 'medium' | 'high' {
  const v = String(value ?? '').toLowerCase();
  if (v === 'low' || v === 'medium' || v === 'high') return v;
  if (score >= 70) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}

function normalizeAction(value: unknown): RecommendedAction {
  const v = String(value ?? '').toLowerCase().replace(/\s+/g, '_');
  if (v === 'approve' || v === 'manual_review' || v === 'reject') return v;
  return 'manual_review';
}

function normalizeTopFactors(value: unknown): AiTopFactor[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((f) => f && typeof f === 'object')
    .map((f) => {
      const o = f as Record<string, unknown>;
      return {
        label: String(o.label ?? o.feature ?? 'Factor'),
        impact: String(o.impact ?? 'medium'),
        direction: String(o.direction ?? 'increases risk'),
        value: String(o.value ?? ''),
      };
    })
    .slice(0, 6);
}

/**
 * Strictly parse + validate the raw AI response into an AiCreditResult.
 * Throws if the response cannot be safely interpreted.
 */
export function parseAiCreditResult(
  raw: unknown,
  fallbackDerived: DerivedFeatures
): AiCreditResult {
  if (!raw || typeof raw !== 'object') {
    throw new Error('AI response is not an object');
  }
  const o = raw as Record<string, unknown>;

  const score = asNumber(o.score);
  if (score === null) {
    throw new Error('AI response missing a numeric score');
  }
  const clampedScore = Math.min(100, Math.max(0, Math.round(score)));

  const category = normalizeCategory(o.category, clampedScore);
  const confidence = asNumber(o.confidence);
  const summary = String(o.summary ?? '').trim();
  if (!summary) {
    throw new Error('AI response missing a summary');
  }

  const top_factors = normalizeTopFactors(o.top_factors);
  if (top_factors.length === 0) {
    throw new Error('AI response missing top factors');
  }

  // Prefer our deterministic derived features for storage/rendering
  // consistency; the AI echoes them but we trust the engineered payload.
  const derived_features = fallbackDerived;

  return {
    score: clampedScore,
    category,
    confidence: confidence === null ? null : Math.min(1, Math.max(0, confidence)),
    summary,
    top_factors,
    derived_features,
    recommended_action: normalizeAction(o.recommended_action),
    assessed_at:
      typeof o.assessed_at === 'string' && o.assessed_at
        ? o.assessed_at
        : new Date().toISOString(),
    result_source: 'ai',
  };
}

/** Convert a validated AI result into the DB persistence snapshot. */
export function serializeAiAssessment(result: AiCreditResult): SavedRiskExplanation {
  return {
    risk_score: result.score,
    risk_category: result.category,
    risk_confidence: result.confidence,
    risk_explanation_summary: result.summary,
    risk_top_factors: result.top_factors,
    risk_derived_features: result.derived_features,
    recommended_action: result.recommended_action,
    result_source: 'ai',
    assessed_at: result.assessed_at,
  };
}

/**
 * Run the AI credit assessment. Returns the persistence-ready snapshot and
 * which engine produced it. On AI failure, falls back to the legacy math
 * engine only if the feature flag allows it; otherwise rethrows.
 */
export async function assessCreditRisk(
  input: CreditScoreInput
): Promise<AssessmentOutcome> {
  const derived = buildDerivedFeatures(input);
  const payload = buildAssessmentPayload(input, derived);

  console.info('[ai-credit] invoking edge function', EDGE_FUNCTION, {
    inputKeys: Object.keys(payload.input),
    derivedKeys: Object.keys(payload.derived),
    fallbackEnabled: fallbackEnabled(),
  });

  try {
    const { data, error } = await supabase.functions.invoke(EDGE_FUNCTION, {
      body: payload,
    });

    if (error) {
      // Supabase wraps non-2xx responses; surface the function's JSON error body.
      let detail = error.message;
      try {
        const ctx = (error as { context?: Response }).context;
        if (ctx && typeof ctx.text === 'function') {
          const text = await ctx.text();
          if (text) detail = text;
        }
      } catch {
        /* ignore */
      }
      console.error('[ai-credit] edge function returned an error:', detail);
      throw new Error(detail);
    }
    if (data?.error) {
      console.error('[ai-credit] edge function error payload:', data.error);
      throw new Error(String(data.error));
    }

    console.info('[ai-credit] raw edge result:', data?.result);
    const result = parseAiCreditResult(data?.result, derived);
    console.info('[ai-credit] parsed assessment result:', {
      score: result.score,
      category: result.category,
      confidence: result.confidence,
      recommended_action: result.recommended_action,
      result_source: result.result_source,
      factors: result.top_factors.length,
    });
    return { snapshot: serializeAiAssessment(result), source: 'ai' };
  } catch (err) {
    console.error('[ai-credit] AI assessment failed:', err);

    if (!fallbackEnabled()) {
      throw new Error(formatAssessmentError(err));
    }

    console.warn('[ai-credit] falling back to legacy math engine');
    const mathResult = computeCreditScore(input);
    return { snapshot: serializeRiskExplanation(mathResult), source: 'algorithm' };
  }
}
