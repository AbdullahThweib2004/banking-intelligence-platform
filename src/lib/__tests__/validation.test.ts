/**
 * Tests for the QA-hardening validation module (src/lib/validation.ts).
 * Covers every rule added during the input-validation audit: name/notes
 * length caps, national ID format, non-negative amounts, the loan-amount
 * minimum (currency-aware), age/date-of-birth plausibility, loan-applicant
 * age and term (centralized from CreditRisk.tsx's pre-existing rules), email
 * format, and the objection/modification field-value dispatch.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  validateName,
  validateNotes,
  validateNationalId,
  validateNonNegativeAmount,
  validateLoanAmount,
  validateAge,
  validateDateOfBirth,
  validateLoanApplicantAge,
  validateLoanTermYears,
  validateEmail,
  validateObjectionFieldValue,
  MAX_NAME_LENGTH,
  MAX_NATIONAL_ID_LENGTH,
  MIN_NATIONAL_ID_LENGTH,
  MAX_REALISTIC_AGE,
  MIN_LOAN_APPLICANT_AGE,
  MAX_LOAN_APPLICANT_AGE,
} from '../validation.ts';
import { getMinimumLoanAmount, MIN_LOAN_AMOUNT_USD } from '../loanProducts.ts';

describe('validateName', () => {
  it('rejects an empty name when required', () => {
    assert.equal(validateName('').valid, false);
  });

  it('accepts an empty name when not required', () => {
    assert.equal(validateName('', { required: false }).valid, true);
  });

  it('accepts a name at exactly the 250-character limit', () => {
    const name = 'A'.repeat(MAX_NAME_LENGTH);
    assert.equal(validateName(name).valid, true);
  });

  it('rejects a name of 251 characters', () => {
    const name = 'A'.repeat(MAX_NAME_LENGTH + 1);
    const result = validateName(name);
    assert.equal(result.valid, false);
    assert.match(result.message!.en, /250/);
  });

  it('trims leading/trailing whitespace before checking length and emptiness', () => {
    assert.equal(validateName('   ').valid, false); // whitespace-only counts as empty
    assert.equal(validateName('  Ahmad  ').valid, true);
  });
});

describe('validateNotes', () => {
  it('is optional by default', () => {
    assert.equal(validateNotes('').valid, true);
  });

  it('rejects text beyond the configured max length', () => {
    const text = 'x'.repeat(1001);
    assert.equal(validateNotes(text).valid, false);
  });

  it('accepts text at exactly the max length', () => {
    const text = 'x'.repeat(1000);
    assert.equal(validateNotes(text).valid, true);
  });
});

describe('validateNationalId', () => {
  it('rejects empty when required', () => {
    assert.equal(validateNationalId('').valid, false);
  });

  it('accepts empty when not required', () => {
    assert.equal(validateNationalId('', { required: false }).valid, true);
  });

  it('rejects non-digit characters', () => {
    const result = validateNationalId('40215678901A');
    assert.equal(result.valid, false);
    assert.match(result.message!.en, /digits/i);
  });

  it('rejects an ID shorter than the minimum length', () => {
    assert.equal(validateNationalId('123').valid, false);
  });

  it(`accepts an ID at exactly the minimum length (${MIN_NATIONAL_ID_LENGTH})`, () => {
    assert.equal(validateNationalId('1'.repeat(MIN_NATIONAL_ID_LENGTH)).valid, true);
  });

  it(`accepts an ID at exactly the maximum length (${MAX_NATIONAL_ID_LENGTH})`, () => {
    assert.equal(validateNationalId('1'.repeat(MAX_NATIONAL_ID_LENGTH)).valid, true);
  });

  it('rejects an ID longer than the maximum length', () => {
    assert.equal(validateNationalId('1'.repeat(MAX_NATIONAL_ID_LENGTH + 1)).valid, false);
  });

  it('accepts the real seed-data format (12 digits)', () => {
    assert.equal(validateNationalId('402156789012').valid, true);
  });
});

describe('validateNonNegativeAmount', () => {
  const label = { en: 'Monthly income', ar: 'الدخل الشهري' };

  it('rejects a negative amount', () => {
    const result = validateNonNegativeAmount(-500, label);
    assert.equal(result.valid, false);
    assert.match(result.message!.en, /negative/i);
  });

  it('accepts zero', () => {
    assert.equal(validateNonNegativeAmount(0, label).valid, true);
  });

  it('accepts a positive amount', () => {
    assert.equal(validateNonNegativeAmount(4500, label).valid, true);
  });

  it('rejects NaN', () => {
    assert.equal(validateNonNegativeAmount(Number('not a number'), label).valid, false);
  });
});

describe('validateLoanAmount — minimum 8,000 USD or currency equivalent', () => {
  it('rejects zero and negative amounts regardless of currency', () => {
    assert.equal(validateLoanAmount(0, 'ILS').valid, false);
    assert.equal(validateLoanAmount(-1000, 'USD').valid, false);
  });

  it('rejects an amount below the USD minimum', () => {
    assert.equal(validateLoanAmount(7999, 'USD').valid, false);
  });

  it('accepts an amount at exactly the USD minimum (boundary)', () => {
    assert.equal(validateLoanAmount(MIN_LOAN_AMOUNT_USD, 'USD').valid, true);
  });

  it('accepts an amount above the USD minimum', () => {
    assert.equal(validateLoanAmount(10000, 'USD').valid, true);
  });

  it('rejects an ILS amount below the converted equivalent minimum', () => {
    const minimum = getMinimumLoanAmount('ILS');
    assert.equal(validateLoanAmount(minimum - 1, 'ILS').valid, false);
  });

  it('accepts an ILS amount at exactly the converted equivalent minimum', () => {
    const minimum = getMinimumLoanAmount('ILS');
    assert.equal(validateLoanAmount(minimum, 'ILS').valid, true);
  });

  it('rejects a JOD amount below the converted equivalent minimum', () => {
    const minimum = getMinimumLoanAmount('JOD');
    assert.equal(validateLoanAmount(minimum - 1, 'JOD').valid, false);
  });

  it('the equivalent minimum is computed via the shared FX table, not a separate guess', () => {
    // USD 8,000 -> ILS at FX_TO_ILS.USD (3.6) -> 28,800; -> JOD at FX_TO_ILS.JOD (5.1) -> ~5,647.06
    assert.equal(getMinimumLoanAmount('USD'), 8000);
    assert.equal(Math.round(getMinimumLoanAmount('ILS') * 100) / 100, 28800);
    assert.ok(Math.abs(getMinimumLoanAmount('JOD') - 5647.06) < 0.01);
  });
});

describe('validateAge / validateDateOfBirth — general realistic-age bounds', () => {
  it('rejects a negative age', () => {
    assert.equal(validateAge(-1).valid, false);
  });

  it(`rejects an age above ${MAX_REALISTIC_AGE}`, () => {
    assert.equal(validateAge(MAX_REALISTIC_AGE + 1).valid, false);
  });

  it(`accepts an age at exactly ${MAX_REALISTIC_AGE} (boundary)`, () => {
    assert.equal(validateAge(MAX_REALISTIC_AGE).valid, true);
  });

  it('rejects an unparseable date string', () => {
    const result = validateDateOfBirth('not-a-date');
    assert.equal(result.valid, false);
  });

  it('rejects a future date of birth', () => {
    const reference = new Date('2026-07-16T00:00:00Z');
    const result = validateDateOfBirth('2027-01-01', reference);
    assert.equal(result.valid, false);
    assert.match(result.message!.en, /future/i);
  });

  it('rejects a date of birth implying an age over 120', () => {
    const reference = new Date('2026-07-16T00:00:00Z');
    const result = validateDateOfBirth('1900-01-01', reference);
    assert.equal(result.valid, false);
  });

  it('accepts a realistic date of birth and derives the correct age', () => {
    const reference = new Date('2026-07-16T00:00:00Z');
    const result = validateDateOfBirth('1990-07-15', reference); // birthday was yesterday relative to reference
    assert.equal(result.valid, true);
    assert.equal(result.age, 36);
  });

  it('derives age correctly when the birthday has not yet occurred this year', () => {
    const reference = new Date('2026-07-16T00:00:00Z');
    const result = validateDateOfBirth('1990-12-25', reference); // birthday hasn't happened yet this year
    assert.equal(result.valid, true);
    assert.equal(result.age, 35);
  });

  it('rejects an empty date of birth', () => {
    assert.equal(validateDateOfBirth('').valid, false);
  });
});

describe('validateLoanApplicantAge — centralized CreditRisk.tsx rule (18-100)', () => {
  it('rejects an age below 18', () => {
    assert.equal(validateLoanApplicantAge(17).valid, false);
  });

  it('accepts exactly 18 (boundary)', () => {
    assert.equal(validateLoanApplicantAge(MIN_LOAN_APPLICANT_AGE).valid, true);
  });

  it('accepts exactly 100 (boundary)', () => {
    assert.equal(validateLoanApplicantAge(MAX_LOAN_APPLICANT_AGE).valid, true);
  });

  it('rejects an age above 100', () => {
    assert.equal(validateLoanApplicantAge(101).valid, false);
  });

  it('rejects a negative age', () => {
    assert.equal(validateLoanApplicantAge(-5).valid, false);
  });
});

describe('validateLoanTermYears — centralized CreditRisk.tsx rule (1-30)', () => {
  it('rejects 0 years', () => {
    assert.equal(validateLoanTermYears(0).valid, false);
  });

  it('accepts exactly 1 year (boundary)', () => {
    assert.equal(validateLoanTermYears(1).valid, true);
  });

  it('accepts exactly 30 years (boundary)', () => {
    assert.equal(validateLoanTermYears(30).valid, true);
  });

  it('rejects 31 years', () => {
    assert.equal(validateLoanTermYears(31).valid, false);
  });
});

describe('validateEmail', () => {
  it('rejects empty when required', () => {
    assert.equal(validateEmail('').valid, false);
  });

  it('rejects an obviously malformed address', () => {
    assert.equal(validateEmail('not-an-email').valid, false);
    assert.equal(validateEmail('missing@domain').valid, false);
    assert.equal(validateEmail('@nodomain.com').valid, false);
  });

  it('accepts a well-formed address', () => {
    assert.equal(validateEmail('employee@bop.ps').valid, true);
  });
});

describe('validateObjectionFieldValue — field-aware dispatch for the modification/objection flow', () => {
  it('validates customer_name using the same length rule as the main form', () => {
    assert.equal(validateObjectionFieldValue('customer_name', 'A'.repeat(300)).valid, false);
    assert.equal(validateObjectionFieldValue('customer_name', 'Ahmad Khalil').valid, true);
  });

  it('validates national_id using the digits-only + length rule, optionally', () => {
    assert.equal(validateObjectionFieldValue('national_id', 'abc').valid, false);
    assert.equal(validateObjectionFieldValue('national_id', '402156789012').valid, true);
  });

  it('rejects a negative monthly_income change', () => {
    assert.equal(validateObjectionFieldValue('monthly_income', '-100').valid, false);
  });

  it('rejects a negative existing_loans change', () => {
    assert.equal(validateObjectionFieldValue('existing_loans', '-1').valid, false);
  });

  it('applies the loan-amount minimum to loan_amount/amount field edits', () => {
    assert.equal(validateObjectionFieldValue('loan_amount', '500', 'USD').valid, false);
    assert.equal(validateObjectionFieldValue('amount', '500', 'USD').valid, false);
    assert.equal(validateObjectionFieldValue('loan_amount', '10000', 'USD').valid, true);
  });

  it('defaults to ILS for the loan-amount minimum when no currency is given', () => {
    const minimumIls = getMinimumLoanAmount('ILS');
    assert.equal(validateObjectionFieldValue('loan_amount', String(minimumIls - 1)).valid, false);
    assert.equal(validateObjectionFieldValue('loan_amount', String(minimumIls)).valid, true);
  });

  it('does not block unrecognized/unlisted field keys (falls through safely)', () => {
    assert.equal(validateObjectionFieldValue('unknown_field', 'anything').valid, true);
  });
});
