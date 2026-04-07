/**
 * 员工端积分兑币种：与汇率计算器 / 活动赠送列表展示一致；语言由调用方传入（员工界面 zh/en）。
 */
export type StaffPointsRedemptionRemarkLocale = 'zh' | 'en';

export function buildStaffPointsRedemptionRemark(
  points: number,
  giftAmount: number,
  giftCurrency: string,
  locale: StaffPointsRedemptionRemarkLocale = 'en',
): string {
  const pts = Math.round(Number(points));
  const n = Number(giftAmount);
  const cur = String(giftCurrency || '').trim() || '—';
  let amtStr: string;
  if (!Number.isFinite(n)) {
    amtStr = String(giftAmount);
  } else if (cur === 'USDT') {
    amtStr = n.toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 6 });
  } else {
    amtStr = n.toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }
  if (locale === 'zh') {
    return `积分兑换: ${pts}积分 → ${amtStr} ${cur}`;
  }
  return `Points redemption: ${pts} pts → ${amtStr} ${cur}`;
}
