/**
 * Tests for the Risk-stage approve gate (src/lib/riskDecisionGate.ts), which
 * decides what to do with the ALREADY-COMPUTED DBR/age-at-maturity rule
 * engine result (src/lib/loanEligibility.ts). Does not recompute or
 * duplicate that engine's own boundary tests (see loanEngine.test.ts) —
 * only tests the gate's own eligible/not_eligible/unknown decision and the
 * override-reason requirement.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { canSubmitApproval, evaluateRiskGate } from '../riskDecisionGate.ts';

describe('evaluateRiskGate', () => {
  it('passes through when eligible, no override required', () => {
    const gate = evaluateRiskGate({ eligibility_status: 'eligible', eligibility_reasons: [] });
    assert.equal(gate.state, 'eligible');
    assert.equal(gate.requiresOverrideReason, false);
    assert.deepEqual(gate.reasons, []);
  });

  it('blocks and surfaces the exact rule-engine reasons when not_eligible', () => {
    const reasons = ['Debt burden ratio 62.0% exceeds the 50% cap.'];
    const gate = evaluateRiskGate({ eligibility_status: 'not_eligible', eligibility_reasons: reasons });
    assert.equal(gate.state, 'not_eligible');
    assert.equal(gate.requiresOverrideReason, true);
    assert.deepEqual(gate.reasons, reasons);
  });

  it('surfaces multiple simultaneous rule failures (DBR and age both breached)', () => {
    const reasons = [
      'Debt burden ratio 62.0% exceeds the 50% cap.',
      'Client age at loan maturity (74) exceeds the cap of 70.',
    ];
    const gate = evaluateRiskGate({ eligibility_status: 'not_eligible', eligibility_reasons: reasons });
    assert.equal(gate.reasons.length, 2);
  });

  it('returns "unknown" (not a silent pass or fail) when the rule engine never ran for this row', () => {
    const gate = evaluateRiskGate(null);
    assert.equal(gate.state, 'unknown');
    assert.equal(gate.requiresOverrideReason, false);
  });

  it('returns "unknown" when eligibility_status itself is missing from an otherwise-present features object', () => {
    const gate = evaluateRiskGate({ eligibility_status: undefined as never, eligibility_reasons: [] });
    assert.equal(gate.state, 'unknown');
  });

  it('never reads AI-narrative fields — only eligibility_status/eligibility_reasons are consulted', () => {
    // A contradicting AI narrative (low risk score, "approve" recommendation)
    // is smuggled in via an `as never` cast alongside a failing rule-engine
    // result. If the gate ever started reading AI fields, this would flip
    // the outcome to 'eligible'; it must not.
    const withContradictingAiFields = {
      eligibility_status: 'not_eligible',
      eligibility_reasons: ['Debt burden ratio 80.0% exceeds the 50% cap.'],
      risk_score: 5,
      risk_category: 'low',
      recommended_action: 'approve',
      ai_explanation: 'This applicant looks perfectly safe to approve.',
    } as never;
    const gate = evaluateRiskGate(withContradictingAiFields);
    assert.equal(gate.state, 'not_eligible');
    assert.equal(gate.requiresOverrideReason, true);
    assert.deepEqual(gate.reasons, ['Debt burden ratio 80.0% exceeds the 50% cap.']);
  });
});

describe('canSubmitApproval', () => {
  it('allows submission immediately when no override is required', () => {
    const gate = evaluateRiskGate({ eligibility_status: 'eligible', eligibility_reasons: [] });
    assert.equal(canSubmitApproval(gate, ''), true);
  });

  it('blocks submission with an empty override reason when one is required', () => {
    const gate = evaluateRiskGate({ eligibility_status: 'not_eligible', eligibility_reasons: ['x'] });
    assert.equal(canSubmitApproval(gate, ''), false);
  });

  it('blocks submission with a whitespace-only override reason', () => {
    const gate = evaluateRiskGate({ eligibility_status: 'not_eligible', eligibility_reasons: ['x'] });
    assert.equal(canSubmitApproval(gate, '   '), false);
  });

  it('allows submission once a non-empty override reason is provided', () => {
    const gate = evaluateRiskGate({ eligibility_status: 'not_eligible', eligibility_reasons: ['x'] });
    assert.equal(canSubmitApproval(gate, 'Manager verbally confirmed extra collateral.'), true);
  });

  it('does not require an override reason for the "unknown" state', () => {
    const gate = evaluateRiskGate(null);
    assert.equal(canSubmitApproval(gate, ''), true);
  });
});
