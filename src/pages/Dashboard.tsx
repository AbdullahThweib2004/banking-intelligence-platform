import React from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  TrendingUp,
  FileText,
  Bot,
  CheckSquare,
  Users,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Link } from 'react-router-dom';
import { useDashboardStats } from '@/hooks/useStats';
import { useRecentActivity, type RecentActivityItem } from '@/hooks/useRecentActivity';
import { Skeleton } from '@/components/ui/skeleton';
import { PageOnboardingTour } from '@/components/onboarding/PageOnboardingTour';
import { StatValue } from '@/components/StatValue';
import { HelpTarget } from '@/components/help';

interface StatCardProps {
  title: string;
  value: string | number;
  change?: number;
  icon: React.ElementType;
  description?: string;
  loading?: boolean;
  error?: unknown;
}

const StatCard: React.FC<StatCardProps> = ({ title, value, change, icon: Icon, description, loading, error }) => {
  const isPositive = change && change > 0;
  const isNegative = change && change < 0;
  
  return (
    <Card className="stat-card">
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="text-3xl font-bold text-foreground">
              <StatValue loading={!!loading} error={error} value={value} skeletonClassName="h-8 w-24" />
            </p>
            {change !== undefined && (
              <div className="flex items-center gap-1">
                {isPositive && <ArrowUpRight className="h-4 w-4 text-success" />}
                {isNegative && <ArrowDownRight className="h-4 w-4 text-destructive" />}
                <span className={cn(
                  "text-sm font-medium",
                  isPositive && "text-success",
                  isNegative && "text-destructive"
                )}>
                  {Math.abs(change)}%
                </span>
                <span className="text-sm text-muted-foreground">{description}</span>
              </div>
            )}
          </div>
          <div className="p-3 rounded-xl bg-primary/10">
            <Icon className="h-6 w-6 text-primary" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

const getActivityIcon = (type: RecentActivityItem['type']) => {
  switch (type) {
    case 'credit': return TrendingUp;
    case 'document': return FileText;
    case 'approval': return CheckSquare;
    case 'user': return Users;
    default: return Clock;
  }
};

const getStatusBadge = (status: RecentActivityItem['status'], language: string) => {
  switch (status) {
    case 'completed':
      return <Badge className="bg-success/10 text-success border-success/20">{language === 'ar' ? 'مكتمل' : 'Completed'}</Badge>;
    case 'pending':
      return <Badge className="bg-warning/10 text-warning border-warning/20">{language === 'ar' ? 'قيد الانتظار' : 'Pending'}</Badge>;
    case 'warning':
      return <Badge className="bg-destructive/10 text-destructive border-destructive/20">{language === 'ar' ? 'تحذير' : 'Warning'}</Badge>;
    default:
      return null;
  }
};

export const Dashboard: React.FC = () => {
  const { t, language } = useLanguage();
  const { canAccess } = useAuth();
  const { stats, loading, error } = useDashboardStats();
  const {
    activities: recentActivities,
    loading: activityLoading,
    error: activityError,
  } = useRecentActivity(language);

  return (
    <DashboardLayout>
      <PageOnboardingTour tourId="dashboard" />
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-foreground">{t('nav.dashboard')}</h1>
          <p className="text-muted-foreground mt-1">
            {language === 'ar' 
              ? 'نظرة عامة على منصة الذكاء المصرفي' 
              : 'Overview of the Banking Intelligence Platform'}
          </p>
        </div>

        {/* Stats Grid */}
        <HelpTarget
          id="dashboard-stats"
          category={language === 'ar' ? 'الإحصائيات العامة' : 'General Metrics'}
          title={language === 'ar' ? 'بطاقات الإحصائيات' : 'Dashboard Summary Cards'}
          description={language === 'ar' 
            ? 'تعرض هذه اللوحة ملخصاً للنشاط الحالي للمنصة، بما في ذلك إجمالي الطلبات المقدمة، المعاملات قيد المراجعة، الموافقات اليومية، ومتوسط درجات مخاطر الائتمان.' 
            : 'This panel displays a summary of current platform activity, including total applications submitted, transactions pending review, daily approvals, and average credit risk score.'}
          actions={language === 'ar'
            ? [
                'عرض إجمالي طلبات الائتمان والمستندات في النظام',
                'مراقبة المهام قيد الانتظار لمتابعة سير العمل الفوري',
                'تتبع معدل نجاح وموافقات اليوم',
                'تقييم متوسط مؤشر المخاطر للمحفظة الائتمانية'
              ]
            : [
                'View the total number of credit applications and documents in the system.',
                'Monitor pending tasks to identify urgent workflows.',
                'Track today\'s overall approval success rate.',
                'Evaluate the average risk score for the active portfolio.'
              ]}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <HelpTarget
              id="dashboard-stat-total-applications"
              scope="item"
              category={language === 'ar' ? 'بطاقة إحصائية' : 'Stat Card'}
              title={t('dashboard.totalApplications')}
              description={language === 'ar'
                ? 'العدد الإجمالي لطلبات الائتمان والمستندات المسجلة في النظام حتى الآن.'
                : 'The total number of credit applications and documents recorded in the system so far.'}
            >
              <StatCard
                title={t('dashboard.totalApplications')}
                value={stats.totalApplications.toLocaleString()}
                icon={FileText}
                loading={loading}
                error={error}
              />
            </HelpTarget>
            <HelpTarget
              id="dashboard-stat-pending-review"
              scope="item"
              category={language === 'ar' ? 'بطاقة إحصائية' : 'Stat Card'}
              title={t('dashboard.pendingReview')}
              description={language === 'ar'
                ? 'عدد الطلبات التي ما زالت قيد المراجعة ولم يُتخذ قرار بشأنها بعد.'
                : 'The number of requests still awaiting review with no decision made yet.'}
            >
              <StatCard
                title={t('dashboard.pendingReview')}
                value={stats.pendingReview.toLocaleString()}
                icon={Clock}
                loading={loading}
                error={error}
              />
            </HelpTarget>
            <HelpTarget
              id="dashboard-stat-approved-today"
              scope="item"
              category={language === 'ar' ? 'بطاقة إحصائية' : 'Stat Card'}
              title={t('dashboard.approvedToday')}
              description={language === 'ar'
                ? 'عدد الطلبات التي تمت الموافقة عليها خلال اليوم الحالي.'
                : 'The number of requests that were approved during the current day.'}
            >
              <StatCard
                title={t('dashboard.approvedToday')}
                value={stats.approvedToday.toLocaleString()}
                icon={CheckCircle2}
                loading={loading}
                error={error}
              />
            </HelpTarget>
            <HelpTarget
              id="dashboard-stat-risk-score"
              scope="item"
              category={language === 'ar' ? 'بطاقة إحصائية' : 'Stat Card'}
              title={t('dashboard.riskScore')}
              description={language === 'ar'
                ? 'متوسط درجة مخاطر الائتمان المحسوبة بالذكاء الاصطناعي عبر جميع الطلبات النشطة.'
                : 'The average AI-computed credit risk score across all active applications.'}
            >
              <StatCard
                title={t('dashboard.riskScore')}
                value={stats.avgRiskScore}
                icon={TrendingUp}
                loading={loading}
                error={error}
              />
            </HelpTarget>
          </div>
        </HelpTarget>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Quick Actions */}
          <HelpTarget
            id="dashboard-quick-actions"
            category={language === 'ar' ? 'الإجراءات' : 'Actions'}
            title={language === 'ar' ? 'الإجراءات السريعة' : 'Quick Actions'}
            description={language === 'ar'
              ? 'تتيح لك هذه اللوحة الوصول السريع والبدء الفوري في المهام والعمليات الرئيسية في المنصة دون الحاجة للتنقل عبر القائمة الجانبية.'
              : 'This panel provides direct shortcuts to start key tasks and banking workflows instantly without navigating the full sidebar menu.'}
            actions={language === 'ar'
              ? [
                  'بدء تقييم ائتماني جديد لطلب تمويل',
                  'رفع مستندات جديدة للتحليل والمعالجة بالذكاء الاصطناعي',
                  'فتح المساعد الذكي للحصول على إجابات حول السياسات المصرفية',
                  'الوصول إلى الموافقات المعلقة وإدارتها (للمدراء والمخاطر)'
                ]
              : [
                  'Initiate a new credit risk assessment for a client loan application.',
                  'Upload new files/documents for smart extraction and analysis.',
                  'Consult the AI Assistant to query banking regulations and policies.',
                  'Access pending approvals to review, reject, or approve requests (role-restricted).'
                ]}
            className="lg:col-span-1"
          >
            <Card className="h-full">
              <CardHeader>
                <CardTitle>{t('dashboard.quickActions')}</CardTitle>
                <CardDescription>
                  {language === 'ar' ? 'الوصول السريع للميزات الرئيسية' : 'Quick access to main features'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <HelpTarget
                  id="dashboard-action-new-assessment"
                  scope="action"
                  category={language === 'ar' ? 'إجراء' : 'Action'}
                  title={t('credit.newAssessment')}
                  description={language === 'ar'
                    ? 'ينقلك إلى صفحة مخاطر الائتمان لبدء تقييم جديد لعميل.'
                    : 'Takes you to the Credit Risk page to start a new assessment for a customer.'}
                  hint={language === 'ar' ? 'اضغط للانتقال إلى تقييم ائتماني جديد' : 'Click to jump to a new credit assessment'}
                >
                  <Link to="/credit-risk">
                    <Button variant="outline" className="w-full justify-start gap-3 h-12">
                      <div className="p-2 rounded-lg bg-primary/10">
                        <TrendingUp className="h-4 w-4 text-primary" />
                      </div>
                      <span>{t('credit.newAssessment')}</span>
                    </Button>
                  </Link>
                </HelpTarget>

                <HelpTarget
                  id="dashboard-action-upload-docs"
                  scope="action"
                  category={language === 'ar' ? 'إجراء' : 'Action'}
                  title={t('docs.upload')}
                  description={language === 'ar'
                    ? 'ينقلك إلى صفحة المستندات لرفع ملفات جديدة لاستخراجها ومعالجتها.'
                    : 'Takes you to the Documents page to upload new files for extraction and processing.'}
                  hint={language === 'ar' ? 'اضغط للانتقال إلى رفع مستند' : 'Click to jump to document upload'}
                >
                  <Link to="/documents">
                    <Button variant="outline" className="w-full justify-start gap-3 h-12">
                      <div className="p-2 rounded-lg bg-info/10">
                        <FileText className="h-4 w-4 text-info" />
                      </div>
                      <span>{t('docs.upload')}</span>
                    </Button>
                  </Link>
                </HelpTarget>

                <HelpTarget
                  id="dashboard-action-ai-assistant"
                  scope="action"
                  category={language === 'ar' ? 'إجراء' : 'Action'}
                  title={t('nav.aiAssistant')}
                  description={language === 'ar'
                    ? 'ينقلك إلى المساعد الذكي للاستفسار عن السياسات المصرفية وأسئلة العمل.'
                    : 'Takes you to the AI Assistant to ask questions about banking policies and workflows.'}
                  hint={language === 'ar' ? 'اضغط لفتح المساعد الذكي' : 'Click to open the AI Assistant'}
                >
                  <Link to="/ai-assistant">
                    <Button variant="outline" className="w-full justify-start gap-3 h-12">
                      <div className="p-2 rounded-lg bg-success/10">
                        <Bot className="h-4 w-4 text-success" />
                      </div>
                      <span>{t('nav.aiAssistant')}</span>
                    </Button>
                  </Link>
                </HelpTarget>

                {/*Approvals button is only visible to managers and risk department */}
                {canAccess('/approvals') && (
                  <HelpTarget
                    id="dashboard-action-approvals"
                    scope="action"
                    category={language === 'ar' ? 'إجراء' : 'Action'}
                    title={t('nav.approvals')}
                    description={language === 'ar'
                      ? 'ينقلك إلى صفحة الموافقات لمراجعة طلبات الائتمان المعلقة والبت فيها.'
                      : 'Takes you to the Approvals page to review and decide on pending credit requests.'}
                    hint={language === 'ar' ? 'اضغط للانتقال إلى الموافقات' : 'Click to jump to Approvals'}
                  >
                    <Link to="/approvals">
                      <Button variant="outline" className="w-full justify-start gap-3 h-12">
                        <div className="p-2 rounded-lg bg-warning/10">
                          <CheckSquare className="h-4 w-4 text-warning" />
                        </div>
                        <span>{t('nav.approvals')}</span>
                      </Button>
                    </Link>
                  </HelpTarget>
                )}
              </CardContent>
            </Card>
          </HelpTarget>

          {/* Recent Activity */}
          <HelpTarget
            id="dashboard-recent-activity"
            category={language === 'ar' ? 'النشاط' : 'Activity'}
            title={language === 'ar' ? 'النشاط الأخير' : 'Recent Activity Feed'}
            description={language === 'ar'
              ? 'سجل حي ومباشر لكافة الأنشطة والعمليات التي تمت مؤخراً على النظام، مثل تقييمات الائتمان، تحديثات المستندات، الموافقات، وتغييرات المستخدمين.'
              : 'A live feed of all recent platform activities, including credit assessments, document uploads, supervisor approvals, and user updates.'}
            actions={language === 'ar'
              ? [
                  'مراجعة أحدث الأحداث وتفاصيل العمليات الزمنية',
                  'معرفة حالة كل نشاط (مكتمل، معلق، أو تنبيه)',
                  'متابعة أداء الموظفين وإجراءات تدقيق النشاط الفوري'
                ]
              : [
                  'Track the timeline of recent user actions and system logs.',
                  'Monitor activity status badges (Completed, Pending, Warning).',
                  'Audit compliance and trace actions for verification purposes.'
                ]}
            className="lg:col-span-2"
          >
            <Card className="h-full">
              <CardHeader>
                <CardTitle>{t('dashboard.recentActivity')}</CardTitle>
                <CardDescription>
                  {language === 'ar' ? 'آخر الأنشطة على المنصة' : 'Latest platform activities'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {activityLoading &&
                    Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} className="flex items-start gap-4 p-3 rounded-lg bg-muted/50">
                        <Skeleton className="h-8 w-8 rounded-lg shrink-0" />
                        <div className="flex-1 space-y-2">
                          <Skeleton className="h-4 w-3/5" />
                          <Skeleton className="h-3 w-4/5" />
                          <Skeleton className="h-3 w-1/4" />
                        </div>
                      </div>
                    ))}

                  {!activityLoading && activityError && (
                    <p className="text-sm text-muted-foreground py-4 text-center">
                      {language === 'ar'
                        ? 'تعذر تحميل النشاط الأخير'
                        : 'Could not load recent activity'}
                    </p>
                  )}

                  {!activityLoading && !activityError && recentActivities.length === 0 && (
                    <p className="text-sm text-muted-foreground py-4 text-center">
                      {language === 'ar' ? 'لا يوجد نشاط حديث' : 'No recent activity yet'}
                    </p>
                  )}

                  {!activityLoading &&
                    !activityError &&
                    recentActivities.map((activity) => {
                      const Icon = getActivityIcon(activity.type);
                      return (
                        <HelpTarget
                          key={activity.id}
                          asChild
                          id={`dashboard-recent-activity-item-${activity.id}`}
                          scope="item"
                          category={language === 'ar' ? 'عنصر نشاط' : 'Activity Entry'}
                          title={activity.title}
                          description={
                            language === 'ar'
                              ? `تفاصيل نشاط فردي: ${activity.description}`
                              : `A single activity entry: ${activity.description}`
                          }
                        >
                          <div className="flex items-start gap-4 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                            <div
                              className={cn(
                                'p-2 rounded-lg',
                                activity.status === 'completed' && 'bg-success/10',
                                activity.status === 'pending' && 'bg-warning/10',
                                activity.status === 'warning' && 'bg-destructive/10'
                              )}
                            >
                              <Icon
                                className={cn(
                                  'h-4 w-4',
                                  activity.status === 'completed' && 'text-success',
                                  activity.status === 'pending' && 'text-warning',
                                  activity.status === 'warning' && 'text-destructive'
                                )}
                              />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <p className="font-medium text-foreground truncate">{activity.title}</p>
                                {getStatusBadge(activity.status, language)}
                              </div>
                              <p className="text-sm text-muted-foreground truncate">{activity.description}</p>
                              <p className="text-xs text-muted-foreground mt-1">{activity.time}</p>
                            </div>
                          </div>
                        </HelpTarget>
                      );
                    })}
                </div>
              </CardContent>
            </Card>
          </HelpTarget>
        </div>

        {/* Module Overview */}
        <HelpTarget
          id="dashboard-modules"
          category={language === 'ar' ? 'الأقسام الرئيسية' : 'System Modules'}
          title={language === 'ar' ? 'لوحة الأقسام والتحليلات' : 'Core Modules Overview'}
          description={language === 'ar'
            ? 'مؤشرات الأداء الرئيسية للأقسام الأساسية في المنصة (المخاطر الائتمانية، معالجة المستندات، والمساعد الذكي) توضح تقدم المعالجة ودقة العمليات.'
            : 'Key performance indicators for the three main system modules (Credit Risk, Intelligent Documents, and AI Assistant) demonstrating processing completion and intelligence accuracy stats.'}
          actions={language === 'ar'
            ? [
                'الاطلاع على النسبة المئوية للمستندات الائتمانية المعالجة',
                'مراقبة معدل دقة استخراج البيانات بالذكاء الاصطناعي',
                'التحقق من مستوى رضا المستخدمين عن إجابات المساعد الذكي'
              ]
            : [
                'Observe the completion rate of processed credit requests.',
                'Track the current AI data extraction accuracy percentage.',
                'Review customer/user satisfaction score for AI chat responses.'
              ]}
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <HelpTarget
              asChild
              id="dashboard-module-credit-risk"
              scope="item"
              category={language === 'ar' ? 'وحدة' : 'Module'}
              title={t('nav.creditRisk')}
              description={language === 'ar'
                ? 'مؤشر أداء وحدة المخاطر الائتمانية: يوضح عدد الطلبات المعالجة من إجمالي الطلبات الواردة.'
                : 'Performance indicator for the Credit Risk module: shows how many requests have been processed out of the total received.'}
            >
              <Card className="group hover:border-primary/30 transition-colors cursor-pointer">
                <CardContent className="p-6">
                  <div className="flex items-center gap-4">
                    <div className="p-4 rounded-xl bg-primary/10 group-hover:bg-primary/20 transition-colors">
                      <TrendingUp className="h-8 w-8 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground">{t('nav.creditRisk')}</h3>
                      <p className="text-sm text-muted-foreground">
                        {language === 'ar' ? 'تقييم مخاطر الائتمان بالذكاء الاصطناعي' : 'AI-powered credit assessment'}
                      </p>
                    </div>
                  </div>
                  <div className="mt-4">
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-muted-foreground">
                        {language === 'ar' ? 'الطلبات المعالجة' : 'Processed'}
                      </span>
                      <span className="font-medium">847/1000</span>
                    </div>
                    <Progress value={84.7} className="h-2" />
                  </div>
                </CardContent>
              </Card>
            </HelpTarget>

            <HelpTarget
              asChild
              id="dashboard-module-documents"
              scope="item"
              category={language === 'ar' ? 'وحدة' : 'Module'}
              title={t('nav.documents')}
              description={language === 'ar'
                ? 'مؤشر أداء وحدة المستندات: يوضح دقة استخراج البيانات بواسطة الذكاء الاصطناعي.'
                : 'Performance indicator for the Documents module: shows the AI data extraction accuracy rate.'}
            >
              <Card className="group hover:border-info/30 transition-colors cursor-pointer">
                <CardContent className="p-6">
                  <div className="flex items-center gap-4">
                    <div className="p-4 rounded-xl bg-info/10 group-hover:bg-info/20 transition-colors">
                      <FileText className="h-8 w-8 text-info" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground">{t('nav.documents')}</h3>
                      <p className="text-sm text-muted-foreground">
                        {language === 'ar' ? 'معالجة المستندات الذكية' : 'Intelligent document processing'}
                      </p>
                    </div>
                  </div>
                  <div className="mt-4">
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-muted-foreground">
                        {language === 'ar' ? 'دقة الاستخراج' : 'Extraction Accuracy'}
                      </span>
                      <span className="font-medium">97.3%</span>
                    </div>
                    <Progress value={97.3} className="h-2" />
                  </div>
                </CardContent>
              </Card>
            </HelpTarget>

            <HelpTarget
              asChild
              id="dashboard-module-ai-assistant"
              scope="item"
              category={language === 'ar' ? 'وحدة' : 'Module'}
              title={t('nav.aiAssistant')}
              description={language === 'ar'
                ? 'مؤشر أداء وحدة المساعد الذكي: يوضح مستوى رضا المستخدمين عن الإجابات المقدمة.'
                : 'Performance indicator for the AI Assistant module: shows user satisfaction with the answers it provides.'}
            >
              <Card className="group hover:border-success/30 transition-colors cursor-pointer">
                <CardContent className="p-6">
                  <div className="flex items-center gap-4">
                    <div className="p-4 rounded-xl bg-success/10 group-hover:bg-success/20 transition-colors">
                      <Bot className="h-8 w-8 text-success" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground">{t('nav.aiAssistant')}</h3>
                      <p className="text-sm text-muted-foreground">
                        {language === 'ar' ? 'مساعد المعرفة الداخلي' : 'Internal knowledge assistant'}
                      </p>
                    </div>
                  </div>
                  <div className="mt-4">
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-muted-foreground">
                        {language === 'ar' ? 'رضا المستخدمين' : 'User Satisfaction'}
                      </span>
                      <span className="font-medium">4.8/5</span>
                    </div>
                    <Progress value={96} className="h-2" />
                  </div>
                </CardContent>
              </Card>
            </HelpTarget>
          </div>
        </HelpTarget>
      </div>
    </DashboardLayout>
  );
};

export default Dashboard;
