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
import {
  resolveFinalSource,
  formatSourceLabel,
  buildAdvisoryResult,
  deterministicAnswer,
  toFoundCustomerContext,
  toNotFoundCustomerContext,
  inheritAccountNumberFromHistory,
  type AnswerSource,
} from '../chatAnswerComposition.ts';
import type { BankCustomerRecord } from '../bankCustomers.ts';

function makeCustomer(overrides: Partial<BankCustomerRecord> = {}): BankCustomerRecord {
  return {
    id: 'test-id',
    account_number: 'BOP-100011',
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
    created_at: '2026-07-01T00:00:00Z',
    ...overrides,
  };
}

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

  test('classifies an installment-term question phrased differently as advisory + term-seeking', () => {
    const r = classifyIntent('Customer BOP-100011 wants to apply for a loan. What is the best installment term?');
    assert.equal(r.intent, 'customer');
    assert.ok(r.isAdvisory);
    assert.ok(r.seeksSpecificTerm);
  });

  test('classifies a qualification question as advisory but NOT term-seeking', () => {
    const r = classifyIntent('Does this customer likely qualify for a personal loan?');
    assert.ok(r.isAdvisory);
    assert.equal(r.seeksSpecificTerm, false);
  });

  describe('greeting detection (EN/AR)', () => {
    for (const phrase of ['Hello', 'hi', 'Hey there', 'Good morning', 'How are you?', "What's up"]) {
      test(`"${phrase}" -> greeting`, () => {
        assert.equal(classifyIntent(phrase).intent, 'greeting');
      });
    }
    for (const phrase of ['مرحبا', 'السلام عليكم', 'كيف حالك', 'صباح الخير']) {
      test(`"${phrase}" -> greeting`, () => {
        assert.equal(classifyIntent(phrase).intent, 'greeting');
      });
    }
  });

  describe('capability detection (EN/AR)', () => {
    for (const phrase of ['What can you do?', 'What can I ask you about?', 'Who are you?', 'Can you help me?']) {
      test(`"${phrase}" -> capability`, () => {
        assert.equal(classifyIntent(phrase).intent, 'capability');
      });
    }
    for (const phrase of ['ماذا يمكنك أن تفعل', 'من أنت', 'هل يمكنك مساعدتي']) {
      test(`"${phrase}" -> capability`, () => {
        assert.equal(classifyIntent(phrase).intent, 'capability');
      });
    }
  });

  test('a real banking question wins over an incidental greeting in the same message', () => {
    const r = classifyIntent('Hi, what are the conditions for obtaining a loan?');
    assert.equal(r.intent, 'policy');
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

describe('chatAnswerComposition: resolveFinalSource', () => {
  test('forces "not_found" whenever the customer lookup came up empty, regardless of the raw source', () => {
    const notFoundCtx = { found: false as const, reason: 'not_found' as const, accountNumber: 'BOP-999999' };
    assert.equal(resolveFinalSource('database', notFoundCtx, null), 'not_found');
    assert.equal(resolveFinalSource('both', notFoundCtx, null), 'not_found');
    assert.equal(resolveFinalSource('general', notFoundCtx, null), 'not_found');
  });

  test('forces "clarification" whenever the advisory result is missing_inputs, regardless of the raw source', () => {
    const missingInputs = { kind: 'missing_inputs' as const, missing: ['loanAmount'] };
    assert.equal(resolveFinalSource('database', null, missingInputs), 'clarification');
    assert.equal(resolveFinalSource('both', null, missingInputs), 'clarification');
  });

  test('passes the raw source through when nothing overrides it', () => {
    assert.equal(resolveFinalSource('file', null, null), 'file');
    assert.equal(resolveFinalSource('both', { found: true } as never, null), 'both');
  });
});

describe('chatAnswerComposition: formatSourceLabel', () => {
  const sources: AnswerSource[] = ['file', 'database', 'both', 'general', 'clarification', 'not_found', 'unavailable'];
  for (const source of sources) {
    test(`has a non-empty EN and AR label for "${source}"`, () => {
      assert.ok(formatSourceLabel(source, 'en').length > 0);
      assert.ok(formatSourceLabel(source, 'ar').length > 0);
    });
  }
});

describe('chatAnswerComposition: buildAdvisoryResult', () => {
  test('asks for the loan amount when the question wants a specific term and none is available anywhere', () => {
    const customer = makeCustomer({ loan_amount: 0 });
    const result = buildAdvisoryResult(customer, 'What is the best installment term for this loan?', true);
    assert.equal(result.kind, 'missing_inputs');
  });

  test('gives a qualitative affordability summary (not a clarification) for a general qualification question with no amount', () => {
    const customer = makeCustomer({ loan_amount: 0 });
    const result = buildAdvisoryResult(customer, 'Does this customer likely qualify for a personal loan?', false);
    assert.equal(result.kind, 'affordability_headroom');
  });

  test('computes a real term recommendation when the on-file loan amount is available', () => {
    const customer = makeCustomer({ loan_amount: 15000 });
    const result = buildAdvisoryResult(customer, 'What is the best installment term?', true);
    assert.equal(result.kind, 'term_recommendation');
    if (result.kind === 'term_recommendation' && result.status === 'ok') {
      assert.equal(result.loanAmountSource, 'on_file');
    }
  });

  test('uses a loan amount stated in the question over the on-file amount', () => {
    const customer = makeCustomer({ loan_amount: 15000 });
    const result = buildAdvisoryResult(customer, 'What term is best for a 40000 ILS loan?', true);
    assert.equal(result.kind, 'term_recommendation');
    if (result.kind === 'term_recommendation') {
      assert.equal(result.loanAmount, 40000);
      assert.equal(result.loanAmountSource, 'query');
    }
  });
});

describe('chatAnswerComposition: deterministicAnswer (AI-unavailable fallback)', () => {
  const base = { policyChunks: [], customer: null, customerContext: null, advisory: null, citations: [] };

  test('greeting intent gets a real natural-language greeting, not an "unavailable" message', () => {
    const result = deterministicAnswer({ ...base, language: 'en', intent: 'greeting' });
    assert.equal(result.source, 'general');
    assert.ok(result.answer.length > 0);
    assert.doesNotMatch(result.answer, /couldn't reach/i);
  });

  test('capability intent gets the real capability description', () => {
    const result = deterministicAnswer({ ...base, language: 'en', intent: 'capability' });
    assert.equal(result.source, 'general');
    assert.match(result.answer, /policy/i);
  });

  test('greeting fallback is bilingual', () => {
    const result = deterministicAnswer({ ...base, language: 'ar', intent: 'greeting' });
    assert.match(result.answer, /مساعد/);
  });

  test('plain general chat with nothing retrievable reports "unavailable", not a fabricated answer', () => {
    const result = deterministicAnswer({ ...base, language: 'en', intent: 'general' });
    assert.equal(result.source, 'unavailable');
  });

  test('policy chunks only -> source "file"', () => {
    const chunk = {
      fileName: 'loan-policy.md',
      sectionTitleEn: 'Eligibility',
      sectionTitleAr: 'الأهلية',
      textEn: 'Applicants must be 18 or older.',
      textAr: 'يجب أن يكون المتقدم 18 عامًا أو أكثر.',
    };
    const result = deterministicAnswer({ ...base, language: 'en', intent: 'policy', policyChunks: [chunk] });
    assert.equal(result.source, 'file');
    assert.match(result.answer, /Eligibility/);
  });

  test('found customer only (no policy, no advisory) -> source "database"', () => {
    const customer = makeCustomer();
    const customerContext = toFoundCustomerContext(customer, []);
    const result = deterministicAnswer({ ...base, language: 'en', intent: 'customer', customer, customerContext });
    assert.equal(result.source, 'database');
    assert.match(result.answer, /Ahmad Khalil Nasser/);
  });

  test('policy + found customer together -> source "both"', () => {
    const chunk = {
      fileName: 'loan-policy.md',
      sectionTitleEn: 'Eligibility',
      sectionTitleAr: 'الأهلية',
      textEn: 'Applicants must be 18 or older.',
      textAr: 'يجب أن يكون المتقدم 18 عامًا أو أكثر.',
    };
    const customer = makeCustomer();
    const customerContext = toFoundCustomerContext(customer, []);
    const result = deterministicAnswer({
      ...base,
      language: 'en',
      intent: 'hybrid',
      policyChunks: [chunk],
      customer,
      customerContext,
    });
    assert.equal(result.source, 'both');
  });

  test('customer not found -> source forced to "not_found", never a fabricated answer', () => {
    const outcome = { status: 'not_found' as const, accountNumber: 'BOP-999999' };
    const customerContext = toNotFoundCustomerContext(outcome);
    const result = deterministicAnswer({ ...base, language: 'en', intent: 'customer', customerContext });
    assert.equal(result.source, 'not_found');
    assert.match(result.answer, /couldn't find/i);
    // The only number present must be the account number the user themselves
    // asked about — never a fabricated salary/balance/other figure.
    assert.match(result.answer, /BOP-999999/);
    assert.doesNotMatch(result.answer.replace('BOP-999999', ''), /\d{3,}/);
  });

  test('ambiguous account numbers -> asks which one, source "not_found"', () => {
    const outcome = { status: 'ambiguous' as const, accountNumbers: ['BOP-100011', 'BOP-100012'] };
    const customerContext = toNotFoundCustomerContext(outcome);
    const result = deterministicAnswer({ ...base, language: 'en', intent: 'customer', customerContext });
    assert.equal(result.source, 'not_found');
    assert.match(result.answer, /BOP-100011/);
    assert.match(result.answer, /BOP-100012/);
  });

  test('missing_inputs advisory -> source "clarification"', () => {
    const customer = makeCustomer({ loan_amount: 0 });
    const customerContext = toFoundCustomerContext(customer, []);
    const advisory = { kind: 'missing_inputs' as const, missing: ['loanAmount'] };
    const result = deterministicAnswer({
      ...base,
      language: 'en',
      intent: 'customer',
      customer,
      customerContext,
      advisory,
    });
    assert.equal(result.source, 'clarification');
  });
});

describe('chatAnswerComposition: inheritAccountNumberFromHistory', () => {
  test('finds the account number from the most recent user turn that mentioned exactly one', () => {
    const history = [
      { role: 'user' as const, content: 'What is the salary of customer BOP-100011?' },
      { role: 'assistant' as const, content: 'The monthly salary is 4500.' },
    ];
    assert.deepEqual(inheritAccountNumberFromHistory(history), ['BOP-100011']);
  });

  test('ignores a prior turn that mentioned more than one account number (too ambiguous to guess)', () => {
    const history = [{ role: 'user' as const, content: 'Compare BOP-100011 and BOP-100012' }];
    assert.deepEqual(inheritAccountNumberFromHistory(history), []);
  });

  test('returns empty when there is no history', () => {
    assert.deepEqual(inheritAccountNumberFromHistory(undefined), []);
  });
});
