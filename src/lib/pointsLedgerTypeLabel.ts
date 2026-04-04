/**
 * 积分流水 transaction_type / type + reference_type → 中英展示（员工活动数据表、导出等共用）
 */
export function pointsLedgerTransactionLabel(
  transactionType: string | null | undefined,
  typeCol: string | null | undefined,
  referenceType: string | null | undefined,
  t: (zh: string, en: string) => string,
): string {
  const txn = String(transactionType || typeCol || "")
    .trim()
    .toLowerCase();
  const ty = String(typeCol || "")
    .trim()
    .toLowerCase();
  const refTy = String(referenceType || "")
    .trim()
    .toLowerCase();

  const isRedemptionType =
    txn === "redeem_activity_1" ||
    txn === "redeem_activity_2" ||
    txn === "redemption" ||
    txn === "redeem" ||
    txn === "mall_redemption" ||
    ty.startsWith("redeem_") ||
    refTy === "mall_redemption";

  if (txn === "freeze") {
    if (refTy === "mall_redemption_freeze") return t("商城兑换冻结", "Mall redemption freeze");
    if (refTy === "point_order_freeze") return t("兑换单冻结", "Point order freeze");
    return t("积分冻结", "Points frozen");
  }
  if (txn === "redeem_confirmed") return t("兑换确认", "Redemption confirmed");
  if (txn === "redeem_cancelled") return t("兑换取消退回", "Redemption cancelled");
  if (txn === "redeem_rejected") return t("兑换退回", "Redemption refund");
  if (txn === "consumption" || txn === "regular" || txn === "usdt") return t("消费积分", "Consumption");
  if (txn === "referral_1") return t("推荐奖励1", "Referral Reward 1");
  if (txn === "referral_2") return t("推荐奖励2", "Referral Reward 2");
  if (txn === "lottery") return t("抽奖积分", "Lottery points");
  if (txn === "mall_redemption" || refTy === "mall_redemption") return t("会员商城兑换", "Points mall redeem");
  if (isRedemptionType) return t("积分兑换", "Points Redemption");
  if (txn === "adjustment") return t("人工调整", "Adjustment");
  if (txn === "consumption_reversal") return t("消费积分冲正", "Consumption reversal");
  if (txn === "referral_1_reversal") return t("推荐积分1冲正", "Referral 1 reversal");
  if (txn === "referral_2_reversal") return t("推荐积分2冲正", "Referral 2 reversal");
  if (
    txn === "reversal" ||
    txn.endsWith("_reversal") ||
    txn === "order_reversal" ||
    txn === "referral_reversal"
  )
    return t("冲正", "Reversal");
  if (txn === "gift_delete_restore") return t("积分兑换回退", "Redemption restore");
  if (!txn || txn === "unknown") return t("未知", "Unknown");
  return t("其它类型", "Other");
}
