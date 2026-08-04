import { test, expect } from '@playwright/test';
import { getAnonClient, loginAsRole } from '../fixtures/api-context';
import { ROLES } from '../fixtures/api-users';
import { getAdminClient } from '../fixtures/supabase-admin';
import { hasSupabaseConfig, hasServiceRole } from '../utils/env';
import { expectNoRowsVisible, expectAllRowsMatch, expectWriteBlocked } from '../utils/assertions';
import { riskCanSeeRow, auditCanSeeRow, type ApprovalRequestRow } from '../fixtures/test-data';

/**
 * RLS/data-access tests built around the REAL policies in
 * supabase/migrations (rbac_profiles, branch_manager_gate_for_credit_
 * assessments, audit_stage_workflow, documents_rls, audit_logs) — not
 * guessed endpoints. Every assertion here is a STRUCTURAL invariant (true
 * no matter what rows exist), so nothing needs to be seeded/torn down —
 * approval_requests predates this repo's migration history (no CREATE
 * TABLE found for it), so its full constraint set isn't reliably knowable,
 * and inserting synthetic rows against an unknown schema would make these
 * tests flaky for reasons unrelated to RLS. Seeded, lifecycle-shaped tests
 * belong to PART 2.
 */
test.describe('Supabase RLS / data access', () => {
  test.beforeEach(() => {
    test.skip(!hasSupabaseConfig(), 'VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY not set');
  });

  test.describe('Unauthenticated access is blocked (every policy is `TO authenticated`)', () => {
    for (const table of ['profiles', 'approval_requests', 'audit_logs', 'documents']) {
      test(`anon client sees zero rows in ${table}`, async () => {
        const anon = getAnonClient();
        const result = await anon.from(table).select('*');
        expectNoRowsVisible(result, `anon reading ${table}`);
      });
    }

    test('anon client cannot write to approval_requests', async () => {
      const anon = getAnonClient();
      const result = await anon
        .from('approval_requests')
        .update({ status: 'approved' })
        .eq('status', 'pending')
        .select();
      expectWriteBlocked(result, 'anon updating approval_requests');
    });

    test('anon client cannot insert into profiles', async () => {
      const anon = getAnonClient();
      const result = await anon
        .from('profiles')
        .insert({ id: '00000000-0000-0000-0000-000000000000', role: 'branch_manager' })
        .select();
      expectWriteBlocked(result, 'anon inserting into profiles');
    });
  });

  test.describe('profiles visibility', () => {
    for (const role of [ROLES.EMPLOYEE, ROLES.RISK, ROLES.AUDIT]) {
      test(`${role} sees only its own profile row (no select-all grant for this role)`, async () => {
        const { client, session } = await loginAsRole(role);
        const result = await client.from('profiles').select('id');
        expectAllRowsMatch(result, (row: { id: string }) => row.id === session.user.id, `${role} reading profiles`);
        expect(result.data?.length, `${role} should see at least its own row`).toBeGreaterThanOrEqual(1);
      });
    }

    test('branch_manager sees every profile row (profiles_select_branch_manager has no row filter)', async () => {
      test.skip(!hasServiceRole(), 'SUPABASE_SERVICE_ROLE_KEY not set — needed as ground truth for "sees ALL rows"');
      const { client } = await loginAsRole(ROLES.MANAGER);
      const managerResult = await client.from('profiles').select('id');
      expect(managerResult.error).toBeNull();

      const admin = getAdminClient();
      const adminResult = await admin.from('profiles').select('id');
      expect(adminResult.error).toBeNull();

      expect(managerResult.data?.length).toBe(adminResult.data?.length);
    });
  });

  test.describe('approval_requests visibility', () => {
    test('branch_employee only sees its own submitted requests', async () => {
      const { client, session } = await loginAsRole(ROLES.EMPLOYEE);
      const result = await client.from('approval_requests').select('employee_id');
      expectAllRowsMatch(
        result,
        (row: { employee_id: string }) => row.employee_id === session.user.id,
        'branch_employee reading approval_requests'
      );
    });

    test('risk_department never sees a row still at the branch-manager gate', async () => {
      const { client } = await loginAsRole(ROLES.RISK);
      const result = await client.from('approval_requests').select('status, audit_decision_by');
      expectAllRowsMatch(result, riskCanSeeRow as (row: ApprovalRequestRow) => boolean, 'risk_department reading approval_requests');
    });

    test('audit_department only sees rows that passed Risk, or its own rejections', async () => {
      const { client } = await loginAsRole(ROLES.AUDIT);
      const result = await client.from('approval_requests').select('status, audit_decision_by');
      expectAllRowsMatch(result, auditCanSeeRow as (row: ApprovalRequestRow) => boolean, 'audit_department reading approval_requests');
    });

    test('branch_manager read succeeds (manager_select_all_requests grants unrestricted SELECT)', async () => {
      const { client } = await loginAsRole(ROLES.MANAGER);
      const result = await client.from('approval_requests').select('status');
      expect(result.error).toBeNull();
    });

    // TODO(PART 2): "risk_department cannot UPDATE a row still at the
    // manager gate" needs a row genuinely sitting in that state, which
    // means either seeding (schema not fully known — see file header) or
    // depending on whatever live data happens to exist (non-deterministic).
    // Belongs with the full loan-workflow tests in PART 2, which will seed
    // and tear down real workflow rows deliberately.
    test.skip('risk_department cannot approve a row still awaiting branch-manager decision', async () => {
      // Intentionally not implemented — see comment above.
    });
  });

  test.describe('audit_logs visibility (risk_department only, despite the "audit" name)', () => {
    test('risk_department can read audit_logs without error', async () => {
      const { client } = await loginAsRole(ROLES.RISK);
      const result = await client.from('audit_logs').select('id');
      expect(result.error).toBeNull();
    });

    for (const role of [ROLES.EMPLOYEE, ROLES.MANAGER, ROLES.AUDIT]) {
      test(`${role} sees zero rows in audit_logs (only audit_logs_select_risk exists)`, async () => {
        const { client } = await loginAsRole(role);
        const result = await client.from('audit_logs').select('id');
        expectNoRowsVisible(result, `${role} reading audit_logs`);
      });
    }
  });

  test.describe('documents visibility', () => {
    test('audit_department sees zero rows (documents_select_roles excludes it entirely)', async () => {
      const { client } = await loginAsRole(ROLES.AUDIT);
      const result = await client.from('documents').select('id');
      expectNoRowsVisible(result, 'audit_department reading documents');
    });

    for (const role of [ROLES.EMPLOYEE, ROLES.MANAGER, ROLES.RISK]) {
      test(`${role} can read documents without error`, async () => {
        const { client } = await loginAsRole(role);
        const result = await client.from('documents').select('id');
        expect(result.error).toBeNull();
      });
    }
  });

  // TODO(PART 2 / security follow-up, not exploited here): every RLS policy
  // in this schema reads role from auth.jwt() -> user_metadata ->> 'role',
  // and user_metadata is end-user-editable via supabase.auth.updateUser()
  // (this is explicitly flagged as a known tradeoff in the migration's own
  // comment — see 20260618103000_rbac_profiles.sql). A real privilege-
  // escalation test would call updateUser({data:{role:'branch_manager'}})
  // on a branch_employee session and confirm it's rejected — but that call
  // would permanently mutate whichever real test account runs it, which
  // this suite will not do without a disposable, single-purpose test
  // account. Flagging clearly rather than silently skipping.
  test.skip('user_metadata.role cannot be self-escalated by the end user', async () => {
    // Intentionally not implemented — see comment above. Needs a disposable
    // test account before this can run safely.
  });
});
