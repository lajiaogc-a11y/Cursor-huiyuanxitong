/**
 * 与会员真实抽奖 draw() 完全相同的加权随机（crypto.randomInt + 累计概率）
 *
 * Phase 2 新增：budgetAwarePrizePick — 按剩余预算压权或过滤高成本奖品
 */
import { randomInt } from 'node:crypto';

export type PrizeWithProbability = {
  probability: number;
};

/**
 * @param prizes 已按业务顺序排列（与 SQL ORDER BY sort_order ASC 一致），概率之和须为 100。
 *   若传入的奖品池是经过截取的子集（如九宫格的前 8 项），概率之和可能不足 100，
 *   此时自动按比例归一化到 100 后再随机，保证抽奖行为正确。
 */
export function pickLotteryPrizeByConfiguredProbability<T extends PrizeWithProbability>(prizes: T[]): T {
  if (prizes.length === 0) {
    throw new Error('NO_PRIZES');
  }
  const total = prizes.reduce((sum, p) => sum + Number(p.probability), 0);
  if (total <= 0) {
    throw new Error('PROBABILITY_SUM_NOT_100');
  }
  const scale = 100 / total;
  const rand = randomInt(0, 1_000_000) / 10_000;
  let cumulative = 0;
  for (const p of prizes) {
    cumulative += Number(p.probability) * scale;
    if (rand < cumulative) {
      return p;
    }
  }
  return prizes[prizes.length - 1];
}

/* ──────────── Phase 2: 预算感知抽奖 ──────────── */

export type BudgetAwarePrize = PrizeWithProbability & {
  type: string;
  prize_cost?: number;
};

export type BudgetPolicy = 'deny' | 'downgrade' | 'fallback';

export interface BudgetContext {
  /** 今日剩余可用预算（budgetCap - budgetUsed），≤0 表示已耗尽 */
  budgetRemaining: number;
  /** 每日总预算（0=不限） */
  budgetCap: number;
  /** 预算策略 */
  policy: BudgetPolicy;
}

export interface BudgetPickResult<T> {
  prize: T;
  /** 本次抽奖是否受到预算压制（权重被调整或被降级） */
  budgetSuppressed: boolean;
  /** 预算相关的警告码（前端可按需展示） */
  budgetWarning?: 'BUDGET_EXCEEDED' | 'BUDGET_LOW';
}

/**
 * 预算感知的奖品抽取。在原有加权随机基础上，根据 budgetContext 做三种策略：
 *
 * - **deny**: budgetRemaining ≤ 0 → 直接返回 null（调用方应拒绝本次抽奖）
 * - **downgrade**: 对 prize_cost > budgetRemaining 的奖品做权重压制（概率 × 衰减系数），
 *   剩余概率回流给 'none' 和低成本奖品，保证总概率守恒。
 * - **fallback**: 只保留 prize_cost ≤ budgetRemaining 以及 type='none' 的奖品，
 *   其余奖品完全移除，剩余池子内按原始比例归一化抽取。
 *
 * 不改变原始 prizes 数组，返回副本。
 */
export function budgetAwarePrizePick<T extends BudgetAwarePrize>(
  prizes: T[],
  ctx: BudgetContext,
): BudgetPickResult<T> | null {
  if (prizes.length === 0) throw new Error('NO_PRIZES');

  const remaining = ctx.budgetRemaining;
  const isExhausted = remaining <= 0;
  const isLow = !isExhausted && ctx.budgetCap > 0 && remaining < ctx.budgetCap * 0.2;

  // ── deny: 预算耗尽直接拒绝 ──
  if (ctx.policy === 'deny' && isExhausted) {
    return null;
  }

  // ── fallback: 只保留 cost ≤ remaining 或 type='none' ──
  if (ctx.policy === 'fallback') {
    const eligible = prizes.filter(
      (p) => p.type === 'none' || Number(p.prize_cost ?? 0) <= remaining,
    );
    if (eligible.length === 0) {
      const none = prizes.find((p) => p.type === 'none');
      if (none) {
        return { prize: none, budgetSuppressed: true, budgetWarning: 'BUDGET_EXCEEDED' };
      }
      return null;
    }
    const picked = pickLotteryPrizeByConfiguredProbability(eligible);
    return {
      prize: picked,
      budgetSuppressed: eligible.length < prizes.length,
      budgetWarning: isExhausted ? 'BUDGET_EXCEEDED' : isLow ? 'BUDGET_LOW' : undefined,
    };
  }

  // ── downgrade: 压权 ──
  // 对超预算的奖品乘以一个衰减系数，把释放出的概率均摊给 none 和低成本奖品
  const adjusted: { prize: T; weight: number }[] = [];
  let suppressedWeight = 0;
  let safeWeight = 0;

  for (const p of prizes) {
    const cost = Number(p.prize_cost ?? 0);
    const origW = Number(p.probability);
    if (p.type === 'none' || cost <= 0) {
      adjusted.push({ prize: p, weight: origW });
      safeWeight += origW;
    } else if (cost > remaining) {
      // 超预算：强衰减（预算越紧衰减越狠，最低保留 5% 原概率）
      const ratio = remaining > 0 ? Math.max(0.05, remaining / cost) : 0;
      const newW = origW * ratio;
      adjusted.push({ prize: p, weight: newW });
      suppressedWeight += origW - newW;
    } else if (isLow && cost > remaining * 0.5) {
      // 预算紧张且成本较高：轻衰减
      const ratio = Math.max(0.3, remaining / (cost * 2));
      const newW = origW * ratio;
      adjusted.push({ prize: p, weight: newW });
      suppressedWeight += origW - newW;
    } else {
      adjusted.push({ prize: p, weight: origW });
      safeWeight += origW;
    }
  }

  // 把被压掉的概率回流给安全奖品（type='none' 和低成本）
  if (suppressedWeight > 0 && safeWeight > 0) {
    const boost = 1 + suppressedWeight / safeWeight;
    for (const item of adjusted) {
      const cost = Number(item.prize.prize_cost ?? 0);
      if (item.prize.type === 'none' || cost <= 0) {
        item.weight *= boost;
      } else if (cost <= remaining && !(isLow && cost > remaining * 0.5)) {
        item.weight *= boost;
      }
    }
  }

  // 用调整后的权重做加权随机
  const totalW = adjusted.reduce((s, a) => s + a.weight, 0);
  if (totalW <= 0) {
    const none = prizes.find((p) => p.type === 'none');
    if (none) return { prize: none, budgetSuppressed: true, budgetWarning: 'BUDGET_EXCEEDED' };
    return null;
  }

  const scale = 100 / totalW;
  const rand = randomInt(0, 1_000_000) / 10_000;
  let cumulative = 0;
  let picked: T = adjusted[adjusted.length - 1].prize;
  for (const a of adjusted) {
    cumulative += a.weight * scale;
    if (rand < cumulative) {
      picked = a.prize;
      break;
    }
  }

  return {
    prize: picked,
    budgetSuppressed: suppressedWeight > 0,
    budgetWarning: isExhausted ? 'BUDGET_EXCEEDED' : isLow ? 'BUDGET_LOW' : undefined,
  };
}
