import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * GLOBAL platform statistics for the top summary cards.
 *
 * These numbers are intentionally NOT filtered by the current user or role:
 * every role (branch_employee, branch_manager, risk_department) must see the
 * exact same totals.
 *
 * Primary data source is the `get_platform_stats()` Postgres function
 * (SECURITY DEFINER) which bypasses RLS and returns only aggregates. If that
 * function has not been deployed yet, we fall back to direct count queries so
 * the pages still render real data (fully global for manager/risk; limited to
 * own rows for an employee, since RLS applies to the fallback path).
 */

interface RawStats {
  credit_total: number;
  credit_pending: number;
  credit_approved_today: number;
  credit_avg_risk: number;
  credit_low: number;
  credit_medium: number;
  credit_high: number;
  approvals_pending: number;
  approvals_urgent: number;
  approvals_approved_today: number;
  approvals_avg_hours: number;
}

function startOfTodayIso(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

const round1 = (n: number) => Math.round(n * 10) / 10;

const toNum = (v: unknown): number => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (typeof v === 'string') {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
};

/**
 * Normalize whatever supabase.rpc('get_platform_stats') returns into RawStats.
 * Handles every shape PostgREST/supabase-js might produce:
 *   - the JSON object directly: { credit_total: 13, ... }
 *   - an array wrapper:         [{ credit_total: 13, ... }]
 *   - a named wrapper:          { get_platform_stats: { credit_total: 13, ... } }
 *   - a stringified JSON blob:  "{\"credit_total\":13,...}"
 * Also coerces numeric-as-string values (Postgres `numeric` is often returned
 * as a string to preserve precision). Returns null if it can't be parsed, so
 * the caller can fall back instead of overwriting with zeros.
 */
function normalizeRpcStats(raw: unknown): RawStats | null {
  let obj: unknown = raw;

  if (typeof obj === 'string') {
    try {
      obj = JSON.parse(obj);
    } catch {
      return null;
    }
  }
  if (Array.isArray(obj)) obj = obj[0];
  if (
    obj &&
    typeof obj === 'object' &&
    'get_platform_stats' in (obj as Record<string, unknown>)
  ) {
    obj = (obj as Record<string, unknown>).get_platform_stats;
  }
  if (typeof obj === 'string') {
    try {
      obj = JSON.parse(obj);
    } catch {
      return null;
    }
  }
  if (!obj || typeof obj !== 'object') return null;

  const o = obj as Record<string, unknown>;
  // Require at least one expected key so we don't accept an unrelated object.
  if (!('credit_total' in o) && !('approvals_pending' in o)) return null;

  return {
    credit_total: toNum(o.credit_total),
    credit_pending: toNum(o.credit_pending),
    credit_approved_today: toNum(o.credit_approved_today),
    credit_avg_risk: toNum(o.credit_avg_risk),
    credit_low: toNum(o.credit_low),
    credit_medium: toNum(o.credit_medium),
    credit_high: toNum(o.credit_high),
    approvals_pending: toNum(o.approvals_pending),
    approvals_urgent: toNum(o.approvals_urgent),
    approvals_approved_today: toNum(o.approvals_approved_today),
    approvals_avg_hours: toNum(o.approvals_avg_hours),
  };
}

/** Fallback: compute the same aggregates with direct queries (subject to RLS). */
async function fetchViaQueries(): Promise<RawStats> {
  const todayIso = startOfTodayIso();

  const countCredit = (
    build?: (q: ReturnType<typeof creditCountBase>) => ReturnType<typeof creditCountBase>
  ) => {
    const base = creditCountBase();
    return build ? build(base) : base;
  };
  const countApprovals = (
    build?: (q: ReturnType<typeof approvalCountBase>) => ReturnType<typeof approvalCountBase>
  ) => {
    const base = approvalCountBase();
    return build ? build(base) : base;
  };

  function creditCountBase() {
    return supabase.from('credit_applications').select('*', { count: 'exact', head: true });
  }
  function approvalCountBase() {
    return supabase.from('approval_requests').select('*', { count: 'exact', head: true });
  }

  const [
    creditTotal,
    creditPending,
    creditApprovedToday,
    creditLow,
    creditMedium,
    creditHigh,
    approvalsPending,
    approvalsUrgent,
    approvalsApprovedToday,
    riskRes,
    procRes,
  ] = await Promise.all([
    countCredit(),
    countCredit((q) => q.in('status', ['pending', 'awaiting_approval'])),
    countCredit((q) => q.eq('status', 'approved').gte('updated_at', todayIso)),
    countCredit((q) => q.eq('risk_category', 'low')),
    countCredit((q) => q.eq('risk_category', 'medium')),
    countCredit((q) => q.eq('risk_category', 'high')),
    countApprovals((q) => q.eq('status', 'pending')),
    countApprovals((q) => q.eq('priority', 'urgent')),
    countApprovals((q) => q.eq('status', 'approved').gte('approved_at', todayIso)),
    supabase.from('credit_applications').select('risk_score').not('risk_score', 'is', null),
    supabase
      .from('approval_requests')
      .select('created_at, approved_at')
      .eq('status', 'approved')
      .not('approved_at', 'is', null),
  ]);

  const firstError =
    creditTotal.error ||
    creditPending.error ||
    creditApprovedToday.error ||
    creditLow.error ||
    creditMedium.error ||
    creditHigh.error ||
    approvalsPending.error ||
    approvalsUrgent.error ||
    approvalsApprovedToday.error ||
    riskRes.error ||
    procRes.error;
  if (firstError) throw firstError;

  const riskScores = (riskRes.data ?? [])
    .map((r: { risk_score: number | null }) => Number(r.risk_score))
    .filter((n) => Number.isFinite(n));
  const avgRisk = riskScores.length
    ? riskScores.reduce((a, b) => a + b, 0) / riskScores.length
    : 0;

  const durations = (procRes.data ?? [])
    .map((r: { created_at: string; approved_at: string }) => {
      const ms = new Date(r.approved_at).getTime() - new Date(r.created_at).getTime();
      return ms / 3_600_000;
    })
    .filter((n) => Number.isFinite(n) && n >= 0);
  const avgHours = durations.length
    ? durations.reduce((a, b) => a + b, 0) / durations.length
    : 0;

  return {
    credit_total: creditTotal.count ?? 0,
    credit_pending: creditPending.count ?? 0,
    credit_approved_today: creditApprovedToday.count ?? 0,
    credit_avg_risk: round1(avgRisk),
    credit_low: creditLow.count ?? 0,
    credit_medium: creditMedium.count ?? 0,
    credit_high: creditHigh.count ?? 0,
    approvals_pending: approvalsPending.count ?? 0,
    approvals_urgent: approvalsUrgent.count ?? 0,
    approvals_approved_today: approvalsApprovedToday.count ?? 0,
    approvals_avg_hours: round1(avgHours),
  };
}

function useRawStats() {
  const [data, setData] = useState<RawStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchStats = useCallback(async () => {
    setError(null);
    try {
      // Primary path: global, RLS-proof aggregate function.
      const rpc = await supabase.rpc('get_platform_stats');
      // Temporary debug log — remove once verified.
      console.log('get_platform_stats rpc result', rpc.data, rpc.error);

      const normalized = rpc.error ? null : normalizeRpcStats(rpc.data);
      if (normalized) {
        setData(normalized);
        return;
      }

      // Fallback path: direct count queries (only when RPC gave nothing usable).
      setData(await fetchViaQueries());
    } catch (err) {
      console.error('[useStats] failed to load platform stats:', err);
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();

    const channel = supabase
      .channel('platform-stats')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'credit_applications' },
        () => fetchStats()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'approval_requests' },
        () => fetchStats()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchStats]);

  return { data, loading, error, refetch: fetchStats };
}

export interface DashboardStats {
  totalApplications: number;
  pendingReview: number;
  approvedToday: number;
  avgRiskScore: number;
}

export function useDashboardStats() {
  const { data, loading, error, refetch } = useRawStats();
  const stats: DashboardStats = {
    totalApplications: data?.credit_total ?? 0,
    pendingReview: data?.credit_pending ?? 0,
    approvedToday: data?.credit_approved_today ?? 0,
    avgRiskScore: data?.credit_avg_risk ?? 0,
  };
  return { stats, loading, error, refetch };
}

export interface CreditRiskStats {
  totalAssessments: number;
  lowRisk: number;
  mediumRisk: number;
  highRisk: number;
}

export function useCreditRiskStats() {
  const { data, loading, error, refetch } = useRawStats();
  const stats: CreditRiskStats = {
    totalAssessments: data?.credit_total ?? 0,
    lowRisk: data?.credit_low ?? 0,
    mediumRisk: data?.credit_medium ?? 0,
    highRisk: data?.credit_high ?? 0,
  };
  return { stats, loading, error, refetch };
}

export interface ApprovalStats {
  pending: number;
  urgent: number;
  approvedToday: number;
  avgProcessTimeHours: number;
}

export function useApprovalStats() {
  const { data, loading, error, refetch } = useRawStats();
  const stats: ApprovalStats = {
    pending: data?.approvals_pending ?? 0,
    urgent: data?.approvals_urgent ?? 0,
    approvedToday: data?.approvals_approved_today ?? 0,
    avgProcessTimeHours: data?.approvals_avg_hours ?? 0,
  };
  return { stats, loading, error, refetch };
}
