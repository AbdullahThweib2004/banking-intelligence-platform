/**
 * Tests for the two-stage modification/objection workflow.
 * Run with: npm test (node --test)
 *
 * Covers the status state machine, per-stage eligibility, the invalid-
 * transition allow-list, the recalculation gate, and — critically — that a
 * risk-approved change to a calculation-relevant field genuinely re-resolves
 * the DEFAULT INTEREST RATE and every dependent monetary figure through the
 * existing deterministic engine, rather than through any separate code path.
 *
 * Imports use explicit .ts extensions so this file resolves under Node's plain
 * `--test` runner as well as Vite, matching loanEngine.test.ts.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  MODIFICATION_STATUS,
  ALL_MODIFICATION_STATUSES,
  INITIAL_MODIFICATION_STATUS,
  statusStage,
  isManagerActionable,
  isRiskActionable,
  isTerminal,
  isValidTransition,
  actorRoleForTransition,
  nextStatusForManagerDecision,
  nextStatusForRiskDecision,
  shouldRecalculate,
  isScoringField,
  statusLabel,
  rejectedByStage,
} from '../modificationWorkflow.ts';

import { computeCreditScore, serializeRiskExplanation } from '../creditScoring.ts';
import { resolveEffectiveAnnualRate } from '../loanProducts.ts';

// ---------------------------------------------------------------------------
describe('modificationWorkflow — status domain', () => {
  it('a new request always starts at the branch-manager gate', () => {
    assert.equal(INITIAL_MODIFICATION_STATUS, 'pending_branch_manager_review');
  });

  it('retains the legacy "pending" value for backward compatibility', () => {
    assert.ok(ALL_MODIFICATION_STATUSES.includes(MODIFICATION_STATUS.LEGACY_PENDING));
  });

  it('maps every status to exactly one owning stage', () => {
    assert.equal(statusStage('pending_branch_manager_review'), 'manager');
    assert.equal(statusStage('pending_risk_review'), 'risk');
    assert.equal(statusStage('pending'), 'risk'); // legacy
    assert.equal(statusStage('approved'), 'final');
    assert.equal(statusStage('rejected'), 'final');
  });
});

// ---------------------------------------------------------------------------
describe('modificationWorkflow — manager-stage eligibility', () => {
  it('the manager may act only on a manager-pending request', () => {
    assert.equal(isManagerActionable('pending_branch_manager_review'), true);
    assert.equal(isManagerActionable('pending_risk_review'), false);
    assert.equal(isManagerActionable('pending'), false);
    assert.equal(isManagerActionable('approved'), false);
    assert.equal(isManagerActionable('rejected'), false);
  });

  it('manager approval sends the request to the risk gate, never straight to approved', () => {
    assert.equal(nextStatusForManagerDecision(true), 'pending_risk_review');
    assert.notEqual(nextStatusForManagerDecision(true), 'approved');
  });

  it('manager rejection is terminal', () => {
    assert.equal(nextStatusForManagerDecision(false), 'rejected');
    assert.equal(isTerminal(nextStatusForManagerDecision(false)), true);
  });
});

// ---------------------------------------------------------------------------
describe('modificationWorkflow — risk-stage eligibility', () => {
  it('risk may act only on a risk-pending request (or a legacy pending one)', () => {
    assert.equal(isRiskActionable('pending_risk_review'), true);
    assert.equal(isRiskActionable('pending'), true); // legacy in-flight row
    assert.equal(isRiskActionable('pending_branch_manager_review'), false);
    assert.equal(isRiskActionable('approved'), false);
    assert.equal(isRiskActionable('rejected'), false);
  });

  it('risk is the only stage that can produce the final approved status', () => {
    assert.equal(nextStatusForRiskDecision(true), 'approved');
    assert.equal(nextStatusForRiskDecision(false), 'rejected');
  });
});

// ---------------------------------------------------------------------------
describe('modificationWorkflow — invalid transitions are refused', () => {
  it('the manager stage cannot be skipped (submitted -> approved is invalid)', () => {
    assert.equal(isValidTransition('pending_branch_manager_review', 'approved'), false);
  });

  it('a request cannot jump backwards from the risk gate to the manager gate', () => {
    assert.equal(isValidTransition('pending_risk_review', 'pending_branch_manager_review'), false);
  });

  it('a rejected request can never be revived', () => {
    for (const target of ALL_MODIFICATION_STATUSES) {
      if (target === 'rejected') continue;
      assert.equal(
        isValidTransition('rejected', target),
        false,
        `rejected -> ${target} must be refused`
      );
    }
  });

  it('an approved request can never be re-decided', () => {
    for (const target of ALL_MODIFICATION_STATUSES) {
      if (target === 'approved') continue;
      assert.equal(
        isValidTransition('approved', target),
        false,
        `approved -> ${target} must be refused`
      );
    }
  });

  it('accepts the two legal manager transitions and the two legal risk transitions', () => {
    assert.equal(isValidTransition('pending_branch_manager_review', 'pending_risk_review'), true);
    assert.equal(isValidTransition('pending_branch_manager_review', 'rejected'), true);
    assert.equal(isValidTransition('pending_risk_review', 'approved'), true);
    assert.equal(isValidTransition('pending_risk_review', 'rejected'), true);
  });

  it('a no-op status update is allowed so unrelated column edits never trip the rule', () => {
    assert.equal(isValidTransition('pending_risk_review', 'pending_risk_review'), true);
  });

  it('attributes each legal transition to exactly the role permitted to make it', () => {
    assert.equal(
      actorRoleForTransition('pending_branch_manager_review', 'pending_risk_review'),
      'branch_manager'
    );
    assert.equal(actorRoleForTransition('pending_risk_review', 'approved'), 'risk_department');
    assert.equal(actorRoleForTransition('pending_branch_manager_review', 'approved'), null);
  });
});

// ---------------------------------------------------------------------------
describe('modificationWorkflow — recalculation gate', () => {
  it('recalculates on risk approval of a scoring field', () => {
    assert.equal(
      shouldRecalculate({ stage: 'risk', approve: true, fieldName: 'amount' }),
      true
    );
  });

  it('does NOT recalculate on manager approval alone — nothing has been applied yet', () => {
    assert.equal(
      shouldRecalculate({ stage: 'manager', approve: true, fieldName: 'amount' }),
      false
    );
  });

  it('does NOT recalculate on manager rejection', () => {
    assert.equal(
      shouldRecalculate({ stage: 'manager', approve: false, fieldName: 'amount' }),
      false
    );
  });

  it('does NOT recalculate on risk rejection — no value changed', () => {
    assert.equal(
      shouldRecalculate({ stage: 'risk', approve: false, fieldName: 'amount' }),
      false
    );
  });

  it('does NOT recalculate for a non-scoring field such as customer_name', () => {
    assert.equal(
      shouldRecalculate({ stage: 'risk', approve: true, fieldName: 'customer_name' }),
      false
    );
  });

  it('treats every rate-relevant field as scoring-relevant', () => {
    for (const field of [
      'amount',
      'loan_amount',
      'loan_type',
      'loan_currency',
      'salary_currency',
      'loan_term_years',
      'monthly_income',
      'monthly_obligations',
      'client_age',
    ]) {
      assert.equal(isScoringField(field), true, `${field} must trigger re-assessment`);
    }
  });

  it('ignores case and surrounding whitespace when classifying a field', () => {
    assert.equal(isScoringField('  Amount '), true);
    assert.equal(isScoringField(null), false);
    assert.equal(isScoringField(''), false);
  });
});

// ---------------------------------------------------------------------------
// Default-rate recalculation. These assert the behaviour the workflow depends
// on: re-running the EXISTING deterministic pipeline with the modified input
// re-resolves the rate and every dependent figure. No separate "default rate
// recalculation" path exists, and none should be added.
// ---------------------------------------------------------------------------
describe('modificationWorkflow — deterministic re-assessment after a modification', () => {
  const baseInput = {
    monthlyIncome: 6000,
    monthlyExpenses: 1500,
    existingLoans: 0,
    requestedLoanAmount: 30000,
    employmentType: 'employed',
    loanPurpose: 'personal',
    loanType: 'personal' as const,
    loanCurrency: 'ILS' as const,
    salaryCurrency: 'ILS' as const,
    monthlyObligations: 400,
    clientAge: 40,
    loanTermYears: 5,
  };

  it('a loan-amount change refreshes installment, interest, repaid, and DBR', () => {
    const before = computeCreditScore(baseInput);
    const after = computeCreditScore({ ...baseInput, requestedLoanAmount: 60000 });

    assert.ok(
      after.features.monthly_installment > before.features.monthly_installment,
      'installment must increase with a larger principal'
    );
    assert.ok(after.features.total_interest > before.features.total_interest);
    assert.ok(after.features.total_repaid > before.features.total_repaid);
    assert.ok(after.features.debt_burden_ratio > before.features.debt_burden_ratio);
  });

  it('the rate used is always the one the product/currency resolver returns — never a stored stale value', () => {
    const result = computeCreditScore(baseInput);
    const resolved = resolveEffectiveAnnualRate('personal', 'ILS');
    assert.equal(result.features.annual_interest_rate_used, resolved.annualRate);
  });

  it('a loan-PRODUCT change re-resolves to the index-based rate, not the fixed one', () => {
    const fixed = computeCreditScore(baseInput);
    const indexed = computeCreditScore({ ...baseInput, loanType: 'mortgage_program' });

    const fixedRate = resolveEffectiveAnnualRate('personal', 'ILS').annualRate;
    const indexRate = resolveEffectiveAnnualRate('mortgage_program', 'ILS').annualRate;

    assert.equal(fixed.features.annual_interest_rate_used, fixedRate);
    assert.equal(indexed.features.annual_interest_rate_used, indexRate);
    assert.notEqual(
      indexed.features.annual_interest_rate_used,
      fixed.features.annual_interest_rate_used,
      'switching product family must change the resolved rate'
    );
  });

  it('a loan-CURRENCY change re-resolves to that currency rate band', () => {
    const ils = computeCreditScore(baseInput);
    const usd = computeCreditScore({ ...baseInput, loanCurrency: 'USD' });

    assert.equal(
      ils.features.annual_interest_rate_used,
      resolveEffectiveAnnualRate('personal', 'ILS').annualRate
    );
    assert.equal(
      usd.features.annual_interest_rate_used,
      resolveEffectiveAnnualRate('personal', 'USD').annualRate
    );
    assert.notEqual(
      usd.features.annual_interest_rate_used,
      ils.features.annual_interest_rate_used
    );
  });

  it('a term change refreshes age-at-maturity and the eligibility verdict together', () => {
    const short = computeCreditScore({ ...baseInput, clientAge: 62, loanTermYears: 5 });
    const long = computeCreditScore({ ...baseInput, clientAge: 62, loanTermYears: 20 });

    assert.equal(short.features.age_at_maturity, 67);
    assert.equal(long.features.age_at_maturity, 82);
    assert.equal(short.features.eligibility_status, 'eligible');
    assert.equal(long.features.eligibility_status, 'not_eligible');
    assert.equal(long.category, 'high', 'ineligible must be forced to high risk');
  });

  it('a re-assessment yields a complete snapshot with every dependent field refreshed', () => {
    const snapshot = serializeRiskExplanation(
      computeCreditScore({ ...baseInput, requestedLoanAmount: 45000 })
    );

    for (const key of [
      'risk_score',
      'risk_category',
      'recommended_action',
      'annual_interest_rate_used',
      'monthly_installment',
      'total_interest',
      'total_repaid',
      'debt_burden_ratio',
      'eligibility_status',
      'assessed_at',
    ] as const) {
      assert.notEqual(snapshot[key], undefined, `${key} must be present after re-assessment`);
      assert.notEqual(snapshot[key], null, `${key} must be populated after re-assessment`);
    }
    assert.ok(Array.isArray(snapshot.risk_top_factors));
    assert.ok(snapshot.risk_derived_features);
    // A fresh formula-only snapshot never carries an AI narrative.
    assert.equal(snapshot.result_source, 'formula');
    assert.equal(snapshot.ai_explanation, null);
  });

  it('re-assessment is deterministic — identical input yields an identical result', () => {
    const a = computeCreditScore({ ...baseInput, requestedLoanAmount: 52000 });
    const b = computeCreditScore({ ...baseInput, requestedLoanAmount: 52000 });

    assert.equal(a.score, b.score);
    assert.equal(a.category, b.category);
    assert.equal(a.features.monthly_installment, b.features.monthly_installment);
    assert.equal(a.features.annual_interest_rate_used, b.features.annual_interest_rate_used);
  });
});

// ---------------------------------------------------------------------------
describe('modificationWorkflow — presentation helpers', () => {
  it('labels every status in both languages', () => {
    for (const status of ALL_MODIFICATION_STATUSES) {
      const en = statusLabel(status, 'en');
      const ar = statusLabel(status, 'ar');
      assert.ok(en.length > 0, `${status} needs an English label`);
      assert.ok(ar.length > 0, `${status} needs an Arabic label`);
      assert.notEqual(en, ar, `${status} must not fall back to the same string`);
    }
  });

  it('distinguishes a manager rejection from a risk rejection', () => {
    assert.equal(
      rejectedByStage({ status: 'rejected', manager_decision: 'rejected' }),
      'manager'
    );
    assert.equal(
      rejectedByStage({ status: 'rejected', manager_decision: 'approved' }),
      'risk'
    );
    assert.equal(rejectedByStage({ status: 'approved', manager_decision: 'approved' }), null);
  });
});
