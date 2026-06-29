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
import { StatValue } from '@/components/StatValue';

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

interface ActivityItem {
  id: string;
  type: 'credit' | 'document' | 'approval' | 'user';
  title: string;
  description: string;
  time: string;
  status: 'pending' | 'completed' | 'warning';
}

const recentActivities: ActivityItem[] = [
  {
    id: '1',
    type: 'credit',
    title: 'Credit Assessment Completed',
    description: 'Application #12345 - Risk Score: 42 (Low)',
    time: '5 min ago',
    status: 'completed',
  },
  {
    id: '2',
    type: 'approval',
    title: 'Approval Pending',
    description: 'Loan application requires manager review',
    time: '15 min ago',
    status: 'pending',
  },
  {
    id: '3',
    type: 'document',
    title: 'Document Processed',
    description: '3 documents extracted successfully',
    time: '1 hour ago',
    status: 'completed',
  },
  {
    id: '4',
    type: 'credit',
    title: 'High Risk Alert',
    description: 'Application #12348 flagged for review',
    time: '2 hours ago',
    status: 'warning',
  },
];

const getActivityIcon = (type: ActivityItem['type']) => {
  switch (type) {
    case 'credit': return TrendingUp;
    case 'document': return FileText;
    case 'approval': return CheckSquare;
    case 'user': return Users;
    default: return Clock;
  }
};

const getStatusBadge = (status: ActivityItem['status'], language: string) => {
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

  return (
    <DashboardLayout>
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title={t('dashboard.totalApplications')}
            value={stats.totalApplications.toLocaleString()}
            icon={FileText}
            loading={loading}
            error={error}
          />
          <StatCard
            title={t('dashboard.pendingReview')}
            value={stats.pendingReview.toLocaleString()}
            icon={Clock}
            loading={loading}
            error={error}
          />
          <StatCard
            title={t('dashboard.approvedToday')}
            value={stats.approvedToday.toLocaleString()}
            icon={CheckCircle2}
            loading={loading}
            error={error}
          />
          <StatCard
            title={t('dashboard.riskScore')}
            value={stats.avgRiskScore}
            icon={TrendingUp}
            loading={loading}
            error={error}
          />
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Quick Actions */}
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle>{t('dashboard.quickActions')}</CardTitle>
              <CardDescription>
                {language === 'ar' ? 'الوصول السريع للميزات الرئيسية' : 'Quick access to main features'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Link to="/credit-risk">
                <Button variant="outline" className="w-full justify-start gap-3 h-12">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <TrendingUp className="h-4 w-4 text-primary" />
                  </div>
                  <span>{t('credit.newAssessment')}</span>
                </Button>
              </Link>
              
              <Link to="/documents">
                <Button variant="outline" className="w-full justify-start gap-3 h-12">
                  <div className="p-2 rounded-lg bg-info/10">
                    <FileText className="h-4 w-4 text-info" />
                  </div>
                  <span>{t('docs.upload')}</span>
                </Button>
              </Link>
              
              <Link to="/ai-assistant">
                <Button variant="outline" className="w-full justify-start gap-3 h-12">
                  <div className="p-2 rounded-lg bg-success/10">
                    <Bot className="h-4 w-4 text-success" />
                  </div>
                  <span>{t('nav.aiAssistant')}</span>
                </Button>
              </Link>
              {/*Approvals button is only visible to managers and risk department */}
              {canAccess('/approvals') && (
                <Link to="/approvals">
                  <Button variant="outline" className="w-full justify-start gap-3 h-12">
                    <div className="p-2 rounded-lg bg-warning/10">
                      <CheckSquare className="h-4 w-4 text-warning" />
                    </div>
                    <span>{t('nav.approvals')}</span>
                  </Button>
                </Link>
              )}
            </CardContent>
          </Card>

          {/* Recent Activity */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>{t('dashboard.recentActivity')}</CardTitle>
              <CardDescription>
                {language === 'ar' ? 'آخر الأنشطة على المنصة' : 'Latest platform activities'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {recentActivities.map((activity) => {
                  const Icon = getActivityIcon(activity.type);
                  return (
                    <div
                      key={activity.id}
                      className="flex items-start gap-4 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                    >
                      <div className={cn(
                        "p-2 rounded-lg",
                        activity.status === 'completed' && "bg-success/10",
                        activity.status === 'pending' && "bg-warning/10",
                        activity.status === 'warning' && "bg-destructive/10"
                      )}>
                        <Icon className={cn(
                          "h-4 w-4",
                          activity.status === 'completed' && "text-success",
                          activity.status === 'pending' && "text-warning",
                          activity.status === 'warning' && "text-destructive"
                        )} />
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
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Module Overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Dashboard;
