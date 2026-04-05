/**
 * 订单创建后同步「活动数据」永久累计字段（member_activity）
 * C2: Now uses the unified memberActivityAccount helper.
 */
import { applyMemberActivityDeltas, type MemberActivityDeltas } from './memberActivityAccount.js';

export type OrderCurrencyBucket = 'NGN' | 'GHS' | 'USDT';

export function resolveOrderCurrencyBucket(currency: string | null | undefined): OrderCurrencyBucket | null {
  const s = String(currency ?? '').trim();
  if (!s) return null;
  const u = s.toUpperCase();
  if (u === 'NGN' || u === 'NAIRA' || s === '奈拉') return 'NGN';
  if (u === 'GHS' || u === 'CEDI' || s === '赛地' || s === '赛迪') return 'GHS';
  if (u === 'USDT') return 'USDT';
  return null;
}

/**
 * 新订单写入成功后调用：按币种累加实付、利润，并 order_count+1
 */
export async function incrementMemberActivityForNewOrder(row: Record<string, unknown>): Promise<void> {
  const memberId = row.member_id != null ? String(row.member_id).trim() : '';
  if (!memberId) return;

  const bucket = resolveOrderCurrencyBucket(row.currency as string);
  if (!bucket) return;

  const phone = row.phone_number != null ? String(row.phone_number).trim() : '';
  const actual = Number(row.actual_payment) || 0;
  const profitNgn = Number(row.profit_ngn) || 0;
  const profitUsdt = Number(row.profit_usdt) || 0;

  const deltas: MemberActivityDeltas = { order_count: 1 };

  if (bucket === 'NGN') {
    deltas.total_accumulated_ngn = actual;
    deltas.accumulated_profit = profitNgn;
  } else if (bucket === 'GHS') {
    deltas.total_accumulated_ghs = actual;
    deltas.accumulated_profit = profitNgn;
  } else {
    deltas.total_accumulated_usdt = actual;
    deltas.accumulated_profit_usdt = profitUsdt;
  }

  await applyMemberActivityDeltas(memberId, deltas, phone || undefined);
}
