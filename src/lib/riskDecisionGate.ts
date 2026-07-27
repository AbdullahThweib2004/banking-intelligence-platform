import type { DerivedFeatures, EligibilityStatus } from '@/lib/creditScoring';

/**
 * Gates the Risk stage's Approve action on the ALREADY-COMPUTED, deterministic
 * DBR/age-at-maturity rule engine result (src/lib/loanEligibility.ts). This
 * module does not recompute or duplicate that engine — it only decides what
 * the UI must do with its result:
 *
 *   - 'eligible'      -> Approve proceeds normally.
 *   - 'not_eligible'  -> Approve is blocked until Risk provides a typed
 *                        override reason (stored for audit).
 *   - 'unknown'       -> the row has no rule-engine data at all (e.g. a
 *                        legacy assessment). Risk is informed, but nothing is
 *                        silently assumed to pass or fail, and no override is
 *                        demanded since there is no confirmed violation.
 *
 * The AI narrative fields (risk_score, recommended_action, ai_explanation,
 * risk_top_factors) are intentionally never read here — the rule engine's
 * eligibility_status/eligibility_reasons are the only authoritative input,
 * so the AI analysis can never override this gate.
 */

export type RiskGateState = 'eligible' | 'not_eligible' | 'unknown';

export interface RiskGateResult {
  state: RiskGateState;
  /** Human-readable per-rule failure reasons (from the rule engine itself), empty when eligible/unknown. */
  reasons: string[];
  requiresOverrideReason: boolean;
}

export function evaluateRiskGate(
  derivedFeatures: Pick<DerivedFeatures, 'eligibility_status' | 'eligibility_reasons'> | null | undefined
): RiskGateResult {
  const status: EligibilityStatus | undefined = derivedFeatures?.eligibility_status;

  if (status == null) {
    return { state: 'unknown', reasons: [], requiresOverrideReason: false };
  }

  if (status === 'eligible') {
    return { state: 'eligible', reasons: [], requiresOverrideReason: false };
  }

  return {
    state: 'not_eligible',
    reasons: derivedFeatures?.eligibility_reasons ?? [],
    requiresOverrideReason: true,
  };
}

export function canSubmitApproval(gate: RiskGateResult, overrideReason: string): boolean {
  if (!gate.requiresOverrideReason) return true;
  return overrideReason.trim().length > 0;
}

/**
 * Audit's gate is stricter than Risk's own: a MISSING rule-engine result
 * (the 'unknown' state above) is a hard block with no override, since it
 * means a prior stage was skipped or its data was lost — a process-integrity
 * problem, not a risk-tolerance judgment call for Audit to make. A confirmed
 * 'not_eligible' result is not re-blocked here — Risk already decided (with
 * an override reason on file if needed) before the request ever reached Audit.
 */
export function auditApprovalBlockedByMissingData(
  derivedFeatures: Pick<DerivedFeatures, 'eligibility_status' | 'eligibility_reasons'> | null | undefined
): boolean {
  return evaluateRiskGate(derivedFeatures).state === 'unknown';
}
