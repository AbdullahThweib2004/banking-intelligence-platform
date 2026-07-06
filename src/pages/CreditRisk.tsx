import React, { useState, useEffect, useCallback } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { ROLES } from '@/lib/roles';
import { supabase } from '@/integrations/supabase/client';
import { useCreditRiskStats } from '@/hooks/useStats';
import { StatValue } from '@/components/StatValue';
import { PageOnboardingTour } from '@/components/onboarding/PageOnboardingTour';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
  Eye,
  Info,
  Pencil,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { hasSavedRiskExplanation, type SavedRiskExplanation, type SavedTopFactor, type DerivedFeatures, type RecommendedAction, type ResultSource } from '@/lib/creditScoring';
import { assessCreditRisk } from '@/lib/aiCreditAssessment';
import { SavedRiskExplanationView } from '@/components/CreditScoreExplanation';
import { LoanRiskInfoPopover } from '@/components/LoanRiskInfoPopover';

interface CreditApplication {
  id: string;
  customerName: string;
  applicationDate: string;
  loanAmount: number;
  riskScore: number;
  riskCategory: 'low' | 'medium' | 'high';
  status: 'pending' | 'approved' | 'rejected' | 'awaiting_approval';
  employeeId: string;
  savedRiskExplanation: SavedRiskExplanation | null;
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
  risk_explanation_summary?: string | null;
  risk_top_factors?: SavedTopFactor[] | null;
  risk_derived_features?: DerivedFeatures | null;
  risk_confidence?: number | null;
  recommended_action?: RecommendedAction | null;
  result_source?: ResultSource | null;
  assessed_at?: string | null;
}

function parseSavedRiskExplanation(row: ApprovalRow): SavedRiskExplanation | null {
  if (!hasSavedRiskExplanation(row)) return null;
  return {
    risk_score: row.risk_score ?? 0,
    risk_category: row.risk_category ?? 'low',
    risk_confidence: row.risk_confidence ?? null,
    risk_explanation_summary: row.risk_explanation_summary ?? '',
    risk_top_factors: (row.risk_top_factors ?? []) as SavedTopFactor[],
    risk_derived_features: row.risk_derived_features as DerivedFeatures,
    recommended_action: row.recommended_action ?? null,
    result_source: row.result_source ?? null,
    assessed_at: row.assessed_at as string,
  };
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
  savedRiskExplanation: parseSavedRiskExplanation(row),
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

// Fields an employee is allowed to object to / request modification of.
// Built as a superset of approval_requests + credit_applications columns; only
// the ones actually present on the loaded record are offered in the dropdown.
const EDITABLE_FIELDS: { key: string; en: string; ar: string }[] = [
  { key: 'customer_name', en: 'Customer Name', ar: 'اسم العميل' },
  { key: 'national_id', en: 'National ID', ar: 'رقم الهوية' },
  { key: 'monthly_income', en: 'Monthly Income', ar: 'الدخل الشهري' },
  { key: 'monthly_expenses', en: 'Monthly Expenses', ar: 'المصاريف الشهرية' },
  { key: 'existing_loans', en: 'Existing Loans', ar: 'القروض الحالية' },
  { key: 'employment_type', en: 'Employment Type', ar: 'نوع التوظيف' },
  { key: 'loan_amount', en: 'Loan Amount', ar: 'مبلغ القرض' },
  { key: 'loan_purpose', en: 'Loan Purpose', ar: 'الغرض من القرض' },
  { key: 'amount', en: 'Loan Amount', ar: 'مبلغ القرض' },
  { key: 'notes', en: 'Notes', ar: 'ملاحظات' },
];

interface LoadedApplication {
  table: 'approval_requests' | 'credit_applications';
  row: Record<string, unknown>;
}

interface BankCustomerRow {
  id: string;
  account_number: string;
  customer_name: string;
  national_id: string;
  monthly_income: number;
  monthly_expenses: number;
  existing_loans: number;
  employment_type: string;
  loan_amount: number;
  loan_purpose: string;
  loan_restricted?: boolean;
  restriction_reason?: string | null;
}

const LOAN_RESTRICTED_MESSAGE =
  'This client cannot apply for a loan because they are restricted from this feature. Please contact your branch manager for details.';

const LOAN_RESTRICTED_MESSAGE_AR =
  'لا يمكن لهذا العميل التقدم بطلب قرض لأنه مقيد من هذه الميزة. يرجى التواصل مع مدير الفرع للتفاصيل.';

const EMPTY_ASSESSMENT_FORM = {
  customerName: '',
  nationalId: '',
  monthlyIncome: '',
  monthlyExpenses: '',
  existingLoans: '',
  employmentType: '',
  loanAmount: '',
  loanPurpose: '',
};

export const CreditRisk: React.FC = () => {
  const { t, language } = useLanguage();
  const { isRole, role, user, profile } = useAuth();
  const { stats, loading: statsLoading, error: statsError } = useCreditRiskStats();
  const [searchTerm, setSearchTerm] = useState('');
  const [isNewAssessmentOpen, setIsNewAssessmentOpen] = useState(false);
  const [riskExplanationOpen, setRiskExplanationOpen] = useState(false);
  const [riskExplanationApp, setRiskExplanationApp] = useState<CreditApplication | null>(null);
  const [applications, setApplications] = useState<CreditApplication[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // --- Objection / Modification feature state ---
  const [isObjectionOpen, setIsObjectionOpen] = useState(false);
  const [objAppId, setObjAppId] = useState('');
  const [objLoading, setObjLoading] = useState(false);
  const [objSubmitting, setObjSubmitting] = useState(false);
  const [objRecord, setObjRecord] = useState<LoadedApplication | null>(null);
  const [objFieldName, setObjFieldName] = useState('');
  const [objNewValue, setObjNewValue] = useState('');
  const [objReason, setObjReason] = useState('');

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
    const now = new Date().toISOString();
    const { error } = await supabase
      .from('approval_requests')
      .update({
        status: decision,
        updated_at: now,
        approved_at: decision === 'approved' ? now : null,
      })
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
  const [accountNumber, setAccountNumber] = useState('');
  const [customerLoaded, setCustomerLoaded] = useState(false);
  const [customerLoanRestricted, setCustomerLoanRestricted] = useState(false);
  const [loadCustomerLoading, setLoadCustomerLoading] = useState(false);
  const [formData, setFormData] = useState({ ...EMPTY_ASSESSMENT_FORM });
  const [assessmentResult, setAssessmentResult] = useState<SavedRiskExplanation | null>(null);
  const [assessmentSubmitting, setAssessmentSubmitting] = useState(false);

  const resetAssessmentForm = () => {
    setAccountNumber('');
    setCustomerLoaded(false);
    setCustomerLoanRestricted(false);
    setLoadCustomerLoading(false);
    setFormData({ ...EMPTY_ASSESSMENT_FORM });
    setAssessmentResult(null);
    setAssessmentSubmitting(false);
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const loadCustomerByAccount = async () => {
    const acct = accountNumber.trim();
    if (!acct) {
      toast.error(
        language === 'ar'
          ? 'يرجى إدخال رقم الحساب'
          : 'Please enter an account number'
      );
      return;
    }

    setLoadCustomerLoading(true);
    setCustomerLoaded(false);
    setCustomerLoanRestricted(false);

    const { data, error } = await supabase
      .from('bank_customers')
      .select('*')
      .eq('account_number', acct)
      .maybeSingle();

    setLoadCustomerLoading(false);

    if (error) {
      console.error('Failed to load customer:', error);
      toast.error(
        language === 'ar'
          ? `تعذر تحميل بيانات العميل: ${error.message}`
          : `Failed to load customer: ${error.message}`
      );
      return;
    }

    if (!data) {
      setFormData({ ...EMPTY_ASSESSMENT_FORM });
      toast.error(
        language === 'ar'
          ? 'الحساب غير موجود. يرجى التحقق من رقم الحساب.'
          : 'Account not found. Please verify the account number.'
      );
      return;
    }

    const row = data as BankCustomerRow;
    const isRestricted = Boolean(row.loan_restricted);

    setFormData({
      customerName: row.customer_name,
      nationalId: row.national_id,
      monthlyIncome: String(row.monthly_income),
      monthlyExpenses: String(row.monthly_expenses),
      existingLoans: String(row.existing_loans),
      employmentType: row.employment_type,
      loanAmount: '',
      loanPurpose: row.loan_purpose,
    });
    setCustomerLoanRestricted(isRestricted);
    setCustomerLoaded(true);

    if (isRestricted) {
      toast.error(language === 'ar' ? LOAN_RESTRICTED_MESSAGE_AR : LOAN_RESTRICTED_MESSAGE);
      return;
    }

    toast.success(
      language === 'ar'
        ? `تم تحميل بيانات ${row.customer_name}`
        : `Loaded customer: ${row.customer_name}`
    );
  };

  const handleSubmitAssessment = async () => {
    if (!customerLoaded) {
      toast.error(
        language === 'ar'
          ? 'حمّل بيانات العميل برقم الحساب أولاً'
          : 'Load the customer by account number first'
      );
      return;
    }

    if (customerLoanRestricted) {
      toast.error(language === 'ar' ? LOAN_RESTRICTED_MESSAGE_AR : LOAN_RESTRICTED_MESSAGE);
      return;
    }

    if (!formData.customerName.trim() || !formData.loanAmount) {
      toast.error(
        language === 'ar'
          ? 'يرجى إدخال اسم العميل ومبلغ القرض'
          : 'Please enter the customer name and loan amount'
      );
      return;
    }

    const income = Number(formData.monthlyIncome) || 0;
    const expenses = Number(formData.monthlyExpenses) || 0;
    const existing = Number(formData.existingLoans) || 0;
    const requestedLoanAmount = Number(formData.loanAmount) || 0;

    setAssessmentSubmitting(true);

    // The AI service is the source of truth for the assessment result.
    let riskSnapshot: SavedRiskExplanation;
    let source: 'ai' | 'algorithm';
    let fallbackReason: string | undefined;
    try {
      const outcome = await assessCreditRisk({
        monthlyIncome: income,
        monthlyExpenses: expenses,
        existingLoans: existing,
        requestedLoanAmount,
        employmentType: formData.employmentType,
        loanPurpose: formData.loanPurpose,
      });
      riskSnapshot = outcome.snapshot;
      source = outcome.source;
      fallbackReason = outcome.fallbackReason;
      console.info('[credit-risk] assessment outcome', outcome.debug ?? {
        result_source: source,
        fallback_reason: fallbackReason,
      });
    } catch (err) {
      setAssessmentSubmitting(false);
      console.error('AI assessment failed:', err);
      const detail =
        err instanceof Error && err.message
          ? err.message
          : language === 'ar'
            ? 'تعذّر إجراء تقييم المخاطر'
            : 'Risk assessment failed';
      toast.error(detail);
      return;
    }

    console.info('[credit-risk] saving assessment with result_source =', riskSnapshot.result_source, {
      score: riskSnapshot.risk_score,
      category: riskSnapshot.risk_category,
      recommended_action: riskSnapshot.recommended_action,
      source,
    });

    const { error } = await supabase.from('approval_requests').insert({
      type: 'credit',
      account_number: accountNumber.trim(),
      customer_name: formData.customerName.trim(),
      national_id: formData.nationalId.trim() || null,
      monthly_income: income || null,
      monthly_expenses: expenses || null,
      existing_loans: existing || null,
      employment_type: formData.employmentType || null,
      loan_purpose: formData.loanPurpose || null,
      amount: requestedLoanAmount,
      risk_score: riskSnapshot.risk_score,
      risk_category: riskSnapshot.risk_category,
      risk_confidence: riskSnapshot.risk_confidence,
      risk_explanation_summary: riskSnapshot.risk_explanation_summary,
      risk_top_factors: riskSnapshot.risk_top_factors,
      risk_derived_features: riskSnapshot.risk_derived_features,
      recommended_action: riskSnapshot.recommended_action,
      result_source: riskSnapshot.result_source,
      assessed_at: riskSnapshot.assessed_at,
      priority: riskSnapshot.risk_category === 'high' ? 'urgent' : 'normal',
      status: 'pending',
      employee_id: user?.id ?? null,
      notes: formData.loanPurpose
        ? `Account: ${accountNumber.trim()} | Loan purpose: ${formData.loanPurpose}`
        : `Account: ${accountNumber.trim()}`,
    });

    setAssessmentSubmitting(false);

    if (error) {
      console.error('Failed to create assessment:', error);
      toast.error(
        language === 'ar'
          ? `فشل إنشاء التقييم: ${error.message}`
          : `Failed to create assessment: ${error.message}`
      );
      return;
    }

    const engineNote =
      source === 'algorithm'
        ? language === 'ar'
          ? ` (نموذج احتياطي${fallbackReason ? `: ${fallbackReason}` : ''})`
          : ` (fallback engine${fallbackReason ? `: ${fallbackReason}` : ''})`
        : '';
    toast.success(
      language === 'ar'
        ? `تم حساب درجة المخاطر: ${riskSnapshot.risk_score} وإرسال الطلب للموافقة${engineNote}`
        : `Risk score calculated: ${riskSnapshot.risk_score} — sent for approval${engineNote}`
    );
    setAssessmentResult(riskSnapshot);
    fetchApplications();
  };

  // Best-effort audit log entry (employees can insert their own; ignore failures).
  const writeAuditLog = async (
    action: string,
    resource: string,
    resourceId: string,
    details: string
  ) => {
    if (!user?.id) return;
    const { error } = await supabase.from('audit_logs').insert({
      user_id: user.id,
      user_name: profile?.full_name ?? null,
      user_role: role ?? null,
      action,
      resource,
      resource_id: resourceId,
      details,
      severity: 'info',
    });
    if (error) console.warn('Audit log insert skipped:', error.message);
  };

  const resetObjection = () => {
    setObjAppId('');
    setObjRecord(null);
    setObjFieldName('');
    setObjNewValue('');
    setObjReason('');
  };

  const loadApplicationForObjection = async () => {
    const id = objAppId.trim();
    if (!id) {
      toast.error(language === 'ar' ? 'أدخل رقم الطلب' : 'Enter an Application ID');
      return;
    }

    setObjLoading(true);
    setObjRecord(null);
    setObjFieldName('');
    setObjNewValue('');

    // Try the table the app actually uses first, then fall back.
    let table: LoadedApplication['table'] = 'approval_requests';
    let row: Record<string, unknown> | null = null;

    const primary = await supabase.from('approval_requests').select('*').eq('id', id).maybeSingle();
    if (primary.data) {
      row = primary.data as Record<string, unknown>;
    } else {
      const secondary = await supabase.from('credit_applications').select('*').eq('id', id).maybeSingle();
      if (secondary.data) {
        row = secondary.data as Record<string, unknown>;
        table = 'credit_applications';
      }
    }

    setObjLoading(false);

    if (!row) {
      toast.error(language === 'ar' ? 'الطلب غير موجود' : 'Application not found');
      return;
    }

    setObjRecord({ table, row });
    writeAuditLog(
      'Loaded application for modification',
      table,
      String(row.id),
      `Loaded application ${row.id} for objection/modification`
    );
  };

  const availableEditFields = objRecord
    ? EDITABLE_FIELDS.filter((f) => f.key in objRecord.row)
    : [];

  const handleSelectEditField = (key: string) => {
    setObjFieldName(key);
    const current = objRecord?.row[key];
    setObjNewValue(current == null ? '' : String(current));
  };

  const submitObjection = async () => {
    if (!objRecord) {
      toast.error(language === 'ar' ? 'حمّل الطلب أولاً' : 'Load an application first');
      return;
    }
    if (!objFieldName) {
      toast.error(language === 'ar' ? 'اختر حقلاً للتعديل' : 'Select a field to edit');
      return;
    }
    if (!objReason.trim()) {
      toast.error(language === 'ar' ? 'سبب التعديل مطلوب' : 'Reason for modification is required');
      return;
    }

    setObjSubmitting(true);
    const oldValue = objRecord.row[objFieldName];
    const { error } = await supabase.from('loan_modification_requests').insert({
      application_id: objRecord.row.id,
      requested_by: user?.id ?? null,
      requester_name: profile?.full_name ?? null,
      requester_role: role ?? null,
      field_name: objFieldName,
      old_value: oldValue == null ? null : String(oldValue),
      new_value: objNewValue,
      reason: objReason.trim(),
      status: 'pending',
    });
    setObjSubmitting(false);

    if (error) {
      console.error('Failed to submit modification request:', error);
      toast.error(
        language === 'ar'
          ? `فشل إرسال الطلب: ${error.message}`
          : `Failed to submit request: ${error.message}`
      );
      return;
    }

    // Submission is also audit-logged automatically by the DB trigger.
    toast.success(
      language === 'ar'
        ? 'تم إرسال طلب التعديل بنجاح'
        : 'Modification request submitted successfully'
    );
    resetObjection();
    setIsObjectionOpen(false);
  };

  const openRiskExplanation = (app: CreditApplication) => {
    setRiskExplanationApp(app);
    setRiskExplanationOpen(true);
  };

  const filteredApplications = applications.filter(app =>
    app.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    app.id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <DashboardLayout>
      <PageOnboardingTour tourId="credit-risk" />
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

          <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2">
          <LoanRiskInfoPopover language={language} />
          <Dialog
            open={isNewAssessmentOpen}
            onOpenChange={(open) => {
              setIsNewAssessmentOpen(open);
              if (!open) resetAssessmentForm();
            }}
          >
            <DialogTrigger asChild>
              <Button className="gradient-bg gap-2" data-tour-target="new-assessment">
                <Plus className="h-4 w-4" />
                {t('credit.newAssessment')}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{t('credit.newAssessment')}</DialogTitle>
                <DialogDescription>
                  {language === 'ar'
                    ? 'أدخل رقم الحساب لتحميل بيانات العميل تلقائياً'
                    : 'Enter the account number to load customer data automatically'}
                </DialogDescription>
              </DialogHeader>
              
              <div className="space-y-6 py-4">
                {assessmentResult ? (
                  <>
                    <SavedRiskExplanationView explanation={assessmentResult} language={language} />
                    <div className="flex justify-end">
                      <Button
                        onClick={() => {
                          resetAssessmentForm();
                          setIsNewAssessmentOpen(false);
                        }}
                        className="gradient-bg"
                      >
                        {language === 'ar' ? 'تم' : 'Done'}
                      </Button>
                    </div>
                  </>
                ) : (
                <>
                {/* Account lookup */}
                <div className="space-y-2">
                  <Label>{language === 'ar' ? 'رقم الحساب' : 'Account Number'}</Label>
                  <div className="flex gap-2">
                    <Input
                      value={accountNumber}
                      onChange={(e) => {
                        setAccountNumber(e.target.value);
                        setCustomerLoaded(false);
                        setCustomerLoanRestricted(false);
                      }}
                      placeholder={language === 'ar' ? 'مثال: BOP-100001' : 'e.g. BOP-100001'}
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={loadCustomerByAccount}
                      disabled={loadCustomerLoading}
                    >
                      {loadCustomerLoading && (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      )}
                      {language === 'ar' ? 'تحميل العميل' : 'Load Customer'}
                    </Button>
                  </div>
                  {customerLoaded && !customerLoanRestricted && (
                    <p className="text-xs text-success flex items-center gap-1">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {language === 'ar'
                        ? 'تم تحميل بيانات العميل — يمكنك تعديل الحقول قبل التقييم'
                        : 'Customer loaded — you may edit fields before assessing'}
                    </p>
                  )}
                  {customerLoaded && customerLoanRestricted && (
                    <div
                      className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive flex gap-2"
                      role="alert"
                    >
                      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                      <span>
                        {language === 'ar' ? LOAN_RESTRICTED_MESSAGE_AR : LOAN_RESTRICTED_MESSAGE}
                      </span>
                    </div>
                  )}
                </div>

                {customerLoaded && (
                <>
                <div className="space-y-4">
                  <h3 className="font-semibold">{t('credit.customerInfo')}</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>{language === 'ar' ? 'اسم العميل' : 'Customer Name'}</Label>
                      <Input
                        value={formData.customerName}
                        onChange={(e) => handleInputChange('customerName', e.target.value)}
                        placeholder={language === 'ar' ? 'أدخل الاسم' : 'Enter name'}
                        disabled={customerLoanRestricted}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{language === 'ar' ? 'رقم الهوية' : 'National ID'}</Label>
                      <Input
                        value={formData.nationalId}
                        onChange={(e) => handleInputChange('nationalId', e.target.value)}
                        placeholder="XXXXXXXXXXX"
                        disabled={customerLoanRestricted}
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
                        disabled={customerLoanRestricted}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{language === 'ar' ? 'المصاريف الشهرية' : 'Monthly Expenses'}</Label>
                      <Input
                        type="number"
                        value={formData.monthlyExpenses}
                        onChange={(e) => handleInputChange('monthlyExpenses', e.target.value)}
                        placeholder="0.00"
                        disabled={customerLoanRestricted}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{language === 'ar' ? 'القروض الحالية' : 'Existing Loans'}</Label>
                      <Input
                        type="number"
                        value={formData.existingLoans}
                        onChange={(e) => handleInputChange('existingLoans', e.target.value)}
                        placeholder="0.00"
                        disabled={customerLoanRestricted}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{language === 'ar' ? 'نوع التوظيف' : 'Employment Type'}</Label>
                      <Select
                        value={formData.employmentType}
                        onValueChange={(v) => handleInputChange('employmentType', v)}
                        disabled={customerLoanRestricted}
                      >
                        <SelectTrigger disabled={customerLoanRestricted}>
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
                        placeholder={language === 'ar' ? 'أدخل المبلغ يدوياً' : 'Enter amount manually'}
                        disabled={customerLoanRestricted}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{language === 'ar' ? 'الغرض من القرض' : 'Loan Purpose'}</Label>
                      <Select
                        value={formData.loanPurpose}
                        onValueChange={(v) => handleInputChange('loanPurpose', v)}
                        disabled={customerLoanRestricted}
                      >
                        <SelectTrigger disabled={customerLoanRestricted}>
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
                  <Button
                    onClick={handleSubmitAssessment}
                    className="gradient-bg"
                    disabled={customerLoanRestricted || assessmentSubmitting}
                  >
                    {assessmentSubmitting && (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    )}
                    {language === 'ar' ? 'تقييم المخاطر' : 'Assess Risk'}
                  </Button>
                </div>
                </>
                )}

                {!customerLoaded && (
                  <p className="text-sm text-muted-foreground text-center py-6">
                    {language === 'ar'
                      ? 'أدخل رقم الحساب واضغط «تحميل العميل» لعرض النموذج'
                      : 'Enter an account number and click Load Customer to show the form'}
                  </p>
                )}
                </>
                )}
              </div>
            </DialogContent>
          </Dialog>
          </div>

          <Dialog
            open={isObjectionOpen}
            onOpenChange={(open) => {
              setIsObjectionOpen(open);
              if (!open) resetObjection();
            }}
          >
            <DialogTrigger asChild>
              <Button variant="outline" className="gap-2" data-tour-target="objection-modification">
                <Pencil className="h-4 w-4" />
                {language === 'ar' ? 'اعتراض / تعديل' : 'Objection / Modification'}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  {language === 'ar' ? 'طلب اعتراض / تعديل' : 'Objection / Modification Request'}
                </DialogTitle>
                <DialogDescription>
                  {language === 'ar'
                    ? 'حمّل طلباً موجوداً واطلب تعديل حقل واحد مع ذكر السبب'
                    : 'Load an existing application and request a change to a single field with a reason'}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-6 py-4">
                {/* Step 1: load application */}
                <div className="space-y-2">
                  <Label>{language === 'ar' ? 'رقم الطلب' : 'Application ID'}</Label>
                  <div className="flex gap-2">
                    <Input
                      value={objAppId}
                      onChange={(e) => setObjAppId(e.target.value)}
                      placeholder={language === 'ar' ? 'أدخل رقم الطلب (UUID)' : 'Enter Application ID (UUID)'}
                    />
                    <Button
                      variant="secondary"
                      onClick={loadApplicationForObjection}
                      disabled={objLoading}
                    >
                      {objLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      {language === 'ar' ? 'تحميل الطلب' : 'Load Application'}
                    </Button>
                  </div>
                </div>

                {objRecord && (
                  <>
                    {/* Step 3: read-only fields + choose field to edit */}
                    <div className="space-y-2">
                      <Label>{language === 'ar' ? 'الحقل المراد تعديله' : 'Field to Edit'}</Label>
                      <Select value={objFieldName} onValueChange={handleSelectEditField}>
                        <SelectTrigger>
                          <SelectValue
                            placeholder={language === 'ar' ? 'اختر حقلاً' : 'Select a field'}
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {availableEditFields.map((f) => (
                            <SelectItem key={f.key} value={f.key}>
                              {language === 'ar' ? f.ar : f.en}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      {availableEditFields.map((f) => {
                        const isEditing = objFieldName === f.key;
                        const raw = objRecord.row[f.key];
                        return (
                          <div className="space-y-2" key={f.key}>
                            <Label className={isEditing ? 'text-primary' : ''}>
                              {language === 'ar' ? f.ar : f.en}
                              {isEditing && (
                                <span className="ml-1 text-xs">
                                  {language === 'ar' ? '(قابل للتعديل)' : '(editable)'}
                                </span>
                              )}
                            </Label>
                            <Input
                              value={isEditing ? objNewValue : raw == null ? '' : String(raw)}
                              onChange={(e) => setObjNewValue(e.target.value)}
                              readOnly={!isEditing}
                              disabled={!isEditing}
                            />
                          </div>
                        );
                      })}
                    </div>

                    {/* Step 4: reason */}
                    <div className="space-y-2">
                      <Label>
                        {language === 'ar' ? 'سبب التعديل / الاعتراض' : 'Reason for modification / objection'}
                        <span className="text-destructive"> *</span>
                      </Label>
                      <Textarea
                        value={objReason}
                        onChange={(e) => setObjReason(e.target.value)}
                        placeholder={
                          language === 'ar' ? 'اشرح سبب التعديل المطلوب' : 'Explain why this change is needed'
                        }
                        rows={3}
                      />
                    </div>
                  </>
                )}

                <div className="flex gap-3 justify-end pt-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      resetObjection();
                      setIsObjectionOpen(false);
                    }}
                    disabled={objSubmitting}
                  >
                    {t('common.cancel')}
                  </Button>
                  <Button
                    onClick={submitObjection}
                    className="gradient-bg"
                    disabled={!objRecord || objSubmitting}
                  >
                    {objSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    {language === 'ar' ? 'إرسال الطلب' : 'Submit Request'}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
          </div>
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
                  <p className="text-2xl font-bold">
                    <StatValue loading={statsLoading} error={statsError} value={stats.totalAssessments.toLocaleString()} />
                  </p>
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
                  <p className="text-2xl font-bold text-success">
                    <StatValue loading={statsLoading} error={statsError} value={stats.lowRisk.toLocaleString()} />
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
                  <p className="text-sm text-muted-foreground">{t('credit.mediumRisk')}</p>
                  <p className="text-2xl font-bold text-warning">
                    <StatValue loading={statsLoading} error={statsError} value={stats.mediumRisk.toLocaleString()} />
                  </p>
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
                  <p className="text-2xl font-bold text-destructive">
                    <StatValue loading={statsLoading} error={statsError} value={stats.highRisk.toLocaleString()} />
                  </p>
                </div>
                <TrendingDown className="h-8 w-8 text-destructive opacity-50" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Applications Table */}
        <Card data-tour-target="assessment-table">
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
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openRiskExplanation(app)}
                          title={
                            language === 'ar' ? 'عرض تفسير المخاطر' : 'View risk explanation'
                          }
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        {app.status === 'pending' && isRole(ROLES.RISK) && (
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

        <Dialog
          open={riskExplanationOpen}
          onOpenChange={(open) => {
            setRiskExplanationOpen(open);
            if (!open) setRiskExplanationApp(null);
          }}
        >
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {language === 'ar' ? 'تفسير تقييم المخاطر' : 'Risk assessment explanation'}
              </DialogTitle>
              <DialogDescription>
                {riskExplanationApp
                  ? `${riskExplanationApp.customerName} · ₪${riskExplanationApp.loanAmount.toLocaleString()} · ${riskExplanationApp.id.slice(0, 8)}…`
                  : ''}
              </DialogDescription>
            </DialogHeader>
            {riskExplanationApp?.savedRiskExplanation ? (
              <SavedRiskExplanationView
                explanation={riskExplanationApp.savedRiskExplanation}
                language={language}
              />
            ) : (
              <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground text-sm">
                {language === 'ar'
                  ? 'لا يوجد تفسير محفوظ لهذا التقييم.'
                  : 'No saved risk explanation is available for this assessment.'}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default CreditRisk;
