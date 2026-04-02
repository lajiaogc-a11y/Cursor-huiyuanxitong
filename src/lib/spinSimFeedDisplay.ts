/**
 * 会员端模拟滚动文案：与 server spinSimulationFeedText 对齐，便于旧数据（中文模板）在展示时统一为英文。
 */
const SIM_PRIZE_EN_EXACT: Record<string, string> = {
  感谢参与: "Thanks for playing",
  谢谢参与: "Thanks for playing",
};

function formatSimulationPrizeNameForMemberFeed(prizeName: string): string {
  const raw = String(prizeName || "").trim();
  if (!raw) return "a prize";
  if (SIM_PRIZE_EN_EXACT[raw]) return SIM_PRIZE_EN_EXACT[raw]!;
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

function formatEnglishLine(maskedDisplayName: string, prizeName: string): string {
  const n = String(maskedDisplayName || "").trim() || "User";
  const p = formatSimulationPrizeNameForMemberFeed(prizeName);
  return `Congratulations! ${n} won (${p}) 🎆🎆🎆!`;
}

/** 将模拟滚动行规范为会员端展示的英文（兼容历史中文模板）。 */
export function normalizeSpinSimFeedLineForMember(text: string): string {
  const s = String(text || "").trim();
  if (!s) return s;
  if (/^Congratulations!\s/i.test(s)) return s;
  const legacy = /^恭喜用户(.+?)抽奖获得[（(](.+?)[）)]/;
  const m = s.match(legacy);
  if (m) {
    return formatEnglishLine(m[1]!.trim(), m[2]!.trim());
  }
  return s;
}
