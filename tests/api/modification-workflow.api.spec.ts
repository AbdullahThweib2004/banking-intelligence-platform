import { test, expect } from '@playwright/test';
import { loginAsRole } from '../fixtures/api-context';
import { ROLES } from '../fixtures/api-users';
import { getAdminClient } from '../fixtures/supabase-admin';
import { hasSupabaseConfig, hasServiceRole } from '../utils/env';
import { expectWriteBlocked } from '../utils/assertions';
import {
  insertQaLoanRequest,
  decideAsManager,
  cleanupQaLoanRequests,
} from '../fixtures/approval-requests-factory';
import {
  MOD_STATUS,
  QA_MOD_REASON_TAG,
  insertQaModificationRequest,
  decideModificationAsManager,
  decideModificationAsRisk,
  readModificationAsAdmin,
  twoStageMigrationApplied,
  cleanupQaModificationRequests,
} from '../fixtures/modification-requests-factory';

/**
 * Two-stage modification/objection workflow:
 *   employee submits -> pending_branch_manager_review
 *   manager approves -> pending_risk_review        (nothing applied yet)
 *   risk approves    -> approved                   (field applied + re-assessed)
 *
 * Every row created here is QA-namespaced (reason LIKE '[qa-integration-test]%'
 * for modifications, notes LIKE '[qa-integration-test]%' for the parent loan
 * requests) and removed in afterAll via the service-role admin client.
 *
 * PRECONDITION: supabase/migrations/20260829090000_modification_two_stage_workflow.sql
 * must be applied to the target project. Until it is, the whole suite skips
 * with an actionable message rather than failing on a missing column — the
 * manager_decision columns, the two stage RPCs, and the widened status CHECK
 * all come from that migration.
 */
test.describe('Modification workflow — two-stage (Branch Manager -> Risk)', () => {
  test.beforeEach(async () => {
    test.skip(!hasSupabaseConfig(), 'VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY not set');
    test.skip(
      !hasServiceRole(),
      'SUPABASE_SERVICE_ROLE_KEY not set — needed to seed a parent loan request and to verify DB post-conditions independently'
    );
    test.skip(
      !(await twoStageMigrationApplied(getAdminClient())),
      'Migration 20260829090000_modification_two_stage_workflow.sql is not applied to this project yet — apply it in the Supabase SQL Editor first'
    );
  });

  test.afterAll(async () => {
    if (!hasServiceRole()) return;
    const admin = getAdminClient();
    await cleanupQaModificationRequests(admin);
    await cleanupQaLoanRequests(admin);
  });

  /** Creates a parent loan request that has already cleared the manager gate. */
  async function seedParentApplication(amount = 30000) {
    const employee = await loginAsRole(ROLES.EMPLOYEE);
    const manager = await loginAsRole(ROLES.MANAGER);
    const inserted = await insertQaLoanRequest(employee.client, {
      employeeUserId: employee.session.user.id,
      accountNumber: `QA-${Date.now()}-mod`,
      customerName: 'QA Modification Customer',
      amount,
    });
    expect(inserted.error).toBeNull();
    // Move it out of the loan manager gate so it is a realistic target.
    await decideAsManager(manager.client, inserted.data.id, manager.session.user.id, 'approve');
    return inserted.data.id as string;
  }

  // -------------------------------------------------------------------------
  test('employee submission lands at the branch-manager gate, not the risk queue', async () => {
    const employee = await loginAsRole(ROLES.EMPLOYEE);
    const applicationId = await seedParentApplication();

    const created = await insertQaModificationRequest(employee.client, {
      applicationId,
      requesterUserId: employee.session.user.id,
      reasonSuffix: 'lands at manager gate',
    });

    expect(created.error).toBeNull();
    expect(created.data?.status).toBe(MOD_STATUS.PENDING_MANAGER);
    expect(created.data?.requested_by).toBe(employee.session.user.id);
    expect(created.data?.manager_decision).toBeNull();
    expect(created.data?.reviewed_by).toBeNull();
  });

  test('the DB refuses a submission that tries to enter the risk queue directly', async () => {
    const employee = await loginAsRole(ROLES.EMPLOYEE);
    const applicationId = await seedParentApplication();

    const result = await employee.client
      .from('loan_modification_requests')
      .insert({
        application_id: applicationId,
        requested_by: employee.session.user.id,
        requester_name: 'QA Employee',
        requester_role: 'branch_employee',
        field_name: 'amount',
        new_value: '99000',
        reason: `${QA_MOD_REASON_TAG} stage-skip attempt at insert`,
        status: MOD_STATUS.PENDING_RISK, // must be rejected by lmr_insert_roles
      })
      .select();

    expectWriteBlocked(result, 'employee inserting straight into the risk queue');
  });

  test('risk_department cannot SEE a request still awaiting branch-manager review', async () => {
    const employee = await loginAsRole(ROLES.EMPLOYEE);
    const risk = await loginAsRole(ROLES.RISK);
    const applicationId = await seedParentApplication();

    const created = await insertQaModificationRequest(employee.client, {
      applicationId,
      requesterUserId: employee.session.user.id,
      reasonSuffix: 'invisible to risk before manager',
    });
    const requestId = created.data.id;

    const riskView = await risk.client
      .from('loan_modification_requests')
      .select('id')
      .eq('id', requestId);

    expect(riskView.error).toBeNull();
    expect(riskView.data ?? []).toHaveLength(0);
  });

  test('risk_department cannot ACT on a request still awaiting branch-manager review', async () => {
    const employee = await loginAsRole(ROLES.EMPLOYEE);
    const risk = await loginAsRole(ROLES.RISK);
    const applicationId = await seedParentApplication();

    const created = await insertQaModificationRequest(employee.client, {
      applicationId,
      requesterUserId: employee.session.user.id,
      reasonSuffix: 'risk cannot finalize before manager',
    });
    const requestId = created.data.id;

    // Via the RPC: must raise, not silently approve.
    const rpc = await decideModificationAsRisk(risk.client, requestId, true);
    expect(rpc.error, 'risk RPC must refuse a manager-pending request').not.toBeNull();

    // Via a direct table UPDATE: must be blocked by lmr_risk_decision's USING.
    const direct = await risk.client
      .from('loan_modification_requests')
      .update({ status: MOD_STATUS.APPROVED })
      .eq('id', requestId)
      .select();
    expectWriteBlocked(direct, 'risk_department updating a manager-gated modification request');

    // And the source application must be untouched.
    const admin = getAdminClient();
    const after = await readModificationAsAdmin(admin, requestId);
    expect(after.data?.status).toBe(MOD_STATUS.PENDING_MANAGER);
  });

  test('branch_employee cannot make a manager decision or a risk decision', async () => {
    const employee = await loginAsRole(ROLES.EMPLOYEE);
    const applicationId = await seedParentApplication();

    const created = await insertQaModificationRequest(employee.client, {
      applicationId,
      requesterUserId: employee.session.user.id,
      reasonSuffix: 'employee cannot decide',
    });
    const requestId = created.data.id;

    const asManager = await decideModificationAsManager(employee.client, requestId, true);
    expect(asManager.error, 'employee must not be able to run the manager RPC').not.toBeNull();

    const asRisk = await decideModificationAsRisk(employee.client, requestId, true);
    expect(asRisk.error, 'employee must not be able to run the risk RPC').not.toBeNull();

    const direct = await employee.client
      .from('loan_modification_requests')
      .update({ status: MOD_STATUS.APPROVED })
      .eq('id', requestId)
      .select();
    expectWriteBlocked(direct, 'employee approving their own modification request');
  });

  test('manager approval moves the request to the risk queue WITHOUT applying the change', async () => {
    const employee = await loginAsRole(ROLES.EMPLOYEE);
    const manager = await loginAsRole(ROLES.MANAGER);
    const risk = await loginAsRole(ROLES.RISK);
    const admin = getAdminClient();

    const applicationId = await seedParentApplication(30000);
    const created = await insertQaModificationRequest(employee.client, {
      applicationId,
      requesterUserId: employee.session.user.id,
      oldValue: '30000',
      newValue: '61000',
      reasonSuffix: 'manager forwards to risk',
    });
    const requestId = created.data.id;

    const decision = await decideModificationAsManager(
      manager.client,
      requestId,
      true,
      'QA manager note'
    );
    expect(decision.error).toBeNull();

    const row = await readModificationAsAdmin(admin, requestId);
    expect(row.data?.status).toBe(MOD_STATUS.PENDING_RISK);
    expect(row.data?.manager_decision).toBe('approved');
    expect(row.data?.manager_decision_by).toBe(manager.session.user.id);
    expect(row.data?.manager_decision_at).not.toBeNull();
    expect(row.data?.manager_decision_note).toBe('QA manager note');

    // Still NOT applied — that only happens at the risk stage.
    const app = await admin
      .from('approval_requests')
      .select('amount')
      .eq('id', applicationId)
      .single();
    expect(Number(app.data?.amount)).toBe(30000);

    // Now visible to risk.
    const riskView = await risk.client
      .from('loan_modification_requests')
      .select('id, status')
      .eq('id', requestId);
    expect(riskView.data ?? []).toHaveLength(1);
    expect(riskView.data?.[0].status).toBe(MOD_STATUS.PENDING_RISK);
  });

  test('manager rejection is terminal, keeps the record, and never reaches risk', async () => {
    const employee = await loginAsRole(ROLES.EMPLOYEE);
    const manager = await loginAsRole(ROLES.MANAGER);
    const risk = await loginAsRole(ROLES.RISK);
    const admin = getAdminClient();

    const applicationId = await seedParentApplication(30000);
    const created = await insertQaModificationRequest(employee.client, {
      applicationId,
      requesterUserId: employee.session.user.id,
      newValue: '77000',
      reasonSuffix: 'manager rejects',
    });
    const requestId = created.data.id;

    const decision = await decideModificationAsManager(
      manager.client,
      requestId,
      false,
      'QA rejected by manager'
    );
    expect(decision.error).toBeNull();

    const row = await readModificationAsAdmin(admin, requestId);
    expect(row.data?.status).toBe(MOD_STATUS.REJECTED);
    expect(row.data?.manager_decision).toBe('rejected');
    expect(row.data, 'the record must be preserved for audit, not deleted').not.toBeNull();

    // Source application untouched.
    const app = await admin
      .from('approval_requests')
      .select('amount')
      .eq('id', applicationId)
      .single();
    expect(Number(app.data?.amount)).toBe(30000);

    // Risk cannot revive it.
    const revive = await decideModificationAsRisk(risk.client, requestId, true);
    expect(revive.error, 'a manager-rejected request must not be approvable by risk').not.toBeNull();
  });

  test('risk approval applies the field change to the source application', async () => {
    const employee = await loginAsRole(ROLES.EMPLOYEE);
    const manager = await loginAsRole(ROLES.MANAGER);
    const risk = await loginAsRole(ROLES.RISK);
    const admin = getAdminClient();

    const applicationId = await seedParentApplication(30000);
    const created = await insertQaModificationRequest(employee.client, {
      applicationId,
      requesterUserId: employee.session.user.id,
      oldValue: '30000',
      newValue: '48000',
      reasonSuffix: 'risk applies change',
    });
    const requestId = created.data.id;

    await decideModificationAsManager(manager.client, requestId, true, 'ok');
    const decision = await decideModificationAsRisk(risk.client, requestId, true, 'QA risk approve');
    expect(decision.error).toBeNull();

    const row = await readModificationAsAdmin(admin, requestId);
    expect(row.data?.status).toBe(MOD_STATUS.APPROVED);
    expect(row.data?.reviewed_by).toBe(risk.session.user.id);
    expect(row.data?.reviewed_at).not.toBeNull();

    const app = await admin
      .from('approval_requests')
      .select('amount')
      .eq('id', applicationId)
      .single();
    expect(Number(app.data?.amount)).toBe(48000);
  });

  test('risk rejection leaves the source application unchanged', async () => {
    const employee = await loginAsRole(ROLES.EMPLOYEE);
    const manager = await loginAsRole(ROLES.MANAGER);
    const risk = await loginAsRole(ROLES.RISK);
    const admin = getAdminClient();

    const applicationId = await seedParentApplication(30000);
    const created = await insertQaModificationRequest(employee.client, {
      applicationId,
      requesterUserId: employee.session.user.id,
      newValue: '90000',
      reasonSuffix: 'risk rejects',
    });
    const requestId = created.data.id;

    await decideModificationAsManager(manager.client, requestId, true);
    const decision = await decideModificationAsRisk(risk.client, requestId, false, 'QA risk reject');
    expect(decision.error).toBeNull();

    const row = await readModificationAsAdmin(admin, requestId);
    expect(row.data?.status).toBe(MOD_STATUS.REJECTED);
    expect(row.data?.manager_decision).toBe('approved'); // manager had approved
    expect(row.data?.review_note).toBe('QA risk reject');

    const app = await admin
      .from('approval_requests')
      .select('amount')
      .eq('id', applicationId)
      .single();
    expect(Number(app.data?.amount)).toBe(30000);
  });

  test('a manager cannot final-approve, and cannot re-decide past their own gate', async () => {
    const employee = await loginAsRole(ROLES.EMPLOYEE);
    const manager = await loginAsRole(ROLES.MANAGER);
    const applicationId = await seedParentApplication();

    const created = await insertQaModificationRequest(employee.client, {
      applicationId,
      requesterUserId: employee.session.user.id,
      reasonSuffix: 'manager cannot final-approve',
    });
    const requestId = created.data.id;

    // Manager attempting the risk RPC.
    const asRisk = await decideModificationAsRisk(manager.client, requestId, true);
    expect(asRisk.error, 'manager must not be able to run the risk RPC').not.toBeNull();

    // Manager attempting a direct jump to 'approved'.
    const jump = await manager.client
      .from('loan_modification_requests')
      .update({ status: MOD_STATUS.APPROVED })
      .eq('id', requestId)
      .select();
    expectWriteBlocked(jump, 'manager jumping straight to approved');

    // Legit manager approval, then a second manager decision must be refused.
    await decideModificationAsManager(manager.client, requestId, true);
    const again = await decideModificationAsManager(manager.client, requestId, false);
    expect(again.error, 'manager must not re-decide a request past their gate').not.toBeNull();
  });

  test('an approved request cannot be re-decided by anyone', async () => {
    const employee = await loginAsRole(ROLES.EMPLOYEE);
    const manager = await loginAsRole(ROLES.MANAGER);
    const risk = await loginAsRole(ROLES.RISK);

    const applicationId = await seedParentApplication(30000);
    const created = await insertQaModificationRequest(employee.client, {
      applicationId,
      requesterUserId: employee.session.user.id,
      newValue: '41000',
      reasonSuffix: 'terminal cannot be re-decided',
    });
    const requestId = created.data.id;

    await decideModificationAsManager(manager.client, requestId, true);
    await decideModificationAsRisk(risk.client, requestId, true);

    const again = await decideModificationAsRisk(risk.client, requestId, false);
    expect(again.error, 'an approved request must not be re-decided').not.toBeNull();
  });

  test('audit fields and audit_logs entries are populated across both stages', async () => {
    const employee = await loginAsRole(ROLES.EMPLOYEE);
    const manager = await loginAsRole(ROLES.MANAGER);
    const risk = await loginAsRole(ROLES.RISK);
    const admin = getAdminClient();

    const applicationId = await seedParentApplication(30000);
    const created = await insertQaModificationRequest(employee.client, {
      applicationId,
      requesterUserId: employee.session.user.id,
      newValue: '35000',
      reasonSuffix: 'audit trail',
    });
    const requestId = created.data.id;

    await decideModificationAsManager(manager.client, requestId, true, 'audit note m');
    await decideModificationAsRisk(risk.client, requestId, true, 'audit note r');

    const row = await readModificationAsAdmin(admin, requestId);
    expect(row.data?.manager_decision_by).toBe(manager.session.user.id);
    expect(row.data?.manager_decision_at).not.toBeNull();
    expect(row.data?.reviewed_by).toBe(risk.session.user.id);
    expect(row.data?.reviewed_at).not.toBeNull();

    const logs = await admin
      .from('audit_logs')
      .select('action')
      .eq('resource', 'loan_modification_requests')
      .eq('resource_id', requestId);

    expect(logs.error).toBeNull();
    const actions = (logs.data ?? []).map((l: { action: string }) => l.action);
    expect(actions.some((a) => a.includes('Submitted modification request'))).toBe(true);
    expect(actions.some((a) => a.includes('Branch Manager approved'))).toBe(true);
    expect(actions.some((a) => a.includes('Risk Department approved'))).toBe(true);
  });
});
