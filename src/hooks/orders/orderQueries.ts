// 订单查询函数 - 从 useOrders 提取，不修改业务逻辑
import { calculateUsdtOrderDerivedValues } from '@/lib/orderCalculations';
import {
  getTenantOrdersFull,
  getTenantUsdtOrdersFull,
  getTenantMembersFull,
  getMyTenantOrdersFull,
  getMyTenantUsdtOrdersFull,
  getMyTenantMembersFull,
  getTenantMeikaFiatOrdersFull,
  getTenantMeikaUsdtOrdersFull,
  getMyTenantMeikaFiatOrdersFull,
  getMyTenantMeikaUsdtOrdersFull,
} from '@/services/tenantService';
import { mapDbOrderToOrder, formatBeijingTime, resolveSalesPersonName } from './utils';
import type { Order, UsdtOrder, OrderFilters, PointsStatus } from './types';
import { PAGE_SIZE } from './types';

interface DbOrderRow {
  id?: string;
  order_number?: string;
  member_code?: string;
  phone_number?: string;
  amount?: number;
  currency?: string;
  status?: string;
  vendor?: string;
  created_at?: string;
  updated_at?: string;
  member_code_snapshot?: string;
  remark?: string;
  card_merchant_id?: string;
  order_type?: string;
  profit_ngn?: number;
  profit_usdt?: number;
  creator_id?: string | null;
  sales_user_id?: string | null;
  payment_provider?: unknown;
  vendor_id?: unknown;
  card_value?: number;
  exchange_rate?: number;
  rate?: number;
  actual_payment?: number;
  fee?: number;
  foreign_rate?: number;
  order_points?: number;
  points_status?: string;
  member_id?: string;
  [key: string]: unknown;
}

interface MemberRow {
  id?: string;
  member_code?: string;
  phone_number?: string;
  [key: string]: unknown;
}

/** API/缓存异常时避免对非数组调用 .filter/.map/.slice */
function ensureArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

function matchesSalesEmployee(row: { creator_id?: string | null; sales_user_id?: string | null }, employeeId: string): boolean {
  return row.creator_id === employeeId || row.sales_user_id === employeeId;
}

/** 代付商家：新订单在 payment_provider；历史订单误写在 vendor_id */
function rowMatchesPaymentProvider(d: { payment_provider?: unknown; vendor_id?: unknown }, providerId: string): boolean {
  const p = d.payment_provider != null ? String(d.payment_provider).trim() : '';
  if (p) return p === providerId;
  return String(d.vendor_id ?? '') === providerId;
}

function usdtRowPaymentProvider(dbOrder: { payment_provider?: unknown; vendor_id?: unknown }): string {
  const p = String(dbOrder.payment_provider ?? '').trim();
  return p || String(dbOrder.vendor_id ?? '');
}

function usdtRowCardVendor(dbOrder: { card_merchant_id?: unknown; vendor_id?: unknown }): string {
  const c = String(dbOrder.card_merchant_id ?? '').trim();
  return c || String(dbOrder.vendor_id ?? '');
}

export async function fetchOrdersFromDb(
  tenantId: string | null,
  page: number = 1,
  pageSize: number = PAGE_SIZE,
  filters?: OrderFilters,
  useMyTenantRpc?: boolean,
  listVariant: 'standard' | 'meika-fiat' = 'standard',
): Promise<{ orders: Order[]; totalCount: number }> {
  if (tenantId && !useMyTenantRpc) {
    const [ordersData, membersData] = await Promise.all([
      listVariant === 'meika-fiat' ? getTenantMeikaFiatOrdersFull(tenantId) : getTenantOrdersFull(tenantId),
      getTenantMembersFull(tenantId),
    ]);
    const phoneToMemberCode = new Map<string, string>();
    ensureArray<MemberRow>(membersData).forEach((m: MemberRow) => {
      if (m.phone_number) phoneToMemberCode.set(String(m.phone_number), m.member_code || '');
    });
    let raw = ensureArray<DbOrderRow>(ordersData);
    if (filters) {
      if (filters.status && filters.status !== 'all') raw = raw.filter((d: DbOrderRow) => d.status === filters!.status);
      if (filters.currency && filters.currency !== 'all') raw = raw.filter((d: DbOrderRow) => (d.currency || 'NGN') === filters!.currency);
      if (filters.vendor) raw = raw.filter((d: DbOrderRow) => d.card_merchant_id === filters!.vendor);
      if (filters.paymentProvider) raw = raw.filter((d: DbOrderRow) => rowMatchesPaymentProvider(d, filters!.paymentProvider!));
      if (filters.cardType) raw = raw.filter((d: DbOrderRow) => d.order_type === filters!.cardType);
      if (filters.creatorId) raw = raw.filter((d: DbOrderRow) => matchesSalesEmployee(d, filters!.creatorId!));
      if (filters.minProfit != null) raw = raw.filter((d: DbOrderRow) => (d.profit_ngn ?? 0) >= filters!.minProfit!);
      if (filters.maxProfit != null) raw = raw.filter((d: DbOrderRow) => (d.profit_ngn ?? 0) <= filters!.maxProfit!);
      if (filters.dateRange?.start) raw = raw.filter((d: DbOrderRow) => new Date(d.created_at!) >= filters!.dateRange!.start);
      if (filters.dateRange?.end) {
        const end = new Date(filters.dateRange.end);
        end.setHours(23, 59, 59, 999);
        raw = raw.filter((d: DbOrderRow) => new Date(d.created_at!) <= end);
      }
      if (filters.searchTerm?.trim()) {
        const t = filters.searchTerm!.toLowerCase();
        raw = raw.filter((d: DbOrderRow) =>
          String(d.phone_number || '').toLowerCase().includes(t) ||
          String(d.order_number || '').toLowerCase().includes(t) ||
          String(d.member_code_snapshot || '').toLowerCase().includes(t) ||
          String(d.remark || '').toLowerCase().includes(t)
        );
      }
    }
    const all = raw.map((dbOrder: DbOrderRow) => {
      let memberCode = dbOrder.member_code_snapshot || '';
      if (!memberCode && dbOrder.phone_number) memberCode = phoneToMemberCode.get(String(dbOrder.phone_number)) || '';
      return { ...mapDbOrderToOrder(dbOrder), memberCode };
    });
    const start = (page - 1) * pageSize;
    const orders = all.slice(start, start + pageSize);
    return { orders, totalCount: all.length };
  }

  // 租户员工或平台未选租户：一律使用 RPC，避免 RLS 拦截
  const [ordersData, membersData] = await Promise.all([
    listVariant === 'meika-fiat' ? getMyTenantMeikaFiatOrdersFull() : getMyTenantOrdersFull(),
    getMyTenantMembersFull(),
  ]);
  const phoneToMemberCode = new Map<string, string>();
  ensureArray<MemberRow>(membersData).forEach((m: MemberRow) => {
    if (m.phone_number) phoneToMemberCode.set(String(m.phone_number), m.member_code || '');
  });
  let raw = ensureArray<DbOrderRow>(ordersData).filter((d: DbOrderRow) => d.currency !== 'USDT');
  if (filters) {
    if (filters.status && filters.status !== 'all') raw = raw.filter((d: DbOrderRow) => d.status === filters!.status);
    if (filters.currency && filters.currency !== 'all') raw = raw.filter((d: DbOrderRow) => (d.currency || 'NGN') === filters!.currency);
    if (filters.vendor) raw = raw.filter((d: DbOrderRow) => d.card_merchant_id === filters!.vendor);
    if (filters.paymentProvider) raw = raw.filter((d: DbOrderRow) => rowMatchesPaymentProvider(d, filters!.paymentProvider!));
    if (filters.cardType) raw = raw.filter((d: DbOrderRow) => d.order_type === filters!.cardType);
    if (filters.creatorId) raw = raw.filter((d: DbOrderRow) => matchesSalesEmployee(d, filters!.creatorId!));
    if (filters.minProfit != null) raw = raw.filter((d: DbOrderRow) => (d.profit_ngn ?? 0) >= filters!.minProfit!);
    if (filters.maxProfit != null) raw = raw.filter((d: DbOrderRow) => (d.profit_ngn ?? 0) <= filters!.maxProfit!);
    if (filters.dateRange?.start) raw = raw.filter((d: DbOrderRow) => new Date(d.created_at!) >= filters!.dateRange!.start);
    if (filters.dateRange?.end) {
      const end = new Date(filters.dateRange.end);
      end.setHours(23, 59, 59, 999);
      raw = raw.filter((d: DbOrderRow) => new Date(d.created_at!) <= end);
    }
    if (filters.searchTerm?.trim()) {
      const t = filters.searchTerm!.toLowerCase();
      raw = raw.filter((d: DbOrderRow) =>
        String(d.phone_number || '').toLowerCase().includes(t) ||
        String(d.order_number || '').toLowerCase().includes(t) ||
        String(d.member_code_snapshot || '').toLowerCase().includes(t) ||
        String(d.remark || '').toLowerCase().includes(t)
      );
    }
  }
  const all = raw.map((dbOrder: DbOrderRow) => {
    let memberCode = dbOrder.member_code_snapshot || '';
    if (!memberCode && dbOrder.phone_number) memberCode = phoneToMemberCode.get(String(dbOrder.phone_number)) || '';
    return { ...mapDbOrderToOrder(dbOrder), memberCode };
  });
  const start = (page - 1) * pageSize;
  const orders = all.slice(start, start + pageSize);
  return { orders, totalCount: all.length };
}

export async function fetchUsdtOrdersFromDb(
  tenantId: string | null,
  page: number = 1,
  pageSize: number = PAGE_SIZE,
  filters?: OrderFilters,
  useMyTenantRpc?: boolean,
  listVariant: 'standard' | 'meika-usdt' = 'standard',
): Promise<{ orders: UsdtOrder[]; totalCount: number }> {
  if (tenantId && !useMyTenantRpc) {
    const [ordersData, membersData] = await Promise.all([
      listVariant === 'meika-usdt' ? getTenantMeikaUsdtOrdersFull(tenantId) : getTenantUsdtOrdersFull(tenantId),
      getTenantMembersFull(tenantId),
    ]);
    const phoneToMemberCode = new Map<string, string>();
    ensureArray<MemberRow>(membersData).forEach((m: MemberRow) => {
      if (m.phone_number) phoneToMemberCode.set(String(m.phone_number), m.member_code || '');
    });
    let raw = ensureArray<DbOrderRow>(ordersData);
    if (filters) {
      if (filters.status && filters.status !== 'all') raw = raw.filter((d: DbOrderRow) => d.status === filters!.status);
      if (filters.vendor) raw = raw.filter((d: DbOrderRow) => d.card_merchant_id === filters!.vendor);
      if (filters.paymentProvider) raw = raw.filter((d: DbOrderRow) => rowMatchesPaymentProvider(d, filters!.paymentProvider!));
      if (filters.cardType) raw = raw.filter((d: DbOrderRow) => d.order_type === filters!.cardType);
      if (filters.creatorId) raw = raw.filter((d: DbOrderRow) => matchesSalesEmployee(d, filters!.creatorId!));
      if (filters.minProfit != null) raw = raw.filter((d: DbOrderRow) => (d.profit_usdt ?? 0) >= filters!.minProfit!);
      if (filters.maxProfit != null) raw = raw.filter((d: DbOrderRow) => (d.profit_usdt ?? 0) <= filters!.maxProfit!);
      if (filters.dateRange?.start) raw = raw.filter((d: DbOrderRow) => new Date(d.created_at!) >= filters!.dateRange!.start);
      if (filters.dateRange?.end) {
        const end = new Date(filters.dateRange.end);
        end.setHours(23, 59, 59, 999);
        raw = raw.filter((d: DbOrderRow) => new Date(d.created_at!) <= end);
      }
      if (filters.searchTerm?.trim()) {
        const t = filters.searchTerm!.toLowerCase();
        raw = raw.filter((d: DbOrderRow) =>
          String(d.phone_number || '').toLowerCase().includes(t) ||
          String(d.order_number || '').toLowerCase().includes(t) ||
          String(d.member_code_snapshot || '').toLowerCase().includes(t) ||
          String(d.remark || '').toLowerCase().includes(t)
        );
      }
    }
    const all = raw.map((dbOrder: DbOrderRow) => {
      let memberCode = dbOrder.member_code_snapshot || '';
      if (!memberCode && dbOrder.phone_number) memberCode = phoneToMemberCode.get(String(dbOrder.phone_number)) || '';
      const rawCardRate = Number(dbOrder.exchange_rate) || Number(dbOrder.rate) || 0;
      const rawCardValue = Number(dbOrder.card_value) || 0;
      const actualPaidUsdt = Number(dbOrder.actual_payment) || 0;
      const feeUsdt = Number(dbOrder.fee) || 0;
      const rawUsdtRate = Number(dbOrder.foreign_rate) || 0;
      const usdtRate = Number(rawUsdtRate.toFixed(4));
      const effectiveCardWorth = Number(dbOrder.amount) || 0;
      const isLegacy = rawCardValue === 0 && rawCardRate === 0 && effectiveCardWorth > 0;
      const cardValue = isLegacy ? effectiveCardWorth : rawCardValue;
      const cardRate = isLegacy ? 1 : rawCardRate;
      const derived = calculateUsdtOrderDerivedValues({
        cardValue, cardRate, usdtRate, actualPaidUsdt, feeUsdt,
      });
      return {
        id: String(dbOrder.order_number || dbOrder.id || ''),
        dbId: String(dbOrder.id || ''),
        createdAt: formatBeijingTime(dbOrder.created_at),
        cardType: dbOrder.order_type || '',
        cardValue,
        cardRate,
        cardWorth: derived.cardWorth || effectiveCardWorth,
        usdtRate,
        totalValueUsdt: derived.totalValueUsdt,
        actualPaidUsdt,
        feeUsdt,
        paymentValue: derived.paymentValue,
        profit: derived.profit,
        profitRate: derived.profitRate,
        vendor: usdtRowCardVendor(dbOrder),
        paymentProvider: usdtRowPaymentProvider(dbOrder),
        phoneNumber: dbOrder.phone_number || '',
        memberCode,
        demandCurrency: 'USDT',
        salesPerson: resolveSalesPersonName(dbOrder),
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

  const [ordersData, membersData] = await Promise.all([
    listVariant === 'meika-usdt' ? getMyTenantMeikaUsdtOrdersFull() : getMyTenantUsdtOrdersFull(),
    getMyTenantMembersFull(),
  ]);
  const phoneToMemberCode = new Map<string, string>();
  ensureArray<MemberRow>(membersData).forEach((m: MemberRow) => {
    if (m.phone_number) phoneToMemberCode.set(String(m.phone_number), m.member_code || '');
  });
  let raw = ensureArray<DbOrderRow>(ordersData).filter((d: DbOrderRow) => d.currency === 'USDT');
  if (filters) {
    if (filters.status && filters.status !== 'all') raw = raw.filter((d: DbOrderRow) => d.status === filters!.status);
    if (filters.vendor) raw = raw.filter((d: DbOrderRow) => d.card_merchant_id === filters!.vendor);
    if (filters.paymentProvider) raw = raw.filter((d: DbOrderRow) => rowMatchesPaymentProvider(d, filters!.paymentProvider!));
    if (filters.cardType) raw = raw.filter((d: DbOrderRow) => d.order_type === filters!.cardType);
    if (filters.creatorId) raw = raw.filter((d: DbOrderRow) => matchesSalesEmployee(d, filters!.creatorId!));
    if (filters.minProfit != null) raw = raw.filter((d: DbOrderRow) => (d.profit_usdt ?? 0) >= filters!.minProfit!);
    if (filters.maxProfit != null) raw = raw.filter((d: DbOrderRow) => (d.profit_usdt ?? 0) <= filters!.maxProfit!);
    if (filters.dateRange?.start) raw = raw.filter((d: DbOrderRow) => new Date(d.created_at!) >= filters!.dateRange!.start);
    if (filters.dateRange?.end) {
      const end = new Date(filters.dateRange.end);
      end.setHours(23, 59, 59, 999);
      raw = raw.filter((d: DbOrderRow) => new Date(d.created_at!) <= end);
    }
    if (filters.searchTerm?.trim()) {
      const t = filters.searchTerm!.toLowerCase();
      raw = raw.filter((d: DbOrderRow) =>
        String(d.phone_number || '').toLowerCase().includes(t) ||
        String(d.order_number || '').toLowerCase().includes(t) ||
        String(d.member_code_snapshot || '').toLowerCase().includes(t) ||
        String(d.remark || '').toLowerCase().includes(t)
      );
    }
  }
  const all = raw.map((dbOrder: DbOrderRow) => {
    let memberCode = dbOrder.member_code_snapshot || '';
    if (!memberCode && dbOrder.phone_number) memberCode = phoneToMemberCode.get(String(dbOrder.phone_number)) || '';
    const rawCardRate = Number(dbOrder.exchange_rate) || Number(dbOrder.rate) || 0;
    const rawCardValue = Number(dbOrder.card_value) || 0;
    const actualPaidUsdt = Number(dbOrder.actual_payment) || 0;
    const feeUsdt = Number(dbOrder.fee) || 0;
    const rawUsdtRate = Number(dbOrder.foreign_rate) || 0;
    const usdtRate = Number(rawUsdtRate.toFixed(4));
    const effectiveCardWorth = Number(dbOrder.amount) || 0;
    const isLegacy = rawCardValue === 0 && rawCardRate === 0 && effectiveCardWorth > 0;
    const cardValue = isLegacy ? effectiveCardWorth : rawCardValue;
    const cardRate = isLegacy ? 1 : rawCardRate;
    const derived = calculateUsdtOrderDerivedValues({
      cardValue, cardRate, usdtRate, actualPaidUsdt, feeUsdt,
    });
    return {
      id: String(dbOrder.order_number || dbOrder.id || ''),
      dbId: String(dbOrder.id || ''),
      createdAt: formatBeijingTime(dbOrder.created_at),
      cardType: dbOrder.order_type || '',
      cardValue,
      cardRate,
      cardWorth: derived.cardWorth || effectiveCardWorth,
      usdtRate,
      totalValueUsdt: derived.totalValueUsdt,
      actualPaidUsdt,
      feeUsdt,
      paymentValue: derived.paymentValue,
      profit: derived.profit,
      profitRate: derived.profitRate,
      vendor: usdtRowCardVendor(dbOrder),
      paymentProvider: usdtRowPaymentProvider(dbOrder),
      phoneNumber: dbOrder.phone_number || '',
      memberCode,
      demandCurrency: 'USDT',
      salesPerson: resolveSalesPersonName(dbOrder),
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

/** 获取订单筛选条件下的全量汇总（利润总和、卡值总和），非当前页 */
export async function fetchOrderStats(
  tenantId: string | null,
  filters?: OrderFilters,
  useMyTenantRpc?: boolean
): Promise<{ totalProfit: number; usdtProfit: number; totalCardValue: number; tradingUsers: number }> {
  if (tenantId && !useMyTenantRpc) {
    const [normalData, usdtData, membersData] = await Promise.all([
      getTenantOrdersFull(tenantId),
      getTenantUsdtOrdersFull(tenantId),
      getTenantMembersFull(tenantId),
    ]);
    const memberIdToPhone = new Map<string, string>();
    ensureArray<MemberRow>(membersData).forEach((m: MemberRow) => {
      if (m.id && String(m.phone_number || '').trim()) memberIdToPhone.set(m.id, String(m.phone_number).trim());
    });
    const applyFilters = (raw: DbOrderRow[], isUsdt: boolean) => {
      let r: DbOrderRow[] = raw;
      if (filters) {
        if (filters.status && filters.status !== 'all') r = r.filter((d: DbOrderRow) => d.status === filters!.status);
        if (filters.currency && filters.currency !== 'all') {
          if (isUsdt) r = filters.currency === 'USDT' ? r : [];
          else r = r.filter((d: DbOrderRow) => (d.currency || 'NGN') === filters!.currency);
        }
        if (filters.vendor) r = r.filter((d: DbOrderRow) => d.card_merchant_id === filters!.vendor);
        if (filters.paymentProvider) r = r.filter((d: DbOrderRow) => rowMatchesPaymentProvider(d, filters!.paymentProvider!));
        if (filters.cardType) r = r.filter((d: DbOrderRow) => d.order_type === filters!.cardType);
        if (filters.creatorId) r = r.filter((d: DbOrderRow) => matchesSalesEmployee(d, filters!.creatorId!));
        if (filters.minProfit != null) r = r.filter((d: DbOrderRow) => (isUsdt ? (d.profit_usdt ?? 0) : (d.profit_ngn ?? 0)) >= filters!.minProfit!);
        if (filters.maxProfit != null) r = r.filter((d: DbOrderRow) => (isUsdt ? (d.profit_usdt ?? 0) : (d.profit_ngn ?? 0)) <= filters!.maxProfit!);
        if (filters.dateRange?.start) r = r.filter((d: DbOrderRow) => new Date(d.created_at!) >= filters!.dateRange!.start);
        if (filters.dateRange?.end) {
          const end = new Date(filters.dateRange.end);
          end.setHours(23, 59, 59, 999);
          r = r.filter((d: DbOrderRow) => new Date(d.created_at!) <= end);
        }
        if (filters.searchTerm?.trim()) {
          const t = filters.searchTerm!.toLowerCase();
          r = r.filter((d: DbOrderRow) =>
            String(d.phone_number || '').toLowerCase().includes(t) ||
            String(d.order_number || '').toLowerCase().includes(t) ||
            String(d.member_code_snapshot || '').toLowerCase().includes(t) ||
            String(d.remark || '').toLowerCase().includes(t)
          );
        }
      }
      return r;
    };
    const normalFiltered = applyFilters(ensureArray<DbOrderRow>(normalData), false);
    const usdtFiltered = applyFilters(ensureArray<DbOrderRow>(usdtData), true);
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
    [...normalFiltered, ...usdtFiltered].forEach((d: DbOrderRow) => {
      let p = String(d.phone_number || '').trim();
      if (!p && d.member_id) p = String(memberIdToPhone.get(d.member_id) || '').trim();
      if (p) allPhones.add(p);
    });
    return {
      totalProfit: normalProfit + usdtProfit,
      usdtProfit,
      totalCardValue: normalCardValue + usdtCardValue,
      tradingUsers: allPhones.size,
    };
  }

  // 租户员工或平台未选租户：使用 RPC 获取数据并计算
  const [normalData, usdtData, membersData] = await Promise.all([
    getMyTenantOrdersFull(),
    getMyTenantUsdtOrdersFull(),
    getMyTenantMembersFull(),
  ]);
  const memberIdToPhone = new Map<string, string>();
  ensureArray<MemberRow>(membersData).forEach((m: MemberRow) => {
    if (m.id && String(m.phone_number || '').trim()) memberIdToPhone.set(m.id, String(m.phone_number).trim());
  });
  const applyFilters = (raw: DbOrderRow[], isUsdt: boolean) => {
    let r: DbOrderRow[] = raw;
    if (filters) {
      if (filters.status && filters.status !== 'all') r = r.filter((d: DbOrderRow) => d.status === filters!.status);
      if (filters.currency && filters.currency !== 'all') {
        if (isUsdt) r = filters.currency === 'USDT' ? r : [];
        else r = r.filter((d: DbOrderRow) => (d.currency || 'NGN') === filters!.currency);
      }
      if (filters.vendor) r = r.filter((d: DbOrderRow) => d.card_merchant_id === filters!.vendor);
      if (filters.paymentProvider) r = r.filter((d: DbOrderRow) => rowMatchesPaymentProvider(d, filters!.paymentProvider!));
      if (filters.cardType) r = r.filter((d: DbOrderRow) => d.order_type === filters!.cardType);
      if (filters.creatorId) r = r.filter((d: DbOrderRow) => matchesSalesEmployee(d, filters!.creatorId!));
      if (filters.minProfit != null) r = r.filter((d: DbOrderRow) => (isUsdt ? (d.profit_usdt ?? 0) : (d.profit_ngn ?? 0)) >= filters!.minProfit!);
      if (filters.maxProfit != null) r = r.filter((d: DbOrderRow) => (isUsdt ? (d.profit_usdt ?? 0) : (d.profit_ngn ?? 0)) <= filters!.maxProfit!);
      if (filters.dateRange?.start) r = r.filter((d: DbOrderRow) => new Date(d.created_at!) >= filters!.dateRange!.start);
      if (filters.dateRange?.end) {
        const end = new Date(filters.dateRange.end);
        end.setHours(23, 59, 59, 999);
        r = r.filter((d: DbOrderRow) => new Date(d.created_at!) <= end);
      }
      if (filters.searchTerm?.trim()) {
        const t = filters.searchTerm!.toLowerCase();
        r = r.filter((d: DbOrderRow) =>
          String(d.phone_number || '').toLowerCase().includes(t) ||
          String(d.order_number || '').toLowerCase().includes(t) ||
          String(d.member_code_snapshot || '').toLowerCase().includes(t) ||
          String(d.remark || '').toLowerCase().includes(t)
        );
      }
    }
    return r;
  };
  const normalFiltered = applyFilters(ensureArray<DbOrderRow>(normalData), false);
  const usdtFiltered = applyFilters(ensureArray<DbOrderRow>(usdtData), true);
  const normalProfit = normalFiltered.reduce((s, d) => s + (Number(d.profit_ngn) || 0), 0);
  const usdtProfit = usdtFiltered.reduce((s, d) => s + (Number(d.profit_usdt) || 0), 0);
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
  const allPhones = new Set<string>();
  [...normalFiltered, ...usdtFiltered].forEach((d: DbOrderRow) => {
    let p = String(d.phone_number || '').trim();
    if (!p && d.member_id) p = String(memberIdToPhone.get(d.member_id) || '').trim();
    if (p) allPhones.add(p);
  });
  return {
    totalProfit: normalProfit + usdtProfit,
    usdtProfit,
    totalCardValue: normalCardValue + usdtCardValue,
    tradingUsers: allPhones.size,
  };
}
