/**
 * 订单创建后同步「活动数据」永久累计字段（member_activity）
 * 与前端活动页 MemberActivityDataContent 展示的 order_count / total_accumulated_* / accumulated_profit* 一致。
 */
import { randomUUID } from 'node:crypto';
import { queryOne, execute } from '../../database/index.js';

export type OrderCurrencyBucket = 'NGN' | 'GHS' | 'USDT';

/** 与 orderReversal、活动页筛选逻辑对齐 */
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

  let dNgn = 0;
  let dGhs = 0;
  let dUsdt = 0;
  let dProfitRmb = 0;
  let dProfitUsdt = 0;

  if (bucket === 'NGN') {
    dNgn = actual;
    dProfitRmb = profitNgn;
  } else if (bucket === 'GHS') {
    dGhs = actual;
    dProfitRmb = profitNgn;
  } else {
    dUsdt = actual;
    dProfitUsdt = profitUsdt;
  }

  const existing = await queryOne<{ id: string }>(
    `SELECT id FROM member_activity WHERE member_id = ? LIMIT 1`,
    [memberId]
  );

  if (!existing) {
    await execute(
      `INSERT INTO member_activity (
        id, member_id, phone_number,
        order_count, total_accumulated_ngn, total_accumulated_ghs, total_accumulated_usdt,
        accumulated_profit, accumulated_profit_usdt,
        remaining_points, accumulated_points, referral_count, referral_points,
        total_gift_ngn, total_gift_ghs, total_gift_usdt
      ) VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, 0, 0, 0, 0, 0, 0, 0)`,
      [randomUUID(), memberId, phone || null, dNgn, dGhs, dUsdt, dProfitRmb, dProfitUsdt]
    );
    return;
  }

  await execute(
    `UPDATE member_activity SET
      total_accumulated_ngn = COALESCE(total_accumulated_ngn, 0) + ?,
      total_accumulated_ghs = COALESCE(total_accumulated_ghs, 0) + ?,
      total_accumulated_usdt = COALESCE(total_accumulated_usdt, 0) + ?,
      accumulated_profit = COALESCE(accumulated_profit, 0) + ?,
      accumulated_profit_usdt = COALESCE(accumulated_profit_usdt, 0) + ?,
      order_count = COALESCE(order_count, 0) + 1,
      phone_number = COALESCE(NULLIF(?, ''), phone_number),
      updated_at = NOW()
     WHERE id = ?`,
    [dNgn, dGhs, dUsdt, dProfitRmb, dProfitUsdt, phone, existing.id]
  );
}
