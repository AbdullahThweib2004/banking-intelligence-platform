/**
 * Re-analysis after an approved loan modification.
 *
 * When the Risk Department approves a modification that changes a scoring input,
 * we MUST recompute the risk with the updated application values — never keep the
 * stale score. This reuses the exact same inference pipeline as the initial
 * assessment (`assessCreditRisk` -> `credit-assessment` edge function); it does
 * NOT implement a separate scoring algorithm.
 *
 * Flow on an approved, scoring-relevant change:
 *   1. reload the (already-updated) application row from approval_requests
 *   2. rerun assessCreditRisk with the latest values
 *   3. overwrite the score/category/explanation snapshot on approval_requests
 *   4. append a risk_reanalysis_history row (old vs new) + an audit log entry
 *   5. on inference failure: mark reanalysis_status='failed' (do NOT present the
 *      old score as current) and record a failed history row.
 */

import { supabase } from '@/integrations/supabase/client';
import { assessCreditRisk } from '@/lib/aiCreditAssessment';
import type { CreditScoreInput, ResultSource } from '@/lib/creditScoring';

/**
 * Fields that feed the ML/AI credit model. A change to any of these on an
 * approved modification triggers a full re-analysis. (`amount` is the
 * approval_requests column for the requested loan amount; `loan_amount`,
 * `salary` and `income` are accepted aliases used by modification requests.)
 */
export const SCORING_FIELDS = new Set<string>([
  'amount',
  'loan_amount',
  'monthly_income',
  'salary',
  'income',
  'monthly_expenses',
  'existing_loans',
  'loan_to_income_ratio',
  'employment_type',
  // Bank-calculator-style fields that also feed the deterministic engine.
  'loan_type',
  'loan_currency',
  'salary_currency',
  'monthly_obligations',
  'client_age',
  'loan_term_years',
]);

export function isScoringField(field: string | null | undefined): boolean {
  if (!field) return false;
  return SCORING_FIELDS.has(field.trim().toLowerCase());
}

/**
 * Best-effort write of the reanalysis_* status columns. These columns are added
 * by the 20260630120000 migration; if it has not been applied yet we swallow the
 * error so the (already persisted) score is never rolled back.
 */
async function markReanalysisStatus(
  applicationId: string,
  status: 'completed' | 'failed',
  errorMessage: string | null
): Promise<void> {
  const { error } = await supabase
    .from('approval_requests')
    .update({
      reanalysis_status: status,
      reanalysis_at: new Date().toISOString(),
      reanalysis_error: errorMessage,
    })
    .eq('id', applicationId);
  if (error) {
    console.warn('[reanalysis] could not write reanalysis status (migration pending?):', error.message);
  }
}

interface ApplicationScoringRow {
  id: string;
  customer_name: string | null;
  monthly_income: number | null;
  monthly_expenses: number | null;
  existing_loans: number | null;
  amount: number | null;
  employment_type: string | null;
  loan_purpose: string | null;
  risk_score: number | null;
  risk_category: 'low' | 'medium' | 'high' | null;
  loan_type: string | null;
  loan_currency: string | null;
  salary_currency: string | null;
  monthly_obligations: number | null;
  client_age: number | null;
  loan_term_years: number | null;
}

export interface ReanalysisActor {
  id: string | null;
  name: string | null;
  role: string | null;
}

export type ReanalysisResult =
  | { status: 'skipped'; reason: string }
  | {
      status: 'completed';
      oldScore: number | null;
      oldCategory: string | null;
      newScore: number;
      newCategory: 'low' | 'medium' | 'high';
      source: ResultSource;
    }
  | { status: 'failed'; error: string };

/**
 * Re-run scoring for an application whose data was just changed by an approved
 * modification. Safe to call only after the field change has been persisted.
 */
export async function reanalyzeApplicationAfterModification(params: {
  applicationId: string;
  modifiedField: string;
  actor: ReanalysisActor;
}): Promise<ReanalysisResult> {
  const { applicationId, modifiedField, actor } = params;

  // 1. Load the (already-updated) application values. Only approval_requests
  //    carries the structured scoring inputs; if the record lives elsewhere we
  //    cannot recompute, so we skip rather than fabricate a score.
  const { data, error } = await supabase
    .from('approval_requests')
    .select(
      `id, customer_name, monthly_income, monthly_expenses, existing_loans, amount, employment_type, loan_purpose, risk_score, risk_category,
       loan_type, loan_currency, salary_currency, monthly_obligations, client_age, loan_term_years`
    )
    .eq('id', applicationId)
    .maybeSingle();

  if (error) {
    console.error('[reanalysis] failed to load application:', error);
    return { status: 'failed', error: error.message };
  }
  if (!data) {
    return { status: 'skipped', reason: 'Application not found in approval_requests' };
  }

  const row = data as ApplicationScoringRow;
  const oldScore = row.risk_score;
  const oldCategory = row.risk_category;

  try {
    // 2. Re-run the SAME assessment pipeline with the latest values. Bank-
    //    calculator fields fall back to creditScoring.ts's own defaults
    //    (resolveInput) when the row predates this refactor and has them
    //    NULL, so reanalysis never breaks on an old application.
    const { snapshot, source } = await assessCreditRisk({
      monthlyIncome: Number(row.monthly_income) || 0,
      monthlyExpenses: Number(row.monthly_expenses) || 0,
      existingLoans: Number(row.existing_loans) || 0,
      requestedLoanAmount: Number(row.amount) || 0,
      employmentType: row.employment_type || 'unknown',
      loanPurpose: row.loan_purpose || 'unknown',
      loanType: (row.loan_type as CreditScoreInput['loanType']) || undefined,
      loanCurrency: (row.loan_currency as CreditScoreInput['loanCurrency']) || undefined,
      salaryCurrency: (row.salary_currency as CreditScoreInput['salaryCurrency']) || undefined,
      monthlyObligations: row.monthly_obligations != null ? Number(row.monthly_obligations) : undefined,
      clientAge: row.client_age != null ? Number(row.client_age) : undefined,
      loanTermYears: row.loan_term_years != null ? Number(row.loan_term_years) : undefined,
    });

    // 3. Overwrite the stored snapshot with the fresh result. The core score
    //    columns are updated on their own so they always persist even if the
    //    reanalysis_* columns migration has not been applied yet.
    const { error: updErr } = await supabase
      .from('approval_requests')
      .update({
        risk_score: snapshot.risk_score,
        risk_category: snapshot.risk_category,
        risk_confidence: snapshot.risk_confidence,
        risk_explanation_summary: snapshot.risk_explanation_summary,
        risk_top_factors: snapshot.risk_top_factors,
        risk_derived_features: snapshot.risk_derived_features,
        recommended_action: snapshot.recommended_action,
        result_source: snapshot.result_source,
        assessed_at: snapshot.assessed_at,
        priority: snapshot.risk_category === 'high' ? 'urgent' : 'normal',
        // Bank-calculator-style fields — kept in sync so the result view
        // shows the re-analyzed installment/DBR/eligibility, not the stale
        // pre-modification ones.
        loan_type: snapshot.loan_type,
        loan_currency: snapshot.loan_currency,
        salary_currency: snapshot.salary_currency,
        monthly_obligations: snapshot.monthly_obligations,
        client_age: snapshot.client_age,
        loan_term_years: snapshot.loan_term_years,
        annual_interest_rate_used: snapshot.annual_interest_rate_used,
        monthly_installment: snapshot.monthly_installment,
        total_interest: snapshot.total_interest,
        total_repaid: snapshot.total_repaid,
        debt_burden_ratio: snapshot.debt_burden_ratio,
        age_at_maturity: snapshot.age_at_maturity,
        eligibility_status: snapshot.eligibility_status,
        ai_explanation: snapshot.ai_explanation,
      })
      .eq('id', applicationId);

    if (updErr) {
      console.error('[reanalysis] failed to persist new score:', updErr);
      return { status: 'failed', error: updErr.message };
    }

    // Best-effort status flag (no-op if the migration is not applied yet).
    await markReanalysisStatus(applicationId, 'completed', null);

    // 4. History + audit trail (best-effort; failures here don't undo the score).
    await supabase.from('risk_reanalysis_history').insert({
      application_id: applicationId,
      old_score: oldScore,
      new_score: snapshot.risk_score,
      old_category: oldCategory,
      new_category: snapshot.risk_category,
      modified_fields: modifiedField,
      status: 'completed',
      actor_id: actor.id,
      actor_name: actor.name,
    });

    if (actor.id) {
      await supabase.from('audit_logs').insert({
        user_id: actor.id,
        user_name: actor.name,
        user_role: actor.role,
        action: 'Re-analyzed loan after approved modification',
        resource: 'approval_requests',
        resource_id: applicationId,
        details: `Field "${modifiedField}" changed → risk ${oldScore ?? '—'} (${oldCategory ?? '—'}) → ${snapshot.risk_score} (${snapshot.risk_category})`,
        severity: 'info',
      });
    }

    return {
      status: 'completed',
      oldScore,
      oldCategory,
      newScore: snapshot.risk_score,
      newCategory: snapshot.risk_category,
      source,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[reanalysis] inference failed:', message);

    // 5. Do NOT keep the old score silently — flag the record for re-analysis.
    await markReanalysisStatus(applicationId, 'failed', message);

    await supabase.from('risk_reanalysis_history').insert({
      application_id: applicationId,
      old_score: oldScore,
      new_score: null,
      old_category: oldCategory,
      new_category: null,
      modified_fields: modifiedField,
      status: 'failed',
      actor_id: actor.id,
      actor_name: actor.name,
      error_message: message,
    });

    if (actor.id) {
      await supabase.from('audit_logs').insert({
        user_id: actor.id,
        user_name: actor.name,
        user_role: actor.role,
        action: 'Loan re-analysis FAILED after approved modification',
        resource: 'approval_requests',
        resource_id: applicationId,
        details: `Field "${modifiedField}" changed but model inference failed: ${message}`,
        severity: 'error',
      });
    }

    return { status: 'failed', error: message };
  }
}
