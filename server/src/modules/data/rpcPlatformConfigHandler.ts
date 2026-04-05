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

export async function handleRpcPlatformConfigGroup(ctx: RpcCtx): Promise<RpcDispatchResult> {
  const { fn, fnName, req, res, params, tenantId, userId, isAdmin } = ctx;
  let result: unknown;

  switch (fn) {
    case 'generate_invitation_code': {
      if (req.user?.type === 'member' || !userId) {
        result = null;
        break;
      }
      const empGen = await queryOne<{ is_super_admin: number; role: string; tenant_id: string | null }>(
        `SELECT is_super_admin, role, tenant_id FROM employees WHERE id = ? AND (status = 'active' OR status IS NULL)`,
        [userId],
      );
      if (!empGen) {
        result = null;
        break;
      }
      const isPlatformSuper = !!(req.user as { is_platform_super_admin?: boolean })?.is_platform_super_admin;
      // 平台超管 + 租户管理员/租户超管均可生成；邀请码写入当前员工所属租户
      const canGenerate =
        isPlatformSuper ||
        (empGen.tenant_id != null &&
          (!!empGen.is_super_admin || empGen.role === 'admin'));
      if (!canGenerate) {
        result = null;
        break;
      }
      const maxUses = Math.max(0, Number(params.p_max_uses ?? 1));
      const creatorId = params.p_creator_id ? String(params.p_creator_id) : userId;
      let expiresAt: string | null = params.p_expires_at ? String(params.p_expires_at) : null;
      if (expiresAt && !Number.isNaN(Date.parse(expiresAt))) {
        expiresAt = toMySqlDatetime(expiresAt) as string;
      } else {
        expiresAt = null;
      }
      let codeStr = '';
      for (let attempt = 0; attempt < 50; attempt++) {
        codeStr = createHash('md5')
          .update(randomBytes(16))
          .digest('hex')
          .slice(0, 8)
          .toUpperCase();
        const dup = await queryOne('SELECT id FROM invitation_codes WHERE code = ? LIMIT 1', [codeStr]);
        if (!dup) break;
      }
      const newId = randomUUID();
      const tenantId = empGen.tenant_id ? String(empGen.tenant_id) : null;
      await execute(
        `INSERT INTO invitation_codes (id, code, member_id, max_uses, used_count, is_active, expires_at, created_by, status, tenant_id)
         VALUES (?, ?, NULL, ?, 0, 1, ?, ?, 'active', ?)`,
        [newId, codeStr, maxUses, expiresAt, creatorId, tenantId],
      );
      result = codeStr;
      break;
    }

    case 'publish_system_announcement': {
      if (req.user?.type === 'member' || !userId) {
        result = { success: false, message: 'NO_PERMISSION', announcement_id: null, recipient_count: 0 };
        break;
      }
      const empPub = await queryOne<{ is_super_admin: number }>(
        `SELECT is_super_admin FROM employees WHERE id = ? AND (status = 'active' OR status IS NULL)`,
        [userId],
      );
      const canPublishAnnounce =
        !!empPub?.is_super_admin || !!(req.user as { is_platform_super_admin?: boolean })?.is_platform_super_admin;
      if (!empPub || !canPublishAnnounce) {
        result = { success: false, message: 'NO_PERMISSION', announcement_id: null, recipient_count: 0 };
        break;
      }
      const scopeRaw = String(params.p_scope ?? '').trim().toLowerCase();
      const vType = String(params.p_type ?? 'info').trim().toLowerCase();
      const annType = ['info', 'warning', 'success', 'error'].includes(vType) ? vType : 'info';
      const vTitle = String(params.p_title ?? '').trim();
      const vMessage = String(params.p_message ?? '').trim();
      const pTenant = params.p_tenant_id ? String(params.p_tenant_id) : null;
      const vLink = String(params.p_link ?? '').trim() || null;

      if (scopeRaw !== 'global' && scopeRaw !== 'tenant') {
        result = { success: false, message: 'INVALID_SCOPE', announcement_id: null, recipient_count: 0 };
        break;
      }
      if (scopeRaw === 'tenant' && !pTenant) {
        result = { success: false, message: 'TENANT_REQUIRED', announcement_id: null, recipient_count: 0 };
        break;
      }
      if (!vTitle || !vMessage) {
        result = { success: false, message: 'TITLE_AND_MESSAGE_REQUIRED', announcement_id: null, recipient_count: 0 };
        break;
      }

      const annId = randomUUID();
      await execute(
        `INSERT INTO system_announcements (id, scope, tenant_id, title, message, type, link, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(3))`,
        [
          annId,
          scopeRaw,
          scopeRaw === 'tenant' ? pTenant : null,
          vTitle,
          vMessage,
          annType,
          vLink,
          userId,
        ],
      );

      const metaObj =
        scopeRaw === 'global'
          ? { announcement_id: annId, scope: scopeRaw }
          : { announcement_id: annId, scope: scopeRaw, tenant_id: pTenant };
      const metaJson = JSON.stringify(metaObj);

      /** 同一租户下若存在重复的 employees 行（相同 username），原先会插入多条，登录用户会收到多条相同通知。按 username 分组取 MIN(id)，每人一条。 */
      let insertSql: string;
      let insertParams: unknown[];
      if (scopeRaw === 'global') {
        insertSql = `INSERT INTO notifications (id, user_id, title, content, type, category, link, metadata, is_read, created_at)
          SELECT UUID(), u.id, ?, ?, ?, 'announcement', ?, CAST(? AS JSON), 0, NOW(3)
          FROM (
            SELECT MIN(e.id) AS id
            FROM employees e
            WHERE (e.status = 'active' OR e.status IS NULL)
            GROUP BY COALESCE(NULLIF(TRIM(e.username), ''), e.id)
          ) u`;
        insertParams = [vTitle, vMessage, annType, vLink, metaJson];
      } else {
        insertSql = `INSERT INTO notifications (id, user_id, title, content, type, category, link, metadata, is_read, created_at)
          SELECT UUID(), u.id, ?, ?, ?, 'announcement', ?, CAST(? AS JSON), 0, NOW(3)
          FROM (
            SELECT MIN(e.id) AS id
            FROM employees e
            WHERE (e.status = 'active' OR e.status IS NULL) AND e.tenant_id = ?
            GROUP BY COALESCE(NULLIF(TRIM(e.username), ''), e.id)
          ) u`;
        insertParams = [vTitle, vMessage, annType, vLink, metaJson, pTenant];
      }

      const ins = await execute(insertSql, insertParams);
      const recipientCount = typeof (ins as { affectedRows?: number })?.affectedRows === 'number'
        ? (ins as { affectedRows: number }).affectedRows
        : 0;

      result = {
        success: true,
        message: 'OK',
        announcement_id: annId,
        recipient_count: recipientCount,
      };
      break;
    }

    case 'list_system_announcements': {
      if (req.user?.type === 'member' || !userId) {
        result = [];
        break;
      }
      const empList = await queryOne<{ is_super_admin: number }>(
        `SELECT is_super_admin FROM employees WHERE id = ? AND (status = 'active' OR status IS NULL)`,
        [userId],
      );
      const canListAnnounce =
        !!empList?.is_super_admin || !!(req.user as { is_platform_super_admin?: boolean })?.is_platform_super_admin;
      if (!empList || !canListAnnounce) {
        result = [];
        break;
      }
      const lim = Math.min(200, Math.max(1, Number(params.p_limit ?? 50)));
      const rows = await query<Record<string, unknown>>(
        `SELECT id, scope, tenant_id, title, message, type, link, created_by, created_at
         FROM system_announcements ORDER BY created_at DESC LIMIT ?`,
        [lim],
      );
      result = rows.map((r) => ({
        ...r,
        created_at:
          r.created_at instanceof Date
            ? r.created_at.toISOString()
            : r.created_at != null
              ? String(r.created_at)
              : null,
      }));
      break;
    }

    case 'mark_all_notifications_read': {
      if (req.user?.type === 'member' || !userId) {
        res.status(403).json({ data: null, error: { message: 'Forbidden' } });
        return { result: null, responseSent: true };
      }
      const hdr = await execute(
        'UPDATE notifications SET is_read = 1 WHERE user_id = ? AND (is_read = 0 OR is_read IS NULL)',
        [userId],
      );
      result = { success: true, updated: (hdr as ResultSetHeader).affectedRows ?? 0 };
      break;
    }

    case 'sync_activity_reward_tiers': {
      if (req.user?.type === 'member' || !userId) {
        res.status(403).json({ data: null, error: { message: 'Forbidden' } });
        return { result: null, responseSent: true };
      }
      const tiers = params.tiers;
      if (!Array.isArray(tiers)) {
        result = { success: false, error: 'tiers must be an array' };
        break;
      }
      await withTransaction(async (conn) => {
        await conn.query('DELETE FROM activity_reward_tiers');
        for (let i = 0; i < tiers.length; i++) {
          const t = tiers[i] as Record<string, unknown>;
          const minPoints = Math.floor(Number(t.min_points ?? t.minPoints ?? 0));
          const maxRaw = t.max_points ?? t.maxPoints;
          const maxPoints =
            maxRaw === null || maxRaw === undefined || maxRaw === ''
              ? null
              : Math.floor(Number(maxRaw));
          const rewardNgn = Number(t.reward_amount_ngn ?? t.rewardAmountNGN ?? 0);
          const rewardGhs = Number(t.reward_amount_ghs ?? t.rewardAmountGHS ?? 0);
          const rewardUsdt = Number(t.reward_amount_usdt ?? t.rewardAmountUSDT ?? 0);
          const sortOrder = Math.floor(Number(t.sort_order ?? t.sortOrder ?? i));
          await conn.query(
            `INSERT INTO activity_reward_tiers (id, min_points, max_points, reward_amount_ngn, reward_amount_ghs, reward_amount_usdt, sort_order)
             VALUES (UUID(), ?, ?, ?, ?, ?, ?)`,
            [minPoints, maxPoints, rewardNgn, rewardGhs, rewardUsdt, sortOrder],
          );
        }
      });
      result = { success: true, count: tiers.length };
      break;
    }

    case 'sync_card_types': {
      if (req.user?.type === 'member' || !userId) {
        res.status(403).json({ data: null, error: { message: 'Forbidden' } });
        return { result: null, responseSent: true };
      }
      const typesRaw = params.types;
      if (!Array.isArray(typesRaw)) {
        result = { success: false, error: 'types must be an array' };
        break;
      }
      const names = typesRaw.map((x) => String(x).trim()).filter(Boolean);
      await withTransaction(async (conn) => {
        await conn.query('DELETE FROM card_types');
        for (let i = 0; i < names.length; i++) {
          await conn.query(
            'INSERT INTO card_types (id, name, sort_order) VALUES (UUID(), ?, ?)',
            [names[i], i],
          );
        }
      });
      result = { success: true, count: names.length };
      break;
    }

    case 'get_api_daily_stats': {
      const u = req.user;
      if (!u || u.type === 'member' || !userId) {
        result = [];
        break;
      }
      const canViewApiStats =
        u.type === 'employee' &&
        (u.role === 'admin' || !!u.is_super_admin || !!u.is_platform_super_admin);
      if (!canViewApiStats) {
        result = [];
        break;
      }
      const days = Math.min(365, Math.max(1, Number(params.p_days ?? params.days ?? 7)));
      try {
        const rows = await query<{
          stat_date: string | Date;
          total_requests: number | string;
          successful_requests: number | string;
          failed_requests: number | string;
          avg_response_time: number | string | null;
        }>(
          `SELECT DATE_FORMAT(created_at, '%Y-%m-%d') AS stat_date,
                  COUNT(*) AS total_requests,
                  SUM(CASE WHEN response_status >= 200 AND response_status < 400 THEN 1 ELSE 0 END) AS successful_requests,
                  SUM(CASE WHEN response_status IS NULL OR response_status < 200 OR response_status >= 400 THEN 1 ELSE 0 END) AS failed_requests,
                  AVG(COALESCE(response_time_ms, 0)) AS avg_response_time
           FROM api_request_logs
           WHERE created_at >= DATE_SUB(NOW(3), INTERVAL ? DAY)
           GROUP BY DATE_FORMAT(created_at, '%Y-%m-%d')
           ORDER BY stat_date ASC`,
          [days],
        );
        result = rows.map((r) => {
          const total = Number(r.total_requests) || 0;
          const failed = Number(r.failed_requests) || 0;
          return {
            stat_date:
              r.stat_date instanceof Date
                ? (toMySqlDatetime(r.stat_date) as string).slice(0, 10)
                : String(r.stat_date).slice(0, 10),
            total_requests: total,
            successful_requests: Number(r.successful_requests) || 0,
            failed_requests: failed,
            error_rate: total > 0 ? failed / total : 0,
            avg_response_time: Math.round(Number(r.avg_response_time) || 0),
          };
        });
      } catch (e) {
        console.warn('[RPC] get_api_daily_stats:', (e as Error).message);
        result = [];
      }
      break;
    }

    case 'get_api_endpoint_stats': {
      const uEp = req.user;
      if (!uEp || uEp.type === 'member' || !userId) {
        result = [];
        break;
      }
      const canViewEp =
        uEp.type === 'employee' &&
        (uEp.role === 'admin' || !!uEp.is_super_admin || !!uEp.is_platform_super_admin);
      if (!canViewEp) {
        result = [];
        break;
      }
      const daysEp = Math.min(365, Math.max(1, Number(params.p_days ?? params.days ?? 7)));
      try {
        const rows = await query<{
          endpoint: string | null;
          total_requests: number | string;
          successful_requests: number | string;
          failed_requests: number | string;
          avg_response_time: number | string | null;
        }>(
          `SELECT COALESCE(NULLIF(TRIM(endpoint), ''), '(unknown)') AS endpoint,
                  COUNT(*) AS total_requests,
                  SUM(CASE WHEN response_status >= 200 AND response_status < 400 THEN 1 ELSE 0 END) AS successful_requests,
                  SUM(CASE WHEN response_status IS NULL OR response_status < 200 OR response_status >= 400 THEN 1 ELSE 0 END) AS failed_requests,
                  AVG(COALESCE(response_time_ms, 0)) AS avg_response_time
           FROM api_request_logs
           WHERE created_at >= DATE_SUB(NOW(3), INTERVAL ? DAY)
           GROUP BY COALESCE(NULLIF(TRIM(endpoint), ''), '(unknown)')
           ORDER BY total_requests DESC
           LIMIT 200`,
          [daysEp],
        );
        result = rows.map((r) => ({
          endpoint: String(r.endpoint ?? '(unknown)'),
          total_requests: Number(r.total_requests) || 0,
          successful_requests: Number(r.successful_requests) || 0,
          failed_requests: Number(r.failed_requests) || 0,
          avg_response_time: Math.round(Number(r.avg_response_time) || 0),
        }));
      } catch (e) {
        console.warn('[RPC] get_api_endpoint_stats:', (e as Error).message);
        result = [];
      }
      break;
    }
    default:
      return null;
  }
  return { result };
}
