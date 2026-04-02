/**
 * 积分写入：points_ledger 插入、member_activity 更新
 * 与前端 pointsService 契约一致
 */
import { queryOne, execute, withTransaction } from '../../database/index.js';
import { randomUUID } from 'crypto';
import { applyPointsLedgerDeltaOnConn } from './pointsLedgerAccount.js';

export type PointsTransactionType = 'consumption' | 'referral_1' | 'referral_2';

export interface LedgerInsertBody {
  member_code: string | null;
  phone_number: string | null;
  order_id: string | null;
  transaction_type: PointsTransactionType;
  actual_payment: number | null;
  currency: string | null;
  exchange_rate: number | null;
  usd_amount: number | null;
  points_multiplier: number | null;
  points_earned: number;
  status: string;
  creator_id: string | null;
}

/** 同一订单 + 类型已存在正积分流水则跳过（幂等） */
export async function findIssuedLedgerDuplicate(
  orderId: string,
  transactionType: PointsTransactionType
): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `SELECT id FROM points_ledger
     WHERE order_id = ? AND transaction_type = ? AND status = 'issued'
       AND COALESCE(points_earned, 0) > 0
     LIMIT 1`,
    [orderId, transactionType]
  );
  return !!row;
}

/**
 * 解析流水归属会员。
 * 注意：推荐积分归属推荐人，不能用订单 member_id（下单人），故仅 consumption 才用 order.member_id。
 */
export async function resolveMemberIdForLedgerInsert(
  orderId: string | null,
  memberCode: string | null,
  phone: string | null,
  tenantId: string | null,
  transactionType: PointsTransactionType
): Promise<string | null> {
  if (orderId && transactionType === 'consumption') {
    const o = await queryOne<{ member_id: string | null }>(
      'SELECT member_id FROM orders WHERE id = ? LIMIT 1',
      [orderId]
    );
    if (o?.member_id) return o.member_id;
  }

  const ph = (phone || '').trim();
  const mc = (memberCode || '').trim();

  if (tenantId) {
    if (ph) {
      const m = await queryOne<{ id: string }>(
        'SELECT id FROM members WHERE tenant_id = ? AND phone_number = ? LIMIT 1',
        [tenantId, ph]
      );
      if (m) return m.id;
    }
    if (mc) {
      const m = await queryOne<{ id: string }>(
        'SELECT id FROM members WHERE tenant_id = ? AND member_code = ? LIMIT 1',
        [tenantId, mc]
      );
      if (m) return m.id;
    }
  }
  if (ph) {
    const m = await queryOne<{ id: string }>('SELECT id FROM members WHERE phone_number = ? LIMIT 1', [ph]);
    if (m) return m.id;
  }
  if (mc) {
    const m = await queryOne<{ id: string }>('SELECT id FROM members WHERE member_code = ? LIMIT 1', [mc]);
    if (m) return m.id;
  }
  return null;
}

export async function insertPointsLedgerRow(body: LedgerInsertBody, tenantId: string | null): Promise<string> {
  const memberId = await resolveMemberIdForLedgerInsert(
    body.order_id,
    body.member_code,
    body.phone_number,
    tenantId,
    body.transaction_type
  );
  if (!memberId) {
    throw new Error('MEMBER_NOT_FOUND_FOR_LEDGER');
  }

  const pts = Number(body.points_earned);
  if (!Number.isFinite(pts) || pts <= 0) {
    throw new Error('INVALID_POINTS_EARNED');
  }

  const id = randomUUID();

  await withTransaction(async (conn) => {
    await applyPointsLedgerDeltaOnConn(conn, {
      ledgerId: id,
      memberId,
      type: body.transaction_type,
      delta: pts,
      description: `订单积分 (${body.transaction_type})`,
      referenceType: body.order_id ? 'order' : null,
      referenceId: body.order_id,
      createdBy: body.creator_id,
      extras: {
        member_code: body.member_code,
        phone_number: body.phone_number,
        order_id: body.order_id,
        transaction_type: body.transaction_type,
        actual_payment: body.actual_payment,
        currency: body.currency,
        exchange_rate: body.exchange_rate,
        usd_amount: body.usd_amount,
        points_multiplier: body.points_multiplier,
        points_earned: body.points_earned,
        status: body.status,
        creator_id: body.creator_id,
        tenant_id: tenantId,
      },
    });
  });

  return id;
}

async function findMemberByPhone(phone: string, tenantId: string | null) {
  if (tenantId) {
    return queryOne<{ id: string }>(
      `SELECT id FROM members WHERE phone_number = ? AND tenant_id = ? LIMIT 1`,
      [phone, tenantId]
    );
  }
  return queryOne<{ id: string }>(`SELECT id FROM members WHERE phone_number = ? LIMIT 1`, [phone]);
}

async function findActivityForMember(memberId: string, phone: string) {
  let act = await queryOne<{ id: string }>(
    `SELECT id FROM member_activity WHERE member_id = ? LIMIT 1`,
    [memberId]
  );
  if (!act) {
    act = await queryOne<{ id: string }>(
      `SELECT id FROM member_activity WHERE phone_number = ? LIMIT 1`,
      [phone]
    );
  }
  return act;
}

/** 下单会员：增加可兑换/累计消费积分 */
export async function addConsumptionToMemberActivity(
  phoneRaw: string,
  consumptionPoints: number,
  tenantId: string | null
): Promise<{ updated: boolean }> {
  const phone = (phoneRaw || '').trim();
  if (!phone || consumptionPoints <= 0) return { updated: false };

  const member = await findMemberByPhone(phone, tenantId);
  if (!member) return { updated: false };

  const act = await findActivityForMember(member.id, phone);
  if (!act) {
    await execute(
      `INSERT INTO member_activity (id, member_id, phone_number, remaining_points, accumulated_points)
       VALUES (?, ?, ?, ?, ?)`,
      [randomUUID(), member.id, phone, consumptionPoints, consumptionPoints]
    );
    return { updated: true };
  }

  await execute(
    `UPDATE member_activity SET
       remaining_points = COALESCE(remaining_points, 0) + ?,
       accumulated_points = COALESCE(accumulated_points, 0) + ?,
       phone_number = COALESCE(phone_number, ?),
       updated_at = NOW()
     WHERE id = ?`,
    [consumptionPoints, consumptionPoints, phone, act.id]
  );
  return { updated: true };
}

/** 推荐人：增加剩余积分、推荐积分、推荐次数 */
export async function addReferralToMemberActivity(
  phoneRaw: string,
  referralPoints: number,
  tenantId: string | null
): Promise<{ updated: boolean }> {
  const phone = (phoneRaw || '').trim();
  if (!phone || referralPoints <= 0) return { updated: false };

  const member = await findMemberByPhone(phone, tenantId);
  if (!member) return { updated: false };

  const act = await findActivityForMember(member.id, phone);
  if (!act) {
    await execute(
      `INSERT INTO member_activity (id, member_id, phone_number, remaining_points, referral_points, referral_count)
       VALUES (?, ?, ?, ?, ?, 1)`,
      [randomUUID(), member.id, phone, referralPoints, referralPoints]
    );
    return { updated: true };
  }

  await execute(
    `UPDATE member_activity SET
       remaining_points = COALESCE(remaining_points, 0) + ?,
       referral_points = COALESCE(referral_points, 0) + ?,
       referral_count = COALESCE(referral_count, 0) + 1,
       phone_number = COALESCE(phone_number, ?),
       updated_at = NOW()
     WHERE id = ?`,
    [referralPoints, referralPoints, phone, act.id]
  );
  return { updated: true };
}
