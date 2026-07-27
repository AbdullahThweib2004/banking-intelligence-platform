import { useLanguage } from '@/contexts/LanguageContext';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { HelpTarget } from '@/components/help';
import { Card, CardContent } from '@/components/ui/card';
import { StatValue } from '@/components/StatValue';
import { useAuditStats } from '@/hooks/useAuditStats';
import { Clock, CheckCircle2, XCircle, TrendingUp } from 'lucide-react';

/**
 * Audit's own monitoring/KPI dashboard — part of the separate Audit account's
 * dedicated dashboard (distinct from Branch Manager/Risk's Approvals stats).
 */
export default function AuditMonitoring() {
  const { language } = useLanguage();
  const { stats, loading, error } = useAuditStats();
  const t = (en: string, ar: string) => (language === 'ar' ? ar : en);

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-3xl font-bold text-foreground">{t('Audit Monitoring', 'مراقبة التدقيق')}</h1>
          <p className="text-muted-foreground mt-1">
            {t('Key metrics for the Audit review stage.', 'مؤشرات رئيسية لمرحلة مراجعة التدقيق.')}
          </p>
        </div>

        <HelpTarget
          id="audit-monitoring-stats"
          scope="section"
          category={t('Metrics', 'الإحصائيات')}
          title={t('Audit KPI Summary', 'ملخص مؤشرات التدقيق')}
          description={t(
            'Snapshot of pending audits, approved and rejected counts, and average review time.',
            'لمحة عن عدد التدقيقات المعلقة، وأعداد الموافقة والرفض، ومتوسط وقت المراجعة.'
          )}
        >
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <HelpTarget
              asChild
              id="audit-monitoring-stat-pending"
              scope="item"
              category={t('Stat Card', 'بطاقة إحصائية')}
              title={t('Pending Audits', 'تدقيقات معلقة')}
              description={t('Requests currently awaiting Audit\'s decision.', 'الطلبات التي تنتظر قرار التدقيق حالياً.')}
            >
              <Card className="stat-card">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">{t('Pending Audits', 'تدقيقات معلقة')}</p>
                      <p className="text-2xl font-bold">
                        <StatValue loading={loading} error={error} value={stats.pendingAudits.toLocaleString()} />
                      </p>
                    </div>
                    <Clock className="h-8 w-8 text-warning opacity-50" />
                  </div>
                </CardContent>
              </Card>
            </HelpTarget>

            <HelpTarget
              asChild
              id="audit-monitoring-stat-approved"
              scope="item"
              category={t('Stat Card', 'بطاقة إحصائية')}
              title={t('Approved', 'موافق عليها')}
              description={t('Requests fully approved by Audit.', 'الطلبات التي اعتمدها التدقيق نهائياً.')}
            >
              <Card className="stat-card">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">{t('Approved', 'موافق عليها')}</p>
                      <p className="text-2xl font-bold text-success">
                        <StatValue loading={loading} error={error} value={stats.approved.toLocaleString()} />
                      </p>
                    </div>
                    <CheckCircle2 className="h-8 w-8 text-success opacity-50" />
                  </div>
                </CardContent>
              </Card>
            </HelpTarget>

            <HelpTarget
              asChild
              id="audit-monitoring-stat-rejected"
              scope="item"
              category={t('Stat Card', 'بطاقة إحصائية')}
              title={t('Rejected', 'مرفوضة')}
              description={t('Requests rejected by Audit.', 'الطلبات التي رفضها التدقيق.')}
            >
              <Card className="stat-card">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">{t('Rejected', 'مرفوضة')}</p>
                      <p className="text-2xl font-bold text-destructive">
                        <StatValue loading={loading} error={error} value={stats.rejected.toLocaleString()} />
                      </p>
                    </div>
                    <XCircle className="h-8 w-8 text-destructive opacity-50" />
                  </div>
                </CardContent>
              </Card>
            </HelpTarget>

            <HelpTarget
              asChild
              id="audit-monitoring-stat-avg-time"
              scope="item"
              category={t('Stat Card', 'بطاقة إحصائية')}
              title={t('Avg Review Time', 'متوسط وقت المراجعة')}
              description={t(
                'Average time from entering the Audit queue to a decision.',
                'متوسط الوقت من دخول قائمة التدقيق حتى اتخاذ القرار.'
              )}
            >
              <Card className="stat-card">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">{t('Avg Review Time', 'متوسط وقت المراجعة')}</p>
                      <p className="text-2xl font-bold">
                        <StatValue loading={loading} error={error} value={`${stats.avgReviewTimeHours}h`} />
                      </p>
                    </div>
                    <TrendingUp className="h-8 w-8 text-primary opacity-50" />
                  </div>
                </CardContent>
              </Card>
            </HelpTarget>
          </div>
        </HelpTarget>
      </div>
    </DashboardLayout>
  );
}
