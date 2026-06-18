import React, { useState, useEffect, useCallback } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { ROLES } from '@/lib/roles';
import { supabase } from '@/integrations/supabase/client';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Plus,
  Search,
  Filter,
  Download,
  Eye,
  Info,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface CreditApplication {
  id: string;
  customerName: string;
  applicationDate: string;
  loanAmount: number;
  riskScore: number;
  riskCategory: 'low' | 'medium' | 'high';
  status: 'pending' | 'approved' | 'rejected' | 'awaiting_approval';
  employeeId: string;
}

// Row shape as stored in the Supabase `approval_requests` table (credit type).
interface ApprovalRow {
  id: string;
  customer_name: string;
  request_date: string | null;
  created_at: string;
  amount: number | null;
  risk_score: number | null;
  risk_category: CreditApplication['riskCategory'] | null;
  status: CreditApplication['status'];
  employee_id: string | null;
}

const mapRow = (row: ApprovalRow): CreditApplication => ({
  id: row.id,
  customerName: row.customer_name,
  applicationDate: (row.request_date ?? row.created_at ?? '').slice(0, 10),
  loanAmount: row.amount ?? 0,
  riskScore: row.risk_score ?? 0,
  riskCategory: row.risk_category ?? 'low',
  status: row.status,
  employeeId: row.employee_id ?? '',
});

const getRiskColor = (category: CreditApplication['riskCategory']) => {
  switch (category) {
    case 'low': return 'text-success bg-success/10 border-success/20';
    case 'medium': return 'text-warning bg-warning/10 border-warning/20';
    case 'high': return 'text-destructive bg-destructive/10 border-destructive/20';
  }
};

const getStatusColor = (status: CreditApplication['status']) => {
  switch (status) {
    case 'approved': return 'text-success bg-success/10 border-success/20';
    case 'rejected': return 'text-destructive bg-destructive/10 border-destructive/20';
    case 'pending': return 'text-muted-foreground bg-muted border-border';
    case 'awaiting_approval': return 'text-warning bg-warning/10 border-warning/20';
  }
};

export const CreditRisk: React.FC = () => {
  const { t, language } = useLanguage();
  const { isRole, role, user } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [isNewAssessmentOpen, setIsNewAssessmentOpen] = useState(false);
  const [selectedApplication, setSelectedApplication] = useState<CreditApplication | null>(null);
  const [applications, setApplications] = useState<CreditApplication[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchApplications = useCallback(async () => {
    let query = supabase
      .from('approval_requests')
      .select('*')
      .eq('type', 'credit');

    // Employees only see their own submissions; managers and risk see everything.
    if (role === ROLES.EMPLOYEE) {
      query = query.eq('employee_id', user?.id ?? '');
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) {
      console.error('Failed to load credit applications:', error);
      toast.error(
        language === 'ar'
          ? `تعذر تحميل الطلبات: ${error.message}`
          : `Failed to load applications: ${error.message}`
      );
      setIsLoading(false);
      return;
    }

    setApplications((data as ApprovalRow[]).map(mapRow));
    setIsLoading(false);
  }, [language, role, user]);

  useEffect(() => {
    fetchApplications();

    const channel = supabase
      .channel('credit_applications_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'approval_requests' },
        () => fetchApplications()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchApplications]);

  const handleDecision = async (
    app: CreditApplication,
    decision: 'approved' | 'rejected'
  ) => {
    const { error } = await supabase
      .from('approval_requests')
      .update({ status: decision, updated_at: new Date().toISOString() })
      .eq('id', app.id);

    if (error) {
      console.error('Failed to update application status:', error);
      toast.error(
        language === 'ar'
          ? `فشل تحديث الحالة: ${error.message}`
          : `Failed to update status: ${error.message}`
      );
      return;
    }

    // Optimistic update; the realtime subscription keeps it in sync too.
    setApplications(prev =>
      prev.map(a => (a.id === app.id ? { ...a, status: decision } : a))
    );

    toast.success(
      language === 'ar'
        ? decision === 'approved' ? 'تمت الموافقة على القرض' : 'تم رفض القرض'
        : decision === 'approved' ? 'Loan approved' : 'Loan rejected'
    );
  };

  // New assessment form state
  const [formData, setFormData] = useState({
    customerName: '',
    nationalId: '',
    monthlyIncome: '',
    monthlyExpenses: '',
    existingLoans: '',
    employmentType: '',
    loanAmount: '',
    loanPurpose: '',
  });

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmitAssessment = async () => {
    if (!formData.customerName.trim() || !formData.loanAmount) {
      toast.error(
        language === 'ar'
          ? 'يرجى إدخال اسم العميل ومبلغ القرض'
          : 'Please enter the customer name and loan amount'
      );
      return;
    }

    // Simulate ML risk score calculation
    const simulatedScore = Math.floor(Math.random() * 100);
    const riskCategory =
      simulatedScore < 40 ? 'low' : simulatedScore < 70 ? 'medium' : 'high';

    // Persist as a pending approval request so it appears on the Approvals page.
    const { error } = await supabase.from('approval_requests').insert({
      type: 'credit',
      customer_name: formData.customerName.trim(),
      amount: Number(formData.loanAmount),
      risk_score: simulatedScore,
      risk_category: riskCategory,
      priority: riskCategory === 'high' ? 'urgent' : 'normal',
      status: 'pending',
      employee_id: user?.id ?? null,
      notes: formData.loanPurpose
        ? `Loan purpose: ${formData.loanPurpose}`
        : null,
    });

    if (error) {
      console.error('Failed to create assessment:', error);
      toast.error(
        language === 'ar'
          ? `فشل إنشاء التقييم: ${error.message}`
          : `Failed to create assessment: ${error.message}`
      );
      return;
    }

    toast.success(
      language === 'ar'
        ? `تم حساب درجة المخاطر: ${simulatedScore} وإرسال الطلب للموافقة`
        : `Risk score calculated: ${simulatedScore} — sent for approval`
    );
    setFormData({
      customerName: '',
      nationalId: '',
      monthlyIncome: '',
      monthlyExpenses: '',
      existingLoans: '',
      employmentType: '',
      loanAmount: '',
      loanPurpose: '',
    });
    setIsNewAssessmentOpen(false);
    fetchApplications();
  };

  const filteredApplications = applications.filter(app =>
    app.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    app.id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground">{t('credit.title')}</h1>
            <p className="text-muted-foreground mt-1">
              {language === 'ar'
                ? 'تقييم مخاطر الائتمان باستخدام الذكاء الاصطناعي'
                : 'AI-powered credit risk assessment and scoring'}
            </p>
          </div>
          
          <Dialog open={isNewAssessmentOpen} onOpenChange={setIsNewAssessmentOpen}>
            <DialogTrigger asChild>
              <Button className="gradient-bg gap-2">
                <Plus className="h-4 w-4" />
                {t('credit.newAssessment')}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{t('credit.newAssessment')}</DialogTitle>
                <DialogDescription>
                  {language === 'ar'
                    ? 'أدخل بيانات العميل لتقييم مخاطر الائتمان'
                    : 'Enter customer data for credit risk assessment'}
                </DialogDescription>
              </DialogHeader>
              
              <div className="space-y-6 py-4">
                <div className="space-y-4">
                  <h3 className="font-semibold">{t('credit.customerInfo')}</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>{language === 'ar' ? 'اسم العميل' : 'Customer Name'}</Label>
                      <Input
                        value={formData.customerName}
                        onChange={(e) => handleInputChange('customerName', e.target.value)}
                        placeholder={language === 'ar' ? 'أدخل الاسم' : 'Enter name'}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{language === 'ar' ? 'رقم الهوية' : 'National ID'}</Label>
                      <Input
                        value={formData.nationalId}
                        onChange={(e) => handleInputChange('nationalId', e.target.value)}
                        placeholder="XXXXXXXXXXX"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="font-semibold">{t('credit.financialData')}</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>{language === 'ar' ? 'الدخل الشهري' : 'Monthly Income'}</Label>
                      <Input
                        type="number"
                        value={formData.monthlyIncome}
                        onChange={(e) => handleInputChange('monthlyIncome', e.target.value)}
                        placeholder="0.00"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{language === 'ar' ? 'المصاريف الشهرية' : 'Monthly Expenses'}</Label>
                      <Input
                        type="number"
                        value={formData.monthlyExpenses}
                        onChange={(e) => handleInputChange('monthlyExpenses', e.target.value)}
                        placeholder="0.00"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{language === 'ar' ? 'القروض الحالية' : 'Existing Loans'}</Label>
                      <Input
                        type="number"
                        value={formData.existingLoans}
                        onChange={(e) => handleInputChange('existingLoans', e.target.value)}
                        placeholder="0.00"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{language === 'ar' ? 'نوع التوظيف' : 'Employment Type'}</Label>
                      <Select
                        value={formData.employmentType}
                        onValueChange={(v) => handleInputChange('employmentType', v)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={language === 'ar' ? 'اختر' : 'Select'} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="employed">
                            {language === 'ar' ? 'موظف' : 'Employed'}
                          </SelectItem>
                          <SelectItem value="self-employed">
                            {language === 'ar' ? 'عمل حر' : 'Self-Employed'}
                          </SelectItem>
                          <SelectItem value="business">
                            {language === 'ar' ? 'صاحب عمل' : 'Business Owner'}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="font-semibold">{language === 'ar' ? 'تفاصيل القرض' : 'Loan Details'}</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>{language === 'ar' ? 'مبلغ القرض' : 'Loan Amount'}</Label>
                      <Input
                        type="number"
                        value={formData.loanAmount}
                        onChange={(e) => handleInputChange('loanAmount', e.target.value)}
                        placeholder="0.00"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{language === 'ar' ? 'الغرض من القرض' : 'Loan Purpose'}</Label>
                      <Select
                        value={formData.loanPurpose}
                        onValueChange={(v) => handleInputChange('loanPurpose', v)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={language === 'ar' ? 'اختر' : 'Select'} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="personal">
                            {language === 'ar' ? 'شخصي' : 'Personal'}
                          </SelectItem>
                          <SelectItem value="car">
                            {language === 'ar' ? 'سيارة' : 'Car'}
                          </SelectItem>
                          <SelectItem value="home">
                            {language === 'ar' ? 'منزل' : 'Home'}
                          </SelectItem>
                          <SelectItem value="business">
                            {language === 'ar' ? 'تجاري' : 'Business'}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 justify-end pt-4">
                  <Button variant="outline" onClick={() => setIsNewAssessmentOpen(false)}>
                    {t('common.cancel')}
                  </Button>
                  <Button onClick={handleSubmitAssessment} className="gradient-bg">
                    {language === 'ar' ? 'تقييم المخاطر' : 'Assess Risk'}
                  </Button>
                </div>
              </div>
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
                    {language === 'ar' ? 'إجمالي التقييمات' : 'Total Assessments'}
                  </p>
                  <p className="text-2xl font-bold">1,284</p>
                </div>
                <TrendingUp className="h-8 w-8 text-primary opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card className="stat-card">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t('credit.lowRisk')}</p>
                  <p className="text-2xl font-bold text-success">847</p>
                </div>
                <CheckCircle2 className="h-8 w-8 text-success opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card className="stat-card">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t('credit.mediumRisk')}</p>
                  <p className="text-2xl font-bold text-warning">312</p>
                </div>
                <AlertTriangle className="h-8 w-8 text-warning opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card className="stat-card">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t('credit.highRisk')}</p>
                  <p className="text-2xl font-bold text-destructive">125</p>
                </div>
                <TrendingDown className="h-8 w-8 text-destructive opacity-50" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Applications Table */}
        <Card>
          <CardHeader>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <CardTitle>{language === 'ar' ? 'طلبات الائتمان' : 'Credit Applications'}</CardTitle>
                <CardDescription>
                  {language === 'ar' ? 'عرض وإدارة جميع طلبات الائتمان' : 'View and manage all credit applications'}
                </CardDescription>
              </div>
              <div className="flex gap-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder={t('common.search')}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9 w-64"
                  />
                </div>
                <Button variant="outline" size="icon">
                  <Filter className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon">
                  <Download className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{language === 'ar' ? 'رقم الطلب' : 'Application ID'}</TableHead>
                  <TableHead>{language === 'ar' ? 'اسم العميل' : 'Customer Name'}</TableHead>
                  <TableHead>{language === 'ar' ? 'مبلغ القرض' : 'Loan Amount'}</TableHead>
                  <TableHead>{t('credit.riskScore')}</TableHead>
                  <TableHead>{language === 'ar' ? 'الحالة' : 'Status'}</TableHead>
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
                {!isLoading && filteredApplications.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      {language === 'ar' ? 'لا توجد طلبات' : 'No applications found'}
                    </TableCell>
                  </TableRow>
                )}
                {filteredApplications.map((app) => (
                  <TableRow key={app.id}>
                    <TableCell className="font-medium">{app.id}</TableCell>
                    <TableCell>{app.customerName}</TableCell>
                    <TableCell>₪{app.loanAmount.toLocaleString()}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="w-16">
                          <Progress 
                            value={app.riskScore} 
                            className={cn(
                              "h-2",
                              app.riskCategory === 'low' && "[&>div]:bg-success",
                              app.riskCategory === 'medium' && "[&>div]:bg-warning",
                              app.riskCategory === 'high' && "[&>div]:bg-destructive"
                            )}
                          />
                        </div>
                        <Badge className={getRiskColor(app.riskCategory)}>
                          {app.riskScore}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={getStatusColor(app.status)}>
                        {app.status === 'approved' && (language === 'ar' ? 'موافق عليه' : 'Approved')}
                        {app.status === 'rejected' && (language === 'ar' ? 'مرفوض' : 'Rejected')}
                        {app.status === 'pending' && (language === 'ar' ? 'قيد المراجعة' : 'Pending')}
                        {app.status === 'awaiting_approval' && (language === 'ar' ? 'بانتظار الموافقة' : 'Awaiting Approval')}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button variant="ghost" size="icon">
                          <Eye className="h-4 w-4" />
                        </Button>
                        {app.status === 'pending' && isRole('risk_department') && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-success hover:text-success"
                              onClick={() => handleDecision(app, 'approved')}
                              title={language === 'ar' ? 'موافقة' : 'Approve'}
                            >
                              <CheckCircle2 className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-destructive hover:text-destructive"
                              onClick={() => handleDecision(app, 'rejected')}
                              title={language === 'ar' ? 'رفض' : 'Reject'}
                            >
                              <XCircle className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                        <Button variant="ghost" size="icon">
                          <Info className="h-4 w-4" />
                        </Button>
                      </div>
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

export default CreditRisk;
