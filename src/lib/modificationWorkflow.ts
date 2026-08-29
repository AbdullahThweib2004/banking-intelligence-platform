/**
 * Two-stage approval workflow for loan modification / objection requests.
 *
 *   employee submits
 *     -> 'pending_branch_manager_review'
 *   branch_manager approves -> 'pending_risk_review'   | rejects -> 'rejected'
 *   risk_department approves -> 'approved'             | rejects -> 'rejected'
 *
 * Only the FINAL risk approval applies the field change and triggers a
 * deterministic re-assessment. No other transition touches the source
 * application.
 *
 * STATUS NAMING: this table's own vocabulary is "review" (reviewed_by,
 * reviewed_at, review_note, review_loan_modification_request), so the new
 * statuses use `_review` rather than the `_approval` suffix that
 * approval_requests uses for the separate loan workflow. Keeping the two
 * vocabularies distinct also makes it impossible to confuse a modification
 * status with a loan status in a query or a log line.
 *
 * LEGACY: rows created before this change carry status 'pending', which under
 * the previous single-stage design meant "awaiting risk review". It is
 * therefore treated as risk-actionable so no in-flight request is stranded.
 * Nothing writes 'pending' any more.
 *
 * This module is deliberately free of any Supabase / React / import.meta
 * dependency so it runs under Node's plain `--test` runner, following the
 * same split as loanEligibility.ts and riskDecisionGate.ts.
 */

export const MODIFICATION_STATUS = {
  PENDING_MANAGER: 'pending_branch_manager_review',
  PENDING_RISK: 'pending_risk_review',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  /** @deprecated Legacy single-stage value. Never written; still readable. */
  LEGACY_PENDING: 'pending',
} as const;

export type ModificationStatus =
  (typeof MODIFICATION_STATUS)[keyof typeof MODIFICATION_STATUS];

/** Every value the `status` column may legally hold, including the legacy one. */
export const ALL_MODIFICATION_STATUSES: ModificationStatus[] = [
  MODIFICATION_STATUS.PENDING_MANAGER,
  MODIFICATION_STATUS.PENDING_RISK,
  MODIFICATION_STATUS.APPROVED,
  MODIFICATION_STATUS.REJECTED,
  MODIFICATION_STATUS.LEGACY_PENDING,
];

/** The status every newly submitted request must start at. */
export const INITIAL_MODIFICATION_STATUS = MODIFICATION_STATUS.PENDING_MANAGER;

export type WorkflowStage = 'manager' | 'risk' | 'final';

/**
 * Which stage owns a request right now. 'final' means nobody may act on it
 * again — a new request is required.
 */
export function statusStage(status: string): WorkflowStage {
  if (status === MODIFICATION_STATUS.PENDING_MANAGER) return 'manager';
  if (
    status === MODIFICATION_STATUS.PENDING_RISK ||
    status === MODIFICATION_STATUS.LEGACY_PENDING
  ) {
    return 'risk';
  }
  return 'final';
}

/** True when a branch_manager may approve/reject this request. */
export function isManagerActionable(status: string): boolean {
  return statusStage(status) === 'manager';
}

/**
 * True when risk_department may approve/reject this request. Legacy 'pending'
 * rows are included so requests in flight before the two-stage rollout can
 * still be completed.
 */
export function isRiskActionable(status: string): boolean {
  return statusStage(status) === 'risk';
}

/** True once the request can never change state again. */
export function isTerminal(status: string): boolean {
  return (
    status === MODIFICATION_STATUS.APPROVED ||
    status === MODIFICATION_STATUS.REJECTED
  );
}

/** Resulting status of a branch_manager decision. */
export function nextStatusForManagerDecision(approve: boolean): ModificationStatus {
  return approve ? MODIFICATION_STATUS.PENDING_RISK : MODIFICATION_STATUS.REJECTED;
}

/** Resulting status of a risk_department decision. */
export function nextStatusForRiskDecision(approve: boolean): ModificationStatus {
  return approve ? MODIFICATION_STATUS.APPROVED : MODIFICATION_STATUS.REJECTED;
}

/**
 * The complete transition allow-list. Anything not listed here is invalid —
 * including every attempt to skip the manager stage
 * (pending_branch_manager_review -> approved) and every attempt to revive a
 * terminal request (rejected -> anything).
 *
 * Mirrored exactly by the enforce_modification_status_transition() database
 * trigger, so the same rule holds for a direct PostgREST call.
 */
const ALLOWED_TRANSITIONS: Record<string, ModificationStatus[]> = {
  [MODIFICATION_STATUS.PENDING_MANAGER]: [
    MODIFICATION_STATUS.PENDING_RISK,
    MODIFICATION_STATUS.REJECTED,
  ],
  [MODIFICATION_STATUS.PENDING_RISK]: [
    MODIFICATION_STATUS.APPROVED,
    MODIFICATION_STATUS.REJECTED,
  ],
  // Legacy in-flight rows finish under the old one-stage rule (risk decides).
  [MODIFICATION_STATUS.LEGACY_PENDING]: [
    MODIFICATION_STATUS.APPROVED,
    MODIFICATION_STATUS.REJECTED,
  ],
  [MODIFICATION_STATUS.APPROVED]: [],
  [MODIFICATION_STATUS.REJECTED]: [],
};

/**
 * Whether `from -> to` is a legal status change. A no-op (from === to) is
 * allowed so an unrelated column update never trips the rule.
 */
export function isValidTransition(from: string, to: string): boolean {
  if (from === to) return true;
  return (ALLOWED_TRANSITIONS[from] ?? []).includes(to as ModificationStatus);
}

/** Which role, if any, is permitted to perform a given transition. */
export function actorRoleForTransition(from: string, to: string): string | null {
  if (!isValidTransition(from, to) || from === to) return null;
  if (statusStage(from) === 'manager') return 'branch_manager';
  if (statusStage(from) === 'risk') return 'risk_department';
  return null;
}

/**
 * Fields that feed the deterministic scoring engine. Changing any of them on
 * an approved modification requires a full re-assessment, which re-resolves
 * the product/currency interest rate through resolveEffectiveAnnualRate() and
 * therefore refreshes the installment, total interest, total repaid, DBR,
 * age-at-maturity, eligibility, score, and category.
 *
 * `amount` is the approval_requests column for the requested loan amount;
 * `loan_amount`, `salary`, and `income` are aliases accepted from modification
 * requests. loan_type / loan_currency / salary_currency are included because
 * they change which rate band applies even when no monetary value moves.
 *
 * Lives here (not in modificationReanalysis.ts) so the recalculation gate is
 * reachable from Node's plain `--test` runner, which cannot load a module that
 * imports the Supabase client.
 */
export const SCORING_FIELDS: ReadonlySet<string> = new Set([
  'amount',
  'loan_amount',
  'monthly_income',
  'salary',
  'income',
  'monthly_expenses',
  'existing_loans',
  'loan_to_income_ratio',
  'employment_type',
  'loan_type',
  'loan_currency',
  'salary_currency',
  'monthly_obligations',
  'client_age',
  'loan_term_years',
]);

export function isScoringField(field: string | null | undefined): boolean {
  if (!field) return false;
  return SCORING_FIELDS.has(field.trim().toLowerCase());
}

/**
 * THE RECALCULATION GATE.
 *
 * A deterministic re-assessment runs if and only if:
 *   - the risk_department stage,
 *   - approving (not rejecting),
 *   - on a field that actually feeds the scoring engine.
 *
 * Manager approval never recalculates — at that point nothing has been
 * applied to the source application yet. Neither rejection recalculates,
 * because neither changes any value.
 *
 * `isScoringFieldFn` is injectable purely for testing; it defaults to the
 * real predicate above.
 */
export function shouldRecalculate(params: {
  stage: WorkflowStage;
  approve: boolean;
  fieldName: string;
  isScoringFieldFn?: (field: string) => boolean;
}): boolean {
  const { stage, approve, fieldName, isScoringFieldFn = isScoringField } = params;
  if (stage !== 'risk') return false;
  if (!approve) return false;
  return isScoringFieldFn(fieldName);
}

/** Bilingual label for a status badge. */
export function statusLabel(status: string, language: 'en' | 'ar'): string {
  switch (status) {
    case MODIFICATION_STATUS.PENDING_MANAGER:
      return language === 'ar' ? 'بانتظار مراجعة المدير' : 'Pending Manager Review';
    case MODIFICATION_STATUS.PENDING_RISK:
      return language === 'ar' ? 'بانتظار مراجعة المخاطر' : 'Pending Risk Review';
    case MODIFICATION_STATUS.LEGACY_PENDING:
      return language === 'ar'
        ? 'بانتظار مراجعة المخاطر (قديم)'
        : 'Pending Risk Review (legacy)';
    case MODIFICATION_STATUS.APPROVED:
      return language === 'ar' ? 'مقبول' : 'Approved';
    case MODIFICATION_STATUS.REJECTED:
      return language === 'ar' ? 'مرفوض' : 'Rejected';
    default:
      return status;
  }
}

/**
 * Who rejected a terminal request, derived from the recorded manager
 * decision. Lets the UI say "rejected by the Branch Manager" instead of a
 * bare "rejected", without a second column.
 */
export function rejectedByStage(row: {
  status: string;
  manager_decision?: string | null;
}): 'manager' | 'risk' | null {
  if (row.status !== MODIFICATION_STATUS.REJECTED) return null;
  return row.manager_decision === 'rejected' ? 'manager' : 'risk';
}
