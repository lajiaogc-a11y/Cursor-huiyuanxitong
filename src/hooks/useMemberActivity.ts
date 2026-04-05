// ============= Member Activity Hook - 活动数据永久累积管理 =============
// 管理 member_activity 表的永久累积字段

import { apiGet, apiPost, apiPatch } from '@/api/client';
import { logger } from '@/lib/logger';

async function applyActivityDeltasViaRpc(
  memberId: string,
  phoneNumber: string,
  deltas: Record<string, number>,
): Promise<boolean> {
  try {
    const res = await apiPost<{ success?: boolean }>('/api/data/rpc/member_activity_apply_deltas', {
      p_member_id: memberId,
      p_phone: phoneNumber,
      ...Object.fromEntries(Object.entries(deltas).map(([k, v]) => [`p_${k}`, v])),
    });
    return res?.success !== false;
  } catch (error) {
    logger.error('[applyActivityDeltasViaRpc] Failed:', error);
    return false;
  }
}

function unwrapSingle<T>(data: unknown): T | null {
  if (data == null) return null;
  if (Array.isArray(data)) return (data[0] as T) ?? null;
  return data as T;
}

export interface MemberActivityData {
  id: string;
  member_id: string;
  phone_number: string;
  accumulated_points: number;
  remaining_points: number;
  referral_count: number;
  referral_points: number;
  last_reset_time: string | null;
  // 永久累积字段
  total_accumulated_ngn: number;
  total_accumulated_ghs: number;
  total_accumulated_usdt: number;
  total_gift_ngn: number;
  total_gift_ghs: number;
  total_gift_usdt: number;
  accumulated_profit: number; // 累积利润（人民币，来自NGN/GHS订单）
  accumulated_profit_usdt: number; // 累积利润（USDT，来自USDT订单）
  order_count: number; // 订单累积次数（永久存储，订单删除后不减少）
}

// 获取或创建会员活动记录
export async function getOrCreateMemberActivity(
  memberId: string,
  phoneNumber: string
): Promise<MemberActivityData | null> {
  try {
    const existing = await apiGet<MemberActivityData | null>(
      `/api/data/table/member_activity?select=*&member_id=eq.${encodeURIComponent(memberId)}&single=true`
    );

    if (existing) {
      return existing;
    }

    const createdRaw = await apiPost<unknown>(`/api/data/table/member_activity`, {
      data: {
        member_id: memberId,
        phone_number: phoneNumber,
        accumulated_points: 0,
        remaining_points: 0,
        referral_count: 0,
        referral_points: 0,
        total_accumulated_ngn: 0,
        total_accumulated_ghs: 0,
        total_accumulated_usdt: 0,
        total_gift_ngn: 0,
        total_gift_ghs: 0,
        total_gift_usdt: 0,
        order_count: 0,
      },
    });
    const created = unwrapSingle<MemberActivityData>(createdRaw);
    if (!created) {
      logger.error('Failed to create member activity');
      return null;
    }

    return created;
  } catch (error) {
    logger.error('Error in getOrCreateMemberActivity:', error);
    return null;
  }
}

// 按电话号码获取会员活动记录
export async function getMemberActivityByPhone(
  phoneNumber: string
): Promise<MemberActivityData | null> {
  try {
    return await apiGet<MemberActivityData | null>(
      `/api/data/table/member_activity?select=*&phone_number=eq.${encodeURIComponent(phoneNumber)}&single=true`
    );
  } catch (error) {
    logger.error('Error in getMemberActivityByPhone:', error);
    return null;
  }
}

// 累加累积金额（订单创建时调用） — H3 fix: atomic delta via server-side UPSERT
export async function addAccumulatedAmount(
  memberId: string,
  phoneNumber: string,
  currency: 'NGN' | 'GHS' | 'USDT',
  amount: number
): Promise<boolean> {
  const deltas: Record<string, number> = {};
  if (currency === 'NGN') deltas.total_accumulated_ngn = amount;
  else if (currency === 'GHS') deltas.total_accumulated_ghs = amount;
  else if (currency === 'USDT') deltas.total_accumulated_usdt = amount;
  const ok = await applyActivityDeltasViaRpc(memberId, phoneNumber, deltas);
  if (ok) logger.log(`[MemberActivity] Added ${amount} ${currency} to member ${memberId}`);
  return ok;
}

// 累加赠送金额（兑换时调用） — H3 fix: atomic delta via server-side UPSERT
export async function addGiftAmount(
  memberId: string,
  phoneNumber: string,
  currency: 'NGN' | 'GHS' | 'USDT',
  amount: number
): Promise<boolean> {
  const deltas: Record<string, number> = {};
  if (currency === 'NGN') deltas.total_gift_ngn = amount;
  else if (currency === 'GHS') deltas.total_gift_ghs = amount;
  else if (currency === 'USDT') deltas.total_gift_usdt = amount;
  const ok = await applyActivityDeltasViaRpc(memberId, phoneNumber, deltas);
  if (ok) logger.log(`[MemberActivity] Added gift ${amount} ${currency} to member ${memberId}`);
  return ok;
}

// 更新累积利润（订单创建时调用） — H3 fix: atomic delta via server-side UPSERT
export async function addAccumulatedProfit(
  memberId: string,
  phoneNumber: string,
  profitAmount: number,
  currency?: 'NGN' | 'GHS' | 'USDT'
): Promise<boolean> {
  const deltas: Record<string, number> = {};
  if (currency === 'USDT') {
    deltas.accumulated_profit_usdt = profitAmount;
  } else {
    deltas.accumulated_profit = profitAmount;
  }
  const ok = await applyActivityDeltasViaRpc(memberId, phoneNumber, deltas);
  if (ok) logger.log(`[MemberActivity] Added ${currency === 'USDT' ? 'USDT' : 'RMB'} profit ${profitAmount} to member ${memberId}`);
  return ok;
}

// 减少累积利润（活动赠送兑换时调用） — H3 fix: atomic delta via server-side UPSERT
export async function deductAccumulatedProfit(
  memberId: string,
  phoneNumber: string,
  giftAmount: number,
  currency?: 'NGN' | 'GHS' | 'USDT'
): Promise<boolean> {
  const deltas: Record<string, number> = {};
  if (currency === 'USDT') {
    deltas.accumulated_profit_usdt = -giftAmount;
  } else {
    deltas.accumulated_profit = -giftAmount;
  }
  const ok = await applyActivityDeltasViaRpc(memberId, phoneNumber, deltas);
  if (ok) logger.log(`[MemberActivity] Deducted ${currency === 'USDT' ? 'USDT' : 'RMB'} gift ${giftAmount} from member ${memberId}`);
  return ok;
}

// 获取会员的永久累积数据
export async function getPermanentActivityData(
  memberId: string
): Promise<{
  accumulatedNgn: number;
  accumulatedGhs: number;
  accumulatedUsdt: number;
  giftNgn: number;
  giftGhs: number;
  giftUsdt: number;
  accumulatedProfit: number;
  accumulatedProfitUsdt: number;
} | null> {
  try {
    const data = await apiGet<Record<string, number | null | undefined> | null>(
      `/api/data/table/member_activity?select=total_accumulated_ngn,total_accumulated_ghs,total_accumulated_usdt,total_gift_ngn,total_gift_ghs,total_gift_usdt,accumulated_profit,accumulated_profit_usdt&member_id=eq.${encodeURIComponent(memberId)}&single=true`
    );

    if (!data) {
      return null;
    }

    return {
      accumulatedNgn: Number(data.total_accumulated_ngn) || 0,
      accumulatedGhs: Number(data.total_accumulated_ghs) || 0,
      accumulatedUsdt: Number(data.total_accumulated_usdt) || 0,
      giftNgn: Number(data.total_gift_ngn) || 0,
      giftGhs: Number(data.total_gift_ghs) || 0,
      giftUsdt: Number(data.total_gift_usdt) || 0,
      accumulatedProfit: Number(data.accumulated_profit) || 0,
      accumulatedProfitUsdt: Number(data.accumulated_profit_usdt) || 0,
    };
  } catch (error) {
    logger.error('Error in getPermanentActivityData:', error);
    return null;
  }
}

// ============= 🚀 批量更新优化：合并多个更新为单次数据库调用 =============

export interface BatchUpdateParams {
  memberId: string;
  phoneNumber: string;
  // 累积金额（可选）
  accumulatedAmount?: {
    currency: 'NGN' | 'GHS' | 'USDT';
    amount: number;
  };
  // 累积利润（可选） - 币种来自 accumulatedAmount.currency
  profitAmount?: number;
  // 利润币种（可选，用于区分人民币和USDT利润）
  profitCurrency?: 'NGN' | 'GHS' | 'USDT';
  // 是否增加订单计数（可选）
  incrementOrderCount?: boolean;
}

/**
 * 批量更新会员活动数据 — H3 fix: atomic delta via server-side UPSERT
 * The server uses INSERT ... ON DUPLICATE KEY UPDATE for race-safe updates.
 */
export async function batchUpdateMemberActivity(params: BatchUpdateParams): Promise<boolean> {
  const { memberId, phoneNumber, accumulatedAmount, profitAmount, profitCurrency, incrementOrderCount } = params;

  if (!accumulatedAmount && profitAmount === undefined && !incrementOrderCount) {
    return true;
  }

  const deltas: Record<string, number> = {};

  if (accumulatedAmount) {
    const { currency, amount } = accumulatedAmount;
    if (currency === 'NGN') deltas.total_accumulated_ngn = amount;
    else if (currency === 'GHS') deltas.total_accumulated_ghs = amount;
    else if (currency === 'USDT') deltas.total_accumulated_usdt = amount;
  }

  if (profitAmount !== undefined && profitAmount !== 0) {
    const currency = profitCurrency || accumulatedAmount?.currency;
    if (currency === 'USDT') {
      deltas.accumulated_profit_usdt = profitAmount;
    } else {
      deltas.accumulated_profit = profitAmount;
    }
  }

  if (incrementOrderCount) {
    deltas.order_count = 1;
  }

  return applyActivityDeltasViaRpc(memberId, phoneNumber, deltas);
}

/**
 * 🚀 Fire-and-Forget 版本：不阻塞调用方
 * 在后台执行批量更新，错误只记录日志
 */
export function batchUpdateMemberActivityAsync(params: BatchUpdateParams): void {
  setTimeout(() => {
    batchUpdateMemberActivity(params).catch(err => {
      logger.error('[MemberActivity] Async batch update failed:', err);
    });
  }, 0);
}
