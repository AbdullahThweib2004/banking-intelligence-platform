/**
 * Tests for src/lib/approvalRequests.ts — the shared row-mapping logic used
 * by BOTH Approvals.tsx (Manager/Risk) and AuditApprovals.tsx (Audit's own,
 * separate page), so the two never drift on what a "case file" contains.
 * Free of any Supabase import — pure data transformation only.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mapApprovalRow, type ApprovalRow } from '../approvalRequests.ts';

const baseRow: ApprovalRow = {
  id: 'req-1',
  type: 'credit',
  customer_name: 'Jane Doe',
  account_number: 'BOP-100001',
  employee_id: 'emp-1',
  request_date: null,
  created_at: '2026-01-01T00:00:00.000Z',
  amount: 25000,
  risk_score: null,
  risk_category: null,
  status: 'pending_audit_approval',
  notes: null,
  priority: 'normal',
};

describe('mapApprovalRow', () => {
  it('resolves the employee name from the shared name map', () => {
    const nameById = new Map([['emp-1', 'Ahmad Employee']]);
    const mapped = mapApprovalRow(baseRow, nameById);
    assert.equal(mapped.employeeName, 'Ahmad Employee');
  });

  it('falls back to an em dash when the employee id is not in the name map', () => {
    const mapped = mapApprovalRow(baseRow, new Map());
    assert.equal(mapped.employeeName, '—');
  });

  it('resolves manager/risk/audit decision names and timestamps for the full case file', () => {
    const row: ApprovalRow = {
      ...baseRow,
      manager_decision_by: 'mgr-1',
      manager_decision_at: '2026-01-02T00:00:00.000Z',
      risk_decision_by: 'risk-1',
      risk_decision_at: '2026-01-03T00:00:00.000Z',
      audit_decision_by: 'audit-1',
      audit_decision_at: '2026-01-04T00:00:00.000Z',
    };
    const nameById = new Map([
      ['emp-1', 'Ahmad Employee'],
      ['mgr-1', 'Mona Manager'],
      ['risk-1', 'Rami Risk'],
      ['audit-1', 'Amal Audit'],
    ]);
    const mapped = mapApprovalRow(row, nameById);
    assert.equal(mapped.managerDecisionByName, 'Mona Manager');
    assert.equal(mapped.managerDecisionAt, '2026-01-02T00:00:00.000Z');
    assert.equal(mapped.riskDecisionByName, 'Rami Risk');
    assert.equal(mapped.riskDecisionAt, '2026-01-03T00:00:00.000Z');
    assert.equal(mapped.auditDecisionByName, 'Amal Audit');
    assert.equal(mapped.auditDecisionAt, '2026-01-04T00:00:00.000Z');
  });

  it('leaves decision fields null when a stage has not acted yet (no out-of-order data)', () => {
    const mapped = mapApprovalRow(baseRow, new Map());
    assert.equal(mapped.managerDecisionByName, null);
    assert.equal(mapped.riskDecisionByName, null);
    assert.equal(mapped.auditDecisionByName, null);
  });

  it('preserves every status value used across the workflow, including the Audit-stage ones', () => {
    for (const status of [
      'pending',
      'approved',
      'rejected',
      'pending_branch_manager_approval',
      'pending_audit_approval',
      'audit_approved',
    ] as const) {
      const mapped = mapApprovalRow({ ...baseRow, status }, new Map());
      assert.equal(mapped.status, status);
    }
  });

  it('parses the saved risk explanation only when all required snapshot fields are present', () => {
    const withoutSnapshot = mapApprovalRow(baseRow, new Map());
    assert.equal(withoutSnapshot.savedRiskExplanation, null);

    const withSnapshot = mapApprovalRow(
      {
        ...baseRow,
        risk_top_factors: [],
        risk_derived_features: { eligibility_status: 'eligible' } as never,
        assessed_at: '2026-01-01T00:00:00.000Z',
      },
      new Map()
    );
    assert.notEqual(withSnapshot.savedRiskExplanation, null);
  });
});
