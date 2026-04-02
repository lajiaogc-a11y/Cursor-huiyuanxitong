// ============= Member Activity Hook - 活动数据永久累积管理 =============
// 管理 member_activity 表的永久累积字段

import { apiGet, apiPost, apiPatch } from '@/api/client';

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
      console.error('Failed to create member activity');
      return null;
    }

    return created;
  } catch (error) {
    console.error('Error in getOrCreateMemberActivity:', error);
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
    console.error('Error in getMemberActivityByPhone:', error);
    return null;
  }
}

// 累加累积金额（订单创建时调用）
export async function addAccumulatedAmount(
  memberId: string,
  phoneNumber: string,
  currency: 'NGN' | 'GHS' | 'USDT',
  amount: number
): Promise<boolean> {
  try {
    // 确保活动记录存在
    const activity = await getOrCreateMemberActivity(memberId, phoneNumber);
    if (!activity) {
      console.error('Failed to get/create member activity');
      return false;
    }

    // 根据币种累加
    const updateData: Record<string, number> = {};
    if (currency === 'NGN') {
      updateData.total_accumulated_ngn = (activity.total_accumulated_ngn || 0) + amount;
    } else if (currency === 'GHS') {
      updateData.total_accumulated_ghs = (activity.total_accumulated_ghs || 0) + amount;
    } else if (currency === 'USDT') {
      updateData.total_accumulated_usdt = (activity.total_accumulated_usdt || 0) + amount;
    }

    try {
      await apiPatch(`/api/data/table/member_activity?id=eq.${encodeURIComponent(activity.id)}`, {
        data: updateData,
      });
    } catch (error) {
      console.error('Failed to update accumulated amount:', error);
      return false;
    }

    console.log(`[MemberActivity] Added ${amount} ${currency} to member ${memberId}`);
    return true;
  } catch (error) {
    console.error('Error in addAccumulatedAmount:', error);
    return false;
  }
}

// 累加赠送金额（兑换时调用）
export async function addGiftAmount(
  memberId: string,
  phoneNumber: string,
  currency: 'NGN' | 'GHS' | 'USDT',
  amount: number
): Promise<boolean> {
  try {
    // 确保活动记录存在
    const activity = await getOrCreateMemberActivity(memberId, phoneNumber);
    if (!activity) {
      console.error('Failed to get/create member activity');
      return false;
    }

    // 根据币种累加赠送金额
    const updateData: Record<string, number> = {};
    if (currency === 'NGN') {
      updateData.total_gift_ngn = (activity.total_gift_ngn || 0) + amount;
    } else if (currency === 'GHS') {
      updateData.total_gift_ghs = (activity.total_gift_ghs || 0) + amount;
    } else if (currency === 'USDT') {
      updateData.total_gift_usdt = (activity.total_gift_usdt || 0) + amount;
    }

    try {
      await apiPatch(`/api/data/table/member_activity?id=eq.${encodeURIComponent(activity.id)}`, {
        data: updateData,
      });
    } catch (error) {
      console.error('Failed to update gift amount:', error);
      return false;
    }

    console.log(`[MemberActivity] Added gift ${amount} ${currency} to member ${memberId}`);
    return true;
  } catch (error) {
    console.error('Error in addGiftAmount:', error);
    return false;
  }
}

// 更新累积利润（订单创建时调用） - 按币种分流
export async function addAccumulatedProfit(
  memberId: string,
  phoneNumber: string,
  profitAmount: number,
  currency?: 'NGN' | 'GHS' | 'USDT'
): Promise<boolean> {
  try {
    // 确保活动记录存在
    const activity = await getOrCreateMemberActivity(memberId, phoneNumber);
    if (!activity) {
      console.error('Failed to get/create member activity');
      return false;
    }

    // 根据币种分流利润
    const updateData: Record<string, number> = {};
    if (currency === 'USDT') {
      // USDT 订单利润存入 accumulated_profit_usdt
      const newProfitUsdt = (activity.accumulated_profit_usdt || 0) + profitAmount;
      updateData.accumulated_profit_usdt = newProfitUsdt;
      console.log(`[MemberActivity] Added USDT profit ${profitAmount} to member ${memberId}, new total: ${newProfitUsdt}`);
    } else {
      // NGN/GHS 订单利润存入 accumulated_profit (RMB)
      const newProfit = (activity.accumulated_profit || 0) + profitAmount;
      updateData.accumulated_profit = newProfit;
      console.log(`[MemberActivity] Added RMB profit ${profitAmount} to member ${memberId}, new total: ${newProfit}`);
    }

    try {
      await apiPatch(`/api/data/table/member_activity?id=eq.${encodeURIComponent(activity.id)}`, {
        data: updateData,
      });
    } catch (error) {
      console.error('Failed to update accumulated profit:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in addAccumulatedProfit:', error);
    return false;
  }
}

// 减少累积利润（活动赠送兑换时调用） - 按币种分流
export async function deductAccumulatedProfit(
  memberId: string,
  phoneNumber: string,
  giftAmount: number,
  currency?: 'NGN' | 'GHS' | 'USDT'
): Promise<boolean> {
  try {
    // 确保活动记录存在
    const activity = await getOrCreateMemberActivity(memberId, phoneNumber);
    if (!activity) {
      console.error('Failed to get/create member activity');
      return false;
    }

    // 根据币种分流扣减
    const updateData: Record<string, number> = {};
    if (currency === 'USDT') {
      // USDT 赠送从 accumulated_profit_usdt 扣减
      const newProfitUsdt = (activity.accumulated_profit_usdt || 0) - giftAmount;
      updateData.accumulated_profit_usdt = newProfitUsdt;
      console.log(`[MemberActivity] Deducted USDT gift ${giftAmount} from member ${memberId}, new profit: ${newProfitUsdt}`);
    } else {
      // NGN/GHS 赠送从 accumulated_profit (RMB) 扣减
      const newProfit = (activity.accumulated_profit || 0) - giftAmount;
      updateData.accumulated_profit = newProfit;
      console.log(`[MemberActivity] Deducted RMB gift ${giftAmount} from member ${memberId}, new profit: ${newProfit}`);
    }

    try {
      await apiPatch(`/api/data/table/member_activity?id=eq.${encodeURIComponent(activity.id)}`, {
        data: updateData,
      });
    } catch (error) {
      console.error('Failed to deduct accumulated profit:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in deductAccumulatedProfit:', error);
    return false;
  }
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
    console.error('Error in getPermanentActivityData:', error);
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
 * 🚀 批量更新会员活动数据（单次数据库调用）
 * 合并 addAccumulatedAmount + addAccumulatedProfit 为一次 UPDATE
 * 减少网络往返，提升性能
 */
export async function batchUpdateMemberActivity(params: BatchUpdateParams): Promise<boolean> {
  try {
    const { memberId, phoneNumber, accumulatedAmount, profitAmount, profitCurrency, incrementOrderCount } = params;

    if (!accumulatedAmount && profitAmount === undefined && !incrementOrderCount) {
      return true;
    }

    const existingData = await apiGet<{
      id: string;
      total_accumulated_ngn?: number | null;
      total_accumulated_ghs?: number | null;
      total_accumulated_usdt?: number | null;
      accumulated_profit?: number | null;
      accumulated_profit_usdt?: number | null;
      order_count?: number | null;
    } | null>(
      `/api/data/table/member_activity?select=id,total_accumulated_ngn,total_accumulated_ghs,total_accumulated_usdt,accumulated_profit,accumulated_profit_usdt,order_count&member_id=eq.${encodeURIComponent(memberId)}&single=true`
    );

    if (existingData) {
      const updateData: Record<string, number | string> = {
        updated_at: new Date().toISOString(),
      };

      if (accumulatedAmount) {
        const { currency, amount } = accumulatedAmount;
        if (currency === 'NGN') {
          updateData.total_accumulated_ngn = (Number(existingData.total_accumulated_ngn) || 0) + amount;
        } else if (currency === 'GHS') {
          updateData.total_accumulated_ghs = (Number(existingData.total_accumulated_ghs) || 0) + amount;
        } else if (currency === 'USDT') {
          updateData.total_accumulated_usdt = (Number(existingData.total_accumulated_usdt) || 0) + amount;
        }
      }

      if (profitAmount !== undefined && profitAmount !== 0) {
        const currency = profitCurrency || accumulatedAmount?.currency;
        if (currency === 'USDT') {
          updateData.accumulated_profit_usdt = (Number(existingData.accumulated_profit_usdt) || 0) + profitAmount;
        } else {
          updateData.accumulated_profit = (Number(existingData.accumulated_profit) || 0) + profitAmount;
        }
      }

      if (incrementOrderCount) {
        updateData.order_count = (Number(existingData.order_count) || 0) + 1;
      }

      try {
        await apiPatch(`/api/data/table/member_activity?id=eq.${encodeURIComponent(existingData.id)}`, {
          data: updateData,
        });
      } catch (updateError) {
        console.error('[MemberActivity] Update error:', updateError);
        return false;
      }
    } else {
      const insertData: Record<string, unknown> = {
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
        accumulated_profit: 0,
        accumulated_profit_usdt: 0,
        order_count: 0,
      };

      if (accumulatedAmount) {
        const { currency, amount } = accumulatedAmount;
        if (currency === 'NGN') insertData.total_accumulated_ngn = amount;
        else if (currency === 'GHS') insertData.total_accumulated_ghs = amount;
        else if (currency === 'USDT') insertData.total_accumulated_usdt = amount;
      }

      if (profitAmount !== undefined && profitAmount !== 0) {
        const currency = profitCurrency || accumulatedAmount?.currency;
        if (currency === 'USDT') {
          insertData.accumulated_profit_usdt = profitAmount;
        } else {
          insertData.accumulated_profit = profitAmount;
        }
      }

      if (incrementOrderCount) {
        insertData.order_count = 1;
      }

      try {
        await apiPost(`/api/data/table/member_activity`, { data: insertData });
      } catch (insertError) {
        console.error('[MemberActivity] Insert error:', insertError);
        return false;
      }
    }

    return true;
  } catch (error) {
    console.error('[MemberActivity] Error in batchUpdateMemberActivity:', error);
    return false;
  }
}

/**
 * 🚀 Fire-and-Forget 版本：不阻塞调用方
 * 在后台执行批量更新，错误只记录日志
 */
export function batchUpdateMemberActivityAsync(params: BatchUpdateParams): void {
  setTimeout(() => {
    batchUpdateMemberActivity(params).catch(err => {
      console.error('[MemberActivity] Async batch update failed:', err);
    });
  }, 0);
}
