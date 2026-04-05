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
import { addSpinConn } from '../lottery/spinBalanceAccount.js';
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

export async function handleRpcMemberCheckInGroup(ctx: RpcCtx): Promise<RpcDispatchResult> {
  const { fn, fnName, req, res, params, tenantId, userId, isAdmin } = ctx;
  let result: unknown;

  switch (fn) {
    case 'member_check_in':
    case 'member_check_in_today': {
      const memberId = effectiveMemberIdForRpc(req, params);
      /** 与抽奖模块一致：次数来自 spin_credits + daily_free，故签到奖励必须写入 spin_credits */
      const existing = memberId
        ? await queryOne('SELECT id FROM check_ins WHERE member_id = ? AND check_in_date = CURDATE()', [memberId])
        : null;
      if (fn === 'member_check_in_today') {
        let shareCreditsToday = 0;
        let dailyShareCap = 0;
        if (memberId) {
          const shareRow = await queryOne<{ total: number }>(
            `SELECT COALESCE(SUM(amount),0) AS total FROM spin_credits
             WHERE member_id = ? AND source = 'share'
               AND created_at >= CURDATE()
               AND created_at < DATE_ADD(CURDATE(), INTERVAL 1 DAY)`,
            [memberId],
          );
          shareCreditsToday = Number(shareRow?.total ?? 0);
          const mRow = await queryOne<{ tenant_id: string | null }>('SELECT tenant_id FROM members WHERE id = ?', [memberId]);
          if (mRow?.tenant_id) {
            const sRow = await queryOne<{ daily_share_reward_limit?: number | null }>(
              'SELECT daily_share_reward_limit FROM member_portal_settings WHERE tenant_id = ? LIMIT 1',
              [mRow.tenant_id],
            );
            dailyShareCap = Math.max(0, Number(sRow?.daily_share_reward_limit ?? 0));
          }
        }
        let checkInSnapshot: Awaited<ReturnType<typeof buildMemberCheckInDailySnapshot>> | null = null;
        if (memberId) {
          try {
            checkInSnapshot = await buildMemberCheckInDailySnapshot(memberId);
          } catch {
            checkInSnapshot = null;
          }
        }
        const snap =
          checkInSnapshot || {
            checked_in_today: !!existing,
            current_streak_days: 0,
            reward_base: 1,
            reward_extra_streak_3: 1.5,
            reward_extra_streak_7: 2,
            next_sign_in_streak_day: 1,
            next_reward_base: 1,
            next_reward_extra: 0,
            next_reward_total: 1,
            next_credits: 1,
          };
        const shareCapReached = dailyShareCap > 0 && shareCreditsToday >= dailyShareCap;
        result = {
          checked_in: snap.checked_in_today,
          share_claimed_today: shareCapReached,
          share_credits_today: shareCreditsToday,
          daily_share_cap: dailyShareCap,
          ...snap,
        };
      } else {
        if (!memberId) {
          result = { success: false, error: 'INVALID_PARAMS' };
          break;
        }
        try {
          result = await withTransaction(async (conn) => {
            const [mRows] = await conn.query(
              'SELECT id, tenant_id FROM members WHERE id = ? FOR UPDATE',
              [memberId],
            );
            const mRow = (mRows as { id: string; tenant_id: string | null }[])[0];
            if (!mRow) {
              return { success: false, error: 'MEMBER_NOT_FOUND' };
            }

            const [exRows] = await conn.query(
              'SELECT id FROM check_ins WHERE member_id = ? AND check_in_date = CURDATE() LIMIT 1',
              [memberId],
            );
            if ((exRows as { id: string }[]).length > 0) {
              return { success: false, error: 'ALREADY_CHECKED_IN' };
            }

            const tid = mRow.tenant_id ?? null;
            let enableCheckIn = true;
            type PortalCheckInRow = {
              enable_check_in: number | null;
              checkin_reward_base: number | string | null;
              checkin_reward_streak_3: number | string | null;
              checkin_reward_streak_7: number | string | null;
            };
            let settingsRow: PortalCheckInRow | null = null;
            if (tid) {
              const [sRows] = await conn.query(
                `SELECT enable_check_in, checkin_reward_base, checkin_reward_streak_3, checkin_reward_streak_7
                 FROM member_portal_settings WHERE tenant_id = ? LIMIT 1`,
                [tid],
              );
              settingsRow = (sRows as PortalCheckInRow[])[0] ?? null;
              if (settingsRow) {
                enableCheckIn = settingsRow.enable_check_in !== 0 && settingsRow.enable_check_in != null;
              }
            }
            if (!enableCheckIn) {
              return { success: false, error: 'CHECK_IN_DISABLED' };
            }

            const [yRows] = await conn.query(
              'SELECT streak FROM check_ins WHERE member_id = ? AND check_in_date = DATE_SUB(CURDATE(), INTERVAL 1 DAY) LIMIT 1',
              [memberId],
            );
            const yesterdayRow = (yRows as { streak: number | null }[])[0];
            const consecutive =
              yesterdayRow?.streak != null && !Number.isNaN(Number(yesterdayRow.streak))
                ? Number(yesterdayRow.streak) + 1
                : 1;

            const { base, extra3, extra7 } = parsePortalCheckInNumbers(settingsRow);
            const br = rewardBreakdownForConsecutiveDay(consecutive, base, extra3, extra7);
            const rewardValue = br.total;
            const creditAmount = br.credits;

            try {
              await conn.query(
                'INSERT INTO check_ins (id, member_id, check_in_date, streak, points_awarded) VALUES (UUID(), ?, CURDATE(), ?, ?)',
                [memberId, consecutive, rewardValue],
              );
            } catch (insE) {
              const msg = String((insE as Error).message || '');
              const errno = (insE as NodeJS.ErrnoException).errno;
              if (errno === 1062) {
                return { success: false, error: 'ALREADY_CHECKED_IN' };
              }
              if (msg.includes('Unknown column') && (msg.includes('streak') || msg.includes('points_awarded'))) {
                try {
                  await conn.query(
                    'INSERT INTO check_ins (id, member_id, check_in_date) VALUES (UUID(), ?, CURDATE())',
                    [memberId],
                  );
                } catch (e2) {
                  if ((e2 as NodeJS.ErrnoException).errno === 1062) {
                    return { success: false, error: 'ALREADY_CHECKED_IN' };
                  }
                  throw e2;
                }
              } else {
                throw insE;
              }
            }

            if (creditAmount > 0) {
              await addSpinConn(conn, memberId, creditAmount, 'check_in');
            }

            return {
              success: true,
              consecutive_days: consecutive,
              reward_type: 'spin',
              reward_base: br.base,
              reward_extra: br.extra,
              reward_value: rewardValue,
              credits_granted: creditAmount,
              checked_in_today: true,
            };
          });
        } catch (e) {
          console.error('[RPC] member_check_in', e);
          result = { success: false, error: 'SAVE_FAILED', message: (e as Error).message };
        }
      }
      break;
    }

    case 'member_get_spins': {
      const memberId = effectiveMemberIdForRpc(req, params);
      const limit = Math.min(parseInt(String(params.p_limit), 10) || 50, 200);
      /** 与会员转盘页一致：记录来自 lottery_logs */
      const spins = await query(
        `SELECT id, member_id, prize_name AS result, 'lottery' AS source, 'wheel' AS spin_type,
                'issued' AS status, created_at
         FROM lottery_logs WHERE member_id = ? ORDER BY created_at DESC LIMIT ?`,
        [memberId, limit],
      );
      result = { success: true, spins };
      break;
    }

    default:
      return null;
  }
  return { result };
}
