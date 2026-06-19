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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Search,
  Download,
  User,
  FileText,
  TrendingUp,
  Settings,
  LogIn,
  LogOut,
  AlertTriangle,
  Eye,
  Edit,
  Trash2,
  CheckCircle2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

type ActionType =
  | 'create'
  | 'read'
  | 'update'
  | 'delete'
  | 'login'
  | 'logout'
  | 'approve'
  | 'reject'
  | 'other';

type Severity = 'info' | 'warning' | 'error';

interface AuditRow {
  id: string;
  user_id: string | null;
  user_name: string | null;
  user_role: string | null;
  action: string;
  resource: string | null;
  resource_id: string | null;
  details: string | null;
  ip_address: string | null;
  created_at: string;
  severity: Severity | null;
}

interface AuditEntry {
  id: string;
  timestamp: string;
  userId: string | null;
  userName: string;
  userRole: string | null;
  action: string;
  actionType: ActionType;
  resource: string;
  resourceId: string | null;
  details: string | null;
  ipAddress: string | null;
  severity: Severity;
}

const PAGE_SIZE = 50;

const formatTimestamp = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

const inferActionType = (action: string): ActionType => {
  const a = (action || '').toLowerCase();
  if (a.includes('approv')) return 'approve';
  if (a.includes('reject')) return 'reject';
  if (a.includes('creat')) return 'create';
  if (a.includes('delet')) return 'delete';
  if (a.includes('updat') || a.includes('chang') || a.includes('modif')) return 'update';
  if (a.includes('logout') || a.includes('sign out')) return 'logout';
  if (a.includes('login') || a.includes('sign in') || a.includes('logged in')) return 'login';
  if (a.includes('view') || a.includes('read')) return 'read';
  return 'other';
};

const mapRow = (row: AuditRow): AuditEntry => ({
  id: row.id,
  timestamp: formatTimestamp(row.created_at),
  userId: row.user_id,
  userName: row.user_name ?? '—',
  userRole: row.user_role,
  action: row.action,
  actionType: inferActionType(row.action),
  resource: row.resource ?? '—',
  resourceId: row.resource_id,
  details: row.details,
  ipAddress: row.ip_address,
  severity: (row.severity as Severity) ?? 'info',
});

const getActionIcon = (actionType: ActionType) => {
  switch (actionType) {
    case 'create': return Edit;
    case 'read': return Eye;
    case 'update': return Settings;
    case 'delete': return Trash2;
    case 'login': return LogIn;
    case 'logout': return LogOut;
    case 'approve': return CheckCircle2;
    case 'reject': return AlertTriangle;
    default: return FileText;
  }
};

const getActionColor = (actionType: ActionType) => {
  switch (actionType) {
    case 'create': return 'text-success bg-success/10';
    case 'read': return 'text-info bg-info/10';
    case 'update': return 'text-warning bg-warning/10';
    case 'delete': return 'text-destructive bg-destructive/10';
    case 'login': return 'text-success bg-success/10';
    case 'logout': return 'text-muted-foreground bg-muted';
    case 'approve': return 'text-success bg-success/10';
    case 'reject': return 'text-destructive bg-destructive/10';
    default: return 'text-muted-foreground bg-muted';
  }
};

const getRoleBadge = (role: string | null, language: string) => {
  switch (role) {
    case ROLES.MANAGER:
      return <Badge className="bg-info/10 text-info">{language === 'ar' ? 'مدير' : 'Manager'}</Badge>;
    case ROLES.RISK:
      return <Badge className="bg-primary/10 text-primary">{language === 'ar' ? 'دائرة المخاطر' : 'Risk'}</Badge>;
    case ROLES.EMPLOYEE:
      return <Badge variant="outline">{language === 'ar' ? 'موظف' : 'Employee'}</Badge>;
    default:
      return <Badge variant="outline">{role ?? '—'}</Badge>;
  }
};

const getSeverityBadge = (severity: Severity, language: string) => {
  switch (severity) {
    case 'error':
      return <Badge className="bg-destructive/10 text-destructive">{language === 'ar' ? 'خطأ' : 'Error'}</Badge>;
    case 'warning':
      return <Badge className="bg-warning/10 text-warning">{language === 'ar' ? 'تحذير' : 'Warning'}</Badge>;
    default:
      return <Badge className="bg-info/10 text-info">{language === 'ar' ? 'معلومة' : 'Info'}</Badge>;
  }
};

const truncate = (text: string | null, max = 50): string => {
  if (!text) return '—';
  return text.length > max ? `${text.slice(0, max)}…` : text;
};

const csvEscape = (value: unknown): string => {
  const s = value == null ? '' : String(value);
  return `"${s.replace(/"/g, '""')}"`;
};

export const AuditLog: React.FC = () => {
  const { t, language } = useLanguage();
  const { isRole } = useAuth();
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterAction, setFilterAction] = useState('all');
  const [filterSeverity, setFilterSeverity] = useState('all');
  const [stats, setStats] = useState({ total: 0, today: 0, activeUsers: 0, alerts: 0 });

  const canRead = isRole(ROLES.RISK);

  const fetchLogs = useCallback(async () => {
    let query = supabase
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE);

    if (filterSeverity !== 'all') {
      query = query.eq('severity', filterSeverity);
    }
    if (searchTerm.trim()) {
      const term = `%${searchTerm.trim()}%`;
      query = query.or(
        `user_name.ilike.${term},action.ilike.${term},resource.ilike.${term},details.ilike.${term}`
      );
    }

    const { data, error } = await query;
    if (error) {
      console.error('Failed to load audit logs:', error);
      toast.error(
        language === 'ar' ? `تعذر تحميل السجل: ${error.message}` : `Failed to load logs: ${error.message}`
      );
      setIsLoading(false);
      return;
    }

    setLogs((data as AuditRow[]).map(mapRow));
    setIsLoading(false);
  }, [filterSeverity, searchTerm, language]);

  const fetchStats = useCallback(async () => {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const todayIso = startOfToday.toISOString();

    const [totalRes, todayRes, alertsRes, activeRes] = await Promise.all([
      supabase.from('audit_logs').select('*', { count: 'exact', head: true }),
      supabase.from('audit_logs').select('*', { count: 'exact', head: true }).gte('created_at', todayIso),
      supabase
        .from('audit_logs')
        .select('*', { count: 'exact', head: true })
        .in('severity', ['warning', 'error'])
        .gte('created_at', todayIso),
      supabase.from('audit_logs').select('user_id').gte('created_at', todayIso),
    ]);

    const activeUsers = new Set(
      (activeRes.data ?? [])
        .map((r: { user_id: string | null }) => r.user_id)
        .filter((id): id is string => Boolean(id))
    ).size;

    setStats({
      total: totalRes.count ?? 0,
      today: todayRes.count ?? 0,
      activeUsers,
      alerts: alertsRes.count ?? 0,
    });
  }, []);

  useEffect(() => {
    if (!canRead) return;
    fetchLogs();
  }, [canRead, fetchLogs]);

  useEffect(() => {
    if (!canRead) return;
    fetchStats();

    const channel = supabase
      .channel('audit_logs_changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'audit_logs' },
        () => {
          fetchLogs();
          fetchStats();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [canRead, fetchLogs, fetchStats]);

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

  const filteredLogs = logs.filter(
    (log) => filterAction === 'all' || log.actionType === filterAction
  );

  const handleExport = () => {
    if (filteredLogs.length === 0) {
      toast.error(language === 'ar' ? 'لا توجد بيانات للتصدير' : 'No data to export');
      return;
    }

    const headers = [
      'Timestamp',
      'User',
      'Role',
      'Action',
      'Resource',
      'Resource ID',
      'Details',
      'IP Address',
      'Severity',
    ];
    const rows = filteredLogs.map((log) => [
      log.timestamp,
      log.userName,
      log.userRole ?? '',
      log.action,
      log.resource,
      log.resourceId ?? '',
      log.details ?? '',
      log.ipAddress ?? '',
      log.severity,
    ]);

    const csv = [headers, ...rows]
      .map((row) => row.map(csvEscape).join(','))
      .join('\n');

    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast.success(language === 'ar' ? 'تم تصدير السجل' : 'Audit log exported');
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground">{t('nav.auditLog')}</h1>
            <p className="text-muted-foreground mt-1">
              {language === 'ar'
                ? 'تتبع جميع أنشطة المستخدمين على المنصة'
                : 'Track all user activities on the platform'}
            </p>
          </div>
          <Button variant="outline" className="gap-2" onClick={handleExport}>
            <Download className="h-4 w-4" />
            {t('common.export')}
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="stat-card">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">
                    {language === 'ar' ? 'إجمالي الأحداث' : 'Total Events'}
                  </p>
                  <p className="text-2xl font-bold">{stats.total.toLocaleString()}</p>
                </div>
                <FileText className="h-8 w-8 text-primary opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card className="stat-card">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">
                    {language === 'ar' ? 'اليوم' : 'Today'}
                  </p>
                  <p className="text-2xl font-bold">{stats.today.toLocaleString()}</p>
                </div>
                <TrendingUp className="h-8 w-8 text-success opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card className="stat-card">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">
                    {language === 'ar' ? 'مستخدمون نشطون' : 'Active Users'}
                  </p>
                  <p className="text-2xl font-bold">{stats.activeUsers.toLocaleString()}</p>
                </div>
                <User className="h-8 w-8 text-info opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card className="stat-card">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">
                    {language === 'ar' ? 'تنبيهات' : 'Alerts'}
                  </p>
                  <p className="text-2xl font-bold text-warning">{stats.alerts.toLocaleString()}</p>
                </div>
                <AlertTriangle className="h-8 w-8 text-warning opacity-50" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Audit Log Table */}
        <Card>
          <CardHeader>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <CardTitle>{language === 'ar' ? 'سجل الأنشطة' : 'Activity Log'}</CardTitle>
                <CardDescription>
                  {language === 'ar'
                    ? 'جميع الأنشطة والإجراءات على المنصة'
                    : 'All activities and actions on the platform'}
                </CardDescription>
              </div>
              <div className="flex gap-3 flex-wrap">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder={t('common.search')}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9 w-48"
                  />
                </div>
                <Select value={filterAction} onValueChange={setFilterAction}>
                  <SelectTrigger className="w-36">
                    <SelectValue placeholder={language === 'ar' ? 'الإجراء' : 'Action'} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{language === 'ar' ? 'الكل' : 'All'}</SelectItem>
                    <SelectItem value="create">{language === 'ar' ? 'إنشاء' : 'Create'}</SelectItem>
                    <SelectItem value="read">{language === 'ar' ? 'عرض' : 'Read'}</SelectItem>
                    <SelectItem value="update">{language === 'ar' ? 'تعديل' : 'Update'}</SelectItem>
                    <SelectItem value="delete">{language === 'ar' ? 'حذف' : 'Delete'}</SelectItem>
                    <SelectItem value="approve">{language === 'ar' ? 'موافقة' : 'Approve'}</SelectItem>
                    <SelectItem value="reject">{language === 'ar' ? 'رفض' : 'Reject'}</SelectItem>
                    <SelectItem value="login">{language === 'ar' ? 'دخول' : 'Login'}</SelectItem>
                    <SelectItem value="logout">{language === 'ar' ? 'خروج' : 'Logout'}</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={filterSeverity} onValueChange={setFilterSeverity}>
                  <SelectTrigger className="w-36">
                    <SelectValue placeholder={language === 'ar' ? 'الخطورة' : 'Severity'} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{language === 'ar' ? 'الكل' : 'All'}</SelectItem>
                    <SelectItem value="info">{language === 'ar' ? 'معلومة' : 'Info'}</SelectItem>
                    <SelectItem value="warning">{language === 'ar' ? 'تحذير' : 'Warning'}</SelectItem>
                    <SelectItem value="error">{language === 'ar' ? 'خطأ' : 'Error'}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{language === 'ar' ? 'الوقت' : 'Timestamp'}</TableHead>
                  <TableHead>{language === 'ar' ? 'المستخدم' : 'User'}</TableHead>
                  <TableHead>{language === 'ar' ? 'الإجراء' : 'Action'}</TableHead>
                  <TableHead>{language === 'ar' ? 'المورد' : 'Resource'}</TableHead>
                  <TableHead>{language === 'ar' ? 'التفاصيل' : 'Details'}</TableHead>
                  <TableHead>{language === 'ar' ? 'الخطورة' : 'Severity'}</TableHead>
                  <TableHead>{language === 'ar' ? 'IP' : 'IP Address'}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      {language === 'ar' ? 'جارٍ التحميل...' : 'Loading...'}
                    </TableCell>
                  </TableRow>
                )}
                {!isLoading && filteredLogs.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      {language === 'ar' ? 'لا توجد سجلات' : 'No log entries found'}
                    </TableCell>
                  </TableRow>
                )}
                {filteredLogs.map((log) => {
                  const Icon = getActionIcon(log.actionType);
                  return (
                    <TableRow key={log.id}>
                      <TableCell className="text-muted-foreground whitespace-nowrap">
                        {log.timestamp}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="flex flex-col">
                            <span className="font-medium">{log.userName}</span>
                            {getRoleBadge(log.userRole, language)}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className={cn('p-1.5 rounded-lg', getActionColor(log.actionType))}>
                            <Icon className="h-3.5 w-3.5" />
                          </div>
                          <span>{log.action}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span>{log.resource}</span>
                          {log.resourceId && (
                            <span className="text-xs text-muted-foreground">{log.resourceId}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[200px] text-muted-foreground" title={log.details ?? ''}>
                        {truncate(log.details)}
                      </TableCell>
                      <TableCell>{getSeverityBadge(log.severity, language)}</TableCell>
                      <TableCell className="text-muted-foreground font-mono text-sm">
                        {log.ipAddress ?? '—'}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default AuditLog;
