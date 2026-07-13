import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { classifyIntent, extractAccountNumbers } from '../chatIntent.ts';
import {
  recommendInstallmentTerm,
  computeAffordabilityHeadroom,
  monthlyObligationsFromExistingLoans,
  parseLoanAmountFromText,
  parseLoanTypeFromText,
  parseLoanCurrencyFromText,
  resolveAdvisoryInputs,
} from '../chatLoanAdvisory.ts';

describe('chatIntent', () => {
  test('classifies a pure policy question', () => {
    const r = classifyIntent('What are the conditions for obtaining a loan?');
    assert.equal(r.intent, 'policy');
    assert.equal(r.accountNumbers.length, 0);
  });

  test('classifies a customer-specific question with an account number', () => {
    const r = classifyIntent(
      'The customer with account number BOP-100011 wants to apply for a loan. What is the best number of years for installments based on his monthly salary and obligations?'
    );
    assert.equal(r.intent, 'customer');
    assert.deepEqual(r.accountNumbers, ['BOP-100011']);
    assert.ok(r.isAdvisory);
  });

  test('classifies a mixed policy + customer question as hybrid', () => {
    const r = classifyIntent(
      'According to bank policy, can customer BOP-100011 get a loan, and what term is most suitable?'
    );
    assert.equal(r.intent, 'hybrid');
    assert.deepEqual(r.accountNumbers, ['BOP-100011']);
  });

  test('classifies casual chat as general', () => {
    const r = classifyIntent('What is your name?');
    assert.equal(r.intent, 'general');
    assert.equal(r.accountNumbers.length, 0);
  });

  test('extracts multiple distinct account numbers', () => {
    const nums = extractAccountNumbers('Compare BOP-100011 and bop-100012 please');
    assert.deepEqual(nums, ['BOP-100011', 'BOP-100012']);
  });
});

describe('chatLoanAdvisory: recommendInstallmentTerm', () => {
  test('recommends the shortest affordable term for a comfortable salary', () => {
    const result = recommendInstallmentTerm({
      loanAmount: 15000,
      loanCurrency: 'ILS',
      loanType: 'personal',
      monthlySalary: 4500,
      monthlyObligations: monthlyObligationsFromExistingLoans(500),
    });
    assert.equal(result.status, 'ok');
    if (result.status === 'ok') {
      assert.ok(result.recommendedTermYears >= 1);
      assert.ok(result.recommended.debtBurdenRatio <= result.dbrCap);
    }
  });

  test('reports not_affordable when even the longest term breaches the DBR cap', () => {
    const result = recommendInstallmentTerm({
      loanAmount: 500000,
      loanCurrency: 'ILS',
      loanType: 'personal',
      monthlySalary: 2000,
      monthlyObligations: 1800, // already near the salary itself
      maxTermYears: 5,
    });
    assert.equal(result.status, 'not_affordable');
  });

  test('longer terms never increase the debt burden ratio (monotonic installment decrease)', () => {
    const result = recommendInstallmentTerm({
      loanAmount: 40000,
      loanCurrency: 'ILS',
      loanType: 'personal',
      monthlySalary: 6000,
      monthlyObligations: 200,
    });
    if (result.status === 'ok') {
      for (let i = 1; i < result.allOptions.length; i++) {
        assert.ok(result.allOptions[i].monthlyInstallment <= result.allOptions[i - 1].monthlyInstallment + 0.01);
      }
    }
  });

  test('age-at-maturity cap excludes otherwise-affordable long terms for an older applicant', () => {
    const result = recommendInstallmentTerm({
      loanAmount: 20000,
      loanCurrency: 'ILS',
      loanType: 'personal',
      monthlySalary: 9000,
      monthlyObligations: 0,
      clientAge: 68,
    });
    if (result.status === 'ok') {
      assert.ok(result.recommendedTermYears <= 2); // 68 + term <= 70
    }
  });
});

describe('chatLoanAdvisory: computeAffordabilityHeadroom', () => {
  test('flags a customer already over the DBR cap', () => {
    const headroom = computeAffordabilityHeadroom({ monthlySalary: 2000, monthlyObligations: 1200 });
    assert.ok(headroom.currentlyOverCap);
    assert.equal(headroom.maxAdditionalMonthlyInstallment, 0);
  });

  test('computes positive headroom for a customer well within the cap', () => {
    const headroom = computeAffordabilityHeadroom({ monthlySalary: 6000, monthlyObligations: 500 });
    assert.ok(!headroom.currentlyOverCap);
    assert.ok(headroom.maxAdditionalMonthlyInstallment > 0);
  });
});

describe('chatLoanAdvisory: text parsing', () => {
  test('parses a loan amount while ignoring an account number in the same text', () => {
    const amount = parseLoanAmountFromText('Customer BOP-100011 wants a 30000 ILS loan');
    assert.equal(amount, 30000);
  });

  test('returns null when no realistic amount is present', () => {
    assert.equal(parseLoanAmountFromText('Customer BOP-100011 wants a loan'), null);
  });

  test('parses loan type keywords', () => {
    assert.equal(parseLoanTypeFromText('he wants a mortgage'), 'mortgage_program');
    assert.equal(parseLoanTypeFromText('a home loan please'), 'personal_housing');
    assert.equal(parseLoanTypeFromText('no signal here'), null);
  });

  test('parses currency keywords', () => {
    assert.equal(parseLoanCurrencyFromText('30000 USD'), 'USD');
    assert.equal(parseLoanCurrencyFromText('no currency mentioned'), null);
  });

  test('resolveAdvisoryInputs falls back to the on-file loan amount when none is given', () => {
    const resolved = resolveAdvisoryInputs('what term is best for him?', { loan_amount: 15000 });
    assert.equal(resolved.loanAmount, 15000);
    assert.equal(resolved.loanAmountSource, 'on_file');
    assert.equal(resolved.missingRequired.length, 0);
  });

  test('resolveAdvisoryInputs reports missing when there is no amount anywhere', () => {
    const resolved = resolveAdvisoryInputs('what term is best for him?', { loan_amount: 0 });
    assert.equal(resolved.loanAmountSource, 'missing');
    assert.deepEqual(resolved.missingRequired, ['loanAmount']);
  });
});
