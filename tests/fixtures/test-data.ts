/**
 * Static RLS expectations mirrored from the actual migrations (not
 * guessed) — see supabase/migrations/20260618103000_rbac_profiles.sql,
 * 20260727130000_branch_manager_gate_for_credit_assessments.sql,
 * 20260727160000_audit_stage_workflow.sql, 20260705140000_documents_rls.sql,
 * 20260619100000_audit_logs.sql.
 *
 * Every predicate below is a STRUCTURAL invariant: true regardless of how
 * much data exists, so these tests don't need to seed rows into
 * approval_requests (whose full schema/constraints predate this repo's
 * migration history and aren't fully known) to be deterministic.
 */

export interface ApprovalRequestRow {
  status: string;
  audit_decision_by: string | null;
}

/** risk_department must never see a row still at the branch-manager gate. */
export const riskCanSeeRow = (row: ApprovalRequestRow): boolean =>
  row.status !== 'pending_branch_manager_approval';

/** audit_department only ever sees rows that passed Risk, or its own rejections. */
export const auditCanSeeRow = (row: ApprovalRequestRow): boolean =>
  ['pending_audit_approval', 'audit_approved'].includes(row.status) ||
  (row.status === 'rejected' && row.audit_decision_by !== null);

export interface ProfileRow {
  id: string;
}

/** Roles with no "select all profiles" grant may only ever see their own row. */
export const ownProfileOnly = (ownId: string) => (row: ProfileRow): boolean => row.id === ownId;
