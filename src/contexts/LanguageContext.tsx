import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

type Language = 'en' | 'ar';
type Direction = 'ltr' | 'rtl';

interface Translations {
  [key: string]: {
    en: string;
    ar: string;
  };
}

const translations: Translations = {
  // Navigation
  'nav.dashboard': { en: 'Dashboard', ar: 'لوحة التحكم' },
  'nav.creditRisk': { en: 'Credit Risk', ar: 'مخاطر الائتمان' },
  'nav.documents': { en: 'Documents', ar: 'المستندات' },
  'nav.aiAssistant': { en: 'AI Assistant', ar: 'المساعد الذكي' },
  'nav.approvals': { en: 'Approvals', ar: 'الموافقات' },
  'nav.auditLog': { en: 'Audit Log', ar: 'سجل المراجعة' },
  'nav.modificationRequests': { en: 'Modification Requests', ar: 'طلبات التعديل' },
  'nav.users': { en: 'User Management', ar: 'إدارة المستخدمين' },
  'nav.settings': { en: 'Settings', ar: 'الإعدادات' },
  'nav.logout': { en: 'Logout', ar: 'تسجيل الخروج' },
  
  // Dashboard
  'dashboard.welcome': { en: 'Welcome back', ar: 'مرحباً بعودتك' },
  'dashboard.title': { en: 'Banking Intelligence Platform', ar: 'منصة الذكاء المصرفي' },
  'dashboard.totalApplications': { en: 'Total Applications', ar: 'إجمالي الطلبات' },
  'dashboard.pendingReview': { en: 'Pending Review', ar: 'في انتظار المراجعة' },
  'dashboard.approvedToday': { en: 'Approved Today', ar: 'تمت الموافقة اليوم' },
  'dashboard.riskScore': { en: 'Avg Risk Score', ar: 'متوسط درجة المخاطر' },
  'dashboard.recentActivity': { en: 'Recent Activity', ar: 'النشاط الأخير' },
  'dashboard.quickActions': { en: 'Quick Actions', ar: 'إجراءات سريعة' },
  
  // Branch Tasks
  'tasks.title': { en: 'Branch Tasks', ar: 'مهام الفرع' },
  'tasks.subtitle': { en: 'Select a task to get started', ar: 'اختر مهمة للبدء' },
  'tasks.start': { en: 'Start', ar: 'ابدأ' },
  'tasks.comingSoon': { en: 'Coming soon', ar: 'قريباً' },
  'tasks.openAccount': { en: 'Open New Account', ar: 'فتح حساب جديد' },
  'tasks.openAccount.desc': {
    en: 'Start the new customer account opening process',
    ar: 'ابدأ عملية فتح حساب لعميل جديد',
  },
  'tasks.updateCustomer': { en: 'Update Customer Info', ar: 'تحديث بيانات العميل' },
  'tasks.updateCustomer.desc': {
    en: 'Edit and maintain existing customer details',
    ar: 'تعديل وصيانة بيانات العملاء الحاليين',
  },
  'tasks.closeAccount': { en: 'Close Account', ar: 'إغلاق حساب' },
  'tasks.closeAccount.desc': {
    en: 'Process the closure of a customer account',
    ar: 'معالجة إغلاق حساب عميل',
  },

  // Credit Risk
  'credit.title': { en: 'Credit Risk Assessment', ar: 'تقييم مخاطر الائتمان' },
  'credit.newAssessment': { en: 'New Assessment', ar: 'تقييم جديد' },
  'credit.customerInfo': { en: 'Customer Information', ar: 'معلومات العميل' },
  'credit.financialData': { en: 'Financial Data', ar: 'البيانات المالية' },
  'credit.riskScore': { en: 'Risk Score', ar: 'درجة المخاطر' },
  'credit.lowRisk': { en: 'Low Risk', ar: 'مخاطر منخفضة' },
  'credit.mediumRisk': { en: 'Medium Risk', ar: 'مخاطر متوسطة' },
  'credit.highRisk': { en: 'High Risk', ar: 'مخاطر عالية' },
  'credit.requestApproval': { en: 'Request Approval', ar: 'طلب موافقة' },
  
  // Documents
  'docs.title': { en: 'Document Processing', ar: 'معالجة المستندات' },
  'docs.upload': { en: 'Upload Document', ar: 'رفع مستند' },
  'docs.processing': { en: 'Processing', ar: 'قيد المعالجة' },
  'docs.completed': { en: 'Completed', ar: 'مكتمل' },
  'docs.review': { en: 'Review', ar: 'مراجعة' },
  
  // AI Assistant
  'ai.title': { en: 'AI Assistant', ar: 'المساعد الذكي' },
  'ai.placeholder': { en: 'Ask about banking policies, procedures...', ar: 'اسأل عن السياسات والإجراءات المصرفية...' },
  'ai.send': { en: 'Send', ar: 'إرسال' },
  'ai.thinking': { en: 'Thinking...', ar: 'جاري التفكير...' },
  
  // Approvals
  'approvals.title': { en: 'Pending Approvals', ar: 'الموافقات المعلقة' },
  'approvals.approve': { en: 'Approve', ar: 'موافقة' },
  'approvals.reject': { en: 'Reject', ar: 'رفض' },
  'approvals.requestInfo': { en: 'Request Info', ar: 'طلب معلومات' },
  
  // Users
  'users.title': { en: 'User Management', ar: 'إدارة المستخدمين' },
  'users.addUser': { en: 'Add User', ar: 'إضافة مستخدم' },
  'users.role': { en: 'Role', ar: 'الدور' },
  'users.employee': { en: 'Employee', ar: 'موظف' },
  'users.manager': { en: 'Manager', ar: 'مدير' },
  'users.admin': { en: 'Admin', ar: 'مسؤول' },
  
  // Auth
  'auth.login': { en: 'Login', ar: 'تسجيل الدخول' },
  'auth.email': { en: 'Email', ar: 'البريد الإلكتروني' },
  'auth.password': { en: 'Password', ar: 'كلمة المرور' },
  'auth.bankOfPalestine': { en: 'Bank of Palestine', ar: 'بنك فلسطين' },
  
  // Common
  'common.search': { en: 'Search', ar: 'بحث' },
  'common.filter': { en: 'Filter', ar: 'تصفية' },
  'common.export': { en: 'Export', ar: 'تصدير' },
  'common.save': { en: 'Save', ar: 'حفظ' },
  'common.cancel': { en: 'Cancel', ar: 'إلغاء' },
  'common.confirm': { en: 'Confirm', ar: 'تأكيد' },
  'common.loading': { en: 'Loading...', ar: 'جاري التحميل...' },
  'common.noData': { en: 'No data available', ar: 'لا توجد بيانات' },
};

interface LanguageContextType {
  language: Language;
  direction: Direction;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [language, setLanguage] = useState<Language>('en');
  const direction: Direction = language === 'ar' ? 'rtl' : 'ltr';

  useEffect(() => {
    document.documentElement.dir = direction;
    document.documentElement.lang = language;
  }, [language, direction]);

  const t = (key: string): string => {
    const translation = translations[key];
    if (!translation) return key;
    return translation[language] || key;
  };

  return (
    <LanguageContext.Provider value={{ language, direction, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};
