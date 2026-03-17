// ============= Audit Records Hook - react-query Migration =============
// react-query 缓存确保页面切换不重复请求

import { useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useTenantView } from '@/contexts/TenantViewContext';
import { toast } from 'sonner';
import { logOperation } from '@/stores/auditLogStore';
import { Json } from '@/integrations/supabase/types';
import { calculateNormalOrderDerivedValues, calculateUsdtOrderDerivedValues } from '@/lib/orderCalculations';
import { syncMemberActivityOnOrderEdit } from '@/services/finance/balanceLogService';
import { notifyDataMutation } from '@/services/system/dataRefreshManager';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 需要解析为可读名称的字段（按表+字段）
const PROVIDER_FIELDS = new Set([
  'vendor_id', 'vendorId', 'payment_provider', 'payment_provider_id', 'paymentProvider', 'paymentProviderId',
  'payment_agent', 'paymentAgent',
]);
const VENDOR_FIELDS = new Set(['card_merchant_id', 'cardMerchantId', 'vendor']);
const CARD_FIELDS = new Set(['card_type', 'cardType', 'order_type', 'orderType']);
const EMPLOYEE_FIELDS = new Set([
  'sales_user_id', 'salesUserId', 'sales_person', 'salesPerson',
  'recorder_id', 'recorderId', 'creator_id', 'creatorId',
]);
const SOURCE_FIELDS = new Set(['source_id', 'sourceId']);
const GIFT_TYPE_FIELDS = new Set(['gift_type', 'giftType']);

export interface AuditRecord {
  id: string;
  target_table: string;
  target_id: string;
  action_type: string;
  old_data: Json | null;
  new_data: Json;
  submitter_id: string | null;
  reviewer_id: string | null;
  review_time: string | null;
  review_comment: string | null;
  status: string;
  created_at: string;
  submitter_name?: string;
  reviewer_name?: string;
}

export interface LegacyAuditItem {
  id: string;
  timestamp: string;
  operator: string;
  operatorId: string;
  module: string;
  field: string;
  fieldLabel: string;
  oldValue: string;
  newValue: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewer?: string;
  reviewTime?: string;
  rejectReason?: string;
  targetId: string;
  targetDescription?: string;
  /** 可读的目标标识：订单管理=订单号，会员管理=手机号，活动赠送=赠送编号 */
  targetDisplayId?: string;
  originalData?: any;
}

const TABLE_TO_MODULE: Record<string, string> = {
  orders: '订单管理',
  members: '会员管理',
  activity: '活动赠送',
  activity_gifts: '活动赠送',
};

const FIELD_LABELS: Record<string, Record<string, string>> = {
  orders: {
    phone_number: '电话号码', member_code: '会员编号', card_value: '卡片价值',
    actual_payment: '实付金额', exchange_rate: '外币汇率', foreign_rate: '外币汇率',
    card_type: '卡片类型', order_type: '卡片类型', vendor: '卡商', vendor_id: '代付商家',
    card_merchant_id: '卡商', payment_provider: '代付商家', payment_provider_id: '代付商家',
    fee: '手续费', currency: '币种', remark: '备注', sales_person: '业务员',
    sales_user_id: '业务员', cancel_button: '取消按钮', delete_button: '删除按钮',
  },
  members: {
    phone_number: '电话号码', member_code: '会员编号', member_level: '会员等级',
    remark: '备注', common_cards: '常交易卡', currency_preferences: '币种偏好',
    bank_card: '银行卡', customer_feature: '客户特点', source: '客户来源',
    source_id: '客户来源', referrer: '推荐人', recorder: '记录人',
    recorder_id: '记录人', points: '积分', delete_button: '删除按钮',
  },
  activity: {
    currency: '币种', amount: '金额', rate: '汇率', phone_number: '电话号码',
    payment_agent: '代付商家', gift_type: '类型', remark: '备注', delete_button: '删除按钮',
  },
  activity_gifts: {
    currency: '币种', amount: '金额', rate: '汇率', phone_number: '电话号码',
    payment_agent: '代付商家', gift_type: '类型', remark: '备注', delete_button: '删除按钮',
  },
};

function formatValue(value: any): string {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

interface ResolveMaps {
  providerMap: Record<string, string>;
  vendorMap: Record<string, string>;
  cardMap: Record<string, string>;
  sourceMap: Record<string, string>;
  activityTypeMap: Record<string, string>;
}

function resolveAuditValue(
  fieldKey: string,
  rawValue: any,
  maps: ResolveMaps,
  employeeMap: Record<string, string>
): string {
  const strVal = formatValue(rawValue);
  if (!strVal) return strVal;
  if (!UUID_REGEX.test(strVal)) return strVal;

  if (PROVIDER_FIELDS.has(fieldKey) && maps.providerMap[strVal]) {
    return maps.providerMap[strVal];
  }
  if (VENDOR_FIELDS.has(fieldKey) && maps.vendorMap[strVal]) {
    return maps.vendorMap[strVal];
  }
  if (CARD_FIELDS.has(fieldKey) && maps.cardMap[strVal]) {
    return maps.cardMap[strVal];
  }
  if (EMPLOYEE_FIELDS.has(fieldKey) && employeeMap[strVal]) {
    return employeeMap[strVal];
  }
  if (SOURCE_FIELDS.has(fieldKey) && maps.sourceMap[strVal]) {
    return maps.sourceMap[strVal];
  }
  if (GIFT_TYPE_FIELDS.has(fieldKey) && maps.activityTypeMap[strVal]) {
    return maps.activityTypeMap[strVal];
  }
  return strVal;
}

function convertToLegacyItem(
  record: AuditRecord,
  maps: ResolveMaps,
  employeeMap: Record<string, string>,
  targetDisplayIdMap: Record<string, string>
): LegacyAuditItem {
  const module = TABLE_TO_MODULE[record.target_table] || record.target_table;
  const fieldLabels = FIELD_LABELS[record.target_table] || {};
  const newData = record.new_data as Record<string, any> || {};
  const oldData = record.old_data as Record<string, any> || {};
  const changedFields = Object.keys(newData);
  const fieldKey = changedFields[0] || 'unknown';
  const fieldLabel = fieldLabels[fieldKey] || fieldKey;
  const rawOld = oldData[fieldKey];
  const rawNew = newData[fieldKey];
  const oldValue = resolveAuditValue(fieldKey, rawOld, maps, employeeMap) || formatValue(rawOld) || '-';
  const newValue = resolveAuditValue(fieldKey, rawNew, maps, employeeMap) || formatValue(rawNew);

  return {
    id: record.id,
    timestamp: record.created_at,
    operator: record.submitter_name || '未知',
    operatorId: record.submitter_id || '',
    module,
    field: fieldLabel,
    fieldLabel,
    oldValue,
    newValue,
    status: record.status as 'pending' | 'approved' | 'rejected',
    reviewer: record.reviewer_name,
    reviewTime: record.review_time || undefined,
    rejectReason: record.review_comment || undefined,
    targetId: record.target_id,
    targetDisplayId: targetDisplayIdMap[record.target_id],
    originalData: { id: record.target_id, ...oldData },
  };
}

export interface AuditRecordsFetchParams {
  page?: number;
  pageSize?: number;
  status?: 'pending' | 'approved' | 'rejected';
  dateFrom?: string;
  dateTo?: string;
}

// Standalone fetch function - 服务端分页，每页 50 条
async function fetchAuditRecordsFromDb(params?: AuditRecordsFetchParams, tenantId?: string | null): Promise<{
  records: AuditRecord[];
  legacyItems: LegacyAuditItem[];
  totalCount: number;
}> {
  const { getAuditRecordsApi } = await import('@/api/data');
  const result = await getAuditRecordsApi({
    page: params?.page,
    pageSize: params?.pageSize,
    status: params?.status,
    dateFrom: params?.dateFrom,
    dateTo: params?.dateTo,
    tenantId,
  });
  const enrichedRecords: AuditRecord[] = (result.records || []) as AuditRecord[];

  // 收集需要解析的 UUID，批量查询可读名称
  const providerIds = new Set<string>();
  const vendorIds = new Set<string>();
  const cardIds = new Set<string>();
  const sourceIds = new Set<string>();
  const activityTypeIds = new Set<string>();

  for (const record of enrichedRecords) {
    const newData = record.new_data as Record<string, any> || {};
    const oldData = record.old_data as Record<string, any> || {};
    const changedFields = Object.keys(newData);
    const fieldKey = changedFields[0] || '';
    const extractUuid = (v: any) => {
      const s = String(v ?? '');
      return UUID_REGEX.test(s) ? s : null;
    };
    const oldUuid = extractUuid(oldData[fieldKey]);
    const newUuid = extractUuid(newData[fieldKey]);

    if (PROVIDER_FIELDS.has(fieldKey)) {
      if (oldUuid) providerIds.add(oldUuid);
      if (newUuid) providerIds.add(newUuid);
    } else if (VENDOR_FIELDS.has(fieldKey)) {
      if (oldUuid) vendorIds.add(oldUuid);
      if (newUuid) vendorIds.add(newUuid);
    } else if (CARD_FIELDS.has(fieldKey)) {
      if (oldUuid) cardIds.add(oldUuid);
      if (newUuid) cardIds.add(newUuid);
    } else if (SOURCE_FIELDS.has(fieldKey)) {
      if (oldUuid) sourceIds.add(oldUuid);
      if (newUuid) sourceIds.add(newUuid);
    } else if (GIFT_TYPE_FIELDS.has(fieldKey)) {
      if (oldUuid) activityTypeIds.add(oldUuid);
      if (newUuid) activityTypeIds.add(newUuid);
    }
  }

  let providerMap: Record<string, string> = {};
  let vendorMap: Record<string, string> = {};
  let cardMap: Record<string, string> = {};
  let sourceMap: Record<string, string> = {};
  let activityTypeMap: Record<string, string> = {};

  const needProviderMap = providerIds.size > 0;
  const needVendorMap = vendorIds.size > 0;
  const needCardMap = cardIds.size > 0;
  const needSourceMap = sourceIds.size > 0;
  const needActivityTypeMap = activityTypeIds.size > 0;

  const [
    providers,
    vendors,
    cards,
    sources,
    activityTypes,
  ] = await Promise.all([
    needProviderMap ? import('@/services/giftcards/giftcardsApiService').then((m) => m.listPaymentProvidersApi()) : Promise.resolve([]),
    needVendorMap ? import('@/services/giftcards/giftcardsApiService').then((m) => m.listVendorsApi()) : Promise.resolve([]),
    needCardMap ? import('@/services/giftcards/giftcardsApiService').then((m) => m.listCardsApi()) : Promise.resolve([]),
    needSourceMap ? import('@/api/data').then((m) => m.getCustomerSourcesApi()) : Promise.resolve([]),
    needActivityTypeMap ? import('@/api/data').then((m) => m.getActivityTypesApi()) : Promise.resolve([]),
  ]);

  if (providers.length > 0) {
    providerMap = Object.fromEntries(providers.map((p) => [p.id, p.name]));
  }
  if (vendors.length > 0) {
    vendorMap = Object.fromEntries(vendors.map((v) => [v.id, v.name]));
  }
  if (cards.length > 0) {
    cardMap = Object.fromEntries(cards.map((c) => [c.id, c.name]));
  }
  if (sources.length > 0) {
    sourceMap = Object.fromEntries(sources.map((s) => [s.id, s.name]));
  }
  if (activityTypes.length > 0) {
    activityTypeMap = Object.fromEntries(activityTypes.map((t) => [t.id, t.label]));
  }

  const resolveMaps: ResolveMaps = { providerMap, vendorMap, cardMap, sourceMap, activityTypeMap };
  const employeeMap: Record<string, string> = {};
  enrichedRecords.forEach((record) => {
    if (record.submitter_id && record.submitter_name) employeeMap[record.submitter_id] = record.submitter_name;
    if (record.reviewer_id && record.reviewer_name) employeeMap[record.reviewer_id] = record.reviewer_name;
  });

  // 批量获取目标可读标识：订单号、会员手机、赠送编号
  const targetDisplayIdMap: Record<string, string> = {};
  const orderIds = enrichedRecords.filter(r => r.target_table === 'orders').map(r => r.target_id);
  const memberIds = enrichedRecords.filter(r => r.target_table === 'members').map(r => r.target_id);
  const giftIds = enrichedRecords.filter(r => r.target_table === 'activity_gifts' || r.target_table === 'activity').map(r => r.target_id);

  const needOrders = orderIds.length > 0;
  const needMembers = memberIds.length > 0;
  const needGifts = giftIds.length > 0;

  const [orders, usdtOrders, members, activityData] = await Promise.all([
    needOrders ? import('@/services/orders/ordersApiService').then((m) => m.getOrdersFullApi(tenantId || undefined)) : Promise.resolve([]),
    needOrders ? import('@/services/orders/ordersApiService').then((m) => m.getUsdtOrdersFullApi(tenantId || undefined)) : Promise.resolve([]),
    needMembers ? import('@/services/members/membersApiService').then((m) => m.listMembersApi({ tenant_id: tenantId || undefined, page: 1, limit: 10000 })) : Promise.resolve([]),
    needGifts ? import('@/api/data').then((m) => m.getActivityDataApi(tenantId || undefined)) : Promise.resolve({ gifts: [] as any[] }),
  ]);

  [...orders, ...usdtOrders].forEach((order) => {
    const row = order as { id: string; order_number?: string };
    targetDisplayIdMap[row.id] = row.order_number || row.id;
  });
  members.forEach((member) => {
    const row = member as { id: string; phone_number?: string; member_code?: string };
    targetDisplayIdMap[row.id] = row.phone_number || row.member_code || row.id;
  });
  (activityData.gifts || []).forEach((gift) => {
    const row = gift as { id: string; gift_number?: string | null };
    targetDisplayIdMap[row.id] = row.gift_number || `${row.id.substring(0, 8)}...`;
  });
  [...new Set(giftIds)].forEach((id) => {
    if (!targetDisplayIdMap[id]) targetDisplayIdMap[id] = `${id.substring(0, 8)}...`;
  });

  return {
    records: enrichedRecords,
    legacyItems: enrichedRecords.map(r => convertToLegacyItem(r, resolveMaps, employeeMap, targetDisplayIdMap)),
    totalCount: result.totalCount ?? 0,
  };
}

async function fetchPendingAuditCount(tenantId?: string | null): Promise<number> {
  try {
    const { getPendingAuditCountApi } = await import('@/api/data');
    return await getPendingAuditCountApi(tenantId);
  } catch {
    return 0;
  }
}

export function useAuditRecords(params?: AuditRecordsFetchParams) {
  const { employee } = useAuth();
  const { viewingTenantId } = useTenantView() || {};
  const queryClient = useQueryClient();
  const effectiveTenantId = employee?.is_platform_super_admin
    ? (viewingTenantId || null)
    : (viewingTenantId || employee?.tenant_id || null);

  const { data, isLoading: loading } = useQuery({
    queryKey: ['audit-records', effectiveTenantId ?? '', params?.page, params?.pageSize, params?.status, params?.dateFrom, params?.dateTo],
    queryFn: () => fetchAuditRecordsFromDb(params, effectiveTenantId),
    enabled: !!employee,
  });

  const records = data?.records ?? [];
  const legacyItems = data?.legacyItems ?? [];
  const totalCount = data?.totalCount ?? 0;

  const { data: pendingCountData } = useQuery({
    queryKey: ['audit-pending-count', effectiveTenantId ?? ''],
    queryFn: () => fetchPendingAuditCount(effectiveTenantId),
    enabled: !!employee,
  });
  const pendingCount = pendingCountData ?? 0;

  // Realtime subscription -> invalidate cache
  useEffect(() => {
    if (!employee) return;

    const channel = supabase
      .channel('audit-records-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'audit_records' }, () => {
        queryClient.invalidateQueries({ queryKey: ['audit-records'] });
        queryClient.invalidateQueries({ queryKey: ['audit-pending-count'] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [employee, queryClient]);

  const approveRecord = useCallback(async (recordId: string): Promise<boolean> => {
    if (!employee) return false;

    try {
      const { data: record, error: fetchError } = await supabase
        .from('audit_records')
        .select('*')
        .eq('id', recordId)
        .single();

      if (fetchError || !record) {
        toast.error('找不到审核记录');
        return false;
      }

      // 并发校验：仅允许审批仍为 pending 的记录，避免重复审批
      if (record.status !== 'pending') {
        toast.error('该记录已被处理，无法重复审批');
        return false;
      }

      const rawNewData = record.new_data as Record<string, any>;
      const targetTable = record.target_table;
      const targetId = record.target_id;
      let orderSyncParams: { memberId: string; phoneNumber: string; oldActualPaid: number; oldProfit: number; oldCurrency: string; newActualPaid: number; newProfit: number; newCurrency: string } | null = null;

      // 订单表字段映射：审核记录用 payment_provider/vendor，数据库用 vendor_id/card_merchant_id
      const ORDER_FIELD_MAP: Record<string, string> = {
        payment_provider: 'vendor_id',
        payment_provider_id: 'vendor_id',
        vendor: 'card_merchant_id',
        sales_person: 'sales_user_id',
        feeUsdt: 'fee',
        actualPaidUsdt: 'actual_payment',
      };
      const newData: Record<string, any> = {};
      for (const [k, v] of Object.entries(rawNewData)) {
        const dbKey = targetTable === 'orders' && ORDER_FIELD_MAP[k] ? ORDER_FIELD_MAP[k] : k;
        newData[dbKey] = v;
      }

      if (targetTable === 'orders') {
        const profitFields = ['fee', 'actual_payment', 'card_value', 'exchange_rate', 'foreign_rate', 'amount'];
        const profitFieldKeys = ['fee', 'feeUsdt', 'actual_payment', 'actualPaidUsdt', 'card_value', 'exchange_rate', 'foreign_rate', 'amount'];
        const affectsProfit = Object.keys(newData).some(k => profitFieldKeys.includes(k));
        if (affectsProfit) {
          const { data: currentOrder, error: fetchErr } = await supabase
            .from('orders')
            .select('*')
            .eq('id', targetId)
            .single();
          if (!fetchErr && currentOrder) {
            const merged = { ...currentOrder, ...newData };
            const currency = (merged.currency || 'NGN').toUpperCase();
            if (currency === 'USDT') {
              const derived = calculateUsdtOrderDerivedValues({
                cardValue: Number(merged.card_value) || 0,
                cardRate: Number(merged.exchange_rate) || 1,
                usdtRate: Number(merged.foreign_rate) || 1,
                actualPaidUsdt: Number(merged.actual_payment) || 0,
                feeUsdt: Number(merged.fee) || 0,
              });
              newData.profit_usdt = derived.profit;
              newData.profit_rate = derived.profitRate;
              newData.payment_value = derived.paymentValue;
              newData.amount = derived.cardWorth;
            } else {
              const derived = calculateNormalOrderDerivedValues({
                cardValue: Number(merged.card_value) || 0,
                cardRate: Number(merged.exchange_rate) || 1,
                actualPaid: Number(merged.actual_payment) || 0,
                foreignRate: Number(merged.foreign_rate) || 1,
                fee: Number(merged.fee) || 0,
                currency,
              });
              newData.profit_ngn = derived.profit;
              newData.profit_rate = derived.profitRate;
              newData.payment_value = derived.paymentValue;
              newData.amount = derived.cardWorth;
            }
            const oldCur = (currentOrder.currency || 'NGN').toUpperCase();
            const newCur = currency;
            const oldProfit = oldCur === 'USDT' ? (Number(currentOrder.profit_usdt) || 0) : (Number(currentOrder.profit_ngn) || 0);
            const newProfit = newCur === 'USDT' ? (Number(newData.profit_usdt) ?? 0) : (Number(newData.profit_ngn) ?? 0);
            if ((currentOrder.member_id || currentOrder.phone_number) && (Math.abs(newProfit - oldProfit) > 0.01 || Math.abs(Number(merged.actual_payment) - Number(currentOrder.actual_payment)) > 0.01)) {
              orderSyncParams = {
                memberId: currentOrder.member_id || '',
                phoneNumber: currentOrder.phone_number || '',
                oldActualPaid: Number(currentOrder.actual_payment) || 0,
                oldProfit,
                oldCurrency: oldCur,
                newActualPaid: Number(merged.actual_payment) || 0,
                newProfit,
                newCurrency: newCur,
              };
            }
          }
        }
      }

      const { error: updateError } = await supabase
        .from(targetTable as any)
        .update(newData)
        .eq('id', targetId);

      if (updateError) {
        console.error('Failed to apply audit change:', updateError);
        toast.error('应用修改失败');
        return false;
      }

      const { data: updatedRows, error: auditError } = await supabase
        .from('audit_records')
        .update({
          status: 'approved',
          reviewer_id: employee.id,
          review_time: new Date().toISOString(),
        })
        .eq('id', recordId)
        .eq('status', 'pending')
        .select('id');

      if (auditError) {
        console.error('Failed to update audit record:', auditError);
        toast.error('更新审核状态失败');
        return false;
      }

      if (!updatedRows || updatedRows.length === 0) {
        toast.error('该记录已被他人处理，请刷新后重试');
        await queryClient.invalidateQueries({ queryKey: ['audit-records'] });
        await queryClient.invalidateQueries({ queryKey: ['audit-pending-count'] });
        return false;
      }

      logOperation(
        'audit_center', 'audit', recordId,
        { status: 'pending' },
        { status: 'approved', ...newData },
        `审核通过: ${TABLE_TO_MODULE[targetTable] || targetTable}`
      );

      window.dispatchEvent(new CustomEvent(`${targetTable}-updated`));
      await queryClient.invalidateQueries({ queryKey: ['audit-records'] });
      await queryClient.invalidateQueries({ queryKey: ['audit-pending-count'] });
      if (targetTable === 'orders') {
        queryClient.invalidateQueries({ queryKey: ['dashboard-trend'] });
        queryClient.invalidateQueries({ queryKey: ['orders'] });
        queryClient.invalidateQueries({ queryKey: ['usdt-orders'] });
        queryClient.invalidateQueries({ queryKey: ['profit-compare-current'] });
        queryClient.invalidateQueries({ queryKey: ['profit-compare-previous'] });
        notifyDataMutation({ table: 'orders', operation: 'UPDATE', source: 'manual' }).catch(console.error);
        if (orderSyncParams) {
          try {
            await syncMemberActivityOnOrderEdit(orderSyncParams);
          } catch (err) {
            console.error('[Audit] Member activity sync failed:', err);
          }
        }
      }
      toast.success('审核通过，修改已生效');
      return true;
    } catch (err) {
      console.error('Error approving record:', err);
      toast.error('处理失败');
      return false;
    }
  }, [employee, queryClient]);

  const rejectRecord = useCallback(async (recordId: string, reason: string): Promise<boolean> => {
    if (!employee) return false;

    try {
      const { data: updatedRows, error } = await supabase
        .from('audit_records')
        .update({
          status: 'rejected',
          reviewer_id: employee.id,
          review_time: new Date().toISOString(),
          review_comment: reason,
        })
        .eq('id', recordId)
        .eq('status', 'pending')
        .select('id');

      if (error) {
        console.error('Failed to reject audit record:', error);
        toast.error('拒绝审核失败');
        return false;
      }

      if (!updatedRows || updatedRows.length === 0) {
        toast.error('该记录已被他人处理，请刷新后重试');
        await queryClient.invalidateQueries({ queryKey: ['audit-records'] });
        await queryClient.invalidateQueries({ queryKey: ['audit-pending-count'] });
        return false;
      }

      logOperation('audit_center', 'reject', recordId, { status: 'pending' }, { status: 'rejected', reason }, `审核拒绝`);
      await queryClient.invalidateQueries({ queryKey: ['audit-records'] });
      await queryClient.invalidateQueries({ queryKey: ['audit-pending-count'] });
      toast.success('已拒绝');
      return true;
    } catch (err) {
      console.error('Error rejecting record:', err);
      toast.error('处理失败');
      return false;
    }
  }, [employee, queryClient]);

  return {
    records,
    legacyItems,
    totalCount,
    pendingCount,
    loading,
    refetch: () => {
      queryClient.invalidateQueries({ queryKey: ['audit-records'] });
      queryClient.invalidateQueries({ queryKey: ['audit-pending-count'] });
    },
    approveRecord,
    rejectRecord,
    isAdmin: employee?.role === 'admin',
  };
}
