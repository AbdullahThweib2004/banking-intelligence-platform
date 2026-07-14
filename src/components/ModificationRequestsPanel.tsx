import React, { useCallback, useEffect, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { ROLES } from '@/lib/roles';
import { supabase } from '@/integrations/supabase/client';
import { isScoringField, reanalyzeApplicationAfterModification } from '@/lib/modificationReanalysis';
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

type Status = 'pending' | 'approved' | 'rejected';

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
  status: Status;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
}

export interface ModificationRequestsPanelProps {
  /** When false, nothing is fetched or rendered. */
  enabled: boolean;
  /** Risk department may approve/reject pending requests. Managers are view-only. */
  canReview: boolean;
  /** Hide the page-level title block (for embedding in Approvals). */
  embedded?: boolean;
}

const roleLabel = (role: string | null, language: string): string => {
  switch (role) {
    case ROLES.MANAGER: return language === 'ar' ? 'مدير' : 'Manager';
    case ROLES.RISK: return language === 'ar' ? 'دائرة المخاطر' : 'Risk';
    case ROLES.EMPLOYEE: return language === 'ar' ? 'موظف' : 'Employee';
    default: return role ?? '—';
  }
};

const getStatusBadge = (status: Status, language: string) => {
  switch (status) {
    case 'approved':
      return <Badge className="bg-success/10 text-success">{language === 'ar' ? 'مقبول' : 'Approved'}</Badge>;
    case 'rejected':
      return <Badge className="bg-destructive/10 text-destructive">{language === 'ar' ? 'مرفوض' : 'Rejected'}</Badge>;
    default:
      return <Badge className="bg-warning/10 text-warning">{language === 'ar' ? 'قيد المراجعة' : 'Pending'}</Badge>;
  }
};

export const ModificationRequestsPanel: React.FC<ModificationRequestsPanelProps> = ({
  enabled,
  canReview,
  embedded = false,
}) => {
  const { t, language } = useLanguage();
  const { user, profile, role } = useAuth();
  const [requests, setRequests] = useState<ModRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'pending' | 'processed'>('pending');

  const [selected, setSelected] = useState<ModRow | null>(null);
  const [decision, setDecision] = useState<'approve' | 'reject' | 'view' | null>(null);
  const [reviewNote, setReviewNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [reanalyzing, setReanalyzing] = useState(false);

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
    setRequests(data as ModRow[]);
    setIsLoading(false);
  }, [language]);

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
    if (!selected || !decision || decision === 'view') return;
    const isApprove = decision === 'approve';
    // Capture before we clear `selected` in the async flow below.
    const reviewed = selected;

    setSubmitting(true);
    const { error } = await supabase.rpc('review_loan_modification_request', {
      request_id: reviewed.id,
      approve: isApprove,
      review_note: reviewNote.trim() || null,
    });

    if (error) {
      setSubmitting(false);
      console.error('Review failed:', error);
      toast.error(
        language === 'ar' ? `فشل المراجعة: ${error.message}` : `Review failed: ${error.message}`
      );
      return;
    }

    toast.success(
      isApprove
        ? language === 'ar'
          ? 'تمت الموافقة وتطبيق التعديل'
          : 'Approved and applied to the application'
        : language === 'ar'
          ? 'تم رفض الطلب'
          : 'Request rejected'
    );
    setSelected(null);
    setDecision(null);
    setReviewNote('');

    // Re-analysis: only when an approval changed a scoring-related field.
    // Rejected requests and non-scoring fields keep the existing score.
    if (isApprove && isScoringField(reviewed.field_name)) {
      setReanalyzing(true);
      const loadingId = toast.loading(
        language === 'ar'
          ? 'إعادة تحليل المخاطر بالقيم المحدّثة...'
          : 'Re-analyzing risk with the updated values...'
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
            ? 'فشل إعادة تحليل المخاطر. تم وضع علامة "بحاجة لإعادة تحليل" على الطلب.'
            : 'Risk re-analysis failed. The application is flagged as "needs re-analysis".';
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

  const pending = requests.filter((r) => r.status === 'pending' && matchesSearch(r));
  const processed = requests.filter((r) => r.status !== 'pending' && matchesSearch(r));
  const visible = activeTab === 'pending' ? pending : processed;

  return (
    <>
      {!embedded && (
        <div>
          <h1 className="text-3xl font-bold text-foreground">{t('nav.modificationRequests')}</h1>
          <p className="text-muted-foreground mt-1">
            {canReview
              ? language === 'ar'
                ? 'مراجعة طلبات تعديل بيانات الطلبات والموافقة عليها أو رفضها'
                : 'Review employee requests to modify application data'
              : language === 'ar'
                ? 'عرض طلبات تعديل بيانات الطلبات — الموافقة النهائية من دائرة المخاطر'
                : 'View modification requests — final approval is by Risk Department'}
          </p>
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <CardTitle>{language === 'ar' ? 'طلبات التعديل' : 'Modification Requests'}</CardTitle>
              <CardDescription>
                {canReview
                  ? language === 'ar'
                    ? 'كل طلب يعدّل حقلاً واحداً فقط بعد الموافقة'
                    : 'Each approved request changes a single field on the source application'
                  : language === 'ar'
                    ? 'عرض فقط — لا يمكن للمدير الموافقة أو الرفض'
                    : 'View only — managers cannot approve or reject'}
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
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'pending' | 'processed')} className="mb-4">
            <TabsList>
              <TabsTrigger value="pending">
                {language === 'ar' ? 'قيد المراجعة' : 'Pending'} ({pending.length})
              </TabsTrigger>
              <TabsTrigger value="processed">
                {language === 'ar' ? 'معالجة' : 'Processed'} ({processed.length})
              </TabsTrigger>
            </TabsList>
          </Tabs>

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
                <TableRow key={req.id}>
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
                  <TableCell>{getStatusBadge(req.status, language)}</TableCell>
                  <TableCell className="text-muted-foreground whitespace-nowrap text-sm">
                    {req.created_at.slice(0, 10)}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openDetails(req)}
                        title={language === 'ar' ? 'عرض التفاصيل' : 'View details'}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      {canReview && req.status === 'pending' && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-success border-success/30 hover:bg-success/10"
                            onClick={() => openReview(req, 'approve')}
                            disabled={submitting || reanalyzing}
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-destructive border-destructive/30 hover:bg-destructive/10"
                            onClick={() => openReview(req, 'reject')}
                            disabled={submitting || reanalyzing}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                      {!canReview && req.review_note && (
                        <span className="text-xs text-muted-foreground max-w-[120px] truncate" title={req.review_note}>
                          {req.review_note}
                        </span>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Review dialog (risk) or details dialog (manager / view) */}
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
                  ? 'عرض تفاصيل الطلب وحالته'
                  : 'View request details and current status'
                : decision === 'approve'
                  ? language === 'ar'
                    ? 'سيتم تطبيق التغيير على الطلب الأصلي مباشرة.'
                    : 'This will apply the change to the original application immediately.'
                  : language === 'ar'
                    ? 'سيتم رفض الطلب دون تغيير الطلب الأصلي.'
                    : 'This will reject the request without changing the original application.'}
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
                {getStatusBadge(selected.status, language)}
              </div>
              {selected.review_note && (
                <div>
                  <span className="text-muted-foreground">{language === 'ar' ? 'ملاحظة المراجعة' : 'Review note'}: </span>
                  {selected.review_note}
                </div>
              )}
              {decision !== 'view' && (
                <div className="space-y-2 pt-2">
                  <label className="text-sm font-medium">
                    {language === 'ar' ? 'ملاحظة المراجعة (اختياري)' : 'Review note (optional)'}
                  </label>
                  <Textarea
                    value={reviewNote}
                    onChange={(e) => setReviewNote(e.target.value)}
                    rows={3}
                    placeholder={language === 'ar' ? 'أضف ملاحظة...' : 'Add a note...'}
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
