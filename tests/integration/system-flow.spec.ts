import { test, expect } from '@playwright/test';
import { loginAsRole } from '../fixtures/api-context';
import { ROLES } from '../fixtures/api-users';
import { getAdminClient } from '../fixtures/supabase-admin';
import { hasSupabaseConfig, hasServiceRole } from '../utils/env';
import {
  insertQaLoanRequest,
  decideAsManager,
  decideAsRisk,
  decideAsAudit,
  cleanupQaLoanRequests,
} from '../fixtures/approval-requests-factory';
import { qaNationalId, insertQaBankCustomer, cleanupQaBankCustomers } from '../fixtures/bank-customers-factory';

/**
 * High-value system-flow integration tests: realistic business paths
 * spanning multiple roles/steps, verified against the REAL database at the
 * end via the service-role admin client — not just each actor's own
 * (RLS-filtered) view of the row, so a bug that happened to make a role
 * see what it expected wouldn't hide a persistence problem.
 *
 * Reuses the exact same PART 1 fixtures/helpers and PART 2 factories as the
 * narrower per-file specs — this file's value is the END-TO-END narrative
 * and the independent admin-side verification, not new mechanics.
 */
test.describe('System flow: full loan request lifecycle', () => {
  test.beforeEach(() => {
    test.skip(!hasSupabaseConfig(), 'VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY not set');
  });

  test.afterAll(async () => {
    if (!hasServiceRole()) return;
    await cleanupQaLoanRequests(getAdminClient());
  });

  test('employee submits -> manager approves -> risk approves -> audit finalizes -> verified in DB via admin client', async () => {
    const employee = await loginAsRole(ROLES.EMPLOYEE);
    const manager = await loginAsRole(ROLES.MANAGER);
    const risk = await loginAsRole(ROLES.RISK);
    const audit = await loginAsRole(ROLES.AUDIT);

    const accountNumber = `QA-${Date.now()}-systemflow`;
    const inserted = await insertQaLoanRequest(employee.client, {
      employeeUserId: employee.session.user.id,
      accountNumber,
      customerName: 'QA System-Flow Customer',
      amount: 30000,
      riskScore: 35,
      riskCategory: 'low',
      eligibilityStatus: 'eligible',
    });
    expect(inserted.error).toBeNull();
    const requestId = inserted.data.id;

    await decideAsManager(manager.client, requestId, manager.session.user.id, 'approve');
    await decideAsRisk(risk.client, requestId, risk.session.user.id, 'approve');
    const finalDecision = await decideAsAudit(
      audit.client,
      requestId,
      audit.session.user.id,
      'approve',
      'System-flow integration test — final sign-off'
    );
    expect(finalDecision.error).toBeNull();

    // Independent verification: ask the SERVICE ROLE (bypasses RLS
    // entirely) what actually landed in the table, not any one actor's
    // filtered view of it.
    test.skip(!hasServiceRole(), 'SUPABASE_SERVICE_ROLE_KEY not set — cannot independently verify DB post-conditions');
    const admin = getAdminClient();
    const groundTruth = await admin
      .from('approval_requests')
      .select('status, employee_id, manager_decision_by, risk_decision_by, audit_decision_by, audit_decision_note, approved_at')
      .eq('id', requestId)
      .single();

    expect(groundTruth.error).toBeNull();
    expect(groundTruth.data?.status).toBe('audit_approved');
    expect(groundTruth.data?.employee_id).toBe(employee.session.user.id);
    expect(groundTruth.data?.manager_decision_by).toBe(manager.session.user.id);
    expect(groundTruth.data?.risk_decision_by).toBe(risk.session.user.id);
    expect(groundTruth.data?.audit_decision_by).toBe(audit.session.user.id);
    expect(groundTruth.data?.audit_decision_note).toBe('System-flow integration test — final sign-off');
    expect(groundTruth.data?.approved_at).not.toBeNull();
  });
});

test.describe('System flow: account opening with real financial-data provenance', () => {
  test.beforeEach(() => {
    test.skip(!hasSupabaseConfig(), 'VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY not set');
  });

  test.afterAll(async () => {
    if (!hasServiceRole()) return;
    await cleanupQaBankCustomers(getAdminClient());
  });

  test('national_id match against real seeded data -> resolved profile carries real values, not fabricated ones', async () => {
    const employee = await loginAsRole(ROLES.EMPLOYEE);

    // Step 1 (ID + employment proof, real mechanism): the wizard looks the
    // customer up by exact national_id (src/lib/bankCustomers.ts
    // matchCustomerFinancialRecord) BEFORE deciding whether to create a new
    // row. Using the real BOP-100002 seed customer as the "existing
    // customer" case, since inventing a synthetic match would just be
    // testing our own test data instead of the real matching path.
    const seeded = await employee.client
      .from('bank_customers')
      .select('*')
      .eq('national_id', '403987654321') // Sara Mahmoud Darwish, BOP-100002
      .maybeSingle();
    test.skip(!seeded.data, 'Seed row for national_id 403987654321 not found — demo data migration not applied here');
    expect(Number(seeded.data?.monthly_income)).toBe(6200);

    // Step 2: a genuinely NEW customer (no match) — account opened from
    // employment-proof-extracted data, never a random placeholder.
    const nationalId = qaNationalId(Date.now());
    const opened = await insertQaBankCustomer(employee.client, {
      nationalId,
      monthlyIncome: 4200,
      employmentType: 'employed',
      financialProfileSource: 'employment_proof_extracted',
      jobRole: 'Senior Teller',
    });
    expect(opened.error).toBeNull();
    expect(opened.data?.account_number).toMatch(/^BOP-1\d{5}$/);

    // Step 3: verify DB post-conditions + provenance independently via the
    // admin client, exactly like the loan-workflow system-flow test above.
    test.skip(!hasServiceRole(), 'SUPABASE_SERVICE_ROLE_KEY not set — cannot independently verify DB post-conditions');
    const admin = getAdminClient();
    const groundTruth = await admin
      .from('bank_customers')
      .select('monthly_income, employment_type, financial_profile_source, job_role, account_number')
      .eq('national_id', nationalId)
      .single();
    expect(groundTruth.error).toBeNull();
    expect(Number(groundTruth.data?.monthly_income)).toBe(4200);
    expect(groundTruth.data?.financial_profile_source).toBe('employment_proof_extracted');
    expect(groundTruth.data?.job_role).toBe('Senior Teller');
  });
});
