// ============= Pending Audit Count Hook =============
// 与 useAuditRecords 共用 React Query key，审核通过/驳回 invalidate 后侧栏角标立即更新

import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useTenantView } from '@/contexts/TenantViewContext';
import { getPendingAuditCountApi } from '@/services/staff/dataApi';
import { STALE_TIME_LIST_MS } from '@/lib/reactQueryPolicy';

export function usePendingAuditCount() {
  const { employee } = useAuth();
  const { viewingTenantId, viewingTenantName } = useTenantView() || {};

  /** 与 useAuditRecords 完全一致，避免侧栏与审核中心计数口径不一致 */
  const effectiveTenantId = employee?.is_platform_super_admin
    ? (viewingTenantName?.trim() ? viewingTenantId : null)
    : (viewingTenantId || employee?.tenant_id || null);

  const { data: pendingCount = 0, isLoading: loading, refetch } = useQuery({
    queryKey: ['audit-pending-count', effectiveTenantId ?? ''],
    queryFn: () => getPendingAuditCountApi(effectiveTenantId),
    enabled: !!employee,
    staleTime: STALE_TIME_LIST_MS,
    refetchInterval: 30_000,
  });

  return { pendingCount, loading, refetch };
}
