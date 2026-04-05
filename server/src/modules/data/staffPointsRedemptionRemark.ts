/**
 * 员工端积分兑币种：与活动赠送/汇率计算器中的「积分兑换: X积分 → 金额 币种」备注提示一致。
 */
export function buildStaffPointsRedemptionRemark(
  points: number,
  giftAmount: number,
  giftCurrency: string
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
  return `Points redemption: ${pts} pts → ${amtStr} ${cur}`;
}
