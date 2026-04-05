import type { LotteryPrize } from "@/services/memberPortal/memberLotteryPageService";

export const GRID_ORDER = [
  { row: 0, col: 0 },
  { row: 0, col: 1 },
  { row: 0, col: 2 },
  { row: 1, col: 2 },
  { row: 2, col: 2 },
  { row: 2, col: 1 },
  { row: 2, col: 0 },
  { row: 1, col: 0 },
];

export const SPIN_PRIZE_CELL_FRAME =
  "m-glass relative flex min-h-0 min-w-0 overflow-hidden rounded-2xl border border-pu-gold/20 bg-[hsl(var(--pu-m-surface)/0.45)] shadow-sm";

/** 积分类：后台配置的数值；非有限数字时返回 null */
export function spinPrizePointsValue(p: LotteryPrize): number | null {
  if (p.type !== "points") return null;
  const v = Number(p.value);
  return Number.isFinite(v) ? v : null;
}

export function spinWheelPrizeMainText(t: (z: string, e: string) => string, prize: LotteryPrize): string {
  const pts = spinPrizePointsValue(prize);
  if (pts != null) return t(`积分 ${pts}`, `Points ${pts}`);
  if (prize.type === "custom") return prize.name?.trim() || t("实物奖品", "Prize");
  return prize.name?.trim() || t("谢谢参与", "Thanks for playing");
}

export function prizeDisplayTier(p: LotteryPrize): "legendary" | "epic" | "rare" | "common" | "miss" {
  if (p.type === "none") return "miss";
  const raw = Number(p.probability);
  if (!Number.isFinite(raw)) return "common";
  if (raw <= 0) return "common";
  if (raw < 0.05) return "legendary";
  if (raw < 1) return "epic";
  if (raw < 15) return "rare";
  return "common";
}

export function prizeTierIconColor(tier: ReturnType<typeof prizeDisplayTier>): string {
  switch (tier) {
    case "legendary":
      return "text-pu-gold-soft";
    case "epic":
      return "text-pu-rose-soft";
    case "rare":
      return "text-pu-emerald-soft";
    default:
      return "text-[hsl(var(--pu-m-text-dim)/0.5)]";
  }
}

export function prizeTierBadgeBg(tier: ReturnType<typeof prizeDisplayTier>): string {
  switch (tier) {
    case "legendary":
      return "bg-pu-gold/20 ring-pu-gold/30";
    case "epic":
      return "bg-pu-rose/15 ring-pu-rose/25";
    case "rare":
      return "bg-pu-emerald/15 ring-pu-emerald/25";
    default:
      return "bg-pu-gold/10 ring-pu-gold/15";
  }
}

export function formatPrizeListDisplayProbability(p: LotteryPrize): string | null {
  const pick =
    p.display_probability != null && Number.isFinite(Number(p.display_probability))
      ? Number(p.display_probability)
      : Number(p.probability);
  if (!Number.isFinite(pick)) return null;
  return `${pick.toFixed(4)}%`;
}
