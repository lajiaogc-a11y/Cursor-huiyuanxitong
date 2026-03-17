/**
 * 报表数据 Hook - react-query 缓存，页面切换秒开
 * 订单/活动变更时通过 report-cache-invalidate 事件 invalidate，不强制清空
 * 已迁移至 Backend API（reportsApiService）
 */
import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getReportBaseDataApi,
  getOrdersReportApi,
  getActivityGiftsReportApi,
} from '@/services/reports/reportsApiService';
import type { DateRange } from '@/lib/dateFilter';
import { useTenantView } from '@/contexts/TenantViewContext';
import { useAuth } from '@/contexts/AuthContext';

const STALE_TIME = 5 * 60 * 1000; // 5 分钟

async function fetchReportBaseData(tenantId?: string | null) {
  const [baseRes, cardRes, vendorRes, providerRes] = await Promise.all([
    getReportBaseDataApi(tenantId),
    import('@/services/giftcards/giftcardsApiService').then(m => m.listCardsApi('active')),
    import('@/services/giftcards/giftcardsApiService').then(m => m.listVendorsApi('active')),
    import('@/services/giftcards/giftcardsApiService').then(m => m.listPaymentProvidersApi('active')),
  ]);
  return {
    employees: baseRes.employees || [],
    cards: cardRes || [],
    vendors: vendorRes || [],
    providers: providerRes || [],
  };
}

async function fetchReportFilteredData(params: {
  dateRange: DateRange;
  employeeId?: string;
  isStaff?: boolean;
  tenantId?: string | null;
}) {
  const { dateRange, employeeId, isStaff, tenantId } = params;
  const staffId = isStaff ? employeeId : undefined;

  const ordersParams: { startDate?: string; endDate?: string; creatorId?: string; tenantId?: string | null } = {};
  if (dateRange.start) ordersParams.startDate = dateRange.start.toISOString();
  if (dateRange.end) ordersParams.endDate = dateRange.end.toISOString();
  if (staffId) ordersParams.creatorId = staffId;
  if (tenantId) ordersParams.tenantId = tenantId;

  const [orders, gifts] = await Promise.all([
    getOrdersReportApi(ordersParams),
    getActivityGiftsReportApi(ordersParams),
  ]);
  return { orders, gifts };
}

export function useReportBaseData() {
  const queryClient = useQueryClient();
  const { employee } = useAuth();
  const { viewingTenantId } = useTenantView() || {};
  const effectiveTenantId = viewingTenantId || employee?.tenant_id || null;

  const { data, isLoading } = useQuery({
    queryKey: ['report-base', effectiveTenantId ?? ''],
    queryFn: () => fetchReportBaseData(effectiveTenantId),
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
  const { employee: currentEmployee } = useAuth();
  const { viewingTenantId } = useTenantView() || {};
  const effectiveTenantId = viewingTenantId || currentEmployee?.tenant_id || null;
  const isStaff = employee?.role === 'staff';

  const { data, isLoading } = useQuery({
    queryKey: [
      'report-filtered',
      dateRange.start?.toISOString() ?? 'all',
      dateRange.end?.toISOString() ?? 'all',
      employee?.id ?? '',
      effectiveTenantId ?? '',
    ],
    queryFn: () =>
      fetchReportFilteredData({
        dateRange,
        employeeId: employee?.id,
        isStaff,
        tenantId: effectiveTenantId,
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
