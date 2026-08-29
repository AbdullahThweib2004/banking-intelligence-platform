/**
 * AI assistant grounding tests — the six suggested questions, exact
 * account-number extraction, structured customer answers, the deterministic
 * affordability paths, and the composition invariants that keep the assistant
 * from claiming a source it does not have.
 *
 * Run with: npm test (node --test)
 *
 * Deliberately imports ONLY Supabase-free modules. rag.ts is excluded because
 * it uses Vite's `?raw` markdown imports, which Node cannot resolve; policy
 * RETRIEVAL is therefore covered at the routing level (does this question
 * trigger policy retrieval at all) rather than by running the retriever.
 *
 * No OpenRouter call is made anywhere in this file.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { classifyIntent, extractAccountNumbers } from '../chatIntent.ts';
import {
  parseLoanAmountFromText,
  parseTermYearsFromText,
  parseLoanCurrencyFromText,
  monthlyObligationsFromExistingLoans,
} from '../chatLoanAdvisory.ts';
import {
  buildAdvisoryResult,
  buildStructuredCustomerAnswer,
  buildCustomerFinancialBlock,
  buildNotFoundAnswer,
  deterministicAnswer,
  resolveFinalSource,
  formatSourceLabel,
} from '../chatAnswerComposition.ts';
import type { BankCustomerRecord } from '../bankCustomers.ts';

// The six suggested questions, mirrored from src/components/SuggestedQuestions.tsx.
const SUGGESTED_AR = [
  'ما هي المستندات المطلوبة للحصول على قرض شخصي؟',
  'ما هي مراحل الموافقة على طلب القرض؟',
  'هل يستطيع العميل BOP-100001 الحصول على قرض بقيمة 20,000 شيكل لمدة 5 سنوات؟',
];
const SUGGESTED_EN = [
  'What documents are required for a personal loan?',
  'What are the loan approval stages?',
  'Can customer BOP-100001 afford a loan of 20,000 ILS over 5 years?',
];

/** Matches the BOP-100001 demo seed row (20260621100000_bank_customers.sql). */
const CUSTOMER: BankCustomerRecord = {
  id: 'test-id',
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
  financial_profile_source: 'unknown',
  salary_currency: 'ILS',
  job_role: null,
  created_at: '2026-01-01T00:00:00Z',
};

const withIncome = (income: number, loanAmount = 0): BankCustomerRecord => ({
  ...CUSTOMER,
  monthly_income: income,
  loan_amount: loanAmount,
});

// ---------------------------------------------------------------------------
describe('assistant — the six suggested questions route to a grounded source', () => {
  it('AR-1 / EN-1 (required documents) classify as policy and trigger policy retrieval', () => {
    for (const q of [SUGGESTED_AR[0], SUGGESTED_EN[0]]) {
      const r = classifyIntent(q);
      assert.equal(r.intent, 'policy', `"${q}" must be a policy question`);
      assert.equal(r.hasPolicySignal, true);
      assert.equal(r.hasPolicySignal || r.hasCustomerSignal, true, 'policy retrieval must run');
    }
  });

  it('AR-2 / EN-2 (approval stages) classify as policy and trigger policy retrieval', () => {
    for (const q of [SUGGESTED_AR[1], SUGGESTED_EN[1]]) {
      const r = classifyIntent(q);
      assert.equal(r.intent, 'policy', `"${q}" must be a policy question`);
      assert.equal(r.hasPolicySignal, true);
    }
  });

  it('AR-3 / EN-3 (affordability) classify as customer, extract the account, and are advisory', () => {
    for (const q of [SUGGESTED_AR[2], SUGGESTED_EN[2]]) {
      const r = classifyIntent(q);
      assert.equal(r.intent, 'customer', `"${q}" must be a customer question`);
      assert.equal(r.hasCustomerSignal, true);
      assert.equal(r.isAdvisory, true, 'must trigger the deterministic calculation');
      assert.deepEqual(r.accountNumbers, ['BOP-100001']);
    }
  });

  it('every suggested question reaches a grounded path — none falls through to "general"', () => {
    for (const q of [...SUGGESTED_AR, ...SUGGESTED_EN]) {
      const r = classifyIntent(q);
      assert.notEqual(r.intent, 'general', `"${q}" must not fall through to a general answer`);
    }
  });

  it('the Arabic and English halves of each pair follow the same intent path', () => {
    for (let i = 0; i < 3; i++) {
      assert.equal(
        classifyIntent(SUGGESTED_AR[i]).intent,
        classifyIntent(SUGGESTED_EN[i]).intent,
        `pair ${i + 1} must classify identically in both languages`
      );
    }
  });

  it('REGRESSION: the Arabic definite article no longer breaks keyword matching', () => {
    // "المستندات المطلوبة" previously failed to match the signal
    // "مستندات مطلوبة" because of the "ال" prefix, so the question classified
    // as 'general' and policy retrieval never ran.
    assert.equal(classifyIntent('ما هي المستندات المطلوبة؟').hasPolicySignal, true);
    assert.equal(classifyIntent('ما هي مستندات مطلوبة؟').hasPolicySignal, true);
  });

  it('REGRESSION: "can X get a loan" phrasing now triggers the deterministic calculation', () => {
    // Previously isAdvisory was false for this phrasing, so no affordability
    // calculation ran and the model received facts with no figures.
    for (const q of [
      'Can customer BOP-100001 get a loan?',
      'Can BOP-100001 obtain a loan?',
      'هل العميل BOP-100001 يستطيع الحصول على قرض؟',
      'هل يمكنه الحصول على قرض؟',
    ]) {
      assert.equal(classifyIntent(q).isAdvisory, true, `"${q}" must be advisory`);
    }
  });
});

// ---------------------------------------------------------------------------
describe('assistant — exact account-number extraction', () => {
  it('extracts a valid BOP account number', () => {
    assert.deepEqual(extractAccountNumbers('Tell me about BOP-100001'), ['BOP-100001']);
  });

  it('normalizes lowercase input to the canonical upper-case form', () => {
    assert.deepEqual(extractAccountNumbers('summary for bop-100001'), ['BOP-100001']);
  });

  it('returns nothing when no account number is present', () => {
    assert.deepEqual(extractAccountNumbers('What is the maximum debt burden ratio?'), []);
  });

  it('returns every distinct account number when several are mentioned', () => {
    assert.deepEqual(
      extractAccountNumbers('compare BOP-100001 and BOP-100002'),
      ['BOP-100001', 'BOP-100002']
    );
  });

  it('deduplicates a repeated account number', () => {
    assert.deepEqual(extractAccountNumbers('BOP-100001 and again BOP-100001'), ['BOP-100001']);
  });

  it('ignores malformed account-like strings', () => {
    assert.deepEqual(extractAccountNumbers('account BOP- or ABC-100001 or BOP100001'), []);
  });

  it('never performs a name-based lookup — a bare name yields no identifier', () => {
    const r = classifyIntent('Tell me about Ahmad Khalil Nasser');
    assert.deepEqual(r.accountNumbers, []);
  });
});

// ---------------------------------------------------------------------------
describe('assistant — loan amount / term / currency parsing', () => {
  it('parses a comma-grouped amount and ignores the account number digits', () => {
    assert.equal(parseLoanAmountFromText('BOP-100001 loan of 20,000 ILS'), 20000);
  });

  it('parses a plain 4+ digit amount', () => {
    assert.equal(parseLoanAmountFromText('a loan of 20000'), 20000);
  });

  it('returns null when no amount is stated', () => {
    assert.equal(parseLoanAmountFromText('Can BOP-100001 get a loan?'), null);
  });

  it('parses the repayment term in both languages', () => {
    assert.equal(parseTermYearsFromText('over 5 years'), 5);
    assert.equal(parseTermYearsFromText('لمدة 5 سنوات'), 5);
    assert.equal(parseTermYearsFromText('for 10 yrs'), 10);
  });

  it('rejects an out-of-range term and returns null when absent', () => {
    assert.equal(parseTermYearsFromText('over 99 years'), null);
    assert.equal(parseTermYearsFromText('no term here'), null);
  });

  it('parses currency in both languages', () => {
    assert.equal(parseLoanCurrencyFromText('20,000 ILS'), 'ILS');
    assert.equal(parseLoanCurrencyFromText('20,000 شيكل'), 'ILS');
    assert.equal(parseLoanCurrencyFromText('5000 dollars'), 'USD');
  });
});

// ---------------------------------------------------------------------------
describe('assistant — structured customer financial summary', () => {
  // NOTE: the shipped suggested question uses 20,000 ILS, which is BELOW the
  // bank-wide minimum of 8,000 USD (= 28,800 ILS via the configured FX table
  // in loanProducts.ts). The engine correctly refuses to compute a term for
  // it — see the dedicated test below. A figure above the minimum is used
  // here so the full calculated path is exercised.
  const ABOVE_MINIMUM_QUERY = 'Can customer BOP-100001 afford a loan of 30,000 ILS over 5 years?';
  const advisory = buildAdvisoryResult(CUSTOMER, ABOVE_MINIMUM_QUERY, false);

  it('an above-minimum affordability question produces a completed calculation', () => {
    assert.equal(advisory.kind, 'term_recommendation');
    if (advisory.kind !== 'term_recommendation') return;
    assert.equal(advisory.status, 'ok');
  });

  it('DOCUMENTED: the shipped 20,000 ILS suggestion is below the bank minimum', () => {
    // Not a defect in the engine — 20,000 ILS < 28,800 ILS minimum. The
    // assistant answers truthfully by stating the minimum instead of
    // computing a term for an amount that could never be approved.
    const shipped = buildAdvisoryResult(CUSTOMER, SUGGESTED_EN[2], false);
    assert.equal(shipped.kind, 'below_minimum');
    if (shipped.kind !== 'below_minimum') return;
    assert.equal(shipped.loanAmount, 20000);
    assert.ok(shipped.minimumRequired > 20000);
  });

  it('renders every required section in English', () => {
    const out = buildStructuredCustomerAnswer({
      customer: CUSTOMER, advisory, language: 'en', requestedTermYears: 5,
    });
    for (const heading of [
      'Customer Financial Summary', 'Deterministic Loan Assessment', 'Conclusion', 'Source',
    ]) {
      assert.ok(out.includes(heading), `missing section: ${heading}`);
    }
    assert.ok(out.includes('BOP-100001'));
    assert.ok(out.includes('Requested term: 5 years'));
    assert.ok(out.includes('Debt burden ratio (DBR)'));
    assert.ok(out.includes('Deterministic Loan Calculator'));
  });

  it('renders every required section in Arabic', () => {
    const out = buildStructuredCustomerAnswer({
      customer: CUSTOMER, advisory, language: 'ar', requestedTermYears: 5,
    });
    for (const heading of ['الملخص المالي للعميل', 'التقييم الحسابي للقرض', 'الخلاصة', 'المصدر']) {
      assert.ok(out.includes(heading), `missing Arabic section: ${heading}`);
    }
    assert.ok(out.includes('BOP-100001'));
    assert.ok(!/Customer Financial Summary|Conclusion/.test(out), 'must not leak English headings');
  });

  it('always states that final approval follows the four-stage workflow', () => {
    for (const lang of ['en', 'ar'] as const) {
      const out = buildStructuredCustomerAnswer({ customer: CUSTOMER, advisory, language: lang });
      assert.ok(
        /four-stage|المراحل الأربع/.test(out),
        'the approval-workflow caveat must always be present'
      );
    }
  });

  it('reports only figures present in the record — no invented fields', () => {
    const block = buildCustomerFinancialBlock(CUSTOMER, 'en');
    assert.ok(block.includes('4,500'), 'monthly income from the record');
    assert.ok(block.includes('employed'), 'employment type from the record');
    // existing_loans 500 -> obligations 500/12 = 41.67, rendered rounded.
    assert.ok(
      block.includes(String(Math.round(monthlyObligationsFromExistingLoans(500)))),
      'obligations must be derived, not invented'
    );
  });

  it('surfaces a loan restriction when the record carries one', () => {
    const restricted = { ...CUSTOMER, loan_restricted: true, restriction_reason: 'Restricted — contact manager.' };
    const block = buildCustomerFinancialBlock(restricted, 'en');
    assert.ok(block.includes('Restricted — contact manager.'));
  });
});

// ---------------------------------------------------------------------------
describe('assistant — missing inputs are asked for, never assumed', () => {
  // No amount in the query AND none on file, and the question wants a term.
  const noAmountCustomer = withIncome(4500, 0);
  const advisory = buildAdvisoryResult(noAmountCustomer, 'What is the best term for BOP-100001?', true);

  it('produces a missing_inputs advisory rather than guessing an amount', () => {
    assert.equal(advisory.kind, 'missing_inputs');
    if (advisory.kind !== 'missing_inputs') return;
    assert.ok(advisory.missing.includes('loanAmount'));
  });

  it('renders an Information Needed + Next Step block in both languages', () => {
    const en = buildStructuredCustomerAnswer({ customer: noAmountCustomer, advisory, language: 'en' });
    assert.ok(en.includes('Information Needed'));
    assert.ok(en.includes('Requested loan amount'));
    assert.ok(en.includes('Repayment term'));
    assert.ok(en.includes('Next Step'));

    const ar = buildStructuredCustomerAnswer({ customer: noAmountCustomer, advisory, language: 'ar' });
    assert.ok(ar.includes('معلومات مطلوبة'));
    assert.ok(ar.includes('مبلغ القرض المطلوب'));
    assert.ok(ar.includes('الخطوة التالية'));
  });

  it('a missing-input answer never claims the loan calculator was used', () => {
    const en = buildStructuredCustomerAnswer({ customer: noAmountCustomer, advisory, language: 'en' });
    assert.ok(!en.includes('Deterministic Loan Calculator'), 'no calculation ran, so it must not be cited');
  });

  it('missing inputs force the final source to "clarification"', () => {
    assert.equal(resolveFinalSource('database', null, advisory), 'clarification');
  });
});

// ---------------------------------------------------------------------------
describe('assistant — not-eligible explanation states the actual rule failure', () => {
  // Very low income against a large amount -> DBR cannot be satisfied at any term.
  const poorCustomer = withIncome(1200, 0);
  const advisory = buildAdvisoryResult(poorCustomer, 'Can BOP-100001 afford a loan of 200,000 ILS?', false);

  it('the deterministic engine reports not_affordable', () => {
    assert.equal(advisory.kind, 'term_recommendation');
    if (advisory.kind !== 'term_recommendation') return;
    assert.equal(advisory.status, 'not_affordable');
  });

  it('explains the DBR failure with the real numbers and the cap', () => {
    const out = buildStructuredCustomerAnswer({ customer: poorCustomer, advisory, language: 'en' });
    assert.ok(out.includes('Not eligible for this scenario'));
    assert.ok(out.includes('50.0%'), 'must name the actual DBR cap');
    assert.ok(out.includes('exceeds'), 'must state which rule failed');
  });

  it('includes the documented-override note, and never says "definitely rejected"', () => {
    for (const lang of ['en', 'ar'] as const) {
      const out = buildStructuredCustomerAnswer({ customer: poorCustomer, advisory, language: lang });
      assert.ok(/documented reason|سبباً موثقاً/.test(out), 'override note required');
      assert.ok(!/definitely rejected|مرفوض نهائ/i.test(out), 'must not assert a final rejection');
    }
  });
});

// ---------------------------------------------------------------------------
describe('assistant — customer not found', () => {
  it('states no record was found and asks the user to verify, in both languages', () => {
    const ctx = { found: false as const, reason: 'not_found' as const, accountNumber: 'BOP-999999' };
    const en = buildNotFoundAnswer(ctx, 'en');
    assert.ok(en.includes('No customer record was found'));
    assert.ok(en.includes('BOP-999999'));
    assert.ok(en.includes('verify'));

    const ar = buildNotFoundAnswer(ctx, 'ar');
    assert.ok(ar.includes('لم يتم العثور'));
    assert.ok(ar.includes('BOP-999999'));
  });

  it('a failed lookup always overrides the reported source to not_found', () => {
    const ctx = { found: false as const, reason: 'not_found' as const, accountNumber: 'BOP-999999' };
    assert.equal(resolveFinalSource('database', ctx, null), 'not_found');
    // Even if the model wrongly claims it used a policy file.
    assert.equal(resolveFinalSource('file', ctx, null), 'not_found');
  });

  it('asks which account when several were mentioned', () => {
    const ctx = { found: false as const, reason: 'ambiguous' as const, accountNumbers: ['BOP-100001', 'BOP-100002'] };
    assert.ok(buildNotFoundAnswer(ctx, 'en').includes('BOP-100001'));
    assert.ok(buildNotFoundAnswer(ctx, 'ar').includes('BOP-100002'));
  });
});

// ---------------------------------------------------------------------------
describe('assistant — deterministic fallback (OpenRouter unavailable)', () => {
  const base = {
    intent: 'customer' as const,
    policyChunks: [],
    customerContext: null,
    citations: [],
  };

  it('customer fallback returns the full structured briefing, not a field dump', () => {
    const advisory = buildAdvisoryResult(CUSTOMER, 'loan of 30,000 ILS for BOP-100001', false);
    const r = deterministicAnswer({
      ...base, language: 'en', customer: CUSTOMER, advisory, requestedTermYears: 5,
    });
    assert.equal(r.source, 'database');
    assert.equal(r.foundCustomer, true);
    assert.ok(r.answer.includes('Customer Financial Summary'));
    assert.ok(r.answer.includes('Deterministic Loan Assessment'));
    assert.ok(r.answer.includes('Conclusion'));
  });

  it('Arabic customer fallback answers in Arabic', () => {
    const advisory = buildAdvisoryResult(CUSTOMER, 'قرض بقيمة 30,000 شيكل للعميل BOP-100001', false);
    const r = deterministicAnswer({ ...base, language: 'ar', customer: CUSTOMER, advisory });
    assert.ok(r.answer.includes('الملخص المالي للعميل'));
  });

  it('not-found fallback never claims a customer was found', () => {
    const ctx = { found: false as const, reason: 'not_found' as const, accountNumber: 'BOP-999999' };
    const r = deterministicAnswer({
      ...base, language: 'en', customer: null, customerContext: ctx, advisory: null,
    });
    assert.equal(r.source, 'not_found');
    assert.equal(r.foundCustomer, false);
    assert.equal(r.customerNotFound, true);
    assert.ok(r.answer.includes('No customer record was found'));
  });

  it('greeting and capability still answer deterministically', () => {
    for (const intent of ['greeting', 'capability'] as const) {
      const r = deterministicAnswer({
        ...base, intent, language: 'en', customer: null, advisory: null,
      });
      assert.equal(r.source, 'general');
      assert.ok(r.answer.length > 0);
      assert.deepEqual(r.citations, [], 'a general answer must carry no citations');
    }
  });
});

// ---------------------------------------------------------------------------
describe('assistant — composition invariants', () => {
  it('a general answer carries no policy citations', () => {
    const r = deterministicAnswer({
      intent: 'greeting', language: 'en', policyChunks: [], customer: null,
      customerContext: null, advisory: null,
      citations: [{ fileName: 'loan-policy.md', sectionTitle: 'Overview' }],
    });
    assert.deepEqual(r.citations, [], 'citations must be dropped when no source was used');
  });

  it('source labels are localized for every source type', () => {
    for (const s of ['file', 'database', 'both', 'general', 'clarification', 'not_found', 'unavailable'] as const) {
      assert.ok(formatSourceLabel(s, 'en').length > 0);
      assert.ok(formatSourceLabel(s, 'ar').length > 0);
      assert.notEqual(formatSourceLabel(s, 'en'), formatSourceLabel(s, 'ar'));
    }
  });

  it('the structured summary reproduces the engine figures exactly — AI cannot restate them', () => {
    const advisory = buildAdvisoryResult(CUSTOMER, 'loan of 30,000 ILS for BOP-100001', false);
    assert.equal(advisory.kind, 'term_recommendation');
    if (advisory.kind !== 'term_recommendation' || advisory.status !== 'ok') return;

    const out = buildStructuredCustomerAnswer({ customer: CUSTOMER, advisory, language: 'en' });
    const installment = advisory.monthlyInstallment.toLocaleString(undefined, { maximumFractionDigits: 0 });
    assert.ok(out.includes(installment), 'installment must appear exactly as the engine produced it');
    assert.ok(out.includes(`${advisory.recommendedTermYears} years`));
    assert.ok(out.includes(`${(advisory.debtBurdenRatio * 100).toFixed(1)}%`));
  });

  it('an on-file amount below the bank minimum is refused, not silently computed', () => {
    const tiny = withIncome(9000, 500); // 500 ILS is far below the 8,000 USD equivalent
    const advisory = buildAdvisoryResult(tiny, 'Can BOP-100001 get a loan?', false);
    assert.equal(advisory.kind, 'below_minimum');
    const out = buildStructuredCustomerAnswer({ customer: tiny, advisory, language: 'en' });
    assert.ok(out.includes('Below the minimum'));
    assert.equal(resolveFinalSource('database', null, advisory), 'clarification');
  });
});
