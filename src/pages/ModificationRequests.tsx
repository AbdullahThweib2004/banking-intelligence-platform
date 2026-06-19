import React, { useCallback, useEffect, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { ROLES } from '@/lib/roles';
import { supabase } from '@/integrations/supabase/client';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
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
import { AlertTriangle, Check, X, Search, Loader2, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';

type Status = 'pending' | 'approved' | 'rejected';

interface ModRow {
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

export const ModificationRequests: React.FC = () => {
  const { t, language } = useLanguage();
  const { isRole } = useAuth();
  const [requests, setRequests] = useState<ModRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'pending' | 'processed'>('pending');

  const [selected, setSelected] = useState<ModRow | null>(null);
  const [decision, setDecision] = useState<'approve' | 'reject' | null>(null);
  const [reviewNote, setReviewNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const canRead = isRole(ROLES.RISK);

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
    if (!canRead) return;
    fetchRequests();

    const channel = supabase
      .channel('loan_modification_requests_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'loan_modification_requests' },
        () => fetchRequests()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [canRead, fetchRequests]);

  if (!canRead) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-[calc(100vh-12rem)]">
          <Card className="p-8 text-center">
            <AlertTriangle className="h-12 w-12 text-warning mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">
              {language === 'ar' ? 'غير مصرح' : 'Access Denied'}
            </h2>
            <p className="text-muted-foreground">
              {language === 'ar'
                ? 'هذه الصفحة متاحة لدائرة المخاطر فقط'
                : 'This page is only accessible to the risk department'}
            </p>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  const openReview = (req: ModRow, action: 'approve' | 'reject') => {
    setSelected(req);
    setDecision(action);
    setReviewNote('');
  };

  const confirmReview = async () => {
    if (!selected || !decision) return;
    setSubmitting(true);
    const { error } = await supabase.rpc('review_loan_modification_request', {
      request_id: selected.id,
      approve: decision === 'approve',
      review_note: reviewNote.trim() || null,
    });
    setSubmitting(false);

    if (error) {
      console.error('Review failed:', error);
      toast.error(
        language === 'ar' ? `فشل المراجعة: ${error.message}` : `Review failed: ${error.message}`
      );
      return;
    }

    toast.success(
      decision === 'approve'
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
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-foreground">
            {t('nav.modificationRequests')}
          </h1>
          <p className="text-muted-foreground mt-1">
            {language === 'ar'
              ? 'مراجعة طلبات تعديل بيانات الطلبات والموافقة عليها أو رفضها'
              : 'Review employee requests to modify application data'}
          </p>
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <CardTitle>{language === 'ar' ? 'طلبات التعديل' : 'Modification Requests'}</CardTitle>
                <CardDescription>
                  {language === 'ar'
                    ? 'كل طلب يعدّل حقلاً واحداً فقط بعد الموافقة'
                    : 'Each approved request changes a single field on the source application'}
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
                      {req.status === 'pending' ? (
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-success border-success/30 hover:bg-success/10"
                            onClick={() => openReview(req, 'approve')}
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-destructive border-destructive/30 hover:bg-destructive/10"
                            onClick={() => openReview(req, 'reject')}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {req.review_note ? req.review_note : '—'}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Review dialog */}
      <Dialog open={!!selected} onOpenChange={(open) => { if (!open) { setSelected(null); setDecision(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {decision === 'approve'
                ? language === 'ar' ? 'الموافقة على التعديل' : 'Approve Modification'
                : language === 'ar' ? 'رفض التعديل' : 'Reject Modification'}
            </DialogTitle>
            <DialogDescription>
              {decision === 'approve'
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
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => { setSelected(null); setDecision(null); }} disabled={submitting}>
              {t('common.cancel')}
            </Button>
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
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default ModificationRequests;
