/**
 * Phase 5: 模拟抽奖与运营预览
 *
 * 核心设计：
 *   1. 使用与 draw() 完全相同的 pickLotteryPrizeByConfiguredProbability / budgetAwarePrizePick
 *   2. 纯内存 Monte Carlo，不写任何 DB
 *   3. 支持两种模式：
 *      a) 当前配置模拟 — 用 DB 中的真实 prizes + settings
 *      b) 预览模拟 — 用前端传入的候选 prizes（保存前先试跑）
 *   4. 输出：每个奖品命中次数、命中率、平均成本、预估 RTP、预算耗尽轮次、警告
 */
import {
  pickLotteryPrizeByConfiguredProbability,
  budgetAwarePrizePick,
  type BudgetPolicy,
} from './prizePick.js';
import { getLotterySettings, listEnabledPrizes } from './repository.js';

/* ──────────── 类型 ──────────── */

export interface SimPrizeInput {
  id: string;
  name: string;
  type: string;
  value: number;
  probability: number;
  prize_cost: number;
  stock_enabled: number;
  stock_total: number;
  stock_used: number;
}

export interface SimBudgetInput {
  daily_reward_budget: number;
  daily_reward_used: number;
  target_rtp: number;
  budget_policy: BudgetPolicy;
}

export interface SimPrizeResult {
  id: string;
  name: string;
  type: string;
  probability: number;
  prize_cost: number;
  hits: number;
  hit_rate: number;
  total_cost: number;
  avg_cost_per_draw: number;
  stock_total: number;
  stock_used_before: number;
  stock_depleted_at_round?: number;
}

export interface SimulationResult {
  rounds: number;
  prizes: SimPrizeResult[];
  total_cost: number;
  avg_cost_per_round: number;
  estimated_rtp: number;
  budget_exhausted_at_round: number | null;
  budget_remaining: number;
  warnings: string[];
}

/* ──────────── Monte Carlo 引擎 ──────────── */

export function runSimulation(
  prizes: SimPrizeInput[],
  budget: SimBudgetInput,
  rounds: number,
): SimulationResult {
  const n = Math.min(100_000, Math.max(1, rounds));
  const warnings: string[] = [];

  const budgetCap = budget.daily_reward_budget;
  const targetRtp = budget.target_rtp;
  const effectiveCap = budgetCap > 0 && targetRtp > 0
    ? Math.min(budgetCap, budgetCap * targetRtp / 100)
    : budgetCap;
  const budgetEnabled = effectiveCap > 0;
  let budgetUsed = budget.daily_reward_used;
  let budgetExhaustedAt: number | null = null;

  // per-prize tracking
  const hitMap = new Map<string, { hits: number; totalCost: number; stockUsed: number; depletedAt?: number }>();
  for (const p of prizes) {
    hitMap.set(p.id, { hits: 0, totalCost: 0, stockUsed: Number(p.stock_used) || 0 });
  }

  const nonePrize = prizes.find((p) => p.type === 'none');

  for (let i = 0; i < n; i++) {
    let hit: SimPrizeInput;
    const budgetRemaining = budgetEnabled ? effectiveCap - budgetUsed : Infinity;

    if (budgetEnabled) {
      const policy = budget.budget_policy;

      if (policy === 'deny' && budgetRemaining <= 0) {
        if (budgetExhaustedAt === null) budgetExhaustedAt = i;
        break;
      }

      const pickResult = budgetAwarePrizePick(prizes, {
        budgetRemaining,
        budgetCap: effectiveCap,
        policy,
      });

      if (!pickResult) {
        if (budgetExhaustedAt === null) budgetExhaustedAt = i;
        break;
      }
      hit = pickResult.prize;
    } else {
      try {
        hit = pickLotteryPrizeByConfiguredProbability(prizes);
      } catch {
        warnings.push('PROBABILITY_SUM_ZERO');
        break;
      }
    }

    // stock simulation
    if (hit.type !== 'none' && Number(hit.stock_enabled) === 1 && Number(hit.stock_total) >= 0) {
      const tracker = hitMap.get(hit.id)!;
      if (tracker.stockUsed >= Number(hit.stock_total)) {
        if (nonePrize) hit = nonePrize;
        else continue;
      } else {
        tracker.stockUsed++;
      }
    }

    const tracker = hitMap.get(hit.id)!;
    tracker.hits++;
    const cost = Number(hit.prize_cost) || 0;
    tracker.totalCost += cost;
    budgetUsed += cost;

    if (budgetEnabled && budgetUsed >= effectiveCap && budgetExhaustedAt === null) {
      budgetExhaustedAt = i + 1;
    }
  }

  // build results
  const prizeResults: SimPrizeResult[] = prizes.map((p) => {
    const t = hitMap.get(p.id)!;
    return {
      id: p.id,
      name: p.name,
      type: p.type,
      probability: p.probability,
      prize_cost: Number(p.prize_cost) || 0,
      hits: t.hits,
      hit_rate: n > 0 ? Math.round((t.hits / n) * 10000) / 100 : 0,
      total_cost: Math.round(t.totalCost * 100) / 100,
      avg_cost_per_draw: t.hits > 0 ? Math.round((t.totalCost / t.hits) * 100) / 100 : 0,
      stock_total: Number(p.stock_total),
      stock_used_before: Number(p.stock_used) || 0,
      stock_depleted_at_round: t.depletedAt,
    };
  });

  const totalCost = prizeResults.reduce((s, p) => s + p.total_cost, 0);
  const actualRounds = prizeResults.reduce((s, p) => s + p.hits, 0);
  const avgCostPerRound = actualRounds > 0 ? Math.round((totalCost / actualRounds) * 100) / 100 : 0;

  // estimated RTP: total_cost / (budget_cap * 1) as pct; or cost/rounds ratio
  const estimatedRtp = budgetCap > 0
    ? Math.round((totalCost / budgetCap) * 10000) / 100
    : 0;

  // warnings
  const highValuePrizes = prizeResults.filter((p) => p.type !== 'none' && p.hit_rate > p.probability * 1.5 && p.hits > 10);
  for (const hv of highValuePrizes) {
    warnings.push(`HIGH_FREQUENCY:${hv.name}(${hv.hit_rate}% vs configured ${hv.probability}%)`);
  }

  const stockDepletedPrizes = prizeResults.filter(
    (p) => p.stock_total >= 0 && p.type !== 'none' && hitMap.get(p.id)!.stockUsed >= p.stock_total,
  );
  for (const sd of stockDepletedPrizes) {
    warnings.push(`STOCK_DEPLETED:${sd.name}`);
  }

  if (budgetEnabled && totalCost > effectiveCap) {
    warnings.push(`BUDGET_EXCEEDED:cost=${totalCost.toFixed(2)},cap=${effectiveCap.toFixed(2)}`);
  }

  if (budgetEnabled && estimatedRtp > 100) {
    warnings.push(`RTP_OVER_100:${estimatedRtp.toFixed(1)}%`);
  }

  return {
    rounds: actualRounds,
    prizes: prizeResults,
    total_cost: Math.round(totalCost * 100) / 100,
    avg_cost_per_round: avgCostPerRound,
    estimated_rtp: estimatedRtp,
    budget_exhausted_at_round: budgetExhaustedAt,
    budget_remaining: budgetEnabled ? Math.round((effectiveCap - budgetUsed) * 100) / 100 : -1,
    warnings,
  };
}

/* ──────────── 便捷入口：用 DB 当前配置模拟 ──────────── */

export async function simulateWithCurrentConfig(
  tenantId: string | null,
  rounds = 10_000,
): Promise<SimulationResult & { snapshot: TenantSnapshot }> {
  const settings = await getLotterySettings(tenantId);
  const allPrizes = await listEnabledPrizes(tenantId);
  const prizes = allPrizes.slice(0, 8);

  if (prizes.length === 0) {
    throw new Error('NO_PRIZES_CONFIGURED');
  }

  const simPrizes: SimPrizeInput[] = prizes.map((p) => ({
    id: p.id,
    name: p.name,
    type: p.type,
    value: p.value,
    probability: Number(p.probability),
    prize_cost: Number(p.prize_cost) || 0,
    stock_enabled: Number(p.stock_enabled) || 0,
    stock_total: Number(p.stock_total),
    stock_used: Number(p.stock_used) || 0,
  }));

  const budgetCap = Number(settings?.daily_reward_budget ?? 0);
  const budgetUsed = Number(settings?.daily_reward_used ?? 0);
  const targetRtp = Number(settings?.target_rtp ?? 0);
  const rawPolicy = String(settings?.budget_policy ?? 'downgrade').toLowerCase();
  const policy: BudgetPolicy = rawPolicy === 'deny' || rawPolicy === 'fallback' ? rawPolicy : 'downgrade';

  const simBudget: SimBudgetInput = {
    daily_reward_budget: budgetCap,
    daily_reward_used: budgetUsed,
    target_rtp: targetRtp,
    budget_policy: policy,
  };

  const result = runSimulation(simPrizes, simBudget, rounds);

  const effectiveCap = budgetCap > 0 && targetRtp > 0
    ? Math.min(budgetCap, budgetCap * targetRtp / 100)
    : budgetCap;

  const snapshot: TenantSnapshot = {
    prizes: simPrizes.map((p) => ({
      id: p.id,
      name: p.name,
      type: p.type,
      probability: p.probability,
      prize_cost: p.prize_cost,
      stock_total: p.stock_total,
      stock_used: p.stock_used,
      stock_enabled: p.stock_enabled,
    })),
    daily_reward_budget: budgetCap,
    daily_reward_used: budgetUsed,
    budget_remaining: effectiveCap > 0 ? Math.max(0, effectiveCap - budgetUsed) : -1,
    target_rtp: targetRtp,
    budget_policy: policy,
    effective_budget_cap: effectiveCap,
  };

  return { ...result, snapshot };
}

/* ──────────── 保存前预览：用前端传入的候选配置模拟 ──────────── */

export interface PreviewInput {
  prizes: Array<{
    id?: string;
    name: string;
    type: string;
    value: number;
    probability: number;
    prize_cost?: number;
    stock_enabled?: number;
    stock_total?: number;
    stock_used?: number;
  }>;
  daily_reward_budget?: number;
  daily_reward_used?: number;
  target_rtp?: number;
  budget_policy?: string;
  rounds?: number;
}

export function simulatePreview(input: PreviewInput): SimulationResult {
  const simPrizes: SimPrizeInput[] = input.prizes.map((p, i) => ({
    id: p.id || `preview_${i}`,
    name: p.name,
    type: p.type,
    value: p.value,
    probability: Number(p.probability) || 0,
    prize_cost: Number(p.prize_cost) || 0,
    stock_enabled: Number(p.stock_enabled) || 0,
    stock_total: Number(p.stock_total ?? -1),
    stock_used: Number(p.stock_used) || 0,
  }));

  const rawPolicy = String(input.budget_policy ?? 'downgrade').toLowerCase();
  const policy: BudgetPolicy = rawPolicy === 'deny' || rawPolicy === 'fallback' ? rawPolicy : 'downgrade';

  const simBudget: SimBudgetInput = {
    daily_reward_budget: Math.max(0, Number(input.daily_reward_budget) || 0),
    daily_reward_used: Math.max(0, Number(input.daily_reward_used) || 0),
    target_rtp: Math.max(0, Math.min(100, Number(input.target_rtp) || 0)),
    budget_policy: policy,
  };

  const rounds = Math.min(100_000, Math.max(100, Number(input.rounds) || 10_000));
  return runSimulation(simPrizes, simBudget, rounds);
}

/* ──────────── 租户状态快照 ──────────── */

export interface TenantSnapshot {
  prizes: Array<{
    id: string;
    name: string;
    type: string;
    probability: number;
    prize_cost: number;
    stock_total: number;
    stock_used: number;
    stock_enabled: number;
  }>;
  daily_reward_budget: number;
  daily_reward_used: number;
  budget_remaining: number;
  target_rtp: number;
  budget_policy: BudgetPolicy;
  effective_budget_cap: number;
}

export async function getTenantSnapshot(tenantId: string | null): Promise<TenantSnapshot> {
  const settings = await getLotterySettings(tenantId);
  const allPrizes = await listEnabledPrizes(tenantId);
  const prizes = allPrizes.slice(0, 8);

  const budgetCap = Number(settings?.daily_reward_budget ?? 0);
  const budgetUsed = Number(settings?.daily_reward_used ?? 0);
  const targetRtp = Number(settings?.target_rtp ?? 0);
  const rawPolicy = String(settings?.budget_policy ?? 'downgrade').toLowerCase();
  const policy: BudgetPolicy = rawPolicy === 'deny' || rawPolicy === 'fallback' ? rawPolicy : 'downgrade';

  const effectiveCap = budgetCap > 0 && targetRtp > 0
    ? Math.min(budgetCap, budgetCap * targetRtp / 100)
    : budgetCap;

  return {
    prizes: prizes.map((p) => ({
      id: p.id,
      name: p.name,
      type: p.type,
      probability: Number(p.probability),
      prize_cost: Number(p.prize_cost) || 0,
      stock_total: Number(p.stock_total),
      stock_used: Number(p.stock_used) || 0,
      stock_enabled: Number(p.stock_enabled) || 0,
    })),
    daily_reward_budget: budgetCap,
    daily_reward_used: budgetUsed,
    budget_remaining: effectiveCap > 0 ? Math.max(0, effectiveCap - budgetUsed) : -1,
    target_rtp: targetRtp,
    budget_policy: policy,
    effective_budget_cap: effectiveCap,
  };
}
