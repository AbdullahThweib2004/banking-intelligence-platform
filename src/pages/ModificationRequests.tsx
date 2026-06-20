import React from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { ROLES } from '@/lib/roles';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/card';
import { AlertTriangle } from 'lucide-react';
import { ModificationRequestsPanel } from '@/components/ModificationRequestsPanel';

export const ModificationRequests: React.FC = () => {
  const { language } = useLanguage();
  const { isRole } = useAuth();

  const canView = isRole(ROLES.RISK) || isRole(ROLES.MANAGER);
  const canReview = isRole(ROLES.RISK);

  if (!canView) {
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
                ? 'هذه الصفحة متاحة للمدير ودائرة المخاطر فقط'
                : 'This page is only accessible to managers and the risk department'}
            </p>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <ModificationRequestsPanel enabled={canView} canReview={canReview} />
      </div>
    </DashboardLayout>
  );
};

export default ModificationRequests;
