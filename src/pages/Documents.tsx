import React, { useState, useCallback } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
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
  FileText,
  Upload,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Eye,
  Download,
  Trash2,
  FileImage,
  FileSpreadsheet,
  File,
  Loader2,
  UserPlus,
  UserCog,
  UserX,
  ArrowRight,
  ArrowLeft,
  ScanLine,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface Document {
  id: string;
  name: string;
  type: 'pdf' | 'image' | 'excel';
  uploadDate: string;
  status: 'processing' | 'completed' | 'failed' | 'review';
  extractedFields?: number;
  confidence?: number;
  size: string;
}

const mockDocuments: Document[] = [
  {
    id: 'DOC-001',
    name: 'loan_application_ahmed.pdf',
    type: 'pdf',
    uploadDate: '2024-01-15',
    status: 'completed',
    extractedFields: 24,
    confidence: 97,
    size: '2.4 MB',
  },
  {
    id: 'DOC-002',
    name: 'id_card_front.jpg',
    type: 'image',
    uploadDate: '2024-01-15',
    status: 'completed',
    extractedFields: 8,
    confidence: 95,
    size: '1.2 MB',
  },
  {
    id: 'DOC-003',
    name: 'salary_slip_dec.pdf',
    type: 'pdf',
    uploadDate: '2024-01-14',
    status: 'review',
    extractedFields: 12,
    confidence: 78,
    size: '856 KB',
  },
  {
    id: 'DOC-004',
    name: 'bank_statement.xlsx',
    type: 'excel',
    uploadDate: '2024-01-14',
    status: 'processing',
    size: '4.1 MB',
  },
  {
    id: 'DOC-005',
    name: 'property_deed.pdf',
    type: 'pdf',
    uploadDate: '2024-01-13',
    status: 'failed',
    size: '12.3 MB',
  },
];

const getDocTypeIcon = (type: Document['type']) => {
  switch (type) {
    case 'pdf': return FileText;
    case 'image': return FileImage;
    case 'excel': return FileSpreadsheet;
    default: return File;
  }
};

const getStatusBadge = (status: Document['status'], language: string) => {
  switch (status) {
    case 'completed':
      return (
        <Badge className="bg-success/10 text-success border-success/20">
          <CheckCircle2 className="h-3 w-3 mr-1" />
          {language === 'ar' ? 'مكتمل' : 'Completed'}
        </Badge>
      );
    case 'processing':
      return (
        <Badge className="bg-info/10 text-info border-info/20">
          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
          {language === 'ar' ? 'قيد المعالجة' : 'Processing'}
        </Badge>
      );
    case 'review':
      return (
        <Badge className="bg-warning/10 text-warning border-warning/20">
          <AlertTriangle className="h-3 w-3 mr-1" />
          {language === 'ar' ? 'يحتاج مراجعة' : 'Needs Review'}
        </Badge>
      );
    case 'failed':
      return (
        <Badge className="bg-destructive/10 text-destructive border-destructive/20">
          <AlertTriangle className="h-3 w-3 mr-1" />
          {language === 'ar' ? 'فشل' : 'Failed'}
        </Badge>
      );
  }
};

interface BranchTask {
  id: string;
  icon: React.ElementType;
  titleKey: string;
  descKey: string;
  available: boolean;
}

const branchTasks: BranchTask[] = [
  {
    id: 'open-account',
    icon: UserPlus,
    titleKey: 'tasks.openAccount',
    descKey: 'tasks.openAccount.desc',
    available: true,
  },
  {
    id: 'update-customer',
    icon: UserCog,
    titleKey: 'tasks.updateCustomer',
    descKey: 'tasks.updateCustomer.desc',
    available: false,
  },
  {
    id: 'close-account',
    icon: UserX,
    titleKey: 'tasks.closeAccount',
    descKey: 'tasks.closeAccount.desc',
    available: false,
  },
];

export const Documents: React.FC = () => {
  const { t, language, direction } = useLanguage();
  const StartArrow = direction === 'rtl' ? ArrowLeft : ArrowRight;
  const [documents, setDocuments] = useState<Document[]>(mockDocuments);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [activeTab, setActiveTab] = useState('all');

  const emptyAccountForm = {
    fullName: '',
    nationalId: '',
    phone: '',
    email: '',
    accountType: 'savings',
    initialDeposit: '',
  };
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [accountForm, setAccountForm] = useState(emptyAccountForm);
  const [accountStep, setAccountStep] = useState(1);
  const [idFile, setIdFile] = useState<File | null>(null);
  const [idDragging, setIdDragging] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);

  const handleAccountFieldChange = (
    field: keyof typeof emptyAccountForm,
    value: string
  ) => {
    setAccountForm((prev) => ({ ...prev, [field]: value }));
  };

  const resetAccountWizard = () => {
    setAccountStep(1);
    setIdFile(null);
    setIdDragging(false);
    setExtracting(false);
    setExtractError(null);
    setAccountForm(emptyAccountForm);
  };

  const openNewAccount = () => {
    resetAccountWizard();
    setAccountModalOpen(true);
  };

  const closeAccountModal = () => {
    setAccountModalOpen(false);
    resetAccountWizard();
  };

  const isValidIdFile = (file: File) =>
    ['image/jpeg', 'image/png', 'application/pdf'].includes(file.type) ||
    /\.(jpe?g|png|pdf)$/i.test(file.name);

  const handleIdFiles = (files: File[]) => {
    const file = files[0];
    if (!file) return;
    if (!isValidIdFile(file)) {
      toast.error(
        language === 'ar'
          ? 'يُسمح فقط بملفات JPG أو PNG أو PDF'
          : 'Only JPG, PNG, or PDF files are allowed'
      );
      return;
    }
    setExtractError(null);
    setIdFile(file);
  };

  const handleIdDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIdDragging(true);
  };

  const handleIdDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIdDragging(false);
  };

  const handleIdDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIdDragging(false);
    handleIdFiles(Array.from(e.dataTransfer.files));
  };

  const handleIdInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleIdFiles(e.target.files ? Array.from(e.target.files) : []);
  };

  const handleExtractData = () => {
    if (!idFile || extracting) return;
    setExtractError(null);
    setExtracting(true);

    // Simulated OCR/extraction. Files whose name hints at a poor scan
    // (e.g. "blur", "unclear", "fail") demonstrate the failure path.
    const willFail = /blur|unclear|fail/i.test(idFile.name);

    window.setTimeout(() => {
      setExtracting(false);
      if (willFail) {
        setExtractError(
          language === 'ar'
            ? 'تعذّر قراءة الهوية بوضوح. يرجى رفع صورة أوضح.'
            : 'Could not read the ID clearly. Please upload a clearer photo.'
        );
        return;
      }
      // Prefill the review step with the extracted details.
      setAccountForm((prev) => ({
        ...prev,
        fullName: prev.fullName || 'Ahmad Khalil',
        nationalId: prev.nationalId || '400123456',
      }));
      setAccountStep(2);
    }, 2000);
  };

  const goToCompleteStep = (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountForm.fullName.trim() || !accountForm.nationalId.trim()) {
      toast.error(
        language === 'ar'
          ? 'يرجى إدخال الاسم الكامل ورقم الهوية'
          : 'Please enter the full name and national ID'
      );
      return;
    }
    setAccountStep(3);
    toast.success(
      language === 'ar'
        ? `تم بدء طلب فتح حساب لـ ${accountForm.fullName}`
        : `New account request started for ${accountForm.fullName}`
    );
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = Array.from(e.dataTransfer.files);
    handleFiles(files);
  }, []);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    handleFiles(files);
  };

  const handleFiles = (files: File[]) => {
    if (files.length === 0) return;

    setIsUploading(true);
    
    // Simulate upload and processing
    setTimeout(() => {
      const newDocs: Document[] = files.map((file, index) => ({
        id: `DOC-${Date.now()}-${index}`,
        name: file.name,
        type: file.name.endsWith('.pdf') ? 'pdf' : 
              file.name.endsWith('.xlsx') ? 'excel' : 'image',
        uploadDate: new Date().toISOString().split('T')[0],
        status: 'processing' as const,
        size: `${(file.size / 1024 / 1024).toFixed(1)} MB`,
      }));

      setDocuments(prev => [...newDocs, ...prev]);
      setIsUploading(false);
      
      toast.success(
        language === 'ar'
          ? `تم رفع ${files.length} ملفات بنجاح`
          : `${files.length} files uploaded successfully`
      );

      // Simulate processing completion
      setTimeout(() => {
        setDocuments(prev => 
          prev.map(doc => 
            newDocs.some(nd => nd.id === doc.id)
              ? { ...doc, status: 'completed' as const, extractedFields: 15, confidence: 92 }
              : doc
          )
        );
      }, 3000);
    }, 1500);
  };

  const filteredDocuments = documents.filter(doc => {
    if (activeTab === 'all') return true;
    return doc.status === activeTab;
  });

  const stats = {
    total: documents.length,
    completed: documents.filter(d => d.status === 'completed').length,
    processing: documents.filter(d => d.status === 'processing').length,
    review: documents.filter(d => d.status === 'review').length,
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-foreground">
            {language === 'ar' ? 'المستندات' : 'Documents'}
          </h1>
          <p className="text-muted-foreground mt-1">{t('tasks.subtitle')}</p>
        </div>

        {/* Branch task selection grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {branchTasks.map((task) => {
            const Icon = task.icon;
            const handleClick = () => {
              if (!task.available) return;
              if (task.id === 'open-account') openNewAccount();
            };

            return (
              <Card
                key={task.id}
                onClick={handleClick}
                role={task.available ? 'button' : undefined}
                tabIndex={task.available ? 0 : undefined}
                onKeyDown={(e) => {
                  if (task.available && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    handleClick();
                  }
                }}
                className={cn(
                  'stat-card transition-all duration-200',
                  task.available
                    ? 'cursor-pointer hover:-translate-y-0.5 hover:shadow-lg hover:border-primary/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary'
                    : 'opacity-60 cursor-not-allowed'
                )}
                aria-disabled={!task.available}
              >
                <CardContent className="p-6">
                  <div className="flex items-start gap-4">
                    <div
                      className={cn(
                        'p-3 rounded-xl flex-shrink-0',
                        task.available ? 'bg-primary/10' : 'bg-muted'
                      )}
                    >
                      <Icon
                        className={cn(
                          'h-6 w-6',
                          task.available ? 'text-primary' : 'text-muted-foreground'
                        )}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="font-semibold text-lg text-foreground">
                          {t(task.titleKey)}
                        </h3>
                        {!task.available && (
                          <Badge variant="secondary" className="flex-shrink-0 text-xs">
                            {t('tasks.comingSoon')}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {t(task.descKey)}
                      </p>
                    </div>
                  </div>

                  {task.available && (
                    <div className="mt-4 flex items-center gap-1 text-sm font-medium text-primary">
                      {t('tasks.start')}
                      <StartArrow className="h-4 w-4" />
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Open New Account modal */}
        <Dialog
          open={accountModalOpen}
          onOpenChange={(open) => (open ? setAccountModalOpen(true) : closeAccountModal())}
        >
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>
                  {language === 'ar' ? 'فتح حساب جديد' : 'Open New Account'}
                </DialogTitle>
                <DialogDescription>
                  {language === 'ar'
                    ? 'أكمل الخطوات لبدء عملية فتح حساب جديد'
                    : 'Complete the steps to start opening a new account'}
                </DialogDescription>
              </DialogHeader>

              {/* Step indicator */}
              <div className="flex items-center justify-between py-1">
                {[
                  { n: 1, label: language === 'ar' ? 'رفع الهوية' : 'Upload ID' },
                  { n: 2, label: language === 'ar' ? 'مراجعة البيانات' : 'Review Data' },
                  { n: 3, label: language === 'ar' ? 'اكتمال' : 'Complete' },
                ].map((s, i, arr) => (
                  <React.Fragment key={s.n}>
                    <div className="flex flex-col items-center gap-1.5">
                      <div
                        className={cn(
                          'flex h-9 w-9 items-center justify-center rounded-full border-2 text-sm font-semibold transition-colors',
                          accountStep > s.n && 'bg-primary border-primary text-primary-foreground',
                          accountStep === s.n && 'border-primary text-primary',
                          accountStep < s.n && 'border-border text-muted-foreground'
                        )}
                      >
                        {accountStep > s.n ? <CheckCircle2 className="h-5 w-5" /> : s.n}
                      </div>
                      <span
                        className={cn(
                          'text-xs whitespace-nowrap',
                          accountStep >= s.n
                            ? 'text-foreground font-medium'
                            : 'text-muted-foreground'
                        )}
                      >
                        {s.label}
                      </span>
                    </div>
                    {i < arr.length - 1 && (
                      <div
                        className={cn(
                          'h-0.5 flex-1 mx-2 rounded',
                          accountStep > s.n ? 'bg-primary' : 'bg-border'
                        )}
                      />
                    )}
                  </React.Fragment>
                ))}
              </div>

              {/* Step 1: Upload ID + extraction */}
              {accountStep === 1 && (
                <div className="space-y-4">
                  {extracting ? (
                    <div className="border-2 border-dashed border-border rounded-xl p-8 flex flex-col items-center gap-4 text-center">
                      <Loader2 className="h-12 w-12 text-primary animate-spin" />
                      <p className="text-muted-foreground">
                        {language === 'ar'
                          ? 'جارٍ استخراج بيانات العميل...'
                          : 'Extracting customer information...'}
                      </p>
                    </div>
                  ) : (
                    <>
                      <div
                        className={cn(
                          'border-2 border-dashed rounded-xl p-8 text-center transition-all',
                          idDragging
                            ? 'border-primary bg-primary/5'
                            : 'border-border hover:border-primary/50'
                        )}
                        onDragOver={handleIdDragOver}
                        onDragLeave={handleIdDragLeave}
                        onDrop={handleIdDrop}
                      >
                        {idFile ? (
                          <div className="flex flex-col items-center gap-3">
                            <FileText className="h-12 w-12 text-primary" />
                            <p className="font-medium break-all max-w-[280px]">{idFile.name}</p>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setIdFile(null);
                                setExtractError(null);
                              }}
                            >
                              {language === 'ar' ? 'إزالة الملف' : 'Remove file'}
                            </Button>
                          </div>
                        ) : (
                          <>
                            <Upload className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                            <h3 className="text-lg font-semibold mb-2">
                              {language === 'ar'
                                ? 'اسحب وأفلت هوية العميل هنا'
                                : 'Drag and drop the customer ID here'}
                            </h3>
                            <p className="text-muted-foreground mb-4">
                              {language === 'ar'
                                ? 'أو اضغط لاختيار ملف (JPG، PNG، PDF)'
                                : 'or click to browse (JPG, PNG, PDF)'}
                            </p>
                            <input
                              type="file"
                              id="id-upload"
                              className="hidden"
                              accept=".jpg,.jpeg,.png,.pdf"
                              onChange={handleIdInput}
                            />
                            <label htmlFor="id-upload">
                              <Button asChild className="gradient-bg">
                                <span>{language === 'ar' ? 'اختيار ملف' : 'Choose File'}</span>
                              </Button>
                            </label>
                          </>
                        )}
                      </div>

                      {extractError && (
                        <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3">
                          <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
                          <div className="flex-1">
                            <p className="text-sm text-destructive">{extractError}</p>
                            <Button
                              variant="outline"
                              size="sm"
                              className="mt-2"
                              onClick={handleExtractData}
                            >
                              {language === 'ar' ? 'حاول مرة أخرى' : 'Try Again'}
                            </Button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Step 2: Review Data */}
              {accountStep === 2 && (
                <form
                  id="review-account-form"
                  onSubmit={goToCompleteStep}
                  className="grid grid-cols-1 sm:grid-cols-2 gap-4"
                >
                  <div className="space-y-2">
                    <Label htmlFor="acc-full-name">
                      {language === 'ar' ? 'الاسم الكامل' : 'Full Name'}
                    </Label>
                    <Input
                      id="acc-full-name"
                      value={accountForm.fullName}
                      onChange={(e) => handleAccountFieldChange('fullName', e.target.value)}
                      placeholder={language === 'ar' ? 'اسم العميل' : 'Customer name'}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="acc-national-id">
                      {language === 'ar' ? 'رقم الهوية' : 'National ID'}
                    </Label>
                    <Input
                      id="acc-national-id"
                      value={accountForm.nationalId}
                      onChange={(e) => handleAccountFieldChange('nationalId', e.target.value)}
                      placeholder={language === 'ar' ? 'رقم الهوية' : 'ID number'}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="acc-phone">
                      {language === 'ar' ? 'رقم الهاتف' : 'Phone Number'}
                    </Label>
                    <Input
                      id="acc-phone"
                      type="tel"
                      value={accountForm.phone}
                      onChange={(e) => handleAccountFieldChange('phone', e.target.value)}
                      placeholder={language === 'ar' ? 'رقم الهاتف' : 'Phone'}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="acc-email">
                      {language === 'ar' ? 'البريد الإلكتروني' : 'Email'}
                    </Label>
                    <Input
                      id="acc-email"
                      type="email"
                      value={accountForm.email}
                      onChange={(e) => handleAccountFieldChange('email', e.target.value)}
                      placeholder={language === 'ar' ? 'البريد الإلكتروني' : 'Email'}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="acc-type">
                      {language === 'ar' ? 'نوع الحساب' : 'Account Type'}
                    </Label>
                    <Select
                      value={accountForm.accountType}
                      onValueChange={(value) => handleAccountFieldChange('accountType', value)}
                    >
                      <SelectTrigger id="acc-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="savings">
                          {language === 'ar' ? 'حساب توفير' : 'Savings'}
                        </SelectItem>
                        <SelectItem value="current">
                          {language === 'ar' ? 'حساب جاري' : 'Current'}
                        </SelectItem>
                        <SelectItem value="business">
                          {language === 'ar' ? 'حساب تجاري' : 'Business'}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="acc-deposit">
                      {language === 'ar' ? 'الإيداع المبدئي' : 'Initial Deposit'}
                    </Label>
                    <Input
                      id="acc-deposit"
                      type="number"
                      min="0"
                      value={accountForm.initialDeposit}
                      onChange={(e) => handleAccountFieldChange('initialDeposit', e.target.value)}
                      placeholder="0"
                    />
                  </div>
                </form>
              )}

              {/* Step 3: Complete */}
              {accountStep === 3 && (
                <div className="flex flex-col items-center text-center gap-4 py-6">
                  <div className="p-4 rounded-full bg-success/10">
                    <CheckCircle2 className="h-12 w-12 text-success" />
                  </div>
                  <h3 className="text-lg font-semibold">
                    {language === 'ar' ? 'اكتمل الطلب' : 'All Done'}
                  </h3>
                  <p className="text-muted-foreground max-w-sm">
                    {language === 'ar'
                      ? `تم بدء طلب فتح حساب جديد${accountForm.fullName ? ` لـ ${accountForm.fullName}` : ''}.`
                      : `The new account request${accountForm.fullName ? ` for ${accountForm.fullName}` : ''} has been started.`}
                  </p>
                </div>
              )}

              {/* Footer actions */}
              <div className="flex items-center justify-between gap-2 pt-2">
                {accountStep < 3 ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={closeAccountModal}
                    disabled={extracting}
                  >
                    {language === 'ar' ? 'إلغاء' : 'Cancel'}
                  </Button>
                ) : (
                  <span />
                )}

                <div className="flex gap-2">
                  {accountStep === 2 && (
                    <Button type="button" variant="outline" onClick={() => setAccountStep(1)}>
                      {language === 'ar' ? 'رجوع' : 'Back'}
                    </Button>
                  )}
                  {accountStep === 1 && idFile && !extractError && (
                    <Button
                      type="button"
                      className="gradient-bg gap-2"
                      onClick={handleExtractData}
                      disabled={extracting}
                    >
                      {extracting ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          {language === 'ar' ? 'جارٍ الاستخراج...' : 'Extracting...'}
                        </>
                      ) : (
                        <>
                          <ScanLine className="h-4 w-4" />
                          {language === 'ar' ? 'استخراج البيانات' : 'Extract Data'}
                        </>
                      )}
                    </Button>
                  )}
                  {accountStep === 2 && (
                    <Button type="submit" form="review-account-form" className="gradient-bg gap-2">
                      {language === 'ar' ? 'التالي' : 'Next'}
                      <StartArrow className="h-4 w-4" />
                    </Button>
                  )}
                  {accountStep === 3 && (
                    <Button type="button" className="gradient-bg" onClick={closeAccountModal}>
                      {language === 'ar' ? 'تم' : 'Done'}
                    </Button>
                  )}
                </div>
              </div>
            </DialogContent>
          </Dialog>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="stat-card">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">
                    {language === 'ar' ? 'إجمالي المستندات' : 'Total Documents'}
                  </p>
                  <p className="text-2xl font-bold">{stats.total}</p>
                </div>
                <FileText className="h-8 w-8 text-primary opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card className="stat-card">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t('docs.completed')}</p>
                  <p className="text-2xl font-bold text-success">{stats.completed}</p>
                </div>
                <CheckCircle2 className="h-8 w-8 text-success opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card className="stat-card">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t('docs.processing')}</p>
                  <p className="text-2xl font-bold text-info">{stats.processing}</p>
                </div>
                <Clock className="h-8 w-8 text-info opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card className="stat-card">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t('docs.review')}</p>
                  <p className="text-2xl font-bold text-warning">{stats.review}</p>
                </div>
                <AlertTriangle className="h-8 w-8 text-warning opacity-50" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Upload Area */}
        <Card>
          <CardContent className="p-6">
            <div
              className={cn(
                "border-2 border-dashed rounded-xl p-8 text-center transition-all",
                isDragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50",
                isUploading && "pointer-events-none opacity-60"
              )}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              {isUploading ? (
                <div className="flex flex-col items-center gap-4">
                  <Loader2 className="h-12 w-12 text-primary animate-spin" />
                  <p className="text-muted-foreground">
                    {language === 'ar' ? 'جاري رفع الملفات...' : 'Uploading files...'}
                  </p>
                </div>
              ) : (
                <>
                  <Upload className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">
                    {language === 'ar' ? 'اسحب وأفلت الملفات هنا' : 'Drag and drop files here'}
                  </h3>
                  <p className="text-muted-foreground mb-4">
                    {language === 'ar' 
                      ? 'أو اضغط لاختيار الملفات (PDF, JPG, PNG, Excel)' 
                      : 'or click to browse (PDF, JPG, PNG, Excel)'}
                  </p>
                  <input
                    type="file"
                    id="file-upload"
                    className="hidden"
                    multiple
                    accept=".pdf,.jpg,.jpeg,.png,.xlsx,.xls"
                    onChange={handleFileInput}
                  />
                  <label htmlFor="file-upload">
                    <Button asChild className="gradient-bg">
                      <span>{t('docs.upload')}</span>
                    </Button>
                  </label>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Documents Table */}
        <Card>
          <CardHeader>
            <CardTitle>{language === 'ar' ? 'المستندات' : 'Documents'}</CardTitle>
            <CardDescription>
              {language === 'ar' 
                ? 'عرض جميع المستندات المرفوعة وحالة المعالجة' 
                : 'View all uploaded documents and processing status'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-4">
              <TabsList>
                <TabsTrigger value="all">
                  {language === 'ar' ? 'الكل' : 'All'} ({documents.length})
                </TabsTrigger>
                <TabsTrigger value="completed">
                  {t('docs.completed')} ({stats.completed})
                </TabsTrigger>
                <TabsTrigger value="processing">
                  {t('docs.processing')} ({stats.processing})
                </TabsTrigger>
                <TabsTrigger value="review">
                  {t('docs.review')} ({stats.review})
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{language === 'ar' ? 'الملف' : 'File'}</TableHead>
                  <TableHead>{language === 'ar' ? 'الحجم' : 'Size'}</TableHead>
                  <TableHead>{language === 'ar' ? 'التاريخ' : 'Date'}</TableHead>
                  <TableHead>{language === 'ar' ? 'الحالة' : 'Status'}</TableHead>
                  <TableHead>{language === 'ar' ? 'الحقول المستخرجة' : 'Extracted Fields'}</TableHead>
                  <TableHead>{language === 'ar' ? 'الثقة' : 'Confidence'}</TableHead>
                  <TableHead>{language === 'ar' ? 'الإجراءات' : 'Actions'}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredDocuments.map((doc) => {
                  const Icon = getDocTypeIcon(doc.type);
                  return (
                    <TableRow key={doc.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-muted">
                            <Icon className="h-5 w-5 text-muted-foreground" />
                          </div>
                          <span className="font-medium truncate max-w-[200px]">{doc.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{doc.size}</TableCell>
                      <TableCell className="text-muted-foreground">{doc.uploadDate}</TableCell>
                      <TableCell>{getStatusBadge(doc.status, language)}</TableCell>
                      <TableCell>
                        {doc.extractedFields ? (
                          <span className="font-medium">{doc.extractedFields}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {doc.confidence ? (
                          <div className="flex items-center gap-2">
                            <Progress 
                              value={doc.confidence} 
                              className={cn(
                                "w-16 h-2",
                                doc.confidence >= 90 && "[&>div]:bg-success",
                                doc.confidence >= 70 && doc.confidence < 90 && "[&>div]:bg-warning",
                                doc.confidence < 70 && "[&>div]:bg-destructive"
                              )}
                            />
                            <span className="text-sm font-medium">{doc.confidence}%</span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon">
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon">
                            <Download className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="text-destructive">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
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

export default Documents;
