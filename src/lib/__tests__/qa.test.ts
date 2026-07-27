/**
 * QA unit tests — run with: node --import tsx/esm --test src/lib/__tests__/*.test.ts
 * Or: npm run test:qa
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ROLES,
  ROUTE_PERMISSIONS,
  canAccess,
  canOpenAccount,
} from '../roles.ts';
import {
  buildDerivedFeatures,
  computeCreditScore,
  estimateMonthlyLoanPayment,
  serializeRiskExplanation,
} from '../creditScoring.ts';

describe('roles', () => {
  it('allows all roles on dashboard', () => {
    assert.equal(canAccess(ROLES.EMPLOYEE, '/dashboard'), true);
    assert.equal(canAccess(ROLES.MANAGER, '/dashboard'), true);
    assert.equal(canAccess(ROLES.RISK, '/dashboard'), true);
  });

  it('restricts audit-log to risk', () => {
    assert.equal(canAccess(ROLES.RISK, '/audit-log'), true);
    assert.equal(canAccess(ROLES.EMPLOYEE, '/audit-log'), false);
  });

  it('restricts user-management to manager', () => {
    assert.equal(canAccess(ROLES.MANAGER, '/user-management'), true);
    assert.equal(canAccess(ROLES.RISK, '/user-management'), false);
  });

  it('account opening excludes risk role', () => {
    assert.equal(canOpenAccount(ROLES.RISK), false);
    assert.equal(canOpenAccount(ROLES.EMPLOYEE), true);
  });

  it('Audit is a fully separate account: its own dashboard routes are exclusive to it', () => {
    assert.equal(canAccess(ROLES.AUDIT, '/audit-approvals'), true);
    assert.equal(canAccess(ROLES.AUDIT, '/audit-monitoring'), true);
    // No other role may reach Audit's own pages.
    assert.equal(canAccess(ROLES.RISK, '/audit-approvals'), false);
    assert.equal(canAccess(ROLES.MANAGER, '/audit-approvals'), false);
    assert.equal(canAccess(ROLES.EMPLOYEE, '/audit-approvals'), false);
    assert.equal(canAccess(ROLES.RISK, '/audit-monitoring'), false);
    assert.equal(canAccess(ROLES.MANAGER, '/audit-monitoring'), false);
  });

  it('Audit cannot access Risk/Manager\'s shared Approvals page, and vice versa', () => {
    assert.equal(canAccess(ROLES.AUDIT, '/approvals'), false);
    assert.equal(canAccess(ROLES.RISK, '/approvals'), true);
    assert.equal(canAccess(ROLES.MANAGER, '/approvals'), true);
  });

  it('Audit has its own AI Assistant / chat access, same as other roles', () => {
    assert.equal(canAccess(ROLES.AUDIT, '/ai-assistant'), true);
  });
});

describe('creditScoring', () => {
  const baseInput = {
    monthlyIncome: 5000,
    monthlyExpenses: 2000,
    existingLoans: 6000,
    requestedLoanAmount: 10000,
    employmentType: 'employed',
    loanPurpose: 'home',
  };

  it('estimateMonthlyLoanPayment returns 0 for zero principal', () => {
    assert.equal(estimateMonthlyLoanPayment(0), 0);
  });

  it('computeCreditScore score in 0-100', () => {
    const r = computeCreditScore(baseInput);
    assert.ok(r.score >= 0 && r.score <= 100);
  });

  it('weak profile scores higher risk than strong profile', () => {
    const strong = computeCreditScore({
      monthlyIncome: 15000,
      monthlyExpenses: 2000,
      existingLoans: 0,
      requestedLoanAmount: 5000,
      employmentType: 'employed',
      loanPurpose: 'home',
    });
    const weak = computeCreditScore({
      monthlyIncome: 2000,
      monthlyExpenses: 1500,
      existingLoans: 50000,
      requestedLoanAmount: 50000,
      employmentType: 'self-employed',
      loanPurpose: 'other',
    });
    assert.ok(weak.score > strong.score);
  });

  it('serializeRiskExplanation uses the formula source (deterministic engine, no AI narrative)', () => {
    const snap = serializeRiskExplanation(computeCreditScore(baseInput));
    assert.equal(snap.result_source, 'formula');
  });

  it('buildDerivedFeatures clamps negatives', () => {
    const f = buildDerivedFeatures({ ...baseInput, monthlyIncome: -100 });
    assert.equal(f.monthly_income, 0);
  });
});
