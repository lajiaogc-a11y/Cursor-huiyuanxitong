/**
 * RPC handlers (extracted from tableProxy)
 */
import type { Response } from 'express';
import type { ResultSetHeader } from 'mysql2';
import { query, queryOne, execute, getPool, withTransaction } from '../../database/index.js';
import type { AuthenticatedRequest } from '../../middlewares/auth.js';
import {
  type TableTier,
  getTableTier, isTableProxyAllowed, rejectTableAccess, isAdminUser,
  blockMemberTableProxy, blockPlatformSuperStaffInvitationCodes, assertRpcEmployee, effectiveMemberIdForRpc,
  mergeEmployeeAccessScope, TENANT_SCOPED_TABLES,
  mapColumnName, getReverseAliasMap, mapBodyColumns, COLUMN_ALIAS_MAP,
  toMySqlDatetime, parseFilters, parseOrder, SAFE_COLUMN_RE,
} from './tableConfig.js';

import { applyPointsLedgerDeltaOnConn } from '../points/pointsLedgerAccount.js';
import { addPoints, syncPointsLog } from '../points/pointsService.js';
import { insertOperationLogRepository } from './repository.js';
import { generateUniqueActivityGiftNumber } from '../../lib/giftNumber.js';
import { ensureOrderNumberForInsert } from '../orders/orderNumber.js';
import { draw, getQuota } from '../lottery/service.js';
import { grantOrderCompletedSpinCredits } from '../lottery/repository.js';
import { incrementLotterySpinBalanceConn } from '../lottery/spinBalanceAccount.js';
import { notifyMemberOrderCompletedSpinReward } from '../memberInboxNotifications/repository.js';
import { incrementMemberActivityForNewOrder } from '../members/memberActivityTotals.js';
import { reverseActivityDataForOrder } from '../admin/orderReversal.js';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { runWebhookProcessorRpc } from '../webhooks/rpcBridge.js';
import { runTenantMigrationRpc } from './tenantMigrationMysql.js';
import { buildMysqlUserLockName, mysqlGetLock, mysqlReleaseLock } from '../../lib/mysqlUserLock.js';
import { parsePortalCheckInNumbers, rewardBreakdownForConsecutiveDay } from '../../lib/checkInRewards.js';
import { buildMemberCheckInDailySnapshot } from '../checkIns/memberSummary.js';

import type { RpcCtx, RpcDispatchResult } from './rpcProxyTypes.js';

export async function handleRpcMemberMallRedeemGroup(ctx: RpcCtx): Promise<RpcDispatchResult> {
  const { fn, fnName, req, res, params, tenantId, userId, isAdmin } = ctx;
  let result: unknown;

  switch (fn) {
    case 'member_get_spin_quota': {
      const memberId = effectiveMemberIdForRpc(req, params);
      if (!memberId) {
        result = { success: false, error: 'INVALID_PARAMS' };
        break;
      }
      const q = await getQuota(memberId);
      result = {
        success: true,
        remaining: q.remaining,
        daily_free: q.daily_free,
        credits: q.credits,
        used_today: q.used_today,
      };
      break;
    }

    case 'member_list_points_mall_items': {
      const memberId = effectiveMemberIdForRpc(req, params);
      let tid: string | null = null;
      if (memberId) {
        const member = await queryOne<{ tenant_id: string | null }>('SELECT tenant_id FROM members WHERE id = ?', [memberId]);
        tid = member?.tenant_id ?? null;
      }
      const rawMall = tid
        ? await query(
            `SELECT i.*, COALESCE(pop.redeem_qty, 0) AS tenant_redeem_qty
             FROM member_points_mall_items i
             LEFT JOIN (
               SELECT r.mall_item_id AS mid, SUM(COALESCE(r.quantity, 1)) AS redeem_qty
               FROM redemptions r
               INNER JOIN members m ON m.id = r.member_id AND m.tenant_id <=> ?
               WHERE r.status != 'rejected' AND r.mall_item_id IS NOT NULL AND r.type = 'mall'
               GROUP BY r.mall_item_id
             ) pop ON pop.mid = i.id
             WHERE i.tenant_id = ? AND i.enabled = 1
             ORDER BY i.sort_order ASC, i.created_at DESC`,
            [tid, tid],
          )
        : [];
      const items = (rawMall as Record<string, unknown>[]).map((row) => ({
        ...row,
        title: row.title ?? row.name ?? '',
      }));
      if (memberId && items.length > 0) {
        const ids = items.map((i) => String((i as { id?: string }).id || '')).filter(Boolean);
        if (ids.length > 0) {
          const ph = ids.map(() => '?').join(',');
          const usageRows = await query<{ id: string; used_today: string | number; used_lifetime: string | number }>(
            `SELECT mall_item_id AS id,
              COALESCE(SUM(CASE WHEN created_at >= CURDATE() AND created_at < DATE_ADD(CURDATE(), INTERVAL 1 DAY) THEN quantity ELSE 0 END), 0) AS used_today,
              COALESCE(SUM(quantity), 0) AS used_lifetime
             FROM redemptions
             WHERE member_id = ? AND status != 'rejected' AND mall_item_id IN (${ph})
             GROUP BY mall_item_id`,
            [memberId, ...ids],
          );
          const usageMap = new Map(
            usageRows.map((r) => [String(r.id), { used_today: Number(r.used_today) || 0, used_lifetime: Number(r.used_lifetime) || 0 }]),
          );
          for (const it of items) {
            const id = String((it as { id?: string }).id || '');
            const u = usageMap.get(id) ?? { used_today: 0, used_lifetime: 0 };
            (it as Record<string, unknown>).used_today = u.used_today;
            (it as Record<string, unknown>).used_lifetime = u.used_lifetime;
          }
        }
      } else {
        for (const it of items) {
          (it as Record<string, unknown>).used_today = 0;
          (it as Record<string, unknown>).used_lifetime = 0;
        }
      }
      result = { success: true, items };
      break;
    }

    /** 会员门户「兑换记录」：禁止走 table 代理（会员 JWT 会 403），统一 RPC 按 member_id 拉取并解析名称 */
    case 'member_list_points_mall_redemptions': {
      const memberId = effectiveMemberIdForRpc(req, params);
      const limit = Math.min(Math.max(parseInt(String(params.p_limit), 10) || 20, 1), 500);
      if (!memberId) {
        result = { success: false, error: 'INVALID_PARAMS', items: [] };
        break;
      }
      const items = await query(
        `SELECT r.id,
          COALESCE(
            NULLIF(TRIM(r.item_title), ''),
            NULLIF(TRIM(i.title), ''),
            NULLIF(TRIM(i.name), ''),
            NULLIF(TRIM(p.name), ''),
            '—'
          ) AS prize_name,
          COALESCE(r.quantity, 1) AS quantity,
          COALESCE(r.status, 'pending') AS status,
          r.created_at,
          COALESCE(r.points_used, 0) AS points_used
        FROM redemptions r
        LEFT JOIN member_points_mall_items i ON i.id = r.mall_item_id
        LEFT JOIN prizes p ON p.id = r.prize_id
        WHERE r.member_id = ? AND (r.mall_item_id IS NOT NULL OR r.type = ?)
        ORDER BY r.created_at DESC
        LIMIT ?`,
        [memberId, 'mall', limit],
      );
      result = { success: true, items };
      break;
    }

    case 'member_list_points_mall_categories': {
      const memberId = effectiveMemberIdForRpc(req, params);
      let tid: string | null = null;
      if (memberId) {
        const member = await queryOne<{ tenant_id: string | null }>('SELECT tenant_id FROM members WHERE id = ?', [memberId]);
        tid = member?.tenant_id ?? null;
      }
      const cats = tid
        ? await query(
            'SELECT id, name_zh, name_en, sort_order FROM member_points_mall_categories WHERE tenant_id = ? ORDER BY sort_order ASC, created_at ASC',
            [tid],
          )
        : [];
      result = { success: true, categories: cats };
      break;
    }

    case 'list_my_member_points_mall_categories': {
      if (!assertRpcEmployee(req)) {
        result = { success: false, error: 'EMPLOYEE_ONLY', categories: [] };
        break;
      }
      if (!tenantId) {
        result = { success: true, categories: [] };
        break;
      }
      const cats = await query(
        'SELECT id, name_zh, name_en, sort_order FROM member_points_mall_categories WHERE tenant_id = ? ORDER BY sort_order ASC, created_at ASC',
        [tenantId],
      );
      result = { success: true, categories: cats };
      break;
    }

    case 'save_my_member_points_mall_categories': {
      if (!assertRpcEmployee(req)) {
        result = { success: false, error: 'EMPLOYEE_ONLY' };
        break;
      }
      if (!tenantId) {
        result = { success: false, error: 'TENANT_NOT_FOUND' };
        break;
      }
      const catRows = Array.isArray(params.p_categories) ? params.p_categories : [];
      const pool = getPool();
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const [exRows] = await conn.query('SELECT id FROM member_points_mall_categories WHERE tenant_id = ?', [tenantId]);
        const existingIds = new Set((exRows as { id: string }[]).map((r) => String(r.id)));
        const keepIds = new Set<string>();
        const normalized: { id: string; name_zh: string; name_en: string; sort_order: number }[] = [];
        for (let i = 0; i < catRows.length; i++) {
          const r = catRows[i] as Record<string, unknown>;
          const rid = r.id != null ? String(r.id).trim() : '';
          const id = /^[0-9a-f-]{36}$/i.test(rid) ? rid : randomUUID();
          keepIds.add(id);
          const name_zh = String(r.name_zh ?? '').trim().slice(0, 128) || 'Category';
          const name_en = String(r.name_en ?? '').trim().slice(0, 128);
          normalized.push({ id, name_zh, name_en: name_en || name_zh, sort_order: i + 1 });
        }
        for (const eid of existingIds) {
          if (!keepIds.has(eid)) {
            await conn.execute(
              'UPDATE member_points_mall_items SET mall_category_id = NULL WHERE tenant_id = ? AND mall_category_id = ?',
              [tenantId, eid],
            );
            await conn.execute('DELETE FROM member_points_mall_categories WHERE tenant_id = ? AND id = ?', [tenantId, eid]);
          }
        }
        for (const c of normalized) {
          await conn.execute(
            `INSERT INTO member_points_mall_categories (id, tenant_id, name_zh, name_en, sort_order, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, NOW(3), NOW(3))
             ON DUPLICATE KEY UPDATE name_zh = VALUES(name_zh), name_en = VALUES(name_en), sort_order = VALUES(sort_order), updated_at = NOW(3)`,
            [c.id, tenantId, c.name_zh, c.name_en, c.sort_order],
          );
        }
        await conn.commit();
        result = { success: true };
      } catch (e) {
        await conn.rollback();
        console.error('[RPC] save_my_member_points_mall_categories', e);
        result = { success: false, error: 'SAVE_FAILED', message: (e as Error).message };
      } finally {
        conn.release();
      }
      break;
    }

    case 'member_redeem_points_mall_item': {
      const memberId = effectiveMemberIdForRpc(req, params);
      const itemId = params.p_item_id;
      const qty = Math.max(1, parseInt(String(params.p_quantity)) || 1);
      if (!memberId || !itemId) {
        result = { success: false, error: 'INVALID_PARAMS' };
        break;
      }
      // Pre-validate outside transaction (read-only checks)
      const memberRow = await queryOne<{
        tenant_id: string | null;
        member_code: string | null;
        phone_number: string | null;
      }>('SELECT tenant_id, member_code, phone_number FROM members WHERE id = ?', [memberId]);
      const item = await queryOne<{
        enabled?: unknown;
        tenant_id?: unknown;
        title?: unknown;
        name?: unknown;
        stock_remaining?: unknown;
        stock?: unknown;
        per_order_limit?: unknown;
        per_user_daily_limit?: unknown;
        per_user_lifetime_limit?: unknown;
        points_cost?: unknown;
        image_url?: unknown;
      }>('SELECT * FROM member_points_mall_items WHERE id = ?', [itemId]);
      if (!item || !item.enabled) {
        result = { success: false, error: 'ITEM_NOT_FOUND' };
        break;
      }
      if (
        !memberRow?.tenant_id ||
        !item.tenant_id ||
        String(memberRow.tenant_id) !== String(item.tenant_id)
      ) {
        result = { success: false, error: 'ITEM_NOT_FOUND' };
        break;
      }
      const itemTitle =
        String(item.title ?? item.name ?? '')
          .trim() || 'Product';
      const stockRemainingRaw = item.stock_remaining;
      const stockLegacyRaw = item.stock;
      let stockRemaining = Number(stockRemainingRaw);
      if (Number.isNaN(stockRemaining)) {
        stockRemaining = Number(stockLegacyRaw);
      }
      if (Number.isNaN(stockRemaining)) stockRemaining = -1;
      const perOrder = Math.max(1, Number(item.per_order_limit ?? 1));
      if (qty > perOrder) {
        result = { success: false, error: 'EXCEED_PER_ORDER_LIMIT', limit: perOrder };
        break;
      }

      const rawIdem = params.p_client_request_id ?? params.p_idempotency_key;
      let clientRequestId = '';
      if (rawIdem != null && String(rawIdem).trim() !== '') {
        const s = String(rawIdem).trim().slice(0, 64);
        if (/^[a-zA-Z0-9_-]{8,64}$/.test(s)) clientRequestId = s;
      }
      // Auto-generate idempotency key if frontend didn't provide one
      if (!clientRequestId) {
        clientRequestId = `srv_${randomUUID().replace(/-/g, '')}`;
      }

      // All write operations + final balance/stock checks inside transaction
      try {
        result = await withTransaction(async (conn) => {
          const mallLock = buildMysqlUserLockName('mall_redeem', memberId);
          if (!(await mysqlGetLock(conn, mallLock, 8))) {
            return { success: false, error: 'DUPLICATE_REQUEST' };
          }
          try {
          // Re-check limits with row locks inside transaction
          const dailyLimit = Math.max(0, Number(item.per_user_daily_limit ?? 0));
          const lifeLimit = Math.max(0, Number(item.per_user_lifetime_limit ?? 0));
          if (dailyLimit > 0) {
            const [usedRows] = await conn.query(
              `SELECT COALESCE(SUM(quantity), 0) AS used FROM redemptions
               WHERE member_id = ? AND mall_item_id = ? AND status != 'rejected'
               AND created_at >= CURDATE()
               AND created_at < DATE_ADD(CURDATE(), INTERVAL 1 DAY)`,
              [memberId, itemId],
            );
            const usedToday = Number((usedRows as { used?: unknown }[])[0]?.used ?? 0);
            if (usedToday + qty > dailyLimit) {
              return { success: false, error: 'EXCEED_DAILY_LIMIT', limit: dailyLimit, used: usedToday };
            }
          }
          if (lifeLimit > 0) {
            const [usedRows] = await conn.query(
              `SELECT COALESCE(SUM(quantity), 0) AS used FROM redemptions
               WHERE member_id = ? AND mall_item_id = ? AND status != 'rejected'`,
              [memberId, itemId],
            );
            const usedLife = Number((usedRows as { used?: unknown }[])[0]?.used ?? 0);
            if (usedLife + qty > lifeLimit) {
              return { success: false, error: 'EXCEED_LIFETIME_LIMIT', limit: lifeLimit, used: usedLife };
            }
          }

          if (clientRequestId) {
            const [prevRows] = await conn.query(
              `SELECT mall_item_id, item_title, quantity, points_used FROM redemptions
               WHERE member_id = ? AND client_request_id = ? LIMIT 1`,
              [memberId, clientRequestId],
            );
            const prev = (prevRows as { mall_item_id: string; item_title: string; quantity: number; points_used: number }[])[0];
            if (prev) {
              return {
                success: true,
                idempotent_replay: true,
                points_used: Number(prev.points_used),
                quantity: Number(prev.quantity ?? qty),
                item: {
                  id: String(prev.mall_item_id),
                  title: String(prev.item_title ?? itemTitle),
                  image_url: item.image_url ?? null,
                },
              };
            }
          }

          const cost = Number(item.points_cost ?? 0) * qty;

          // 与 point_orders 一致：待员工「完成/驳回」前冻结积分（balance↓ + frozen↑），审核入口在订单-商城兑换
          const [acctRows] = await conn.query(
            'SELECT id, COALESCE(balance, 0) AS balance, COALESCE(frozen_points, 0) AS frozen_points, tenant_id FROM points_accounts WHERE member_id = ? FOR UPDATE',
            [memberId],
          );
          const acctRow = (acctRows as { id?: string; balance?: unknown; frozen_points?: unknown; tenant_id?: string | null }[])[0];
          if (!acctRow?.id) {
            return { success: false, error: 'INSUFFICIENT_POINTS', required: cost, current: 0 };
          }
          const available = Number(acctRow.balance ?? 0);
          const frozenBefore = Number(acctRow.frozen_points ?? 0);
          if (frozenBefore > 0) {
            return { success: false, error: 'HAS_FROZEN_POINTS' };
          }
          if (!Number.isFinite(available) || available < cost) {
            return { success: false, error: 'INSUFFICIENT_POINTS', required: cost, current: available };
          }

          // Lock stock row（stock_remaining 由迁移保证；旧数据已用 stock 回填）
          if (stockRemaining >= 0) {
            const [stockRows] = await conn.query(
              'SELECT stock_remaining FROM member_points_mall_items WHERE id = ? FOR UPDATE',
              [itemId],
            );
            const currentStock = Number((stockRows as { stock_remaining?: unknown }[])[0]?.stock_remaining ?? 0);
            if (Number.isNaN(currentStock) || currentStock < qty) {
              return {
                success: false,
                error: 'OUT_OF_STOCK',
                available: Number.isNaN(currentStock) ? 0 : currentStock,
                requested: qty,
              };
            }
            await conn.query('UPDATE member_points_mall_items SET stock_remaining = stock_remaining - ? WHERE id = ?', [qty, itemId]);
          }

          const balanceAfterFreeze = available - cost;
          await conn.query(
            `UPDATE points_accounts
               SET balance = ?,
                   frozen_points = COALESCE(frozen_points, 0) + ?,
                   updated_at = NOW(3)
             WHERE id = ?`,
            [balanceAfterFreeze, cost, acctRow.id],
          );

          const redemptionId = randomUUID();
          const freezeLedgerId = randomUUID();
          const freezeDesc =
            qty > 1 ? `Points frozen (mall redemption: ${itemTitle} ×${qty})` : `Points frozen (mall redemption: ${itemTitle})`;
          await conn.query(
            `INSERT INTO points_ledger (
               id, account_id, member_id, type, amount, balance_after,
               reference_type, reference_id, description, tenant_id, created_at
             ) VALUES (?, ?, ?, 'freeze', ?, ?, 'mall_redemption_freeze', ?, ?, ?, NOW(3))`,
            [
              freezeLedgerId,
              acctRow.id,
              memberId,
              -cost,
              balanceAfterFreeze,
              redemptionId,
              freezeDesc,
              acctRow.tenant_id ?? memberRow?.tenant_id ?? null,
            ],
          );
          await syncPointsLog(conn, memberId, -cost, 'freeze', freezeDesc, acctRow.tenant_id ?? memberRow?.tenant_id ?? null, balanceAfterFreeze);

          const snapPhone = memberRow?.phone_number != null ? String(memberRow.phone_number).trim().slice(0, 64) : null;
          await conn.query(
            `INSERT INTO redemptions (id, member_id, type, mall_item_id, item_title, quantity, points_used, status, created_at, client_request_id, member_phone_snapshot)
             VALUES (?, ?, 'mall', ?, ?, ?, ?, 'pending', NOW(), ?, ?)`,
            [redemptionId, memberId, itemId, itemTitle, qty, cost, clientRequestId || null, snapPhone || null],
          );

          return {
            success: true,
            points_used: cost,
            quantity: qty,
            item: { id: String(itemId), title: itemTitle, image_url: item.image_url },
          };
          } finally {
            await mysqlReleaseLock(conn, mallLock);
          }
        });
      } catch (txErr) {
        console.error('[RPC] member_redeem_points_mall_item transaction error:', txErr);
        result = { success: false, error: 'REDEEM_FAILED', message: (txErr as Error).message };
      }
      break;
    }

    default:
      return null;
  }
  return { result };
}
