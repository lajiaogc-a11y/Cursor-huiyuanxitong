/**
 * RPC handlers (extracted from tableProxy)
 */
import type { Response } from 'express';
import type { ResultSetHeader } from 'mysql2';
import { execute } from '../../database/index.js';
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

    case 'redeem_points_and_record': {
      if (!assertRpcEmployee(req)) {
        result = { success: false, error: 'FORBIDDEN' };
        break;
      }
      const { executeStaffPointsRedemption } = await import('../points/staffRedemptionService.js');
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
        },
        {
          callerTenantId: tenantId,
          isAdmin,
          isPlatformSuperAdmin: req.user?.is_platform_super_admin,
        },
      );
      break;
    }
    default:
      return null;
  }
  return { result };
}
