import { useState, useCallback, type Dispatch, type SetStateAction } from "react";
import { formatBeijingTime } from "@/lib/beijingTime";
import { notify } from "@/lib/notifyHub";
import { getMemberByPhoneForMyTenant, isMemberInTenant } from "@/services/members/memberLookupService";
import { showSubmissionError } from "@/services/submissionErrorService";
import { getFeeSettings } from "@/services/system/systemSettingsService";
import { getMemberPointsSummary } from "@/services/points/pointsCalculationService";
import { getActivitySettings, getRewardAmountByPointsAndCurrency } from "@/services/activity/activitySettingsService";
import { generateEnglishCopyText } from "@/components/CopySettingsTab";
import { determineExchangeCurrency } from "@/services/finance/exchangeService";
import {
  appendExchangePaymentInfoEntry,
  formatExchangePaymentAmountForCopy,
} from "@/lib/exchangePaymentInfoLedger";
import type { CalculatorId, CalculatorFormData } from "@/hooks/useCalculatorStore";
import type { Member } from "@/hooks/useMembers";
import type { Order, OrderResult } from "@/hooks/useOrders";
import type { MemberPointsSummary } from "@/services/points/pointsCalculationService";

type FeeSettings = ReturnType<typeof getFeeSettings>;

export interface UseCalculatorSubmitParams {
  calcId: CalculatorId;
  formData: CalculatorFormData;
  clearForm: () => Promise<void>;
  setMemberLevelZhHint: (v: string | null) => void;
  nairaRate: number;
  cediRate: number;
  usdtRate: number;
  usdtFeeNum: number;
  feeSettings: FeeSettings;
  memberLookupTenantId: string | null;
  matchedMemberId: string | null;
  setMemberPointsSummary: Dispatch<SetStateAction<MemberPointsSummary | null>>;
  findMemberByPhone: (phone: string) => Member | undefined;
  addMember: (data: Partial<Member> & { phoneNumber: string }) => Promise<Member | null>;
  updateMemberByPhone: (phone: string, updates: Partial<Member>) => Promise<void>;
  addOrder: (
    orderData: Omit<Order, "id" | "dbId" | "status" | "order_points" | "points_status">,
    memberId?: string,
    employeeId?: string,
    memberCode?: string,
    options?: { meikaZone?: boolean },
  ) => Promise<OrderResult>;
  employee: { id?: string; real_name?: string; tenant_id?: string } | null;
  t: (zh: string, en: string) => string;
}

export function useCalculatorSubmit({
  calcId,
  formData,
  clearForm,
  setMemberLevelZhHint,
  nairaRate,
  cediRate,
  usdtRate,
  usdtFeeNum,
  feeSettings,
  memberLookupTenantId,
  matchedMemberId,
  setMemberPointsSummary,
  findMemberByPhone,
  addMember,
  updateMemberByPhone,
  addOrder,
  employee,
  t,
}: UseCalculatorSubmitParams) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [nairaWarningOpen, setNairaWarningOpen] = useState(false);
  const [nairaWarningText, setNairaWarningText] = useState("");

  const performAutoCopy = useCallback(
    async (
      phone: string,
      memberCode: string,
      currency: string,
      amount: number,
      earnedPoints: number,
      _bankCardSnapshot: string = "",
      preferredCurrencies: string[] = [],
    ) => {
      try {
        const [settingsModule, latestPointsSummary, activitySettingsData] = await Promise.all([
          import("@/components/CopySettingsTab").then((m) => m.refreshCopySettings()),
          getMemberPointsSummary(memberCode, phone, memberLookupTenantId, matchedMemberId),
          Promise.resolve(getActivitySettings()),
        ]);

        const settings = settingsModule;
        if (!settings.enabled) return;

        const activitySettings = activitySettingsData;

        let activityType: "activity1" | "activity2" | "none" = "none";
        if (activitySettings.activity1Enabled) {
          activityType = "activity1";
        } else if (activitySettings.activity2?.enabled) {
          activityType = "activity2";
        }

        const totalPoints = latestPointsSummary.remainingPoints;
        const referralPoints = latestPointsSummary.referralRewardPoints;
        const consumptionPoints = latestPointsSummary.consumptionReward;

        const redeemCurrency = determineExchangeCurrency(
          preferredCurrencies.length > 0 ? preferredCurrencies : [currency],
        );

        let redeemableAmount = "0 " + redeemCurrency;
        if (activityType === "activity2" && activitySettings.activity2) {
          const rate =
            redeemCurrency === "NGN"
              ? activitySettings.activity2.pointsToNGN
              : redeemCurrency === "GHS"
                ? activitySettings.activity2.pointsToGHS
                : activitySettings.activity2.pointsToUSDT || 0;
          redeemableAmount = `${(totalPoints * rate).toLocaleString()} ${redeemCurrency}`;
        } else {
          const rewardAmount = getRewardAmountByPointsAndCurrency(
            totalPoints,
            redeemCurrency as "NGN" | "GHS" | "USDT",
          );
          redeemableAmount = `${rewardAmount.toLocaleString()} ${redeemCurrency}`;
        }

        const rewardTiers = activitySettings.accumulatedRewardTiers.map((tier) => ({
          range: tier.maxPoints === null ? `≥${tier.minPoints}` : `${tier.minPoints}-${tier.maxPoints}`,
          ngn: tier.rewardAmountNGN || 0,
          ghs: tier.rewardAmountGHS || 0,
          usdt: tier.rewardAmountUSDT || 0,
        }));

        const copyText = generateEnglishCopyText({
          phoneNumber: phone,
          memberCode: memberCode || phone,
          earnedPoints,
          totalPoints: totalPoints,
          referralPoints,
          consumptionPoints,
          redeemableAmount,
          currency: redeemCurrency,
          rewardTiers,
          activityType,
          activity2Rates:
            activityType === "activity2"
              ? {
                  pointsToNGN: activitySettings.activity2?.pointsToNGN || 0,
                  pointsToGHS: activitySettings.activity2?.pointsToGHS || 0,
                  pointsToUSDT: activitySettings.activity2?.pointsToUSDT || 0,
                }
              : undefined,
        });

        if (copyText) {
          try {
            await navigator.clipboard.writeText(copyText);
          } catch (clipErr) {
            const ta = document.createElement("textarea");
            ta.value = copyText;
            ta.style.position = "fixed";
            ta.style.left = "-9999px";
            document.body.appendChild(ta);
            ta.select();
            document.execCommand("copy");
            document.body.removeChild(ta);
          }
          notify.info(t("已自动复制积分信息到剪贴板", "Points info copied to clipboard"));
          setMemberPointsSummary(latestPointsSummary);
        }
      } catch (error) {
        console.error("Auto copy failed:", error);
        const fallback = `Your Member ID: ${memberCode || phone}
Payment (this order): ${amount.toLocaleString()} ${currency}`;
        try {
          await navigator.clipboard.writeText(fallback);
        } catch {
          const ta = document.createElement("textarea");
          ta.value = fallback;
          ta.style.position = "fixed";
          ta.style.left = "-9999px";
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          document.body.removeChild(ta);
        }
        notify.info(t("已自动复制简要信息到剪贴板", "Brief info copied to clipboard"));
      }
    },
    [memberLookupTenantId, matchedMemberId, setMemberPointsSummary, t],
  );

  const performSubmitOrder = useCallback(async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      let detectedCurrency: "NGN" | "GHS" | "USDT" | null = null;
      let actualPaid = 0;
      let fee = 0;
      let paymentValue = 0;
      let foreignRate = 0;

      const cardRate = parseFloat(formData.cardRate) || 0;
      const cardWorthRMB = parseFloat(formData.cardValue) * cardRate;

      if (formData.payNaira) {
        detectedCurrency = "NGN";
        actualPaid = parseFloat(formData.payNaira);
        fee =
          actualPaid < feeSettings.nairaThreshold
            ? feeSettings.nairaFeeBelow
            : feeSettings.nairaFeeAbove;
        paymentValue = actualPaid / nairaRate + fee;
        foreignRate = nairaRate;
      } else if (formData.payCedi) {
        detectedCurrency = "GHS";
        actualPaid = parseFloat(formData.payCedi);
        fee =
          actualPaid < feeSettings.cediThreshold
            ? feeSettings.cediFeeBelow
            : feeSettings.cediFeeAbove;
        paymentValue = actualPaid * cediRate + fee;
        foreignRate = cediRate;
      } else if (formData.payUsdt) {
        detectedCurrency = "USDT";
        actualPaid = parseFloat(formData.payUsdt);
        fee = usdtFeeNum;
        paymentValue = actualPaid + fee;
        foreignRate = usdtRate;
      }

      let profit = 0;
      let profitRateVal = 0;

      if (detectedCurrency === "NGN") {
        profit = cardWorthRMB - actualPaid / nairaRate - fee;
        profitRateVal = cardWorthRMB > 0 ? (profit / cardWorthRMB) * 100 : 0;
      } else if (detectedCurrency === "GHS") {
        profit = cardWorthRMB - actualPaid * cediRate - fee;
        profitRateVal = cardWorthRMB > 0 ? (profit / cardWorthRMB) * 100 : 0;
      } else if (detectedCurrency === "USDT") {
        const cardWorthU = cardWorthRMB / usdtRate;
        profit = cardWorthU - actualPaid - fee;
        profitRateVal = cardWorthU > 0 ? (profit / cardWorthU) * 100 : 0;
      }

      let memberId: string | undefined;
      let finalMemberCode = formData.memberCode;

      try {
        let existingMember = memberLookupTenantId ? undefined : findMemberByPhone(formData.phoneNumber);
        if (!existingMember?.id) {
          const dbMember = await getMemberByPhoneForMyTenant(
            formData.phoneNumber,
            memberLookupTenantId,
          );
          if (dbMember && (!memberLookupTenantId || isMemberInTenant(dbMember, memberLookupTenantId))) {
            existingMember = {
              id: dbMember.id,
              phoneNumber: dbMember.phone_number,
              memberCode: dbMember.member_code,
              level: dbMember.member_level || "",
              commonCards: dbMember.common_cards || [],
              customerFeature: dbMember.customer_feature || "",
              bankCard: dbMember.bank_card || "",
              remark: dbMember.remark || "",
              preferredCurrency: dbMember.currency_preferences || [],
              sourceId: dbMember.source_id || "",
            } as Member;
          }
        }
        if (existingMember) {
          memberId = existingMember.id;
          finalMemberCode = existingMember.memberCode;
          const phoneForUpdate = existingMember.phoneNumber || formData.phoneNumber;

          await updateMemberByPhone(phoneForUpdate, {
            customerFeature: formData.customerFeature || existingMember.customerFeature,
            bankCard: formData.bankCard || existingMember.bankCard,
            remark: formData.remarkMember || existingMember.remark,
            preferredCurrency: detectedCurrency
              ? [
                  detectedCurrency,
                  ...(existingMember.preferredCurrency || []).filter((c) => c !== detectedCurrency),
                ]
              : existingMember.preferredCurrency,
            sourceId: formData.customerSource || existingMember.sourceId,
          });
        } else {
          const newMember = await addMember({
            phoneNumber: formData.phoneNumber,
            memberCode: finalMemberCode,
            customerFeature: formData.customerFeature,
            bankCard: formData.bankCard,
            remark: formData.remarkMember,
            preferredCurrency: detectedCurrency ? [detectedCurrency] : [],
            sourceId: formData.customerSource,
            recorderId: employee?.id,
          });
          if (newMember) memberId = newMember.id;
        }
      } catch (memberErr) {
        console.error("[RateCalculator] Member operation failed (order will proceed):", memberErr);
      }

      const orderData = {
        createdAt: formatBeijingTime(new Date()),
        cardType: formData.cardType,
        cardValue: parseFloat(formData.cardValue),
        cardRate: cardRate,
        foreignRate,
        cardWorth: cardWorthRMB,
        actualPaid,
        fee,
        paymentValue,
        paymentProvider: formData.paymentAgent,
        vendor: formData.cardMerchant,
        profit,
        profitRate: profitRateVal,
        phoneNumber: formData.phoneNumber,
        memberCode: finalMemberCode,
        demandCurrency: detectedCurrency as string,
        salesPerson: employee?.real_name || t("未知", "Unknown"),
        remark: formData.remarkOrder,
      };

      const orderResult = await addOrder(orderData, memberId, employee?.id, finalMemberCode, {
        meikaZone: calcId === "calc3",
      });

      if (!orderResult.order) {
        showSubmissionError(t("创建订单失败，请重试", "Failed to create order, please retry"));
        return;
      }

      notify.success(t("订单提交成功", "Order submitted successfully"));

      if (detectedCurrency) {
        appendExchangePaymentInfoEntry({
          tenantId: memberLookupTenantId ?? employee?.tenant_id,
          phone: formData.phoneNumber,
          bankCard: formData.bankCard || "",
          paymentDisplay: formatExchangePaymentAmountForCopy(actualPaid),
        });
      }

      const capturedPhone = formData.phoneNumber;
      const capturedMemberCode = finalMemberCode;
      const capturedBankCard = formData.bankCard || "";
      const prefSnapshot: string[] = [];
      if (formData.currencyPreferenceList.length > 0) {
        prefSnapshot.push(...formData.currencyPreferenceList);
      } else {
        const cm = findMemberByPhone(formData.phoneNumber);
        if (cm?.preferredCurrency?.length) prefSnapshot.push(...cm.preferredCurrency);
      }
      if (detectedCurrency && !prefSnapshot.includes(detectedCurrency)) {
        prefSnapshot.push(detectedCurrency);
      }

      const copyPromise = detectedCurrency
        ? performAutoCopy(
            capturedPhone,
            capturedMemberCode,
            detectedCurrency,
            actualPaid,
            orderResult.earnedPoints,
            capturedBankCard,
            prefSnapshot.length > 0 ? prefSnapshot : [detectedCurrency],
          )
        : Promise.resolve();

      await copyPromise;
      await clearForm();
      setMemberLevelZhHint(null);
    } catch (error) {
      console.error("[RateCalculator] performSubmitOrder failed:", error);
      showSubmissionError(t("提交订单失败，请重试", "Order submission failed, please retry"));
    } finally {
      setIsSubmitting(false);
    }
  }, [
    isSubmitting,
    formData,
    feeSettings,
    nairaRate,
    cediRate,
    usdtRate,
    usdtFeeNum,
    findMemberByPhone,
    memberLookupTenantId,
    updateMemberByPhone,
    addMember,
    employee,
    addOrder,
    calcId,
    t,
    clearForm,
    setMemberLevelZhHint,
    performAutoCopy,
  ]);

  const handleSubmitOrder = useCallback(async () => {
    if (isSubmitting) return;

    if (!formData.cardValue) {
      showSubmissionError(t("请填写卡片面值", "Please enter card value"));
      return;
    }
    if (!formData.cardRate) {
      showSubmissionError(t("请填写卡片汇率", "Please enter card rate"));
      return;
    }
    if (!formData.payNaira && !formData.payCedi && !formData.payUsdt) {
      showSubmissionError(t("请至少填写一个支付金额", "Please enter at least one payment"));
      return;
    }
    if (!formData.cardType) {
      showSubmissionError(t("请选择卡片类型", "Please select card type"));
      return;
    }
    if (!formData.cardMerchant) {
      showSubmissionError(t("请选择卡商名称", "Please select vendor"));
      return;
    }
    if (!formData.paymentAgent) {
      showSubmissionError(t("请选择代付商家", "Please select payment agent"));
      return;
    }
    if (!formData.phoneNumber) {
      showSubmissionError(t("请填写电话号码", "Please enter phone number"));
      return;
    }

    if (formData.payNaira) {
      const actualPaidNaira = parseFloat(formData.payNaira);
      const cardRateVal = parseFloat(formData.cardRate) || 0;
      const cardWorthRMB = parseFloat(formData.cardValue) * cardRateVal;
      if (actualPaidNaira > 0 && actualPaidNaira < cardWorthRMB * 50 && cardWorthRMB > 0) {
        const estimatedCorrectNaira = Math.round(cardWorthRMB * nairaRate * 0.95);
        const ratio = actualPaidNaira / cardWorthRMB;
        setNairaWarningText(
          t(
            `⚠️ 严重警告：实付金额异常！\n\n` +
              `您输入的实付奈拉为: ${actualPaidNaira.toLocaleString()}\n` +
              `此卡价值为: ${cardWorthRMB.toFixed(2)} RMB\n` +
              `比例: ${ratio.toFixed(1)}（正常应为 ${nairaRate} 左右）\n\n` +
              `🚨 这看起来像是人民币金额，不是奈拉金额！\n\n` +
              `提示：奈拉金额通常应该是人民币的 ${nairaRate} 倍左右\n` +
              `本单参考奈拉金额约: ${estimatedCorrectNaira.toLocaleString()}\n\n` +
              `若金额无误请点击「仍要提交」；否则请关闭并修改。`,
            `⚠️ Serious Warning: Abnormal payment amount!\n\n` +
              `You entered Naira amount: ${actualPaidNaira.toLocaleString()}\n` +
              `Card value: ${cardWorthRMB.toFixed(2)} RMB\n` +
              `Ratio: ${ratio.toFixed(1)} (should be around ${nairaRate})\n\n` +
              `🚨 This looks like RMB amount, not Naira!\n\n` +
              `Tip: Naira amount should typically be ${nairaRate}x of RMB.\n` +
              `Reference Naira for this order: ${estimatedCorrectNaira.toLocaleString()}\n\n` +
              `Click "Submit anyway" if the amount is correct; otherwise close and edit.`,
          ),
        );
        setNairaWarningOpen(true);
        return;
      }
    }

    await performSubmitOrder();
  }, [isSubmitting, formData, nairaRate, performSubmitOrder]);

  return {
    isSubmitting,
    handleSubmitOrder,
    performSubmitOrder,
    nairaWarningOpen,
    setNairaWarningOpen,
    nairaWarningText,
  };
}
