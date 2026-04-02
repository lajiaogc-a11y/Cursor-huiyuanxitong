/**
 * 模拟抽奖滚动条文案（会员端转盘上方 / 跑马灯）。
 * 固定英文句子；奖品名对常见中文配置做映射，其余沿用后台配置的原文（可填英文）。
 */
const SIM_PRIZE_EN_EXACT: Record<string, string> = {
  感谢参与: "Thanks for playing",
  谢谢参与: "Thanks for playing",
};

export function formatSimulationPrizeNameForMemberFeed(prizeName: string): string {
  const raw = String(prizeName || "").trim();
  if (!raw) return "a prize";
  const exact = SIM_PRIZE_EN_EXACT[raw];
  if (exact) return exact;
  const mPoints = raw.match(/^积分(\d+)$/);
  if (mPoints) {
    const n = mPoints[1]!;
    return `${n} point${n === "1" ? "" : "s"}`;
  }
  const mPoints2 = raw.match(/^(\d+)\s*积分$/);
  if (mPoints2) {
    const n = mPoints2[1]!;
    return `${n} point${n === "1" ? "" : "s"}`;
  }
  return raw;
}

export function formatSpinSimulationCongratsLine(maskedDisplayName: string, prizeName: string): string {
  const n = String(maskedDisplayName || "").trim() || "User";
  const p = formatSimulationPrizeNameForMemberFeed(prizeName);
  return `Congratulations! ${n} won (${p}) 🎆🎆🎆!`;
}

/** 默认名次区间（实际以 lottery_simulation_settings.sim_feed_rank_* 为准） */
export const SPIN_SIM_FEED_RANK_MIN = 1;
export const SPIN_SIM_FEED_RANK_MAX = 8;
