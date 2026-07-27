import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface AuditStats {
  pendingAudits: number;
  approved: number;
  rejected: number;
  avgReviewTimeHours: number;
}

const EMPTY_STATS: AuditStats = { pendingAudits: 0, approved: 0, rejected: 0, avgReviewTimeHours: 0 };

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Audit-specific KPIs. Unlike the global `get_platform_stats()` RPC used by
 * Dashboard.tsx (which bypasses RLS so every role sees identical totals),
 * this queries `approval_requests` directly and relies on RLS — audit_select_requests
 * already scopes visibility to exactly what Audit is meant to see (rows that
 * passed Risk approval, plus Audit's own past rejections), so these counts
 * are naturally correct without any extra filtering here.
 */
export function useAuditStats() {
  const [stats, setStats] = useState<AuditStats>(EMPTY_STATS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [pendingRes, approvedRes, rejectedRes, timingRes] = await Promise.all([
      supabase.from('approval_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending_audit_approval'),
      supabase.from('approval_requests').select('id', { count: 'exact', head: true }).eq('status', 'audit_approved'),
      supabase.from('approval_requests').select('id', { count: 'exact', head: true }).eq('status', 'rejected').not('audit_decision_by', 'is', null),
      supabase.from('approval_requests').select('risk_decision_at, audit_decision_at').not('audit_decision_at', 'is', null),
    ]);

    const firstError = pendingRes.error || approvedRes.error || rejectedRes.error || timingRes.error;
    if (firstError) {
      console.error('Failed to load audit stats:', firstError);
      setError(firstError.message);
      setLoading(false);
      return;
    }

    const durations = (timingRes.data ?? [])
      .filter((r): r is { risk_decision_at: string; audit_decision_at: string } => r.risk_decision_at != null && r.audit_decision_at != null)
      .map((r) => (new Date(r.audit_decision_at).getTime() - new Date(r.risk_decision_at).getTime()) / 3_600_000)
      .filter((n) => Number.isFinite(n) && n >= 0);
    const avgReviewTimeHours = durations.length ? round1(durations.reduce((a, b) => a + b, 0) / durations.length) : 0;

    setStats({
      pendingAudits: pendingRes.count ?? 0,
      approved: approvedRes.count ?? 0,
      rejected: rejectedRes.count ?? 0,
      avgReviewTimeHours,
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchStats();
    const channel = supabase
      .channel('audit_stats_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'approval_requests' }, () => fetchStats())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchStats]);

  return { stats, loading, error };
}
