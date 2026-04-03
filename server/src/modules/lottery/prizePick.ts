/**
 * 与会员真实抽奖 draw() 完全相同的加权随机（crypto.randomInt + 累计概率）
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
