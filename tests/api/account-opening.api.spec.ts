import { test, expect } from '@playwright/test';
import { loginAsRole } from '../fixtures/api-context';
import { ROLES } from '../fixtures/api-users';
import { getAdminClient } from '../fixtures/supabase-admin';
import { hasSupabaseConfig, hasServiceRole } from '../utils/env';
import { expectWriteBlocked } from '../utils/assertions';
import {
  qaNationalId,
  insertQaBankCustomer,
  cleanupQaBankCustomers,
} from '../fixtures/bank-customers-factory';
import {
  resolveEmploymentMatch,
  isSalaryMismatch,
  hasUsableEmploymentData,
  isFinancialProfileEmpty,
  buildFinancialProfileFromEmploymentFields,
} from '../../src/lib/employmentMatch';

/**
 * Mirrors src/lib/bankCustomers.ts's UNRESOLVED_FINANCIAL_PROFILE exactly.
 * Not imported directly: that module also imports the app's Supabase
 * client (@/integrations/supabase/client), which reads import.meta.env —
 * a Vite-only mechanism that doesn't exist under Playwright's plain Node
 * test runner, so importing it here would crash at module load.
 * employmentMatch.ts above has no such dependency (its one bankCustomers.ts
 * reference is `import type`, fully erased at compile time), so it's safe.
 */
const UNRESOLVED_FINANCIAL_PROFILE = {
  monthlyIncome: 0,
  monthlyExpenses: 0,
  existingLoans: 0,
  employmentType: 'unknown',
  loanAmount: 0,
  loanPurpose: 'unknown',
  salaryCurrency: 'ILS',
  jobRole: null,
  source: 'unresolved_needs_review',
} as const;

/**
 * Account-opening workflow tests (real mechanism: direct Supabase table
 * operations via src/lib/bankCustomers.ts — there is no REST/edge-function
 * endpoint for account creation; the FastAPI /accounts/open-new call only
 * generates a PDF and never touches the database, per that file's own
 * header comment).
 *
 * OCR upload/extract-id and extract-employment-proof (success, invalid
 * file, missing file) are ALREADY covered end-to-end in
 * backend/tests/test_documents.py (PART 1) — not duplicated here. This
 * file covers what's new to PART 2: the national_id matching logic, real
 * financial-data retrieval, provenance tracking, and account creation
 * against the real bank_customers table/RLS/triggers.
 */
test.describe('Account opening — matching logic (pure, no I/O, always runs)', () => {
  test('resolveEmploymentMatch: an exact national_id match is always auto-applied', () => {
    const customer = { id: '1', national_id: '999', customer_name: 'X' } as never;
    expect(resolveEmploymentMatch(customer, [])).toEqual({ kind: 'matched', customer });
  });

  test('resolveEmploymentMatch: a single name-only match is surfaced, never auto-applied', () => {
    const candidate = { id: '1', customer_name: 'Jane Doe' } as never;
    const outcome = resolveEmploymentMatch(null, [candidate]);
    expect(outcome.kind).toBe('possible_match');
  });

  test('resolveEmploymentMatch: multiple name-only matches are ambiguous, never auto-applied', () => {
    const candidates = [{ id: '1' }, { id: '2' }] as never;
    expect(resolveEmploymentMatch(null, candidates).kind).toBe('ambiguous');
  });

  test('resolveEmploymentMatch: no match at all is not_found', () => {
    expect(resolveEmploymentMatch(null, [])).toEqual({ kind: 'not_found' });
  });

  test('unresolved/no-match never fabricates values — the sentinel is all zero/unknown', () => {
    expect(UNRESOLVED_FINANCIAL_PROFILE.monthlyIncome).toBe(0);
    expect(UNRESOLVED_FINANCIAL_PROFILE.employmentType).toBe('unknown');
    expect(UNRESOLVED_FINANCIAL_PROFILE.source).toBe('unresolved_needs_review');
    expect(isFinancialProfileEmpty(UNRESOLVED_FINANCIAL_PROFILE)).toBe(true);
  });

  test('an extraction with no usable fields yields hasUsableEmploymentData=false (must fall back to unresolved, never guess)', () => {
    expect(hasUsableEmploymentData(null)).toBe(false);
    expect(hasUsableEmploymentData({})).toBe(false);
    expect(hasUsableEmploymentData({ monthly_salary: 3200 })).toBe(true);
  });

  test('buildFinancialProfileFromEmploymentFields carries real extracted values through, source=employment_proof_extracted', () => {
    const profile = buildFinancialProfileFromEmploymentFields({
      monthly_salary: 3200,
      employer_name: 'Bank of Palestine',
      employment_status: 'employed',
      currency: 'ILS',
      job_title: 'Teller',
    });
    expect(profile.monthlyIncome).toBe(3200);
    expect(profile.source).toBe('employment_proof_extracted');
    expect(profile.salaryCurrency).toBe('ILS');
  });

  test('isSalaryMismatch flags a >15% difference between extracted and on-file salary', () => {
    expect(isSalaryMismatch(4000, 3000)).toBe(true);
    expect(isSalaryMismatch(3100, 3000)).toBe(false);
    expect(isSalaryMismatch(null, 3000)).toBe(false);
  });
});

test.describe('Account opening — real Supabase behavior', () => {
  test.beforeEach(() => {
    test.skip(!hasSupabaseConfig(), 'VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY not set');
  });

  test.afterAll(async () => {
    if (!hasServiceRole()) return;
    await cleanupQaBankCustomers(getAdminClient());
  });

  test('retrieval of real financial data from an existing seeded customer, by exact national_id', async () => {
    // BOP-100001 / Ahmad Khalil Nasser — a real seed row from
    // supabase/migrations/20260621100000_bank_customers.sql, used as
    // deterministic ground truth without needing to seed anything.
    const { client } = await loginAsRole(ROLES.EMPLOYEE);
    const result = await client.from('bank_customers').select('*').eq('national_id', '402156789012').maybeSingle();

    expect(result.error).toBeNull();
    test.skip(!result.data, 'Seed row for national_id 402156789012 not found — has the demo data migration been applied to this project?');
    expect(result.data?.account_number).toBe('BOP-100001');
    expect(result.data?.customer_name).toBe('Ahmad Khalil Nasser');
    expect(Number(result.data?.monthly_income)).toBe(4500);
  });

  test('a national_id with no match returns null, never a fabricated row', async () => {
    const { client } = await loginAsRole(ROLES.EMPLOYEE);
    const result = await client
      .from('bank_customers')
      .select('*')
      .eq('national_id', qaNationalId('nonexistent'))
      .maybeSingle();

    expect(result.error).toBeNull();
    expect(result.data).toBeNull();
  });

  test('creating a new customer auto-generates a BOP-1##### account number and persists provenance', async () => {
    const { client } = await loginAsRole(ROLES.EMPLOYEE);
    const nationalId = qaNationalId(Date.now());

    const result = await insertQaBankCustomer(client, {
      nationalId,
      monthlyIncome: 3200,
      employmentType: 'employed',
      financialProfileSource: 'employment_proof_extracted',
    });

    expect(result.error).toBeNull();
    expect(result.data?.account_number).toMatch(/^BOP-1\d{5}$/);
    expect(result.data?.national_id).toBe(nationalId);
    expect(Number(result.data?.monthly_income)).toBe(3200);
    // Provenance/source tracking (financial_profile_source) — the whole
    // point of this column: nothing downstream can mistake this for
    // verified-real data without also seeing where it came from.
    expect(result.data?.financial_profile_source).toBe('employment_proof_extracted');
  });

  test('a genuinely unresolved profile is stored as the honest sentinel, never a random number', async () => {
    const { client } = await loginAsRole(ROLES.EMPLOYEE);
    const nationalId = qaNationalId(Date.now() + 1);

    const result = await insertQaBankCustomer(client, {
      nationalId,
      monthlyIncome: UNRESOLVED_FINANCIAL_PROFILE.monthlyIncome,
      employmentType: UNRESOLVED_FINANCIAL_PROFILE.employmentType,
      financialProfileSource: 'unresolved_needs_review',
    });

    expect(result.error).toBeNull();
    expect(Number(result.data?.monthly_income)).toBe(0);
    expect(result.data?.employment_type).toBe('unknown');
    expect(result.data?.financial_profile_source).toBe('unresolved_needs_review');
  });

  test('national_id is unique — re-opening for the same person is idempotent at the DB level', async () => {
    const { client } = await loginAsRole(ROLES.EMPLOYEE);
    const nationalId = qaNationalId(Date.now() + 2);

    const first = await insertQaBankCustomer(client, { nationalId });
    expect(first.error).toBeNull();

    const second = await client
      .from('bank_customers')
      .insert({
        customer_name: 'Duplicate Attempt',
        national_id: nationalId,
        employment_type: 'unknown',
        loan_purpose: 'unknown',
      })
      .select('*')
      .single();

    // The real app (findOrCreateBankCustomerFromAccountOpening) catches this
    // 23505 and reuses the existing row instead of surfacing it — this test
    // verifies the DB constraint that behavior depends on.
    expect(second.error).not.toBeNull();
    expect(second.error?.code).toBe('23505');
  });

  test('required-field validation: missing national_id is rejected by the NOT NULL constraint', async () => {
    const { client } = await loginAsRole(ROLES.EMPLOYEE);
    const result = await client
      .from('bank_customers')
      .insert({ customer_name: 'No National Id', employment_type: 'unknown', loan_purpose: 'unknown' } as never)
      .select('*')
      .single();
    expect(result.error).not.toBeNull();
  });

  test('required-field validation: a national_id shorter than 7 chars is rejected', async () => {
    const { client } = await loginAsRole(ROLES.EMPLOYEE);
    const result = await client
      .from('bank_customers')
      .insert({ customer_name: 'Short Id', national_id: '123', employment_type: 'unknown', loan_purpose: 'unknown' })
      .select('*')
      .single();
    expect(result.error).not.toBeNull();
  });

  for (const role of [ROLES.RISK, ROLES.AUDIT]) {
    test(`unauthorized role rejection: ${role} cannot open an account (not in ACCOUNT_OPENING_ROLES)`, async () => {
      const { client } = await loginAsRole(role);
      const result = await client
        .from('bank_customers')
        .insert({
          customer_name: 'Should Be Blocked',
          national_id: qaNationalId(`${role}-blocked`),
          employment_type: 'unknown',
          loan_purpose: 'unknown',
        })
        .select();
      expectWriteBlocked(result, `${role} inserting into bank_customers`);
    });
  }
});
