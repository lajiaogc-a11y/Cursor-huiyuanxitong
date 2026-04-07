/**
 * 活动赠送「备注」展示：历史数据可能为服务端固定英文「Points redemption: …」，
 * 在中文界面应按当前语言显示（与写入时语言无关，按用户当前 UI 语言格式化）。
 */
const RE_EN =
  /^Points redemption:\s*(\d+)\s*pts\s*→\s*(.+?)\s+(\S+)\s*$/i;
const RE_ZH = /^积分兑换:\s*(\d+)积分\s*→\s*(.+?)\s+(\S+)\s*$/;

export function formatStaffPointsRedemptionRemarkForUi(
  remark: string | null | undefined,
  t: (zh: string, en: string) => string,
): string {
  const raw = String(remark ?? "").trim();
  if (!raw) return "";

  const en = raw.match(RE_EN);
  if (en) {
    const [, pts, amt, cur] = en;
    return t(`积分兑换: ${pts}积分 → ${amt} ${cur}`, `Points redemption: ${pts} pts → ${amt} ${cur}`);
  }
  const zh = raw.match(RE_ZH);
  if (zh) {
    const [, pts, amt, cur] = zh;
    return t(`积分兑换: ${pts}积分 → ${amt} ${cur}`, `Points redemption: ${pts} pts → ${amt} ${cur}`);
  }
  return raw;
}
