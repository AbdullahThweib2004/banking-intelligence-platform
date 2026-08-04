import { test, expect } from '@playwright/test';
import { loginAsRole } from '../fixtures/api-context';
import { ROLES } from '../fixtures/api-users';
import { getAdminClient } from '../fixtures/supabase-admin';
import { hasSupabaseConfig, hasServiceRole } from '../utils/env';
import { expectWriteBlocked } from '../utils/assertions';
import {
  insertQaLoanRequest,
  decideAsManager,
  decideAsRisk,
  decideAsAudit,
  cleanupQaLoanRequests,
} from '../fixtures/approval-requests-factory';

/**
 * Loan request / credit workflow — real mechanism confirmed from the
 * frontend: direct approval_requests table INSERT/UPDATE calls (no REST
 * endpoint), gated entirely by RLS. Status names and update shapes are
 * copied exactly from src/pages/CreditRisk.tsx, Approvals.tsx,
 * AuditApprovals.tsx (see tests/fixtures/approval-requests-factory.ts
 * header for line references).
 *
 * Every row created here is QA-namespaced (notes LIKE '[qa-integration-test]%')
 * and removed in afterAll via the service-role admin client.
 */
test.describe('Loan / credit workflow', () => {
  test.beforeEach(() => {
    test.skip(!hasSupabaseConfig(), 'VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY not set');
  });

  test.afterAll(async () => {
    if (!hasServiceRole()) return;
    await cleanupQaLoanRequests(getAdminClient());
  });

  test('branch_employee creates a request that enters pending_branch_manager_approval with scoring fields present', async () => {
    const { client, session } = await loginAsRole(ROLES.EMPLOYEE);
    const accountNumber = `QA-${Date.now()}`;

    const result = await insertQaLoanRequest(client, {
      employeeUserId: session.user.id,
      accountNumber,
      customerName: 'QA Workflow Customer',
      amount: 15000,
      riskScore: 42,
      riskCategory: 'low',
      eligibilityStatus: 'eligible',
    });

    expect(result.error).toBeNull();
    expect(result.data?.status).toBe('pending_branch_manager_approval');
    expect(result.data?.employee_id).toBe(session.user.id);
    // Deterministic scoring/eligibility fields, present from submission.
    expect(result.data?.risk_score).toBe(42);
    expect(result.data?.eligibility_status).toBe('eligible');
  });

  test('risk_department cannot see or act on a request still at the manager gate', async () => {
    const employee = await loginAsRole(ROLES.EMPLOYEE);
    const inserted = await insertQaLoanRequest(employee.client, {
      employeeUserId: employee.session.user.id,
      accountNumber: `QA-${Date.now()}-gate`,
      customerName: 'QA Gate Customer',
      amount: 5000,
    });
    expect(inserted.error).toBeNull();
    const requestId = inserted.data.id;

    const risk = await loginAsRole(ROLES.RISK);
    const riskView = await risk.client.from('approval_requests').select('id').eq('id', requestId);
    expect(riskView.data ?? []).toHaveLength(0);

    const blockedUpdate = await risk.client
      .from('approval_requests')
      .update({ status: 'pending_audit_approval' })
      .eq('id', requestId)
      .select();
    expectWriteBlocked(blockedUpdate, 'risk_department updating a manager-gated request');
  });

  test('full status machine: manager approve -> risk approve -> audit approve, with DB post-conditions at each hop', async () => {
    const employee = await loginAsRole(ROLES.EMPLOYEE);
    const manager = await loginAsRole(ROLES.MANAGER);
    const risk = await loginAsRole(ROLES.RISK);
    const audit = await loginAsRole(ROLES.AUDIT);

    const inserted = await insertQaLoanRequest(employee.client, {
      employeeUserId: employee.session.user.id,
      accountNumber: `QA-${Date.now()}-full`,
      customerName: 'QA Full Lifecycle Customer',
      amount: 20000,
    });
    expect(inserted.error).toBeNull();
    const requestId = inserted.data.id;

    // -- Manager approves: -> 'pending', visible to risk_department now.
    const afterManager = await decideAsManager(manager.client, requestId, manager.session.user.id, 'approve');
    expect(afterManager.error).toBeNull();
    expect(afterManager.data?.status).toBe('pending');
    expect(afterManager.data?.manager_decision_by).toBe(manager.session.user.id);

    const riskNowSees = await risk.client.from('approval_requests').select('id').eq('id', requestId);
    expect(riskNowSees.data ?? []).toHaveLength(1);

    // -- Risk approves: -> 'pending_audit_approval', visible to audit_department now.
    const afterRisk = await decideAsRisk(risk.client, requestId, risk.session.user.id, 'approve');
    expect(afterRisk.error).toBeNull();
    expect(afterRisk.data?.status).toBe('pending_audit_approval');
    expect(afterRisk.data?.risk_decision_by).toBe(risk.session.user.id);

    const auditNowSees = await audit.client.from('approval_requests').select('id').eq('id', requestId);
    expect(auditNowSees.data ?? []).toHaveLength(1);

    // -- Audit approves (final): -> 'audit_approved', with note + approved_at persisted.
    const afterAudit = await decideAsAudit(
      audit.client,
      requestId,
      audit.session.user.id,
      'approve',
      'QA integration test — final approval'
    );
    expect(afterAudit.error).toBeNull();
    expect(afterAudit.data?.status).toBe('audit_approved');
    expect(afterAudit.data?.audit_decision_by).toBe(audit.session.user.id);
    expect(afterAudit.data?.audit_decision_note).toBe('QA integration test — final approval');
    expect(afterAudit.data?.approved_at).not.toBeNull();

    // -- Employee can retrieve their own request's final status.
    const employeeFinalView = await employee.client
      .from('approval_requests')
      .select('status')
      .eq('id', requestId)
      .single();
    expect(employeeFinalView.data?.status).toBe('audit_approved');
  });

  test('rejection at the manager gate is a soft reject (row kept, status=rejected)', async () => {
    const employee = await loginAsRole(ROLES.EMPLOYEE);
    const manager = await loginAsRole(ROLES.MANAGER);

    const inserted = await insertQaLoanRequest(employee.client, {
      employeeUserId: employee.session.user.id,
      accountNumber: `QA-${Date.now()}-reject-mgr`,
      customerName: 'QA Manager Reject Customer',
      amount: 8000,
    });
    const requestId = inserted.data.id;

    const decided = await decideAsManager(manager.client, requestId, manager.session.user.id, 'reject');
    expect(decided.data?.status).toBe('rejected');

    const stillVisibleToEmployee = await employee.client
      .from('approval_requests')
      .select('id, status')
      .eq('id', requestId)
      .single();
    expect(stillVisibleToEmployee.data?.status).toBe('rejected');
  });

  test('rejection at the risk stage is a soft reject', async () => {
    const employee = await loginAsRole(ROLES.EMPLOYEE);
    const manager = await loginAsRole(ROLES.MANAGER);
    const risk = await loginAsRole(ROLES.RISK);

    const inserted = await insertQaLoanRequest(employee.client, {
      employeeUserId: employee.session.user.id,
      accountNumber: `QA-${Date.now()}-reject-risk`,
      customerName: 'QA Risk Reject Customer',
      amount: 9000,
    });
    const requestId = inserted.data.id;
    await decideAsManager(manager.client, requestId, manager.session.user.id, 'approve');

    const decided = await decideAsRisk(risk.client, requestId, risk.session.user.id, 'reject');
    expect(decided.data?.status).toBe('rejected');
  });

  test('rejection at the audit stage is a soft reject and audit_decision_note persists', async () => {
    const employee = await loginAsRole(ROLES.EMPLOYEE);
    const manager = await loginAsRole(ROLES.MANAGER);
    const risk = await loginAsRole(ROLES.RISK);
    const audit = await loginAsRole(ROLES.AUDIT);

    const inserted = await insertQaLoanRequest(employee.client, {
      employeeUserId: employee.session.user.id,
      accountNumber: `QA-${Date.now()}-reject-audit`,
      customerName: 'QA Audit Reject Customer',
      amount: 11000,
    });
    const requestId = inserted.data.id;
    await decideAsManager(manager.client, requestId, manager.session.user.id, 'approve');
    await decideAsRisk(risk.client, requestId, risk.session.user.id, 'approve');

    const decided = await decideAsAudit(
      audit.client,
      requestId,
      audit.session.user.id,
      'reject',
      'QA integration test — rejected at audit'
    );
    expect(decided.data?.status).toBe('rejected');
    expect(decided.data?.audit_decision_note).toBe('QA integration test — rejected at audit');
    expect(decided.data?.approved_at).toBeNull();
  });

  test('invalid transition is blocked: audit cannot act on a request still at the manager gate', async () => {
    const employee = await loginAsRole(ROLES.EMPLOYEE);
    const audit = await loginAsRole(ROLES.AUDIT);

    const inserted = await insertQaLoanRequest(employee.client, {
      employeeUserId: employee.session.user.id,
      accountNumber: `QA-${Date.now()}-invalid-audit`,
      customerName: 'QA Invalid Transition Customer',
      amount: 6000,
    });
    const requestId = inserted.data.id;

    const blocked = await audit.client
      .from('approval_requests')
      .update({ status: 'audit_approved', audit_decision_by: audit.session.user.id })
      .eq('id', requestId)
      .select();
    expectWriteBlocked(blocked, 'audit_department acting on a manager-gated request');
  });

  test('invalid transition is blocked: manager cannot re-decide a request already past their gate', async () => {
    const employee = await loginAsRole(ROLES.EMPLOYEE);
    const manager = await loginAsRole(ROLES.MANAGER);

    const inserted = await insertQaLoanRequest(employee.client, {
      employeeUserId: employee.session.user.id,
      accountNumber: `QA-${Date.now()}-invalid-mgr`,
      customerName: 'QA Manager Re-decide Customer',
      amount: 7000,
    });
    const requestId = inserted.data.id;
    await decideAsManager(manager.client, requestId, manager.session.user.id, 'approve'); // -> 'pending'

    // manager_gate_decision_requests' USING requires status =
    // 'pending_branch_manager_approval' — the row is now 'pending', so this
    // second manager decision must be blocked.
    const secondDecision = await decideAsManager(manager.client, requestId, manager.session.user.id, 'reject');
    expectWriteBlocked(secondDecision, 'manager re-deciding a request already past the gate');
  });
});
