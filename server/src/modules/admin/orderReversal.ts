/**
 * 订单删除时的活动数据回滚 (MySQL)
 * 与前端 pointsService.reversePointsOnOrderCancel 逻辑一致
 */
import { query, queryOne, execute, withTransaction } from '../../database/index.js';
import { randomUUID } from 'crypto';
import { applyPointsLedgerDeltaOnConn } from '../points/pointsLedgerAccount.js';

interface GiftRow {
  id: string;
  phone_number?: string;
  member_id?: string;
  currency?: string;
  amount?: number;
}

interface OrderRow {
  id: string;
  actual_payment?: number;
  currency?: string;
  profit_ngn?: number;
  profit_usdt?: number;
  member_id?: string;
  phone_number?: string;
}

/**
 * 为单个订单执行活动数据回滚（member_activity 累积字段 + points_ledger 负积分）
 */
export async function reverseActivityDataForOrder(orderId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    // Idempotency: skip if reversal entries already exist for this order
    const existing = await queryOne<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM points_ledger WHERE order_id = ? AND status = 'reversed' AND points_earned < 0`,
      [orderId],
    );
    if (existing && existing.cnt > 0) {
      return { ok: true };
    }

    const orderData = await queryOne<OrderRow>(
      `SELECT actual_payment, currency, profit_ngn, profit_usdt, member_id, phone_number FROM orders WHERE id = ?`,
      [orderId]
    );

    if (!orderData) {
      return { ok: false, error: 'Order not found' };
    }

    const order = { ...orderData, id: orderId };

    // 1. 回滚 member_activity 累积字段
    let existingActivity: { id: string; total_accumulated_ngn?: number; total_accumulated_ghs?: number; total_accumulated_usdt?: number; accumulated_profit?: number; order_count?: number } | null = null;

    if (order.member_id) {
      existingActivity = await queryOne(
        `SELECT id, total_accumulated_ngn, total_accumulated_ghs, total_accumulated_usdt, accumulated_profit, order_count
         FROM member_activity WHERE member_id = ? LIMIT 1`,
        [order.member_id]
      );
    }
    if (!existingActivity && order.phone_number) {
      existingActivity = await queryOne(
        `SELECT id, total_accumulated_ngn, total_accumulated_ghs, total_accumulated_usdt, accumulated_profit, order_count
         FROM member_activity WHERE phone_number = ? LIMIT 1`,
        [order.phone_number]
      );
    }

    if (existingActivity) {
      const currency = order.currency || 'NGN';
      const actualPayment = Number(order.actual_payment) || 0;
      const profitRmb = currency === 'USDT' ? 0 : (Number(order.profit_ngn) || 0);
      const profitUsdt = currency === 'USDT' ? (Number(order.profit_usdt) || 0) : 0;

      const setClauses: string[] = [
        'updated_at = NOW()',
        `order_count = GREATEST(0, COALESCE(order_count, 0) - 1)`,
        `accumulated_profit = GREATEST(0, COALESCE(accumulated_profit, 0) - ?)`,
        `accumulated_profit_usdt = GREATEST(0, COALESCE(accumulated_profit_usdt, 0) - ?)`,
      ];
      const values: any[] = [profitRmb, profitUsdt];

      if (currency === 'NGN' || String(currency).toUpperCase() === 'NAIRA' || currency === '奈拉') {
        setClauses.push(`total_accumulated_ngn = GREATEST(0, COALESCE(total_accumulated_ngn, 0) - ?)`);
        values.push(actualPayment);
      } else if (currency === 'GHS' || String(currency).toUpperCase() === 'CEDI' || currency === '赛地') {
        setClauses.push(`total_accumulated_ghs = GREATEST(0, COALESCE(total_accumulated_ghs, 0) - ?)`);
        values.push(actualPayment);
      } else if (currency === 'USDT') {
        setClauses.push(`total_accumulated_usdt = GREATEST(0, COALESCE(total_accumulated_usdt, 0) - ?)`);
        values.push(actualPayment);
      }

      values.push(existingActivity.id);
      try {
        await execute(
          `UPDATE member_activity SET ${setClauses.join(', ')} WHERE id = ?`,
          values
        );
      } catch (e: any) {
        return { ok: false, error: `member_activity: ${e.message}` };
      }
    }

    // 2. 查找已发放积分，插入负积分流水
    let issuedEntries: any[];
    try {
      issuedEntries = await query(
        `SELECT * FROM points_ledger WHERE order_id = ? AND status = 'issued' AND points_earned > 0`,
        [orderId]
      );
    } catch (e: any) {
      return { ok: false, error: `points_ledger fetch: ${e.message}` };
    }

    for (const entry of issuedEntries) {
      const earned = Number(entry.points_earned || 0);
      if (earned <= 0) continue;
      const negativePoints = -earned;
      let memberId: string | undefined =
        (entry as { member_id?: string }).member_id || order.member_id || undefined;
      const entPhone = String((entry as { phone_number?: string }).phone_number || '').trim();
      const entCode = String((entry as { member_code?: string }).member_code || '').trim();
      if (!memberId && entPhone) {
        const m = await queryOne<{ id: string }>(
          'SELECT id FROM members WHERE phone_number = ? LIMIT 1',
          [entPhone]
        );
        if (m) memberId = m.id;
      }
      if (!memberId && entCode) {
        const m = await queryOne<{ id: string }>(
          'SELECT id FROM members WHERE member_code = ? LIMIT 1',
          [entCode]
        );
        if (m) memberId = m.id;
      }
      if (!memberId) {
        return { ok: false, error: `points_ledger reversal: cannot resolve member for order ${orderId}` };
      }

      try {
        await withTransaction(async (conn) => {
          await applyPointsLedgerDeltaOnConn(conn, {
            ledgerId: randomUUID(),
            memberId: String(memberId),
            type: 'reversal',
            delta: negativePoints,
            description: `Order cancellation rollback (${(entry as { transaction_type?: string }).transaction_type || 'consumption'})`,
            referenceType: 'order',
            referenceId: orderId,
            createdBy: (entry as { creator_id?: string | null }).creator_id ?? null,
            clampToZero: true,
            extras: {
              member_code: (entry as { member_code?: string | null }).member_code ?? null,
              phone_number: (entry as { phone_number?: string | null }).phone_number ?? null,
              order_id: orderId,
              transaction_type: (entry as { transaction_type?: string | null }).transaction_type ?? null,
              actual_payment: (entry as { actual_payment?: number | null }).actual_payment ?? null,
              currency: (entry as { currency?: string | null }).currency ?? null,
              exchange_rate: (entry as { exchange_rate?: number | null }).exchange_rate ?? null,
              usd_amount: (entry as { usd_amount?: number | null }).usd_amount ?? null,
              points_multiplier: (entry as { points_multiplier?: number | null }).points_multiplier ?? null,
              points_earned: negativePoints,
              status: 'reversed',
              creator_id: (entry as { creator_id?: string | null }).creator_id ?? null,
              tenant_id: (entry as { tenant_id?: string | null }).tenant_id ?? null,
            },
          });
        });
      } catch (e: any) {
        return { ok: false, error: `points_ledger insert: ${e.message}` };
      }
    }

    // H4: Resolve member_id first, then use it for member_activity lookups
    // (phone_number can be NULL or mismatched, causing silent skips)
    const resolvedMemberIds = new Map<string, string>();

    // 3. 扣减消费者 accumulated_points（remaining_points 已由 applyPointsLedgerDeltaOnConn 自动同步）
    const consumptionEntries = issuedEntries.filter((e: any) => e.transaction_type === 'consumption');
    for (const entry of consumptionEntries) {
      const pointsToDeduct = entry.points_earned || 0;
      if (pointsToDeduct <= 0) continue;

      let memberId: string | undefined = entry.member_id || order.member_id;
      const entPhone = String(entry.phone_number || '').trim();
      const entCode = String(entry.member_code || '').trim();
      if (!memberId && entPhone) {
        if (resolvedMemberIds.has(entPhone)) {
          memberId = resolvedMemberIds.get(entPhone);
        } else {
          const m = await queryOne<{ id: string }>('SELECT id FROM members WHERE phone_number = ? LIMIT 1', [entPhone]);
          if (m) { memberId = m.id; resolvedMemberIds.set(entPhone, m.id); }
        }
      }
      if (!memberId && entCode) {
        if (resolvedMemberIds.has(entCode)) {
          memberId = resolvedMemberIds.get(entCode);
        } else {
          const m = await queryOne<{ id: string }>('SELECT id FROM members WHERE member_code = ? LIMIT 1', [entCode]);
          if (m) { memberId = m.id; resolvedMemberIds.set(entCode, m.id); }
        }
      }
      if (!memberId) continue;

      await execute(
        `UPDATE member_activity SET accumulated_points = GREATEST(0, COALESCE(accumulated_points, 0) - ?), updated_at = NOW() WHERE member_id = ?`,
        [pointsToDeduct, memberId]
      );
    }

    // 4. 扣减推荐人 referral_points / referral_count（remaining_points 已由 applyPointsLedgerDeltaOnConn 自动同步）
    const referralEntries = issuedEntries.filter(
      (e: any) => e.transaction_type === 'referral_1' || e.transaction_type === 'referral_2'
    );
    const referrerMap = new Map<string, number>();
    for (const e of referralEntries) {
      let mid: string | undefined = e.member_id;
      if (!mid && e.phone_number) {
        if (resolvedMemberIds.has(e.phone_number)) {
          mid = resolvedMemberIds.get(e.phone_number);
        } else {
          const m = await queryOne<{ id: string }>('SELECT id FROM members WHERE phone_number = ? LIMIT 1', [e.phone_number]);
          if (m) { mid = m.id; resolvedMemberIds.set(e.phone_number, m.id); }
        }
      }
      if (mid) referrerMap.set(mid, (referrerMap.get(mid) || 0) + (e.points_earned || 0));
    }
    for (const [mid, pointsToDeduct] of referrerMap) {
      if (pointsToDeduct <= 0) continue;
      await execute(
        `UPDATE member_activity SET
           referral_points = GREATEST(0, COALESCE(referral_points, 0) - ?),
           referral_count = GREATEST(0, COALESCE(referral_count, 0) - 1),
           updated_at = NOW()
         WHERE member_id = ?`,
        [pointsToDeduct, mid]
      );
    }

    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}

/**
 * 为一批订单执行活动数据回滚
 */
export async function reverseActivityDataForOrderBatch(
  orderIds: string[]
): Promise<{ reversed: number; errors: string[] }> {
  const errors: string[] = [];
  let reversed = 0;
  for (const id of orderIds) {
    const result = await reverseActivityDataForOrder(id);
    if (result.ok) reversed++;
    else errors.push(`order ${id}: ${result.error}`);
  }
  return { reversed, errors };
}

/**
 * 批量删除 activity_gifts 前，回滚 member_activity 的 total_gift_* 字段
 */
export async function reverseGiftActivityDataBeforeDelete(
  giftIds: string[]
): Promise<{ success: number; errors: string[] }> {
  const errors: string[] = [];
  let success = 0;

  if (giftIds.length === 0) return { success: 0, errors: [] };

  const placeholders = giftIds.map(() => '?').join(',');
  const gifts = await query<GiftRow>(
    `SELECT id, phone_number, member_id, currency, amount FROM activity_gifts WHERE id IN (${placeholders})`,
    giftIds
  );

  for (const g of gifts) {
    const amount = Number(g.amount) || 0;
    if (amount <= 0) continue;

    const currency = g.currency || 'NGN';
    let act: { id: string; total_gift_ngn?: number; total_gift_ghs?: number; total_gift_usdt?: number } | null = null;

    if (g.member_id) {
      act = await queryOne(
        `SELECT id, total_gift_ngn, total_gift_ghs, total_gift_usdt FROM member_activity WHERE member_id = ? LIMIT 1`,
        [g.member_id]
      );
    } else if (g.phone_number) {
      act = await queryOne(
        `SELECT id, total_gift_ngn, total_gift_ghs, total_gift_usdt FROM member_activity WHERE phone_number = ? LIMIT 1`,
        [g.phone_number]
      );
    }

    if (!act) continue;

    const setClauses: string[] = ['updated_at = NOW()'];
    const values: any[] = [];
    if (currency === 'NGN' || currency === '奈拉') {
      setClauses.push(`total_gift_ngn = GREATEST(0, COALESCE(total_gift_ngn, 0) - ?)`);
      values.push(amount);
    } else if (currency === 'GHS' || currency === '赛地') {
      setClauses.push(`total_gift_ghs = GREATEST(0, COALESCE(total_gift_ghs, 0) - ?)`);
      values.push(amount);
    } else if (currency === 'USDT') {
      setClauses.push(`total_gift_usdt = GREATEST(0, COALESCE(total_gift_usdt, 0) - ?)`);
      values.push(amount);
    }

    values.push(act.id);
    try {
      await execute(`UPDATE member_activity SET ${setClauses.join(', ')} WHERE id = ?`, values);
      success++;
    } catch (e: any) {
      errors.push(`gift ${g.id}: ${e.message}`);
    }
  }
  return { success, errors };
}
