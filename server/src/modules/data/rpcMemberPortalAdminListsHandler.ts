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

export async function handleRpcMemberPortalAdminListsGroup(ctx: RpcCtx): Promise<RpcDispatchResult> {
  const { fn, fnName, req, res, params, tenantId, userId, isAdmin } = ctx;
  let result: unknown;

  switch (fn) {
    // ── 积分兑换订单（冻结→审核闭环） ──

    case 'member_create_point_order': {
      const memberId = effectiveMemberIdForRpc(req, params);
      if (!memberId) { result = { success: false, error: 'UNAUTHORIZED' }; break; }
      const { createPointOrder } = await import('../points/pointOrderService.js');
      try {
        const order = await createPointOrder({
          memberId,
          productName: String(params.p_product_name || ''),
          productId: params.p_product_id ? String(params.p_product_id) : undefined,
          quantity: Math.max(1, parseInt(String(params.p_quantity)) || 1),
          pointsCost: Number(params.p_points_cost || 0),
          clientRequestId: params.p_client_request_id ? String(params.p_client_request_id) : undefined,
        });
        result = { success: true, order };
      } catch (e) {
        const msg = (e as Error).message;
        result = { success: false, error: msg };
      }
      break;
    }

    case 'member_list_point_orders': {
      const memberId = effectiveMemberIdForRpc(req, params);
      if (!memberId) { result = { success: false, error: 'UNAUTHORIZED' }; break; }
      const { listPointOrders } = await import('../points/pointOrderService.js');
      const orders = await listPointOrders({
        memberId,
        limit: Number(params.p_limit) || 50,
      });
      result = { success: true, orders };
      break;
    }

    case 'member_get_portal_settings': {
      const memberId = effectiveMemberIdForRpc(req, params);
      if (memberId) {
        const { getPortalSettingsByMember } = await import('../memberPortalSettings/service.js');
        const r = await getPortalSettingsByMember(memberId);
        result = {
          success: true,
          tenant_id: r.tenant_id,
          tenant_name: r.tenant_name || '',
          settings: r.settings || {},
        };
        break;
      }
      result = { success: true, tenant_id: null, tenant_name: '', settings: {} };
      break;
    }

    case 'validate_invite_and_submit': {
      /** 必须与 POST /api/member/register-init 换取的 registerToken 配套；禁止仅凭前端传入 tenant_id 注册 */
      const registerToken = String(params.p_register_token || '').trim();
      const inviteePhone = String(params.p_invitee_phone || '').trim();
      const rawPassword = String(params.p_password || '');
      const nickname = params.p_nickname != null ? String(params.p_nickname) : null;
      if (!registerToken) {
        result = { success: false, error: 'REGISTER_TOKEN_REQUIRED' };
        break;
      }
      if (!inviteePhone) {
        result = { success: false, error: 'INVALID_INPUT' };
        break;
      }
      try {
        const { completeInviteRegister } = await import('../memberRegister/service.js');
        const cr = await completeInviteRegister({
          registerToken,
          inviteePhone,
          password: rawPassword,
          nickname,
          clientIp: req.ip,
          userAgent: req.get('user-agent') || undefined,
        });
        result = cr.success
          ? { success: true, member_id: cr.member_id, member_code: cr.member_code }
          : { success: false, error: cr.error };
      } catch (e) {
        console.error('[RPC] validate_invite_and_submit', e);
        result = { success: false, error: 'REGISTER_FAILED' };
      }
      break;
    }

    case 'member_get_invite_token': {
      const memberId = effectiveMemberIdForRpc(req, params);
      if (!memberId) { result = { success: false, error: 'NO_MEMBER' }; break; }
      const genTok = () =>
        Array.from({ length: 8 }, () => 'abcdefghijkmnpqrstuvwxyz23456789'[Math.floor(Math.random() * 32)]).join('');
      const m = await queryOne<{ invite_token: string | null; referral_code: string | null }>(
        'SELECT invite_token, referral_code FROM members WHERE id = ?',
        [memberId],
      );
      let token = m?.invite_token?.trim() || '';
      if (!token) {
        token = genTok();
        await execute('UPDATE members SET invite_token = ?, referral_code = ? WHERE id = ?', [token, token, memberId]);
      } else if (!m?.referral_code?.trim()) {
        await execute('UPDATE members SET referral_code = ? WHERE id = ?', [token, memberId]);
      }
      result = { success: true, invite_token: token };
      break;
    }

    case 'member_log_action': {
      const memberId = effectiveMemberIdForRpc(req, params);
      const action = String(params.p_action || '').trim();
      if (memberId && action) {
        const memberRow = await queryOne<{ tenant_id: string | null }>('SELECT tenant_id FROM members WHERE id = ?', [memberId]);
        try {
          await execute(
            'INSERT INTO member_operation_logs (id, member_id, tenant_id, action, detail, created_at) VALUES (UUID(), ?, ?, ?, ?, NOW())',
            [memberId, memberRow?.tenant_id || null, action, params.p_detail || null]
          );
        } catch { /* logging best-effort */ }
      }
      result = { success: true };
      break;
    }

    case 'admin_list_spins': {
      if (!assertRpcEmployee(req)) {
        result = { success: false, error: 'FORBIDDEN', spins: [], total: 0 };
        break;
      }
      const limit = Math.min(parseInt(String(params.p_limit), 10) || 100, 500);
      const offset = parseInt(String(params.p_offset), 10) || 0;
      const search = String(params.p_search || '').trim();
      const sourceFilter = String(params.p_source || '').trim();
      const statusFilter = String(params.p_status || '').trim();
      const dateFrom = String(params.p_date_from || '').trim();
      let where = '1=1';
      const vals: unknown[] = [];
      if (search) {
        where += ' AND (m.phone_number LIKE ? OR m.member_code LIKE ? OR m.nickname LIKE ? OR s.result LIKE ?)';
        vals.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
      }
      if (sourceFilter) { where += ' AND s.source = ?'; vals.push(sourceFilter); }
      if (statusFilter) { where += ' AND s.status = ?'; vals.push(statusFilter); }
      if (dateFrom) { where += ' AND s.created_at >= ?'; vals.push(toMySqlDatetime(dateFrom)); }
      if (!req.user?.is_platform_super_admin && req.user?.tenant_id) {
        where += ' AND (m.tenant_id <=> ?)';
        vals.push(req.user.tenant_id);
      }
      const spins = await query(
        `SELECT s.*, m.phone_number, m.member_code, m.nickname
         FROM spins s LEFT JOIN members m ON m.id = s.member_id
         WHERE ${where} ORDER BY s.created_at DESC LIMIT ? OFFSET ?`,
        [...vals, limit, offset]
      );
      const countRow = await queryOne<{ cnt: number }>(
        `SELECT COUNT(*) as cnt FROM spins s LEFT JOIN members m ON m.id = s.member_id WHERE ${where}`,
        vals
      );
      result = { success: true, spins, total: countRow?.cnt ?? 0 };
      break;
    }

    case 'admin_list_member_operation_logs': {
      if (!assertRpcEmployee(req)) {
        result = { success: false, error: 'FORBIDDEN', logs: [], total: 0 };
        break;
      }
      const limit = Math.min(parseInt(String(params.p_limit), 10) || 100, 500);
      const offset = parseInt(String(params.p_offset), 10) || 0;
      const search = String(params.p_search || '').trim();
      const actionFilter = String(params.p_action || '').trim();
      const dateFrom = String(params.p_date_from || '').trim();
      let where = '1=1';
      const vals: unknown[] = [];
      if (search) {
        where += ' AND (m.phone_number LIKE ? OR m.member_code LIKE ? OR m.nickname LIKE ? OR l.action LIKE ? OR l.detail LIKE ?)';
        vals.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
      }
      if (actionFilter) { where += ' AND l.action = ?'; vals.push(actionFilter); }
      if (dateFrom) { where += ' AND l.created_at >= ?'; vals.push(toMySqlDatetime(dateFrom)); }
      if (!req.user?.is_platform_super_admin && req.user?.tenant_id) {
        where += ' AND (l.tenant_id <=> ?)';
        vals.push(req.user.tenant_id);
      }
      const logs = await query(
        `SELECT l.*, m.phone_number, m.member_code, m.nickname
         FROM member_operation_logs l LEFT JOIN members m ON m.id = l.member_id
         WHERE ${where} ORDER BY l.created_at DESC LIMIT ? OFFSET ?`,
        [...vals, limit, offset]
      );
      const countRow = await queryOne<{ cnt: number }>(
        `SELECT COUNT(*) as cnt FROM member_operation_logs l LEFT JOIN members m ON m.id = l.member_id WHERE ${where}`,
        vals
      );
      result = { success: true, logs, total: countRow?.cnt ?? 0 };
      break;
    }

    case 'admin_list_member_login_logs': {
      if (!assertRpcEmployee(req)) {
        result = { success: false, error: 'FORBIDDEN', logs: [], total: 0 };
        break;
      }
      const limitMl = Math.min(parseInt(String(params.p_limit), 10) || 100, 500);
      const offsetMl = parseInt(String(params.p_offset), 10) || 0;
      const searchMl = String(params.p_search || '').trim();
      const dateFromMl = String(params.p_date_from || '').trim();
      let whereMl = '1=1';
      const valsMl: unknown[] = [];
      if (searchMl) {
        whereMl +=
          ' AND (m.phone_number LIKE ? OR m.member_code LIKE ? OR m.nickname LIKE ? OR CAST(l.member_id AS CHAR) LIKE ?)';
        const like = `%${searchMl}%`;
        valsMl.push(like, like, like, like);
      }
      if (dateFromMl) {
        whereMl += ' AND l.login_at >= ?';
        valsMl.push(toMySqlDatetime(dateFromMl));
      }
      if (!req.user?.is_platform_super_admin && req.user?.tenant_id) {
        whereMl += ' AND (l.tenant_id <=> ?)';
        valsMl.push(req.user.tenant_id);
      }
      const logsMl = await query(
        `SELECT l.id, l.tenant_id, l.member_id, l.login_at,
                m.phone_number, m.member_code, m.nickname
         FROM member_login_logs l
         LEFT JOIN members m ON m.id = l.member_id
         WHERE ${whereMl} ORDER BY l.login_at DESC LIMIT ? OFFSET ?`,
        [...valsMl, limitMl, offsetMl],
      );
      const countRowMl = await queryOne<{ cnt: number }>(
        `SELECT COUNT(*) as cnt FROM member_login_logs l
         LEFT JOIN members m ON m.id = l.member_id
         WHERE ${whereMl}`,
        valsMl,
      );
      result = { success: true, logs: logsMl, total: countRowMl?.cnt ?? 0 };
      break;
    }

    case 'admin_get_member_referrals': {
      if (!assertRpcEmployee(req)) {
        result = { success: false, error: 'FORBIDDEN', referrals: [] };
        break;
      }
      const memberId = params.p_member_id;
      if (!memberId) { result = { success: true, referrals: [] }; break; }
      const refMember = await queryOne<{ tenant_id: string | null }>(
        'SELECT tenant_id FROM members WHERE id = ? LIMIT 1',
        [memberId],
      );
      if (!refMember) {
        result = { success: true, referrals: [] };
        break;
      }
      if (
        !req.user?.is_platform_super_admin &&
        req.user?.tenant_id &&
        refMember.tenant_id !== req.user.tenant_id
      ) {
        result = { success: false, error: 'FORBIDDEN', referrals: [] };
        break;
      }
      let referrals = await query(
        `SELECT r.id, r.tenant_id, r.referrer_id, r.referee_id, r.created_at,
                m.phone_number AS referee_phone, m.member_code AS referee_code, m.nickname AS referee_nickname, m.created_at AS referee_joined
         FROM referrals r
         JOIN members m ON m.id = r.referee_id
         WHERE r.referrer_id = ? AND r.tenant_id <=> ?
         ORDER BY r.created_at DESC`,
        [memberId, refMember.tenant_id],
      );
      if (!referrals.length) {
        referrals = await query(
          `SELECT r.*, m.phone_number as referee_phone, m.member_code as referee_code, m.nickname as referee_nickname, m.created_at as referee_joined
           FROM referral_relations r
           JOIN members m ON m.id = r.referee_id
           WHERE r.referrer_id = ?
           ORDER BY r.created_at DESC`,
          [memberId],
        );
      }
      result = { success: true, referrals };
      break;
    }

    default:
      return null;
  }
  return { result };
}
