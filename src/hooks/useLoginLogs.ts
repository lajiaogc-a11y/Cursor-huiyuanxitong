/**
 * 登录日志 Hook - react-query 缓存，页面切换秒开，支持服务端分页
 * IP 地理位置在后端登录时写入 ip_location 字段，前端直接展示。
 * 对于历史记录中缺少 ip_location 的，通过 POST /api/logs/login/resolve-locations 回填。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useTenantView } from '@/contexts/TenantViewContext';
import { getLoginLogs } from '@/services/staff/dataApi';
import { apiClient } from '@/lib/apiClient';

const PAGE_SIZE = 100;

export interface LoginLog {
  id: string;
  employee_id: string | null;
  employee_name: string;
  login_time: string;
  ip_address: string | null;
  ip_location: string | null;
  user_agent: string | null;
  success: boolean;
  failure_reason: string | null;
}

function normalizeIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  const trimmed = ip.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('::ffff:')) return trimmed.slice(7);
  return trimmed;
}

async function fetchLoginLogs(tenantId?: string | null, page = 1, pageSize = PAGE_SIZE) {
  const result = await getLoginLogs(pageSize, tenantId, page);
  const logs: LoginLog[] = result.rows.map((log) => ({
    id: log.id,
    employee_id: log.employee_id,
    employee_name: log.employee_name || '-',
    login_time: log.login_time,
    ip_address: normalizeIp(log.ip_address),
    ip_location: log.ip_location || null,
    user_agent: log.user_agent,
    success: log.success ?? false,
    failure_reason: log.failure_reason,
  }));
  return { logs, total: result.total, page: result.page, pageSize: result.page_size };
}

export function useLoginLogs(_language: string = 'zh') {
  const queryClient = useQueryClient();
  const backfillTriggeredRef = useRef(false);
  const [currentPage, setCurrentPage] = useState(1);
  const { employee } = useAuth();
  const { viewingTenantId, viewingTenantName } = useTenantView() || {};
  /**
   * 平台超管：MainLayout 会把 viewingTenantId 自动设为本人绑定的平台租户，若据此请求 login API，
   * 后端只返回「tenant_id = 该平台租户」的员工登录记录，业务租户员工登录全被过滤 → 列表长期空白。
   * 仅在「从租户管理进入某租户」（enterTenant / session 恢复，此时有 viewingTenantName）时按租户筛选；
   * 否则不传 tenant_id，由后端返回全站日志。
   */
  const effectiveTenantId = employee?.is_platform_super_admin
    ? (viewingTenantName?.trim() ? viewingTenantId : null)
    : (viewingTenantId || employee?.tenant_id || null);
  const queryKey = ['login-logs', effectiveTenantId ?? '', currentPage] as const;

  // 切换租户 / 查看租户变化时若仍停留在高页码，服务端会返回空列表（OFFSET 超出），表现为「数据消失」
  useEffect(() => {
    setCurrentPage(1);
    backfillTriggeredRef.current = false;
  }, [effectiveTenantId]);

  const { data, isLoading: isLoadingLogs, isError: isErrorLogs, refetch: refetchLogs } = useQuery({
    queryKey,
    queryFn: () => fetchLoginLogs(effectiveTenantId, currentPage, PAGE_SIZE),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 3,
  });

  const logs = data?.logs ?? [];
  const totalLogs = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalLogs / PAGE_SIZE));

  // 总条数减少后（删库、筛选变化、invalidate 后）把页码收回到末页，避免空白页
  useEffect(() => {
    if (totalLogs === 0) {
      if (currentPage !== 1) setCurrentPage(1);
      return;
    }
    const maxPage = Math.max(1, Math.ceil(totalLogs / PAGE_SIZE));
    if (currentPage > maxPage) setCurrentPage(maxPage);
  }, [totalLogs, currentPage]);

  useEffect(() => {
    if (backfillTriggeredRef.current || logs.length === 0) return;
    const hasMissing = logs.some(l => l.ip_address && !l.ip_location);
    if (!hasMissing) return;
    backfillTriggeredRef.current = true;
    apiClient.post('/api/logs/login/resolve-locations', {})
      .then(() => {
        setTimeout(() => refetchLogs(), 2000);
      })
      .catch(() => { /* best effort */ });
  }, [logs, refetchLogs]);

  useEffect(() => {
    const handler = () => {
      queryClient.invalidateQueries({ queryKey: ['login-logs'] });
    };
    window.addEventListener('userDataSynced', handler);
    return () => window.removeEventListener('userDataSynced', handler);
  }, [queryClient]);

  const refetch = useCallback(() => {
    backfillTriggeredRef.current = false;
    return refetchLogs();
  }, [refetchLogs]);

  return {
    logs,
    isLoading: isLoadingLogs,
    isError: isErrorLogs,
    refetch,
    currentPage,
    setCurrentPage,
    totalLogs,
    totalPages,
    pageSize: PAGE_SIZE,
    /** 传给后端的 tenant_id；平台超管未「进入租户」时为 null（全站） */
    effectiveTenantId,
  };
}
