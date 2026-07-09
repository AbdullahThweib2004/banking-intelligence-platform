import React, { useCallback, useEffect, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { ROLES, type Role } from '@/lib/roles';
import { supabase } from '@/integrations/supabase/client';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { HelpTarget } from '@/components/help';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Users,
  Plus,
  Search,
  MoreHorizontal,
  Trash2,
  Shield,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';

type Status = 'active' | 'inactive' | 'suspended';

interface AppUser {
  id: string;
  email: string | null;
  fullName: string | null;
  role: Role;
  department: string | null;
  status: Status;
  createdAt: string | null;
  lastLogin: string | null;
}

interface ProfileRow {
  id: string;
  full_name: string | null;
  email: string | null;
  role: Role;
  department: string | null;
  status: Status | null;
  created_at: string | null;
}

const mapRow = (row: ProfileRow): AppUser => ({
  id: row.id,
  email: row.email,
  fullName: row.full_name,
  role: row.role,
  department: row.department,
  status: (row.status as Status) ?? 'active',
  createdAt: row.created_at,
  lastLogin: null,
});

const roleLabel = (role: Role, language: string): string => {
  switch (role) {
    case ROLES.MANAGER:
      return language === 'ar' ? 'مدير' : 'Manager';
    case ROLES.RISK:
      return language === 'ar' ? 'دائرة المخاطر' : 'Risk';
    default:
      return language === 'ar' ? 'موظف' : 'Employee';
  }
};

const getRoleBadge = (role: Role, language: string) => {
  switch (role) {
    case ROLES.MANAGER:
      return (
        <Badge className="bg-info/10 text-info border-info/20 gap-1">
          <ShieldCheck className="h-3 w-3" />
          {roleLabel(role, language)}
        </Badge>
      );
    case ROLES.RISK:
      return (
        <Badge className="bg-primary/10 text-primary border-primary/20 gap-1">
          <ShieldAlert className="h-3 w-3" />
          {roleLabel(role, language)}
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className="gap-1">
          <Shield className="h-3 w-3" />
          {roleLabel(role, language)}
        </Badge>
      );
  }
};

const getStatusBadge = (status: Status, language: string) => {
  switch (status) {
    case 'active':
      return <Badge className="bg-success/10 text-success">{language === 'ar' ? 'نشط' : 'Active'}</Badge>;
    case 'inactive':
      return <Badge className="bg-muted text-muted-foreground">{language === 'ar' ? 'غير نشط' : 'Inactive'}</Badge>;
    case 'suspended':
      return <Badge className="bg-destructive/10 text-destructive">{language === 'ar' ? 'معلق' : 'Suspended'}</Badge>;
  }
};

/** Extract a human-readable error message from a functions.invoke() failure. */
async function readInvokeError(error: unknown): Promise<string> {
  const fallback = (error as Error)?.message ?? 'Request failed';
  const ctx = (error as { context?: Response })?.context;
  if (ctx && typeof ctx.json === 'function') {
    try {
      const body = await ctx.json();
      if (body?.error) return String(body.error);
    } catch {
      /* ignore */
    }
  }
  return fallback;
}

export const UserManagement: React.FC = () => {
  const { t, language } = useLanguage();
  const { isRole } = useAuth();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [newUser, setNewUser] = useState({
    email: '',
    fullName: '',
    role: ROLES.EMPLOYEE as Role,
    department: '',
  });

  const fetchUsers = useCallback(async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, email, role, department, status, created_at')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Failed to load users:', error);
      toast.error(
        language === 'ar'
          ? `تعذر تحميل المستخدمين: ${error.message}`
          : `Failed to load users: ${error.message}`
      );
      setIsLoading(false);
      return;
    }

    setUsers((data as ProfileRow[]).map(mapRow));
    setIsLoading(false);
  }, [language]);

  useEffect(() => {
    fetchUsers();

    const channel = supabase
      .channel('profiles-user-management')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles' },
        () => fetchUsers()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchUsers]);

  if (!isRole(ROLES.MANAGER)) {
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
                ? 'هذه الصفحة متاحة لمدير الفرع فقط'
                : 'This page is only accessible to the branch manager'}
            </p>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  const handleAddUser = async () => {
    if (!newUser.email.trim() || !newUser.fullName.trim()) {
      toast.error(
        language === 'ar'
          ? 'الاسم والبريد الإلكتروني مطلوبان'
          : 'Full name and email are required'
      );
      return;
    }

    setSubmitting(true);
    const { data, error } = await supabase.functions.invoke('admin-users', {
      body: {
        action: 'create',
        email: newUser.email.trim(),
        full_name: newUser.fullName.trim(),
        role: newUser.role,
        department: newUser.department || null,
      },
    });
    setSubmitting(false);

    if (error) {
      const message = await readInvokeError(error);
      toast.error(
        language === 'ar' ? `فشل إنشاء المستخدم: ${message}` : `Failed to create user: ${message}`
      );
      return;
    }

    setIsAddDialogOpen(false);
    setNewUser({ email: '', fullName: '', role: ROLES.EMPLOYEE, department: '' });
    fetchUsers();

    const tempPassword = (data as { tempPassword?: string })?.tempPassword;
    toast.success(
      language === 'ar' ? 'تم إنشاء المستخدم بنجاح' : 'User created successfully',
      tempPassword
        ? {
            description:
              (language === 'ar' ? 'كلمة مرور مؤقتة: ' : 'Temporary password: ') + tempPassword,
            duration: 15000,
          }
        : undefined
    );
  };

  const handleUpdateRole = async (userId: string, newRole: Role) => {
    const { error } = await supabase.functions.invoke('admin-users', {
      body: { action: 'update', id: userId, role: newRole },
    });
    if (error) {
      const message = await readInvokeError(error);
      toast.error(
        language === 'ar' ? `فشل تحديث الدور: ${message}` : `Failed to update role: ${message}`
      );
      return;
    }
    fetchUsers();
    toast.success(
      language === 'ar'
        ? 'تم تحديث الدور (يلزم تسجيل الخروج والدخول لتفعيل الصلاحيات)'
        : 'Role updated (user must sign out/in for new permissions)'
    );
  };

  const handleToggleStatus = async (user: AppUser) => {
    const nextStatus: Status = user.status === 'active' ? 'suspended' : 'active';
    const { error } = await supabase.functions.invoke('admin-users', {
      body: { action: 'update', id: user.id, status: nextStatus },
    });
    if (error) {
      const message = await readInvokeError(error);
      toast.error(message);
      return;
    }
    fetchUsers();
    toast.success(
      language === 'ar' ? 'تم تحديث الحالة' : 'Status updated'
    );
  };

  const handleDeleteUser = async (userId: string) => {
    const { error } = await supabase.functions.invoke('admin-users', {
      body: { action: 'delete', id: userId },
    });
    if (error) {
      const message = await readInvokeError(error);
      toast.error(
        language === 'ar' ? `فشل حذف المستخدم: ${message}` : `Failed to delete user: ${message}`
      );
      return;
    }
    fetchUsers();
    toast.success(language === 'ar' ? 'تم حذف المستخدم' : 'User deleted');
  };

  const filteredUsers = users.filter((user) => {
    const q = searchTerm.toLowerCase();
    return (
      (user.fullName ?? '').toLowerCase().includes(q) ||
      (user.email ?? '').toLowerCase().includes(q)
    );
  });

  const stats = {
    total: users.length,
    managers: users.filter((u) => u.role === ROLES.MANAGER).length,
    risk: users.filter((u) => u.role === ROLES.RISK).length,
    employees: users.filter((u) => u.role === ROLES.EMPLOYEE).length,
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground">{t('users.title')}</h1>
            <p className="text-muted-foreground mt-1">
              {language === 'ar'
                ? 'إدارة حسابات المستخدمين والصلاحيات'
                : 'Manage user accounts and permissions'}
            </p>
          </div>

          <HelpTarget
            id="user-management-add-user"
            scope="action"
            category={language === 'ar' ? 'إجراء' : 'Action'}
            title={t('users.addUser')}
            description={language === 'ar'
              ? 'يفتح نافذة لإنشاء حساب مستخدم جديد بتحديد الاسم والبريد الإلكتروني والدور والقسم.'
              : 'Opens a dialog to create a new user account with a name, email, role, and department.'}
            hint={language === 'ar' ? 'اضغط لإضافة مستخدم جديد' : 'Click to add a new user'}
          >
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gradient-bg gap-2">
                <Plus className="h-4 w-4" />
                {t('users.addUser')}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('users.addUser')}</DialogTitle>
                <DialogDescription>
                  {language === 'ar'
                    ? 'أدخل بيانات المستخدم الجديد'
                    : 'Enter the new user details'}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>{language === 'ar' ? 'الاسم الكامل' : 'Full Name'}</Label>
                  <Input
                    value={newUser.fullName}
                    onChange={(e) => setNewUser((prev) => ({ ...prev, fullName: e.target.value }))}
                    placeholder={language === 'ar' ? 'أدخل الاسم' : 'Enter name'}
                  />
                </div>

                <div className="space-y-2">
                  <Label>{t('auth.email')}</Label>
                  <Input
                    type="email"
                    value={newUser.email}
                    onChange={(e) => setNewUser((prev) => ({ ...prev, email: e.target.value }))}
                    placeholder="name@bankofpalestine.com"
                  />
                </div>

                <div className="space-y-2">
                  <Label>{t('users.role')}</Label>
                  <Select
                    value={newUser.role}
                    onValueChange={(v) => setNewUser((prev) => ({ ...prev, role: v as Role }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ROLES.EMPLOYEE}>{roleLabel(ROLES.EMPLOYEE, language)}</SelectItem>
                      <SelectItem value={ROLES.MANAGER}>{roleLabel(ROLES.MANAGER, language)}</SelectItem>
                      <SelectItem value={ROLES.RISK}>{roleLabel(ROLES.RISK, language)}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>{language === 'ar' ? 'القسم' : 'Department'}</Label>
                  <Select
                    value={newUser.department}
                    onValueChange={(v) => setNewUser((prev) => ({ ...prev, department: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={language === 'ar' ? 'اختر القسم' : 'Select department'} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Credit Department">
                        {language === 'ar' ? 'قسم الائتمان' : 'Credit Department'}
                      </SelectItem>
                      <SelectItem value="Document Processing">
                        {language === 'ar' ? 'معالجة المستندات' : 'Document Processing'}
                      </SelectItem>
                      <SelectItem value="Customer Service">
                        {language === 'ar' ? 'خدمة العملاء' : 'Customer Service'}
                      </SelectItem>
                      <SelectItem value="Risk Department">
                        {language === 'ar' ? 'دائرة المخاطر' : 'Risk Department'}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setIsAddDialogOpen(false)} disabled={submitting}>
                  {t('common.cancel')}
                </Button>
                <Button onClick={handleAddUser} className="gradient-bg" disabled={submitting}>
                  {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {t('users.addUser')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          </HelpTarget>
        </div>

        {/* Stats */}
        <HelpTarget
          id="user-management-stats"
          scope="section"
          category={language === 'ar' ? 'الإحصائيات' : 'Metrics'}
          title={language === 'ar' ? 'ملخص إحصائيات المستخدمين' : 'User Stats Summary'}
          description={language === 'ar'
            ? 'نظرة سريعة على إجمالي المستخدمين وتوزيعهم حسب الدور (مدير، مخاطر، موظف).'
            : 'A quick overview of total users and their breakdown by role (manager, risk, employee).'}
        >
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <HelpTarget
            asChild
            id="user-management-stat-total"
            scope="item"
            category={language === 'ar' ? 'بطاقة إحصائية' : 'Stat Card'}
            title={language === 'ar' ? 'إجمالي المستخدمين' : 'Total Users'}
            description={language === 'ar'
              ? 'العدد الكلي لحسابات المستخدمين المسجلة في النظام.'
              : 'The total number of user accounts registered in the system.'}
          >
            <Card className="stat-card">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">
                      {language === 'ar' ? 'إجمالي المستخدمين' : 'Total Users'}
                    </p>
                    <p className="text-2xl font-bold">{stats.total}</p>
                  </div>
                  <Users className="h-8 w-8 text-primary opacity-50" />
                </div>
              </CardContent>
            </Card>
          </HelpTarget>

          <HelpTarget
            asChild
            id="user-management-stat-managers"
            scope="item"
            category={language === 'ar' ? 'بطاقة إحصائية' : 'Stat Card'}
            title={roleLabel(ROLES.MANAGER, language)}
            description={language === 'ar'
              ? 'عدد المستخدمين الذين لديهم دور مدير الفرع.'
              : 'The number of users with the branch manager role.'}
          >
            <Card className="stat-card">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{roleLabel(ROLES.MANAGER, language)}</p>
                    <p className="text-2xl font-bold">{stats.managers}</p>
                  </div>
                  <ShieldCheck className="h-8 w-8 text-info opacity-50" />
                </div>
              </CardContent>
            </Card>
          </HelpTarget>

          <HelpTarget
            asChild
            id="user-management-stat-risk"
            scope="item"
            category={language === 'ar' ? 'بطاقة إحصائية' : 'Stat Card'}
            title={roleLabel(ROLES.RISK, language)}
            description={language === 'ar'
              ? 'عدد المستخدمين الذين لديهم دور دائرة المخاطر.'
              : 'The number of users with the risk department role.'}
          >
            <Card className="stat-card">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{roleLabel(ROLES.RISK, language)}</p>
                    <p className="text-2xl font-bold">{stats.risk}</p>
                  </div>
                  <ShieldAlert className="h-8 w-8 text-primary opacity-50" />
                </div>
              </CardContent>
            </Card>
          </HelpTarget>

          <HelpTarget
            asChild
            id="user-management-stat-employees"
            scope="item"
            category={language === 'ar' ? 'بطاقة إحصائية' : 'Stat Card'}
            title={roleLabel(ROLES.EMPLOYEE, language)}
            description={language === 'ar'
              ? 'عدد المستخدمين الذين لديهم دور موظف فرع.'
              : 'The number of users with the branch employee role.'}
          >
            <Card className="stat-card">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{roleLabel(ROLES.EMPLOYEE, language)}</p>
                    <p className="text-2xl font-bold">{stats.employees}</p>
                  </div>
                  <Shield className="h-8 w-8 text-muted-foreground opacity-50" />
                </div>
              </CardContent>
            </Card>
          </HelpTarget>
        </div>
        </HelpTarget>

        {/* Users Table */}
        <HelpTarget
          id="user-management-table"
          scope="section"
          category={language === 'ar' ? 'المستخدمون' : 'Users'}
          title={language === 'ar' ? 'جدول المستخدمين' : 'Users Table'}
          description={language === 'ar'
            ? 'يعرض جميع المستخدمين المسجلين مع دورهم وقسمهم وحالتهم، ويتيح تعديل الدور أو الحالة أو حذف المستخدم.'
            : 'Lists all registered users with their role, department, and status, and lets you change role/status or delete a user.'}
        >
        <Card>
          <CardHeader>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <CardTitle>{language === 'ar' ? 'المستخدمون' : 'Users'}</CardTitle>
                <CardDescription>
                  {language === 'ar'
                    ? 'قائمة جميع المستخدمين المسجلين'
                    : 'List of all registered users'}
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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{language === 'ar' ? 'المستخدم' : 'User'}</TableHead>
                  <TableHead>{language === 'ar' ? 'القسم' : 'Department'}</TableHead>
                  <TableHead>{t('users.role')}</TableHead>
                  <TableHead>{language === 'ar' ? 'الحالة' : 'Status'}</TableHead>
                  <TableHead>{language === 'ar' ? 'آخر دخول' : 'Last Login'}</TableHead>
                  <TableHead>{language === 'ar' ? 'الإجراءات' : 'Actions'}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      {language === 'ar' ? 'جارٍ التحميل...' : 'Loading...'}
                    </TableCell>
                  </TableRow>
                )}
                {!isLoading && filteredUsers.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      {language === 'ar' ? 'لا يوجد مستخدمون' : 'No users found'}
                    </TableCell>
                  </TableRow>
                )}
                {filteredUsers.map((user) => (
                  <HelpTarget
                    key={user.id}
                    asChild
                    id={`user-management-row-${user.id}`}
                    scope="item"
                    category={language === 'ar' ? 'صف مستخدم' : 'User Row'}
                    title={user.fullName ?? user.email ?? user.id}
                    description={language === 'ar'
                      ? 'صف فردي في جدول المستخدمين، يمثل حساب مستخدم واحد وتفاصيله.'
                      : 'A single row in the Users table, representing one user account and its details.'}
                  >
                  <TableRow>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <span className="text-primary font-semibold">
                            {(user.fullName ?? user.email ?? '?').charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <p className="font-medium">{user.fullName ?? '—'}</p>
                          <p className="text-sm text-muted-foreground">{user.email ?? '—'}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{user.department ?? '—'}</TableCell>
                    <TableCell>{getRoleBadge(user.role, language)}</TableCell>
                    <TableCell>{getStatusBadge(user.status, language)}</TableCell>
                    <TableCell className="text-muted-foreground">{user.lastLogin ?? '—'}</TableCell>
                    <TableCell>
                      <HelpTarget
                        id={`user-management-actions-${user.id}`}
                        scope="action"
                        className="inline-block"
                        category={language === 'ar' ? 'إجراء' : 'Action'}
                        title={language === 'ar' ? 'إجراءات المستخدم' : 'User Actions'}
                        description={language === 'ar'
                          ? 'يفتح قائمة لتغيير دور المستخدم، تعليق أو تفعيل حسابه، أو حذفه.'
                          : 'Opens a menu to change the user\'s role, suspend/activate their account, or delete them.'}
                      >
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => handleUpdateRole(user.id, ROLES.EMPLOYEE)}
                            disabled={user.role === ROLES.EMPLOYEE}
                          >
                            <Shield className="h-4 w-4 mr-2" />
                            {language === 'ar' ? 'تعيين كموظف' : 'Set as Employee'}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleUpdateRole(user.id, ROLES.MANAGER)}
                            disabled={user.role === ROLES.MANAGER}
                          >
                            <ShieldCheck className="h-4 w-4 mr-2" />
                            {language === 'ar' ? 'تعيين كمدير' : 'Set as Manager'}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleUpdateRole(user.id, ROLES.RISK)}
                            disabled={user.role === ROLES.RISK}
                          >
                            <ShieldAlert className="h-4 w-4 mr-2" />
                            {language === 'ar' ? 'تعيين كدائرة مخاطر' : 'Set as Risk'}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => handleToggleStatus(user)}>
                            {user.status === 'active' ? (
                              <>
                                <AlertTriangle className="h-4 w-4 mr-2" />
                                {language === 'ar' ? 'تعليق' : 'Suspend'}
                              </>
                            ) : (
                              <>
                                <ShieldCheck className="h-4 w-4 mr-2" />
                                {language === 'ar' ? 'تفعيل' : 'Activate'}
                              </>
                            )}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => handleDeleteUser(user.id)}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            {language === 'ar' ? 'حذف' : 'Delete'}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      </HelpTarget>
                    </TableCell>
                  </TableRow>
                  </HelpTarget>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        </HelpTarget>
      </div>
    </DashboardLayout>
  );
};

export default UserManagement;
