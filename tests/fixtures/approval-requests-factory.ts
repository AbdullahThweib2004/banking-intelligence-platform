import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * QA-namespaced approval_requests row builders — mirrors the EXACT real
 * mutations the app performs, so these tests exercise the real mechanism
 * (direct table operations, not a REST endpoint):
 *   - insert shape: src/pages/CreditRisk.tsx handleSubmitToManager (~line 622)
 *   - manager/risk decision shape: src/pages/Approvals.tsx confirmAction (~line 193)
 *   - audit decision shape: src/pages/AuditApprovals.tsx confirmAction (~line 121)
 *
 * QA rows are namespaced via a "QA-" account_number prefix and a notes tag
 * so they're trivially identifiable and cleanable, and never collide with
 * the demo bank_customers seed rows (BOP-100001..BOP-100010).
 */

export const QA_NOTES_TAG = '[qa-integration-test]';

export interface QaLoanRequestInput {
  employeeUserId: string;
  accountNumber: string;
  customerName: string;
  amount: number;
  /** 'eligible' avoids needing a risk-override-reason at the Risk stage. */
  eligibilityStatus?: 'eligible' | 'not_eligible';
  riskScore?: number;
  riskCategory?: 'low' | 'medium' | 'high';
}

/** Inserts a QA loan request as the branch_employee client — real INSERT, real RLS. */
export async function insertQaLoanRequest(employeeClient: SupabaseClient, input: QaLoanRequestInput) {
  return employeeClient
    .from('approval_requests')
    .insert({
      type: 'credit',
      account_number: input.accountNumber,
      customer_name: input.customerName,
      amount: input.amount,
      risk_score: input.riskScore ?? 50,
      risk_category: input.riskCategory ?? 'low',
      eligibility_status: input.eligibilityStatus ?? 'eligible',
      priority: 'normal',
      status: 'pending_branch_manager_approval',
      employee_id: input.employeeUserId,
      notes: `${QA_NOTES_TAG} account ${input.accountNumber}`,
    })
    .select('*')
    .single();
}

/** Branch Manager gate decision — mirrors Approvals.tsx's manager-gate branch exactly. */
export async function decideAsManager(
  managerClient: SupabaseClient,
  requestId: string,
  managerUserId: string,
  action: 'approve' | 'reject'
) {
  const now = new Date().toISOString();
  return managerClient
    .from('approval_requests')
    .update({
      status: action === 'approve' ? 'pending' : 'rejected',
      updated_at: now,
      manager_decision_by: managerUserId,
      manager_decision_at: now,
    })
    .eq('id', requestId)
    .select('*')
    .single();
}

/** Risk stage decision — mirrors Approvals.tsx's risk-stage branch exactly. */
export async function decideAsRisk(
  riskClient: SupabaseClient,
  requestId: string,
  riskUserId: string,
  action: 'approve' | 'reject'
) {
  const now = new Date().toISOString();
  return riskClient
    .from('approval_requests')
    .update({
      status: action === 'approve' ? 'pending_audit_approval' : 'rejected',
      updated_at: now,
      risk_decision_by: riskUserId,
      risk_decision_at: now,
    })
    .eq('id', requestId)
    .select('*')
    .single();
}

/** Audit stage decision — mirrors AuditApprovals.tsx's confirmAction exactly. */
export async function decideAsAudit(
  auditClient: SupabaseClient,
  requestId: string,
  auditUserId: string,
  action: 'approve' | 'reject',
  note?: string
) {
  const now = new Date().toISOString();
  const newStatus = action === 'approve' ? 'audit_approved' : 'rejected';
  return auditClient
    .from('approval_requests')
    .update({
      status: newStatus,
      updated_at: now,
      audit_decision_by: auditUserId,
      audit_decision_at: now,
      audit_decision_note: note?.trim() || null,
      approved_at: newStatus === 'audit_approved' ? now : null,
    })
    .eq('id', requestId)
    .select('*')
    .single();
}

/** Deletes every QA-namespaced approval_requests row (via the notes tag). */
export async function cleanupQaLoanRequests(admin: SupabaseClient) {
  const { error } = await admin.from('approval_requests').delete().like('notes', `${QA_NOTES_TAG}%`);
  if (error) throw new Error(`Cleanup failed for QA approval_requests rows: ${error.message}`);
}
