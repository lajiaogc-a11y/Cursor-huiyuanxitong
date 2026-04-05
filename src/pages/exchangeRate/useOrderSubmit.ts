import { useCallback, useRef, useState } from "react";
import { formatBeijingTime } from "@/lib/beijingTime";
import { notify } from "@/lib/notifyHub";
import { showSubmissionError } from "@/services/submissionErrorService";
import { calculatePaymentValue, calculateNormalOrderDerivedValues, calculateUsdtOrderDerivedValues } from "@/lib/orderCalculations";
import { getCopySettings, generateEnglishCopyText } from "@/components/CopySettingsTab";
import { getRewardAmountByPointsAndCurrency } from "@/services/activity/activitySettingsService";
import { determineExchangeCurrency } from "@/services/finance/exchangeService";
import { getActivitySettings } from "@/services/activity/activitySettingsService";
import { getMemberPointsSummary } from "@/services/points/pointsCalculationService";
import { getMemberByPhoneForMyTenant } from "@/services/members/memberLookupService";
import { generateMemberId } from "@/services/system/systemSettingsService";
import { saveExchangeRateFormData } from "@/services/finance/exchangeRateFormService";
import type { FeeSettings } from "@/services/system/systemSettingsService";
import { CURRENCIES } from "@/config/currencies";
import type { Member } from "@/hooks/useMembers";
import type { AnomalyWarning } from "@/services/orders/orderAnomalyDetection";
import type { Order, OrderResult, UsdtOrder } from "@/hooks/useOrders";

export type OrderSubmitProfitCalculation = {
  usdtRate: string;
  nairaRate: string;
  cediRate: string;
  usdtProfitU: string;
  nairaProfitRMB: string;
  cediProfitRMB: string;
};

export type UseOrderSubmitParams = {
  t: (zh: string, en: string) => string;
  blockReadonly: (actionText: string) => boolean;
  nairaRate: number | null;
  cediRate: number | null;
  usdtFee: string;
  cardValue: string;
  cardRate: string;
  payNaira: string;
  payCedi: string;
  payUsdt: string;
  profitCalculation: OrderSubmitProfitCalculation;
  safeUsdtRate: number;
  safeNairaRate: number;
  safeCediRate: number;
  phoneNumber: string;
  memberCode: string;
  currencyPreferenceList: string[];
  remarkMember: string;
  customerFeature: string;
  bankCard: string;
  customerSource: string;
  cardType: string;
  cardMerchant: string;
  paymentAgent: string;
  remarkOrder: string;
  effectiveMemberTenantId: string | null;
  usdtFeeNum: number;
  feeSettings: FeeSettings;
  findMemberByPhone: (phone: string) => Member | undefined;
  updateMemberByPhone: (phone: string, updates: Partial<Member>) => Promise<Member | null>;
  addMember: (memberData: Partial<Member> & { phoneNumber: string }) => Promise<Member | null>;
  addOrder: (
    orderData: Omit<Order, 'id' | 'dbId' | 'status' | 'order_points' | 'points_status'>,
    memberId?: string,
    employeeId?: string,
    memberCode?: string,
  ) => Promise<OrderResult>;
  addUsdtOrderDb: (
    orderData: Omit<UsdtOrder, 'id' | 'dbId' | 'status' | 'order_points' | 'points_status'>,
    memberId?: string,
    employeeId?: string,
  ) => Promise<OrderResult>;
  employee: { id?: string; real_name?: string } | null | undefined;
  setMemberCode: (v: string) => void;
  setCardValue: (v: string) => void;
  setCardRate: (v: string) => void;
  setPayNaira: (v: string) => void;
  setPayCedi: (v: string) => void;
  setPayUsdt: (v: string) => void;
  setCardType: (v: string) => void;
  setCardMerchant: (v: string) => void;
  setPaymentAgent: (v: string) => void;
  setPhoneNumber: (v: string) => void;
  setMemberLevel: (v: string) => void;
  setSelectedCommonCards: (v: string[]) => void;
  setCustomerFeature: (v: string) => void;
  setBankCard: (v: string) => void;
  setRemarkMember: (v: string) => void;
  setRemarkOrder: (v: string) => void;
  setCustomerSource: (v: string) => void;
  setCurrencyPreferenceList: (v: string[]) => void;
};

export function useOrderSubmit(p: UseOrderSubmitParams) {
  const isSubmittingOrderRef = useRef(false);
  const [anomalyWarnings, setAnomalyWarnings] = useState<AnomalyWarning[]>([]);
  const [showAnomalyDialog, setShowAnomalyDialog] = useState(false);

  /** preferredCurrencies：会员币种偏好（含本次支付币种），用于「可兑换金额」与兑换预览一致，勿用支付单列币种 */
  const performAutoCopy = useCallback(
    async (phone: string, code: string, earnedPoints: number, preferredCurrencies: string[]) => {
      const copySettings = getCopySettings();
      if (!copySettings.enabled) return;

      const activitySettings = getActivitySettings();

      let activityType: 'activity1' | 'activity2' | 'none' = 'none';
      let activity2Enabled = false;
      if (activitySettings.activity1Enabled) {
        activityType = 'activity1';
      } else if (activitySettings.activity2?.enabled) {
        activityType = 'activity2';
        activity2Enabled = true;
      }

      const pointsSummary = await getMemberPointsSummary(code, phone);

      const referralRewardPoints = pointsSummary.referralRewardPoints;
      const consumptionReward = pointsSummary.consumptionReward;
      const totalPoints = pointsSummary.remainingPoints;

      const redeemCurrency = determineExchangeCurrency(preferredCurrencies.length > 0 ? preferredCurrencies : ['NGN']);

      let rewardAmount = 0;
      if (activity2Enabled) {
        switch (redeemCurrency) {
          case 'NGN':
            rewardAmount = totalPoints * (activitySettings.activity2?.pointsToNGN || 0);
            break;
          case 'GHS':
            rewardAmount = totalPoints * (activitySettings.activity2?.pointsToGHS || 0);
            break;
          case 'USDT':
            rewardAmount = totalPoints * (activitySettings.activity2?.pointsToUSDT || 0);
            break;
        }
      } else {
        rewardAmount = getRewardAmountByPointsAndCurrency(totalPoints, redeemCurrency as 'NGN' | 'GHS' | 'USDT');
      }

      const rewardTiers = activity2Enabled
        ? []
        : activitySettings.accumulatedRewardTiers.map((tier) => ({
            range: tier.maxPoints === null ? `≥${tier.minPoints}` : `${tier.minPoints}-${tier.maxPoints}`,
            ngn: tier.rewardAmountNGN || 0,
            ghs: tier.rewardAmountGHS || 0,
            usdt: tier.rewardAmountUSDT || 0,
          }));

      const copyText = generateEnglishCopyText({
        phoneNumber: phone,
        memberCode: code,
        earnedPoints,
        totalPoints,
        referralPoints: referralRewardPoints,
        consumptionPoints: consumptionReward,
        redeemableAmount: `${rewardAmount.toLocaleString()} ${redeemCurrency}`,
        currency: redeemCurrency,
        rewardTiers,
        activityType,
        activity2Rates: activity2Enabled ? activitySettings.activity2 : undefined,
      });

      if (!copyText) return;

      const copyLabel =
        activityType === 'activity2'
          ? p.t('活动2', 'Activity 2')
          : activityType === 'activity1'
            ? p.t('活动1', 'Activity 1')
            : p.t('积分说明', 'Points summary');
      navigator.clipboard.writeText(copyText).then(() => {
        notify.info(p.t(`积分信息已复制到剪贴板 (${copyLabel})`, `Points info copied to clipboard (${copyLabel})`));
      }).catch(() => {
        console.error("复制失败");
      });
    },
    [p],
  );

  const executeOrderSubmit = useCallback(async () => {
    if (p.blockReadonly(p.t("提交订单", "submit order"))) return;
    isSubmittingOrderRef.current = true;

    try {
      const detectedCurrency: 'NGN' | 'GHS' | 'USDT' | null = p.payNaira ? 'NGN' : p.payCedi ? 'GHS' : p.payUsdt ? 'USDT' : null;

      let dbMember = await getMemberByPhoneForMyTenant(p.phoneNumber, p.effectiveMemberTenantId);

      if (!dbMember) {
        const cachedMember = p.findMemberByPhone(p.phoneNumber);
        if (cachedMember) {
          console.warn('[executeOrderSubmit] Server lookup returned null but member exists in cache, using cache fallback');
          dbMember = {
            id: cachedMember.id,
            phone_number: cachedMember.phoneNumber,
            member_code: cachedMember.memberCode,
            member_level: cachedMember.level,
            common_cards: cachedMember.commonCards,
            currency_preferences: cachedMember.preferredCurrency,
            bank_card: cachedMember.bankCard || null,
            customer_feature: cachedMember.customerFeature,
            source_id: cachedMember.sourceId || null,
            source_name: null,
            remark: cachedMember.remark,
            recorder_name: null,
            referrer_display: null,
            created_at: cachedMember.createdAt,
            remaining_points: null,
            order_count: 0,
          };
        }
      }

      const phoneForMemberUpdate = dbMember?.phone_number?.trim() || p.phoneNumber;

      let memberId: string | undefined;
      let finalMemberCode = p.memberCode;
      let memberPrefsSnapshot: string[] = [];

      if (dbMember) {
        const existingPrefs: string[] = dbMember.currency_preferences || [];
        let mergedPrefs: string[];
        if (p.currencyPreferenceList.length > 0) {
          mergedPrefs = [...p.currencyPreferenceList];
          if (detectedCurrency && !mergedPrefs.includes(detectedCurrency)) {
            mergedPrefs.push(detectedCurrency);
          }
        } else {
          mergedPrefs = [...existingPrefs];
          if (detectedCurrency && !existingPrefs.includes(detectedCurrency)) {
            mergedPrefs.push(detectedCurrency);
          }
        }
        memberPrefsSnapshot = mergedPrefs;

        const memberUpdates: Record<string, unknown> = {
          preferredCurrency: mergedPrefs,
          remark: p.remarkMember,
          customerFeature: p.customerFeature,
          bankCard: p.bankCard,
          sourceId: p.customerSource ? p.customerSource : null,
        };
        const trimmedCode = (p.memberCode || "").trim();
        if (trimmedCode && trimmedCode !== String(dbMember.member_code || "").trim()) {
          memberUpdates.memberCode = trimmedCode;
        }

        const updated = await p.updateMemberByPhone(phoneForMemberUpdate, memberUpdates as Partial<Member>);
        if (!updated) {
          notify.error(
            p.t("会员信息保存失败，请检查会员编号是否与其他会员重复", "Failed to save member — check member code or network"),
          );
          return;
        }
        memberId = updated.id;
        finalMemberCode = updated.memberCode;
      } else {
        const newMemberCode = p.memberCode || generateMemberId();
        const newMemberPrefs: string[] =
          p.currencyPreferenceList.length > 0 ? [...p.currencyPreferenceList] : [];
        if (detectedCurrency && !newMemberPrefs.includes(detectedCurrency)) {
          newMemberPrefs.push(detectedCurrency);
        }
        memberPrefsSnapshot = newMemberPrefs;

        const newMember = await p.addMember({
          phoneNumber: p.phoneNumber,
          memberCode: newMemberCode,
          preferredCurrency: newMemberPrefs,
          remark: p.remarkMember,
          customerFeature: p.customerFeature,
          bankCard: p.bankCard,
          sourceId: p.customerSource || undefined,
          recorder: p.employee?.real_name || '',
          recorderId: p.employee?.id,
        });

        if (newMember) {
          memberId = newMember.id;
          finalMemberCode = newMember.memberCode;
          p.setMemberCode(finalMemberCode);
        } else {
          notify.error(p.t("会员创建失败，订单未提交", "Member creation failed, order not submitted"));
          return;
        }
      }

      if (p.payUsdt) {
        // H2+M2 fix: use unified calculation to avoid raw division & string precision loss
        const actualPaidUsdt = parseFloat(p.payUsdt);
        const derived = calculateUsdtOrderDerivedValues({
          cardValue: parseFloat(p.cardValue),
          cardRate: parseFloat(p.cardRate),
          usdtRate: p.safeUsdtRate,
          actualPaidUsdt,
          feeUsdt: p.usdtFeeNum,
        });

        const usdtOrderData = {
          createdAt: formatBeijingTime(new Date()),
          cardType: p.cardType,
          cardValue: parseFloat(p.cardValue),
          cardRate: parseFloat(p.cardRate),
          cardWorth: derived.cardWorth,
          usdtRate: p.safeUsdtRate,
          totalValueUsdt: derived.totalValueUsdt,
          actualPaidUsdt,
          feeUsdt: p.usdtFeeNum,
          paymentValue: derived.paymentValue,
          profit: derived.profit,
          profitRate: derived.profitRate,
          vendor: p.cardMerchant,
          paymentProvider: p.paymentAgent,
          phoneNumber: p.phoneNumber,
          memberCode: finalMemberCode,
          demandCurrency: "USDT",
          salesPerson: p.employee?.real_name || p.t('未知', 'Unknown'),
          remark: p.remarkOrder,
        };

        const usdtResult = await p.addUsdtOrderDb(usdtOrderData, memberId, p.employee?.id);

        notify.success(p.t("USDT订单提交成功", "USDT order submitted"));

        if (usdtResult.order) {
          await performAutoCopy(p.phoneNumber, finalMemberCode, usdtResult.earnedPoints, memberPrefsSnapshot);
        }
      } else {
        let paymentCurrency = "";
        let actualPaid = 0;
        let foreignRate = 0;
        let fee = 0;

        if (p.payNaira) {
          paymentCurrency = CURRENCIES.NGN.name;
          actualPaid = parseFloat(p.payNaira);
          foreignRate = p.safeNairaRate;
          fee = actualPaid < p.feeSettings.nairaThreshold ? p.feeSettings.nairaFeeBelow : p.feeSettings.nairaFeeAbove;
        } else if (p.payCedi) {
          paymentCurrency = CURRENCIES.GHS.name;
          actualPaid = parseFloat(p.payCedi);
          foreignRate = p.safeCediRate;
          fee = actualPaid < p.feeSettings.cediThreshold ? p.feeSettings.cediFeeBelow : p.feeSettings.cediFeeAbove;
        }

        // H2+M2 fix: use unified safe calculation instead of raw division / string intermediates
        const derived = calculateNormalOrderDerivedValues({
          cardValue: parseFloat(p.cardValue),
          cardRate: parseFloat(p.cardRate),
          actualPaid,
          foreignRate,
          fee,
          currency: paymentCurrency,
        });

        const orderData = {
          createdAt: formatBeijingTime(new Date()),
          cardType: p.cardType,
          cardValue: parseFloat(p.cardValue),
          cardRate: parseFloat(p.cardRate),
          foreignRate,
          cardWorth: derived.cardWorth,
          actualPaid,
          fee,
          paymentValue: derived.paymentValue,
          paymentProvider: p.paymentAgent,
          vendor: p.cardMerchant,
          profit: derived.profit,
          profitRate: derived.profitRate,
          phoneNumber: p.phoneNumber,
          memberCode: finalMemberCode,
          demandCurrency: paymentCurrency,
          salesPerson: p.employee?.real_name || p.t('未知', 'Unknown'),
          remark: p.remarkOrder,
        };

        const orderResult = await p.addOrder(orderData, memberId, p.employee?.id, finalMemberCode);

        notify.success(p.t("订单提交成功", "Order submitted"));

        if (orderResult.order) {
          await performAutoCopy(p.phoneNumber, finalMemberCode, orderResult.earnedPoints, memberPrefsSnapshot);
        }
      }

      p.setCardValue("");
      p.setCardRate("");
      p.setPayNaira("");
      p.setPayCedi("");
      p.setPayUsdt("");
      p.setCardType("");
      p.setCardMerchant("");
      p.setPaymentAgent("");
      p.setPhoneNumber("");
      p.setMemberCode("");
      p.setMemberLevel("");
      p.setSelectedCommonCards([]);
      p.setCustomerFeature("");
      p.setBankCard("");
      p.setRemarkMember("");
      p.setRemarkOrder("");
      p.setCustomerSource("");
      p.setCurrencyPreferenceList([]);

      saveExchangeRateFormData({
        cardType: "",
        cardMerchant: "",
        paymentAgent: "",
        phoneNumber: "",
        memberCode: "",
        memberLevel: "",
        selectedCommonCards: [],
        customerFeature: "",
        remarkOrder: "",
        remarkMember: "",
        bankCard: "",
        cardValue: "",
        cardRate: "",
        payNaira: "",
        payCedi: "",
        payUsdt: "",
        nairaRate: p.nairaRate ?? 0,
        cediRate: p.cediRate ?? 0,
        currencyPreferenceList: [],
        customerSource: "",
      });
    } catch (err: unknown) {
      console.error('[executeOrderSubmit] Unhandled error:', err);
      const message = err && typeof err === 'object' && 'message' in err ? String((err as { message?: unknown }).message) : '未知错误';
      notify.error(p.t(
        `提交订单失败: ${message}`,
        `Order submission failed: ${message}`
      ));
    } finally {
      isSubmittingOrderRef.current = false;
    }
  }, [p, performAutoCopy]);

  const handleSubmitOrder = useCallback(async () => {
    if (p.blockReadonly(p.t("提交订单", "submit order"))) return;
    if (isSubmittingOrderRef.current) return;

    // M1 fix: only validate the rate for the currency being used, not all rates
    if (p.payNaira && (!p.nairaRate || p.nairaRate <= 0)) {
      showSubmissionError(p.t("请填写奈拉汇率", "Please enter Naira rate"));
      return;
    }
    if (p.payCedi && (!p.cediRate || p.cediRate <= 0)) {
      showSubmissionError(p.t("请填写赛地汇率", "Please enter Cedi rate"));
      return;
    }
    if (p.payUsdt && !p.usdtFee && p.usdtFee !== "0") {
      showSubmissionError(p.t("请填写USDT手续费", "Please enter USDT fee"));
      return;
    }
    if (!p.cardValue) {
      showSubmissionError(p.t("请填写卡片面值", "Please enter card value"));
      return;
    }
    if (!p.cardRate) {
      showSubmissionError(p.t("请填写卡片汇率", "Please enter card rate"));
      return;
    }
    if (!p.payNaira && !p.payCedi && !p.payUsdt) {
      showSubmissionError(p.t("请至少填写一个支付金额（支付奈拉、支付赛地或支付USDT）", "Please enter at least one payment amount (Naira, Cedi, or USDT)"));
      return;
    }
    if (!p.cardType) {
      showSubmissionError("请选择卡片类型");
      return;
    }
    if (!p.cardMerchant) {
      showSubmissionError("请选择卡商名称");
      return;
    }
    if (!p.paymentAgent) {
      showSubmissionError("请选择代付商家");
      return;
    }
    if (!p.phoneNumber) {
      showSubmissionError("请填写电话号码");
      return;
    }

    try {
      const { detectOrderAnomalies } = await import('@/services/orders/orderAnomalyDetection');
      const cardWorthVal = parseFloat(p.cardValue) * parseFloat(p.cardRate);
      let profitRateVal = 0;
      let foreignRateVal = 0;
      let currency = 'NGN';

      if (p.payUsdt) {
        profitRateVal = parseFloat(p.profitCalculation.usdtRate) || 0;
        foreignRateVal = p.safeUsdtRate;
        currency = 'USDT';
      } else if (p.payNaira) {
        profitRateVal = parseFloat(p.profitCalculation.nairaRate) || 0;
        foreignRateVal = p.safeNairaRate;
        currency = 'NGN';
      } else if (p.payCedi) {
        profitRateVal = parseFloat(p.profitCalculation.cediRate) || 0;
        foreignRateVal = p.safeCediRate;
        currency = 'GHS';
      }

      const warnings = await detectOrderAnomalies({
        profitRate: profitRateVal,
        foreignRate: foreignRateVal,
        cardWorth: cardWorthVal,
        currency,
      });

      if (warnings.length > 0) {
        setAnomalyWarnings(warnings);
        setShowAnomalyDialog(true);
        return;
      }
    } catch (err) {
      console.warn('Anomaly detection failed, proceeding:', err);
    }

    await executeOrderSubmit();
  }, [p, executeOrderSubmit]);

  const handleConfirmAnomalySubmit = useCallback(async () => {
    if (p.blockReadonly(p.t("提交订单", "submit order"))) return;
    setShowAnomalyDialog(false);
    setAnomalyWarnings([]);
    await executeOrderSubmit();
  }, [p, executeOrderSubmit]);

  return {
    handleSubmitOrder,
    handleConfirmAnomalySubmit,
    anomalyWarnings,
    showAnomalyDialog,
    setShowAnomalyDialog,
  };
}
