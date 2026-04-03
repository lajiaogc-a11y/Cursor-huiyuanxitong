/**
 * 抽奖系统核心业务逻辑（事务保护版）
 */
import { withTransaction } from '../../database/index.js';
import { randomUUID } from 'crypto';
import type { PoolConnection } from 'mysql2/promise';
import type { ResultSetHeader } from 'mysql2';
import { buildMysqlUserLockName, mysqlGetLock, mysqlReleaseLock } from '../../lib/mysqlUserLock.js';
import { applyPointsLedgerDeltaOnConn } from '../points/pointsLedgerAccount.js';
import { getEffectiveDailyFreeSpinsConn, getLotterySettings, listEnabledPrizes } from './repository.js';
import { pickLotteryPrizeByConfiguredProbability } from './prizePick.js';
import { getShanghaiDateString } from '../../lib/shanghaiTime.js';
import { syncLotteryQuotaDayAndLoadConn } from './spinBalanceAccount.js';

const recentDraws = new Map<string, number>();
const DRAW_IDEMPOTENCY_WINDOW_MS = 2000;

setInterval(() => {
  const now = Date.now();
  for (const [key, ts] of recentDraws) {
    if (now - ts > DRAW_IDEMPOTENCY_WINDOW_MS * 3) recentDraws.delete(key);
  }
}, 10_000);

interface DrawResult {
  success: boolean;
  prize?: {
    id: string;
    name: string;
    type: string;
    value: number;
    description: string | null;
  };
  remaining?: number;
  error?: string;
}

interface LotteryPrize {
  id: string;
  name: string;
  type: 'points' | 'custom' | 'none';
  value: number;
  description: string | null;
  probability: number;
}

async function queryConn<T = any>(conn: PoolConnection, sql: string, params?: any[]): Promise<T[]> {
  const [rows] = await conn.query(sql, params ?? []);
  return rows as T[];
}

async function queryOneConn<T = any>(conn: PoolConnection, sql: string, params?: any[]): Promise<T | null> {
  const rows = await queryConn<T>(conn, sql, params);
  return rows[0] ?? null;
}

async function execConn(conn: PoolConnection, sql: string, params?: any[]): Promise<void> {
  await conn.query(sql, params ?? []);
}

/**
 * 核心抽奖流程 — 全部在单个数据库事务内完成：
 * 1. 查次数（FOR UPDATE 锁定行防并发）
 * 2. 获取奖品 + 校验概率
 * 3. 随机命中
 * 4. 写抽奖日志（同时也是次数扣减的凭据）
 * 5. 积分类奖品：加分 + 写积分流水
 * 6. 提交事务
 */
export async function draw(memberId: string): Promise<DrawResult> {
  const lastOk = recentDraws.get(memberId);
  if (lastOk && Date.now() - lastOk < DRAW_IDEMPOTENCY_WINDOW_MS) {
    return { success: false, error: 'DUPLICATE_REQUEST' };
  }

  const result = await withTransaction(async (conn) => {
    const drawLock = buildMysqlUserLockName('lottery_draw', memberId);
    const gotDrawLock = await mysqlGetLock(conn, drawLock, 8);
    if (!gotDrawLock) {
      return { success: false, error: 'DUPLICATE_REQUEST' as const };
    }
    try {
    const memberRow = await queryOneConn<{ tenant_id: string | null }>(
      conn, 'SELECT tenant_id FROM members WHERE id = ? FOR UPDATE', [memberId]
    );
    const tenantId = memberRow?.tenant_id ?? null;

    // 0. 检查抽奖全局开关
    const settingsRow = await queryOneConn<{ enabled: number }>(
      conn,
      'SELECT enabled FROM lottery_settings WHERE tenant_id <=> ?',
      [tenantId],
    );
    if (settingsRow && settingsRow.enabled === 0) {
      return { success: false, error: 'LOTTERY_DISABLED' };
    }

    const today = getShanghaiDateString();
    const dayStart = `${today} 00:00:00`;
    const dailyFree = await getEffectiveDailyFreeSpinsConn(conn, tenantId);
    const quotaSnap = await syncLotteryQuotaDayAndLoadConn(conn, memberId, today, dailyFree);
    const freeRemaining = Math.max(0, dailyFree - quotaSnap.freeDrawsUsed);
    const totalRemaining = freeRemaining + quotaSnap.balance;
    if (totalRemaining <= 0) {
      return { success: false, error: 'NO_SPIN_QUOTA', remaining: 0 };
    }

    const prizes = await queryConn<LotteryPrize>(
      conn,
      'SELECT id, name, type, value, description, probability FROM lottery_prizes WHERE (tenant_id IS NULL OR tenant_id = ?) AND enabled = 1 ORDER BY sort_order ASC LIMIT 8',
      [tenantId]
    );
    if (prizes.length === 0) {
      return { success: false, error: 'NO_PRIZES_CONFIGURED' };
    }

    let hit: LotteryPrize;
    try {
      hit = pickLotteryPrizeByConfiguredProbability(prizes);
    } catch {
      return { success: false, error: 'PROBABILITY_SUM_NOT_100' };
    }

    let newRemaining = 0;
    if (freeRemaining > 0) {
      await execConn(
        conn,
        'UPDATE member_activity SET lottery_free_draws_used = COALESCE(lottery_free_draws_used, 0) + 1, updated_at = NOW(3) WHERE member_id = ?',
        [memberId],
      );
      const nextFreeUsed = quotaSnap.freeDrawsUsed + 1;
      newRemaining = Math.max(0, dailyFree - nextFreeUsed) + quotaSnap.balance;
    } else {
      const [ur] = await conn.query(
        'UPDATE member_activity SET lottery_spin_balance = COALESCE(lottery_spin_balance, 0) - 1, updated_at = NOW(3) WHERE member_id = ? AND COALESCE(lottery_spin_balance, 0) >= 1',
        [memberId],
      );
      const aff = Number((ur as ResultSetHeader).affectedRows ?? 0);
      if (aff !== 1) {
        return { success: false, error: 'NO_SPIN_QUOTA', remaining: 0 };
      }
      newRemaining = Math.max(0, dailyFree - quotaSnap.freeDrawsUsed) + (quotaSnap.balance - 1);
    }

    // 写抽奖日志（次数已在 member_activity 扣减）
    const logId = randomUUID();
    await execConn(conn,
      `INSERT INTO lottery_logs (id, member_id, tenant_id, prize_id, prize_name, prize_type, prize_value)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [logId, memberId, tenantId, hit.id, hit.name, hit.type, hit.value]
    );

    // 6. 积分奖品：points_accounts + points_ledger（account_id 等硬约束）+ member_activity
    if (hit.type === 'points' && hit.value > 0) {
      await applyPointsLedgerDeltaOnConn(conn, {
        ledgerId: randomUUID(),
        memberId,
        type: 'lottery',
        delta: hit.value,
        description: `幸运抽奖: ${hit.name}`,
        referenceType: 'lottery_log',
        referenceId: logId,
        createdBy: null,
        extras: { tenant_id: tenantId },
      });

      // member_activity — legacy online_points tracker
      const existing = await queryOneConn<{ id: string }>(
        conn, 'SELECT id FROM member_activity WHERE member_id = ?', [memberId]
      );
      if (existing) {
        await execConn(conn,
          'UPDATE member_activity SET online_points = online_points + ?, updated_at = NOW() WHERE member_id = ?',
          [hit.value, memberId]
        );
      } else {
        await execConn(conn,
          'INSERT INTO member_activity (id, member_id, online_points) VALUES (UUID(), ?, ?)',
          [memberId, hit.value]
        );
      }
      await execConn(conn,
        'INSERT INTO points_log (id, member_id, tenant_id, `change`, type, category, remark) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [randomUUID(), memberId, tenantId, hit.value, 'lottery', 'online_points', `幸运抽奖: ${hit.name}`]
      );
    }

    return {
      success: true,
      prize: {
        id: hit.id,
        name: hit.name,
        type: hit.type,
        value: hit.value,
        description: hit.description,
      },
      remaining: newRemaining,
    };
    } finally {
      await mysqlReleaseLock(conn, drawLock);
    }
  });

  if (result.success) {
    recentDraws.set(memberId, Date.now());
  }
  return result;
}

export async function getQuota(memberId: string) {
  const { queryOne } = await import('../../database/index.js');
  const tenantRow = await queryOne<{ tenant_id: string | null }>('SELECT tenant_id FROM members WHERE id = ?', [memberId]);
  const tenantId = tenantRow?.tenant_id ?? null;

  const settings = await getLotterySettings(tenantId);
  const enabled = !settings || settings.enabled !== 0;

  const today = getShanghaiDateString();
  const dayStart = `${today} 00:00:00`;

  return withTransaction(async (conn) => {
    const dailyFree = await getEffectiveDailyFreeSpinsConn(conn, tenantId);
    const snap = await syncLotteryQuotaDayAndLoadConn(conn, memberId, today, dailyFree);
    const freeRem = Math.max(0, dailyFree - snap.freeDrawsUsed);
    const remaining = freeRem + snap.balance;

    const usedRow = await queryOneConn<{ cnt: number }>(
      conn,
      `SELECT COUNT(*) as cnt FROM lottery_logs
       WHERE member_id = ?
         AND created_at >= ?
         AND created_at < DATE_ADD(?, INTERVAL 1 DAY)`,
      [memberId, dayStart, dayStart],
    );
    const usedToday = usedRow?.cnt ?? 0;

    return { remaining, daily_free: dailyFree, credits: snap.balance, used_today: usedToday, enabled };
  });
}

/**
 * 假人模拟抽奖：只读配置 + 与真实 draw 相同的 pickLotteryPrizeByConfiguredProbability，
 * 不写 lottery_logs、不扣次数、不发积分。
 */
export async function simulateLotteryDrawForTenant(tenantId: string | null): Promise<{
  ok: boolean;
  error?: string;
  prize?: { id: string; name: string; type: string; value: number; description: string | null };
  /** 按 sort_order ASC 的启用奖品列表中的 1-based 名次（一等奖=1） */
  rank?: number;
}> {
  const settings = await getLotterySettings(tenantId);
  if (settings && settings.enabled === 0) {
    return { ok: false, error: 'LOTTERY_DISABLED' };
  }
  const allPrizes = await listEnabledPrizes(tenantId);
  const prizes = allPrizes.slice(0, 8);
  if (prizes.length === 0) {
    return { ok: false, error: 'NO_PRIZES_CONFIGURED' };
  }
  try {
    const hit = pickLotteryPrizeByConfiguredProbability(prizes);
    const rank = prizes.findIndex((p) => p.id === hit.id) + 1;
    return {
      ok: true,
      prize: {
        id: hit.id,
        name: hit.name,
        type: hit.type,
        value: hit.value,
        description: hit.description,
      },
      rank,
    };
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === 'PROBABILITY_SUM_NOT_100') return { ok: false, error: 'PROBABILITY_SUM_NOT_100' };
    throw e;
  }
}
