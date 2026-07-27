import { useCallback, useEffect, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { HelpTarget } from '@/components/help';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import { CheckCircle2, XCircle, FileText, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { ApprovalCaseFile } from '@/components/ApprovalCaseFile';
import { auditApprovalBlockedByMissingData } from '@/lib/riskDecisionGate';
import {
  mapApprovalRow,
  type ApprovalRequest,
  type ApprovalRow,
} from '@/lib/approvalRequests';

/**
 * Audit's own, fully separate dashboard page — a distinct account/role from
 * Risk and Branch Manager, with its own route (/audit-approvals) and no
 * shared file with src/pages/Approvals.tsx. RLS ensures this page only ever
 * receives rows that already passed Risk approval (status IN
 * ('pending_audit_approval', 'audit_approved')), plus Audit's own past
 * rejections — never anything still at the Manager or Risk stage.
 */
export default function AuditApprovals() {
  const { language } = useLanguage();
  const { user } = useAuth();
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('pending_audit');

  const [documentViewerApproval, setDocumentViewerApproval] = useState<ApprovalRequest | null>(null);
  const [selectedApproval, setSelectedApproval] = useState<ApprovalRequest | null>(null);
  const [actionType, setActionType] = useState<'approve' | 'reject' | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [comment, setComment] = useState('');

  const t = (en: string, ar: string) => (language === 'ar' ? ar : en);

  const fetchApprovals = useCallback(async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('approval_requests')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Failed to load audit queue:', error);
      toast.error(t(`Failed to load requests: ${error.message}`, `تعذر تحميل الطلبات: ${error.message}`));
      setIsLoading(false);
      return;
    }

    const { data: profiles } = await supabase.from('profiles').select('id, full_name');
    const nameById = new Map((profiles ?? []).map((p) => [p.id as string, p.full_name as string]));

    setApprovals((data as ApprovalRow[]).map((row) => mapApprovalRow(row, nameById)));
    setIsLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language]);

  useEffect(() => {
    fetchApprovals();
    const channel = supabase
      .channel('audit_approval_requests_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'approval_requests' }, () => fetchApprovals())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchApprovals]);

  const handleAction = (approval: ApprovalRequest, action: 'approve' | 'reject') => {
    setSelectedApproval(approval);
    setActionType(action);
    setIsDialogOpen(true);
    setComment('');
  };

  const missingPriorStageData =
    actionType === 'approve' &&
    auditApprovalBlockedByMissingData(selectedApproval?.savedRiskExplanation?.risk_derived_features ?? null);

  const confirmAction = async () => {
    if (!selectedApproval || !actionType || !user) return;

    if (missingPriorStageData) {
      toast.error(
        t(
          "Cannot approve — the Risk stage's DBR/age-at-maturity data is missing or incomplete.",
          'لا يمكن الموافقة — بيانات مرحلة المخاطر غير مكتملة.'
        )
      );
      return;
    }

    const now = new Date().toISOString();
    const newStatus = actionType === 'approve' ? 'audit_approved' : 'rejected';

    const { error } = await supabase
      .from('approval_requests')
      .update({
        status: newStatus,
        updated_at: now,
        audit_decision_by: user.id,
        audit_decision_at: now,
        // audit_approved is the true final state; approved_at feeds the
        // "Approved Today" / avg-processing-time stats.
        approved_at: newStatus === 'audit_approved' ? now : null,
      })
      .eq('id', selectedApproval.id);

    if (error) {
      console.error('Failed to record audit decision:', error);
      toast.error(t(`Failed to update request: ${error.message}`, `فشل تحديث الطلب: ${error.message}`));
      return;
    }

    setApprovals((prev) => prev.map((a) => (a.id === selectedApproval.id ? { ...a, status: newStatus } : a)));
    toast.success(
      actionType === 'approve'
        ? t('Approved. This request is now fully approved.', 'تمت الموافقة النهائية على هذا الطلب.')
        : t('Rejected.', 'تم الرفض.')
    );
    setIsDialogOpen(false);
    setSelectedApproval(null);
    setActionType(null);
  };

  const awaitingAudit = approvals.filter((a) => a.status === 'pending_audit_approval');
  const processed = approvals.filter((a) => a.status !== 'pending_audit_approval');
  const rows = activeTab === 'pending_audit' ? awaitingAudit : processed;

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-3xl font-bold text-foreground">{t('Loan Approvals', 'موافقات القروض')}</h1>
          <p className="text-muted-foreground mt-1">
            {t(
              'Final review of loan requests that already passed Branch Manager and Risk approval.',
              'المراجعة النهائية لطلبات القروض التي وافق عليها المدير ودائرة المخاطر بالفعل.'
            )}
          </p>
        </div>

        <HelpTarget
          id="audit-approvals-table"
          scope="section"
          category={t('Audit', 'التدقيق')}
          title={t('Audit Review Queue', 'قائمة مراجعة التدقيق')}
          description={t(
            'Lists loan requests awaiting Audit\'s final decision, and those already processed by Audit.',
            'يسرد طلبات القروض بانتظار قرار التدقيق النهائي، والطلبات التي عالجها التدقيق بالفعل.'
          )}
        >
          <Card>
            <CardHeader>
              <CardTitle>{t('Loan Requests', 'طلبات القروض')}</CardTitle>
              <CardDescription>
                {t('Only requests that passed Risk approval appear here.', 'لا تظهر هنا إلا الطلبات التي وافقت عليها دائرة المخاطر.')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-4">
                <TabsList>
                  <TabsTrigger value="pending_audit">
                    {t('Awaiting Audit', 'بانتظار التدقيق')} ({awaitingAudit.length})
                  </TabsTrigger>
                  <TabsTrigger value="processed">
                    {t('Processed', 'معالجة')} ({processed.length})
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('Account', 'الحساب')}</TableHead>
                    <TableHead>{t('Customer', 'العميل')}</TableHead>
                    <TableHead>{t('Amount', 'المبلغ')}</TableHead>
                    <TableHead>{t('Status', 'الحالة')}</TableHead>
                    <TableHead>{t('Actions', 'الإجراءات')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                        {t('Loading...', 'جارٍ التحميل...')}
                      </TableCell>
                    </TableRow>
                  )}
                  {!isLoading && rows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                        {t('No requests found', 'لا توجد طلبات')}
                      </TableCell>
                    </TableRow>
                  )}
                  {rows.map((approval) => (
                    <TableRow key={approval.id}>
                      <TableCell className="font-mono text-xs">{approval.accountNumber ?? '—'}</TableCell>
                      <TableCell>{approval.customerName}</TableCell>
                      <TableCell>{approval.amount ? `₪${approval.amount.toLocaleString()}` : '—'}</TableCell>
                      <TableCell>
                        {approval.status === 'pending_audit_approval' && (
                          <Badge className="bg-info/10 text-info">
                            <Clock className="h-3 w-3 mr-1" />
                            {t('Awaiting Audit', 'بانتظار التدقيق')}
                          </Badge>
                        )}
                        {approval.status === 'audit_approved' && (
                          <Badge className="bg-success/10 text-success">{t('Fully Approved', 'معتمد نهائياً')}</Badge>
                        )}
                        {approval.status === 'rejected' && (
                          <Badge className="bg-destructive/10 text-destructive">{t('Rejected', 'مرفوض')}</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDocumentViewerApproval(approval)}
                            title={t('View full case file', 'عرض ملف الحالة الكامل')}
                          >
                            <FileText className="h-4 w-4" />
                          </Button>
                          {approval.status === 'pending_audit_approval' && (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-success hover:text-success"
                                onClick={() => handleAction(approval, 'approve')}
                                title={t('Final approve', 'موافقة نهائية')}
                              >
                                <CheckCircle2 className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-destructive hover:text-destructive"
                                onClick={() => handleAction(approval, 'reject')}
                                title={t('Reject', 'رفض')}
                              >
                                <XCircle className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </HelpTarget>
      </div>

      {/* Full case file viewer */}
      <Dialog open={documentViewerApproval != null} onOpenChange={(open) => !open && setDocumentViewerApproval(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('Loan Request Case File', 'ملف طلب القرض')}</DialogTitle>
          </DialogHeader>
          {documentViewerApproval && (
            <div className="space-y-4">
              <ApprovalCaseFile
                approval={documentViewerApproval}
                language={language}
                blockedMessage={
                  documentViewerApproval.status === 'pending_audit_approval' &&
                  auditApprovalBlockedByMissingData(documentViewerApproval.savedRiskExplanation?.risk_derived_features ?? null)
                    ? t(
                        "Cannot approve — the Risk stage's data is missing or incomplete.",
                        'لا يمكن الموافقة — بيانات مرحلة المخاطر غير مكتملة.'
                      )
                    : null
                }
              />
              {documentViewerApproval.status === 'pending_audit_approval' && (
                <div className="flex gap-2">
                  <Button
                    className="flex-1 bg-success hover:bg-success/90"
                    disabled={auditApprovalBlockedByMissingData(documentViewerApproval.savedRiskExplanation?.risk_derived_features ?? null)}
                    onClick={() => {
                      const approval = documentViewerApproval;
                      setDocumentViewerApproval(null);
                      handleAction(approval, 'approve');
                    }}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    {t('Approve', 'موافقة')}
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
                    {t('Reject', 'رفض')}
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Confirm dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionType === 'approve' ? t('Confirm Final Approval', 'تأكيد الموافقة النهائية') : t('Confirm Rejection', 'تأكيد الرفض')}
            </DialogTitle>
            <DialogDescription>
              {selectedApproval?.id} - {selectedApproval?.customerName}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {missingPriorStageData && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                {t(
                  "Cannot approve — the Risk stage's DBR/age-at-maturity data is missing or incomplete. This cannot be overridden.",
                  'لا يمكن الموافقة — بيانات مرحلة المخاطر غير مكتملة. لا يمكن تجاوز هذا الحظر.'
                )}
              </div>
            )}
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('Your Comment (optional)', 'تعليقك (اختياري)')}</label>
              <Textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder={t('Add a comment...', 'أضف تعليقاً...')}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              {t('Cancel', 'إلغاء')}
            </Button>
            <Button
              onClick={confirmAction}
              disabled={missingPriorStageData}
              className={actionType === 'approve' ? 'bg-success hover:bg-success/90' : 'bg-destructive hover:bg-destructive/90'}
            >
              {actionType === 'approve' ? t('Approve', 'موافقة') : t('Reject', 'رفض')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
