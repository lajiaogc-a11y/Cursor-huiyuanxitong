/**
 * Data repository — activity_gifts
 */
import { query, queryOne, execute, withTransaction } from '../../database/index.js';
import { randomUUID } from 'crypto';
import { applyPointsLedgerDeltaOnConn } from '../points/pointsLedgerAccount.js';

export interface ActivityGiftMutationRow {
  id: string;
  gift_number?: string | null;
  currency: string;
  amount: number | string;
  rate: number | string;
  phone_number: string;
  payment_agent: string | null;
  gift_type: string | null;
  fee: number | string | null;
  gift_value: number | string | null;
  remark: string | null;
  creator_id: string | null;
  member_id?: string | null;
  created_at: string;
}

function buildActivityGiftTenantCondition(): string {
  return `(
    EXISTS (SELECT 1 FROM employees e WHERE e.id = activity_gifts.creator_id AND e.tenant_id = ?)
    OR EXISTS (SELECT 1 FROM members m WHERE m.id = activity_gifts.member_id AND m.tenant_id = ?)
  )`;
}

export async function updateActivityGiftRepository(
  giftId: string,
  updates: Partial<ActivityGiftMutationRow>,
  tenantId?: string | null
): Promise<ActivityGiftMutationRow | null> {
  const setClauses: string[] = [];
  const values: unknown[] = [];
  const assign = (column: string, value: any) => {
    if (value === undefined) return;
    setClauses.push(`${column} = ?`);
    values.push(value);
  };
  assign('currency', updates.currency);
  assign('amount', updates.amount);
  assign('rate', updates.rate);
  assign('phone_number', updates.phone_number);
  assign('payment_agent', updates.payment_agent ?? null);
  assign('gift_type', updates.gift_type ?? null);
  assign('fee', updates.fee);
  assign('gift_value', updates.gift_value);
  assign('remark', updates.remark ?? null);
  assign('creator_id', updates.creator_id ?? null);

  if (setClauses.length === 0) {
    const conditions = ['id = ?'];
    const qValues: unknown[] = [giftId];
    if (tenantId) {
      conditions.push(buildActivityGiftTenantCondition());
      qValues.push(tenantId, tenantId);
    }
    return await queryOne<ActivityGiftMutationRow>(
      `SELECT * FROM activity_gifts WHERE ${conditions.join(' AND ')} LIMIT 1`,
      qValues
    );
  }

  const conditions = ['id = ?'];
  values.push(giftId);
  if (tenantId) {
    conditions.push(buildActivityGiftTenantCondition());
    values.push(tenantId, tenantId);
  }
  await execute(
    `UPDATE activity_gifts SET ${setClauses.join(', ')} WHERE ${conditions.join(' AND ')}`,
    values
  );
  return await queryOne<ActivityGiftMutationRow>(`SELECT * FROM activity_gifts WHERE id = ?`, [giftId]);
}

export async function deleteActivityGiftRepository(
  giftId: string,
  tenantId?: string | null
): Promise<{ gift: ActivityGiftMutationRow | null; restored_points: number }> {
  const conditions = ['id = ?'];
  const qValues: unknown[] = [giftId];
  if (tenantId) {
    conditions.push(buildActivityGiftTenantCondition());
    qValues.push(tenantId, tenantId);
  }
  const gift = await queryOne<ActivityGiftMutationRow>(
    `SELECT * FROM activity_gifts WHERE ${conditions.join(' AND ')} LIMIT 1`,
    qValues
  );

  if (!gift) {
    return { gift: null, restored_points: 0 };
  }

  const delConditions = ['id = ?'];
  const delArgs: unknown[] = [giftId];
  if (tenantId) {
    delConditions.push(buildActivityGiftTenantCondition());
    delArgs.push(tenantId, tenantId);
  }
  const deleteResult = await execute(`DELETE FROM activity_gifts WHERE ${delConditions.join(' AND ')}`, delArgs);
  if (deleteResult.affectedRows === 0) {
    return { gift: null, restored_points: 0 };
  }

  let restoredPoints = 0;
  const amount = Number(gift.amount) || 0;

  if (amount > 0 && gift.phone_number) {
    const currency = gift.currency || 'NGN';
    let giftField = 'total_gift_ngn';
    if (currency === 'GHS' || currency === '赛地') giftField = 'total_gift_ghs';
    else if (currency === 'USDT') giftField = 'total_gift_usdt';

    const act = gift.member_id
      ? await queryOne<{ id: string }>(`SELECT id FROM member_activity WHERE member_id = ? LIMIT 1`, [gift.member_id])
      : await queryOne<{ id: string }>(`SELECT id FROM member_activity WHERE phone_number = ? LIMIT 1`, [gift.phone_number]);

    if (act) {
      await execute(
        `UPDATE member_activity SET ${giftField} = GREATEST(0, COALESCE(${giftField}, 0) - ?), updated_at = NOW() WHERE id = ?`,
        [amount, act.id]
      );
    }
  }

  // 查找该赠送关联的积分兑换流水，回退实际积分（而非赠送金额）
  const giftType = gift.gift_type || '';
  const isRedemptionGift =
    giftType === 'activity_1' || giftType === 'activity_2' || giftType === 'points_redeem';

  if (isRedemptionGift && gift.member_id) {
    const ledgerTypes = ['redeem_activity_1', 'redeem_activity_2', 'redemption'];
    const typePlaceholders = ledgerTypes.map(() => '?').join(',');

    // 按 member_id + 兑换类型 + 创建时间±5秒 匹配对应的积分流水
    const ledgerEntry = await queryOne<{
      id: string;
      member_id: string;
      amount: number;
      type: string;
      member_code: string | null;
      phone_number: string | null;
      creator_id: string | null;
      tenant_id: string | null;
    }>(
      `SELECT id, member_id, amount, type, member_code, phone_number, creator_id, tenant_id
       FROM points_ledger
       WHERE member_id = ?
         AND type IN (${typePlaceholders})
         AND amount < 0
         AND ABS(TIMESTAMPDIFF(SECOND, created_at, ?)) <= 5
       ORDER BY ABS(TIMESTAMPDIFF(MICROSECOND, created_at, ?)) ASC
       LIMIT 1`,
      [gift.member_id, ...ledgerTypes, gift.created_at, gift.created_at]
    );

    if (ledgerEntry) {
      const pointsToRestore = Math.abs(Number(ledgerEntry.amount));
      const restoreTxnType = ledgerEntry.type || 'redemption';
      if (pointsToRestore > 0) {
        try {
          await withTransaction(async (conn) => {
            await applyPointsLedgerDeltaOnConn(conn, {
              ledgerId: randomUUID(),
              memberId: ledgerEntry.member_id,
              // 与原始兑换流水同一 transaction_type，便于积分汇总按类型正负抵消
              type: restoreTxnType,
              delta: pointsToRestore,
              description: `Activity gift deleted, points refunded (${gift.gift_number || giftId})`,
              referenceType: 'gift_delete',
              referenceId: giftId,
              createdBy: gift.creator_id ?? null,
              extras: {
                member_code: ledgerEntry.member_code ?? null,
                phone_number: ledgerEntry.phone_number ?? gift.phone_number ?? null,
                transaction_type: restoreTxnType,
                points_earned: pointsToRestore,
                status: 'issued',
                creator_id: gift.creator_id ?? null,
                tenant_id: ledgerEntry.tenant_id ?? null,
              },
            });
          });
          restoredPoints = pointsToRestore;
        } catch (e) {
          console.error('[deleteActivityGift] Failed to restore points via ledger:', e);
        }
      }
    }
  }

  return { gift, restored_points: restoredPoints };
}
