/**
 * Tests for the Employment Proof Upload step's pure matching/decision logic
 * (src/lib/employmentMatch.ts). Covers the "no random defaults" business
 * rule end to end at the decision level: exact national_id match is the
 * only outcome ever safe to auto-apply; name-only matches must never be
 * silently used, whether there's zero, one, or many of them.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { resolveEmploymentMatch, isSalaryMismatch } from '../employmentMatch.ts';
import type { BankCustomerRecord } from '../bankCustomers.ts';

function makeCustomer(overrides: Partial<BankCustomerRecord> = {}): BankCustomerRecord {
  return {
    id: 'cust-1',
    account_number: 'BOP-100001',
    customer_name: 'Ahmad Khalil Nasser',
    national_id: '402156789012',
    monthly_income: 4500,
    monthly_expenses: 1800,
    existing_loans: 500,
    employment_type: 'employed',
    loan_amount: 15000,
    loan_purpose: 'personal',
    loan_restricted: false,
    restriction_reason: null,
    financial_profile_source: 'database_match',
    created_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('resolveEmploymentMatch', () => {
  it('returns "matched" when an exact national_id match exists, regardless of name matches', () => {
    const idMatch = makeCustomer();
    const result = resolveEmploymentMatch(idMatch, [makeCustomer({ id: 'cust-2' })]);
    assert.equal(result.kind, 'matched');
    if (result.kind === 'matched') {
      assert.equal(result.customer.id, 'cust-1');
    }
  });

  it('returns "not_found" when there is no national_id match and no name matches', () => {
    const result = resolveEmploymentMatch(null, []);
    assert.equal(result.kind, 'not_found');
  });

  it('returns "possible_match" (never auto-applied) for exactly one name-only match', () => {
    const candidate = makeCustomer({ id: 'cust-2', national_id: '999999999999' });
    const result = resolveEmploymentMatch(null, [candidate]);
    assert.equal(result.kind, 'possible_match');
    if (result.kind === 'possible_match') {
      assert.equal(result.candidates.length, 1);
      assert.equal(result.candidates[0].id, 'cust-2');
    }
  });

  it('returns "ambiguous" for multiple name-only matches', () => {
    const candidates = [
      makeCustomer({ id: 'cust-2', national_id: '111111111111' }),
      makeCustomer({ id: 'cust-3', national_id: '222222222222' }),
    ];
    const result = resolveEmploymentMatch(null, candidates);
    assert.equal(result.kind, 'ambiguous');
    if (result.kind === 'ambiguous') {
      assert.equal(result.candidates.length, 2);
    }
  });
});

describe('isSalaryMismatch', () => {
  it('returns false when either figure is missing (nothing to compare)', () => {
    assert.equal(isSalaryMismatch(null, 4500), false);
    assert.equal(isSalaryMismatch(4500, null), false);
    assert.equal(isSalaryMismatch(undefined, undefined), false);
  });

  it('returns false for a small difference within tolerance', () => {
    assert.equal(isSalaryMismatch(4600, 4500), false); // ~2.2% diff
  });

  it('returns true for a large difference beyond tolerance', () => {
    assert.equal(isSalaryMismatch(7000, 4500), true); // ~55% diff
  });

  it('treats the on-file salary as the baseline for the tolerance ratio', () => {
    // Exactly at the 15% default boundary should not trigger; just past it should.
    assert.equal(isSalaryMismatch(5174, 4500), false); // 14.98% diff
    assert.equal(isSalaryMismatch(5176, 4500), true); // 15.02% diff
  });

  it('treats any nonzero extracted salary as a mismatch when on-file salary is exactly zero', () => {
    assert.equal(isSalaryMismatch(100, 0), true);
    assert.equal(isSalaryMismatch(0, 0), false);
  });
});
