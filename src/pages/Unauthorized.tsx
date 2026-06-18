import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ShieldAlert } from 'lucide-react';

const roleLabels: Record<string, { en: string; ar: string }> = {
  branch_employee: { en: 'Branch Employee', ar: 'موظف الفرع' },
  branch_manager: { en: 'Branch Manager', ar: 'مدير الفرع' },
  risk_department: { en: 'Risk Department', ar: 'دائرة المخاطر' },
};

export const Unauthorized: React.FC = () => {
  const { role, profile } = useAuth();
  const { language } = useLanguage();

  const roleLabel = role
    ? roleLabels[role]?.[language] ?? role
    : language === 'ar'
    ? 'غير معروف'
    : 'Unknown';

  return (
    <DashboardLayout>
      <div className="flex items-center justify-center h-[calc(100vh-12rem)]">
        <Card className="p-8 text-center max-w-md">
          <ShieldAlert className="h-12 w-12 text-destructive mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-2">
            {language === 'ar' ? 'تم رفض الوصول' : 'Access Denied'}
          </h2>
          <p className="text-muted-foreground mb-4">
            {language === 'ar'
              ? 'ليس لديك الصلاحية للوصول إلى هذه الصفحة.'
              : "You don't have permission to access this page."}
          </p>

          <div className="p-3 bg-muted rounded-lg mb-6 text-sm">
            <span className="text-muted-foreground">
              {language === 'ar' ? 'دورك الحالي: ' : 'Your current role: '}
            </span>
            <span className="font-semibold">{roleLabel}</span>
            {profile?.full_name && (
              <div className="text-muted-foreground mt-1">{profile.full_name}</div>
            )}
          </div>

          <Link to="/dashboard">
            <Button className="gradient-bg">
              {language === 'ar' ? 'العودة إلى لوحة التحكم' : 'Back to Dashboard'}
            </Button>
          </Link>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Unauthorized;
