import React, { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
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
  Filter,
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

interface AuditEntry {
  id: string;
  timestamp: string;
  userId: string;
  userName: string;
  userRole: 'employee' | 'manager' | 'admin';
  action: string;
  actionType: 'create' | 'read' | 'update' | 'delete' | 'login' | 'logout' | 'approve' | 'reject';
  resource: string;
  resourceId?: string;
  details?: string;
  ipAddress: string;
}

const mockAuditLogs: AuditEntry[] = [
  {
    id: 'LOG-001',
    timestamp: '2024-01-15 14:32:45',
    userId: 'USR-001',
    userName: 'أحمد محمد',
    userRole: 'employee',
    action: 'Created credit assessment',
    actionType: 'create',
    resource: 'Credit Assessment',
    resourceId: 'APP-123',
    details: 'New credit assessment for customer: سارة أحمد',
    ipAddress: '192.168.1.45',
  },
  {
    id: 'LOG-002',
    timestamp: '2024-01-15 14:28:12',
    userId: 'USR-003',
    userName: 'خالد العمري',
    userRole: 'manager',
    action: 'Approved loan application',
    actionType: 'approve',
    resource: 'Loan Application',
    resourceId: 'APR-001',
    details: 'Approved ₪150,000 loan for medium risk customer',
    ipAddress: '192.168.1.20',
  },
  {
    id: 'LOG-003',
    timestamp: '2024-01-15 14:15:00',
    userId: 'USR-002',
    userName: 'فاطمة خالد',
    userRole: 'employee',
    action: 'Uploaded document',
    actionType: 'create',
    resource: 'Document',
    resourceId: 'DOC-045',
    details: 'Uploaded loan_application.pdf',
    ipAddress: '192.168.1.33',
  },
  {
    id: 'LOG-004',
    timestamp: '2024-01-15 13:55:30',
    userId: 'USR-005',
    userName: 'سعيد حسن',
    userRole: 'admin',
    action: 'Modified user permissions',
    actionType: 'update',
    resource: 'User',
    resourceId: 'USR-010',
    details: 'Changed role from employee to manager',
    ipAddress: '192.168.1.10',
  },
  {
    id: 'LOG-005',
    timestamp: '2024-01-15 13:45:00',
    userId: 'USR-001',
    userName: 'أحمد محمد',
    userRole: 'employee',
    action: 'User login',
    actionType: 'login',
    resource: 'Authentication',
    ipAddress: '192.168.1.45',
  },
  {
    id: 'LOG-006',
    timestamp: '2024-01-15 13:30:22',
    userId: 'USR-003',
    userName: 'خالد العمري',
    userRole: 'manager',
    action: 'Rejected loan application',
    actionType: 'reject',
    resource: 'Loan Application',
    resourceId: 'APR-002',
    details: 'Rejected due to high risk score (85)',
    ipAddress: '192.168.1.20',
  },
  {
    id: 'LOG-007',
    timestamp: '2024-01-15 12:15:10',
    userId: 'USR-002',
    userName: 'فاطمة خالد',
    userRole: 'employee',
    action: 'Viewed customer data',
    actionType: 'read',
    resource: 'Customer',
    resourceId: 'CUST-089',
    ipAddress: '192.168.1.33',
  },
  {
    id: 'LOG-008',
    timestamp: '2024-01-15 11:00:00',
    userId: 'USR-004',
    userName: 'ليلى كريم',
    userRole: 'employee',
    action: 'User logout',
    actionType: 'logout',
    resource: 'Authentication',
    ipAddress: '192.168.1.55',
  },
];

const getActionIcon = (actionType: AuditEntry['actionType']) => {
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

const getActionColor = (actionType: AuditEntry['actionType']) => {
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

const getRoleBadge = (role: AuditEntry['userRole'], language: string) => {
  switch (role) {
    case 'admin':
      return <Badge className="bg-primary/10 text-primary">{language === 'ar' ? 'مسؤول' : 'Admin'}</Badge>;
    case 'manager':
      return <Badge className="bg-info/10 text-info">{language === 'ar' ? 'مدير' : 'Manager'}</Badge>;
    default:
      return <Badge variant="outline">{language === 'ar' ? 'موظف' : 'Employee'}</Badge>;
  }
};

export const AuditLog: React.FC = () => {
  const { t, language } = useLanguage();
  const { hasPermission } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterAction, setFilterAction] = useState('all');
  const [filterRole, setFilterRole] = useState('all');

  if (!hasPermission('manager')) {
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
                ? 'هذه الصفحة متاحة للمديرين فقط' 
                : 'This page is only accessible to managers'}
            </p>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  const filteredLogs = mockAuditLogs.filter(log => {
    const matchesSearch = 
      log.userName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.resource.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesAction = filterAction === 'all' || log.actionType === filterAction;
    const matchesRole = filterRole === 'all' || log.userRole === filterRole;
    
    return matchesSearch && matchesAction && matchesRole;
  });

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
          <Button variant="outline" className="gap-2">
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
                  <p className="text-2xl font-bold">2,847</p>
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
                  <p className="text-2xl font-bold">156</p>
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
                  <p className="text-2xl font-bold">24</p>
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
                  <p className="text-2xl font-bold text-warning">3</p>
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
                  </SelectContent>
                </Select>
                <Select value={filterRole} onValueChange={setFilterRole}>
                  <SelectTrigger className="w-36">
                    <SelectValue placeholder={language === 'ar' ? 'الدور' : 'Role'} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{language === 'ar' ? 'الكل' : 'All'}</SelectItem>
                    <SelectItem value="admin">{language === 'ar' ? 'مسؤول' : 'Admin'}</SelectItem>
                    <SelectItem value="manager">{language === 'ar' ? 'مدير' : 'Manager'}</SelectItem>
                    <SelectItem value="employee">{language === 'ar' ? 'موظف' : 'Employee'}</SelectItem>
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
                  <TableHead>{language === 'ar' ? 'IP' : 'IP Address'}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
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
                          <div className={cn("p-1.5 rounded-lg", getActionColor(log.actionType))}>
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
                      <TableCell className="max-w-[200px] truncate text-muted-foreground">
                        {log.details || '—'}
                      </TableCell>
                      <TableCell className="text-muted-foreground font-mono text-sm">
                        {log.ipAddress}
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
