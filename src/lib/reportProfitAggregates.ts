/**
 * 报表页订单利润汇总（NGN/GHS 与 USDT 分列），避免多处重复 filter + reduce。
 */

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export type ReportProfitOrderRow = {
  currency?: string | null;
  profit_ngn?: unknown;
  profit_usdt?: unknown;
};

/** 非 USDT 订单、利润满足 filter 时累加 profit_ngn */
export function sumProfitNgnWhere(
  orders: ReadonlyArray<ReportProfitOrderRow>,
  filter: (profit: number) => boolean
): number {
  return orders
    .filter((o) => o.currency !== "USDT" && filter(num(o.profit_ngn)))
    .reduce((sum, o) => sum + num(o.profit_ngn), 0);
}

/** USDT 订单、利润满足 filter 时累加 profit_usdt */
export function sumProfitUsdtWhere(
  orders: ReadonlyArray<ReportProfitOrderRow>,
  filter: (profit: number) => boolean
): number {
  return orders
    .filter((o) => o.currency === "USDT" && filter(num(o.profit_usdt)))
    .reduce((sum, o) => sum + num(o.profit_usdt), 0);
}

/** 赛地/奈拉侧：仅按币种过滤后累加 profit_ngn（不过滤正负） */
export function sumProfitNgnForNonUsdt(orders: ReadonlyArray<ReportProfitOrderRow>): number {
  return orders
    .filter((o) => o.currency !== "USDT")
    .reduce((sum, o) => sum + num(o.profit_ngn), 0);
}

/** USDT 侧：累加 profit_usdt */
export function sumProfitUsdtForUsdtOrders(orders: ReadonlyArray<ReportProfitOrderRow>): number {
  return orders
    .filter((o) => o.currency === "USDT")
    .reduce((sum, o) => sum + num(o.profit_usdt), 0);
}

/** 全局正利润折算（用于活动赠送占比分母） */
export function totalGlobalPositiveProfitNgnEquivalent(
  activeOrders: ReadonlyArray<ReportProfitOrderRow>,
  usdtRate: number
): { ngnGhsPositive: number; usdtPositive: number; total: number } {
  const ngnGhsPositive = sumProfitNgnWhere(activeOrders, (p) => p > 0);
  const usdtPositive = sumProfitUsdtWhere(activeOrders, (p) => p > 0);
  return {
    ngnGhsPositive,
    usdtPositive,
    total: ngnGhsPositive + usdtPositive * usdtRate,
  };
}

/** 已拆成 NGN/GHS 与 USDT 两组时的正/负利润汇总（员工维度） */
export function employeeProfitBuckets(
  ngnGhsOrders: ReadonlyArray<Pick<ReportProfitOrderRow, "profit_ngn">>,
  usdtOrders: ReadonlyArray<Pick<ReportProfitOrderRow, "profit_usdt">>
): {
  profitNgn: number;
  profitUsdt: number;
  errorProfitNgn: number;
  errorProfitUsdt: number;
} {
  const profitNgn = ngnGhsOrders
    .filter((o) => num(o.profit_ngn) > 0)
    .reduce((s, o) => s + num(o.profit_ngn), 0);
  const errorProfitNgn = ngnGhsOrders
    .filter((o) => num(o.profit_ngn) < 0)
    .reduce((s, o) => s + num(o.profit_ngn), 0);
  const profitUsdt = usdtOrders
    .filter((o) => num(o.profit_usdt) > 0)
    .reduce((s, o) => s + num(o.profit_usdt), 0);
  const errorProfitUsdt = usdtOrders
    .filter((o) => num(o.profit_usdt) < 0)
    .reduce((s, o) => s + num(o.profit_usdt), 0);
  return { profitNgn, profitUsdt, errorProfitNgn, errorProfitUsdt };
}
