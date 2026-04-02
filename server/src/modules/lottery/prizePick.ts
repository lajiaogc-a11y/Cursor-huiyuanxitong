/**
 * 与会员真实抽奖 draw() 完全相同的加权随机（crypto.randomInt + 累计概率）
 */
import { randomInt } from 'node:crypto';

export type PrizeWithProbability = {
  probability: number;
};

/**
 * @param prizes 已按业务顺序排列（与 SQL ORDER BY sort_order ASC 一致），概率之和须为 100
 */
export function pickLotteryPrizeByConfiguredProbability<T extends PrizeWithProbability>(prizes: T[]): T {
  if (prizes.length === 0) {
    throw new Error('NO_PRIZES');
  }
  const total = prizes.reduce((sum, p) => sum + Number(p.probability), 0);
  if (Math.abs(total - 100) > 0.001) {
    throw new Error('PROBABILITY_SUM_NOT_100');
  }
  const rand = randomInt(0, 1_000_000) / 10_000;
  let cumulative = 0;
  for (const p of prizes) {
    cumulative += Number(p.probability);
    if (rand < cumulative) {
      return p;
    }
  }
  return prizes[prizes.length - 1];
}
