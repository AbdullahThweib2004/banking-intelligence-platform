import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { ROLES } from '@/lib/roles';
import { supabase } from '@/integrations/supabase/client';
import { reanalyzeApplicationAfterModification } from '@/lib/modificationReanalysis';
import {
  MODIFICATION_STATUS,
  isManagerActionable,
  isRiskActionable,
  shouldRecalculate,
  statusLabel,
  statusStage,
  rejectedByStage,
} from '@/lib/modificationWorkflow';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Check, X, Search, Loader2, ArrowRight, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { HelpTarget } from '@/components/help';

export interface ModRow {
  id: string;
  application_id: string;
  requested_by: string | null;
  requester_name: string | null;
  requester_role: string | null;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
  reason: string;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
  // Branch-manager stage (added by 20260829090000_modification_two_stage_workflow).
  manager_decision: string | null;
  manager_decision_by: string | null;
  manager_decision_at: string | null;
  manager_decision_note: string | null;
}

export interface ModificationRequestsPanelProps {
  /** When false, nothing is fetched or rendered. */
  enabled: boolean;
  /** Hide the page-level title block (for embedding in Approvals). */
  embedded?: boolean;
}

type TabKey = 'mine' | 'awaiting_other' | 'processed';

const roleLabel = (role: string | null, language: string): string => {
  switch (role) {
    case ROLES.MANAGER: return language === 'ar' ? 'مدير' : 'Manager';
    case ROLES.RISK: return language === 'ar' ? 'دائرة المخاطر' : 'Risk';
    case ROLES.EMPLOYEE: return language === 'ar' ? 'موظف' : 'Employee';
    default: return role ?? '—';
  }
};

const StatusBadge: React.FC<{ row: ModRow; language: 'en' | 'ar' }> = ({ row, language }) => {
  const label = statusLabel(row.status, language);
  const stage = statusStage(row.status);

  if (row.status === MODIFICATION_STATUS.APPROVED) {
    return <Badge className="bg-success/10 text-success">{label}</Badge>;
  }
  if (row.status === MODIFICATION_STATUS.REJECTED) {
    const by = rejectedByStage(row);
    const suffix =
      by === 'manager'
        ? language === 'ar' ? ' (المدير)' : ' (Manager)'
        : language === 'ar' ? ' (المخاطر)' : ' (Risk)';
    return <Badge className="bg-destructive/10 text-destructive">{label}{suffix}</Badge>;
  }
  // Distinguish the two waiting states visually, not just textually.
  return stage === 'manager'
    ? <Badge className="bg-warning/10 text-warning">{label}</Badge>
    : <Badge className="bg-info/10 text-info">{label}</Badge>;
};

export const ModificationRequestsPanel: React.FC<ModificationRequestsPanelProps> = ({
  enabled,
  embedded = false,
}) => {
  const { t, language } = useLanguage();
  const { user, profile, role } = useAuth();

  const isManager = role === ROLES.MANAGER;
  const isRisk = role === ROLES.RISK;
  /** The stage this viewer owns, or null for a read-only viewer (employee). */
  const viewerStage: 'manager' | 'risk' | null = isManager ? 'manager' : isRisk ? 'risk' : null;

  const [requests, setRequests] = useState<ModRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<TabKey>(viewerStage ? 'mine' : 'processed');

  const [selected, setSelected] = useState<ModRow | null>(null);
  const [decision, setDecision] = useState<'approve' | 'reject' | 'view' | null>(null);
  const [reviewNote, setReviewNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [reanalyzing, setReanalyzing] = useState(false);

  /**
   * Risk-queue arrival notification. The Realtime subscription below already
   * refetches on any change to the table, so a manager approval reaches an
   * open Risk session immediately — this ref turns that silent refresh into a
   * visible one. Seeded on first load so an existing backlog never fires a
   * "new request arrived" toast.
   */
  const riskQueueCountRef = useRef<number | null>(null);

  const fetchRequests = useCallback(async () => {
    const { data, error } = await supabase
      .from('loan_modification_requests')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Failed to load modification requests:', error);
      toast.error(
        language === 'ar' ? `تعذر تحميل الطلبات: ${error.message}` : `Failed to load requests: ${error.message}`
      );
      setIsLoading(false);
      return;
    }

    const rows = (data ?? []) as ModRow[];

    if (isRisk) {
      const riskPending = rows.filter((r) => isRiskActionable(r.status)).length;
      const previous = riskQueueCountRef.current;
      if (previous !== null && riskPending > previous) {
        const arrived = riskPending - previous;
        toast.info(
          language === 'ar'
            ? `وصل ${arrived} طلب تعديل جديد لمراجعة دائرة المخاطر بعد موافقة المدير.`
            : `${arrived} modification request(s) approved by the Branch Manager and ready for Risk review.`
        );
      }
      riskQueueCountRef.current = riskPending;
    }

    setRequests(rows);
    setIsLoading(false);
  }, [language, isRisk]);

  useEffect(() => {
    if (!enabled) return;
    setIsLoading(true);
    fetchRequests();

    const channel = supabase
      .channel(`loan_modification_requests_${embedded ? 'embedded' : 'page'}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'loan_modification_requests' },
        () => fetchRequests()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [enabled, embedded, fetchRequests]);

  if (!enabled) return null;

  /** True when THIS viewer may decide on THIS request right now. */
  const canActOn = (req: ModRow): boolean => {
    if (viewerStage === 'manager') return isManagerActionable(req.status);
    if (viewerStage === 'risk') return isRiskActionable(req.status);
    return false;
  };

  const openReview = (req: ModRow, action: 'approve' | 'reject') => {
    setSelected(req);
    setDecision(action);
    setReviewNote('');
  };

  const openDetails = (req: ModRow) => {
    setSelected(req);
    setDecision('view');
    setReviewNote('');
  };

  const confirmReview = async () => {
    if (!selected || !decision || decision === 'view' || !viewerStage) return;
    const isApprove = decision === 'approve';
    // Capture before the async flow clears `selected`.
    const reviewed = selected;

    setSubmitting(true);

    // Stage-separated RPCs. The manager path is structurally incapable of
    // applying the field change — that logic exists only in the risk path.
    const rpcName =
      viewerStage === 'manager'
        ? 'decide_modification_request_as_manager'
        : 'decide_modification_request_as_risk';
    const rpcArgs =
      viewerStage === 'manager'
        ? { request_id: reviewed.id, approve: isApprove, decision_note: reviewNote.trim() || null }
        : { request_id: reviewed.id, approve: isApprove, review_note: reviewNote.trim() || null };

    const { error } = await supabase.rpc(rpcName, rpcArgs);

    if (error) {
      setSubmitting(false);
      console.error('Modification decision failed:', error);
      toast.error(
        language === 'ar' ? `فشل المراجعة: ${error.message}` : `Review failed: ${error.message}`
      );
      return;
    }

    // Stage-specific confirmation.
    if (viewerStage === 'manager') {
      toast.success(
        isApprove
          ? language === 'ar'
            ? 'تمت الموافقة على طلب التعديل وإرساله إلى دائرة المخاطر للمراجعة النهائية.'
            : 'Modification request approved and sent to the Risk Department for final review.'
          : language === 'ar'
            ? 'تم رفض طلب التعديل. لم يتم تطبيق أي تغيير على تقييم القرض.'
            : 'Modification request rejected. No changes were applied to the loan assessment.'
      );
    } else {
      toast.success(
        isApprove
          ? language === 'ar'
            ? 'تمت الموافقة على التعديل. سيتم إعادة احتساب تقييم القرض بالقيمة المحدّثة.'
            : 'Modification approved. The loan assessment will be recalculated using the updated value.'
          : language === 'ar'
            ? 'تم رفض طلب التعديل من دائرة المخاطر. لم يتم تطبيق أي تغيير.'
            : 'Modification request rejected by Risk Department. No changes were applied.'
      );
    }

    setSelected(null);
    setDecision(null);
    setReviewNote('');

    // Re-assessment runs ONLY after a final risk approval of a scoring field.
    // Manager approval never recalculates — nothing has been applied yet.
    const mustRecalculate = shouldRecalculate({
      stage: viewerStage,
      approve: isApprove,
      fieldName: reviewed.field_name,
    });

    if (mustRecalculate) {
      setReanalyzing(true);
      const loadingId = toast.loading(
        language === 'ar'
          ? 'إعادة احتساب التقييم والمعدل بالقيم المحدّثة...'
          : 'Recalculating the assessment and rate with the updated values...'
      );
      const result = await reanalyzeApplicationAfterModification({
        applicationId: reviewed.application_id,
        modifiedField: reviewed.field_name,
        actor: {
          id: user?.id ?? null,
          name: profile?.full_name ?? user?.email ?? null,
          role: role ?? null,
        },
      });
      toast.dismiss(loadingId);

      if (result.status === 'completed') {
        toast.success(
          language === 'ar'
            ? `تم إعادة احتساب المخاطر: ${result.oldScore ?? '—'} ← ${result.newScore} (${result.newCategory})`
            : `Risk recalculated: ${result.oldScore ?? '—'} → ${result.newScore} (${result.newCategory})`
        );
      } else if (result.status === 'failed') {
        const prefix =
          language === 'ar'
            ? 'فشل إعادة احتساب المخاطر. تم وضع علامة "بحاجة لإعادة تحليل" على الطلب.'
            : 'Risk recalculation failed. The application is flagged as "needs re-analysis".';
        toast.error(result.error ? `${prefix} (${result.error})` : prefix);
      }
      setReanalyzing(false);
    }

    setSubmitting(false);
    fetchRequests();
  };

  const matchesSearch = (r: ModRow) => {
    const q = searchTerm.toLowerCase();
    return (
      (r.requester_name ?? '').toLowerCase().includes(q) ||
      r.field_name.toLowerCase().includes(q) ||
      r.application_id.toLowerCase().includes(q) ||
      (r.reason ?? '').toLowerCase().includes(q)
    );
  };

  const searched = requests.filter(matchesSearch);

  // "mine"           = awaiting THIS viewer's decision
  // "awaiting_other" = still in flight, but owned by the other stage
  // "processed"      = terminal
  const mine = searched.filter((r) => canActOn(r));
  const awaitingOther = searched.filter(
    (r) => !canActOn(r) && statusStage(r.status) !== 'final'
  );
  const processed = searched.filter((r) => statusStage(r.status) === 'final');

  const visible =
    activeTab === 'mine' ? mine : activeTab === 'awaiting_other' ? awaitingOther : processed;

  const myQueueLabel =
    viewerStage === 'manager'
      ? language === 'ar' ? 'بانتظار مراجعة المدير' : 'Pending Manager Review'
      : language === 'ar' ? 'بانتظار مراجعة المخاطر' : 'Pending Risk Review';

  const otherQueueLabel =
    viewerStage === 'manager'
      ? language === 'ar' ? 'لدى دائرة المخاطر' : 'With Risk Department'
      : language === 'ar' ? 'بانتظار مراجعة المدير' : 'Pending Manager Review';

  const subtitle = viewerStage === 'manager'
    ? language === 'ar'
      ? 'راجع طلبات التعديل. الموافقة تُحيل الطلب إلى دائرة المخاطر للمراجعة النهائية.'
      : 'Review modification requests. Approving forwards the request to the Risk Department for final review.'
    : viewerStage === 'risk'
      ? language === 'ar'
        ? 'المراجعة النهائية لطلبات التعديل التي وافق عليها المدير. الموافقة تطبّق التغيير وتعيد احتساب التقييم.'
        : 'Final review of modification requests already approved by the Branch Manager. Approving applies the change and recalculates the assessment.'
      : language === 'ar'
        ? 'عرض حالة طلبات التعديل التي قدّمتها.'
        : 'View the status of the modification requests you submitted.';

  return (
    <>
      {!embedded && (
        <div>
          <h1 className="text-3xl font-bold text-foreground">{t('nav.modificationRequests')}</h1>
          <p className="text-muted-foreground mt-1">{subtitle}</p>
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <CardTitle>{language === 'ar' ? 'طلبات التعديل' : 'Modification Requests'}</CardTitle>
              <CardDescription>
                {language === 'ar'
                  ? 'كل طلب يعدّل حقلاً واحداً فقط، ويتطلب موافقة المدير ثم موافقة دائرة المخاطر.'
                  : 'Each request changes a single field, and needs Branch Manager approval followed by Risk Department approval.'}
              </CardDescription>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t('common.search')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 w-64"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <HelpTarget
            id="modification-requests-tabs"
            scope="item"
            category={language === 'ar' ? 'طلبات التعديل' : 'Modification Requests'}
            title={language === 'ar' ? 'تبويبات مراحل الطلب' : 'Workflow stage tabs'}
            description={language === 'ar'
              ? 'يفصل الطلبات بحسب المرحلة: بانتظار قرارك، أو بانتظار المرحلة الأخرى، أو تمت معالجتها. لا يمكنك اتخاذ إجراء إلا على الطلبات في مرحلتك.'
              : 'Splits requests by workflow stage: awaiting your decision, awaiting the other stage, or already processed. You can only act on requests in your own stage.'}
          >
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabKey)} className="mb-4">
              <TabsList>
                {viewerStage && (
                  <TabsTrigger value="mine">
                    {myQueueLabel} ({mine.length})
                  </TabsTrigger>
                )}
                <TabsTrigger value="awaiting_other">
                  {viewerStage
                    ? otherQueueLabel
                    : language === 'ar' ? 'قيد المراجعة' : 'In Review'} ({awaitingOther.length})
                </TabsTrigger>
                <TabsTrigger value="processed">
                  {language === 'ar' ? 'معالجة' : 'Processed'} ({processed.length})
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </HelpTarget>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{language === 'ar' ? 'رقم الطلب' : 'Application ID'}</TableHead>
                <TableHead>{language === 'ar' ? 'مقدم الطلب' : 'Requester'}</TableHead>
                <TableHead>{language === 'ar' ? 'الحقل' : 'Field'}</TableHead>
                <TableHead>{language === 'ar' ? 'التغيير' : 'Change'}</TableHead>
                <TableHead>{language === 'ar' ? 'السبب' : 'Reason'}</TableHead>
                <TableHead>{language === 'ar' ? 'الحالة' : 'Status'}</TableHead>
                <TableHead>{language === 'ar' ? 'التاريخ' : 'Created'}</TableHead>
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
              {!isLoading && visible.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    {language === 'ar' ? 'لا توجد طلبات' : 'No requests found'}
                  </TableCell>
                </TableRow>
              )}
              {visible.map((req) => (
                <TableRow key={req.id} data-testid="modification-request-row">
                  <TableCell className="font-mono text-xs">{req.application_id.slice(0, 8)}…</TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">{req.requester_name ?? '—'}</span>
                      <span className="text-xs text-muted-foreground">
                        {roleLabel(req.requester_role, language)}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-sm">{req.field_name}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground line-through">{req.old_value ?? '—'}</span>
                      <ArrowRight className="h-3 w-3 text-muted-foreground" />
                      <span className="font-medium">{req.new_value ?? '—'}</span>
                    </div>
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate text-muted-foreground" title={req.reason}>
                    {req.reason}
                  </TableCell>
                  <TableCell><StatusBadge row={req} language={language as 'en' | 'ar'} /></TableCell>
                  <TableCell className="text-muted-foreground whitespace-nowrap text-sm">
                    {req.created_at.slice(0, 10)}
                  </TableCell>
                  <TableCell>
                    <HelpTarget
                      id={`modification-request-actions-${req.id}`}
                      scope="action"
                      category={language === 'ar' ? 'طلبات التعديل' : 'Modification Requests'}
                      title={language === 'ar' ? 'إجراءات طلب التعديل' : 'Modification request actions'}
                      description={language === 'ar'
                        ? 'عرض تفاصيل الطلب الكاملة، أو اتخاذ قرار إن كان الطلب في مرحلتك. موافقة المدير تُحيل الطلب إلى دائرة المخاطر فقط. الموافقة النهائية من دائرة المخاطر هي وحدها التي تطبّق التغيير وتعيد احتساب التقييم والمعدل.'
                        : 'View the full request, or decide on it if the request is in your stage. Manager approval only forwards it to the Risk Department. Only the final Risk approval applies the change and recalculates the assessment and rate.'}
                      asChild
                    >
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openDetails(req)}
                          title={language === 'ar' ? 'عرض التفاصيل' : 'View details'}
                          data-testid="modification-view"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        {canActOn(req) && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-success border-success/30 hover:bg-success/10"
                              onClick={() => openReview(req, 'approve')}
                              disabled={submitting || reanalyzing}
                              data-testid="modification-approve"
                              title={language === 'ar' ? 'موافقة' : 'Approve'}
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-destructive border-destructive/30 hover:bg-destructive/10"
                              onClick={() => openReview(req, 'reject')}
                              disabled={submitting || reanalyzing}
                              data-testid="modification-reject"
                              title={language === 'ar' ? 'رفض' : 'Reject'}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </HelpTarget>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Decision dialog (own stage) or details dialog (everyone) */}
      <Dialog
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) {
            setSelected(null);
            setDecision(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {decision === 'view'
                ? language === 'ar' ? 'تفاصيل طلب التعديل' : 'Modification Request Details'
                : decision === 'approve'
                  ? language === 'ar' ? 'الموافقة على التعديل' : 'Approve Modification'
                  : language === 'ar' ? 'رفض التعديل' : 'Reject Modification'}
            </DialogTitle>
            <DialogDescription>
              {decision === 'view'
                ? language === 'ar'
                  ? 'عرض تفاصيل الطلب وحالته وقرارات المراحل السابقة.'
                  : 'View the request, its status, and prior stage decisions.'
                : decision === 'approve'
                  ? viewerStage === 'manager'
                    ? language === 'ar'
                      ? 'سيُحال الطلب إلى دائرة المخاطر للمراجعة النهائية. لن يتم تغيير التقييم الأصلي في هذه المرحلة.'
                      : 'The request will be forwarded to the Risk Department for final review. The original assessment is NOT changed at this stage.'
                    : language === 'ar'
                      ? 'سيتم تطبيق التغيير على الطلب الأصلي وإعادة احتساب التقييم والمعدل.'
                      : 'This applies the change to the original application and recalculates the assessment and rate.'
                  : language === 'ar'
                    ? 'سيتم رفض الطلب دون تغيير التقييم الأصلي.'
                    : 'This rejects the request without changing the original assessment.'}
            </DialogDescription>
          </DialogHeader>

          {selected && (
            <div className="space-y-3 py-2 text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">{language === 'ar' ? 'رقم الطلب' : 'Application ID'}</span>
                <span className="font-mono text-xs">{selected.application_id}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">{language === 'ar' ? 'مقدم الطلب' : 'Requester'}</span>
                <span>{selected.requester_name ?? '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{language === 'ar' ? 'الحقل' : 'Field'}</span>
                <span className="font-mono">{selected.field_name}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">{language === 'ar' ? 'التغيير' : 'Change'}</span>
                <span className="flex items-center gap-2">
                  <span className="line-through text-muted-foreground">{selected.old_value ?? '—'}</span>
                  <ArrowRight className="h-3 w-3" />
                  <span className="font-medium">{selected.new_value ?? '—'}</span>
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">{language === 'ar' ? 'السبب' : 'Reason'}: </span>
                {selected.reason}
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">{language === 'ar' ? 'الحالة' : 'Status'}</span>
                <StatusBadge row={selected} language={language as 'en' | 'ar'} />
              </div>

              {/* Manager decision context — what Risk needs to see before deciding. */}
              {selected.manager_decision && (
                <div className="rounded-md border border-border/60 bg-muted/40 p-3 space-y-1">
                  <div className="font-medium">
                    {language === 'ar' ? 'قرار المدير' : 'Branch Manager decision'}
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{language === 'ar' ? 'القرار' : 'Decision'}</span>
                    <span>
                      {selected.manager_decision === 'approved'
                        ? language === 'ar' ? 'موافقة' : 'Approved'
                        : language === 'ar' ? 'رفض' : 'Rejected'}
                    </span>
                  </div>
                  {selected.manager_decision_at && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{language === 'ar' ? 'التاريخ' : 'Decided at'}</span>
                      <span>{selected.manager_decision_at.slice(0, 19).replace('T', ' ')}</span>
                    </div>
                  )}
                  {selected.manager_decision_note && (
                    <div>
                      <span className="text-muted-foreground">
                        {language === 'ar' ? 'ملاحظة المدير' : 'Manager note'}:{' '}
                      </span>
                      {selected.manager_decision_note}
                    </div>
                  )}
                </div>
              )}

              {selected.review_note && (
                <div>
                  <span className="text-muted-foreground">
                    {language === 'ar' ? 'ملاحظة دائرة المخاطر' : 'Risk Department note'}:{' '}
                  </span>
                  {selected.review_note}
                </div>
              )}

              {decision !== 'view' && (
                <div className="space-y-2 pt-2">
                  <label className="text-sm font-medium">
                    {viewerStage === 'manager'
                      ? language === 'ar' ? 'ملاحظة المدير (اختياري)' : 'Manager note (optional)'
                      : language === 'ar' ? 'ملاحظة المراجعة (اختياري)' : 'Review note (optional)'}
                  </label>
                  <Textarea
                    value={reviewNote}
                    onChange={(e) => setReviewNote(e.target.value)}
                    rows={3}
                    placeholder={language === 'ar' ? 'أضف ملاحظة...' : 'Add a note...'}
                    data-testid="modification-note"
                  />
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setSelected(null);
                setDecision(null);
              }}
              disabled={submitting}
            >
              {t('common.cancel')}
            </Button>
            {decision !== 'view' && (
              <Button
                onClick={confirmReview}
                disabled={submitting}
                data-testid="modification-confirm"
                className={decision === 'approve' ? 'bg-success hover:bg-success/90' : 'bg-destructive hover:bg-destructive/90'}
              >
                {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {decision === 'approve'
                  ? language === 'ar' ? 'موافقة' : 'Approve'
                  : language === 'ar' ? 'رفض' : 'Reject'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ModificationRequestsPanel;
