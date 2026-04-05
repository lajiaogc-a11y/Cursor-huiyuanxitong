import type { PointsMallItem } from "@/services/memberPortal/memberPointsPortalService";

export function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function stockLabel(stock: number, t: (zh: string, en: string) => string): string {
  if (stock < 0) return t("库存：不限", "Stock: unlimited");
  return t(`库存：${stock}`, `Stock: ${stock}`);
}

/** Max redeemable qty for this member (per order, stock, daily, lifetime). */
export function redeemableMaxQty(p: PointsMallItem): number {
  const perOrder = Math.max(1, num(p.per_order_limit, 1));
  const stockCap = p.stock_remaining < 0 ? 999999 : num(p.stock_remaining, 0);
  const dailyLim = num(p.per_user_daily_limit, 0);
  const lifeLim = num(p.per_user_lifetime_limit, 0);
  const usedDay = num(p.used_today, 0);
  const usedLife = num(p.used_lifetime, 0);
  const dailyLeft = dailyLim > 0 ? Math.max(0, dailyLim - usedDay) : 999999;
  const lifeLeft = lifeLim > 0 ? Math.max(0, lifeLim - usedLife) : 999999;
  return Math.max(0, Math.min(perOrder, stockCap, dailyLeft, lifeLeft));
}
