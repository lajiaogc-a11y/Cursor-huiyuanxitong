#!/usr/bin/env node
/**
 * 验证：租户开启「订单完成送转盘次数」后，grantOrderCompletedSpinCredits 是否写入 spin_credits。
 * 使用库中一条真实订单（需有 member_id、tenant_id）；会先删除该订单对应的 order_completed:{id} 防重行再测。
 *
 *   npm run verify:order-spin
 */
import 'dotenv/config';
if (!process.env.TZ?.trim()) {
  process.env.TZ = (process.env.APP_TIMEZONE || 'Asia/Shanghai').trim();
}

import { execute, query } from '../database/index.js';
import {
  getLotterySettings,
  getSpinCredits,
  grantOrderCompletedSpinCredits,
  upsertLotterySettings,
} from '../modules/lottery/repository.js';

type OrderRow = { id: string; member_id: string; tenant_id: string; status: string | null };

void (async () => {
  try {
    const rows = await query<OrderRow>(
      `SELECT id, member_id, tenant_id, status FROM orders
       WHERE member_id IS NOT NULL AND tenant_id IS NOT NULL AND (is_deleted IS NULL OR is_deleted = 0)
       ORDER BY updated_at DESC
       LIMIT 20`,
    );
    const order = rows.find((r) => String(r.member_id).trim() !== '');
    if (!order) {
      console.log('[verify:order-spin] skip: no orders with member_id + tenant_id');
      process.exit(0);
      return;
    }

    const orderId = String(order.id);
    const memberId = String(order.member_id);
    const tenantId = String(order.tenant_id);
    const source = `order_completed:${orderId}`;

    const cur = await getLotterySettings(tenantId);
    await upsertLotterySettings(
      tenantId,
      Math.max(0, Number(cur?.daily_free_spins ?? 0)),
      Number(cur?.enabled) === 1,
      cur?.probability_notice ?? null,
      { enabled: true, amount: 2 },
    );

    await execute(`DELETE FROM spin_credits WHERE source = ?`, [source]);

    const before = await getSpinCredits(memberId);
    await grantOrderCompletedSpinCredits({ orderId, memberId, tenantId });
    const after = await getSpinCredits(memberId);
    const delta = after - before;

    console.log('[verify:order-spin] order', orderId.slice(0, 8) + '…', 'member', memberId.slice(0, 8) + '…');
    console.log('[verify:order-spin] spin_credits sum:', before, '→', after, '(delta', delta + ')');
    if (delta === 2) {
      console.log('[verify:order-spin] OK: +2 credits as configured');
      process.exit(0);
    } else {
      console.error('[verify:order-spin] FAIL: expected delta 2, got', delta);
      process.exit(1);
    }
  } catch (e) {
    console.error('[verify:order-spin] error:', e);
    process.exit(1);
  }
})();
