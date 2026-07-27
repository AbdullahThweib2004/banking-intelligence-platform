import {
  hasSavedRiskExplanation,
  type SavedRiskExplanation,
  type SavedTopFactor,
  type DerivedFeatures,
  type RecommendedAction,
  type ResultSource,
} from './creditScoring.ts';

/**
 * Shared shape for an `approval_requests` row, used by both the Manager/Risk
 * Approvals page and Audit's own dedicated page — kept in one place so the
 * two pages (deliberately separate files/routes/accounts) don't drift on
 * what a "case file" actually contains.
 */
export type ApprovalStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'pending_branch_manager_approval'
  | 'pending_audit_approval'
  | 'audit_approved';

export interface ApprovalRequest {
  id: string;
  type: 'credit' | 'document' | 'exception';
  customerName: string;
  accountNumber?: string;
  employeeName: string;
  requestDate: string;
  amount?: number;
  riskScore?: number;
  riskCategory?: 'low' | 'medium' | 'high';
  status: ApprovalStatus;
  notes?: string;
  priority: 'normal' | 'high' | 'urgent';
  savedRiskExplanation: SavedRiskExplanation | null;
  reanalysisStatus?: 'pending' | 'completed' | 'failed' | null;
  // Snapshotted fields needed to render the full signed loan-request document.
  nationalId?: string | null;
  monthlyIncome?: number | null;
  monthlyExpenses?: number | null;
  existingLoans?: number | null;
  employmentType?: string | null;
  salaryCurrency?: string | null;
  signatureDataUrl?: string | null;
  // Per-stage decision traceability — the full case file needs all three.
  managerDecisionByName?: string | null;
  managerDecisionAt?: string | null;
  riskDecisionByName?: string | null;
  riskDecisionAt?: string | null;
  auditDecisionByName?: string | null;
  auditDecisionAt?: string | null;
  auditDecisionNote?: string | null;
}

// Row shape as stored in the Supabase `approval_requests` table.
export interface ApprovalRow {
  id: string;
  type: ApprovalRequest['type'];
  customer_name: string;
  account_number: string | null;
  employee_id: string | null;
  request_date: string | null;
  created_at: string;
  amount: number | null;
  risk_score: number | null;
  risk_category: ApprovalRequest['riskCategory'] | null;
  status: ApprovalStatus;
  notes: string | null;
  priority: ApprovalRequest['priority'] | null;
  risk_explanation_summary?: string | null;
  risk_top_factors?: SavedTopFactor[] | null;
  risk_derived_features?: DerivedFeatures | null;
  risk_confidence?: number | null;
  recommended_action?: RecommendedAction | null;
  result_source?: ResultSource | null;
  assessed_at?: string | null;
  reanalysis_status?: 'pending' | 'completed' | 'failed' | null;
  national_id?: string | null;
  monthly_income?: number | null;
  monthly_expenses?: number | null;
  existing_loans?: number | null;
  employment_type?: string | null;
  salary_currency?: string | null;
  signature_data_url?: string | null;
  manager_decision_by?: string | null;
  manager_decision_at?: string | null;
  risk_decision_by?: string | null;
  risk_decision_at?: string | null;
  audit_decision_by?: string | null;
  audit_decision_at?: string | null;
  audit_decision_note?: string | null;
}

// Parse the saved risk explanation snapshot from a row without recalculating.
export const parseSavedRiskExplanation = (row: ApprovalRow): SavedRiskExplanation | null => {
  if (!hasSavedRiskExplanation(row)) return null;
  return {
    risk_score: row.risk_score ?? 0,
    risk_category: row.risk_category ?? 'low',
    risk_confidence: row.risk_confidence ?? null,
    risk_explanation_summary: row.risk_explanation_summary ?? '',
    risk_top_factors: (row.risk_top_factors ?? []) as SavedTopFactor[],
    risk_derived_features: row.risk_derived_features as DerivedFeatures,
    recommended_action: row.recommended_action ?? null,
    result_source: row.result_source ?? null,
    assessed_at: row.assessed_at as string,
  };
};

export const mapApprovalRow = (
  row: ApprovalRow,
  nameById: Map<string, string>
): ApprovalRequest => ({
  id: row.id,
  type: row.type,
  customerName: row.customer_name,
  accountNumber: row.account_number ?? undefined,
  employeeName: (row.employee_id && nameById.get(row.employee_id)) || '—',
  requestDate: row.request_date ?? row.created_at,
  amount: row.amount ?? undefined,
  riskScore: row.risk_score ?? undefined,
  riskCategory: row.risk_category ?? undefined,
  status: row.status,
  notes: row.notes ?? undefined,
  priority: row.priority ?? 'normal',
  savedRiskExplanation: parseSavedRiskExplanation(row),
  reanalysisStatus: row.reanalysis_status ?? null,
  nationalId: row.national_id ?? null,
  monthlyIncome: row.monthly_income ?? null,
  monthlyExpenses: row.monthly_expenses ?? null,
  existingLoans: row.existing_loans ?? null,
  employmentType: row.employment_type ?? null,
  salaryCurrency: row.salary_currency ?? null,
  signatureDataUrl: row.signature_data_url ?? null,
  managerDecisionByName: (row.manager_decision_by && nameById.get(row.manager_decision_by)) || null,
  managerDecisionAt: row.manager_decision_at ?? null,
  riskDecisionByName: (row.risk_decision_by && nameById.get(row.risk_decision_by)) || null,
  riskDecisionAt: row.risk_decision_at ?? null,
  auditDecisionByName: (row.audit_decision_by && nameById.get(row.audit_decision_by)) || null,
  auditDecisionAt: row.audit_decision_at ?? null,
  auditDecisionNote: row.audit_decision_note ?? null,
});

export const getRiskColor = (category?: ApprovalRequest['riskCategory']) => {
  switch (category) {
    case 'low': return 'text-success bg-success/10 border-success/20';
    case 'medium': return 'text-warning bg-warning/10 border-warning/20';
    case 'high': return 'text-destructive bg-destructive/10 border-destructive/20';
    default: return 'text-muted-foreground bg-muted border-border';
  }
};
