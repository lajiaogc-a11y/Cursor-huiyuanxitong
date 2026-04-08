/**
 * 抽奖「预算成本」统一口径：与奖品配置、落库 lottery_logs、仪表盘汇总一致。
 * - 优先使用 prize_cost（>0）
 * - 积分类：未配置 cost 时用面值 value（与后台保存奖品时的默认规则一致）
 * - custom：未配置 cost 时回退到 value（可作标价/成本占位）
 * - none：成本为 0
 */

export function resolvePrizeBudgetCost(p: {
  type: string;
  value: number;
  prize_cost?: number;
}): number {
  const pc = Number(p.prize_cost ?? 0);
  if (Number.isFinite(pc) && pc > 0) return pc;
  const t = String(p.type ?? '').toLowerCase();
  if (t === 'none') return 0;
  if (t === 'points' || t === 'custom') return Math.max(0, Number(p.value) || 0);
  return 0;
}

/**
 * lottery_logs 单行：计入「今日预算消耗」的有效成本（仅用于 SUM；与 resolvePrizeBudgetCost 语义对齐）。
 * - 仅统计 reward_status = 'done' 且非 none（与业务「实际发奖/完成」一致）
 * - points：优先 prize_cost；否则已发积分 reward_points；再否则 prize_value
 */
export const SQL_LOTTERY_LOG_EFFECTIVE_BUDGET_COST = `
  CASE
    WHEN prize_type = 'none' OR reward_status <> 'done' THEN 0
    WHEN COALESCE(prize_cost, 0) > 0 THEN COALESCE(prize_cost, 0)
    WHEN prize_type = 'points' THEN COALESCE(NULLIF(reward_points, 0), prize_value, 0)
    ELSE COALESCE(prize_value, 0)
  END
`;

/** 仅积分类奖品、已完成的实际发放积分（业务「积分成本」与每日预算已用口径） */
export const SQL_LOTTERY_LOG_POINTS_ISSUED_COST = `
  CASE
    WHEN prize_type = 'points' AND reward_status = 'done'
    THEN COALESCE(NULLIF(reward_points, 0), prize_value, 0)
    ELSE 0
  END
`;
