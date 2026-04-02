/** 积分流水 activity type → 会员端展示文案（与中英 `t()` 一致） */
export function ledgerActivityTypeLabel(
  type: string | undefined,
  t: (zh: string, en: string) => string,
): string {
  const raw = String(type ?? "").trim().toLowerCase();
  if (raw === "consumption") return t("消费获赠", "Consumption");
  if (raw === "referral_1" || raw === "referral_2") return t("推荐奖励", "Referral");
  if (raw === "lottery") return t("抽奖", "Lottery");
  if (raw === "reversal") return t("冲正", "Recovery");
  if (raw === "redemption" || raw.startsWith("redeem")) return t("兑换扣减", "Redemption");
  if (raw === "adjustment") return t("人工调整", "Adjustment");
  if (!raw || raw === "unknown") return t("积分变动", "Points change");
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}
