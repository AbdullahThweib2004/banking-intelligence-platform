import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  APPROVAL_REQUESTS_LOAN_COLUMNS,
  isSchemaCacheError,
  formatMissingColumnsMessage,
  formatSchemaCacheErrorMessage,
} from '../schemaVerificationMessages.ts';

describe('schemaVerification: APPROVAL_REQUESTS_LOAN_COLUMNS', () => {
  test('lists exactly the 14 columns added by 20260711130000_loan_assessment_fields.sql', () => {
    assert.deepEqual(
      [...APPROVAL_REQUESTS_LOAN_COLUMNS].sort(),
      [
        'age_at_maturity',
        'ai_explanation',
        'annual_interest_rate_used',
        'client_age',
        'debt_burden_ratio',
        'eligibility_status',
        'loan_currency',
        'loan_term_years',
        'loan_type',
        'monthly_installment',
        'monthly_obligations',
        'salary_currency',
        'total_interest',
        'total_repaid',
      ].sort()
    );
  });
});

describe('schemaVerification: isSchemaCacheError', () => {
  test('recognizes the PostgREST PGRST204 error code', () => {
    assert.ok(isSchemaCacheError({ code: 'PGRST204', message: 'anything' }));
  });

  test('recognizes the "schema cache" phrase in the message when no code is given', () => {
    assert.ok(
      isSchemaCacheError({
        message: "Could not find the 'age_at_maturity' column of 'approval_requests' in the schema cache",
      })
    );
  });

  test('is case-insensitive on the message phrase', () => {
    assert.ok(isSchemaCacheError({ message: 'SCHEMA CACHE is stale' }));
  });

  test('returns false for an unrelated error', () => {
    assert.equal(isSchemaCacheError({ code: '23505', message: 'duplicate key value violates unique constraint' }), false);
  });

  test('returns false for null/undefined', () => {
    assert.equal(isSchemaCacheError(null), false);
    assert.equal(isSchemaCacheError(undefined), false);
  });
});

describe('schemaVerification: message formatting', () => {
  test('formatMissingColumnsMessage lists every missing column and the migration file', () => {
    const msg = formatMissingColumnsMessage(['age_at_maturity', 'eligibility_status']);
    assert.match(msg, /age_at_maturity/);
    assert.match(msg, /eligibility_status/);
    assert.match(msg, /20260711130000_loan_assessment_fields\.sql/);
  });

  test('formatMissingColumnsMessage supports Arabic', () => {
    const msg = formatMissingColumnsMessage(['age_at_maturity'], 'ar');
    assert.match(msg, /age_at_maturity/);
    assert.match(msg, /20260711130000_loan_assessment_fields\.sql/);
  });

  test('formatSchemaCacheErrorMessage references the migration file in both languages', () => {
    assert.match(formatSchemaCacheErrorMessage('en'), /20260711130000_loan_assessment_fields\.sql/);
    assert.match(formatSchemaCacheErrorMessage('ar'), /20260711130000_loan_assessment_fields\.sql/);
  });
});
