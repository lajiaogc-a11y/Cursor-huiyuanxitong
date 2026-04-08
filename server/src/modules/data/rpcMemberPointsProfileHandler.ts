/**
 * RPC handlers (extracted from tableProxy)
 */
import type { Response } from 'express';
import type { ResultSetHeader } from 'mysql2';
import { execute, query as dbQuery } from '../../database/index.js';
import type { AuthenticatedRequest } from '../../middlewares/auth.js';
import { assertRpcEmployee, effectiveMemberIdForRpc } from './tableConfig.js';

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
      const tid1 = req.user?.tenant_id ?? null;
      if (tid1) {
        await execute('UPDATE members SET nickname = ? WHERE id = ? AND tenant_id = ?', [params.p_nickname, memberId, tid1]);
      } else {
        await execute('UPDATE members SET nickname = ? WHERE id = ?', [params.p_nickname, memberId]);
      }
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
      if (avatarUrl && avatarUrl.length > 200_000) {
        result = { success: false, error: 'AVATAR_TOO_LARGE' };
        break;
      }
      const tid2 = req.user?.tenant_id ?? null;
      if (tid2) {
        await execute('UPDATE members SET avatar_url = ? WHERE id = ? AND tenant_id = ?', [avatarUrl || null, memberId, tid2]);
      } else {
        await execute('UPDATE members SET avatar_url = ? WHERE id = ?', [avatarUrl || null, memberId]);
      }
      result = { success: true };
      break;
    }

    case 'member_get_orders': {
      const memberId = effectiveMemberIdForRpc(req, params);
      if (!memberId) {
        result = { rows: [], total: 0 };
        break;
      }
      const { getMemberOrdersForPortal } = await import('../orders/service.js');
      result = await getMemberOrdersForPortal(memberId, {
        limit: Number(params.p_limit) || 20,
        offset: Number(params.p_offset) || 0,
      });
      break;
    }

    case 'member_get_points': {
      const memberId = effectiveMemberIdForRpc(req, params);
      if (!memberId) {
        result = { success: true, points: 0, balance: 0, frozen_points: 0, total_points: 0 };
        break;
      }
      const { getMemberPointsService } = await import('../points/service.js');
      result = await getMemberPointsService(memberId);
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

    case 'redeem_all_points': {
      if (!assertRpcEmployee(req)) {
        result = { success: false, error: 'FORBIDDEN' };
        break;
      }
      const memberCode = String(params.p_member_code || '').trim();
      const phone = String(params.p_phone || '').trim();
      if (!memberCode && !phone) {
        result = { success: false, error: 'MISSING_MEMBER_IDENTIFIER' };
        break;
      }
      if (!tenantId) {
        result = { success: false, error: 'MISSING_TENANT' };
        break;
      }
      try {
        const { withTransaction } = await import('../../database/index.js');
        const { deductPoints } = await import('../points/pointsService.js');

        let memberId: string | null = null;
        if (phone) {
          const m = await dbQuery<{ id: string }>('SELECT id FROM members WHERE phone_number = ? AND tenant_id = ? LIMIT 1', [phone, tenantId]);
          memberId = m[0]?.id ?? null;
        }
        if (!memberId && memberCode) {
          const m = await dbQuery<{ id: string }>('SELECT id FROM members WHERE member_code = ? AND tenant_id = ? LIMIT 1', [memberCode, tenantId]);
          memberId = m[0]?.id ?? null;
        }
        if (!memberId) {
          result = { success: false, error: 'MEMBER_NOT_FOUND' };
          break;
        }

        const balRow = await dbQuery<{ balance: number; current_cycle_id: string | null }>(
          'SELECT COALESCE(balance,0) AS balance, current_cycle_id FROM points_accounts WHERE member_id = ? LIMIT 1',
          [memberId],
        );
        const currentBal = Math.round(Number(balRow[0]?.balance ?? 0));
        const oldCycleId = balRow[0]?.current_cycle_id ?? null;

        if (currentBal <= 0) {
          result = { success: false, error: 'INSUFFICIENT_POINTS' };
          break;
        }

        const newCycleId = `CYCLE_${Date.now()}_${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
        const now = new Date().toISOString();

        await withTransaction(async (conn) => {
          await deductPoints(conn, {
            memberId: memberId!,
            amount: currentBal,
            type: 'redeem',
            referenceType: 'points_redeem',
            description: `积分兑换清零 ${currentBal}`,
            clampToZero: true,
          });
          await conn.query(
            `UPDATE points_accounts SET points_accrual_start_time = ?, current_cycle_id = ?, last_reset_time = ?, last_updated = ? WHERE member_id = ?`,
            [now, newCycleId, now, now, memberId],
          );
        });

        result = {
          success: true,
          redeemedPoints: currentBal,
          oldCycleId,
          newCycleId,
          resetTime: now,
        };
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('[redeem_all_points]', msg);
        result = { success: false, error: msg || 'REDEEM_FAILED' };
      }
      break;
    }

    case 'redeem_points_and_record': {
      if (!assertRpcEmployee(req)) {
        result = { success: false, error: 'FORBIDDEN' };
        break;
      }
      const { executeStaffPointsRedemption } = await import('../points/staffRedemptionService.js');
      const remarkLocaleRaw = String(params.p_remark_locale ?? params.p_ui_locale ?? '').trim().toLowerCase();
      const remarkLocale = remarkLocaleRaw === 'zh' || remarkLocaleRaw === 'zh-cn' ? 'zh' : 'en';
      result = await executeStaffPointsRedemption(
        {
          memberCode: String(params.p_member_code || '').trim(),
          phone: String(params.p_phone || '').trim(),
          memberId: String(params.p_member_id || '').trim(),
          pointsToRedeem: Math.round(Number(params.p_points_to_redeem)),
          activityType: String(params.p_activity_type || 'activity_1'),
          giftCurrency: String(params.p_gift_currency || ''),
          giftAmount: Number(params.p_gift_amount),
          giftRate: Number(params.p_gift_rate),
          giftFee: Number(params.p_gift_fee),
          giftValue: Number(params.p_gift_value),
          paymentAgent:
            params.p_payment_agent != null && String(params.p_payment_agent).trim() !== ''
              ? String(params.p_payment_agent).trim()
              : '-',
          creatorId: params.p_creator_id ? String(params.p_creator_id) : null,
          remarkLocale,
        },
        {
          callerTenantId: tenantId,
          isAdmin,
          isPlatformSuperAdmin: req.user?.is_platform_super_admin,
        },
      );
      break;
    }
    case 'member_activity_apply_deltas': {
      if (!assertRpcEmployee(req)) {
        result = { success: false, error: 'FORBIDDEN' };
        break;
      }
      const memberId = String(params.p_member_id || '').trim();
      const phone = String(params.p_phone || '').trim();
      if (!memberId) {
        result = { success: false, error: 'MISSING_MEMBER_ID' };
        break;
      }
      // M4 fix: verify member belongs to caller's tenant (unless platform super admin)
      if (!req.user?.is_platform_super_admin && req.user?.tenant_id) {
        const memberTenantRow = await import('../../database/index.js').then(db =>
          db.queryOne<{ tenant_id: string | null }>('SELECT tenant_id FROM members WHERE id = ? LIMIT 1', [memberId])
        );
        if (memberTenantRow && memberTenantRow.tenant_id !== req.user.tenant_id) {
          result = { success: false, error: 'FORBIDDEN' };
          break;
        }
      }
      try {
        const { applyMemberActivityDeltas } = await import('../members/memberActivityAccount.js');
        const deltas: Record<string, number> = {};
        for (const key of [
          'order_count', 'total_accumulated_ngn', 'total_accumulated_ghs', 'total_accumulated_usdt',
          'accumulated_profit', 'accumulated_profit_usdt', 'remaining_points', 'accumulated_points',
          'referral_count', 'referral_points', 'total_gift_ngn', 'total_gift_ghs', 'total_gift_usdt',
        ]) {
          const v = params[`p_${key}`];
          if (v !== undefined && v !== null) deltas[key] = Number(v) || 0;
        }
        await applyMemberActivityDeltas(memberId, deltas, phone || null);
        result = { success: true };
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('[member_activity_apply_deltas]', msg);
        result = { success: false, error: msg || 'APPLY_FAILED' };
      }
      break;
    }

    default:
      return null;
  }
  return { result };
}
