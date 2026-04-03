/**
 * 抽奖系统 HTTP 控制器
 */
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../middlewares/auth.js';
import { draw, getQuota } from './service.js';
import {
  listPrizes,
  upsertPrizes,
  listLotteryLogs,
  countLotteryLogsForMember,
  listAllLotteryLogs,
  countAllLotteryLogs,
  getLotterySettings,
  upsertLotterySettings,
  getMemberTenantId,
  listEnabledPrizes,
  type LotteryPrize,
} from './repository.js';
import { execute } from '../../database/index.js';
import { resolveTenantIdForActivityDataList } from '../memberPortalSettings/activityDataTenant.js';
import {
  listPendingRewards,
  retryFailedRewards,
  confirmManualReward,
  manualRetryReward,
} from './rewardCompensation.js';
import {
  simulateWithCurrentConfig,
  simulatePreview,
  getTenantSnapshot,
  type PreviewInput,
} from './simulationEngine.js';
import {
  reconcileAll,
} from './reconciliationTasks.js';
import { query, queryOne } from '../../database/index.js';
import {
  runRewardRetry,
  runStockReconcile,
  runBudgetReconcile,
  runIdempotencyRepair,
  getRunHistory,
  getLastRun,
  startLotteryScheduler,
  stopLotteryScheduler,
  isSchedulerRunning,
  type TaskType,
} from './lotteryScheduler.js';

/* ──── 会员端 ──── */

export async function drawController(req: AuthenticatedRequest, res: Response) {
  const memberId = req.user?.id;
  if (!memberId) { res.status(401).json({ success: false, error: 'UNAUTHORIZED' }); return; }
  const requestId = typeof req.body?.request_id === 'string' && req.body.request_id.trim()
    ? req.body.request_id.trim()
    : undefined;
  const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || null;
  const deviceFingerprint = typeof req.body?.device_fingerprint === 'string' && req.body.device_fingerprint.trim()
    ? req.body.device_fingerprint.trim().slice(0, 128)
    : (typeof req.headers['x-device-fingerprint'] === 'string' ? req.headers['x-device-fingerprint'].slice(0, 128) : null);
  const result = await draw(memberId, { requestId, clientIp, deviceFingerprint });
  res.json(result);
}

/**
 * 会员 JWT：仅能查自己（忽略或校验 URL 中的 memberId）。
 * 员工 JWT：必须用 URL 中的 memberId，且 memberId 必须属于员工的同一租户。
 */
export async function resolveMemberScope(
  req: AuthenticatedRequest,
  paramMemberId: string | undefined,
): Promise<{ memberId: string | null; forbidden: boolean }> {
  const uid = req.user?.id;
  if (!uid) return { memberId: null, forbidden: false };
  const param = paramMemberId?.trim() || undefined;
  if (req.user?.type === 'member') {
    if (param && param !== uid) return { memberId: null, forbidden: true };
    return { memberId: uid, forbidden: false };
  }
  if (!param) return { memberId: null, forbidden: false };
  // 员工查询：校验 memberId 归属于员工的同一租户
  if (req.user?.tenant_id) {
    const memberTenant = await getMemberTenantId(param);
    if (memberTenant !== req.user.tenant_id) {
      return { memberId: null, forbidden: true };
    }
  }
  return { memberId: param, forbidden: false };
}

export async function quotaController(req: AuthenticatedRequest, res: Response) {
  const { memberId, forbidden } = await resolveMemberScope(req, req.params.memberId);
  if (forbidden) {
    res.status(403).json({ success: false, error: 'FORBIDDEN' });
    return;
  }
  if (!memberId) {
    res.status(400).json({ success: false, error: 'MISSING_MEMBER_ID' });
    return;
  }
  const quota = await getQuota(memberId);
  res.json({ success: true, ...quota });
}

export async function myLogsController(req: AuthenticatedRequest, res: Response) {
  const { memberId, forbidden } = await resolveMemberScope(req, req.params.memberId);
  if (forbidden) {
    res.status(403).json({ success: false, error: 'FORBIDDEN' });
    return;
  }
  if (!memberId) {
    res.status(400).json({ success: false, error: 'MISSING_MEMBER_ID' });
    return;
  }
  const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 50));
  const offset = Math.max(0, Number(req.query.offset) || 0);
  const [logs, total] = await Promise.all([
    listLotteryLogs(memberId, limit, offset),
    countLotteryLogsForMember(memberId),
  ]);
  res.json({ success: true, logs, total });
}

export async function memberPrizesController(req: AuthenticatedRequest, res: Response) {
  const { memberId, forbidden } = await resolveMemberScope(req, req.params.memberId);
  if (forbidden) {
    res.status(403).json({ success: false, error: 'FORBIDDEN' });
    return;
  }
  if (!memberId) {
    res.setHeader('Cache-Control', 'private, no-store');
    res.json({ success: true, prizes: [], probability_notice: null });
    return;
  }
  const tenantId = await getMemberTenantId(memberId);
  const { listEnabledPrizes } = await import('./repository.js');
  const allPrizes = await listEnabledPrizes(tenantId);
  const prizes = allPrizes.slice(0, 8);
  const settings = await getLotterySettings(tenantId);
  const enabled = !settings || settings.enabled !== 0;
  const ocEn = Number(settings?.order_completed_spin_enabled) === 1;
  const ocAmt = Math.max(0, Math.floor(Number(settings?.order_completed_spin_amount) || 0));
  res.setHeader('Cache-Control', 'private, no-store');
  res.json({
    success: true,
    prizes,
    probability_notice: settings?.probability_notice ?? null,
    enabled,
    order_completed_spin_enabled: ocEn,
    order_completed_spin_amount: ocAmt,
  });
}

/* ──── 管理端 ──── */

export async function adminListPrizesController(req: AuthenticatedRequest, res: Response) {
  const tenantId = req.user?.tenant_id ?? null;
  const prizes = await listPrizes(tenantId);
  res.json({ success: true, prizes });
}

export async function adminSavePrizesController(req: AuthenticatedRequest, res: Response) {
  const tenantId = req.user?.tenant_id ?? null;
  const { prizes } = req.body;
  if (!Array.isArray(prizes)) {
    res.status(400).json({ success: false, error: 'INVALID_PRIZES' });
    return;
  }

  const total = prizes.reduce((sum: number, p: any) => sum + Number(p.probability || 0), 0);
  if (Math.abs(total - 100) > 0.001) {
    res.status(400).json({ success: false, error: 'PROBABILITY_SUM_NOT_100', total });
    return;
  }

  const hasNone = prizes.some((p: any) => p.type === 'none');
  if (!hasNone) {
    res.status(400).json({ success: false, error: 'MUST_HAVE_THANKS_PRIZE' });
    return;
  }

  const parseDisplayProbability = (v: unknown): number | null => {
    if (v == null || v === '') return null;
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    return Math.min(100, Math.max(0, n));
  };

  const normalized = prizes.map((p: Record<string, unknown>, idx: number) => ({
    id: typeof p.id === 'string' && p.id.trim() ? p.id.trim() : '',
    tenant_id: tenantId,
    name: String(p.name ?? ''),
    type: p.type as 'points' | 'custom' | 'none',
    value: Number(p.value) || 0,
    description: (p.description as string | null) ?? null,
    probability: Number(p.probability),
    display_probability: parseDisplayProbability(p.display_probability),
    image_url: (p.image_url as string | null) ?? null,
    sort_order: Number(p.sort_order) || idx,
  }));

  await upsertPrizes(tenantId, normalized as Omit<LotteryPrize, 'enabled'>[]);
  res.json({ success: true });
}

export async function adminListLogsController(req: AuthenticatedRequest, res: Response) {
  const resolved = resolveTenantIdForActivityDataList(req);
  let tenantId: string | null = null;
  if (resolved.ok) {
    tenantId = resolved.tenantId;
  } else {
    const code = (resolved.body?.error as { code?: string } | undefined)?.code;
    if (code === 'TENANT_ID_REQUIRED') {
      tenantId = (req.user?.tenant_id != null ? String(req.user.tenant_id).trim() : '') || null;
      if (!tenantId) {
        res.status(resolved.status).json(resolved.body);
        return;
      }
    } else {
      res.status(resolved.status).json(resolved.body);
      return;
    }
  }
  const limit = Math.min(2000, Math.max(1, Number(req.query.limit) || 50));
  const offset = Math.max(0, Number(req.query.offset) || 0);
  const phone = typeof req.query.phone === 'string' ? req.query.phone : '';
  const memberCode = typeof req.query.member_code === 'string' ? req.query.member_code : '';
  const filter =
    phone.trim() || memberCode.trim()
      ? { phone: phone.trim() || undefined, memberCode: memberCode.trim() || undefined }
      : undefined;
  const [rawLogs, total] = await Promise.all([
    listAllLotteryLogs(tenantId, limit, offset, filter),
    countAllLotteryLogs(tenantId, filter),
  ]);
  const logs = rawLogs.map((row) => ({
    id: String(row.id),
    member_id: String(row.member_id),
    prize_name: String(row.prize_name ?? ''),
    prize_type: String(row.prize_type ?? ''),
    prize_value: Number(row.prize_value ?? 0),
    prize_cost: Number((row as any).prize_cost ?? 0),
    reward_status: String((row as any).reward_status ?? 'done'),
    reward_type: String((row as any).reward_type ?? 'auto'),
    retry_count: Number((row as any).retry_count ?? 0),
    fail_reason: (row as any).fail_reason ?? null,
    created_at: row.created_at != null ? String(row.created_at) : '',
    phone_number: row.phone_number != null && String(row.phone_number).trim() !== '' ? String(row.phone_number).trim() : null,
    nickname: row.nickname != null && String(row.nickname).trim() !== '' ? String(row.nickname).trim() : null,
    member_code: row.member_code != null && String(row.member_code).trim() !== '' ? String(row.member_code).trim() : null,
  }));
  res.json({ success: true, logs, total });
}

export async function adminGetSettingsController(req: AuthenticatedRequest, res: Response) {
  const tenantId = req.user?.tenant_id ?? null;
  const settings = await getLotterySettings(tenantId);
  res.json({
    success: true,
    daily_free_spins: settings?.daily_free_spins ?? 1,
    enabled: settings?.enabled !== 0,
    probability_notice: settings?.probability_notice ?? null,
    order_completed_spin_enabled: Number(settings?.order_completed_spin_enabled) === 1,
    order_completed_spin_amount: Math.max(0, Math.floor(Number(settings?.order_completed_spin_amount) || 0)),
    daily_reward_budget: Number(settings?.daily_reward_budget ?? 0),
    daily_reward_used: Number(settings?.daily_reward_used ?? 0),
    target_rtp: Number(settings?.target_rtp ?? 0),
    budget_policy: settings?.budget_policy ?? 'downgrade',
    risk_control_enabled: Number(settings?.risk_control_enabled) === 1,
    risk_account_daily_limit: Number(settings?.risk_account_daily_limit ?? 0),
    risk_account_burst_limit: Number(settings?.risk_account_burst_limit ?? 0),
    risk_ip_daily_limit: Number(settings?.risk_ip_daily_limit ?? 0),
    risk_ip_burst_limit: Number(settings?.risk_ip_burst_limit ?? 0),
    risk_high_score_threshold: Number(settings?.risk_high_score_threshold ?? 0),
  });
}

export async function adminSaveSettingsController(req: AuthenticatedRequest, res: Response) {
  const tenantId = req.user?.tenant_id ?? null;
  const body = req.body || {};
  const { daily_free_spins, enabled } = body;
  const parsed = Number(daily_free_spins);
  const n = Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 1;
  const noticePatch = Object.prototype.hasOwnProperty.call(body, 'probability_notice')
    ? body.probability_notice == null || String(body.probability_notice).trim() === ''
      ? null
      : String(body.probability_notice).trim()
    : undefined;
  const orderSpin =
    Object.prototype.hasOwnProperty.call(body, 'order_completed_spin_enabled') ||
    Object.prototype.hasOwnProperty.call(body, 'order_completed_spin_amount')
      ? {
          enabled: body.order_completed_spin_enabled !== false && body.order_completed_spin_enabled !== 0,
          amount: Math.max(0, Math.floor(Number(body.order_completed_spin_amount) || 0)),
        }
      : undefined;

  const hasBudget =
    Object.prototype.hasOwnProperty.call(body, 'daily_reward_budget') ||
    Object.prototype.hasOwnProperty.call(body, 'target_rtp') ||
    Object.prototype.hasOwnProperty.call(body, 'budget_policy') ||
    Object.prototype.hasOwnProperty.call(body, 'risk_control_enabled') ||
    Object.prototype.hasOwnProperty.call(body, 'risk_account_daily_limit') ||
    Object.prototype.hasOwnProperty.call(body, 'risk_account_burst_limit') ||
    Object.prototype.hasOwnProperty.call(body, 'risk_ip_daily_limit') ||
    Object.prototype.hasOwnProperty.call(body, 'risk_ip_burst_limit') ||
    Object.prototype.hasOwnProperty.call(body, 'risk_high_score_threshold');
  const budgetPatch = hasBudget
    ? {
        daily_reward_budget: Object.prototype.hasOwnProperty.call(body, 'daily_reward_budget')
          ? Math.max(0, Number(body.daily_reward_budget) || 0)
          : undefined,
        target_rtp: Object.prototype.hasOwnProperty.call(body, 'target_rtp')
          ? Math.max(0, Math.min(100, Number(body.target_rtp) || 0))
          : undefined,
        budget_policy: Object.prototype.hasOwnProperty.call(body, 'budget_policy')
          ? (body.budget_policy as 'deny' | 'downgrade' | 'fallback')
          : undefined,
        risk_control_enabled: Object.prototype.hasOwnProperty.call(body, 'risk_control_enabled')
          ? body.risk_control_enabled !== false && body.risk_control_enabled !== 0
          : undefined,
        risk_account_daily_limit: Object.prototype.hasOwnProperty.call(body, 'risk_account_daily_limit')
          ? Math.max(0, Math.floor(Number(body.risk_account_daily_limit) || 0))
          : undefined,
        risk_account_burst_limit: Object.prototype.hasOwnProperty.call(body, 'risk_account_burst_limit')
          ? Math.max(0, Math.floor(Number(body.risk_account_burst_limit) || 0))
          : undefined,
        risk_ip_daily_limit: Object.prototype.hasOwnProperty.call(body, 'risk_ip_daily_limit')
          ? Math.max(0, Math.floor(Number(body.risk_ip_daily_limit) || 0))
          : undefined,
        risk_ip_burst_limit: Object.prototype.hasOwnProperty.call(body, 'risk_ip_burst_limit')
          ? Math.max(0, Math.floor(Number(body.risk_ip_burst_limit) || 0))
          : undefined,
        risk_high_score_threshold: Object.prototype.hasOwnProperty.call(body, 'risk_high_score_threshold')
          ? Math.max(0, Math.floor(Number(body.risk_high_score_threshold) || 0))
          : undefined,
      }
    : undefined;

  await upsertLotterySettings(tenantId, n, enabled !== false, noticePatch, orderSpin, budgetPatch);
  if (tenantId) {
    await execute(
      'UPDATE member_portal_settings SET daily_free_spins_per_day = ? WHERE tenant_id = ?',
      [n, tenantId],
    );
  }
  res.json({ success: true });
}

/* ──── Phase 4: 奖励补偿管理 ──── */

/** 查询待处理/失败的奖励记录 */
export async function adminPendingRewardsController(req: AuthenticatedRequest, res: Response) {
  const tenantId = req.user?.tenant_id ?? null;
  const status = req.query.status === 'failed' ? 'failed' : req.query.status === 'pending' ? 'pending' : undefined;
  const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 50));
  const offset = Math.max(0, Number(req.query.offset) || 0);
  const { rows, total } = await listPendingRewards(tenantId, { status, limit, offset });
  res.json({ success: true, rows, total });
}

/** 批量自动重试失败的奖励 */
export async function adminRetryFailedRewardsController(req: AuthenticatedRequest, res: Response) {
  const tenantId = req.user?.tenant_id ?? null;
  const batchSize = Math.min(100, Math.max(1, Number(req.body?.batch_size) || 20));
  const result = await retryFailedRewards(tenantId, batchSize);
  res.json({ success: true, ...result });
}

/** 管理员手动确认 custom 奖品 */
export async function adminConfirmRewardController(req: AuthenticatedRequest, res: Response) {
  const logId = typeof req.body?.log_id === 'string' ? req.body.log_id.trim() : '';
  if (!logId) { res.status(400).json({ success: false, error: 'MISSING_LOG_ID' }); return; }
  const action = req.body?.action === 'failed' ? 'failed' as const : 'done' as const;
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : undefined;
  const result = await confirmManualReward(logId, action, reason);
  if (!result.ok) { res.status(400).json({ success: false, error: result.error }); return; }
  res.json({ success: true });
}

/** 管理员手动重试单条失败的奖励 */
export async function adminManualRetryRewardController(req: AuthenticatedRequest, res: Response) {
  const logId = typeof req.body?.log_id === 'string' ? req.body.log_id.trim() : '';
  if (!logId) { res.status(400).json({ success: false, error: 'MISSING_LOG_ID' }); return; }
  const result = await manualRetryReward(logId);
  if (!result.ok) { res.status(400).json({ success: false, error: result.error }); return; }
  res.json({ success: true, new_status: result.newStatus });
}

/* ──── Phase 5: 模拟抽奖与运营预览 ──── */

/** 用当前 DB 配置跑 Monte Carlo 模拟 */
export async function adminSimulateCurrentController(req: AuthenticatedRequest, res: Response) {
  const tenantId = req.user?.tenant_id ?? null;
  const rounds = Math.min(100_000, Math.max(100, Number(req.query.rounds) || 10_000));
  try {
    const result = await simulateWithCurrentConfig(tenantId, rounds);
    res.json({ success: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === 'NO_PRIZES_CONFIGURED') {
      res.status(400).json({ success: false, error: 'NO_PRIZES_CONFIGURED' });
    } else {
      res.status(500).json({ success: false, error: 'SIMULATION_FAILED' });
    }
  }
}

/** 保存前预览：用前端传入的候选配置跑模拟 */
export async function adminSimulatePreviewController(req: AuthenticatedRequest, res: Response) {
  const body = req.body as PreviewInput | undefined;
  if (!body?.prizes || !Array.isArray(body.prizes) || body.prizes.length === 0) {
    res.status(400).json({ success: false, error: 'MISSING_PRIZES' });
    return;
  }
  try {
    const result = simulatePreview(body);
    res.json({ success: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(400).json({ success: false, error: msg || 'SIMULATION_FAILED' });
  }
}

/** 租户当前抽奖状态快照（概率分布 / 库存 / 预算余额） */
export async function adminSnapshotController(req: AuthenticatedRequest, res: Response) {
  const tenantId = req.user?.tenant_id ?? null;
  const snapshot = await getTenantSnapshot(tenantId);
  res.json({ success: true, ...snapshot });
}

/* ──── Phase 6: 恢复与补偿任务 ──── */

/** 一键执行全部校正（库存 + 预算 + 幂等 + 可选奖励重试） */
export async function adminReconcileAllController(req: AuthenticatedRequest, res: Response) {
  const tenantId = req.user?.tenant_id ?? null;
  const autoFix = req.body?.auto_fix !== false;
  const includeRewardRetry = req.body?.include_reward_retry !== false;
  try {
    const result = await reconcileAll(tenantId, { autoFix, includeRewardRetry });
    res.json({ success: true, ...result });
  } catch (e) {
    res.status(500).json({ success: false, error: `RECONCILE_FAILED: ${e instanceof Error ? e.message : String(e)}` });
  }
}

/** 单独触发某个校正任务 */
export async function adminRunTaskController(req: AuthenticatedRequest, res: Response) {
  const tenantId = req.user?.tenant_id ?? null;
  const taskType = req.body?.task as string;
  const autoFix = req.body?.auto_fix !== false;

  const validTypes: TaskType[] = ['reward_retry', 'stock_reconcile', 'budget_reconcile', 'idempotency_repair'];
  if (!validTypes.includes(taskType as TaskType)) {
    res.status(400).json({ success: false, error: 'INVALID_TASK_TYPE', valid: validTypes });
    return;
  }

  try {
    let record;
    switch (taskType) {
      case 'reward_retry': record = await runRewardRetry(tenantId); break;
      case 'stock_reconcile': record = await runStockReconcile(tenantId, autoFix); break;
      case 'budget_reconcile': record = await runBudgetReconcile(tenantId, autoFix); break;
      case 'idempotency_repair': record = await runIdempotencyRepair(tenantId); break;
    }
    res.json({ success: true, record });
  } catch (e) {
    res.status(500).json({ success: false, error: `TASK_FAILED: ${e instanceof Error ? e.message : String(e)}` });
  }
}

/** 查询任务运行历史 */
export async function adminTaskHistoryController(req: AuthenticatedRequest, res: Response) {
  const type = typeof req.query.type === 'string' ? req.query.type as TaskType : undefined;
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  const history = getRunHistory({ type, limit });
  const last: Record<string, unknown> = {};
  for (const t of ['reward_retry', 'stock_reconcile', 'budget_reconcile', 'idempotency_repair'] as const) {
    last[t] = getLastRun(t);
  }
  res.json({ success: true, history, last_runs: last });
}

/** 调度器控制（启动 / 停止 / 状态） */
export async function adminSchedulerController(req: AuthenticatedRequest, res: Response) {
  const action = req.body?.action as string;
  if (action === 'start') {
    startLotteryScheduler();
    res.json({ success: true, running: true });
  } else if (action === 'stop') {
    stopLotteryScheduler();
    res.json({ success: true, running: false });
  } else {
    res.json({ success: true, running: isSchedulerRunning() });
  }
}

/* ──── Phase 7: 运营仪表盘统计 ──── */

export async function adminOperationalStatsController(req: AuthenticatedRequest, res: Response) {
  const tenantId = req.user?.tenant_id ?? null;

  const { getShanghaiDateString: getToday } = await import('../../lib/shanghaiTime.js');
  const today = getToday();
  const dayStart = `${today} 00:00:00`;

  const [settings, prizes, todayStats, riskStats] = await Promise.all([
    getLotterySettings(tenantId),
    listEnabledPrizes(tenantId),
    queryOne<{
      draws_today: number;
      cost_today: number;
      winners_today: number;
      points_awarded_today: number;
    }>(
      `SELECT
         COUNT(*) AS draws_today,
         COALESCE(SUM(CASE WHEN prize_type <> 'none' AND reward_status = 'done' THEN COALESCE(prize_cost, 0) ELSE 0 END), 0) AS cost_today,
         SUM(CASE WHEN prize_type <> 'none' THEN 1 ELSE 0 END) AS winners_today,
         COALESCE(SUM(CASE WHEN prize_type = 'points' AND reward_status = 'done' THEN prize_value ELSE 0 END), 0) AS points_awarded_today
       FROM lottery_logs
       WHERE tenant_id <=> ?
         AND created_at >= ?
         AND created_at < DATE_ADD(?, INTERVAL 1 DAY)`,
      [tenantId, dayStart, dayStart],
    ),
    queryOne<{
      risk_blocked: number;
      risk_downgraded: number;
      failed_rewards: number;
      pending_rewards: number;
    }>(
      `SELECT
         SUM(CASE WHEN client_ip IS NOT NULL AND prize_type = 'none' AND created_at >= ? THEN 0 ELSE 0 END) AS risk_blocked,
         0 AS risk_downgraded,
         SUM(CASE WHEN reward_status = 'failed' THEN 1 ELSE 0 END) AS failed_rewards,
         SUM(CASE WHEN reward_status = 'pending' THEN 1 ELSE 0 END) AS pending_rewards
       FROM lottery_logs
       WHERE tenant_id <=> ?`,
      [dayStart, tenantId],
    ),
  ]);

  const riskBlockedRow = await queryOne<{ cnt: number }>(
    `SELECT COUNT(*) AS cnt FROM lottery_logs
     WHERE tenant_id <=> ?
       AND created_at >= ? AND created_at < DATE_ADD(?, INTERVAL 1 DAY)
       AND fail_reason LIKE '%RISK%'`,
    [tenantId, dayStart, dayStart],
  );

  const budgetCap = Number(settings?.daily_reward_budget ?? 0);
  const budgetUsed = Number(settings?.daily_reward_used ?? 0);
  const targetRtp = Number(settings?.target_rtp ?? 0);
  const effectiveCap = budgetCap > 0 && targetRtp > 0
    ? Math.min(budgetCap, budgetCap * targetRtp / 100)
    : budgetCap;

  const costToday = Number(todayStats?.cost_today ?? 0);
  const drawsToday = Number(todayStats?.draws_today ?? 0);
  const actualRtp = budgetCap > 0 ? Math.round((costToday / budgetCap) * 10000) / 100 : 0;

  const stockInfo = prizes.slice(0, 8).map((p) => ({
    id: p.id,
    name: p.name,
    type: p.type,
    stock_enabled: Number(p.stock_enabled) === 1,
    stock_total: Number(p.stock_total),
    stock_used: Number(p.stock_used) || 0,
    stock_remaining: Number(p.stock_enabled) === 1 && Number(p.stock_total) >= 0
      ? Math.max(0, Number(p.stock_total) - (Number(p.stock_used) || 0))
      : -1,
  }));

  res.json({
    success: true,
    date: today,
    budget: {
      daily_budget: budgetCap,
      daily_used: budgetUsed,
      daily_remaining: effectiveCap > 0 ? Math.max(0, effectiveCap - budgetUsed) : -1,
      effective_cap: effectiveCap,
      target_rtp: targetRtp,
      actual_rtp: actualRtp,
      budget_policy: settings?.budget_policy ?? 'downgrade',
    },
    today: {
      draws: drawsToday,
      cost: costToday,
      winners: Number(todayStats?.winners_today ?? 0),
      points_awarded: Number(todayStats?.points_awarded_today ?? 0),
      avg_cost_per_draw: drawsToday > 0 ? Math.round((costToday / drawsToday) * 100) / 100 : 0,
    },
    stock: stockInfo,
    risk: {
      enabled: Number(settings?.risk_control_enabled) === 1,
      blocked_today: Number(riskBlockedRow?.cnt ?? 0),
      failed_rewards: Number(riskStats?.failed_rewards ?? 0),
      pending_rewards: Number(riskStats?.pending_rewards ?? 0),
    },
  });
}
