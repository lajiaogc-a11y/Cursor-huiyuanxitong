/**
 * Balance Log Reconcile Service
 * 修复「订单归属变更/错误」导致的余额日志落错商家问题。
 *
 * 场景：订单创建时写入了 order_expense/order_income 日志，但后续订单的商家字段被修改，
 * 日志由于不可 UPDATE 而仍停留在旧商家名下，导致某个商家“多余日志”，另一个商家“缺失日志”，
 * 进而造成「变动后余额（最新）」与「实时余额」不一致。
 */

import { supabase } from '@/integrations/supabase/client';
import { safeNumber, safeMultiply } from '@/lib/safeCalc';
import { calculatePaymentValue } from '@/lib/orderCalculations';

const PAGE_SIZE = 1000;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function fetchAll<T>(pageFn: (from: number, to: number) => Promise<{ data: T[] | null; error: any }>): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await pageFn(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const page = data ?? [];
    all.push(...page);
    if (page.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return all;
}

export interface MisattributedRepairResult {
  success: boolean;
  moved: number; // 迁移到正确商家并补写的数量
  deletedInvalid: number; // 对应订单无效（已删/非完成/无商家）的日志删除数量
  errors: string[];
}

function computeProviderOrderExpenseChangeAmount(params: {
  actualPayment: number | null;
  fee: number | null;
  currency: string | null;
  foreignRate: number | null;
}): { changeAmount: number; currency: string } {
  const currency = params.currency || 'NGN';
  const actualPaid = safeNumber(params.actualPayment);
  const fee = safeNumber(params.fee);
  const foreignRate = safeNumber(params.foreignRate, 1);

  // 与 src/services/balanceLogService.ts 保持一致：
  // - 非 USDT：paymentValue = calculatePaymentValue(actualPaid, foreignRate, fee, currency)
  // - USDT：paymentValue = actualPaidUsdt + feeUsdt
  //   providerExpense = paymentValue * usdtRate
  const paymentValue =
    currency === 'USDT'
      ? actualPaid + fee
      : calculatePaymentValue(actualPaid, foreignRate, fee, currency);

  const providerExpense = currency === 'USDT' ? safeMultiply(paymentValue, foreignRate) : paymentValue;

  return { changeAmount: -providerExpense, currency };
}

/**
 * 修复代付商家：order_expense 日志 merchant_name 与订单当前 vendor_id 不一致的问题。
 *
 * 仅处理“多余日志”的商家（merchantNames），避免全表扫描。
 */
export async function repairMisattributedProviderOrderExpenseLogs(params: {
  merchantNames: string[];
}): Promise<MisattributedRepairResult> {
  const merchantNames = (params.merchantNames || []).filter(Boolean);
  if (merchantNames.length === 0) return { success: true, moved: 0, deletedInvalid: 0, errors: [] };

  const errors: string[] = [];
  let moved = 0;
  let deletedInvalid = 0;

  for (const wrongProviderName of merchantNames) {
    try {
      const { data: wrongProvider, error: wrongProviderErr } = await supabase
        .from('payment_providers')
        .select('id, name')
        .eq('name', wrongProviderName)
        .limit(1)
        .maybeSingle();

      if (wrongProviderErr || !wrongProvider) {
        errors.push(`${wrongProviderName}: provider_not_found`);
        continue;
      }

      const orderRows = await fetchAll<{ order_number: string }>(async (from, to) =>
        supabase
          .from('orders')
          .select('order_number')
          .eq('status', 'completed')
          .eq('is_deleted', false)
          .eq('vendor_id', wrongProvider.id)
          .range(from, to)
      );

      const logRows = await fetchAll<{
        id: string;
        related_id: string | null;
        change_amount: number;
        created_at: string;
        remark: string | null;
      }>(async (from, to) =>
        supabase
          .from('balance_change_logs')
          .select('id, related_id, change_amount, created_at, remark')
          .eq('merchant_type', 'payment_provider')
          .eq('change_type', 'order_expense')
          .eq('merchant_name', wrongProviderName)
          .not('related_id', 'is', null)
          .range(from, to)
      );

      const orderSet = new Set(orderRows.map(r => r.order_number));
      const loggedSet = new Set(logRows.map(r => r.related_id!).filter(Boolean));

      const extraOrderNumbers = Array.from(loggedSet).filter(orderNo => !orderSet.has(orderNo));
      if (extraOrderNumbers.length === 0) continue;

      // 查这些订单当前归属
      const ordersByNumber: Record<string, any> = {};
      for (const group of chunk(extraOrderNumbers, 200)) {
        const { data, error } = await supabase
          .from('orders')
          .select('order_number, status, is_deleted, vendor_id, actual_payment, fee, currency, foreign_rate, created_at')
          .in('order_number', group);
        if (error) throw error;
        (data || []).forEach(o => {
          ordersByNumber[o.order_number] = o;
        });
      }

      const vendorIds = Array.from(
        new Set(
          extraOrderNumbers
            .map(o => ordersByNumber[o]?.vendor_id)
            .filter((v: any) => typeof v === 'string' && v.length > 0)
        )
      );

      const providerNameById = new Map<string, string>();
      for (const group of chunk(vendorIds, 200)) {
        const { data, error } = await supabase.from('payment_providers').select('id, name').in('id', group);
        if (error) throw error;
        (data || []).forEach(p => providerNameById.set(p.id, p.name));
      }

      // 这些订单是否已经在“正确商家”下存在日志（避免重复插入）
      const existingCorrectKey = new Set<string>();
      for (const group of chunk(extraOrderNumbers, 200)) {
        const { data, error } = await supabase
          .from('balance_change_logs')
          .select('related_id, merchant_name')
          .eq('merchant_type', 'payment_provider')
          .eq('change_type', 'order_expense')
          .in('related_id', group);
        if (error) throw error;
        (data || []).forEach(l => {
          if (l.related_id && l.merchant_name) existingCorrectKey.add(`${l.related_id}|||${l.merchant_name}`);
        });
      }

      // 先删错的，再补正确的
      const deleteIds: string[] = [];
      const inserts: any[] = [];

      for (const orderNumber of extraOrderNumbers) {
        const order = ordersByNumber[orderNumber];
        const wrongLogs = logRows.filter(l => l.related_id === orderNumber);
        wrongLogs.forEach(l => deleteIds.push(l.id));

        if (!order || order.status !== 'completed' || order.is_deleted) {
          deletedInvalid += wrongLogs.length;
          continue;
        }

        const correctProviderName = providerNameById.get(order.vendor_id);
        if (!correctProviderName) {
          deletedInvalid += wrongLogs.length;
          continue;
        }

        // 如果正确商家已经有该订单日志，只删错的，不再插入
        if (existingCorrectKey.has(`${orderNumber}|||${correctProviderName}`)) {
          continue;
        }

        const { changeAmount, currency } = computeProviderOrderExpenseChangeAmount({
          actualPayment: order.actual_payment,
          fee: order.fee,
          currency: order.currency,
          foreignRate: order.foreign_rate,
        });

        inserts.push({
          merchant_type: 'payment_provider',
          merchant_name: correctProviderName,
          change_type: 'order_expense',
          change_amount: changeAmount,
          balance_before: 0,
          balance_after: 0,
          related_id: orderNumber,
          remark: `订单支出: ${orderNumber} (${currency}) (归属修复)`,
          operator_name: '系统自动修复',
          created_at: order.created_at,
        });
        moved += 1;
      }

      for (const group of chunk(deleteIds, 200)) {
        const { error } = await supabase.from('balance_change_logs').delete().in('id', group);
        if (error) throw error;
      }

      for (const group of chunk(inserts, 200)) {
        const { error } = await supabase.from('balance_change_logs').insert(group);
        if (error) throw error;
      }
    } catch (e: any) {
      console.error('[Reconcile] Provider misattributed repair failed:', wrongProviderName, e);
      errors.push(`${wrongProviderName}: ${e?.message || String(e)}`);
    }
  }

  return { success: errors.length === 0, moved, deletedInvalid, errors };
}

/**
 * 修复卡商：order_income 日志 merchant_name 与订单当前 card_merchant_id 不一致的问题。
 *
 * 仅处理“多余日志”的商家（merchantNames），避免全表扫描。
 */
export async function repairMisattributedVendorOrderIncomeLogs(params: {
  merchantNames: string[];
}): Promise<MisattributedRepairResult> {
  const merchantNames = (params.merchantNames || []).filter(Boolean);
  if (merchantNames.length === 0) return { success: true, moved: 0, deletedInvalid: 0, errors: [] };

  const errors: string[] = [];
  let moved = 0;
  let deletedInvalid = 0;

  for (const wrongVendorName of merchantNames) {
    try {
      const { data: wrongVendor, error: wrongVendorErr } = await supabase
        .from('vendors')
        .select('id, name')
        .eq('name', wrongVendorName)
        .limit(1)
        .maybeSingle();

      if (wrongVendorErr || !wrongVendor) {
        errors.push(`${wrongVendorName}: vendor_not_found`);
        continue;
      }

      const orderRows = await fetchAll<{ order_number: string }>(async (from, to) =>
        supabase
          .from('orders')
          .select('order_number')
          .eq('status', 'completed')
          .eq('is_deleted', false)
          .eq('card_merchant_id', wrongVendor.id)
          .range(from, to)
      );

      const logRows = await fetchAll<{
        id: string;
        related_id: string | null;
        change_amount: number;
        created_at: string;
      }>(async (from, to) =>
        supabase
          .from('balance_change_logs')
          .select('id, related_id, change_amount, created_at')
          .eq('merchant_type', 'card_vendor')
          .eq('change_type', 'order_income')
          .eq('merchant_name', wrongVendorName)
          .not('related_id', 'is', null)
          .range(from, to)
      );

      const orderSet = new Set(orderRows.map(r => r.order_number));
      const loggedSet = new Set(logRows.map(r => r.related_id!).filter(Boolean));

      const extraOrderNumbers = Array.from(loggedSet).filter(orderNo => !orderSet.has(orderNo));
      if (extraOrderNumbers.length === 0) continue;

      const ordersByNumber: Record<string, any> = {};
      for (const group of chunk(extraOrderNumbers, 200)) {
        const { data, error } = await supabase
          .from('orders')
          .select('order_number, status, is_deleted, card_merchant_id, amount, created_at')
          .in('order_number', group);
        if (error) throw error;
        (data || []).forEach(o => {
          ordersByNumber[o.order_number] = o;
        });
      }

      const vendorIds = Array.from(
        new Set(
          extraOrderNumbers
            .map(o => ordersByNumber[o]?.card_merchant_id)
            .filter((v: any) => typeof v === 'string' && v.length > 0)
        )
      );

      const vendorNameById = new Map<string, string>();
      for (const group of chunk(vendorIds, 200)) {
        const { data, error } = await supabase.from('vendors').select('id, name').in('id', group);
        if (error) throw error;
        (data || []).forEach(v => vendorNameById.set(v.id, v.name));
      }

      const existingCorrectKey = new Set<string>();
      for (const group of chunk(extraOrderNumbers, 200)) {
        const { data, error } = await supabase
          .from('balance_change_logs')
          .select('related_id, merchant_name')
          .eq('merchant_type', 'card_vendor')
          .eq('change_type', 'order_income')
          .in('related_id', group);
        if (error) throw error;
        (data || []).forEach(l => {
          if (l.related_id && l.merchant_name) existingCorrectKey.add(`${l.related_id}|||${l.merchant_name}`);
        });
      }

      const deleteIds: string[] = [];
      const inserts: any[] = [];

      for (const orderNumber of extraOrderNumbers) {
        const order = ordersByNumber[orderNumber];
        const wrongLogs = logRows.filter(l => l.related_id === orderNumber);
        wrongLogs.forEach(l => deleteIds.push(l.id));

        if (!order || order.status !== 'completed' || order.is_deleted) {
          deletedInvalid += wrongLogs.length;
          continue;
        }

        const correctVendorName = vendorNameById.get(order.card_merchant_id);
        if (!correctVendorName) {
          deletedInvalid += wrongLogs.length;
          continue;
        }

        if (existingCorrectKey.has(`${orderNumber}|||${correctVendorName}`)) {
          continue;
        }

        inserts.push({
          merchant_type: 'card_vendor',
          merchant_name: correctVendorName,
          change_type: 'order_income',
          change_amount: safeNumber(order.amount),
          balance_before: 0,
          balance_after: 0,
          related_id: orderNumber,
          remark: `订单收入: ${orderNumber} (归属修复)`,
          operator_name: '系统自动修复',
          created_at: order.created_at,
        });
        moved += 1;
      }

      for (const group of chunk(deleteIds, 200)) {
        const { error } = await supabase.from('balance_change_logs').delete().in('id', group);
        if (error) throw error;
      }

      for (const group of chunk(inserts, 200)) {
        const { error } = await supabase.from('balance_change_logs').insert(group);
        if (error) throw error;
      }
    } catch (e: any) {
      console.error('[Reconcile] Vendor misattributed repair failed:', wrongVendorName, e);
      errors.push(`${wrongVendorName}: ${e?.message || String(e)}`);
    }
  }

  return { success: errors.length === 0, moved, deletedInvalid, errors };
}
