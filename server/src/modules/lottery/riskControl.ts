/**
 * Phase 3: 抽奖风控最小版
 *
 * 设计原则：
 *   - 风控判断在事务 **之前** 执行，不影响主事务的正确性
 *   - 频控数据来源：lottery_logs 实际记录 + 内存滑窗（应对高并发）
 *   - 风险分 = 多维度累加（简单规则，不做 ML）
 *   - 结果只有三种：pass / downgrade / block
 *   - 所有命中都有明确记录（RISK_BLOCKED / RISK_DOWNGRADED）
 */
import { query, queryOne } from '../../database/index.js';
import { getShanghaiDateString } from '../../lib/shanghaiTime.js';

/* ──────────── 类型 ──────────── */

export interface RiskContext {
  memberId: string;
  tenantId: string | null;
  clientIp: string | null;
  deviceFingerprint: string | null;
}

export interface RiskThresholds {
  accountDailyLimit: number;
  accountBurstLimit: number;
  ipDailyLimit: number;
  ipBurstLimit: number;
  highScoreThreshold: number;
  enabled: boolean;
}

export type RiskVerdict = 'pass' | 'downgrade' | 'block';

export interface RiskResult {
  verdict: RiskVerdict;
  riskScore: number;
  reasons: string[];
  /** 用于 DrawResult.error */
  errorCode?: 'RISK_BLOCKED' | 'RISK_DAILY_LIMIT' | 'RISK_DOWNGRADED';
}

/* ──────────── 内存滑窗计数器 ──────────── */

interface SlidingBucket {
  timestamps: number[];
}

const accountBurstMap = new Map<string, SlidingBucket>();
const ipBurstMap = new Map<string, SlidingBucket>();

const BURST_WINDOW_MS = 60_000;
const GC_INTERVAL_MS = 30_000;

function countInWindow(bucket: SlidingBucket, windowMs: number): number {
  const cutoff = Date.now() - windowMs;
  bucket.timestamps = bucket.timestamps.filter((t) => t > cutoff);
  return bucket.timestamps.length;
}

function recordHit(map: Map<string, SlidingBucket>, key: string): number {
  let bucket = map.get(key);
  if (!bucket) {
    bucket = { timestamps: [] };
    map.set(key, bucket);
  }
  const now = Date.now();
  bucket.timestamps.push(now);
  return countInWindow(bucket, BURST_WINDOW_MS);
}

function peekCount(map: Map<string, SlidingBucket>, key: string, windowMs: number): number {
  const bucket = map.get(key);
  if (!bucket) return 0;
  return countInWindow(bucket, windowMs);
}

const _riskGcTimer = setInterval(() => {
  const cutoff = Date.now() - BURST_WINDOW_MS * 2;
  for (const [key, bucket] of accountBurstMap) {
    bucket.timestamps = bucket.timestamps.filter((t) => t > cutoff);
    if (bucket.timestamps.length === 0) accountBurstMap.delete(key);
  }
  for (const [key, bucket] of ipBurstMap) {
    bucket.timestamps = bucket.timestamps.filter((t) => t > cutoff);
    if (bucket.timestamps.length === 0) ipBurstMap.delete(key);
  }
}, GC_INTERVAL_MS);
if (typeof process !== 'undefined') process.once?.('beforeExit', () => clearInterval(_riskGcTimer));

/* ──────────── 加载风控设置 ──────────── */

export async function loadRiskThresholds(tenantId: string | null): Promise<RiskThresholds> {
  const row = await queryOne<{
    risk_control_enabled: number;
    risk_account_daily_limit: number;
    risk_account_burst_limit: number;
    risk_ip_daily_limit: number;
    risk_ip_burst_limit: number;
    risk_high_score_threshold: number;
  }>(
    `SELECT COALESCE(risk_control_enabled, 0) AS risk_control_enabled,
            COALESCE(risk_account_daily_limit, 0) AS risk_account_daily_limit,
            COALESCE(risk_account_burst_limit, 0) AS risk_account_burst_limit,
            COALESCE(risk_ip_daily_limit, 0) AS risk_ip_daily_limit,
            COALESCE(risk_ip_burst_limit, 0) AS risk_ip_burst_limit,
            COALESCE(risk_high_score_threshold, 0) AS risk_high_score_threshold
     FROM lottery_settings WHERE tenant_id <=> ?`,
    [tenantId],
  );
  return {
    enabled: Number(row?.risk_control_enabled) === 1,
    accountDailyLimit: Math.max(0, Number(row?.risk_account_daily_limit ?? 0)),
    accountBurstLimit: Math.max(0, Number(row?.risk_account_burst_limit ?? 0)),
    ipDailyLimit: Math.max(0, Number(row?.risk_ip_daily_limit ?? 0)),
    ipBurstLimit: Math.max(0, Number(row?.risk_ip_burst_limit ?? 0)),
    highScoreThreshold: Math.max(0, Number(row?.risk_high_score_threshold ?? 0)),
  };
}

/* ──────────── 核心评估 ──────────── */

/**
 * 在抽奖事务之前调用。纯读评估，不记录到滑窗。
 * 抽奖成功后调用 recordDrawBurst() 记录。
 */
export async function evaluateDrawRisk(
  ctx: RiskContext,
  thresholds: RiskThresholds,
): Promise<RiskResult> {
  if (!thresholds.enabled) {
    return { verdict: 'pass', riskScore: 0, reasons: [] };
  }

  const reasons: string[] = [];
  let score = 0;

  const today = getShanghaiDateString();
  const dayStart = `${today} 00:00:00`;

  // ── 1. 账号维度 ──

  // 1a. burst：内存滑窗 60s (peek only, don't record yet)
  const accountBurstCount = peekCount(accountBurstMap, ctx.memberId, BURST_WINDOW_MS) + 1;
  if (thresholds.accountBurstLimit > 0 && accountBurstCount > thresholds.accountBurstLimit) {
    reasons.push(`account_burst:${accountBurstCount}/${thresholds.accountBurstLimit}`);
    score += 50;
  }

  // 1b. daily：DB 查询
  if (thresholds.accountDailyLimit > 0) {
    const row = await queryOne<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM lottery_logs
       WHERE member_id = ? AND created_at >= ? AND created_at < DATE_ADD(?, INTERVAL 1 DAY)`,
      [ctx.memberId, dayStart, dayStart],
    );
    const dailyCount = Number(row?.cnt ?? 0);
    if (dailyCount >= thresholds.accountDailyLimit) {
      reasons.push(`account_daily:${dailyCount}/${thresholds.accountDailyLimit}`);
      score += 60;
    } else if (dailyCount >= thresholds.accountDailyLimit * 0.8) {
      reasons.push(`account_daily_warn:${dailyCount}/${thresholds.accountDailyLimit}`);
      score += 20;
    }
  }

  // ── 2. IP 维度 ──
  if (ctx.clientIp) {
    // 2a. burst：内存滑窗 60s (peek only)
    const ipBurstCount = peekCount(ipBurstMap, ctx.clientIp, BURST_WINDOW_MS) + 1;
    if (thresholds.ipBurstLimit > 0 && ipBurstCount > thresholds.ipBurstLimit) {
      reasons.push(`ip_burst:${ipBurstCount}/${thresholds.ipBurstLimit}`);
      score += 40;
    }

    // 2b. daily：同 IP 不同账号数
    if (thresholds.ipDailyLimit > 0) {
      const ipRow = await queryOne<{ cnt: number }>(
        `SELECT COUNT(DISTINCT member_id) AS cnt FROM lottery_logs
         WHERE client_ip = ? AND created_at >= ? AND created_at < DATE_ADD(?, INTERVAL 1 DAY)`,
        [ctx.clientIp, dayStart, dayStart],
      );
      const ipAccounts = Number(ipRow?.cnt ?? 0);
      if (ipAccounts >= thresholds.ipDailyLimit) {
        reasons.push(`ip_multi_account:${ipAccounts}/${thresholds.ipDailyLimit}`);
        score += 30;
      }
    }
  }

  // ── 3. 裁定 ──
  let verdict: RiskVerdict = 'pass';

  // 硬拦截：账号 burst 或 daily 超限
  if (score >= 50 && reasons.some((r) => r.startsWith('account_burst:') || r.startsWith('account_daily:'))) {
    verdict = 'block';
  }
  // 降级：IP 频率异常或接近限额
  else if (score >= 30) {
    verdict = 'downgrade';
  }
  // 高风险分阈值
  if (thresholds.highScoreThreshold > 0 && score >= thresholds.highScoreThreshold) {
    verdict = verdict === 'block' ? 'block' : 'downgrade';
  }

  const isDailyLimit = reasons.some((r) => r.startsWith('account_daily:'));
  return {
    verdict,
    riskScore: score,
    reasons,
    errorCode: verdict === 'block'
      ? (isDailyLimit ? 'RISK_DAILY_LIMIT' : 'RISK_BLOCKED')
      : verdict === 'downgrade' ? 'RISK_DOWNGRADED' : undefined,
  };
}

/**
 * Call after a successful draw to record the burst hit in the sliding window.
 */
export function recordDrawBurst(ctx: RiskContext): void {
  recordHit(accountBurstMap, ctx.memberId);
  if (ctx.clientIp) {
    recordHit(ipBurstMap, ctx.clientIp);
  }
}
