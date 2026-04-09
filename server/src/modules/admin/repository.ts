/**
 * Admin Repository - 数据管理/归档 (MySQL)
 * 将 DataManagementTab 的删除逻辑迁移至 Backend
 */
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { query, queryOne, execute } from '../../database/index.js';
import type { BulkDeleteSelections } from './types.js';
import { reverseActivityDataForOrder, reverseActivityDataForOrderBatch, reverseGiftActivityDataBeforeDelete } from './orderReversal.js';

const NULL_UUID = '00000000-0000-0000-0000-000000000000';
const BATCH_SIZE = 500;
const FETCH_BATCH = 1000;

type ArchivedSettlementBucket = { resetTime?: string; records?: Array<{ createdAt?: string }> };

function settlementCutoffMs(cutoffDateStr: string): number {
  const normalized = cutoffDateStr.includes('T') ? cutoffDateStr : cutoffDateStr.replace(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})$/, '$1T$2');
  const d = new Date(normalized);
  const t = d.getTime();
  return Number.isNaN(t) ? 0 : t;
}

/**
 * 清理 shared_data 中 cardMerchantSettlements / paymentProviderSettlements 的提款、充值、归档明细及 history（按 createdAt/timestamp 与 retainMonths 规则，与 balance_change_logs / ledger 删除同步）。
 */
function sanitizeSettlementStoreJson(
  storeKey: string,
  raw: string | null | undefined,
  deleteAll: boolean,
  cutoffDateStr: string
): { json: string; removed: number } | null {
  if (raw == null || raw === '') return null;
  let arr: unknown[];
  try {
    const parsed = JSON.parse(raw) as unknown;
    arr = Array.isArray(parsed) ? parsed : [];
  } catch {
    return null;
  }
  const cutoffMs = settlementCutoffMs(cutoffDateStr);
  let removed = 0;

  const filterRecsByTimeKey = (recs: unknown[], timeKey: 'createdAt' | 'timestamp'): unknown[] => {
    if (!Array.isArray(recs)) return [];
    if (deleteAll) {
      removed += recs.length;
      return [];
    }
    return recs.filter((r) => {
      const ca =
        r && typeof r === 'object' ? (r as Record<string, unknown>)[timeKey] : undefined;
      if (!ca || typeof ca !== 'string') return true;
      const ts = new Date(ca).getTime();
      if (Number.isNaN(ts)) return true;
      if (ts < cutoffMs) {
        removed++;
        return false;
      }
      return true;
    });
  };

  const filterRecs = (recs: unknown[]): unknown[] => filterRecsByTimeKey(recs, 'createdAt');

  const sanitizeArch = (buckets: unknown): unknown[] => {
    if (!Array.isArray(buckets)) return [];
    if (deleteAll) {
      for (const b of buckets as ArchivedSettlementBucket[]) {
        removed += b?.records?.length ?? 0;
      }
      return [];
    }
    return (buckets as ArchivedSettlementBucket[])
      .map((b) => ({
        ...b,
        records: filterRecs(Array.isArray(b?.records) ? b.records : []),
      }))
      .filter((b) => (Array.isArray(b.records) ? b.records.length : 0) > 0);
  };

  const out = arr.map((item) => {
    if (!item || typeof item !== 'object') return item;
    const o = item as Record<string, unknown>;
    const copy: Record<string, unknown> = { ...o };
    if (storeKey === 'cardMerchantSettlements') {
      copy.withdrawals = filterRecs(Array.isArray(o.withdrawals) ? o.withdrawals : []);
      copy.archivedWithdrawals = sanitizeArch(o.archivedWithdrawals);
      copy.history = filterRecsByTimeKey(Array.isArray(o.history) ? o.history : [], 'timestamp');
    } else if (storeKey === 'paymentProviderSettlements') {
      copy.recharges = filterRecs(Array.isArray(o.recharges) ? o.recharges : []);
      copy.archivedRecharges = sanitizeArch(o.archivedRecharges);
      copy.history = filterRecsByTimeKey(Array.isArray(o.history) ? o.history : [], 'timestamp');
    }
    return copy;
  });

  return { json: JSON.stringify(out), removed };
}

/**
 * 校验「当前登录员工」的密码，用于数据删除等敏感操作。
 * 必须与员工登录（auth/repository）一致：使用 bcrypt。
 * 旧版曾错误使用 SHA2(密码)，此处对仅存 SHA256 十六进制的历史数据做兼容。
 */
export async function verifyAdminPasswordRepository(
  username: string,
  password: string
): Promise<boolean> {
  const row = await queryOne<{ password_hash: string | null; status: string }>(
    `SELECT password_hash, status FROM employees WHERE username = ? LIMIT 1`,
    [username]
  );
  if (!row || row.status !== 'active' || !row.password_hash) return false;
  const stored = row.password_hash.trim();

  if (stored.startsWith('$2a$') || stored.startsWith('$2b$') || stored.startsWith('$2y$')) {
    return bcrypt.compare(password, stored);
  }

  const shaHex = crypto.createHash('sha256').update(password, 'utf8').digest('hex');
  if (stored.toLowerCase() === shaHex.toLowerCase()) return true;

  return false;
}

export async function bulkDeleteRepository(
  params: {
    retainMonths: number;
    deleteSelections: BulkDeleteSelections;
    tenantId?: string | null;
  }
): Promise<{
  deletedSummary: { table: string; count: number }[];
  errors: string[];
  warnings: string[];
}> {
  const { retainMonths, deleteSelections, tenantId } = params;
  const errors: string[] = [];
  /** 非致命：删除主数据仍会继续（如订单活动回滚部分失败） */
  const warnings: string[] = [];
  const deletedSummary: { table: string; count: number }[] = [];

  const deleteAll = retainMonths === 0;
  const cutoffDate = new Date();
  if (!deleteAll) cutoffDate.setMonth(cutoffDate.getMonth() - retainMonths);
  const pad = (n: number) => String(n).padStart(2, '0');
  const cutoffDateStr = `${cutoffDate.getFullYear()}-${pad(cutoffDate.getMonth() + 1)}-${pad(cutoffDate.getDate())} ${pad(cutoffDate.getHours())}:${pad(cutoffDate.getMinutes())}:${pad(cutoffDate.getSeconds())}`;

  const members = deleteSelections.members ?? { memberManagement: false, activityGift: false, pointsLedger: false };
  const shiftData = deleteSelections.shiftData ?? { shiftHandovers: false, shiftReceivers: false };
  const merchantSettlement = deleteSelections.merchantSettlement ?? { balanceChangeLogs: false, initialBalances: false };
  const knowledgeData = deleteSelections.knowledgeData ?? { categories: false, articles: false };
  const preserveActivityData = deleteSelections.preserveActivityData ?? true;

  const legacyActivity = members.activityData === true;
  const wantActivityLotteryLogs = members.activityLotteryLogs === true || legacyActivity;
  const wantActivityCheckIns = members.activityCheckIns === true || legacyActivity;
  const wantActivitySpinOrder = members.activitySpinOrder === true || legacyActivity;
  const wantActivitySpinShare = members.activitySpinShare === true || legacyActivity;
  const wantActivitySpinInvite = members.activitySpinInvite === true || legacyActivity;
  const wantActivitySpinOther = members.activitySpinOther === true || legacyActivity;
  const wantActivityMemberSummary = members.activityMemberSummary === true || legacyActivity;

  /** 安全 COUNT：查不到行数时返回 0 而不抛出 */
  const safeCount = async (sql: string, vals: unknown[]): Promise<number> => {
    try {
      const rows = await query<{ cnt: number }>(sql, vals);
      return Number(rows[0]?.cnt ?? 0);
    } catch (e: unknown) {
      errors.push(`COUNT query failed: ${e instanceof Error ? e.message : String(e)}`);
      return 0;
    }
  };

  try {
  // 收集订单 ID
  let orderIdsToDelete: string[] = [];
  if (deleteSelections.orders) {
    let offset = 0;
    while (true) {
      const conditions: string[] = [];
      const values: unknown[] = [];
      if (deleteAll) { conditions.push('id <> ?'); values.push(NULL_UUID); }
      else { conditions.push('created_at < ?'); values.push(cutoffDateStr); }
      if (tenantId) { conditions.push('tenant_id = ?'); values.push(tenantId); }
      values.push(FETCH_BATCH, offset);
      const batch = await query<{ id: string }>(
        `SELECT id FROM orders WHERE ${conditions.join(' AND ')} LIMIT ? OFFSET ?`,
        values
      );
      if (!batch || batch.length === 0) break;
      orderIdsToDelete = orderIdsToDelete.concat(batch.map((o) => o.id));
      if (batch.length < FETCH_BATCH) break;
      offset += FETCH_BATCH;
    }
  }

  // 收集会员 ID 和 member_code
  let memberIdsToDelete: string[] = [];
  let memberCodesToDelete: string[] = [];
  if (members.memberManagement) {
    let offset = 0;
    while (true) {
      const conditions: string[] = [];
      const values: unknown[] = [];
      if (deleteAll) { conditions.push('id <> ?'); values.push(NULL_UUID); }
      else { conditions.push('created_at < ?'); values.push(cutoffDateStr); }
      if (tenantId) { conditions.push('tenant_id = ?'); values.push(tenantId); }
      values.push(FETCH_BATCH, offset);
      const batch = await query<{ id: string; member_code?: string }>(
        `SELECT id, member_code FROM members WHERE ${conditions.join(' AND ')} LIMIT ? OFFSET ?`,
        values
      );
      if (!batch || batch.length === 0) break;
      memberIdsToDelete = memberIdsToDelete.concat(batch.map((m) => m.id));
      memberCodesToDelete = memberCodesToDelete.concat(
        batch.map((m) => m.member_code).filter(Boolean) as string[]
      );
      if (batch.length < FETCH_BATCH) break;
      offset += FETCH_BATCH;
    }
  }

  // 0. 订单删除前：回收活动数据
  if (orderIdsToDelete.length > 0 && deleteSelections.recycleActivityDataOnOrderDelete) {
    const { reversed, errors: revErrors } = await reverseActivityDataForOrderBatch(orderIdsToDelete);
    if (revErrors.length > 0) {
      // 将技术错误合并为用户友好的汇总提示，避免显示 UUID 等技术细节
      const insufficientCount = revErrors.filter(e => e.includes('INSUFFICIENT_POINTS')).length;
      const otherErrors = revErrors.filter(e => !e.includes('INSUFFICIENT_POINTS'));
      if (insufficientCount > 0) {
        warnings.push(`${insufficientCount} order(s) points already used; point reversal skipped (order deletion continues)`);
      }
      for (const e of otherErrors) warnings.push(`Order activity rollback: ${e}`);
      console.warn('[bulkDelete] Order reversal warnings:', revErrors);
    } else if (reversed > 0) {
      console.log('[bulkDelete] Reversed activity data for', reversed, 'orders');
    }
  }

  // Helper: batch IN clause for MySQL
  const batchIn = (ids: string[]) => ids.map(() => '?').join(',');

  // 1. points_ledger - 订单关联
  if (orderIdsToDelete.length > 0) {
    for (let i = 0; i < orderIdsToDelete.length; i += BATCH_SIZE) {
      const batch = orderIdsToDelete.slice(i, i + BATCH_SIZE);
      if (members.pointsLedger) {
        try {
          await execute(`DELETE FROM points_ledger WHERE order_id IN (${batchIn(batch)})`, batch);
        } catch (e: unknown) { errors.push(`points_ledger(order) batch ${Math.floor(i / BATCH_SIZE) + 1}: ${e instanceof Error ? e.message : String(e)}`); }
      } else {
        try {
          await execute(`UPDATE points_ledger SET order_id = NULL WHERE order_id IN (${batchIn(batch)})`, batch);
        } catch (e: unknown) { errors.push(`points_ledger unlink(order) batch: ${e instanceof Error ? e.message : String(e)}`); }
      }
    }
  }

  // 2. points_ledger - 会员关联
  if (memberIdsToDelete.length > 0) {
    for (let i = 0; i < memberIdsToDelete.length; i += BATCH_SIZE) {
      const batch = memberIdsToDelete.slice(i, i + BATCH_SIZE);
      if (members.pointsLedger) {
        try {
          await execute(`DELETE FROM points_ledger WHERE member_id IN (${batchIn(batch)})`, batch);
        } catch (e: unknown) { errors.push(`points_ledger(member) batch: ${e instanceof Error ? e.message : String(e)}`); }
      } else {
        try {
          await execute(`UPDATE points_ledger SET member_id = NULL WHERE member_id IN (${batchIn(batch)})`, batch);
        } catch (e: unknown) { errors.push(`points_ledger unlink(member) batch: ${e instanceof Error ? e.message : String(e)}`); }
      }
    }
  }

  // 3. points_ledger 按保留策略清扫（与 1/2 步互补：1/2 只删「待删订单/会员」关联行；
  //    若同时勾选订单/会员，旧逻辑会跳过本步，导致无 order_id、或会员不在删除批次内的流水残留）
  if (members.pointsLedger) {
    if (tenantId) {
      const tenantScope =
        '(pl.tenant_id = ? OR (pl.tenant_id IS NULL AND m.tenant_id = ?))';
      const dateCond = deleteAll ? 'pl.id <> ?' : 'pl.created_at < ?';
      const dateVal = deleteAll ? NULL_UUID : cutoffDateStr;
      const cntSql = `SELECT COUNT(*) as cnt FROM points_ledger pl
        LEFT JOIN members m ON m.id = pl.member_id
        WHERE ${tenantScope} AND ${dateCond}`;
      const cntVals: unknown[] = [tenantId, tenantId, dateVal];
      const cnt = await safeCount(cntSql, cntVals);
      const delSql = `DELETE pl FROM points_ledger pl
        LEFT JOIN members m ON m.id = pl.member_id
        WHERE ${tenantScope} AND ${dateCond}`;
      try {
        await execute(delSql, cntVals);
        if (cnt) deletedSummary.push({ table: 'Points ledger', count: cnt });
      } catch (e: unknown) {
        errors.push(`points_ledger: ${e instanceof Error ? e.message : String(e)}`);
      }
    } else {
      const cnt = await safeCount(
        deleteAll
          ? `SELECT COUNT(*) as cnt FROM points_ledger WHERE id <> ?`
          : `SELECT COUNT(*) as cnt FROM points_ledger WHERE created_at < ?`,
        [deleteAll ? NULL_UUID : cutoffDateStr]
      );
      try {
        if (deleteAll) await execute(`DELETE FROM points_ledger WHERE id <> ?`, [NULL_UUID]);
        else await execute(`DELETE FROM points_ledger WHERE created_at < ?`, [cutoffDateStr]);
        if (cnt) deletedSummary.push({ table: 'Points ledger', count: cnt });
      } catch (e: unknown) {
        errors.push(`points_ledger: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  // 4. activity_gifts
  if (members.activityGift) {
    let giftIdsToDelete: string[] = [];
    let offset = 0;
    while (true) {
      const cond = deleteAll ? 'id <> ?' : 'created_at < ?';
      const val = deleteAll ? NULL_UUID : cutoffDateStr;
      const batch = await query<{ id: string }>(
        `SELECT id FROM activity_gifts WHERE ${cond} LIMIT ? OFFSET ?`,
        [val, FETCH_BATCH, offset]
      );
      if (!batch || batch.length === 0) break;
      giftIdsToDelete = giftIdsToDelete.concat(batch.map((g) => g.id));
      if (batch.length < FETCH_BATCH) break;
      offset += FETCH_BATCH;
    }
    if (giftIdsToDelete.length > 0) {
      try {
        const { errors: revErrors } = await reverseGiftActivityDataBeforeDelete(giftIdsToDelete);
        for (const e of revErrors) warnings.push(`Activity gift rollback: ${e}`);
      } catch (e) {
        errors.push(`activity_gifts reversal: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    const cnt = await safeCount(
      deleteAll ? `SELECT COUNT(*) as cnt FROM activity_gifts WHERE id <> ?` : `SELECT COUNT(*) as cnt FROM activity_gifts WHERE created_at < ?`,
      [deleteAll ? NULL_UUID : cutoffDateStr]
    );
    try {
      if (deleteAll) await execute(`DELETE FROM activity_gifts WHERE id <> ?`, [NULL_UUID]);
      else await execute(`DELETE FROM activity_gifts WHERE created_at < ?`, [cutoffDateStr]);
      if (cnt) deletedSummary.push({ table: 'Activity gifts', count: cnt });
    } catch (e: unknown) { errors.push(`activity_gifts: ${e instanceof Error ? e.message : String(e)}`); }
  } else if (memberIdsToDelete.length > 0) {
    for (let i = 0; i < memberIdsToDelete.length; i += BATCH_SIZE) {
      const batch = memberIdsToDelete.slice(i, i + BATCH_SIZE);
      try {
        await execute(`UPDATE activity_gifts SET member_id = NULL WHERE member_id IN (${batchIn(batch)})`, batch);
      } catch (e: unknown) { errors.push(`activity_gifts unlink: ${e instanceof Error ? e.message : String(e)}`); }
    }
  }

  // 4b. 会员活动门户明细（与「会员系统 → 活动数据」五类 + 其他/签到发次数）
  if (
    tenantId &&
    (wantActivityLotteryLogs ||
      wantActivityCheckIns ||
      wantActivitySpinOrder ||
      wantActivitySpinShare ||
      wantActivitySpinInvite ||
      wantActivitySpinOther)
  ) {
    if (wantActivityLotteryLogs) {
      const cnt = await safeCount(
        deleteAll
          ? `SELECT COUNT(*) as cnt FROM lottery_logs l
             LEFT JOIN members m ON m.id = l.member_id
             WHERE l.tenant_id = ? OR (l.tenant_id IS NULL AND m.tenant_id = ?)`
          : `SELECT COUNT(*) as cnt FROM lottery_logs l
             LEFT JOIN members m ON m.id = l.member_id
             WHERE (l.tenant_id = ? OR (l.tenant_id IS NULL AND m.tenant_id = ?)) AND l.created_at < ?`,
        deleteAll ? [tenantId, tenantId] : [tenantId, tenantId, cutoffDateStr],
      );
      try {
        if (deleteAll) {
          await execute(
            `DELETE l FROM lottery_logs l
             LEFT JOIN members m ON m.id = l.member_id
             WHERE l.tenant_id = ? OR (l.tenant_id IS NULL AND m.tenant_id = ?)`,
            [tenantId, tenantId],
          );
        } else {
          await execute(
            `DELETE l FROM lottery_logs l
             LEFT JOIN members m ON m.id = l.member_id
             WHERE (l.tenant_id = ? OR (l.tenant_id IS NULL AND m.tenant_id = ?)) AND l.created_at < ?`,
            [tenantId, tenantId, cutoffDateStr],
          );
        }
        if (cnt) deletedSummary.push({ table: 'Lottery logs', count: cnt });
      } catch (e: unknown) {
        errors.push(`lottery_logs: ${e instanceof Error ? e.message : String(e)}`);
      }
      if (!members.pointsLedger) {
        const plc = await safeCount(
          deleteAll
            ? `SELECT COUNT(*) as cnt FROM points_ledger pl
               INNER JOIN members m ON m.id = pl.member_id
               WHERE m.tenant_id = ? AND (pl.type = 'lottery' OR pl.transaction_type = 'lottery')`
            : `SELECT COUNT(*) as cnt FROM points_ledger pl
               INNER JOIN members m ON m.id = pl.member_id
               WHERE m.tenant_id = ? AND (pl.type = 'lottery' OR pl.transaction_type = 'lottery') AND pl.created_at < ?`,
          deleteAll ? [tenantId] : [tenantId, cutoffDateStr],
        );
        try {
          if (deleteAll) {
            await execute(
              `DELETE pl FROM points_ledger pl
               INNER JOIN members m ON m.id = pl.member_id
               WHERE m.tenant_id = ? AND (pl.type = 'lottery' OR pl.transaction_type = 'lottery')`,
              [tenantId],
            );
          } else {
            await execute(
              `DELETE pl FROM points_ledger pl
               INNER JOIN members m ON m.id = pl.member_id
               WHERE m.tenant_id = ? AND (pl.type = 'lottery' OR pl.transaction_type = 'lottery') AND pl.created_at < ?`,
              [tenantId, cutoffDateStr],
            );
          }
          if (plc) deletedSummary.push({ table: 'Lottery points ledger', count: plc });
        } catch (e: unknown) {
          errors.push(`points_ledger(lottery): ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    }

    if (wantActivityCheckIns) {
      const cnt = await safeCount(
        deleteAll
          ? `SELECT COUNT(*) as cnt FROM check_ins c
             INNER JOIN members m ON m.id = c.member_id
             WHERE m.tenant_id = ?`
          : `SELECT COUNT(*) as cnt FROM check_ins c
             INNER JOIN members m ON m.id = c.member_id
             WHERE m.tenant_id = ? AND c.created_at < ?`,
        deleteAll ? [tenantId] : [tenantId, cutoffDateStr],
      );
      try {
        if (deleteAll) {
          await execute(
            `DELETE c FROM check_ins c
             INNER JOIN members m ON m.id = c.member_id
             WHERE m.tenant_id = ?`,
            [tenantId],
          );
        } else {
          await execute(
            `DELETE c FROM check_ins c
             INNER JOIN members m ON m.id = c.member_id
             WHERE m.tenant_id = ? AND c.created_at < ?`,
            [tenantId, cutoffDateStr],
          );
        }
        if (cnt) deletedSummary.push({ table: 'Check-in logs', count: cnt });
      } catch (e: unknown) {
        errors.push(`check_ins: ${e instanceof Error ? e.message : String(e)}`);
      }
      const scc = await safeCount(
        deleteAll
          ? `SELECT COUNT(*) as cnt FROM spin_credits sc
             INNER JOIN members m ON m.id = sc.member_id
             WHERE m.tenant_id = ? AND sc.source = 'check_in'`
          : `SELECT COUNT(*) as cnt FROM spin_credits sc
             INNER JOIN members m ON m.id = sc.member_id
             WHERE m.tenant_id = ? AND sc.source = 'check_in' AND sc.created_at < ?`,
        deleteAll ? [tenantId] : [tenantId, cutoffDateStr],
      );
      try {
        if (deleteAll) {
          await execute(
            `DELETE sc FROM spin_credits sc
             INNER JOIN members m ON m.id = sc.member_id
             WHERE m.tenant_id = ? AND sc.source = 'check_in'`,
            [tenantId],
          );
        } else {
          await execute(
            `DELETE sc FROM spin_credits sc
             INNER JOIN members m ON m.id = sc.member_id
             WHERE m.tenant_id = ? AND sc.source = 'check_in' AND sc.created_at < ?`,
            [tenantId, cutoffDateStr],
          );
        }
        if (scc) deletedSummary.push({ table: 'Check-in spin credits', count: scc });
      } catch (e: unknown) {
        errors.push(`spin_credits(check_in): ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    const spinBase = `DELETE sc FROM spin_credits sc
     INNER JOIN members m ON m.id = sc.member_id
     WHERE m.tenant_id = ?`;
    const spinDate = deleteAll ? '' : ' AND sc.created_at < ?';
    const runSpinCat = async (label: string, extraWhere: string): Promise<void> => {
      const cnt = await safeCount(
        deleteAll
          ? `SELECT COUNT(*) as cnt FROM spin_credits sc
             INNER JOIN members m ON m.id = sc.member_id
             WHERE m.tenant_id = ? AND (${extraWhere})`
          : `SELECT COUNT(*) as cnt FROM spin_credits sc
             INNER JOIN members m ON m.id = sc.member_id
             WHERE m.tenant_id = ? AND (${extraWhere}) AND sc.created_at < ?`,
        deleteAll ? [tenantId] : [tenantId, cutoffDateStr],
      );
      try {
        if (deleteAll) {
          await execute(`${spinBase} AND (${extraWhere})`, [tenantId]);
        } else {
          await execute(`${spinBase} AND (${extraWhere})${spinDate}`, [tenantId, cutoffDateStr]);
        }
        if (cnt) deletedSummary.push({ table: label, count: cnt });
      } catch (e: unknown) {
        errors.push(`${label}: ${e instanceof Error ? e.message : String(e)}`);
      }
    };

    if (wantActivitySpinOrder) {
      await runSpinCat('Order spin credits', `sc.source LIKE 'order_completed:%'`);
    }
    if (wantActivitySpinShare) {
      await runSpinCat('Share spin credits', `sc.source = 'share'`);
    }
    if (wantActivitySpinInvite) {
      await runSpinCat('Invite spin credits', `sc.source IN ('referral','invite_welcome')`);
    }
    if (wantActivitySpinOther) {
      await runSpinCat(
        'Other spin credits',
        `sc.source NOT LIKE 'order_completed:%' AND sc.source <> 'share' AND sc.source NOT IN ('referral','invite_welcome') AND sc.source <> 'check_in'`,
      );
    }
  }

  // 4c. 商城兑换订单 (redemptions where type='mall')
  if (tenantId && (members.activityMallRedemptions === true || legacyActivity)) {
    try {
      const cntSql = deleteAll
        ? `SELECT COUNT(*) as cnt FROM redemptions r
           INNER JOIN members m ON m.id = r.member_id
           WHERE m.tenant_id <=> ?
             AND (r.mall_item_id IS NOT NULL OR LOWER(TRIM(COALESCE(r.type, ''))) = 'mall')`
        : `SELECT COUNT(*) as cnt FROM redemptions r
           INNER JOIN members m ON m.id = r.member_id
           WHERE m.tenant_id <=> ? AND r.created_at < ?
             AND (r.mall_item_id IS NOT NULL OR LOWER(TRIM(COALESCE(r.type, ''))) = 'mall')`;
      const cntVals = deleteAll ? [tenantId] : [tenantId, cutoffDateStr];
      const cnt = await safeCount(cntSql, cntVals);
      if (cnt > 0) {
        const delSql = deleteAll
          ? `DELETE r FROM redemptions r
             INNER JOIN members m ON m.id = r.member_id
             WHERE m.tenant_id <=> ?
               AND (r.mall_item_id IS NOT NULL OR LOWER(TRIM(COALESCE(r.type, ''))) = 'mall')`
          : `DELETE r FROM redemptions r
             INNER JOIN members m ON m.id = r.member_id
             WHERE m.tenant_id <=> ? AND r.created_at < ?
               AND (r.mall_item_id IS NOT NULL OR LOWER(TRIM(COALESCE(r.type, ''))) = 'mall')`;
        await execute(delSql, deleteAll ? [tenantId] : [tenantId, cutoffDateStr]);
        deletedSummary.push({ table: 'Mall redemptions', count: cnt });
      }
    } catch (e: unknown) {
      errors.push(`Mall redemptions: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // 5. member_activity
  // 表结构 member_id 为 NOT NULL：删除会员时只能删除对应活动行，不能 SET NULL。
  // preserveActivityData 仅影响下方「整表按条件清空」，不应用于「按会员删除」。
  if (memberIdsToDelete.length > 0) {
    let deletedCount = 0;
    for (let i = 0; i < memberIdsToDelete.length; i += BATCH_SIZE) {
      const batch = memberIdsToDelete.slice(i, i + BATCH_SIZE);
      try {
        const hdr = await execute(`DELETE FROM member_activity WHERE member_id IN (${batchIn(batch)})`, batch);
        deletedCount += hdr.affectedRows ?? 0;
      } catch (e: unknown) { errors.push(`member_activity: ${e instanceof Error ? e.message : String(e)}`); }
    }
    if (deletedCount > 0) deletedSummary.push({ table: 'Member activity', count: deletedCount });
  } else if (wantActivityMemberSummary && !preserveActivityData && deleteAll) {
    const cnt = await safeCount(`SELECT COUNT(*) as cnt FROM member_activity WHERE id <> ?`, [NULL_UUID]);
    try {
      await execute(`DELETE FROM member_activity WHERE id <> ?`, [NULL_UUID]);
      if (cnt) deletedSummary.push({ table: 'Member activity', count: cnt });
    } catch (e: unknown) { errors.push(`member_activity: ${e instanceof Error ? e.message : String(e)}`); }
  }

  // 6. points_accounts（fk_points_accounts_member → members：删会员前必须删账户）
  // 删账户前须先删引用 account_id 的 points_ledger（fk_points_ledger_account）。
  // 不受 preserveActivityData 影响：保留活动汇总与删除会员不可兼得。
  let pointsAccountsDeletedForMembers = 0;
  if (memberIdsToDelete.length > 0) {
    for (let i = 0; i < memberIdsToDelete.length; i += BATCH_SIZE) {
      const batch = memberIdsToDelete.slice(i, i + BATCH_SIZE);
      const ph = batchIn(batch);
      try {
        await execute(
          `DELETE pl FROM points_ledger pl
           INNER JOIN points_accounts pa ON pa.id = pl.account_id
           WHERE pa.member_id IN (${ph})`,
          batch,
        );
        await execute(`DELETE FROM points_ledger WHERE member_id IN (${ph})`, batch);
        const accHdr = await execute(`DELETE FROM points_accounts WHERE member_id IN (${ph})`, batch);
        pointsAccountsDeletedForMembers += accHdr.affectedRows ?? 0;
      } catch (e: unknown) { errors.push(`points_accounts: ${e instanceof Error ? e.message : String(e)}`); }
    }
    if (pointsAccountsDeletedForMembers > 0) {
      deletedSummary.push({ table: 'Points accounts', count: pointsAccountsDeletedForMembers });
    }
  } else if (memberCodesToDelete.length > 0 && !preserveActivityData) {
    for (let i = 0; i < memberCodesToDelete.length; i += BATCH_SIZE) {
      const batch = memberCodesToDelete.slice(i, i + BATCH_SIZE);
      try {
        await execute(`DELETE FROM points_accounts WHERE member_code IN (${batchIn(batch)})`, batch);
      } catch (e: unknown) { errors.push(`points_accounts: ${e instanceof Error ? e.message : String(e)}`); }
    }
  } else if (wantActivityMemberSummary && !preserveActivityData && deleteAll) {
    const cnt = await safeCount(`SELECT COUNT(*) as cnt FROM points_accounts WHERE id <> ?`, [NULL_UUID]);
    try {
      await execute(`DELETE FROM points_accounts WHERE id <> ?`, [NULL_UUID]);
      if (cnt) deletedSummary.push({ table: 'Points accounts', count: cnt });
    } catch (e: unknown) { errors.push(`points_accounts: ${e instanceof Error ? e.message : String(e)}`); }
  }

  // 7. 解绑 orders.member_id
  if (memberIdsToDelete.length > 0 && !deleteSelections.orders) {
    for (let i = 0; i < memberIdsToDelete.length; i += BATCH_SIZE) {
      const batch = memberIdsToDelete.slice(i, i + BATCH_SIZE);
      try {
        await execute(`UPDATE orders SET member_id = NULL WHERE member_id IN (${batchIn(batch)})`, batch);
      } catch (e: unknown) { errors.push(`orders unlink member: ${e instanceof Error ? e.message : String(e)}`); }
    }
  }

  // 8. 删除订单
  if (orderIdsToDelete.length > 0) {
    for (let i = 0; i < orderIdsToDelete.length; i += BATCH_SIZE) {
      const batch = orderIdsToDelete.slice(i, i + BATCH_SIZE);
      try {
        await execute(`DELETE FROM meika_zone_order_links WHERE order_id IN (${batchIn(batch)})`, batch);
      } catch { /* table may not exist yet */ }
    }
    let deletedCount = 0;
    for (let i = 0; i < orderIdsToDelete.length; i += BATCH_SIZE) {
      const batch = orderIdsToDelete.slice(i, i + BATCH_SIZE);
      try {
        if (tenantId) {
          await execute(`DELETE FROM orders WHERE id IN (${batchIn(batch)}) AND tenant_id = ?`, [...batch, tenantId]);
        } else {
          await execute(`DELETE FROM orders WHERE id IN (${batchIn(batch)})`, batch);
        }
        deletedCount += batch.length;
      } catch (e: unknown) { errors.push(`orders batch: ${e instanceof Error ? e.message : String(e)}`); }
    }
    if (deletedCount > 0) deletedSummary.push({ table: 'Orders', count: deletedCount });
  }

  // 9. referral_relations
  if (deleteSelections.referralRelations) {
    const cond = deleteAll ? 'id <> ?' : 'created_at < ?';
    const val = deleteAll ? NULL_UUID : cutoffDateStr;
    const cnt = await safeCount(`SELECT COUNT(*) as cnt FROM referral_relations WHERE ${cond}`, [val]);
    try {
      await execute(`DELETE FROM referral_relations WHERE ${cond}`, [val]);
      if (cnt) deletedSummary.push({ table: 'Referral relations', count: cnt });
    } catch (e: unknown) { errors.push(`referral_relations: ${e instanceof Error ? e.message : String(e)}`); }
  }

  // 10. ledger_transactions + balance_change_logs
  if (merchantSettlement.balanceChangeLogs) {
    const cond = deleteAll ? 'id <> ?' : 'created_at < ?';
    const val = deleteAll ? NULL_UUID : cutoffDateStr;

    const ledgerCount = await safeCount(`SELECT COUNT(*) as cnt FROM ledger_transactions WHERE ${cond}`, [val]);
    try {
      await execute(`DELETE FROM ledger_transactions WHERE ${cond}`, [val]);
      if (ledgerCount) deletedSummary.push({ table: 'Ledger transactions', count: ledgerCount });
    } catch (e: unknown) { errors.push(`ledger_transactions: ${e instanceof Error ? e.message : String(e)}`); }

    const balCount = await safeCount(`SELECT COUNT(*) as cnt FROM balance_change_logs WHERE ${cond}`, [val]);
    try {
      await execute(`DELETE FROM balance_change_logs WHERE ${cond}`, [val]);
      if (balCount) deletedSummary.push({ table: 'Balance change logs', count: balCount });
    } catch (e: unknown) { errors.push(`balance_change_logs: ${e instanceof Error ? e.message : String(e)}`); }

    // 10b. shared_data_store：卡商提款明细、代付充值明细（存于 JSON，与上一步 DB 表并列）
    const settlementKeys = ['cardMerchantSettlements', 'paymentProviderSettlements'] as const;
    const skPh = settlementKeys.map(() => '?').join(', ');
    let skWhere = `store_key IN (${skPh})`;
    const skVals: unknown[] = [...settlementKeys];
    if (tenantId) {
      skWhere = `${skWhere} AND tenant_id = ?`;
      skVals.push(tenantId);
    }
    try {
      const sdRows = await query<{ id: string; store_key: string; store_value: string | null }>(
        `SELECT id, store_key, store_value FROM shared_data_store WHERE ${skWhere}`,
        skVals
      );
      let settlementStripped = 0;
      let settlementRowsTouched = 0;
      for (const row of sdRows || []) {
        const sanitized = sanitizeSettlementStoreJson(row.store_key, row.store_value, deleteAll, cutoffDateStr);
        if (!sanitized) continue;
        if (sanitized.json === row.store_value) continue;
        await execute(`UPDATE shared_data_store SET store_value = ?, updated_at = NOW() WHERE id = ?`, [
          sanitized.json,
          row.id,
        ]);
        settlementStripped += sanitized.removed;
        settlementRowsTouched++;
      }
      if (settlementStripped > 0) {
        deletedSummary.push({ table: 'Merchant settlement withdrawal/recharge entries', count: settlementStripped });
      } else if (settlementRowsTouched > 0) {
        deletedSummary.push({ table: 'Merchant settlement withdrawal/recharge entries', count: settlementRowsTouched });
      }
    } catch (e: unknown) {
      errors.push(`shared_data_store(settlement JSON): ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // 11. shared_data_store（商家结算档案）
  // 实际读写使用列 store_key（见 data/repository）；卡商/代付数据键为 cardMerchantSettlements、paymentProviderSettlements。
  // 历史遗留可能还有 merchant_initial_balance_* / settlement_last_reset_*。
  if (merchantSettlement.initialBalances) {
    const exactKeys = ['cardMerchantSettlements', 'paymentProviderSettlements'];
    const ph = exactKeys.map(() => '?').join(', ');
    let where = `(store_key IN (${ph}) OR store_key LIKE 'merchant_initial_balance_%' OR store_key LIKE 'settlement_last_reset_%')`;
    const qvals: unknown[] = [...exactKeys];
    if (tenantId) {
      where = `(${where}) AND tenant_id = ?`;
      qvals.push(tenantId);
    }
    const balanceKeys = await query<{ id: string; store_key: string }>(
      `SELECT id, store_key FROM shared_data_store WHERE ${where}`,
      qvals
    );
    if (balanceKeys && balanceKeys.length > 0) {
      const ids = balanceKeys.map((k) => k.id);
      for (let i = 0; i < ids.length; i += BATCH_SIZE) {
        const batch = ids.slice(i, i + BATCH_SIZE);
        try {
          await execute(`DELETE FROM shared_data_store WHERE id IN (${batchIn(batch)})`, batch);
        } catch (e: unknown) { errors.push(`shared_data_store: ${e instanceof Error ? e.message : String(e)}`); }
      }
      deletedSummary.push({ table: 'Merchant settlement records', count: balanceKeys.length });
    }
  }

  // 12. 清理所有 FK 依赖表后删除会员
  if (memberIdsToDelete.length > 0) {
    const fkCleanups: Array<{ table: string; col: string; action: 'DELETE' | 'NULL' }> = [
      { table: 'check_ins', col: 'member_id', action: 'DELETE' },
      { table: 'gift_cards', col: 'member_id', action: 'NULL' },
      { table: 'member_invites', col: 'inviter_id', action: 'NULL' },
      { table: 'member_invites', col: 'invitee_id', action: 'NULL' },
      { table: 'member_login_logs', col: 'member_id', action: 'DELETE' },
      { table: 'member_transactions', col: 'member_id', action: 'DELETE' },
      { table: 'phone_pool', col: 'assigned_member_id', action: 'NULL' },
      { table: 'redemptions', col: 'member_id', action: 'DELETE' },
      { table: 'referral_events', col: 'referee_id', action: 'NULL' },
      { table: 'referral_events', col: 'referrer_id', action: 'NULL' },
      { table: 'referrals', col: 'referee_id', action: 'NULL' },
      { table: 'referrals', col: 'referrer_id', action: 'NULL' },
      { table: 'referral_relations', col: 'referrer_id', action: 'NULL' },
      { table: 'referral_relations', col: 'referee_id', action: 'NULL' },
      { table: 'risk_scores_legacy_by_member', col: 'member_id', action: 'DELETE' },
      { table: 'spin_credits', col: 'member_id', action: 'DELETE' },
      { table: 'spins', col: 'member_id', action: 'DELETE' },
    ];
    for (const fk of fkCleanups) {
      for (let i = 0; i < memberIdsToDelete.length; i += BATCH_SIZE) {
        const batch = memberIdsToDelete.slice(i, i + BATCH_SIZE);
        try {
          if (fk.action === 'DELETE') {
            await execute(`DELETE FROM \`${fk.table}\` WHERE \`${fk.col}\` IN (${batchIn(batch)})`, batch);
          } else {
            await execute(`UPDATE \`${fk.table}\` SET \`${fk.col}\` = NULL WHERE \`${fk.col}\` IN (${batchIn(batch)})`, batch);
          }
        } catch { /* table may not exist or column nullable — safe to skip */ }
      }
    }

    let deletedCount = 0;
    for (let i = 0; i < memberIdsToDelete.length; i += BATCH_SIZE) {
      const batch = memberIdsToDelete.slice(i, i + BATCH_SIZE);
      try {
        if (tenantId) {
          await execute(`DELETE FROM members WHERE id IN (${batchIn(batch)}) AND tenant_id = ?`, [...batch, tenantId]);
        } else {
          await execute(`DELETE FROM members WHERE id IN (${batchIn(batch)})`, batch);
        }
        deletedCount += batch.length;
      } catch (e: unknown) { errors.push(`members batch: ${e instanceof Error ? e.message : String(e)}`); }
    }
    if (deletedCount > 0) deletedSummary.push({ table: 'Users', count: deletedCount });
  }

  // 13. shift_handovers
  if (shiftData.shiftHandovers) {
    const cond = deleteAll ? 'id <> ?' : 'created_at < ?';
    const val = deleteAll ? NULL_UUID : cutoffDateStr;
    const cnt = await safeCount(`SELECT COUNT(*) as cnt FROM shift_handovers WHERE ${cond}`, [val]);
    try {
      await execute(`DELETE FROM shift_handovers WHERE ${cond}`, [val]);
      if (cnt) deletedSummary.push({ table: 'Shift handovers', count: cnt });
    } catch (e: unknown) { errors.push(`shift_handovers: ${e instanceof Error ? e.message : String(e)}`); }
  }

  // 14. shift_receivers
  if (shiftData.shiftReceivers) {
    const cnt = await safeCount(`SELECT COUNT(*) as cnt FROM shift_receivers WHERE id <> ?`, [NULL_UUID]);
    try {
      await execute(`DELETE FROM shift_receivers WHERE id <> ?`, [NULL_UUID]);
      if (cnt) deletedSummary.push({ table: 'Shift receivers', count: cnt });
    } catch (e: unknown) { errors.push(`shift_receivers: ${e instanceof Error ? e.message : String(e)}`); }
  }

  // 15. audit_records
  if (deleteSelections.auditRecords) {
    const cond = deleteAll ? 'id <> ?' : 'created_at < ?';
    const val = deleteAll ? NULL_UUID : cutoffDateStr;
    const cnt = await safeCount(`SELECT COUNT(*) as cnt FROM audit_records WHERE ${cond}`, [val]);
    try {
      await execute(`DELETE FROM audit_records WHERE ${cond}`, [val]);
      if (cnt) deletedSummary.push({ table: 'Audit records', count: cnt });
    } catch (e: unknown) { errors.push(`audit_records: ${e instanceof Error ? e.message : String(e)}`); }
  }

  // 16. operation_logs
  if (deleteSelections.operationLogs) {
    const cond = deleteAll ? 'id <> ?' : 'timestamp < ?';
    const val = deleteAll ? NULL_UUID : cutoffDateStr;
    const cnt = await safeCount(`SELECT COUNT(*) as cnt FROM operation_logs WHERE ${cond}`, [val]);
    try {
      await execute(`DELETE FROM operation_logs WHERE ${cond}`, [val]);
      if (cnt) deletedSummary.push({ table: 'Operation logs', count: cnt });
    } catch (e: unknown) { errors.push(`operation_logs: ${e instanceof Error ? e.message : String(e)}`); }
  }

  // 17. employee_login_logs
  if (deleteSelections.loginLogs) {
    const cond = deleteAll ? 'id <> ?' : 'login_time < ?';
    const val = deleteAll ? NULL_UUID : cutoffDateStr;
    const cnt = await safeCount(`SELECT COUNT(*) as cnt FROM employee_login_logs WHERE ${cond}`, [val]);
    try {
      await execute(`DELETE FROM employee_login_logs WHERE ${cond}`, [val]);
      if (cnt) deletedSummary.push({ table: 'Login logs', count: cnt });
    } catch (e: unknown) { errors.push(`employee_login_logs: ${e instanceof Error ? e.message : String(e)}`); }
  }

  // 18. knowledge_articles（先清已读状态，避免孤立行 / 外键约束）
  if (knowledgeData.articles) {
    const cond = deleteAll ? 'id <> ?' : 'created_at < ?';
    const artJoinCond = deleteAll ? 'a.id <> ?' : 'a.created_at < ?';
    const val = deleteAll ? NULL_UUID : cutoffDateStr;
    const cnt = await safeCount(`SELECT COUNT(*) as cnt FROM knowledge_articles WHERE ${cond}`, [val]);
    try {
      await execute(
        `DELETE rs FROM knowledge_read_status rs
         INNER JOIN knowledge_articles a ON a.id = rs.article_id
         WHERE ${artJoinCond}`,
        [val],
      );
      await execute(`DELETE FROM knowledge_articles WHERE ${cond}`, [val]);
      if (cnt) deletedSummary.push({ table: 'Knowledge articles', count: cnt });
    } catch (e: unknown) { errors.push(`knowledge_articles: ${e instanceof Error ? e.message : String(e)}`); }
  }

  // 19. knowledge_categories (after articles)
  if (knowledgeData.categories) {
    const cnt = await safeCount(`SELECT COUNT(*) as cnt FROM knowledge_categories WHERE id <> ?`, [NULL_UUID]);
    try {
      await execute(`DELETE FROM knowledge_categories WHERE id <> ?`, [NULL_UUID]);
      if (cnt) deletedSummary.push({ table: 'Knowledge categories', count: cnt });
    } catch (e: unknown) { errors.push(`knowledge_categories: ${e instanceof Error ? e.message : String(e)}`); }
  }

  // 20. task_items (maintenance history / progress — delete before tasks to avoid FK)
  const taskData = deleteSelections.taskData ?? { tasks: false, taskItems: false };
  if (taskData.taskItems) {
    const cond = deleteAll ? 'id <> ?' : 'created_at < ?';
    const val = deleteAll ? NULL_UUID : cutoffDateStr;
    const cnt = await safeCount(`SELECT COUNT(*) as cnt FROM task_items WHERE ${cond}`, [val]);
    try {
      await execute(`DELETE FROM task_items WHERE ${cond}`, [val]);
      if (cnt) deletedSummary.push({ table: 'Maintenance history', count: cnt });
    } catch (e: unknown) { errors.push(`task_items: ${e instanceof Error ? e.message : String(e)}`); }
  }

  // 21. tasks (after task_items)
  if (taskData.tasks) {
    const cond = deleteAll ? 'id <> ?' : 'created_at < ?';
    const val = deleteAll ? NULL_UUID : cutoffDateStr;
    try {
      await execute(`DELETE FROM task_comments WHERE task_id IN (SELECT id FROM tasks WHERE ${cond})`, [val]);
    } catch { /* task_comments may not exist */ }
    try {
      await execute(`DELETE FROM task_items WHERE task_id IN (SELECT id FROM tasks WHERE ${cond})`, [val]);
    } catch { /* already deleted above or empty */ }
    const cnt = await safeCount(`SELECT COUNT(*) as cnt FROM tasks WHERE ${cond}`, [val]);
    try {
      await execute(`DELETE FROM tasks WHERE ${cond}`, [val]);
      if (cnt) deletedSummary.push({ table: 'Work tasks', count: cnt });
    } catch (e: unknown) { errors.push(`tasks: ${e instanceof Error ? e.message : String(e)}`); }
    try {
      await execute(`DELETE FROM task_posters WHERE ${deleteAll ? 'id <> ?' : 'created_at < ?'}`, [val]);
    } catch { /* task_posters may not exist */ }
    try {
      await execute(`DELETE FROM task_templates WHERE ${deleteAll ? 'id <> ?' : 'created_at < ?'}`, [val]);
    } catch { /* task_templates may not exist */ }
  }

  // 22. extract_settings (提取设置记录)
  if (taskData.tasks || taskData.taskItems) {
    try {
      const esCond = deleteAll ? 'id <> ?' : 'created_at < ?';
      const esVal = deleteAll ? NULL_UUID : cutoffDateStr;
      const esCnt = await safeCount(`SELECT COUNT(*) as cnt FROM extract_settings WHERE ${esCond}`, [esVal]);
      if (esCnt > 0) {
        await execute(`DELETE FROM extract_settings WHERE ${esCond}`, [esVal]);
        deletedSummary.push({ table: 'Extract settings', count: esCnt });
      }
    } catch { /* extract_settings may not exist */ }
  }

  } catch (topErr: unknown) {
    const msg = topErr instanceof Error ? topErr.message : String(topErr);
    console.error('[bulkDelete] Unexpected top-level error:', msg);
    errors.push(`System error: ${msg}`);
  }

  return { deletedSummary, errors, warnings };
}

export async function deleteOrderByIdRepository(
  orderId: string,
  tenantId?: string | null
): Promise<{ success: boolean; error?: string }> {
  const revResult = await reverseActivityDataForOrder(orderId);
  if (!revResult.ok) {
    console.warn('[deleteOrderById] Reversal failed:', revResult.error);
  }

  // 解绑 points_ledger
  try {
    await execute(`UPDATE points_ledger SET order_id = NULL WHERE order_id = ?`, [orderId]);
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }

  try {
    await execute(`DELETE FROM meika_zone_order_links WHERE order_id = ?`, [orderId]);
  } catch { /* table may not exist yet */ }

  try {
    if (tenantId) {
      await execute(`DELETE FROM orders WHERE id = ? AND tenant_id = ?`, [orderId, tenantId]);
    } else {
      await execute(`DELETE FROM orders WHERE id = ?`, [orderId]);
    }
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
  return { success: true };
}

export async function deleteMemberByIdRepository(
  memberId: string,
  tenantId?: string | null
): Promise<{ success: boolean; error?: string }> {
  const errors: string[] = [];

  try {
    await execute(
      `DELETE pl FROM points_ledger pl
       INNER JOIN points_accounts pa ON pa.id = pl.account_id
       WHERE pa.member_id = ?`,
      [memberId],
    );
  } catch (e: unknown) { errors.push(e instanceof Error ? e.message : String(e)); }

  try {
    await execute(`DELETE FROM points_ledger WHERE member_id = ?`, [memberId]);
  } catch (e: unknown) { errors.push(e instanceof Error ? e.message : String(e)); }

  try { await execute(`UPDATE activity_gifts SET member_id = NULL WHERE member_id = ?`, [memberId]); }
  catch (e: unknown) { errors.push(e instanceof Error ? e.message : String(e)); }

  try { await execute(`DELETE FROM member_activity WHERE member_id = ?`, [memberId]); }
  catch (e: unknown) { errors.push(e instanceof Error ? e.message : String(e)); }

  try {
    await execute(`DELETE FROM points_accounts WHERE member_id = ?`, [memberId]);
  } catch (e: unknown) { errors.push(e instanceof Error ? e.message : String(e)); }

  try { await execute(`UPDATE orders SET member_id = NULL WHERE member_id = ?`, [memberId]); }
  catch (e: unknown) { errors.push(e instanceof Error ? e.message : String(e)); }

  const fkCleanups: Array<{ sql: string; label: string }> = [
    { sql: `DELETE FROM check_ins WHERE member_id = ?`, label: 'check_ins' },
    { sql: `UPDATE gift_cards SET member_id = NULL WHERE member_id = ?`, label: 'gift_cards' },
    { sql: `UPDATE member_invites SET inviter_id = NULL WHERE inviter_id = ?`, label: 'member_invites(inviter)' },
    { sql: `UPDATE member_invites SET invitee_id = NULL WHERE invitee_id = ?`, label: 'member_invites(invitee)' },
    { sql: `DELETE FROM member_login_logs WHERE member_id = ?`, label: 'member_login_logs' },
    { sql: `DELETE FROM member_transactions WHERE member_id = ?`, label: 'member_transactions' },
    { sql: `UPDATE phone_pool SET assigned_member_id = NULL WHERE assigned_member_id = ?`, label: 'phone_pool' },
    { sql: `DELETE FROM redemptions WHERE member_id = ?`, label: 'redemptions' },
    { sql: `UPDATE referral_events SET referee_id = NULL WHERE referee_id = ?`, label: 'referral_events(referee)' },
    { sql: `UPDATE referral_events SET referrer_id = NULL WHERE referrer_id = ?`, label: 'referral_events(referrer)' },
    { sql: `UPDATE referrals SET referee_id = NULL WHERE referee_id = ?`, label: 'referrals(referee)' },
    { sql: `UPDATE referrals SET referrer_id = NULL WHERE referrer_id = ?`, label: 'referrals(referrer)' },
    { sql: `UPDATE referral_relations SET referrer_id = NULL WHERE referrer_id = ?`, label: 'referral_relations(referrer)' },
    { sql: `UPDATE referral_relations SET referee_id = NULL WHERE referee_id = ?`, label: 'referral_relations(referee)' },
    { sql: `DELETE FROM risk_scores_legacy_by_member WHERE member_id = ?`, label: 'risk_scores' },
    { sql: `DELETE FROM spin_credits WHERE member_id = ?`, label: 'spin_credits' },
    { sql: `DELETE FROM spins WHERE member_id = ?`, label: 'spins' },
  ];
  const fkWarnings: string[] = [];
  for (const fk of fkCleanups) {
    try {
      await execute(fk.sql, [memberId]);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      fkWarnings.push(`${fk.label}: ${msg}`);
    }
  }

  if (fkWarnings.length > 0) {
    console.warn(`[deleteMember] FK cleanup warnings for ${memberId}:`, fkWarnings);
    errors.push(`Related data cleanup partially failed (${fkWarnings.length}/${fkCleanups.length}): ${fkWarnings.slice(0, 3).join('; ')}${fkWarnings.length > 3 ? '...' : ''}`);
    return { success: false, error: errors.join('; ') };
  }

  try {
    if (tenantId) {
      await execute(`DELETE FROM members WHERE id = ? AND tenant_id = ?`, [memberId, tenantId]);
    } else {
      await execute(`DELETE FROM members WHERE id = ?`, [memberId]);
    }
  } catch (e: unknown) { errors.push(e instanceof Error ? e.message : String(e)); }

  if (errors.length > 0) return { success: false, error: errors.join('; ') };
  return { success: true };
}

export async function cleanupWebhookEventQueueRepository(
  processedRetentionDays: number,
  failedRetentionDays: number,
): Promise<number> {
  const r1 = await execute(
    `DELETE FROM \`webhook_event_queue\`
     WHERE \`status\` = 'processed' AND \`processed_at\` IS NOT NULL
       AND \`processed_at\` < DATE_SUB(NOW(3), INTERVAL ? DAY)`,
    [processedRetentionDays],
  );
  const r2 = await execute(
    `DELETE FROM \`webhook_event_queue\`
     WHERE \`status\` = 'failed' AND \`processed_at\` IS NOT NULL
       AND \`processed_at\` < DATE_SUB(NOW(3), INTERVAL ? DAY)`,
    [failedRetentionDays],
  );
  return (r1.affectedRows ?? 0) + (r2.affectedRows ?? 0);
}
