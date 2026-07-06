import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type ActivityType = 'credit' | 'document' | 'approval' | 'user';
export type ActivityStatus = 'pending' | 'completed' | 'warning';

/** Normalized shape consumed by the Dashboard Recent Activity card. */
export interface RecentActivityItem {
  id: string;
  type: ActivityType;
  title: string;
  description: string;
  time: string;
  status: ActivityStatus;
  /** ISO timestamp for merge/sort (not rendered). */
  timestamp: string;
}

interface ApprovalActivityRow {
  id: string;
  type: string | null;
  customer_name: string | null;
  status: string | null;
  risk_score: number | null;
  risk_category: string | null;
  updated_at: string;
  created_at: string;
}

interface DocumentActivityRow {
  id: string;
  name: string;
  status: string;
  extracted_fields: number | null;
  updated_at: string;
  created_at: string;
}

const DISPLAY_LIMIT = 5;
const QUERY_LIMIT = 12;

const riskCategoryLabel = (category: string, language: string): string => {
  const c = category.toLowerCase();
  if (language === 'ar') {
    if (c === 'low') return 'منخفض';
    if (c === 'medium') return 'متوسط';
    if (c === 'high') return 'مرتفع';
    return category;
  }
  if (c === 'low') return 'Low';
  if (c === 'medium') return 'Medium';
  if (c === 'high') return 'High';
  return category.charAt(0).toUpperCase() + category.slice(1);
};

export function formatRelativeTime(iso: string, language: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;

  const diffSec = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (language === 'ar') {
    if (diffSec < 45) return 'الآن';
    if (diffMin < 60) return diffMin === 1 ? 'منذ دقيقة' : `منذ ${diffMin} دقيقة`;
    if (diffHour < 24) return diffHour === 1 ? 'منذ ساعة' : `منذ ${diffHour} ساعة`;
    if (diffDay < 7) return diffDay === 1 ? 'منذ يوم' : `منذ ${diffDay} يوم`;
    return date.toLocaleDateString('ar-PS', { month: 'short', day: 'numeric' });
  }

  if (diffSec < 45) return 'Just now';
  if (diffMin < 60) return diffMin === 1 ? '1 min ago' : `${diffMin} min ago`;
  if (diffHour < 24) return diffHour === 1 ? '1 hour ago' : `${diffHour} hours ago`;
  if (diffDay < 7) return diffDay === 1 ? '1 day ago' : `${diffDay} days ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Map an approval_requests row into a dashboard activity entry. */
export function mapApprovalToActivity(
  row: ApprovalActivityRow,
  language: string
): RecentActivityItem {
  const timestamp = row.updated_at || row.created_at;
  const statusKey = (row.status ?? 'pending').toLowerCase();
  const riskCategory = row.risk_category?.toLowerCase() ?? null;

  let type: ActivityType = 'credit';
  if (row.type === 'document') type = 'document';
  else if (statusKey === 'approved' || statusKey === 'rejected') type = 'approval';
  else if (statusKey === 'pending' || statusKey === 'awaiting_approval') type = 'approval';

  let status: ActivityStatus = 'completed';
  let title: string;

  if (statusKey === 'approved') {
    title = language === 'ar' ? 'اكتملت الموافقة' : 'Approval Completed';
    status = 'completed';
  } else if (statusKey === 'rejected') {
    title = language === 'ar' ? 'تم رفض الطلب' : 'Application Rejected';
    status = 'warning';
  } else if (riskCategory === 'high') {
    title = language === 'ar' ? 'تنبيه مخاطر مرتفعة' : 'High Risk Alert';
    status = 'warning';
    type = 'credit';
  } else if (row.risk_score != null) {
    title = language === 'ar' ? 'اكتمل التقييم الائتماني' : 'Credit Assessment Completed';
    status = 'pending';
    type = 'credit';
  } else {
    title = language === 'ar' ? 'في انتظار الموافقة' : 'Approval Pending';
    status = 'pending';
  }

  const parts: string[] = [];
  if (row.customer_name) parts.push(row.customer_name);
  if (row.risk_score != null) {
    const label = language === 'ar' ? 'درجة المخاطر' : 'Risk Score';
    const cat =
      riskCategory != null ? ` (${riskCategoryLabel(riskCategory, language)})` : '';
    parts.push(`${label}: ${row.risk_score}${cat}`);
  } else if (statusKey === 'pending' || statusKey === 'awaiting_approval') {
    parts.push(
      language === 'ar' ? 'يتطلب مراجعة المدير' : 'Requires manager review'
    );
  }

  return {
    id: `approval-${row.id}`,
    type,
    title,
    description: parts.join(' — ') || (language === 'ar' ? 'طلب تقييم' : 'Assessment request'),
    time: formatRelativeTime(timestamp, language),
    status,
    timestamp,
  };
}

/** Map a documents row into a dashboard activity entry. */
export function mapDocumentToActivity(
  row: DocumentActivityRow,
  language: string
): RecentActivityItem {
  const timestamp = row.updated_at || row.created_at;
  const statusKey = row.status.toLowerCase();
  const isNewUpload =
    statusKey === 'pending' ||
    statusKey === 'processing' ||
    (row.created_at === row.updated_at && statusKey !== 'completed' && statusKey !== 'processed');

  let status: ActivityStatus = 'completed';
  let title: string;

  if (statusKey === 'error' || statusKey === 'failed') {
    title = language === 'ar' ? 'فشلت معالجة المستند' : 'Document Processing Failed';
    status = 'warning';
  } else if (isNewUpload) {
    title = language === 'ar' ? 'تم رفع المستند' : 'Document Uploaded';
    status = 'pending';
  } else {
    title = language === 'ar' ? 'تمت معالجة المستند' : 'Document Processed';
    status = 'completed';
  }

  let description = row.name;
  if (row.extracted_fields != null && row.extracted_fields > 0) {
    description +=
      language === 'ar'
        ? ` — ${row.extracted_fields} حقول مستخرجة`
        : ` — ${row.extracted_fields} fields extracted`;
  }

  return {
    id: `doc-${row.id}`,
    type: 'document',
    title,
    description,
    time: formatRelativeTime(timestamp, language),
    status,
    timestamp,
  };
}

/** Merge rows from multiple tables into one sorted activity feed. */
export function mergeRecentActivity(
  approvals: ApprovalActivityRow[],
  documents: DocumentActivityRow[],
  language: string,
  limit = DISPLAY_LIMIT
): RecentActivityItem[] {
  const items: RecentActivityItem[] = [
    ...approvals.map((row) => mapApprovalToActivity(row, language)),
    ...documents.map((row) => mapDocumentToActivity(row, language)),
  ];

  return items
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, limit);
}

async function fetchRecentActivity(language: string): Promise<RecentActivityItem[]> {
  const [approvalsRes, documentsRes] = await Promise.all([
    supabase
      .from('approval_requests')
      .select(
        'id,type,customer_name,status,risk_score,risk_category,updated_at,created_at'
      )
      .order('updated_at', { ascending: false })
      .limit(QUERY_LIMIT),
    supabase
      .from('documents')
      .select('id,name,status,extracted_fields,updated_at,created_at')
      .order('updated_at', { ascending: false })
      .limit(QUERY_LIMIT),
  ]);

  if (approvalsRes.error) throw approvalsRes.error;
  if (documentsRes.error) throw documentsRes.error;

  return mergeRecentActivity(
    (approvalsRes.data ?? []) as ApprovalActivityRow[],
    (documentsRes.data ?? []) as DocumentActivityRow[],
    language
  );
}

export function useRecentActivity(language: string) {
  const [activities, setActivities] = useState<RecentActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setActivities(await fetchRecentActivity(language));
    } catch (err) {
      console.error('[useRecentActivity] failed to load:', err);
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [language]);

  useEffect(() => {
    setLoading(true);
    load();

    const channel = supabase
      .channel('dashboard-recent-activity')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'approval_requests' },
        () => load()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'documents' },
        () => load()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  return { activities, loading, error, refetch: load };
}
