import React, { useState, useEffect, useCallback } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { ROLES } from '@/lib/roles';
import { supabase } from '@/integrations/supabase/client';
import { useApprovalStats } from '@/hooks/useStats';
import { StatValue } from '@/components/StatValue';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { HelpTarget } from '@/components/help';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  CheckCircle2,
  XCircle,
  Clock,
  Eye,
  MessageSquare,
  AlertTriangle,
  TrendingUp,
  User,
  FileText,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { ModificationRequestsPanel } from '@/components/ModificationRequestsPanel';
import { SavedRiskExplanationView } from '@/components/CreditScoreExplanation';
import { LoanRequestDocument } from '@/components/LoanRequestDocument';
import { auditApprovalBlockedByMissingData, canSubmitApproval, evaluateRiskGate } from '@/lib/riskDecisionGate';
import {
  hasSavedRiskExplanation,
  type SavedRiskExplanation,
  type SavedTopFactor,
  type DerivedFeatures,
  type RecommendedAction,
  type ResultSource,
} from '@/lib/creditScoring';

interface ApprovalRequest {
  id: string;
  type: 'credit' | 'document' | 'exception';
  customerName: string;
  accountNumber?: string;
  employeeName: string;
  requestDate: string;
  amount?: number;
  riskScore?: number;
  riskCategory?: 'low' | 'medium' | 'high';
  status: 'pending' | 'approved' | 'rejected' | 'pending_branch_manager_approval' | 'pending_audit_approval' | 'audit_approved';
  notes?: string;
  priority: 'normal' | 'high' | 'urgent';
  savedRiskExplanation: SavedRiskExplanation | null;
  reanalysisStatus?: 'pending' | 'completed' | 'failed' | null;
  // Snapshotted fields needed to render the full signed loan-request document
  // for the Branch Manager gate step.
  nationalId?: string | null;
  monthlyIncome?: number | null;
  monthlyExpenses?: number | null;
  existingLoans?: number | null;
  employmentType?: string | null;
  salaryCurrency?: string | null;
  signatureDataUrl?: string | null;
  // Per-stage decision traceability (Audit's "full case file" needs all three).
  managerDecisionByName?: string | null;
  managerDecisionAt?: string | null;
  riskDecisionByName?: string | null;
  riskDecisionAt?: string | null;
  auditDecisionByName?: string | null;
  auditDecisionAt?: string | null;
}

// Row shape as stored in the Supabase `approval_requests` table.
interface ApprovalRow {
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
  status: ApprovalRequest['status'];
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
}

// Parse the saved risk explanation snapshot from a row without recalculating.
const parseSavedRiskExplanation = (row: ApprovalRow): SavedRiskExplanation | null => {
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

const mapRow = (
  row: ApprovalRow,
  employeeNameById: Map<string, string>
): ApprovalRequest => ({
  id: row.id,
  type: row.type,
  customerName: row.customer_name,
  accountNumber: row.account_number ?? undefined,
  employeeName: (row.employee_id && employeeNameById.get(row.employee_id)) || '—',
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
  managerDecisionByName: (row.manager_decision_by && employeeNameById.get(row.manager_decision_by)) || null,
  managerDecisionAt: row.manager_decision_at ?? null,
  riskDecisionByName: (row.risk_decision_by && employeeNameById.get(row.risk_decision_by)) || null,
  riskDecisionAt: row.risk_decision_at ?? null,
  auditDecisionByName: (row.audit_decision_by && employeeNameById.get(row.audit_decision_by)) || null,
  auditDecisionAt: row.audit_decision_at ?? null,
});

const getRiskColor = (category?: ApprovalRequest['riskCategory']) => {
  switch (category) {
    case 'low': return 'text-success bg-success/10 border-success/20';
    case 'medium': return 'text-warning bg-warning/10 border-warning/20';
    case 'high': return 'text-destructive bg-destructive/10 border-destructive/20';
    default: return 'text-muted-foreground bg-muted border-border';
  }
};

const getPriorityBadge = (priority: ApprovalRequest['priority'], language: string) => {
  switch (priority) {
    case 'urgent':
      return <Badge className="bg-destructive/10 text-destructive border-destructive/20">{language === 'ar' ? 'عاجل' : 'Urgent'}</Badge>;
    case 'high':
      return <Badge className="bg-warning/10 text-warning border-warning/20">{language === 'ar' ? 'مهم' : 'High'}</Badge>;
    default:
      return <Badge variant="outline">{language === 'ar' ? 'عادي' : 'Normal'}</Badge>;
  }
};

export const Approvals: React.FC = () => {
  const { t, language } = useLanguage();
  const { isRole, role, user } = useAuth();
  const { stats, loading: statsLoading, error: statsError } = useApprovalStats();
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedApproval, setSelectedApproval] = useState<ApprovalRequest | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [actionType, setActionType] = useState<'approve' | 'reject' | 'view' | null>(null);
  const [comment, setComment] = useState('');
  const [overrideReason, setOverrideReason] = useState('');
  const [activeTab, setActiveTab] = useState('pending');
  const [riskExplanationOpen, setRiskExplanationOpen] = useState(false);
  const [riskExplanationApproval, setRiskExplanationApproval] = useState<ApprovalRequest | null>(null);
  const [documentViewerApproval, setDocumentViewerApproval] = useState<ApprovalRequest | null>(null);

  const fetchApprovals = useCallback(async () => {
    let query = supabase.from('approval_requests').select('*');

    // Employees only see their own submissions; managers and risk see everything.
    if (role === ROLES.EMPLOYEE) {
      query = query.eq('employee_id', user?.id ?? '');
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) {
      console.error('Failed to load approval requests:', error);
      toast.error(
        language === 'ar'
          ? `تعذر تحميل الطلبات: ${error.message}`
          : `Failed to load requests: ${error.message}`
      );
      setIsLoading(false);
      return;
    }

    // Employee names live in `profiles`; there is no FK to embed, so map them manually.
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name');
    const employeeNameById = new Map(
      (profiles ?? []).map((p) => [p.id as string, p.full_name as string])
    );

    setApprovals((data as ApprovalRow[]).map((row) => mapRow(row, employeeNameById)));
    setIsLoading(false);
  }, [language, role, user]);

  useEffect(() => {
    fetchApprovals();

    // Reflect inserts/updates (e.g. a new assessment, or another manager's
    // decision) without a full page reload.
    const channel = supabase
      .channel('approval_requests_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'approval_requests' },
        () => fetchApprovals()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchApprovals]);

  const handleAction = (approval: ApprovalRequest, action: 'approve' | 'reject' | 'view') => {
    setSelectedApproval(approval);
    setActionType(action);
    setIsDialogOpen(true);
    setComment('');
    setOverrideReason('');
  };

  // Gates Risk's final Approve decision on the already-computed, deterministic
  // DBR/age-at-maturity rule engine result (src/lib/loanEligibility.ts) — see
  // src/lib/riskDecisionGate.ts. Only applies to Risk's own decision (the
  // 'pending' stage) — not the Branch Manager gate (no rule-engine result to
  // check yet) or the Audit stage (its own, stricter, non-overridable check
  // below — a missing result at Audit means process integrity is broken,
  // rather than a risk-tolerance judgment call).
  const isManagerGateAction = selectedApproval?.status === 'pending_branch_manager_approval';
  const isAuditAction = selectedApproval?.status === 'pending_audit_approval';
  const riskApproveGate =
    !isManagerGateAction && !isAuditAction && actionType === 'approve'
      ? evaluateRiskGate(selectedApproval?.savedRiskExplanation?.risk_derived_features ?? null)
      : null;

  // Audit cannot approve a request missing the Risk-stage eligibility result
  // at all (distinct from riskApproveGate's 'not_eligible' + override flow —
  // this is a hard block, since it signals a broken/skipped prior stage, not
  // a risk-tolerance decision for Audit to make).
  const auditMissingPriorStageData =
    isAuditAction && actionType === 'approve' &&
    auditApprovalBlockedByMissingData(selectedApproval?.savedRiskExplanation?.risk_derived_features ?? null);

  // Eye icon: open the saved risk explanation snapshot (read-only, no recompute).
  const openRiskExplanation = (approval: ApprovalRequest) => {
    setRiskExplanationApproval(approval);
    setRiskExplanationOpen(true);
  };

  const confirmAction = async () => {
    if (!selectedApproval || !actionType) return;

    if (actionType === 'view') {
      setIsDialogOpen(false);
      return;
    }

    // Each stage has a different transition:
    //   Branch Manager gate: approve -> 'pending' (Risk's queue), reject -> 'rejected' (soft).
    //   Risk stage:          approve -> 'pending_audit_approval' (Audit's queue), reject -> 'rejected' (soft).
    //   Audit stage:         approve -> 'audit_approved' (final), reject -> 'rejected' (soft — kept
    //                        for compliance/audit-trail purposes, same reasoning as every other stage).
    const isManagerGateDecision = selectedApproval.status === 'pending_branch_manager_approval';
    const isAuditDecision = selectedApproval.status === 'pending_audit_approval';
    const newStatus = isManagerGateDecision
      ? (actionType === 'approve' ? 'pending' : 'rejected')
      : isAuditDecision
        ? (actionType === 'approve' ? 'audit_approved' : 'rejected')
        : (actionType === 'approve' ? 'pending_audit_approval' : 'rejected');
    const now = new Date().toISOString();

    // Risk approving despite a failed DBR/age-at-maturity rule requires a
    // typed override reason (enforced client-side by disabling the button
    // below, and re-checked here as defense in depth) — recorded for audit.
    if (riskApproveGate?.requiresOverrideReason && !canSubmitApproval(riskApproveGate, overrideReason)) {
      toast.error(
        language === 'ar'
          ? 'يجب إدخال سبب تجاوز القاعدة قبل الموافقة.'
          : 'An override reason is required before approving this request.'
      );
      return;
    }

    // Audit cannot approve a request missing the Risk-stage eligibility
    // result at all — hard block, no override (see auditMissingPriorStageData).
    if (auditMissingPriorStageData) {
      toast.error(
        language === 'ar'
          ? 'لا يمكن الموافقة — بيانات مرحلة المخاطر (نسبة عبء الدين / العمر عند الاستحقاق) غير مكتملة.'
          : 'Cannot approve — the Risk stage\'s DBR/age-at-maturity data is missing or incomplete.'
      );
      return;
    }

    const { error } = await supabase
      .from('approval_requests')
      .update(
        isManagerGateDecision
          ? {
              status: newStatus,
              updated_at: now,
              manager_decision_by: user?.id ?? null,
              manager_decision_at: now,
            }
          : isAuditDecision
            ? {
                status: newStatus,
                updated_at: now,
                audit_decision_by: user?.id ?? null,
                audit_decision_at: now,
                // audit_approved is now the true final state — approved_at
                // (used by the "Approved Today" / avg-processing-time stats)
                // is set here rather than at the Risk stage.
                approved_at: newStatus === 'audit_approved' ? now : null,
              }
            : {
                status: newStatus,
                updated_at: now,
                risk_decision_by: user?.id ?? null,
                risk_decision_at: now,
                ...(riskApproveGate?.requiresOverrideReason
                  ? {
                      risk_override_reason: overrideReason.trim(),
                      risk_override_by: user?.id ?? null,
                      risk_override_at: now,
                    }
                  : {}),
              }
      )
      .eq('id', selectedApproval.id);

    if (error) {
      console.error('Failed to update approval request:', error);
      toast.error(
        language === 'ar'
          ? `فشل تحديث الطلب: ${error.message}`
          : `Failed to update request: ${error.message}`
      );
      return;
    }

    // Optimistic local update; the realtime subscription keeps it in sync too.
    setApprovals(prev =>
      prev.map(apr =>
        apr.id === selectedApproval.id ? { ...apr, status: newStatus } : apr
      )
    );

    toast.success(
      language === 'ar'
        ? actionType === 'approve' ? 'تمت الموافقة بنجاح' : 'تم الرفض'
        : actionType === 'approve' ? 'Approved successfully' : 'Rejected'
    );

    setIsDialogOpen(false);
    setSelectedApproval(null);
    setActionType(null);
    setOverrideReason('');
  };

  const pendingApprovals = approvals.filter(a => a.status === 'pending');
  const awaitingManagerApprovals = approvals.filter(a => a.status === 'pending_branch_manager_approval');
  const awaitingAuditApprovals = approvals.filter(a => a.status === 'pending_audit_approval');
  const processedApprovals = approvals.filter(
    a => a.status !== 'pending'
      && a.status !== 'pending_branch_manager_approval'
      && a.status !== 'pending_audit_approval'
  );

  const filteredApprovals =
    activeTab === 'pending' ? pendingApprovals
    : activeTab === 'manager_gate' ? awaitingManagerApprovals
    : activeTab === 'audit_gate' ? awaitingAuditApprovals
    : processedApprovals;

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-foreground">{t('approvals.title')}</h1>
          <p className="text-muted-foreground mt-1">
            {language === 'ar'
              ? 'مراجعة والموافقة على طلبات الائتمان'
              : 'Review and approve credit requests'}
          </p>
        </div>

        {/* Stats */}
        <HelpTarget
          id="approvals-stats"
          scope="section"
          category={language === 'ar' ? 'الإحصائيات' : 'Metrics'}
          title={language === 'ar' ? 'ملخص لوحة الموافقات' : 'Approvals Dashboard Summary'}
          description={language === 'ar'
            ? 'يوفر مؤشرات سريعة عن طلبات الموافقة الائتمانية المعلقة والعاجلة، والموافقات التي تمت معالجتها اليوم، ومتوسط مدة المراجعة.'
            : 'Provides snapshot indicators of pending and urgent credit approvals, approvals processed today, and average review duration.'}
          actions={language === 'ar'
            ? [
                'مراقبة عدد الملفات المعلقة والمطلوب مراجعتها.',
                'متابعة الطلبات ذات الأولوية القصوى أو العاجلة لتجنب التأخير.',
                'ملاحظة التقدم اليومي لسرعة المعالجة ومتوسط أوقات المراجعة.'
              ]
            : [
                'Monitor the count of pending files requiring review.',
                'Track high-priority or urgent requests to avoid delays.',
                'Observe daily progress on processing speed and average review times.'
              ]}
        >
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <HelpTarget
              asChild
              id="approvals-stat-pending"
              scope="item"
              category={language === 'ar' ? 'بطاقة إحصائية' : 'Stat Card'}
              title={language === 'ar' ? 'بانتظار الموافقة' : 'Pending'}
              description={language === 'ar'
                ? 'عدد الطلبات التي ما زالت بانتظار قرار الموافقة أو الرفض.'
                : 'The number of requests still waiting on an approve/reject decision.'}
            >
              <Card className="stat-card">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">
                        {language === 'ar' ? 'بانتظار الموافقة' : 'Pending'}
                      </p>
                      <p className="text-2xl font-bold">
                        <StatValue loading={statsLoading} error={statsError} value={stats.pending.toLocaleString()} />
                      </p>
                    </div>
                    <Clock className="h-8 w-8 text-warning opacity-50" />
                  </div>
                </CardContent>
              </Card>
            </HelpTarget>

            <HelpTarget
              asChild
              id="approvals-stat-urgent"
              scope="item"
              category={language === 'ar' ? 'بطاقة إحصائية' : 'Stat Card'}
              title={language === 'ar' ? 'عاجل' : 'Urgent'}
              description={language === 'ar'
                ? 'عدد الطلبات ذات الأولوية العاجلة والتي تحتاج مراجعة فورية.'
                : 'The number of urgent-priority requests that need immediate review.'}
            >
              <Card className="stat-card">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">
                        {language === 'ar' ? 'عاجل' : 'Urgent'}
                      </p>
                      <p className="text-2xl font-bold text-destructive">
                        <StatValue loading={statsLoading} error={statsError} value={stats.urgent.toLocaleString()} />
                      </p>
                    </div>
                    <AlertTriangle className="h-8 w-8 text-destructive opacity-50" />
                  </div>
                </CardContent>
              </Card>
            </HelpTarget>

            <HelpTarget
              asChild
              id="approvals-stat-approved-today"
              scope="item"
              category={language === 'ar' ? 'بطاقة إحصائية' : 'Stat Card'}
              title={language === 'ar' ? 'تمت الموافقة اليوم' : 'Approved Today'}
              description={language === 'ar'
                ? 'عدد الطلبات التي تمت الموافقة عليها خلال اليوم الحالي.'
                : 'The number of requests approved during the current day.'}
            >
              <Card className="stat-card">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">
                        {language === 'ar' ? 'تمت الموافقة اليوم' : 'Approved Today'}
                      </p>
                      <p className="text-2xl font-bold text-success">
                        <StatValue loading={statsLoading} error={statsError} value={stats.approvedToday.toLocaleString()} />
                      </p>
                    </div>
                    <CheckCircle2 className="h-8 w-8 text-success opacity-50" />
                  </div>
                </CardContent>
              </Card>
            </HelpTarget>

            <HelpTarget
              asChild
              id="approvals-stat-avg-process-time"
              scope="item"
              category={language === 'ar' ? 'بطاقة إحصائية' : 'Stat Card'}
              title={language === 'ar' ? 'متوسط وقت المعالجة' : 'Avg Process Time'}
              description={language === 'ar'
                ? 'متوسط الوقت المستغرق لمعالجة طلب موافقة من التقديم حتى القرار.'
                : 'The average time it takes to process an approval request from submission to decision.'}
            >
              <Card className="stat-card">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">
                        {language === 'ar' ? 'متوسط وقت المعالجة' : 'Avg Process Time'}
                      </p>
                      <p className="text-2xl font-bold">
                        <StatValue
                          loading={statsLoading}
                          error={statsError}
                          value={`${stats.avgProcessTimeHours}h`}
                        />
                      </p>
                    </div>
                    <TrendingUp className="h-8 w-8 text-primary opacity-50" />
                  </div>
                </CardContent>
              </Card>
            </HelpTarget>
          </div>
        </HelpTarget>

        {/* Approvals Table */}
        <HelpTarget
          id="approvals-table"
          scope="section"
          category={language === 'ar' ? 'الموافقات' : 'Approvals'}
          title={language === 'ar' ? 'جدول الموافقات وسير العمل' : 'Workflow Approvals Table'}
          description={language === 'ar'
            ? 'يسرد مهام موافقة المشرفين المعلقة أو المعالجة، ويوضح تفاصيل العميل، والمبلغ المطلوب، وفئة مخاطر الذكاء الاصطناعي، وحالة الأولوية.'
            : 'Lists specific pending or processed supervisor approval tasks, detailing applicant parameters, amounts, AI risk categories, and priority status.'}
          actions={language === 'ar'
            ? [
                'التبديل بين القوائم "المعلقة" و"المعالجة".',
                'اضغط على علامة الصح للموافقة أو علامة إكس للرفض للطلبات الائتمانية.',
                'اضغط على أيقونة العين لفحص تفاصيل تقرير المخاطر وتفسيرها بالذكاء الاصطناعي.'
              ]
            : [
                'Toggle between "Pending" and "Processed" lists.',
                'Click the checkmark to approve or the X to reject credit requests.',
                'Click the eye icon to inspect the detailed AI risk explanation report.'
              ]}
        >
          <Card>
            <CardHeader>
              <CardTitle>{language === 'ar' ? 'طلبات الموافقة' : 'Approval Requests'}</CardTitle>
              <CardDescription>
                {language === 'ar' 
                  ? 'جميع طلبات الموافقة المعلقة والمعالجة' 
                  : 'All pending and processed approval requests'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-4">
                <TabsList>
                  {isRole(ROLES.MANAGER) && (
                    <TabsTrigger value="manager_gate">
                      {language === 'ar' ? 'بانتظار موافقتي' : 'Awaiting My Approval'} ({awaitingManagerApprovals.length})
                    </TabsTrigger>
                  )}
                  {isRole(ROLES.AUDIT) && (
                    <TabsTrigger value="audit_gate">
                      {language === 'ar' ? 'بانتظار التدقيق' : 'Awaiting Audit'} ({awaitingAuditApprovals.length})
                    </TabsTrigger>
                  )}
                  <TabsTrigger value="pending">
                    {language === 'ar' ? 'معلقة' : 'Pending'} ({pendingApprovals.length})
                  </TabsTrigger>
                  <TabsTrigger value="processed">
                    {language === 'ar' ? 'معالجة' : 'Processed'} ({processedApprovals.length})
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{language === 'ar' ? 'الطلب' : 'Request'}</TableHead>
                    <TableHead>{language === 'ar' ? 'النوع' : 'Type'}</TableHead>
                    <TableHead>{language === 'ar' ? 'العميل' : 'Customer'}</TableHead>
                    <TableHead>{language === 'ar' ? 'الموظف' : 'Employee'}</TableHead>
                    <TableHead>{language === 'ar' ? 'المبلغ' : 'Amount'}</TableHead>
                    <TableHead>{language === 'ar' ? 'المخاطر' : 'Risk'}</TableHead>
                    <TableHead>{language === 'ar' ? 'الأولوية' : 'Priority'}</TableHead>
                    <TableHead>{language === 'ar' ? 'الإجراءات' : 'Actions'}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                        {language === 'ar' ? 'جارٍ التحميل...' : 'Loading...'}
                      </TableCell>
                    </TableRow>
                  )}
                  {!isLoading && filteredApprovals.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                        {language === 'ar' ? 'لا توجد طلبات' : 'No requests found'}
                      </TableCell>
                    </TableRow>
                  )}
                  {filteredApprovals.map((approval) => (
                    <HelpTarget
                      key={approval.id}
                      asChild
                      id={`approvals-row-${approval.id}`}
                      scope="item"
                      category={language === 'ar' ? 'صف طلب' : 'Approval Row'}
                      title={`${approval.customerName} · ${approval.id.slice(0, 8)}…`}
                      description={language === 'ar'
                        ? 'صف فردي في جدول الموافقات، يمثل طلب موافقة واحداً وتفاصيله.'
                        : 'A single row in the Approvals table, representing one approval request and its details.'}
                    >
                    <TableRow>
                      <TableCell className="font-medium">{approval.id}</TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {approval.type === 'credit' && (language === 'ar' ? 'ائتمان' : 'Credit')}
                          {approval.type === 'document' && (language === 'ar' ? 'مستند' : 'Document')}
                          {approval.type === 'exception' && (language === 'ar' ? 'استثناء' : 'Exception')}
                        </Badge>
                      </TableCell>
                      <TableCell>{approval.customerName}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 rounded-full bg-muted">
                            <User className="h-3 w-3" />
                          </div>
                          {approval.employeeName}
                        </div>
                      </TableCell>
                      <TableCell>
                        {approval.amount ? `₪${approval.amount.toLocaleString()}` : '—'}
                      </TableCell>
                      <TableCell>
                        {approval.reanalysisStatus === 'failed' ? (
                          <Badge className="bg-destructive/10 text-destructive border-destructive/20">
                            {language === 'ar' ? 'بحاجة لإعادة تحليل' : 'Needs re-analysis'}
                          </Badge>
                        ) : approval.riskScore ? (
                          <div className="flex items-center gap-2">
                            <Progress 
                              value={approval.riskScore} 
                              className={cn(
                                "w-12 h-2",
                                approval.riskCategory === 'low' && "[&>div]:bg-success",
                                approval.riskCategory === 'medium' && "[&>div]:bg-warning",
                                approval.riskCategory === 'high' && "[&>div]:bg-destructive"
                              )}
                            />
                            <Badge className={getRiskColor(approval.riskCategory)}>
                              {approval.riskScore}
                            </Badge>
                          </div>
                        ) : '—'}
                      </TableCell>
                      <TableCell>{getPriorityBadge(approval.priority, language)}</TableCell>
                      <TableCell>
                        {approval.status === 'pending_branch_manager_approval' ? (
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setDocumentViewerApproval(approval)}
                              title={language === 'ar' ? 'عرض المستند الموقّع' : 'View signed document'}
                            >
                              <FileText className="h-4 w-4" />
                            </Button>
                            {isRole(ROLES.MANAGER) && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="text-success hover:text-success"
                                  onClick={() => handleAction(approval, 'approve')}
                                  title={language === 'ar' ? 'موافقة' : 'Approve'}
                                >
                                  <CheckCircle2 className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="text-destructive hover:text-destructive"
                                  onClick={() => handleAction(approval, 'reject')}
                                  title={language === 'ar' ? 'رفض' : 'Reject'}
                                >
                                  <XCircle className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                          </div>
                        ) : approval.status === 'pending' ? (
                          <div className="flex gap-1">
                            {isRole(ROLES.RISK) && (
                              <>
                                <HelpTarget
                                  asChild
                                  id={`approvals-approve-${approval.id}`}
                                  scope="action"
                                  category={language === 'ar' ? 'إجراء' : 'Action'}
                                  title={language === 'ar' ? 'الموافقة على الطلب' : 'Approve request'}
                                  description={language === 'ar'
                                    ? 'يوافق فوراً على طلب الموافقة هذا.'
                                    : 'Immediately approves this approval request.'}
                                >
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="text-success hover:text-success"
                                    onClick={() => handleAction(approval, 'approve')}
                                  >
                                    <CheckCircle2 className="h-4 w-4" />
                                  </Button>
                                </HelpTarget>
                                <HelpTarget
                                  asChild
                                  id={`approvals-reject-${approval.id}`}
                                  scope="action"
                                  category={language === 'ar' ? 'إجراء' : 'Action'}
                                  title={language === 'ar' ? 'رفض الطلب' : 'Reject request'}
                                  description={language === 'ar'
                                    ? 'يرفض فوراً طلب الموافقة هذا.'
                                    : 'Immediately rejects this approval request.'}
                                >
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="text-destructive hover:text-destructive"
                                    onClick={() => handleAction(approval, 'reject')}
                                  >
                                    <XCircle className="h-4 w-4" />
                                  </Button>
                                </HelpTarget>
                              </>
                            )}
                            <HelpTarget
                              asChild
                              id={`approvals-view-document-${approval.id}`}
                              scope="action"
                              category={language === 'ar' ? 'إجراء' : 'Action'}
                              title={language === 'ar' ? 'عرض المستند الموقّع' : 'View signed document'}
                              description={language === 'ar'
                                ? 'يفتح مستند طلب القرض الكامل الموقّع من العميل، نفس المستند الذي راجعه المدير.'
                                : 'Opens the full signed loan-request document — the same one the Branch Manager reviewed.'}
                            >
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setDocumentViewerApproval(approval)}
                                title={language === 'ar' ? 'عرض المستند الموقّع' : 'View signed document'}
                              >
                                <FileText className="h-4 w-4" />
                              </Button>
                            </HelpTarget>
                            <HelpTarget
                              asChild
                              id={`approvals-view-${approval.id}`}
                              scope="action"
                              category={language === 'ar' ? 'إجراء' : 'Action'}
                              title={language === 'ar' ? 'عرض تفسير المخاطر' : 'View risk explanation'}
                              description={language === 'ar'
                                ? 'يفتح تقرير تفسير المخاطر المفصل بالذكاء الاصطناعي لهذا الطلب.'
                                : 'Opens the detailed AI risk explanation report for this request.'}
                            >
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => openRiskExplanation(approval)}
                                title={language === 'ar' ? 'عرض تفسير المخاطر' : 'View risk explanation'}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                            </HelpTarget>
                          </div>
                        ) : approval.status === 'pending_audit_approval' ? (
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setDocumentViewerApproval(approval)}
                              title={language === 'ar' ? 'عرض ملف الحالة الكامل' : 'View full case file'}
                            >
                              <FileText className="h-4 w-4" />
                            </Button>
                            {isRole(ROLES.AUDIT) && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="text-success hover:text-success"
                                  onClick={() => handleAction(approval, 'approve')}
                                  title={language === 'ar' ? 'موافقة نهائية' : 'Final approve'}
                                >
                                  <CheckCircle2 className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="text-destructive hover:text-destructive"
                                  onClick={() => handleAction(approval, 'reject')}
                                  title={language === 'ar' ? 'رفض' : 'Reject'}
                                >
                                  <XCircle className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center gap-1">
                            <Badge className={
                              approval.status === 'approved' || approval.status === 'audit_approved'
                                ? 'bg-success/10 text-success'
                                : 'bg-destructive/10 text-destructive'
                            }>
                              {approval.status === 'audit_approved'
                                ? (language === 'ar' ? 'معتمد نهائياً (تدقيق)' : 'Fully Approved (Audit)')
                                : approval.status === 'approved'
                                ? (language === 'ar' ? 'موافق عليه' : 'Approved')
                                : (language === 'ar' ? 'مرفوض' : 'Rejected')}
                            </Badge>
                            <HelpTarget
                              asChild
                              id={`approvals-view-${approval.id}`}
                              scope="action"
                              category={language === 'ar' ? 'إجراء' : 'Action'}
                              title={language === 'ar' ? 'عرض تفسير المخاطر' : 'View risk explanation'}
                              description={language === 'ar'
                                ? 'يفتح تقرير تفسير المخاطر المفصل بالذكاء الاصطناعي لهذا الطلب.'
                                : 'Opens the detailed AI risk explanation report for this request.'}
                            >
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => openRiskExplanation(approval)}
                                title={language === 'ar' ? 'عرض تفسير المخاطر' : 'View risk explanation'}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                            </HelpTarget>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                    </HelpTarget>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </HelpTarget>

        {/* Modification requests — visible to manager (view) and risk (view + review) */}
        {(isRole(ROLES.MANAGER) || isRole(ROLES.RISK)) && (
          <ModificationRequestsPanel
            embedded
            enabled
            canReview={isRole(ROLES.RISK)}
          />
        )}

        {/* Saved risk explanation (read-only, loaded from the saved snapshot) */}
        <Dialog
          open={riskExplanationOpen}
          onOpenChange={(open) => {
            setRiskExplanationOpen(open);
            if (!open) setRiskExplanationApproval(null);
          }}
        >
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {language === 'ar' ? 'تفسير تقييم المخاطر' : 'Risk assessment explanation'}
              </DialogTitle>
              <DialogDescription>
                {language === 'ar' ? 'عرض للقراءة فقط للبيانات المحفوظة' : 'Read-only view of the saved snapshot'}
              </DialogDescription>
            </DialogHeader>

            {riskExplanationApproval && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 rounded-lg border bg-background p-3 text-sm">
                <div>
                  <p className="text-muted-foreground">
                    {language === 'ar' ? 'اسم العميل' : 'Customer name'}
                  </p>
                  <p className="font-medium">{riskExplanationApproval.customerName}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">
                    {language === 'ar' ? 'رقم الحساب' : 'Account number'}
                  </p>
                  <p className="font-medium">{riskExplanationApproval.accountNumber ?? '—'}</p>
                </div>
                <div className="sm:col-span-2">
                  <p className="text-muted-foreground">
                    {language === 'ar' ? 'رقم الطلب' : 'Approval request ID'}
                  </p>
                  <p className="font-medium font-mono text-xs break-all">
                    {riskExplanationApproval.id}
                  </p>
                </div>
              </div>
            )}

            {riskExplanationApproval?.savedRiskExplanation ? (
              <SavedRiskExplanationView
                explanation={riskExplanationApproval.savedRiskExplanation}
                language={language}
                className="mt-4"
              />
            ) : (
              <div className="mt-4 rounded-lg border border-dashed p-8 text-center text-muted-foreground text-sm">
                {language === 'ar'
                  ? 'لا يوجد تفسير محفوظ لهذا التقييم.'
                  : 'No saved risk explanation is available for this assessment.'}
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setRiskExplanationOpen(false)}>
                {language === 'ar' ? 'إغلاق' : 'Close'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Action Dialog */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {actionType === 'view' && (language === 'ar' ? 'تفاصيل الطلب' : 'Request Details')}
                {actionType === 'approve' && (language === 'ar' ? 'تأكيد الموافقة' : 'Confirm Approval')}
                {actionType === 'reject' && (language === 'ar' ? 'تأكيد الرفض' : 'Confirm Rejection')}
              </DialogTitle>
              <DialogDescription>
                {selectedApproval?.id} - {selectedApproval?.customerName}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {selectedApproval?.amount && (
                <div className="flex justify-between p-3 bg-muted rounded-lg">
                  <span className="text-muted-foreground">
                    {language === 'ar' ? 'المبلغ' : 'Amount'}
                  </span>
                  <span className="font-semibold">₪{selectedApproval.amount.toLocaleString()}</span>
                </div>
              )}
              
              {selectedApproval?.riskScore && (
                <div className="flex justify-between p-3 bg-muted rounded-lg">
                  <span className="text-muted-foreground">
                    {language === 'ar' ? 'درجة المخاطر' : 'Risk Score'}
                  </span>
                  <Badge className={getRiskColor(selectedApproval.riskCategory)}>
                    {selectedApproval.riskScore}
                  </Badge>
                </div>
              )}

              {selectedApproval?.notes && (
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground mb-1">
                    {language === 'ar' ? 'ملاحظات الموظف' : 'Employee Notes'}
                  </p>
                  <p className="text-sm">{selectedApproval.notes}</p>
                </div>
              )}

              {/* Rule-engine gate — authoritative pass/fail source, distinct
                  from any AI narrative shown elsewhere (the "eye" icon's
                  popup). Only relevant to Risk's own Approve decision. */}
              {riskApproveGate?.state === 'not_eligible' && (
                <div className="space-y-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3">
                  <p className="text-sm font-medium text-destructive">
                    {language === 'ar'
                      ? 'فشل هذا الطلب في قواعد نسبة عبء الدين / العمر عند الاستحقاق:'
                      : 'This request failed the DBR / age-at-maturity rule engine:'}
                  </p>
                  <ul className="list-disc ps-5 text-sm text-destructive">
                    {riskApproveGate.reasons.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-destructive">
                      {language === 'ar'
                        ? 'سبب تجاوز القاعدة (مطلوب للموافقة)'
                        : 'Override reason (required to approve)'}
                    </label>
                    <Textarea
                      value={overrideReason}
                      onChange={(e) => setOverrideReason(e.target.value)}
                      placeholder={language === 'ar'
                        ? 'اشرح سبب الموافقة رغم فشل القاعدة...'
                        : 'Explain why this is being approved despite the failed rule...'}
                    />
                  </div>
                </div>
              )}

              {riskApproveGate?.state === 'unknown' && (
                <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
                  {language === 'ar'
                    ? 'لا تتوفر بيانات محرك القواعد (نسبة عبء الدين / العمر عند الاستحقاق) لهذا الطلب.'
                    : 'DBR / age-at-maturity rule-engine data is not available for this request.'}
                </div>
              )}

              {auditMissingPriorStageData && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                  {language === 'ar'
                    ? 'لا يمكن الموافقة — بيانات مرحلة المخاطر (نسبة عبء الدين / العمر عند الاستحقاق) غير مكتملة. لا يمكن تجاوز هذا الحظر.'
                    : 'Cannot approve — the Risk stage\'s DBR/age-at-maturity data is missing or incomplete. This cannot be overridden.'}
                </div>
              )}

              {actionType !== 'view' && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    {language === 'ar' ? 'تعليقك (اختياري)' : 'Your Comment (optional)'}
                  </label>
                  <Textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder={language === 'ar' ? 'أضف تعليقاً...' : 'Add a comment...'}
                  />
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                {t('common.cancel')}
              </Button>
              {actionType !== 'view' && (
                <Button
                  onClick={confirmAction}
                  disabled={
                    (riskApproveGate != null && !canSubmitApproval(riskApproveGate, overrideReason)) ||
                    auditMissingPriorStageData
                  }
                  className={actionType === 'approve' ? 'bg-success hover:bg-success/90' : 'bg-destructive hover:bg-destructive/90'}
                >
                  {actionType === 'approve'
                    ? t('approvals.approve')
                    : t('approvals.reject')}
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Signed loan-request document viewer — read-only for everyone; the
            same document Branch Manager reviewed is now also visible to Risk
            (status='pending') and, as the full case file (document + every
            prior stage's decision + the Risk-stage rule-engine/AI result),
            to Audit (status='pending_audit_approval'/'audit_approved'), with
            the same Approve/Reject actions at each stage. */}
        <Dialog open={documentViewerApproval != null} onOpenChange={(open) => !open && setDocumentViewerApproval(null)}>
          <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <div className="flex items-center justify-between gap-4">
                <DialogTitle>{language === 'ar' ? 'مستند طلب القرض' : 'Loan Request Document'}</DialogTitle>
                <Button variant="outline" size="sm" onClick={() => window.print()} className="gap-1.5">
                  <FileText className="h-4 w-4" />
                  {language === 'ar' ? 'طباعة / حفظ كـ PDF' : 'Print / Save as PDF'}
                </Button>
              </div>
            </DialogHeader>
            {documentViewerApproval && (
              <div className="space-y-4">
                <LoanRequestDocument
                  language={language}
                  data={{
                    accountNumber: documentViewerApproval.accountNumber ?? '',
                    customerName: documentViewerApproval.customerName,
                    nationalId: documentViewerApproval.nationalId ?? '',
                    monthlyIncome: documentViewerApproval.monthlyIncome ?? 0,
                    monthlyExpenses: documentViewerApproval.monthlyExpenses ?? 0,
                    existingLoans: documentViewerApproval.existingLoans ?? 0,
                    employmentType: documentViewerApproval.employmentType ?? '',
                    salaryCurrency: documentViewerApproval.salaryCurrency,
                    requestedAmount: documentViewerApproval.amount ?? 0,
                    signatureDataUrl: documentViewerApproval.signatureDataUrl,
                    date: documentViewerApproval.requestDate,
                    riskScore: documentViewerApproval.riskScore ?? null,
                    riskCategory: documentViewerApproval.riskCategory ?? null,
                    recommendedAction: documentViewerApproval.savedRiskExplanation?.recommended_action ?? null,
                  }}
                />

                {/* Approval History — full traceability across every stage. */}
                <div className="rounded-lg border border-border p-3 text-sm space-y-1.5">
                  <p className="text-xs font-medium uppercase text-muted-foreground mb-1">
                    {language === 'ar' ? 'سجل الموافقات' : 'Approval History'}
                  </p>
                  <p>
                    <span className="text-muted-foreground">
                      {language === 'ar' ? 'المدير: ' : 'Branch Manager: '}
                    </span>
                    {documentViewerApproval.managerDecisionByName && documentViewerApproval.managerDecisionAt
                      ? `${documentViewerApproval.managerDecisionByName} — ${new Date(documentViewerApproval.managerDecisionAt).toLocaleString()}`
                      : (language === 'ar' ? 'لم يُتخذ قرار بعد' : 'No decision yet')}
                  </p>
                  <p>
                    <span className="text-muted-foreground">
                      {language === 'ar' ? 'دائرة المخاطر: ' : 'Risk: '}
                    </span>
                    {documentViewerApproval.riskDecisionByName && documentViewerApproval.riskDecisionAt
                      ? `${documentViewerApproval.riskDecisionByName} — ${new Date(documentViewerApproval.riskDecisionAt).toLocaleString()}`
                      : (language === 'ar' ? 'لم يُتخذ قرار بعد' : 'No decision yet')}
                  </p>
                  <p>
                    <span className="text-muted-foreground">
                      {language === 'ar' ? 'التدقيق: ' : 'Audit: '}
                    </span>
                    {documentViewerApproval.auditDecisionByName && documentViewerApproval.auditDecisionAt
                      ? `${documentViewerApproval.auditDecisionByName} — ${new Date(documentViewerApproval.auditDecisionAt).toLocaleString()}`
                      : (language === 'ar' ? 'لم يُتخذ قرار بعد' : 'No decision yet')}
                  </p>
                </div>

                {/* Risk-stage rule engine (DBR/age-at-maturity) + AI insights —
                    same authoritative view used at the Risk stage, now part
                    of Audit's one-stop case file. */}
                {documentViewerApproval.savedRiskExplanation && (
                  <SavedRiskExplanationView
                    explanation={documentViewerApproval.savedRiskExplanation}
                    language={language}
                  />
                )}

                {auditMissingPriorStageData && documentViewerApproval.status === 'pending_audit_approval' && (
                  <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                    {language === 'ar'
                      ? 'لا يمكن الموافقة — بيانات مرحلة المخاطر غير مكتملة.'
                      : 'Cannot approve — the Risk stage\'s data is missing or incomplete.'}
                  </div>
                )}

                {((isRole(ROLES.MANAGER) && documentViewerApproval.status === 'pending_branch_manager_approval') ||
                  (isRole(ROLES.RISK) && documentViewerApproval.status === 'pending') ||
                  (isRole(ROLES.AUDIT) && documentViewerApproval.status === 'pending_audit_approval')) && (
                  <div className="flex gap-2">
                    <Button
                      className="flex-1 bg-success hover:bg-success/90"
                      disabled={
                        documentViewerApproval.status === 'pending_audit_approval' &&
                        auditApprovalBlockedByMissingData(documentViewerApproval.savedRiskExplanation?.risk_derived_features ?? null)
                      }
                      onClick={() => {
                        const approval = documentViewerApproval;
                        setDocumentViewerApproval(null);
                        handleAction(approval, 'approve');
                      }}
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      {language === 'ar' ? 'موافقة' : 'Approve'}
                    </Button>
                    <Button
                      variant="destructive"
                      className="flex-1"
                      onClick={() => {
                        const approval = documentViewerApproval;
                        setDocumentViewerApproval(null);
                        handleAction(approval, 'reject');
                      }}
                    >
                      <XCircle className="h-4 w-4" />
                      {language === 'ar' ? 'رفض' : 'Reject'}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default Approvals;
