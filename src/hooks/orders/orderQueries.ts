// 订单查询函数 - 从 useOrders 提取，不修改业务逻辑
import { supabase } from '@/integrations/supabase/client';
import { getEmployeeNameById } from '@/services/nameResolver';
import { calculateUsdtOrderDerivedValues } from '@/lib/orderCalculations';
import { getTenantOrdersFull, getTenantUsdtOrdersFull, getTenantMembersFull } from '@/services/tenantService';
import { mapDbOrderToOrder, formatBeijingTime } from './utils';
import type { Order, UsdtOrder, OrderFilters, PointsStatus } from './types';
import { PAGE_SIZE } from './types';

export async function fetchOrdersFromDb(
  tenantId: string | null,
  page: number = 1,
  pageSize: number = PAGE_SIZE,
  filters?: OrderFilters
): Promise<{ orders: Order[]; totalCount: number }> {
  if (tenantId) {
    const [ordersData, membersData] = await Promise.all([
      getTenantOrdersFull(tenantId),
      getTenantMembersFull(tenantId),
    ]);
    const phoneToMemberCode = new Map<string, string>();
    (membersData || []).forEach((m: any) => {
      if (m.phone_number) phoneToMemberCode.set(m.phone_number, m.member_code || '');
    });
    let raw = (ordersData || []) as any[];
    if (filters) {
      if (filters.status && filters.status !== 'all') raw = raw.filter((d: any) => d.status === filters!.status);
      if (filters.currency && filters.currency !== 'all') raw = raw.filter((d: any) => (d.currency || 'NGN') === filters!.currency);
      if (filters.vendor) raw = raw.filter((d: any) => d.card_merchant_id === filters!.vendor);
      if (filters.paymentProvider) raw = raw.filter((d: any) => d.vendor_id === filters!.paymentProvider);
      if (filters.cardType) raw = raw.filter((d: any) => d.order_type === filters!.cardType);
      if (filters.creatorId) raw = raw.filter((d: any) => d.creator_id === filters!.creatorId);
      if (filters.minProfit != null) raw = raw.filter((d: any) => (d.profit_ngn ?? 0) >= filters!.minProfit!);
      if (filters.maxProfit != null) raw = raw.filter((d: any) => (d.profit_ngn ?? 0) <= filters!.maxProfit!);
      if (filters.dateRange?.start) raw = raw.filter((d: any) => new Date(d.created_at) >= filters!.dateRange!.start);
      if (filters.dateRange?.end) {
        const end = new Date(filters.dateRange.end);
        end.setHours(23, 59, 59, 999);
        raw = raw.filter((d: any) => new Date(d.created_at) <= end);
      }
      if (filters.searchTerm?.trim()) {
        const t = filters.searchTerm!.toLowerCase();
        raw = raw.filter((d: any) =>
          (d.phone_number || '').toLowerCase().includes(t) ||
          (d.order_number || '').toLowerCase().includes(t) ||
          (d.member_code_snapshot || '').toLowerCase().includes(t) ||
          (d.remark || '').toLowerCase().includes(t)
        );
      }
    }
    const all = raw.map((dbOrder: any) => {
      let memberCode = '';
      if (dbOrder.phone_number) memberCode = phoneToMemberCode.get(dbOrder.phone_number) || '';
      return { ...mapDbOrderToOrder(dbOrder), memberCode };
    });
    const start = (page - 1) * pageSize;
    const orders = all.slice(start, start + pageSize);
    return { orders, totalCount: all.length };
  }

  let query = supabase
    .from('orders')
    .select('*, members(member_code)', { count: 'exact' })
    .or('currency.neq.USDT,currency.is.null')
    .eq('is_deleted', false)
    .order('created_at', { ascending: false });

  if (filters) {
    if (filters.status && filters.status !== 'all') query = query.eq('status', filters.status);
    if (filters.currency && filters.currency !== 'all') query = query.eq('currency', filters.currency);
    if (filters.vendor) query = query.eq('card_merchant_id', filters.vendor);
    if (filters.paymentProvider) query = query.eq('vendor_id', filters.paymentProvider);
    if (filters.cardType) query = query.eq('order_type', filters.cardType);
    if (filters.creatorId) query = query.eq('creator_id', filters.creatorId);
    if (filters.minProfit != null) query = query.gte('profit_ngn', filters.minProfit);
    if (filters.maxProfit != null) query = query.lte('profit_ngn', filters.maxProfit);
    if (filters.dateRange?.start) query = query.gte('created_at', filters.dateRange.start.toISOString());
    if (filters.dateRange?.end) {
      const end = new Date(filters.dateRange.end);
      end.setHours(23, 59, 59, 999);
      query = query.lte('created_at', end.toISOString());
    }
    if (filters.searchTerm?.trim()) {
      const term = `%${filters.searchTerm.trim()}%`;
      query = query.or(`order_number.ilike.${term},phone_number.ilike.${term},member_code_snapshot.ilike.${term},remark.ilike.${term}`);
    }
  }

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const { data: ordersData, error: ordersError, count } = await query.range(from, to);

  if (ordersError) throw ordersError;

  const { data: membersData } = await supabase
    .from('members')
    .select('phone_number, member_code');

  const phoneToMemberCode = new Map<string, string>();
  (membersData || []).forEach((member: any) => {
    phoneToMemberCode.set(member.phone_number, member.member_code);
  });

  const orders = (ordersData || []).map((dbOrder: any) => {
    let memberCode = (dbOrder.members as any)?.member_code || '';
    if (!memberCode && dbOrder.phone_number) {
      memberCode = phoneToMemberCode.get(dbOrder.phone_number) || '';
    }
    return { ...mapDbOrderToOrder(dbOrder), memberCode };
  });

  return { orders, totalCount: count ?? 0 };
}

export async function fetchUsdtOrdersFromDb(
  tenantId: string | null,
  page: number = 1,
  pageSize: number = PAGE_SIZE,
  filters?: OrderFilters
): Promise<{ orders: UsdtOrder[]; totalCount: number }> {
  if (tenantId) {
    const [ordersData, membersData] = await Promise.all([
      getTenantUsdtOrdersFull(tenantId),
      getTenantMembersFull(tenantId),
    ]);
    const phoneToMemberCode = new Map<string, string>();
    (membersData || []).forEach((m: any) => {
      if (m.phone_number) phoneToMemberCode.set(m.phone_number, m.member_code || '');
    });
    let raw = (ordersData || []) as any[];
    if (filters) {
      if (filters.status && filters.status !== 'all') raw = raw.filter((d: any) => d.status === filters!.status);
      if (filters.vendor) raw = raw.filter((d: any) => d.card_merchant_id === filters!.vendor);
      if (filters.paymentProvider) raw = raw.filter((d: any) => d.vendor_id === filters!.paymentProvider);
      if (filters.cardType) raw = raw.filter((d: any) => d.order_type === filters!.cardType);
      if (filters.creatorId) raw = raw.filter((d: any) => d.creator_id === filters!.creatorId);
      if (filters.minProfit != null) raw = raw.filter((d: any) => (d.profit_usdt ?? 0) >= filters!.minProfit!);
      if (filters.maxProfit != null) raw = raw.filter((d: any) => (d.profit_usdt ?? 0) <= filters!.maxProfit!);
      if (filters.dateRange?.start) raw = raw.filter((d: any) => new Date(d.created_at) >= filters!.dateRange!.start);
      if (filters.dateRange?.end) {
        const end = new Date(filters.dateRange.end);
        end.setHours(23, 59, 59, 999);
        raw = raw.filter((d: any) => new Date(d.created_at) <= end);
      }
      if (filters.searchTerm?.trim()) {
        const t = filters.searchTerm!.toLowerCase();
        raw = raw.filter((d: any) =>
          (d.phone_number || '').toLowerCase().includes(t) ||
          (d.order_number || '').toLowerCase().includes(t) ||
          (d.member_code_snapshot || '').toLowerCase().includes(t) ||
          (d.remark || '').toLowerCase().includes(t)
        );
      }
    }
    const all = raw.map((dbOrder: any) => {
      let memberCode = '';
      if (dbOrder.phone_number) memberCode = phoneToMemberCode.get(dbOrder.phone_number) || '';
      const cardRate = Number(dbOrder.exchange_rate) || 0;
      const cardValue = Number(dbOrder.card_value) || 0;
      const actualPaidUsdt = Number(dbOrder.actual_payment) || 0;
      const feeUsdt = Number(dbOrder.fee) || 0;
      const rawUsdtRate = Number(dbOrder.foreign_rate) || 0;
      const usdtRate = Number(rawUsdtRate.toFixed(4));
      const derived = calculateUsdtOrderDerivedValues({
        cardValue, cardRate, usdtRate, actualPaidUsdt, feeUsdt,
      });
      return {
        id: dbOrder.order_number || dbOrder.id,
        dbId: dbOrder.id,
        createdAt: formatBeijingTime(dbOrder.created_at),
        cardType: dbOrder.order_type || '',
        cardValue,
        cardRate,
        cardWorth: derived.cardWorth,
        usdtRate,
        totalValueUsdt: derived.totalValueUsdt,
        actualPaidUsdt,
        feeUsdt,
        paymentValue: derived.paymentValue,
        profit: derived.profit,
        profitRate: derived.profitRate,
        vendor: dbOrder.card_merchant_id || '',
        paymentProvider: dbOrder.vendor_id || '',
        phoneNumber: dbOrder.phone_number || '',
        memberCode,
        demandCurrency: 'USDT',
        salesPerson: dbOrder.creator_id ? getEmployeeNameById(dbOrder.creator_id) : '',
        remark: dbOrder.remark || '',
        status: dbOrder.status as "active" | "cancelled" | "completed",
        order_points: Number(dbOrder.order_points) || 0,
        points_status: (dbOrder.points_status || 'none') as PointsStatus,
      };
    });
    const start = (page - 1) * pageSize;
    const orders = all.slice(start, start + pageSize);
    return { orders, totalCount: all.length };
  }

  let query = supabase
    .from('orders')
    .select('*, members(member_code)', { count: 'exact' })
    .eq('currency', 'USDT')
    .eq('is_deleted', false)
    .order('created_at', { ascending: false });

  if (filters) {
    if (filters.status && filters.status !== 'all') query = query.eq('status', filters.status);
    if (filters.vendor) query = query.eq('card_merchant_id', filters.vendor);
    if (filters.paymentProvider) query = query.eq('vendor_id', filters.paymentProvider);
    if (filters.cardType) query = query.eq('order_type', filters.cardType);
    if (filters.creatorId) query = query.eq('creator_id', filters.creatorId);
    if (filters.minProfit != null) query = query.gte('profit_usdt', filters.minProfit);
    if (filters.maxProfit != null) query = query.lte('profit_usdt', filters.maxProfit);
    if (filters.dateRange?.start) query = query.gte('created_at', filters.dateRange.start.toISOString());
    if (filters.dateRange?.end) {
      const end = new Date(filters.dateRange.end);
      end.setHours(23, 59, 59, 999);
      query = query.lte('created_at', end.toISOString());
    }
    if (filters.searchTerm?.trim()) {
      const term = `%${filters.searchTerm.trim()}%`;
      query = query.or(`order_number.ilike.${term},phone_number.ilike.${term},member_code_snapshot.ilike.${term},remark.ilike.${term}`);
    }
  }

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const { data: ordersData, error: ordersError, count } = await query.range(from, to);

  if (ordersError) throw ordersError;

  const { data: membersData } = await supabase
    .from('members')
    .select('phone_number, member_code');

  const phoneToMemberCode = new Map<string, string>();
  (membersData || []).forEach((member: any) => {
    phoneToMemberCode.set(member.phone_number, member.member_code);
  });

  const orders = (ordersData || []).map((dbOrder: any) => {
    let memberCode = (dbOrder.members as any)?.member_code || '';
    if (!memberCode && dbOrder.phone_number) {
      memberCode = phoneToMemberCode.get(dbOrder.phone_number) || '';
    }
    const cardRate = Number(dbOrder.exchange_rate) || 0;
    const cardValue = Number(dbOrder.card_value) || 0;
    const actualPaidUsdt = Number(dbOrder.actual_payment) || 0;
    const feeUsdt = Number(dbOrder.fee) || 0;
    const rawUsdtRate = Number(dbOrder.foreign_rate) || 0;
    const usdtRate = Number(rawUsdtRate.toFixed(4));
    const derived = calculateUsdtOrderDerivedValues({
      cardValue, cardRate, usdtRate, actualPaidUsdt, feeUsdt,
    });
    return {
      id: dbOrder.order_number || dbOrder.id,
      dbId: dbOrder.id,
      createdAt: formatBeijingTime(dbOrder.created_at),
      cardType: dbOrder.order_type || '',
      cardValue,
      cardRate,
      cardWorth: derived.cardWorth,
      usdtRate,
      totalValueUsdt: derived.totalValueUsdt,
      actualPaidUsdt,
      feeUsdt,
      paymentValue: derived.paymentValue,
      profit: derived.profit,
      profitRate: derived.profitRate,
      vendor: dbOrder.card_merchant_id || '',
      paymentProvider: dbOrder.vendor_id || '',
      phoneNumber: dbOrder.phone_number || '',
      memberCode,
      demandCurrency: 'USDT',
      salesPerson: dbOrder.creator_id ? getEmployeeNameById(dbOrder.creator_id) : '',
      remark: dbOrder.remark || '',
      status: dbOrder.status as "active" | "cancelled" | "completed",
      order_points: Number(dbOrder.order_points) || 0,
      points_status: (dbOrder.points_status || 'none') as PointsStatus,
    };
  });

  return { orders, totalCount: count ?? 0 };
}

/** 获取订单筛选条件下的全量汇总（利润总和、卡值总和），非当前页 */
export async function fetchOrderStats(
  tenantId: string | null,
  filters?: OrderFilters
): Promise<{ totalProfit: number; totalCardValue: number; tradingUsers: number }> {
  if (tenantId) {
    const [normalData, usdtData, membersData] = await Promise.all([
      getTenantOrdersFull(tenantId),
      getTenantUsdtOrdersFull(tenantId),
      getTenantMembersFull(tenantId),
    ]);
    const memberIdToPhone = new Map<string, string>();
    (membersData || []).forEach((m: any) => {
      if (m.id && (m.phone_number || '').trim()) memberIdToPhone.set(m.id, m.phone_number.trim());
    });
    const applyFilters = (raw: any[], isUsdt: boolean) => {
      let r = raw as any[];
      if (filters) {
        if (filters.status && filters.status !== 'all') r = r.filter((d: any) => d.status === filters!.status);
        if (filters.currency && filters.currency !== 'all') {
          if (isUsdt) r = filters.currency === 'USDT' ? r : [];
          else r = r.filter((d: any) => (d.currency || 'NGN') === filters!.currency);
        }
        if (filters.vendor) r = r.filter((d: any) => d.card_merchant_id === filters!.vendor);
        if (filters.paymentProvider) r = r.filter((d: any) => d.vendor_id === filters!.paymentProvider);
        if (filters.cardType) r = r.filter((d: any) => d.order_type === filters!.cardType);
        if (filters.creatorId) r = r.filter((d: any) => d.creator_id === filters!.creatorId);
        if (filters.minProfit != null) r = r.filter((d: any) => (isUsdt ? (d.profit_usdt ?? 0) : (d.profit_ngn ?? 0)) >= filters!.minProfit!);
        if (filters.maxProfit != null) r = r.filter((d: any) => (isUsdt ? (d.profit_usdt ?? 0) : (d.profit_ngn ?? 0)) <= filters!.maxProfit!);
        if (filters.dateRange?.start) r = r.filter((d: any) => new Date(d.created_at) >= filters!.dateRange!.start);
        if (filters.dateRange?.end) {
          const end = new Date(filters.dateRange.end);
          end.setHours(23, 59, 59, 999);
          r = r.filter((d: any) => new Date(d.created_at) <= end);
        }
        if (filters.searchTerm?.trim()) {
          const t = filters.searchTerm!.toLowerCase();
          r = r.filter((d: any) =>
            (d.phone_number || '').toLowerCase().includes(t) ||
            (d.order_number || '').toLowerCase().includes(t) ||
            (d.member_code_snapshot || '').toLowerCase().includes(t) ||
            (d.remark || '').toLowerCase().includes(t)
          );
        }
      }
      return r;
    };
    const normalFiltered = applyFilters(normalData || [], false);
    const usdtFiltered = applyFilters(usdtData || [], true);
    const normalProfit = normalFiltered.reduce((s, d) => s + (Number(d.profit_ngn) || 0), 0);
    const usdtProfit = usdtFiltered.reduce((s, d) => s + (Number(d.profit_usdt) || 0), 0);
    // 卡值：优先 amount，为空/0 时用 card_value * exchange_rate
    const normalCardValue = normalFiltered.reduce((s, d) => {
      const amt = Number(d.amount) || 0;
      const cv = Number(d.card_value) || 0;
      const cr = Number(d.exchange_rate) || 0;
      return s + (amt > 0 ? amt : cv * cr);
    }, 0);
    const usdtCardValue = usdtFiltered.reduce((s, d) => {
      const amt = Number(d.amount) || 0;
      const cv = Number(d.card_value) || 0;
      const cr = Number(d.exchange_rate) || 0;
      return s + (amt > 0 ? amt : cv * cr);
    }, 0);
    // 交易用户：筛选范围内有订单的会员数（按手机号去重，order 无 phone 时用 member 的）
    const allPhones = new Set<string>();
    [...normalFiltered, ...usdtFiltered].forEach((d: any) => {
      let p = (d.phone_number || '').trim();
      if (!p && d.member_id) p = (memberIdToPhone.get(d.member_id) || '').trim();
      if (p) allPhones.add(p);
    });
    return {
      totalProfit: normalProfit + usdtProfit,
      totalCardValue: normalCardValue + usdtCardValue,
      tradingUsers: allPhones.size,
    };
  }

  const status = filters?.status && filters.status !== 'all' ? filters.status : null;
  const currency = filters?.currency && filters.currency !== 'all' ? filters.currency : null;
  const startDate = filters?.dateRange?.start ? filters.dateRange.start.toISOString() : null;
  const endDate = filters?.dateRange?.end
    ? (() => {
        const end = new Date(filters.dateRange!.end);
        end.setHours(23, 59, 59, 999);
        return end.toISOString();
      })()
    : null;

  const { data, error } = await supabase.rpc('get_order_filter_stats', {
    p_status: status,
    p_currency: currency,
    p_vendor: filters?.vendor || null,
    p_payment_provider: filters?.paymentProvider || null,
    p_card_type: filters?.cardType || null,
    p_creator_id: filters?.creatorId || null,
    p_min_profit: filters?.minProfit ?? null,
    p_max_profit: filters?.maxProfit ?? null,
    p_start_date: startDate,
    p_end_date: endDate,
    p_search_term: filters?.searchTerm?.trim() || null,
    p_tenant_id: null,
  });

  if (error) {
    console.error('[fetchOrderStats] RPC error:', error);
    return { totalProfit: 0, totalCardValue: 0, tradingUsers: 0 };
  }

  const row = Array.isArray(data) ? data[0] : data;
  return {
    totalProfit: Number(row?.total_profit ?? 0),
    totalCardValue: Number(row?.total_card_value ?? 0),
    tradingUsers: Number(row?.trading_users ?? 0),
  };
}
