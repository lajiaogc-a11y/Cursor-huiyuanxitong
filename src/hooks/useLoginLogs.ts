/**
 * 登录日志 Hook - react-query 缓存，页面切换秒开
 */
import { useCallback, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

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

async function fetchLoginLogs(): Promise<LoginLog[]> {
  const { data: logsData, error: logsError } = await supabase
    .from('employee_login_logs')
    .select('*')
    .order('login_time', { ascending: false })
    .limit(500);

  if (logsError) throw logsError;

  const { data: employeesData } = await supabase
    .from('employees')
    .select('id, real_name');

  const employeeMap = new Map<string, string>();
  (employeesData || []).forEach((emp: { id: string; real_name: string }) => {
    employeeMap.set(emp.id, emp.real_name);
  });

  return (logsData || []).map((log: any) => ({
    id: log.id,
    employee_id: log.employee_id,
    employee_name: employeeMap.get(log.employee_id) || '-',
    login_time: log.login_time,
    ip_address: log.ip_address,
    ip_location: log.ip_address ? ipLocationCache.get(log.ip_address) || null : null,
    user_agent: log.user_agent,
    success: log.success,
    failure_reason: log.failure_reason,
  }));
}

async function fetchIpLocation(ip: string, lang: string): Promise<string> {
  if (!ip || ip === 'unknown' || ip === '127.0.0.1') return '-';
  if (ipLocationCache.has(ip)) return ipLocationCache.get(ip)!;
  try {
    const langParam = lang === 'zh' ? '&lang=zh-CN' : '';
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-ip-location?ip=${encodeURIComponent(ip)}${langParam}`
    );
    const data = await response.json();
    const location = data.location || '-';
    ipLocationCache.set(ip, location);
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

  const { data: logs = [], isLoading: isLoadingLogs } = useQuery({
    queryKey: ['login-logs'],
    queryFn: fetchLoginLogs,
    staleTime: 5 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  // 异步加载 IP 地理位置并更新缓存
  useEffect(() => {
    const uniqueIps = [...new Set(logs
      .map(log => log.ip_address)
      .filter((ip): ip is string => !!ip && ip !== 'unknown' && !ipLocationCache.has(ip))
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
        queryClient.setQueryData(['login-logs'], (prev: LoginLog[] | undefined) => {
          if (!prev || prev.length !== logsSnapshot.length) return prev;
          return prev.map(log => ({
            ...log,
            ip_location: log.ip_address ? (ipLocationCache.get(log.ip_address) || '-') : '-',
          }));
        });
      } finally {
        loadingLocationsRef.current = false;
      }
    })();
  }, [logs, language, queryClient]);

  useEffect(() => {
    const handler = () => {
      queryClient.invalidateQueries({ queryKey: ['login-logs'] });
    };
    window.addEventListener('userDataSynced', handler);
    return () => window.removeEventListener('userDataSynced', handler);
  }, [queryClient]);

  const refetch = useCallback(() => {
    clearIpLocationCache();
    return queryClient.refetchQueries({ queryKey: ['login-logs'] });
  }, [queryClient]);

  return { logs, isLoading: isLoadingLogs, refetch };
}
