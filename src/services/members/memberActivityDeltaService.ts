/**
 * 会员活动数据增量写入 Service
 * 通过 RPC 原子更新 member_activity 累积字段
 */
import {
  rpcMemberActivityApplyDeltas,
} from '@/services/data/memberActivityQueryService';
import { logger } from '@/lib/logger';

async function applyActivityDeltasViaRpc(
  memberId: string,
  phoneNumber: string,
  deltas: Record<string, number>,
): Promise<boolean> {
  try {
    const res = await rpcMemberActivityApplyDeltas({
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

export async function addGiftAmount(
  memberId: string,
  phoneNumber: string,
  currency: 'NGN' | 'GHS' | 'USDT',
  amount: number,
): Promise<boolean> {
  const deltas: Record<string, number> = {};
  if (currency === 'NGN') deltas.total_gift_ngn = amount;
  else if (currency === 'GHS') deltas.total_gift_ghs = amount;
  else if (currency === 'USDT') deltas.total_gift_usdt = amount;
  const ok = await applyActivityDeltasViaRpc(memberId, phoneNumber, deltas);
  if (ok) logger.log(`[MemberActivity] Added gift ${amount} ${currency} to member ${memberId}`);
  return ok;
}

export async function deductAccumulatedProfit(
  memberId: string,
  phoneNumber: string,
  giftAmount: number,
  currency?: 'NGN' | 'GHS' | 'USDT',
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
