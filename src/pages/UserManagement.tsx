import React, { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
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
  Edit,
  Trash2,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Mail,
  Phone,
  Calendar,
  AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface User {
  id: string;
  email: string;
  fullName: string;
  role: 'employee' | 'manager' | 'admin';
  department: string;
  status: 'active' | 'inactive' | 'suspended';
  createdAt: string;
  lastLogin?: string;
}

const mockUsers: User[] = [
  {
    id: 'USR-001',
    email: 'ahmed.m@bankofpalestine.com',
    fullName: 'أحمد محمد',
    role: 'employee',
    department: 'Credit Department',
    status: 'active',
    createdAt: '2023-06-15',
    lastLogin: '2024-01-15 14:30',
  },
  {
    id: 'USR-002',
    email: 'fatima.k@bankofpalestine.com',
    fullName: 'فاطمة خالد',
    role: 'employee',
    department: 'Document Processing',
    status: 'active',
    createdAt: '2023-08-20',
    lastLogin: '2024-01-15 12:15',
  },
  {
    id: 'USR-003',
    email: 'khaled.o@bankofpalestine.com',
    fullName: 'خالد العمري',
    role: 'manager',
    department: 'Credit Department',
    status: 'active',
    createdAt: '2022-03-10',
    lastLogin: '2024-01-15 09:00',
  },
  {
    id: 'USR-004',
    email: 'layla.k@bankofpalestine.com',
    fullName: 'ليلى كريم',
    role: 'employee',
    department: 'Customer Service',
    status: 'inactive',
    createdAt: '2023-11-05',
    lastLogin: '2024-01-10 16:45',
  },
  {
    id: 'USR-005',
    email: 'saeed.h@bankofpalestine.com',
    fullName: 'سعيد حسن',
    role: 'admin',
    department: 'IT Department',
    status: 'active',
    createdAt: '2021-01-20',
    lastLogin: '2024-01-15 08:00',
  },
];

const getRoleIcon = (role: User['role']) => {
  switch (role) {
    case 'admin': return ShieldAlert;
    case 'manager': return ShieldCheck;
    default: return Shield;
  }
};

const getRoleBadge = (role: User['role'], language: string) => {
  switch (role) {
    case 'admin':
      return (
        <Badge className="bg-primary/10 text-primary border-primary/20 gap-1">
          <ShieldAlert className="h-3 w-3" />
          {language === 'ar' ? 'مسؤول' : 'Admin'}
        </Badge>
      );
    case 'manager':
      return (
        <Badge className="bg-info/10 text-info border-info/20 gap-1">
          <ShieldCheck className="h-3 w-3" />
          {language === 'ar' ? 'مدير' : 'Manager'}
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className="gap-1">
          <Shield className="h-3 w-3" />
          {language === 'ar' ? 'موظف' : 'Employee'}
        </Badge>
      );
  }
};

const getStatusBadge = (status: User['status'], language: string) => {
  switch (status) {
    case 'active':
      return <Badge className="bg-success/10 text-success">{language === 'ar' ? 'نشط' : 'Active'}</Badge>;
    case 'inactive':
      return <Badge className="bg-muted text-muted-foreground">{language === 'ar' ? 'غير نشط' : 'Inactive'}</Badge>;
    case 'suspended':
      return <Badge className="bg-destructive/10 text-destructive">{language === 'ar' ? 'معلق' : 'Suspended'}</Badge>;
  }
};

export const UserManagement: React.FC = () => {
  const { t, language } = useLanguage();
  const { hasPermission } = useAuth();
  const [users, setUsers] = useState<User[]>(mockUsers);
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [newUser, setNewUser] = useState({
    email: '',
    fullName: '',
    role: 'employee' as User['role'],
    department: '',
  });

  if (!hasPermission('admin')) {
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
                ? 'هذه الصفحة متاحة للمسؤولين فقط' 
                : 'This page is only accessible to administrators'}
            </p>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  const handleAddUser = () => {
    const user: User = {
      id: `USR-${Date.now()}`,
      ...newUser,
      status: 'active',
      createdAt: new Date().toISOString().split('T')[0],
    };
    
    setUsers(prev => [user, ...prev]);
    setIsAddDialogOpen(false);
    setNewUser({ email: '', fullName: '', role: 'employee', department: '' });
    
    toast.success(
      language === 'ar' ? 'تم إضافة المستخدم بنجاح' : 'User added successfully'
    );
  };

  const handleUpdateRole = (userId: string, newRole: User['role']) => {
    setUsers(prev =>
      prev.map(user =>
        user.id === userId ? { ...user, role: newRole } : user
      )
    );
    
    toast.success(
      language === 'ar' ? 'تم تحديث الدور بنجاح' : 'Role updated successfully'
    );
  };

  const handleDeleteUser = (userId: string) => {
    setUsers(prev => prev.filter(user => user.id !== userId));
    toast.success(
      language === 'ar' ? 'تم حذف المستخدم' : 'User deleted'
    );
  };

  const handleToggleStatus = (userId: string) => {
    setUsers(prev =>
      prev.map(user =>
        user.id === userId
          ? { ...user, status: user.status === 'active' ? 'suspended' : 'active' }
          : user
      )
    );
  };

  const filteredUsers = users.filter(user =>
    user.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const stats = {
    total: users.length,
    admins: users.filter(u => u.role === 'admin').length,
    managers: users.filter(u => u.role === 'manager').length,
    employees: users.filter(u => u.role === 'employee').length,
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
                    onChange={(e) => setNewUser(prev => ({ ...prev, fullName: e.target.value }))}
                    placeholder={language === 'ar' ? 'أدخل الاسم' : 'Enter name'}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label>{t('auth.email')}</Label>
                  <Input
                    type="email"
                    value={newUser.email}
                    onChange={(e) => setNewUser(prev => ({ ...prev, email: e.target.value }))}
                    placeholder="name@bankofpalestine.com"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label>{t('users.role')}</Label>
                  <Select
                    value={newUser.role}
                    onValueChange={(v) => setNewUser(prev => ({ ...prev, role: v as User['role'] }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="employee">{t('users.employee')}</SelectItem>
                      <SelectItem value="manager">{t('users.manager')}</SelectItem>
                      <SelectItem value="admin">{t('users.admin')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label>{language === 'ar' ? 'القسم' : 'Department'}</Label>
                  <Select
                    value={newUser.department}
                    onValueChange={(v) => setNewUser(prev => ({ ...prev, department: v }))}
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
                      <SelectItem value="IT Department">
                        {language === 'ar' ? 'قسم تقنية المعلومات' : 'IT Department'}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                  {t('common.cancel')}
                </Button>
                <Button onClick={handleAddUser} className="gradient-bg">
                  {t('users.addUser')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
          <Card className="stat-card">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t('users.admin')}</p>
                  <p className="text-2xl font-bold">{stats.admins}</p>
                </div>
                <ShieldAlert className="h-8 w-8 text-primary opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card className="stat-card">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t('users.manager')}</p>
                  <p className="text-2xl font-bold">{stats.managers}</p>
                </div>
                <ShieldCheck className="h-8 w-8 text-info opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card className="stat-card">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t('users.employee')}</p>
                  <p className="text-2xl font-bold">{stats.employees}</p>
                </div>
                <Shield className="h-8 w-8 text-muted-foreground opacity-50" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Users Table */}
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
                {filteredUsers.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <span className="text-primary font-semibold">
                            {user.fullName.charAt(0)}
                          </span>
                        </div>
                        <div>
                          <p className="font-medium">{user.fullName}</p>
                          <p className="text-sm text-muted-foreground">{user.email}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{user.department}</TableCell>
                    <TableCell>{getRoleBadge(user.role, language)}</TableCell>
                    <TableCell>{getStatusBadge(user.status, language)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {user.lastLogin || '—'}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setEditingUser(user)}>
                            <Edit className="h-4 w-4 mr-2" />
                            {language === 'ar' ? 'تعديل' : 'Edit'}
                          </DropdownMenuItem>
                          <DropdownMenuItem>
                            <Select
                              value={user.role}
                              onValueChange={(v) => handleUpdateRole(user.id, v as User['role'])}
                            >
                              <SelectTrigger className="border-0 p-0 h-auto">
                                <div className="flex items-center gap-2">
                                  <Shield className="h-4 w-4" />
                                  {language === 'ar' ? 'تغيير الدور' : 'Change Role'}
                                </div>
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="employee">{t('users.employee')}</SelectItem>
                                <SelectItem value="manager">{t('users.manager')}</SelectItem>
                                <SelectItem value="admin">{t('users.admin')}</SelectItem>
                              </SelectContent>
                            </Select>
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleToggleStatus(user.id)}>
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
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default UserManagement;
