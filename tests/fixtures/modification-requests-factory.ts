import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * QA-namespaced loan_modification_requests builders for the two-stage
 * (Branch Manager -> Risk Department) workflow.
 *
 * These mirror the EXACT real mutations the app performs, so the tests
 * exercise the real mechanism rather than a synthetic one:
 *   - submission shape:      src/pages/CreditRisk.tsx  (objection dialog)
 *   - manager decision RPC:  decide_modification_request_as_manager
 *   - risk decision RPC:     decide_modification_request_as_risk
 *   (both RPCs added by supabase/migrations/20260829090000_modification_two_stage_workflow.sql)
 *
 * loan_modification_requests has no `notes` column, so QA rows are namespaced
 * through the required `reason` field instead. There is no DELETE policy on
 * the table for any client role, so cleanup must use the service-role admin
 * client (which bypasses RLS).
 */

export const QA_MOD_REASON_TAG = '[qa-integration-test]';

export const MOD_STATUS = {
  PENDING_MANAGER: 'pending_branch_manager_review',
  PENDING_RISK: 'pending_risk_review',
  APPROVED: 'approved',
  REJECTED: 'rejected',
} as const;

export interface QaModificationInput {
  applicationId: string;
  requesterUserId: string;
  requesterName?: string;
  requesterRole?: string;
  fieldName?: string;
  oldValue?: string | null;
  newValue?: string;
  reasonSuffix?: string;
}

/**
 * Submits a modification request exactly as the objection dialog does —
 * including the initial status, which the DB also enforces via
 * lmr_insert_roles' WITH CHECK.
 */
export async function insertQaModificationRequest(
  client: SupabaseClient,
  input: QaModificationInput
) {
  return client
    .from('loan_modification_requests')
    .insert({
      application_id: input.applicationId,
      requested_by: input.requesterUserId,
      requester_name: input.requesterName ?? 'QA Employee',
      requester_role: input.requesterRole ?? 'branch_employee',
      field_name: input.fieldName ?? 'amount',
      old_value: input.oldValue ?? null,
      new_value: input.newValue ?? '55000',
      reason: `${QA_MOD_REASON_TAG} ${input.reasonSuffix ?? 'workflow test'}`,
      status: MOD_STATUS.PENDING_MANAGER,
    })
    .select('*')
    .single();
}

/** Branch Manager decision via the stage-separated RPC. Never applies the field change. */
export async function decideModificationAsManager(
  managerClient: SupabaseClient,
  requestId: string,
  approve: boolean,
  decisionNote?: string
) {
  return managerClient.rpc('decide_modification_request_as_manager', {
    request_id: requestId,
    approve,
    decision_note: decisionNote ?? null,
  });
}

/** Risk Department decision via the stage-separated RPC. Applies the field change on approve. */
export async function decideModificationAsRisk(
  riskClient: SupabaseClient,
  requestId: string,
  approve: boolean,
  reviewNote?: string
) {
  return riskClient.rpc('decide_modification_request_as_risk', {
    request_id: requestId,
    approve,
    review_note: reviewNote ?? null,
  });
}

/** Reads a request back with the service-role client, bypassing per-role SELECT scoping. */
export async function readModificationAsAdmin(admin: SupabaseClient, requestId: string) {
  return admin.from('loan_modification_requests').select('*').eq('id', requestId).maybeSingle();
}

/**
 * True when 20260829090000 has been applied. Used to skip the whole suite
 * with an actionable message instead of failing every test on a missing
 * column — the same pattern demo-password-reset.api.spec.ts uses.
 */
export async function twoStageMigrationApplied(admin: SupabaseClient): Promise<boolean> {
  const probe = await admin
    .from('loan_modification_requests')
    .select('manager_decision')
    .limit(1);
  return !probe.error;
}

/** Deletes every QA-namespaced modification request (service role only). */
export async function cleanupQaModificationRequests(admin: SupabaseClient) {
  const { error } = await admin
    .from('loan_modification_requests')
    .delete()
    .like('reason', `${QA_MOD_REASON_TAG}%`);
  if (error) {
    throw new Error(`Cleanup failed for QA loan_modification_requests rows: ${error.message}`);
  }
}
