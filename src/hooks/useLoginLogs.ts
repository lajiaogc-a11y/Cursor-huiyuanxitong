/**
 * 登录日志 Hook - react-query 缓存，页面切换秒开
 * 数据通过 @/api/data 获取，禁止直接访问 Supabase
 */
import { useCallback, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useTenantView } from '@/contexts/TenantViewContext';

export interface LoginLog {
  id: string;
  employee_id: string;
  employee_name: string;
  login_time: string;
  ip_address: string | null;
  ip_location: string | null;
  user_agent: string | null;
  success: boolean;
  failure_reason: string | null;
}

const ipLocationCache = new Map<string, string>();

function normalizeIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  const trimmed = ip.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('::ffff:')) return trimmed.slice(7);
  return trimmed;
}

function getBuiltinLocation(ip: string | null | undefined): string | null {
  const normalized = normalizeIp(ip);
  if (!normalized || normalized === 'unknown') return '-';
  if (normalized === '127.0.0.1' || normalized === '::1' || normalized === 'localhost') return '本机';
  if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(normalized)) return '内网';
  return null;
}

async function fetchLoginLogs(tenantId?: string | null): Promise<LoginLog[]> {
  const { getLoginLogs } = await import('@/api/data');
  const apiLogs = await getLoginLogs(500, tenantId);
  return apiLogs.map((log) => ({
    id: log.id,
    employee_id: log.employee_id,
    employee_name: log.employee_name || '-',
    login_time: log.login_time,
    ip_address: normalizeIp(log.ip_address),
    ip_location: log.ip_location || getBuiltinLocation(log.ip_address) || (log.ip_address ? ipLocationCache.get(normalizeIp(log.ip_address) || log.ip_address) || null : null),
    user_agent: log.user_agent,
    success: log.success ?? false,
    failure_reason: log.failure_reason,
  }));
}

async function fetchIpLocation(ip: string, lang: string): Promise<string> {
  const normalized = normalizeIp(ip);
  const builtin = getBuiltinLocation(normalized);
  if (!normalized || builtin) return builtin || '-';
  if (ipLocationCache.has(normalized)) return ipLocationCache.get(normalized)!;
  try {
    const langParam = lang === 'zh' ? '&lang=zh-CN' : '';
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-ip-location?ip=${encodeURIComponent(normalized)}${langParam}`
    );
    const data = await response.json();
    const location = data.location || '-';
    ipLocationCache.set(normalized, location);
    return location;
  } catch {
    return '-';
  }
}

export function clearIpLocationCache() {
  ipLocationCache.clear();
}

export function useLoginLogs(language: string = 'zh') {
  const queryClient = useQueryClient();
  const loadingLocationsRef = useRef(false);
  const { employee } = useAuth();
  const { viewingTenantId } = useTenantView() || {};
  const effectiveTenantId = viewingTenantId || employee?.tenant_id || null;
  const queryKey = ['login-logs', effectiveTenantId ?? ''] as const;

  const { data: logs = [], isLoading: isLoadingLogs, isError: isErrorLogs, refetch: refetchLogs } = useQuery({
    queryKey,
    queryFn: () => fetchLoginLogs(effectiveTenantId),
    staleTime: 5 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  // 异步加载 IP 地理位置并更新缓存
  useEffect(() => {
    const uniqueIps = [...new Set(logs
      .map(log => log.ip_address)
      .filter((ip): ip is string => !!ip && ip !== 'unknown' && !getBuiltinLocation(ip) && !ipLocationCache.has(ip))
    )];
    if (uniqueIps.length === 0 || loadingLocationsRef.current) return;

    loadingLocationsRef.current = true;
    const logsSnapshot = [...logs];
    const BATCH_SIZE = 5;
    (async () => {
      try {
        for (let i = 0; i < uniqueIps.length; i += BATCH_SIZE) {
          const batch = uniqueIps.slice(i, i + BATCH_SIZE);
          await Promise.all(batch.map(ip => fetchIpLocation(ip, language)));
        }
        queryClient.setQueryData(queryKey, (prev: LoginLog[] | undefined) => {
          if (!prev || prev.length !== logsSnapshot.length) return prev;
          return prev.map(log => ({
            ...log,
            ip_location: log.ip_address ? (getBuiltinLocation(log.ip_address) || ipLocationCache.get(log.ip_address) || '-') : '-',
          }));
        });
      } finally {
        loadingLocationsRef.current = false;
      }
    })();
  }, [logs, language, queryClient, queryKey]);

  useEffect(() => {
    const handler = () => {
      queryClient.invalidateQueries({ queryKey: ['login-logs'] });
    };
    window.addEventListener('userDataSynced', handler);
    return () => window.removeEventListener('userDataSynced', handler);
  }, [queryClient]);

  const refetch = useCallback(() => {
    clearIpLocationCache();
    return refetchLogs();
  }, [refetchLogs]);

  return { logs, isLoading: isLoadingLogs, isError: isErrorLogs, refetch };
}
