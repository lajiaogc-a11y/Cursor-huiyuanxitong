/**
 * RPC handlers (extracted from tableProxy)
 */
import { query, queryOne, execute, withTransaction } from '../../database/index.js';
import { assertRpcEmployee, effectiveMemberIdForRpc } from './tableConfig.js';

import { draw } from '../lottery/service.js';
import { addSpinConn } from '../lottery/spinBalanceAccount.js';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { buildMysqlUserLockName, mysqlGetLock, mysqlReleaseLock } from '../../lib/mysqlUserLock.js';

import type { RpcCtx, RpcDispatchResult } from './rpcProxyTypes.js';

export async function handleRpcMemberLotteryShareGroup(ctx: RpcCtx): Promise<RpcDispatchResult> {
  const { fn, fnName, req, res, params, tenantId, userId, isAdmin } = ctx;
  let result: unknown;

  switch (fn) {
    case 'list_my_member_points_mall_items': {
      if (!assertRpcEmployee(req)) {
        result = { success: false, error: 'EMPLOYEE_ONLY', items: [] };
        break;
      }
      if (!tenantId) {
        result = { success: true, items: [] };
        break;
      }
      const rawItems = await query(
        'SELECT * FROM member_points_mall_items WHERE tenant_id = ? ORDER BY sort_order ASC, created_at DESC',
        [tenantId],
      );
      const items = (rawItems as Record<string, unknown>[]).map((row) => ({
        ...row,
        title: row.title ?? row.name ?? '',
      }));
      result = { success: true, items };
      break;
    }

    case 'list_my_member_points_mall_redemptions': {
      if (!assertRpcEmployee(req)) {
        result = { success: false, error: 'EMPLOYEE_ONLY', items: [] };
        break;
      }
      const status = params.p_status || null;
      const limit = Math.min(parseInt(String(params.p_limit)) || 50, 500);
      if (!tenantId) {
        result = { success: true, items: [] };
        break;
      }
      const whereParts = ['m.tenant_id = ?', '(r.mall_item_id IS NOT NULL OR r.type = ?)'];
      const vals: unknown[] = [tenantId, 'mall'];
      if (status) {
        whereParts.push('r.status = ?');
        vals.push(status);
      }
      vals.push(limit);
      const items = await query(
        `SELECT r.id, r.member_id, m.member_code,
          COALESCE(NULLIF(TRIM(r.member_phone_snapshot), ''), m.phone_number) AS member_phone,
          COALESCE(NULLIF(TRIM(r.item_title), ''), i.title, 'Mall product') AS item_title,
          COALESCE(r.item_image_url, i.image_url) AS item_image_url,
          COALESCE(r.quantity, 1) AS quantity,
          COALESCE(r.points_used, 0) AS points_used,
          COALESCE(r.status, 'pending') AS status,
          r.created_at, r.processed_at, r.process_note,
          COALESCE(NULLIF(TRIM(r.processed_by_name), ''), NULLIF(TRIM(e.real_name), ''), e.username) AS handler_name
        FROM redemptions r
        INNER JOIN members m ON m.id = r.member_id
        LEFT JOIN member_points_mall_items i ON i.id = r.mall_item_id
        LEFT JOIN employees e ON e.id = r.processed_by_employee_id
        WHERE ${whereParts.join(' AND ')}
        ORDER BY r.created_at DESC
        LIMIT ?`,
        vals,
      );
      result = { success: true, items };
      break;
    }

    case 'list_my_member_spin_wheel_prizes': {
      if (!assertRpcEmployee(req)) {
        result = { success: false, error: 'EMPLOYEE_ONLY', prizes: [] };
        break;
      }
      let prizes: unknown[];
      if (req.user?.is_platform_super_admin) {
        prizes = await query(
          'SELECT * FROM member_spin_wheel_prizes ORDER BY sort_order ASC, created_at DESC',
        );
      } else {
        const tidP = req.user?.tenant_id ?? null;
        prizes = tidP
          ? await query(
              'SELECT * FROM member_spin_wheel_prizes WHERE tenant_id = ? ORDER BY sort_order ASC, created_at DESC',
              [tidP],
            )
          : [];
      }
      result = { success: true, prizes };
      break;
    }

    case 'member_spin': {
      /** 与会员转盘页统一：走 lottery 抽奖（lottery_logs + lottery_prizes），不再写 spins 表 */
      const memberId = effectiveMemberIdForRpc(req, params);
      if (!memberId) {
        result = { success: false, error: 'INVALID_PARAMS' };
        break;
      }
      const clientRequestId = typeof params?.request_id === 'string' ? params.request_id.trim() : '';
      const rpcRequestId = clientRequestId || `srv_${randomUUID().replace(/-/g, '')}`;
      const rpcIp = (req.headers?.['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || null;
      const rpcFp = typeof params?.device_fingerprint === 'string' ? params.device_fingerprint.slice(0, 128) : null;
      const dr = await draw(memberId, { requestId: rpcRequestId, clientIp: rpcIp, deviceFingerprint: rpcFp });
      if (!dr.success) {
        result = {
          success: false,
          error: dr.error ?? 'DRAW_FAILED',
          remaining: dr.remaining ?? 0,
        };
        break;
      }
      result = {
        success: true,
        remaining: dr.remaining,
        prize: dr.prize
          ? {
              id: dr.prize.id,
              name: dr.prize.name,
              type: dr.prize.type,
              value: dr.prize.value,
            }
          : undefined,
        reward_status: dr.reward_status,
        reward_points: dr.reward_points,
        balance_after: dr.balance_after,
        fail_reason: dr.fail_reason,
      };
      break;
    }

    /**
     * 分享领奖凭证：前端在打开分享页之前调用，后端返回一次性 nonce（5 分钟有效）。
     * 前端把 nonce 传给 member_grant_spin_for_share 作为领取凭证。
     */
    case 'member_request_share_nonce': {
      const memberId = effectiveMemberIdForRpc(req, params);
      if (!memberId) {
        result = { success: false, error: 'INVALID_PARAMS' };
        break;
      }
      try {
        const mRow = await queryOne<{ tenant_id: string | null }>('SELECT tenant_id FROM members WHERE id = ?', [memberId]);
        if (!mRow) { result = { success: false, error: 'MEMBER_NOT_FOUND' }; break; }

        const plainNonce = randomBytes(16).toString('hex');
        const nonceHash = createHash('sha256').update(plainNonce, 'utf8').digest('hex');
        const id = randomUUID();
        const NONCE_TTL_SEC = 300;
        await execute(
          `INSERT INTO share_nonces (id, member_id, tenant_id, nonce_hash, expires_at, created_at)
           VALUES (?, ?, ?, ?, DATE_ADD(NOW(3), INTERVAL ? SECOND), NOW(3))`,
          [id, memberId, mRow.tenant_id, nonceHash, NONCE_TTL_SEC],
        );
        result = { success: true, nonce: plainNonce, expires_in: NONCE_TTL_SEC };
      } catch (e) {
        console.error('[RPC] member_request_share_nonce', e);
        result = { success: false, error: 'NONCE_FAILED' };
      }
      break;
    }

    case 'member_grant_spin_for_share': {
      const memberId = effectiveMemberIdForRpc(req, params);
      if (!memberId) {
        result = { success: false, error: 'INVALID_PARAMS' };
        break;
      }
      const rawNonce = String(params.p_share_nonce || '').trim();
      if (!rawNonce || rawNonce.length < 16) {
        result = { success: false, error: 'INVALID_SHARE_NONCE' };
        break;
      }
      const nonceHash = createHash('sha256').update(rawNonce, 'utf8').digest('hex');
      try {
        result = await withTransaction(async (conn) => {
          const shareLock = buildMysqlUserLockName('share_spin', memberId);
          if (!(await mysqlGetLock(conn, shareLock, 6))) {
            return { success: false, error: 'DUPLICATE_REQUEST' };
          }
          try {
          // Validate and consume nonce atomically
          const [nonceRows] = await conn.query(
            `SELECT id, member_id, used_at, expires_at FROM share_nonces
             WHERE nonce_hash = ? FOR UPDATE`,
            [nonceHash],
          );
          const nonceRow = (nonceRows as { id: string; member_id: string; used_at: Date | null; expires_at: Date }[])[0];
          if (!nonceRow) {
            return { success: false, error: 'INVALID_SHARE_NONCE' };
          }
          if (nonceRow.member_id !== memberId) {
            return { success: false, error: 'INVALID_SHARE_NONCE' };
          }
          if (nonceRow.used_at) {
            return { success: false, error: 'NONCE_ALREADY_USED' };
          }
          if (new Date(nonceRow.expires_at).getTime() < Date.now()) {
            return { success: false, error: 'NONCE_EXPIRED' };
          }
          // Mark nonce as consumed
          await conn.query('UPDATE share_nonces SET used_at = NOW(3) WHERE id = ? AND used_at IS NULL', [nonceRow.id]);

          const [mRows] = await conn.query('SELECT id, tenant_id FROM members WHERE id = ? FOR UPDATE', [memberId]);
          const mRow = (mRows as { id: string; tenant_id: string | null }[])[0];
          if (!mRow) {
            return { success: false, error: 'MEMBER_NOT_FOUND' };
          }
          const tid = mRow.tenant_id ?? null;
          let shareReward = 1;
          let dailyCap = 0;
          if (tid) {
            const [sRows] = await conn.query(
              'SELECT share_reward_spins, daily_share_reward_limit FROM member_portal_settings WHERE tenant_id = ? LIMIT 1',
              [tid],
            );
            const s = (sRows as { share_reward_spins: number | string | null; daily_share_reward_limit?: number | null }[])[0];
            if (s?.share_reward_spins != null && s.share_reward_spins !== '') {
              shareReward = Math.max(0, Math.ceil(Number(s.share_reward_spins)));
            }
            dailyCap = Math.max(0, Number(s?.daily_share_reward_limit ?? 0));
          }
          if (shareReward <= 0) {
            return { success: false, error: 'SHARE_REWARD_DISABLED' };
          }
          if (dailyCap > 0) {
            const [sumRows] = await conn.query(
              `SELECT COALESCE(SUM(amount), 0) AS total FROM spin_credits
               WHERE member_id = ? AND source = 'share'
                 AND created_at >= CURDATE()
                 AND created_at < DATE_ADD(CURDATE(), INTERVAL 1 DAY)`,
              [memberId],
            );
            const todaySpins = Number((sumRows as { total: number }[])[0]?.total ?? 0);
            if (todaySpins + shareReward > dailyCap) {
              return { success: false, error: 'SHARE_DAILY_CAP_REACHED', cap: dailyCap, today: todaySpins };
            }
          }
          await addSpinConn(conn, memberId, shareReward, 'share');
          const [sumAfter] = await conn.query(
            `SELECT COALESCE(SUM(amount), 0) AS total FROM spin_credits
             WHERE member_id = ? AND source = 'share'
               AND created_at >= CURDATE()
               AND created_at < DATE_ADD(CURDATE(), INTERVAL 1 DAY)`,
            [memberId],
          );
          const shareCreditsToday = Number((sumAfter as { total: number }[])[0]?.total ?? 0);
          const capReached = dailyCap > 0 && shareCreditsToday >= dailyCap;
          return {
            success: true,
            credits: shareReward,
            share_claimed_today: capReached,
            share_credits_today: shareCreditsToday,
            daily_share_cap: dailyCap,
          };
          } finally {
            await mysqlReleaseLock(conn, shareLock);
          }
        });
      } catch (e) {
        console.error('[RPC] member_grant_spin_for_share', e);
        result = { success: false, error: 'SAVE_FAILED', message: (e as Error).message };
      }
      break;
    }

    default:
      return null;
  }
  return { result };
}
