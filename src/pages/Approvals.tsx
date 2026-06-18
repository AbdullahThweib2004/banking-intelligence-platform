import React, { useState, useEffect, useCallback } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { ROLES } from '@/lib/roles';
import { supabase } from '@/integrations/supabase/client';
import { useApprovalStats } from '@/hooks/useStats';
import { StatValue } from '@/components/StatValue';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
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
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface ApprovalRequest {
  id: string;
  type: 'credit' | 'document' | 'exception';
  customerName: string;
  employeeName: string;
  requestDate: string;
  amount?: number;
  riskScore?: number;
  riskCategory?: 'low' | 'medium' | 'high';
  status: 'pending' | 'approved' | 'rejected';
  notes?: string;
  priority: 'normal' | 'high' | 'urgent';
}

// Row shape as stored in the Supabase `approval_requests` table.
interface ApprovalRow {
  id: string;
  type: ApprovalRequest['type'];
  customer_name: string;
  employee_id: string | null;
  request_date: string | null;
  created_at: string;
  amount: number | null;
  risk_score: number | null;
  risk_category: ApprovalRequest['riskCategory'] | null;
  status: ApprovalRequest['status'];
  notes: string | null;
  priority: ApprovalRequest['priority'] | null;
}

const mapRow = (
  row: ApprovalRow,
  employeeNameById: Map<string, string>
): ApprovalRequest => ({
  id: row.id,
  type: row.type,
  customerName: row.customer_name,
  employeeName: (row.employee_id && employeeNameById.get(row.employee_id)) || '—',
  requestDate: row.request_date ?? row.created_at,
  amount: row.amount ?? undefined,
  riskScore: row.risk_score ?? undefined,
  riskCategory: row.risk_category ?? undefined,
  status: row.status,
  notes: row.notes ?? undefined,
  priority: row.priority ?? 'normal',
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
  const [activeTab, setActiveTab] = useState('pending');

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
  };

  const confirmAction = async () => {
    if (!selectedApproval || !actionType) return;

    if (actionType === 'view') {
      setIsDialogOpen(false);
      return;
    }

    const newStatus = actionType === 'approve' ? 'approved' : 'rejected';
    const now = new Date().toISOString();

    const { error } = await supabase
      .from('approval_requests')
      .update({
        status: newStatus,
        updated_at: now,
        approved_at: newStatus === 'approved' ? now : null,
      })
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
  };

  const pendingApprovals = approvals.filter(a => a.status === 'pending');
  const processedApprovals = approvals.filter(a => a.status !== 'pending');

  const filteredApprovals = activeTab === 'pending' ? pendingApprovals : processedApprovals;

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
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
        </div>

        {/* Approvals Table */}
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
                  <TableRow key={approval.id}>
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
                      {approval.riskScore ? (
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
                      {approval.status === 'pending' ? (
                        <div className="flex gap-1">
                          {isRole(ROLES.RISK) && (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-success hover:text-success"
                                onClick={() => handleAction(approval, 'approve')}
                              >
                                <CheckCircle2 className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-destructive hover:text-destructive"
                                onClick={() => handleAction(approval, 'reject')}
                              >
                                <XCircle className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleAction(approval, 'view')}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <Badge className={
                          approval.status === 'approved'
                            ? 'bg-success/10 text-success'
                            : 'bg-destructive/10 text-destructive'
                        }>
                          {approval.status === 'approved'
                            ? (language === 'ar' ? 'موافق عليه' : 'Approved')
                            : (language === 'ar' ? 'مرفوض' : 'Rejected')}
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

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
      </div>
    </DashboardLayout>
  );
};

export default Approvals;
