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
import { buildStaffPointsRedemptionRemark } from './staffPointsRedemptionRemark.js';

import type { RpcCtx, RpcDispatchResult } from './rpcProxyTypes.js';

export async function handleRpcMemberPointsProfileGroup(ctx: RpcCtx): Promise<RpcDispatchResult> {
  const { fn, fnName, req, res, params, tenantId, userId, isAdmin } = ctx;
  let result: unknown;

  switch (fn) {
    case 'member_update_nickname': {
      const memberId = effectiveMemberIdForRpc(req, params);
      if (!memberId) {
        result = { success: false, error: 'INVALID_PARAMS' };
        break;
      }
      await execute('UPDATE members SET nickname = ? WHERE id = ?', [params.p_nickname, memberId]);
      result = { success: true };
      break;
    }

    case 'member_update_avatar': {
      const memberId = effectiveMemberIdForRpc(req, params);
      if (!memberId) {
        result = { success: false, error: 'INVALID_PARAMS' };
        break;
      }
      const avatarUrl = params.p_avatar_url != null ? String(params.p_avatar_url).trim() : null;
      // 限制 data URL 大小 ≤ 200KB（压缩后 WebP / JPEG）
      if (avatarUrl && avatarUrl.length > 200_000) {
        result = { success: false, error: 'AVATAR_TOO_LARGE' };
        break;
      }
      await execute('UPDATE members SET avatar_url = ? WHERE id = ?', [avatarUrl || null, memberId]);
      result = { success: true };
      break;
    }

    case 'member_get_orders': {
      const memberId = effectiveMemberIdForRpc(req, params);
      if (!memberId) {
        result = { rows: [], total: 0 };
        break;
      }
      const m = await queryOne<{ phone_number: string | null }>(
        'SELECT phone_number FROM members WHERE id = ?',
        [memberId]
      );
      const phone = String(m?.phone_number ?? '').trim();
      const ordLim = Math.min(200, Math.max(1, Math.floor(Number(params.p_limit) || 20)));
      const ordOff = Math.max(0, Math.floor(Number(params.p_offset) || 0));

      const countRow = await queryOne<{ n: number }>(
        `SELECT COUNT(*) AS n FROM orders o
         WHERE (o.member_id = ? OR (o.phone_number IS NOT NULL AND o.phone_number = ?))
         AND COALESCE(o.is_deleted, 0) = 0`,
        [memberId, phone],
      );
      const ordTotal = Math.max(0, Number(countRow?.n ?? 0));

      const orders = await query(
        `SELECT o.*,
                o.card_type AS order_type,
                COALESCE(NULLIF(TRIM(gc.name), ''), NULLIF(TRIM(o.card_name), '')) AS gift_card_name
         FROM orders o
         LEFT JOIN gift_cards gc ON gc.id = TRIM(o.card_type)
         WHERE (o.member_id = ? OR (o.phone_number IS NOT NULL AND o.phone_number = ?))
         AND COALESCE(o.is_deleted, 0) = 0
         ORDER BY o.created_at DESC
         LIMIT ? OFFSET ?`,
        [memberId, phone, ordLim, ordOff]
      );
      result = { rows: orders, total: ordTotal };
      break;
    }

    case 'member_get_points': {
      const memberId = effectiveMemberIdForRpc(req, params);
      const acct = memberId
        ? await queryOne<{ balance: number; frozen_points: number }>(
            'SELECT COALESCE(balance, 0) AS balance, COALESCE(frozen_points, 0) AS frozen_points FROM points_accounts WHERE member_id = ?',
            [memberId],
          )
        : null;
      const pts = Number(acct?.balance ?? 0);
      const frozen = Number(acct?.frozen_points ?? 0);
      result = { success: true, points: pts, balance: pts, frozen_points: frozen, total_points: pts + frozen };
      break;
    }

    case 'member_get_points_breakdown': {
      const memberId = effectiveMemberIdForRpc(req, params);
      if (!memberId) {
        result = {
          success: true,
          balance: 0,
          frozen_points: 0,
          total_points: 0,
          consumption_points: 0,
          referral_points: 0,
          lottery_points: 0,
          pending_mall_points: 0,
          referral_count: 0,
        };
        break;
      }
      const { computeMemberPointsBreakdown } = await import('../points/memberPointsBreakdown.js');
      result = await computeMemberPointsBreakdown(memberId);
      break;
    }

    /** 会员端：积分流水（全部/消费/推广/抽奖），订单号、时间、积分变动、变动前后余额 */
    case 'member_list_points_ledger': {
      const memberId = effectiveMemberIdForRpc(req, params);
      if (!memberId) {
        result = { success: false, error: 'UNAUTHORIZED', rows: [], total: 0 };
        break;
      }
      const cat = String(params.p_category || 'all').toLowerCase();
      if (cat !== 'all' && cat !== 'consumption' && cat !== 'referral' && cat !== 'lottery') {
        result = { success: false, error: 'INVALID_CATEGORY', rows: [], total: 0 };
        break;
      }
      const limit = Number(params.p_limit);
      const offset = Number(params.p_offset);
      const { listMemberPointsLedgerHistory } = await import('../points/memberPointsLedgerHistory.js');
      const { rows, total } = await listMemberPointsLedgerHistory(
        memberId,
        cat as 'all' | 'consumption' | 'referral' | 'lottery',
        Number.isFinite(limit) ? limit : 50,
        Number.isFinite(offset) ? offset : 0
      );
      result = { success: true, rows, total };
      break;
    }

    case 'member_sum_today_earned': {
      const memberId = effectiveMemberIdForRpc(req, params);
      if (!memberId) {
        result = { success: false, error: 'UNAUTHORIZED', earned: 0 };
        break;
      }
      const { sumMemberTodayEarnedPoints } = await import('../points/memberPointsLedgerHistory.js');
      const earned = await sumMemberTodayEarnedPoints(memberId);
      result = { success: true, earned };
      break;
    }

    /** 员工端汇率计算器：积分全额兑换并写活动赠送（与 Supabase redeem_points_and_record 语义对齐，账务以 points_accounts.balance 为准） */
    case 'redeem_points_and_record': {
      if (!assertRpcEmployee(req)) {
        result = { success: false, error: 'FORBIDDEN' };
        break;
      }
      const p_member_code = String(params.p_member_code || '').trim();
      const p_phone = String(params.p_phone || '').trim();
      const p_member_id = String(params.p_member_id || '').trim();
      const p_points_to_redeem = Math.round(Number(params.p_points_to_redeem));
      const p_activity_type = String(params.p_activity_type || 'activity_1');
      const p_gift_currency = String(params.p_gift_currency || '');
      const p_gift_amount = Number(params.p_gift_amount);
      const p_gift_rate = Number(params.p_gift_rate);
      const p_gift_fee = Number(params.p_gift_fee);
      const p_gift_value = Number(params.p_gift_value);
      const p_payment_agent = params.p_payment_agent != null && String(params.p_payment_agent).trim() !== ''
        ? String(params.p_payment_agent).trim()
        : '-';
      const p_creator_id = params.p_creator_id ? String(params.p_creator_id) : null;

      if (!p_member_id || !Number.isFinite(p_points_to_redeem) || p_points_to_redeem <= 0) {
        result = { success: false, error: 'INVALID_PARAMS' };
        break;
      }

      const memberRow = await queryOne<{ tenant_id: string | null }>(
        'SELECT tenant_id FROM members WHERE id = ?',
        [p_member_id],
      );
      if (!memberRow) {
        result = { success: false, error: 'MEMBER_NOT_FOUND' };
        break;
      }
      if (
        tenantId &&
        memberRow.tenant_id !== tenantId &&
        !isAdmin &&
        !req.user?.is_platform_super_admin
      ) {
        result = { success: false, error: 'FORBIDDEN' };
        break;
      }

      const acctBal = await queryOne<{ balance: number }>(
        'SELECT balance FROM points_accounts WHERE member_id = ?',
        [p_member_id],
      );
      const curPts = Math.round(Number(acctBal?.balance ?? 0));

      if (curPts <= 0) {
        result = {
          success: false,
          error: 'NO_POINTS',
          current: curPts,
          requested: p_points_to_redeem,
        };
        break;
      }

      if (curPts !== p_points_to_redeem) {
        result = {
          success: false,
          error: 'POINTS_MISMATCH',
          current: curPts,
          requested: p_points_to_redeem,
        };
        break;
      }

      const v_transaction_type =
        p_activity_type === 'activity_1'
          ? 'redeem_activity_1'
          : p_activity_type === 'activity_2'
            ? 'redeem_activity_2'
            : 'redeem_activity_2';

      const tenantIdForLedger = memberRow.tenant_id ?? null;
      let giftIdOut = '';
      let ledgerIdOut = '';
      const redemptionRemark = buildStaffPointsRedemptionRemark(
        p_points_to_redeem,
        p_gift_amount,
        p_gift_currency
      );

      try {
        await withTransaction(async (conn) => {
          const ledgerId = randomUUID();
          ledgerIdOut = ledgerId;
          await applyPointsLedgerDeltaOnConn(conn, {
            ledgerId,
            memberId: p_member_id,
            type: v_transaction_type,
            delta: -p_points_to_redeem,
            description: redemptionRemark,
            referenceType: 'redemption',
            referenceId: ledgerId,
            createdBy: p_creator_id,
            extras: {
              member_code: p_member_code || null,
              phone_number: p_phone || null,
              transaction_type: v_transaction_type,
              points_earned: -p_points_to_redeem,
              status: 'issued',
              currency: p_gift_currency || null,
              creator_id: p_creator_id,
              tenant_id: tenantIdForLedger,
            },
          });
          await syncPointsLog(conn, p_member_id, -p_points_to_redeem, v_transaction_type, redemptionRemark, tenantIdForLedger);

          const giftId = randomUUID();
          giftIdOut = giftId;
          const gn = await generateUniqueActivityGiftNumber();
          await conn.query(
            `INSERT INTO activity_gifts (
              id, tenant_id, member_id, phone_number, currency, amount, rate, fee, gift_value, gift_type,
              payment_agent, creator_id, gift_number, remark, status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', NOW(3))`,
            [
              giftId,
              tenantIdForLedger,
              p_member_id,
              p_phone,
              p_gift_currency,
              p_gift_amount,
              p_gift_rate,
              p_gift_fee,
              p_gift_value,
              p_activity_type,
              p_payment_agent,
              p_creator_id,
              gn,
              redemptionRemark,
            ],
          );

          const ngnAdd = p_gift_currency === 'NGN' ? p_gift_amount : 0;
          const ghsAdd = p_gift_currency === 'GHS' ? p_gift_amount : 0;
          const usdtAdd = p_gift_currency === 'USDT' ? p_gift_amount : 0;

          const [maRows] = await conn.query('SELECT id FROM member_activity WHERE member_id = ? LIMIT 1', [
            p_member_id,
          ]);
          const maList = maRows as { id: string }[];
          if (maList.length > 0) {
            await conn.query(
              `UPDATE member_activity SET
                total_gift_ngn = total_gift_ngn + ?,
                total_gift_ghs = total_gift_ghs + ?,
                total_gift_usdt = total_gift_usdt + ?,
                accumulated_profit = GREATEST(accumulated_profit - ?, 0),
                updated_at = NOW(3)
               WHERE member_id = ?`,
              [ngnAdd, ghsAdd, usdtAdd, p_gift_value, p_member_id],
            );
          } else {
            const newMaId = randomUUID();
            await conn.query(
              `INSERT INTO member_activity (
                id, member_id, phone_number, order_count, remaining_points,
                accumulated_profit, accumulated_profit_usdt,
                total_accumulated_ngn, total_accumulated_ghs, total_accumulated_usdt,
                referral_count, accumulated_points, referral_points,
                total_gift_ngn, total_gift_ghs, total_gift_usdt,
                created_at, updated_at
              ) VALUES (?, ?, ?, 0, 0, GREATEST(0 - ?, 0), 0, 0, 0, 0, 0, 0, 0, ?, ?, ?, NOW(3), NOW(3))`,
              [newMaId, p_member_id, p_phone || null, p_gift_value, ngnAdd, ghsAdd, usdtAdd],
            );
          }
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes('INSUFFICIENT_POINTS')) {
          result = {
            success: false,
            error: 'POINTS_MISMATCH',
            current: curPts,
            requested: p_points_to_redeem,
          };
        } else {
          console.error('[RPC] redeem_points_and_record', e);
          result = { success: false, error: msg || 'REDEEM_FAILED' };
        }
        break;
      }

      result = {
        success: true,
        ledger_id: ledgerIdOut,
        gift_id: giftIdOut,
        points_redeemed: p_points_to_redeem,
        points_before: curPts,
      };
      break;
    }
    default:
      return null;
  }
  return { result };
}
