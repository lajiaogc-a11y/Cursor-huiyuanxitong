/**
 * 报表数据 Hook - react-query 缓存，页面切换秒开
 * 订单/活动变更时通过 report-cache-invalidate 事件 invalidate，不强制清空
 */
import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { DateRange } from '@/lib/dateFilter';

const STALE_TIME = 5 * 60 * 1000; // 5 分钟

async function fetchReportBaseData() {
  const [empRes, cardRes, vendorRes, providerRes] = await Promise.all([
    supabase.from('employees').select('id, real_name, username, role'),
    supabase.from('cards').select('id, name, type').eq('status', 'active'),
    supabase.from('vendors').select('id, name').eq('status', 'active'),
    supabase.from('payment_providers').select('id, name').eq('status', 'active'),
  ]);
  return {
    employees: empRes.data || [],
    cards: cardRes.data || [],
    vendors: vendorRes.data || [],
    providers: providerRes.data || [],
  };
}

async function fetchReportFilteredData(params: {
  dateRange: DateRange;
  employeeId?: string;
  isStaff?: boolean;
}) {
  const { dateRange, employeeId, isStaff } = params;
  const staffId = isStaff ? employeeId : '';

  if (!dateRange.start || !dateRange.end) {
    let ordersQuery = supabase.from('orders').select('*').order('created_at', { ascending: false });
    let giftsQuery = supabase.from('activity_gifts').select('*');
    if (isStaff && staffId) {
      ordersQuery = ordersQuery.eq('creator_id', staffId);
      giftsQuery = giftsQuery.eq('creator_id', staffId);
    }
    const [ordersRes, giftsRes] = await Promise.all([ordersQuery, giftsQuery]);
    return { orders: ordersRes.data || [], gifts: giftsRes.data || [] };
  }

  const startStr = dateRange.start.toISOString();
  const endStr = dateRange.end.toISOString();
  let ordersQuery = supabase
    .from('orders')
    .select('*')
    .gte('created_at', startStr)
    .lte('created_at', endStr)
    .order('created_at', { ascending: false });
  let giftsQuery = supabase
    .from('activity_gifts')
    .select('*')
    .gte('created_at', startStr)
    .lte('created_at', endStr);
  if (isStaff && staffId) {
    ordersQuery = ordersQuery.eq('creator_id', staffId);
    giftsQuery = giftsQuery.eq('creator_id', staffId);
  }
  const [ordersRes, giftsRes] = await Promise.all([ordersQuery, giftsQuery]);
  return { orders: ordersRes.data || [], gifts: giftsRes.data || [] };
}

export function useReportBaseData() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['report-base'],
    queryFn: fetchReportBaseData,
    staleTime: STALE_TIME,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    const handler = () => {
      queryClient.invalidateQueries({ queryKey: ['report-base'] });
    };
    const onDataRefresh = (event: Event) => {
      const detail = (event as CustomEvent<{ table?: string }>).detail;
      const table = detail?.table;
      if (table === 'members' || table === 'payment_providers' || table === 'vendors' || table === 'cards') {
        handler();
      }
    };
    window.addEventListener('report-cache-invalidate', handler);
    window.addEventListener('data-refresh', onDataRefresh as EventListener);
    return () => {
      window.removeEventListener('report-cache-invalidate', handler);
      window.removeEventListener('data-refresh', onDataRefresh as EventListener);
    };
  }, [queryClient]);

  return {
    employees: data?.employees ?? [],
    cards: data?.cards ?? [],
    vendors: data?.vendors ?? [],
    providers: data?.providers ?? [],
    isLoading,
  };
}

export function useReportFilteredData(
  dateRange: DateRange,
  employee: { id?: string; role?: string } | null
) {
  const queryClient = useQueryClient();
  const isStaff = employee?.role === 'staff';

  const { data, isLoading } = useQuery({
    queryKey: [
      'report-filtered',
      dateRange.start?.toISOString() ?? 'all',
      dateRange.end?.toISOString() ?? 'all',
      employee?.id ?? '',
    ],
    queryFn: () =>
      fetchReportFilteredData({
        dateRange,
        employeeId: employee?.id,
        isStaff,
      }),
    staleTime: STALE_TIME,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    const handler = () => {
      queryClient.invalidateQueries({ queryKey: ['report-filtered'] });
    };
    const onDataRefresh = (event: Event) => {
      const detail = (event as CustomEvent<{ table?: string }>).detail;
      const table = detail?.table;
      if (table === 'orders' || table === 'activity_gifts' || table === 'members') {
        handler();
      }
    };
    window.addEventListener('report-cache-invalidate', handler);
    window.addEventListener('data-refresh', onDataRefresh as EventListener);
    return () => {
      window.removeEventListener('report-cache-invalidate', handler);
      window.removeEventListener('data-refresh', onDataRefresh as EventListener);
    };
  }, [queryClient]);

  return {
    orders: data?.orders ?? [],
    activityGifts: data?.gifts ?? [],
    isLoading,
  };
}
