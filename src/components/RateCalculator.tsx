// 汇率计算器组件 - 优化布局设计
// 核心策略：面值汇率放大 + 利润分析对齐 + 备注直接显示
import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { Card, CardContent } from "@/components/ui/card";
import { trackRender } from "@/lib/performanceUtils";
import { Input } from "@/components/ui/input";
import { safeNumber, safeDivide, safeMultiply, safeToFixed } from "@/lib/safeCalc";
import { formatBeijingTime } from "@/lib/beijingTime";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { DrawerDetail } from "@/components/shell/DrawerDetail";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Send, Lock, Copy, ArrowDown, HelpCircle } from "lucide-react";
import { notify } from "@/lib/notifyHub";
import { getMemberByPhoneForMyTenant } from "@/services/members/memberLookupService";
import { showSubmissionError } from "@/services/submissionErrorService";
import { CURRENCIES } from "@/config/currencies";
import { useCalculatorForm, CalculatorId } from "@/hooks/useCalculatorStore";
import { useOrders, useUsdtOrders } from "@/hooks/useOrders";
import { useMembers } from "@/hooks/useMembers";

import {
  generateMemberId,
  getFeeSettings,
  getUsdtFee,
} from "@/stores/systemSettings";
import { getMemberCurrentPoints } from "@/stores/pointsAccountStore";
import { getActivitySettings, getRewardAmountByPointsAndCurrency } from "@/stores/activitySettingsStore";
import { useLanguage } from "@/contexts/LanguageContext";
import { displayMemberLevelLabel } from "@/lib/memberLevelDisplay";
import { getPointsLedger } from "@/stores/pointsLedgerStore";
import { getPointsSettings } from "@/stores/pointsSettingsStore";
import { getMemberLastResetTime } from "@/stores/pointsAccountStore";
import { getCopySettings, generateEnglishCopyText } from "@/components/CopySettingsTab";
import { useAuth } from "@/contexts/AuthContext";
import { getReferralRelations } from "@/stores/referralStore";
import { getExchangePreview, getExchangeDisabledMessage, determineExchangeCurrency } from "@/services/finance/exchangeService";
import { getExchangeRateFormData } from "@/stores/exchangeRateFormStore";
import { CurrencyCode } from "@/config/currencies";
import { patchActivityGiftRemark } from "@/services/staff/activityGiftTableService";
import { redeemPointsAndRecordRpc } from "@/services/members/memberPointsRedeemRpcService";
import { getMemberPointsSummary, MemberPointsSummary } from "@/services/points/pointsCalculationService";
import { notifyDataMutation } from "@/services/system/dataRefreshManager";
import { logOperation } from "@/stores/auditLogStore";
import {
  appendExchangePaymentInfoEntry,
  formatExchangePaymentAmountForCopy,
} from "@/lib/exchangePaymentInfoLedger";

interface RateCalculatorProps {
  calcId: CalculatorId;
  // 全局共享状态
  usdtRate: number;
  usdtBid?: number;
  usdtAsk?: number;
  nairaRate: number;
  cediRate: number;
  btcPrice: number | null;
  usdtFee: string;
  // 商家数据
  cardsList: { id: string; name: string; cardVendors?: string[] }[];
  vendorsList: { id: string; name: string; paymentProviders?: string[] }[];
  paymentProvidersList: { id: string; name: string }[];
  customerSources: { id: string; name: string }[];
  // 快捷按钮
  quickAmounts: string[];
  quickRates: string[];
  profitRates: string[];
  // 编辑回调
  onQuickAmountChange: (index: number, value: string) => void;
  onQuickRateChange: (index: number, value: string) => void;
  onProfitRateChange: (index: number, value: string) => void;
  // payUsdt变化回调（通知父组件）
  onPayUsdtChange?: (value: string) => void;
  /** 与 customer-detail / 会员库查询一致的业务租户（含平台进入租户视图） */
  memberLookupTenantId?: string | null;
}

export default function RateCalculator({
  calcId,
  usdtRate: usdtRateProp,
  usdtBid = 0,
  usdtAsk = 0,
  nairaRate,
  cediRate,
  btcPrice,
  usdtFee,
  cardsList,
  vendorsList,
  paymentProvidersList,
  customerSources,
  quickAmounts,
  quickRates,
  profitRates,
  onQuickAmountChange,
  onQuickRateChange,
  onProfitRateChange,
  onPayUsdtChange,
  memberLookupTenantId = null,
}: RateCalculatorProps) {
  trackRender('RateCalculator');
  const { t, language } = useLanguage();
  const { employee } = useAuth();
  const isMobile = useIsMobile();
  
  // 使用独立的表单状态
  const { formData, updateField, updateFields, clearForm } = useCalculatorForm(calcId);
  const [memberLevelZhHint, setMemberLevelZhHint] = useState<string | null>(null);

  // 已填支付 USDT → 用较低价 usdtBid（卖出 USDT/付 USDT 估值）；未填 → 用较高价 usdtAsk（买入侧）
  const usdtRate = useMemo(() => {
    const payUsdtVal = parseFloat(formData.payUsdt) || 0;
    if (payUsdtVal > 0) {
      return usdtBid > 0 ? usdtBid : usdtRateProp;
    }
    return usdtAsk > 0 ? usdtAsk : usdtRateProp;
  }, [formData.payUsdt, usdtAsk, usdtBid, usdtRateProp]);

  // Notify parent when payUsdt changes
  useEffect(() => {
    onPayUsdtChange?.(formData.payUsdt);
  }, [formData.payUsdt, onPayUsdtChange]);

  // 数据库hooks
  const { orders, addOrder } = useOrders();
  const { orders: usdtOrdersList } = useUsdtOrders();
  const { members, addMember, updateMemberByPhone, findMemberByPhone } = useMembers();
  
  // 本地UI状态
  const [editingAmountIndex, setEditingAmountIndex] = useState<number | null>(null);
  const [editingRateIndex, setEditingRateIndex] = useState<number | null>(null);
  const [quickEditDialog, setQuickEditDialog] = useState<{
    open: boolean;
    type: 'amount' | 'rate';
    index: number;
    value: string;
  }>({ open: false, type: 'amount', index: 0, value: '' });
  const [bankCardError, setBankCardError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [nairaWarningOpen, setNairaWarningOpen] = useState(false);
  const [nairaWarningText, setNairaWarningText] = useState("");

  // 积分兑换对话框
  const [isRedeemDialogOpen, setIsRedeemDialogOpen] = useState(false);
  const [isRedeemConfirmOpen, setIsRedeemConfirmOpen] = useState(false);
  const [redeemPaymentProvider, setRedeemPaymentProvider] = useState("");
  const [redeemRemark, setRedeemRemark] = useState("");
  /** 积分兑换写活动赠送用汇率；可与页面同步，也可手改 */
  const [redeemGiftRateInput, setRedeemGiftRateInput] = useState("");
  const [redeemPreviewData, setRedeemPreviewData] = useState<any>(null);

  // 会员积分摘要（从数据库实时获取，与活动数据统一）
  const [memberPointsSummary, setMemberPointsSummary] = useState<MemberPointsSummary | null>(null);
  const [isLoadingPoints, setIsLoadingPoints] = useState(false);

  // 当电话号码或会员编号变化时，从数据库获取积分摘要
  useEffect(() => {
    if (!formData.phoneNumber || !formData.memberCode) {
      setMemberPointsSummary(null);
      return;
    }
    
    let isMounted = true;
    const timeoutId = setTimeout(async () => {
      if (!isMounted) return;
      setIsLoadingPoints(true);
      const POINTS_FETCH_MS = 25000;
      try {
        const summary = await Promise.race([
          getMemberPointsSummary(formData.memberCode, formData.phoneNumber, memberLookupTenantId),
          new Promise<null>((_, reject) =>
            setTimeout(() => reject(new Error('POINTS_SUMMARY_TIMEOUT')), POINTS_FETCH_MS),
          ),
        ]);
        if (isMounted) setMemberPointsSummary(summary);
      } catch (error) {
        console.error('Failed to fetch member points summary:', error);
        if (isMounted) setMemberPointsSummary(null);
      } finally {
        if (isMounted) setIsLoadingPoints(false);
      }
    }, 100);
    
    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
    };
  }, [formData.phoneNumber, formData.memberCode, memberLookupTenantId]);

  // 监听积分变化事件
  useEffect(() => {
    const handlePointsUpdated = () => {
      if (formData.phoneNumber && formData.memberCode) {
        getMemberPointsSummary(formData.memberCode, formData.phoneNumber, memberLookupTenantId)
          .then(setMemberPointsSummary)
          .catch(console.error);
      }
    };
    const onDataRefresh = (event: Event) => {
      const detail = (event as CustomEvent<{ table?: string }>).detail;
      const table = detail?.table;
      if (
        table === 'points_ledger' ||
        table === 'points_accounts' ||
        table === 'activity_gifts' ||
        table === 'member_activity'
      ) {
        handlePointsUpdated();
      }
    };
    
    window.addEventListener('activity-gifts-updated', handlePointsUpdated);
    window.addEventListener('points-updated', handlePointsUpdated);
    window.addEventListener('data-refresh', onDataRefresh as EventListener);
    return () => {
      window.removeEventListener('activity-gifts-updated', handlePointsUpdated);
      window.removeEventListener('points-updated', handlePointsUpdated);
      window.removeEventListener('data-refresh', onDataRefresh as EventListener);
    };
  }, [formData.phoneNumber, formData.memberCode, memberLookupTenantId]);

  const feeSettings = getFeeSettings();
  const usdtFeeNum = parseFloat(usdtFee) || 0;

  /** 与 profitRates 列数一致；minmax 下限避免父级 flex/min-w-0 把列压成一条缝 */
  const profitGridColCount = profitRates.length + 1;
  const profitGridStyle = {
    gridTemplateColumns: `repeat(${profitGridColCount}, minmax(72px, 1fr))`,
    minWidth: `max(100%, ${profitGridColCount * 72}px)`,
  } as const;

  // 现金专属（只读计算）
  const cashSpecial = useMemo(() => {
    const rate = parseFloat(formData.cardRate) || 0;
    return (rate * usdtRate).toFixed(2);
  }, [formData.cardRate, usdtRate]);

  // 支付BTC计算
  const payBtc = useMemo(() => {
    const usdt = parseFloat(formData.payUsdt) || 0;
    if (usdt > 0 && btcPrice != null && btcPrice > 0) {
      return (usdt / btcPrice).toFixed(8);
    }
    return "";
  }, [formData.payUsdt, btcPrice]);

  // 利润分析计算
  const profitAnalysis = useMemo(() => {
    const value = parseFloat(formData.cardValue) || 0;
    const rate = parseFloat(formData.cardRate) || 0;
    const cardWorthRMB = value * rate;
    const rates = profitRates.map(r => parseFloat(r) / 100 || 0);
    
    const naira = rates.map(r => {
      if (cardWorthRMB <= 0) return '0';
      const basePayment = cardWorthRMB * (1 - r);
      const estimatedNaira = basePayment * nairaRate;
      const fee = estimatedNaira < feeSettings.nairaThreshold 
        ? feeSettings.nairaFeeBelow 
        : feeSettings.nairaFeeAbove;
      const result = basePayment * nairaRate - fee * nairaRate;
      return Math.round(result).toString();
    });
    
    const cedi = rates.map(r => {
      if (cardWorthRMB <= 0) return '0.0';
      const basePayment = cardWorthRMB * (1 - r);
      const estimatedCedi = basePayment / cediRate;
      const fee = estimatedCedi < feeSettings.cediThreshold 
        ? feeSettings.cediFeeBelow 
        : feeSettings.cediFeeAbove;
      // 手续费是赛地单位，直接从赛地金额扣除
      const result = basePayment / cediRate - fee;
      return result.toFixed(1);
    });
    
    // 利润分析 USDT：使用较低参考价 usdtBid（P2P 卖单侧均价）
    const usdtBidRate = usdtBid > 0 ? usdtBid : usdtRate;
    const usdt = rates.map(r => {
      if (cardWorthRMB <= 0) return '0.0';
      const basePayment = cardWorthRMB * (1 - r);
      const result = usdtBidRate > 0 ? basePayment / usdtBidRate - usdtFeeNum : 0;
      return result.toFixed(1);
    });
    
    return { naira, cedi, usdt };
  }, [formData.cardValue, formData.cardRate, nairaRate, cediRate, usdtRate, usdtBid, usdtFeeNum, profitRates, feeSettings]);

  // 利润计算
  const profitCalculation = useMemo(() => {
    const value = safeNumber(parseFloat(formData.cardValue));
    const rate = safeNumber(parseFloat(formData.cardRate));
    const cardWorthRMB = safeMultiply(value, rate);
    const cardWorthU = safeDivide(cardWorthRMB, usdtRate);
    
    const payNairaNum = safeNumber(parseFloat(formData.payNaira));
    const payCediNum = safeNumber(parseFloat(formData.payCedi));
    const payUsdtNum = safeNumber(parseFloat(formData.payUsdt));
    const payBtcNum = safeNumber(parseFloat(payBtc));

    const nairaFee = payNairaNum < feeSettings.nairaThreshold 
      ? feeSettings.nairaFeeBelow 
      : feeSettings.nairaFeeAbove;
    const nairaProfitRMB = cardWorthRMB - safeDivide(payNairaNum, nairaRate) - nairaFee;
    const nairaActualRate = cardWorthRMB > 0 ? safeDivide(nairaProfitRMB * 100, cardWorthRMB) : 0;

    const cediFee = payCediNum < feeSettings.cediThreshold 
      ? feeSettings.cediFeeBelow 
      : feeSettings.cediFeeAbove;
    const cediProfitRMB = cardWorthRMB - safeMultiply(payCediNum, cediRate) - cediFee;
    const cediActualRate = cardWorthRMB > 0 ? safeDivide(cediProfitRMB * 100, cardWorthRMB) : 0;

    const usdtProfitU = cardWorthU - payUsdtNum - usdtFeeNum;
    const usdtActualRate = cardWorthU > 0 ? safeDivide(usdtProfitU * 100, cardWorthU) : 0;

    const btcProfitU = cardWorthU - safeMultiply(btcPrice, payBtcNum) - usdtFeeNum;
    const btcActualRate = cardWorthU > 0 ? safeDivide(btcProfitU * 100, cardWorthU) : 0;

    return {
      nairaProfitRMB: safeToFixed(nairaProfitRMB, 2),
      nairaRate: safeToFixed(nairaActualRate, 2),
      cediProfitRMB: safeToFixed(cediProfitRMB, 2),
      cediRate: safeToFixed(cediActualRate, 2),
      usdtProfitU: safeToFixed(usdtProfitU, 2),
      usdtRate: safeToFixed(usdtActualRate, 2),
      btcProfitU: safeToFixed(btcProfitU, 2),
      btcRate: safeToFixed(btcActualRate, 2),
    };
  }, [formData.cardValue, formData.cardRate, usdtRate, usdtFeeNum, formData.payNaira, formData.payCedi, formData.payUsdt, payBtc, nairaRate, cediRate, btcPrice, feeSettings]);

  // 币种偏好显示
  const currencyPreference = useMemo(() => {
    if (formData.currencyPreferenceList.length > 0) {
      return formData.currencyPreferenceList.join(", ");
    }
    const prefs: string[] = [];
    if (formData.payNaira) prefs.push(CURRENCIES.NGN.code);
    if (formData.payCedi) prefs.push(CURRENCIES.GHS.code);
    if (formData.payUsdt) prefs.push(CURRENCIES.USDT.code);
    return prefs.join(", ") || "-";
  }, [formData.currencyPreferenceList, formData.payNaira, formData.payCedi, formData.payUsdt]);

  // 电话号码变化处理
  const phoneSearchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const handlePhoneNumberChange = useCallback(async (value: string) => {
    const cleanedValue = value.replace(/[^0-9]/g, '').slice(0, 18);
    updateField('phoneNumber', cleanedValue);
    
    if (phoneSearchTimeoutRef.current) {
      clearTimeout(phoneSearchTimeoutRef.current);
    }
    
    if (cleanedValue.length >= 8) {
      phoneSearchTimeoutRef.current = setTimeout(async () => {
        try {
          const dbMember = await getMemberByPhoneForMyTenant(cleanedValue, memberLookupTenantId);
          
        if (dbMember) {
            const z = dbMember.member_level_zh?.trim();
            setMemberLevelZhHint(z || null);
            updateFields({
              memberCode: dbMember.member_code,
              memberLevel: dbMember.member_level || '',
              selectedCommonCards: dbMember.common_cards || [],
              customerFeature: dbMember.customer_feature || "",
              bankCard: dbMember.bank_card || "",
              remarkMember: dbMember.remark || "",
              currencyPreferenceList: dbMember.currency_preferences || [],
              customerSource: dbMember.source_id || "",
            });
            notify.success(t(`已匹配到会员: ${dbMember.member_code}`, `Member matched: ${dbMember.member_code}`));
          } else {
            setMemberLevelZhHint(null);
            const newMemberCode = generateMemberId();
            updateFields({
              memberCode: newMemberCode,
              memberLevel: "",
              selectedCommonCards: [],
              customerFeature: "",
              bankCard: "",
              remarkMember: "",
              currencyPreferenceList: [],
              customerSource: "",
            });
            notify.info(t(`新会员，已生成编号: ${newMemberCode}`, `New member, code generated: ${newMemberCode}`));
          }
        } catch (err) {
          console.error('查询会员出错:', err);
        }
      }, 300);
    } else {
      setMemberLevelZhHint(null);
      updateFields({
        memberCode: "",
        memberLevel: "",
        selectedCommonCards: [],
        customerFeature: "",
        bankCard: "",
        remarkMember: "",
        currencyPreferenceList: [],
        customerSource: "",
      });
    }
  }, [updateField, updateFields, t, memberLookupTenantId]);

  // 支付金额互斥 - 自动清理非数字字符（保留小数点），去除空格
  const handlePayNairaChange = (value: string) => {
    const cleaned = value.replace(/[^\d.]/g, '');
    updateFields({ payNaira: cleaned, payCedi: cleaned ? "" : formData.payCedi, payUsdt: cleaned ? "" : formData.payUsdt });
  };

  const handlePayCediChange = (value: string) => {
    const cleaned = value.replace(/[^\d.]/g, '');
    updateFields({ payCedi: cleaned, payNaira: cleaned ? "" : formData.payNaira, payUsdt: cleaned ? "" : formData.payUsdt });
  };

  const handlePayUsdtChange = (value: string) => {
    const cleaned = value.replace(/[^\d.]/g, '');
    updateFields({ payUsdt: cleaned, payNaira: cleaned ? "" : formData.payNaira, payCedi: cleaned ? "" : formData.payCedi });
  };

  // 填充金额
  const fillNairaAmount = (value: string) => {
    const num = parseInt(value) || 0;
    const rounded = Math.floor(num / 500) * 500;
    updateFields({ payNaira: rounded.toString(), payCedi: "", payUsdt: "" });
    notify.success(t(`已填入支付奈拉: ${rounded}`, `Filled Naira: ${rounded}`));
  };

  const fillCediAmount = (value: string) => {
    const num = parseFloat(value) || 0;
    const rounded = Math.floor(num);
    updateFields({ payCedi: rounded.toString(), payNaira: "", payUsdt: "" });
    notify.success(t(`已填入支付赛地: ${rounded}`, `Filled Cedi: ${rounded}`));
  };

  const fillUsdtAmount = (value: string) => {
    const num = parseFloat(value) || 0;
    const rounded = Math.floor(num);
    updateFields({ payUsdt: rounded.toString(), payNaira: "", payCedi: "" });
    notify.success(t(`已填入支付USDT: ${rounded}`, `Filled USDT: ${rounded}`));
  };

  // 双击清空
  const handleDoubleClick = (field: keyof typeof formData) => {
    updateField(field, "" as any);
  };

  // 复制银行卡
  const copyBankCard = () => {
    if (formData.bankCard) {
      navigator.clipboard.writeText(formData.bankCard);
      notify.success(t("复制成功", "Copy successful"));
    }
  };

  // 验证银行卡
  const validateBankCard = (value: string): boolean => {
    if (!value) {
      setBankCardError("");
      return true;
    }
    const pattern = /^\d{6,18}\s+[a-zA-Z\s]+$/;
    if (!pattern.test(value)) {
      setBankCardError(t("格式错误，例如: 8027489826 opay", "Invalid format"));
      return false;
    }
    setBankCardError("");
    return true;
  };

  // 活动赠送 / 积分兑换：与「活动赠送」Tab 一致，USDT 用采集卖出价(bid)
  const getSyncedGiftRate = useCallback(
    (c: CurrencyCode): number => {
      if (c === "NGN") return nairaRate ?? 0;
      if (c === "GHS") return cediRate ?? 0;
      return usdtBid > 0 ? usdtBid : usdtRateProp;
    },
    [nairaRate, cediRate, usdtBid, usdtRateProp],
  );

  const resolveRedeemGiftRate = useCallback(
    (exchangeCurrency: CurrencyCode): number => {
      const synced = getSyncedGiftRate(exchangeCurrency);
      const raw = redeemGiftRateInput.trim().replace(/,/g, "");
      if (raw === "") return synced;
      const n = parseFloat(raw);
      if (!Number.isFinite(n) || n <= 0) return synced;
      return n;
    },
    [redeemGiftRateInput, getSyncedGiftRate],
  );

  // ========= 积分兑换逻辑 =========
  const openRedeemDialog = () => {
    if (!formData.phoneNumber || !formData.memberCode) {
      showSubmissionError(t("请先输入电话号码", "Please enter phone number first"));
      return;
    }
    const points = getCustomerPoints();
    if (points <= 0) {
      showSubmissionError(t("积分不足，无法兑换", "Insufficient points for redemption"));
      return;
    }
    
    // 优先使用表单里的币种偏好（电话匹配 DB 后立即写入）；findMemberByPhone 仅查内存 members，新匹配会员可能不在缓存中
    const cachedMember = findMemberByPhone(formData.phoneNumber);
    const preferredCurrencies =
      formData.currencyPreferenceList.length > 0
        ? formData.currencyPreferenceList
        : cachedMember?.preferredCurrency?.length
          ? cachedMember.preferredCurrency
          : [];
    const preview = getExchangePreview(points, preferredCurrencies);
    
    if (!preview.canExchange) {
      showSubmissionError(preview.message);
      return;
    }
    
    setRedeemPreviewData({
      points,
      member: cachedMember,
      preview,
    });
    setRedeemPaymentProvider(formData.paymentAgent || "");
    setRedeemRemark("");
    const ec = preview.exchangeCurrency as CurrencyCode;
    const sync = getSyncedGiftRate(ec);
    setRedeemGiftRateInput(sync > 0 ? String(sync) : "");
    setIsRedeemDialogOpen(true);
  };

  const calculateRedeemFee = (currency: CurrencyCode, amount: number): number => {
    if (currency === "NGN") {
      return amount >= feeSettings.nairaThreshold 
        ? feeSettings.nairaFeeAbove 
        : feeSettings.nairaFeeBelow;
    } else if (currency === "GHS") {
      return amount >= feeSettings.cediThreshold 
        ? feeSettings.cediFeeAbove 
        : feeSettings.cediFeeBelow;
    } else if (currency === "USDT") {
      return usdtFeeNum;
    }
    return 0;
  };

  // 计算赠送价值 (RMB)
  // NGN: amount / nairaRate = RMB价值
  // GHS: amount * cediRate = RMB价值  
  // USDT: amount * usdtRate = RMB价值
  const calculateRedeemGiftValue = (currency: CurrencyCode, amount: number, rate: number, fee: number): number => {
    if (!rate || rate <= 0) return 0;
    if (currency === "NGN") {
      return amount / rate + fee;
    }
    if (currency === "GHS" || currency === "USDT") {
      return amount * rate + fee;
    }
    return amount;
  };

  const handleConfirmRedeem = async () => {
    if (!redeemPaymentProvider) {
      showSubmissionError(t("请选择代付商家", "Please select payment agent"));
      return;
    }
    
    if (!redeemPreviewData || !redeemPreviewData.preview) {
      showSubmissionError(t("兑换数据无效", "Invalid redemption data"));
      return;
    }
    
    const { preview } = redeemPreviewData;
    const { exchangeCurrency, exchangeAmount } = preview;
    
    const fee = calculateRedeemFee(exchangeCurrency, exchangeAmount);
    const rate = resolveRedeemGiftRate(exchangeCurrency);
    if (!rate || rate <= 0) {
      showSubmissionError(t("请填写有效汇率", "Enter a valid exchange rate"));
      return;
    }
    const giftValue = calculateRedeemGiftValue(exchangeCurrency, exchangeAmount, rate, fee);
    
    let existingMember = findMemberByPhone(formData.phoneNumber);
    // 内存中未找到时，用 RPC 查数据库兜底（避免 RLS 拦截）
    if (!existingMember?.id) {
      try {
        const dbMember = await getMemberByPhoneForMyTenant(formData.phoneNumber, memberLookupTenantId);
        if (dbMember) {
          existingMember = { id: dbMember.id, phoneNumber: dbMember.phone_number, memberCode: dbMember.member_code } as any;
        }
      } catch (e) {
        console.error('[RateCalculator] DB member lookup failed:', e);
      }
    }
    if (!existingMember?.id) {
      showSubmissionError(t("会员不存在", "Member not found"));
      return;
    }
    
    try {
      // 使用 /api/data/rpc/redeem_points_and_record 原子化处理积分兑换
      let rpcResult: Awaited<ReturnType<typeof redeemPointsAndRecordRpc>>;
      try {
        rpcResult = await redeemPointsAndRecordRpc({
          p_member_code: formData.memberCode,
          p_phone: formData.phoneNumber,
          p_member_id: existingMember.id,
          p_points_to_redeem: redeemPreviewData.points,
          p_activity_type: preview.activityType || 'activity_1',
          p_gift_currency: exchangeCurrency,
          p_gift_amount: exchangeAmount,
          p_gift_rate: rate,
          p_gift_fee: fee,
          p_gift_value: giftValue,
          p_payment_agent: redeemPaymentProvider,
          p_creator_id: employee?.id || null,
          p_creator_name: employee?.real_name || t('未知', 'Unknown'),
        });
      } catch (rpcErr: any) {
        console.error('RPC error:', rpcErr);
        showSubmissionError(rpcErr?.message || t('兑换失败', 'Redemption failed'));
        return;
      }
      if (!rpcResult?.success) {
        const errorMsg = rpcResult?.error || t('兑换失败', 'Redemption failed');
        if (rpcResult?.error === 'POINTS_MISMATCH') {
          showSubmissionError(t(`积分数据不一致，当前积分: ${rpcResult.current}，请刷新后重试`, `Points mismatch, current: ${rpcResult.current}. Please refresh.`));
        } else if (rpcResult?.error === 'NO_POINTS') {
          showSubmissionError(t('当前积分不足，无法兑换', 'Insufficient points for redemption'));
        } else {
          showSubmissionError(errorMsg);
        }
        return;
      }
      
      // 自动填写活动赠送备注：积分兑换详情（await确保写入成功）
      if (rpcResult.gift_id) {
        const redeemRemark = t(`积分兑换: ${redeemPreviewData.points}积分 → ${exchangeAmount.toLocaleString()} ${exchangeCurrency}`, `Points redemption: ${redeemPreviewData.points} pts → ${exchangeAmount.toLocaleString()} ${exchangeCurrency}`);
        try {
          await patchActivityGiftRemark(rpcResult.gift_id, redeemRemark);
        } catch (remarkErr) {
          console.error('Failed to update gift remark, retrying:', remarkErr);
          try {
            await patchActivityGiftRemark(rpcResult.gift_id, redeemRemark);
          } catch (retryErr) {
            console.error('Retry failed:', retryErr);
          }
        }
      }

      // 记录赠送余额变动到商家结算账本
      if (redeemPaymentProvider && giftValue > 0 && rpcResult.gift_id) {
        try {
          const { logGiftBalanceChange } = await import('@/services/finance/balanceLogService');
          await logGiftBalanceChange({
            providerName: redeemPaymentProvider,
            giftValue: giftValue,
            giftId: rpcResult.gift_id,
            phoneNumber: formData.phoneNumber,
            operatorId: employee?.id || undefined,
            operatorName: employee?.real_name || undefined,
          });
          notifyDataMutation({ table: 'ledger_transactions', operation: 'INSERT', source: 'manual' }).catch(console.error);
        } catch (e) {
          console.error('[RateCalculator] Failed to log gift balance change:', e);
        }
      }
      
      notify.success(t(`兑换成功！已赠送 ${exchangeAmount.toLocaleString()} ${exchangeCurrency}`, `Redeemed! Gifted ${exchangeAmount.toLocaleString()} ${exchangeCurrency}`));
      
      // 记录积分兑换操作日志 - 使用 points_redemption 模块
      try {
        logOperation('points_redemption', 'create', existingMember.id, null, {
          memberCode: formData.memberCode,
          phoneNumber: formData.phoneNumber,
          pointsRedeemed: redeemPreviewData.points,
          exchangeAmount,
          exchangeCurrency,
          activityType: preview.activityType,
          paymentProvider: redeemPaymentProvider,
        }, `${formData.memberCode} 兑换 ${redeemPreviewData.points} 积分 → ${exchangeAmount.toLocaleString()} ${exchangeCurrency}`);
      } catch (e) {
        console.error('Failed to log redemption:', e);
      }
      
      // 重新获取积分摘要
      if (formData.memberCode && formData.phoneNumber) {
        const summary = await getMemberPointsSummary(formData.memberCode, formData.phoneNumber, memberLookupTenantId);
        setMemberPointsSummary(summary);
      }
      
      // 触发统一刷新
      notifyDataMutation({ table: 'points_ledger', operation: 'UPDATE', source: 'manual' }).catch(console.error);
      notifyDataMutation({ table: 'points_accounts', operation: 'UPDATE', source: 'manual' }).catch(console.error);
      notifyDataMutation({ table: 'activity_gifts', operation: 'INSERT', source: 'manual' }).catch(console.error);
      
      setIsRedeemConfirmOpen(false);
      setIsRedeemDialogOpen(false);
    } catch (error) {
      console.error('Redemption failed:', error);
      showSubmissionError(t("兑换失败，请重试", "Redemption failed, please retry"));
    }
  };

  // 自动复制功能 - 生成完整英文模板（接收确定的积分值）
  const performAutoCopy = async (
    phone: string,
    memberCode: string,
    currency: string,
    amount: number,
    earnedPoints: number,
    _bankCardSnapshot: string = "",
    preferredCurrencies: string[] = [],
  ) => {
    try {
      // 🔧 性能优化：并行获取复制设置和积分数据（使用显式参数避免闭包问题）
      const [settingsModule, latestPointsSummary, activitySettingsData] = await Promise.all([
        import('@/components/CopySettingsTab').then(m => m.refreshCopySettings()),
        getMemberPointsSummary(memberCode, phone, memberLookupTenantId),
        Promise.resolve(getActivitySettings()),
      ]);
      
      const settings = settingsModule;
      if (!settings.enabled) return;
      
      const activitySettings = activitySettingsData;
      
      // 确定活动类型
      let activityType: 'activity1' | 'activity2' | 'none' = 'none';
      if (activitySettings.activity1Enabled) {
        activityType = 'activity1';
      } else if (activitySettings.activity2?.enabled) {
        activityType = 'activity2';
      }
      
      const totalPoints = latestPointsSummary.remainingPoints;
      const referralPoints = latestPointsSummary.referralRewardPoints;
      const consumptionPoints = latestPointsSummary.consumptionReward;
      
      // 可兑换金额按会员需求币种（与 getExchangePreview / 活动数据兑换一致），非本单支付币种
      const redeemCurrency = determineExchangeCurrency(
        preferredCurrencies.length > 0 ? preferredCurrencies : [currency],
      );
      
      // 计算可兑换金额（活动未开启时仍按已配置的阶梯表估算，与活动数据页一致）
      let redeemableAmount = '0 ' + redeemCurrency;
      if (activityType === 'activity2' && activitySettings.activity2) {
        const rate = redeemCurrency === 'NGN' ? activitySettings.activity2.pointsToNGN :
                     redeemCurrency === 'GHS' ? activitySettings.activity2.pointsToGHS :
                     activitySettings.activity2.pointsToUSDT || 0;
        redeemableAmount = `${(totalPoints * rate).toLocaleString()} ${redeemCurrency}`;
      } else {
        const rewardAmount = getRewardAmountByPointsAndCurrency(totalPoints, redeemCurrency as any);
        redeemableAmount = `${rewardAmount.toLocaleString()} ${redeemCurrency}`;
      }
      
      // 构建奖励梯度（活动未开启时不写入复制正文，仅活动1/2模板需要）
      const rewardTiers = activitySettings.accumulatedRewardTiers.map(tier => ({
        range: tier.maxPoints === null ? `≥${tier.minPoints}` : `${tier.minPoints}-${tier.maxPoints}`,
        ngn: tier.rewardAmountNGN || 0,
        ghs: tier.rewardAmountGHS || 0,
        usdt: tier.rewardAmountUSDT || 0,
      }));
      
      // 生成复制文本 - 使用传入的 earnedPoints（来自订单创建的确定值）
      const copyText = generateEnglishCopyText({
        phoneNumber: phone,
        memberCode: memberCode || phone,
        earnedPoints,  // 🔧 使用传入的确定积分值
        totalPoints: totalPoints,
        referralPoints,
        consumptionPoints,
        redeemableAmount,
        currency: redeemCurrency,
        rewardTiers,
        activityType,
        activity2Rates: activityType === 'activity2' ? {
          pointsToNGN: activitySettings.activity2?.pointsToNGN || 0,
          pointsToGHS: activitySettings.activity2?.pointsToGHS || 0,
          pointsToUSDT: activitySettings.activity2?.pointsToUSDT || 0,
        } : undefined,
      });
      
      if (copyText) {
        try {
          await navigator.clipboard.writeText(copyText);
        } catch (clipErr) {
          // Fallback: use a temporary textarea for copying when document is not focused
          const ta = document.createElement('textarea');
          ta.value = copyText;
          ta.style.position = 'fixed';
          ta.style.left = '-9999px';
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
        }
        notify.info(t("已自动复制积分信息到剪贴板", "Points info copied to clipboard"));
        // 更新本地状态以保持UI一致
        setMemberPointsSummary(latestPointsSummary);
      }
    } catch (error) {
      console.error('Auto copy failed:', error);
      // 回退：不含银行卡/备注，避免复制成「电话 - 金额 - 卡号」易被误认为乱改
      const fallback = `Your Member ID: ${memberCode || phone}
Payment (this order): ${amount.toLocaleString()} ${currency}`;
      try {
        await navigator.clipboard.writeText(fallback);
      } catch {
        const ta = document.createElement("textarea");
        ta.value = fallback;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      notify.info(t("已自动复制简要信息到剪贴板", "Brief info copied to clipboard"));
    }
  };

  // 提交订单（奈拉异常时先弹 AlertDialog，确认后再走此函数）
  const performSubmitOrder = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      let detectedCurrency: 'NGN' | 'GHS' | 'USDT' | null = null;
      let actualPaid = 0;
      let fee = 0;
      let paymentValue = 0;
      let foreignRate = 0;

      const cardRate = parseFloat(formData.cardRate) || 0;
      const cardWorthRMB = parseFloat(formData.cardValue) * cardRate;

      if (formData.payNaira) {
        detectedCurrency = 'NGN';
        actualPaid = parseFloat(formData.payNaira);
        fee = actualPaid < feeSettings.nairaThreshold ? feeSettings.nairaFeeBelow : feeSettings.nairaFeeAbove;
        paymentValue = actualPaid / nairaRate + fee;
        foreignRate = nairaRate;
      } else if (formData.payCedi) {
        detectedCurrency = 'GHS';
        actualPaid = parseFloat(formData.payCedi);
        fee = actualPaid < feeSettings.cediThreshold ? feeSettings.cediFeeBelow : feeSettings.cediFeeAbove;
        paymentValue = actualPaid * cediRate + fee;
        foreignRate = cediRate;
      } else if (formData.payUsdt) {
        detectedCurrency = 'USDT';
        actualPaid = parseFloat(formData.payUsdt);
        fee = usdtFeeNum;
        paymentValue = actualPaid + fee;
        foreignRate = usdtRate;
      }

      let profit = 0;
      let profitRateVal = 0;

      if (detectedCurrency === 'NGN') {
        profit = cardWorthRMB - actualPaid / nairaRate - fee;
        profitRateVal = cardWorthRMB > 0 ? (profit / cardWorthRMB) * 100 : 0;
      } else if (detectedCurrency === 'GHS') {
        profit = cardWorthRMB - actualPaid * cediRate - fee;
        profitRateVal = cardWorthRMB > 0 ? (profit / cardWorthRMB) * 100 : 0;
      } else if (detectedCurrency === 'USDT') {
        const cardWorthU = cardWorthRMB / usdtRate;
        profit = cardWorthU - actualPaid - fee;
        profitRateVal = cardWorthU > 0 ? (profit / cardWorthU) * 100 : 0;
      }

      let memberId: string | undefined;
      let finalMemberCode = formData.memberCode;

      try {
        let existingMember = findMemberByPhone(formData.phoneNumber);
        if (!existingMember?.id) {
          const dbMember = await getMemberByPhoneForMyTenant(formData.phoneNumber, memberLookupTenantId);
          if (dbMember) {
            existingMember = { id: dbMember.id, phoneNumber: dbMember.phone_number, memberCode: dbMember.member_code, level: dbMember.member_level || '', commonCards: dbMember.common_cards || [], customerFeature: dbMember.customer_feature || '', bankCard: dbMember.bank_card || '', remark: dbMember.remark || '', preferredCurrency: dbMember.currency_preferences || [], sourceId: dbMember.source_id || '' } as any;
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
              ? [detectedCurrency, ...(existingMember.preferredCurrency || []).filter(c => c !== detectedCurrency)]
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
        console.error('[RateCalculator] Member operation failed (order will proceed):', memberErr);
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
        salesPerson: employee?.real_name || t('未知', 'Unknown'),
        remark: formData.remarkOrder,
      };

      const orderResult = await addOrder(orderData, memberId, employee?.id, finalMemberCode);

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

      // 必须先等复制完成再清空表单：performAutoCopy 内有 await，若与 clearForm 并行会读到已清空的 formData
      await copyPromise;
      await clearForm();
      setMemberLevelZhHint(null);
    } catch (error) {
      console.error('[RateCalculator] performSubmitOrder failed:', error);
      showSubmissionError(t("提交订单失败，请重试", "Order submission failed, please retry"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitOrder = async () => {
    if (isSubmitting) return;

    if (!formData.cardValue) { showSubmissionError(t("请填写卡片面值", "Please enter card value")); return; }
    if (!formData.cardRate) { showSubmissionError(t("请填写卡片汇率", "Please enter card rate")); return; }
    if (!formData.payNaira && !formData.payCedi && !formData.payUsdt) {
      showSubmissionError(t("请至少填写一个支付金额", "Please enter at least one payment")); return;
    }
    if (!formData.cardType) { showSubmissionError(t("请选择卡片类型", "Please select card type")); return; }
    if (!formData.cardMerchant) { showSubmissionError(t("请选择卡商名称", "Please select vendor")); return; }
    if (!formData.paymentAgent) { showSubmissionError(t("请选择代付商家", "Please select payment agent")); return; }
    if (!formData.phoneNumber) { showSubmissionError(t("请填写电话号码", "Please enter phone number")); return; }

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
  };

  // 客户积分
  const getCustomerPoints = () => {
    return memberPointsSummary?.remainingPoints || 0;
  };
  
  // 推荐奖励积分
  const getReferralRewardPoints = () => {
    return memberPointsSummary?.referralRewardPoints || 0;
  };

  return (
    <div className="space-y-2">
      {/* 第一行：面值 + 汇率 */}
      {/* 快捷值编辑弹窗 - 替代内联编辑，避免移动端缩放 */}
      <DrawerDetail
        open={quickEditDialog.open}
        onOpenChange={(open) => { if (!open) setQuickEditDialog(prev => ({ ...prev, open: false })); }}
        title={
          <span className="text-base">
            {quickEditDialog.type === 'amount' ? t("修改快捷面值", "Edit Quick Value") : t("修改快捷汇率", "Edit Quick Rate")}
          </span>
        }
        sheetMaxWidth="xl"
      >
          <div className="mx-auto w-full max-w-lg space-y-4 px-1">
            <Input
              value={quickEditDialog.value}
              onChange={(e) => setQuickEditDialog(prev => ({ ...prev, value: e.target.value }))}
              inputMode="decimal"
              className="h-12 text-xl font-bold text-center rounded-2xl"
              style={{ fontSize: '16px' }}
              autoFocus
            />
            <div className="flex flex-row gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setQuickEditDialog(prev => ({ ...prev, open: false }))}
              >
                {t("取消", "Cancel")}
              </Button>
              <Button
                className="flex-1"
                onClick={() => {
                  if (quickEditDialog.type === 'amount') {
                    onQuickAmountChange(quickEditDialog.index, quickEditDialog.value);
                  } else {
                    onQuickRateChange(quickEditDialog.index, quickEditDialog.value);
                  }
                  setQuickEditDialog(prev => ({ ...prev, open: false }));
                }}
              >
                {t("确认", "Confirm")}
              </Button>
            </div>
          </div>
      </DrawerDetail>

      {isMobile ? (
        /* ===== 移动端：标签左上角 → 按钮4列 → 输入框底部全宽 ===== */
        <div className="space-y-2">
          {/* 卡片面值 */}
          <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/30">
            <CardContent className="p-3 space-y-2.5">
              <Label className="text-xs font-bold text-primary">{t("卡片面值", "Card Value")}</Label>
              <div className="grid grid-cols-4 gap-1.5">
                {quickAmounts.slice(0, 8).map((amount, index) => (
                  <Button
                    key={index}
                    variant="outline"
                    size="sm"
                    className="h-9 px-1 text-xs font-semibold hover:bg-primary/20 active:scale-95 border-primary/30 touch-manipulation transition-transform"
                    onClick={() => updateField('cardValue', amount)}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      setQuickEditDialog({ open: true, type: 'amount', index, value: amount });
                    }}
                  >
                    {amount}
                  </Button>
                ))}
              </div>
              <Input
                value={formData.cardValue}
                onChange={(e) => updateField('cardValue', e.target.value)}
                onDoubleClick={(e) => { e.stopPropagation(); handleDoubleClick('cardValue'); }}
                inputMode="decimal"
                placeholder={t("输入面值", "Enter value")}
                style={{ fontSize: '16px' }}
                className="h-12 text-2xl font-black text-center bg-background/90 border-primary/40 focus:border-primary"
              />
            </CardContent>
          </Card>

          {/* 卡片汇率 */}
          <Card className="bg-gradient-to-br from-success/5 to-success/10 border-success/30">
            <CardContent className="p-3 space-y-2.5">
              <Label className="text-xs font-bold text-success">{t("卡片汇率", "Card Rate")}</Label>
              <div className="grid grid-cols-4 gap-1.5">
                {quickRates.slice(0, 8).map((rate, index) => (
                  <Button
                    key={index}
                    variant="outline"
                    size="sm"
                    className="h-9 px-1 text-xs font-semibold hover:bg-success/20 active:scale-95 border-success/30 touch-manipulation transition-transform"
                    onClick={() => updateField('cardRate', rate)}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      setQuickEditDialog({ open: true, type: 'rate', index, value: rate });
                    }}
                  >
                    {rate}
                  </Button>
                ))}
              </div>
              <Input
                value={formData.cardRate}
                onChange={(e) => updateField('cardRate', e.target.value)}
                onDoubleClick={(e) => { e.stopPropagation(); handleDoubleClick('cardRate'); }}
                inputMode="decimal"
                placeholder={t("输入汇率", "Enter rate")}
                style={{ fontSize: '16px' }}
                className="h-12 text-2xl font-black text-center bg-background/90 border-success/40 focus:border-success"
              />
            </CardContent>
          </Card>
        </div>
      ) : (
        /* ===== 桌面端：并排布局，标签左上角 → 按钮4列 → 输入框底部 ===== */
        <div className="grid grid-cols-2 gap-2">
        {/* 卡片面值 */}
        <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/30">
          <CardContent className="p-2 sm:p-3 space-y-1">
            <div className="grid grid-cols-4 gap-1">
              {quickAmounts.slice(0, 8).map((amount, index) => (
                editingAmountIndex === index ? (
                  <Input
                    key={index}
                    value={amount}
                    onChange={(e) => onQuickAmountChange(index, e.target.value)}
                    onBlur={() => setEditingAmountIndex(null)}
                    onKeyDown={(e) => e.key === 'Enter' && setEditingAmountIndex(null)}
                    autoFocus
                    className="h-6 text-[10px] sm:text-xs text-center p-0"
                  />
                ) : (
                  <Button
                    key={index}
                    variant="outline"
                    size="sm"
                    className="h-6 px-1 text-[10px] sm:text-xs hover:bg-primary/20 border-primary/30 touch-manipulation"
                    onClick={() => updateField('cardValue', amount)}
                    onDoubleClick={(e) => { e.stopPropagation(); setEditingAmountIndex(index); }}
                  >
                    {amount}
                  </Button>
                )
              ))}
            </div>
            <Input
              value={formData.cardValue}
              onChange={(e) => updateField('cardValue', e.target.value)}
              onDoubleClick={(e) => { e.stopPropagation(); handleDoubleClick('cardValue'); }}
              placeholder={t("输入面值", "Enter value")}
              className="h-9 sm:h-10 text-lg sm:text-xl font-black text-center bg-background/90 border-primary/40 focus:border-primary"
            />
          </CardContent>
        </Card>

        {/* 卡片汇率 */}
        <Card className="bg-gradient-to-br from-success/5 to-success/10 border-success/30">
          <CardContent className="p-2 sm:p-3 space-y-1">
            <div className="grid grid-cols-4 gap-1">
              {quickRates.slice(0, 8).map((rate, index) => (
                editingRateIndex === index ? (
                  <Input
                    key={index}
                    value={rate}
                    onChange={(e) => onQuickRateChange(index, e.target.value)}
                    onBlur={() => setEditingRateIndex(null)}
                    onKeyDown={(e) => e.key === 'Enter' && setEditingRateIndex(null)}
                    autoFocus
                    className="h-6 text-[10px] sm:text-xs text-center p-0"
                  />
                ) : (
                  <Button
                    key={index}
                    variant="outline"
                    size="sm"
                    className="h-6 px-1 text-[10px] sm:text-xs hover:bg-success/20 border-success/30 touch-manipulation"
                    onClick={() => updateField('cardRate', rate)}
                    onDoubleClick={(e) => { e.stopPropagation(); setEditingRateIndex(index); }}
                  >
                    {rate}
                  </Button>
                )
              ))}
            </div>
            <Input
              value={formData.cardRate}
              onChange={(e) => updateField('cardRate', e.target.value)}
              onDoubleClick={(e) => { e.stopPropagation(); handleDoubleClick('cardRate'); }}
              placeholder={t("输入汇率", "Enter rate")}
              className="h-9 sm:h-10 text-lg sm:text-xl font-black text-center bg-background/90 border-success/40 focus:border-success"
            />
          </CardContent>
        </Card>
      </div>
      )}

      {/* 第二行：利润分析 */}
      {isMobile ? (
        /* ===== 移动端：垂直卡片布局 ===== */
        <Card className="overflow-x-auto overflow-y-visible">
          <div className="bg-muted/50 px-3 py-1.5 border-b">
            <span className="text-xs font-bold text-foreground">{t("利润分析", "Profit Analysis")}</span>
          </div>
          <div className="divide-y divide-border/40">
            {profitRates.map((rate, rateIndex) => (
              <div key={rateIndex} className="px-2.5 py-2 space-y-1">
                {/* 百分比标题行 - 与币种行对齐 */}
                <div className="flex items-center gap-2 h-9 px-2 rounded-md bg-success/10">
                  <Input
                    value={rate}
                    onChange={(e) => onProfitRateChange(rateIndex, e.target.value)}
                    className="h-7 w-12 text-center text-xs font-bold bg-background border-success/30 text-success shrink-0"
                  />
                  <span className="text-xs font-semibold text-success">%</span>
                  <span className="flex-1 text-[10px] text-muted-foreground text-right">{t("利润率", "Profit Rate")}</span>
                </div>
                {/* NGN */}
                <div className="flex items-center gap-2 h-9 px-2 rounded-md bg-orange-50 dark:bg-orange-950/30">
                  <Badge variant="outline" className="bg-orange-100 dark:bg-orange-900/50 text-orange-700 dark:text-orange-300 border-orange-300 dark:border-orange-700 text-[10px] px-1.5 shrink-0 w-12 justify-center">
                    NGN
                  </Badge>
                  <span className="flex-1 text-sm font-bold text-orange-700 dark:text-orange-300 tabular-nums text-right">
                    {Number(profitAnalysis.naira[rateIndex]).toLocaleString()}
                  </span>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 hover:bg-orange-200/50 shrink-0" onClick={() => fillNairaAmount(profitAnalysis.naira[rateIndex])}>
                    <ArrowDown className="h-3.5 w-3.5 text-orange-600" />
                  </Button>
                </div>
                {/* GHS */}
                <div className="flex items-center gap-2 h-9 px-2 rounded-md bg-emerald-50 dark:bg-emerald-950/30">
                  <Badge variant="outline" className="bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700 text-[10px] px-1.5 shrink-0 w-12 justify-center">
                    GHS
                  </Badge>
                  <span className="flex-1 text-sm font-bold text-emerald-700 dark:text-emerald-300 tabular-nums text-right">
                    {Number(profitAnalysis.cedi[rateIndex]).toLocaleString()}
                  </span>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 hover:bg-emerald-200/50 shrink-0" onClick={() => fillCediAmount(profitAnalysis.cedi[rateIndex])}>
                    <ArrowDown className="h-3.5 w-3.5 text-emerald-600" />
                  </Button>
                </div>
                {/* USDT */}
                <div className="flex items-center gap-2 h-9 px-2 rounded-md bg-blue-50 dark:bg-blue-950/30">
                  <Badge variant="outline" className="bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700 text-[10px] px-1.5 shrink-0 w-12 justify-center">
                    USDT
                  </Badge>
                  <span className="flex-1 text-sm font-bold text-blue-700 dark:text-blue-300 tabular-nums text-right">
                    {Number(profitAnalysis.usdt[rateIndex]).toLocaleString()}
                  </span>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 hover:bg-blue-200/50 shrink-0" onClick={() => fillUsdtAmount(profitAnalysis.usdt[rateIndex])}>
                    <ArrowDown className="h-3.5 w-3.5 text-blue-600" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : (
        /* ===== 桌面端：原始表格布局 ===== */
        <Card className="overflow-x-auto overflow-y-visible">
          <div className="divide-y divide-border/50 overflow-x-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
            <div className="grid bg-muted/50" style={profitGridStyle}>
              <div className="px-2 sm:px-3 py-1.5 border-r border-border/30 flex items-center">
                <span className="text-[10px] sm:text-xs font-bold text-foreground">{t("利润分析", "Profit Analysis")}</span>
              </div>
              {profitRates.map((rate, index) => (
                <div key={index} className="px-1 sm:px-2 py-1 border-r border-border/30 last:border-r-0 flex items-center justify-center">
                  <Input
                    value={rate}
                    onChange={(e) => onProfitRateChange(index, e.target.value)}
                    className="h-6 w-10 sm:w-12 text-center text-xs font-bold bg-success/10 border-success/30 text-success"
                  />
                  <span className="text-xs font-semibold text-success ml-0.5">%</span>
                </div>
              ))}
            </div>
            <div className="grid bg-orange-50 dark:bg-orange-950/30" style={profitGridStyle}>
              <div className="px-2 sm:px-3 py-1.5 border-r border-orange-200/50 dark:border-orange-800/30 flex items-center">
                <Badge variant="outline" className="bg-orange-100 dark:bg-orange-900/50 text-orange-700 dark:text-orange-300 border-orange-300 dark:border-orange-700 text-[10px] sm:text-xs px-1.5 sm:px-2">
                  {CURRENCIES.NGN.name}
                </Badge>
              </div>
              {profitAnalysis.naira.map((value, index) => (
                <div key={index} className="px-1 sm:px-2 py-1.5 border-r border-orange-200/30 last:border-r-0 flex items-center justify-between">
                  <span className="text-xs sm:text-sm font-bold text-orange-700 dark:text-orange-300 tabular-nums">{value}</span>
                  <Button variant="ghost" size="sm" className="h-5 w-5 p-0 hover:bg-orange-200/50" onClick={() => fillNairaAmount(value)}>
                    <ArrowDown className="h-3 w-3 text-orange-600" />
                  </Button>
                </div>
              ))}
            </div>
            <div className="grid bg-emerald-50 dark:bg-emerald-950/30" style={profitGridStyle}>
              <div className="px-2 sm:px-3 py-1.5 border-r border-emerald-200/50 dark:border-emerald-800/30 flex items-center">
                <Badge variant="outline" className="bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700 text-[10px] sm:text-xs px-1.5 sm:px-2">
                  {CURRENCIES.GHS.name}
                </Badge>
              </div>
              {profitAnalysis.cedi.map((value, index) => (
                <div key={index} className="px-1 sm:px-2 py-1.5 border-r border-emerald-200/30 last:border-r-0 flex items-center justify-between">
                  <span className="text-xs sm:text-sm font-bold text-emerald-700 dark:text-emerald-300 tabular-nums">{value}</span>
                  <Button variant="ghost" size="sm" className="h-5 w-5 p-0 hover:bg-emerald-200/50" onClick={() => fillCediAmount(value)}>
                    <ArrowDown className="h-3 w-3 text-emerald-600" />
                  </Button>
                </div>
              ))}
            </div>
            <div className="grid bg-blue-50 dark:bg-blue-950/30" style={profitGridStyle}>
              <div className="px-2 sm:px-3 py-1.5 border-r border-blue-200/50 dark:border-blue-800/30 flex items-center">
                <Badge variant="outline" className="bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700 text-[10px] sm:text-xs px-1.5 sm:px-2">
                  {CURRENCIES.USDT.name}
                </Badge>
              </div>
              {profitAnalysis.usdt.map((value, index) => (
                <div key={index} className="px-1 sm:px-2 py-1.5 border-r border-blue-200/30 last:border-r-0 flex items-center justify-between">
                  <span className="text-xs sm:text-sm font-bold text-blue-700 dark:text-blue-300 tabular-nums">{value}</span>
                  <Button variant="ghost" size="sm" className="h-5 w-5 p-0 hover:bg-blue-200/50" onClick={() => fillUsdtAmount(value)}>
                    <ArrowDown className="h-3 w-3 text-blue-600" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* 第四行：支付信息(5/12) + 会员信息(7/12，含备注) */}
      <div className={`grid gap-2 ${isMobile ? 'grid-cols-1' : 'grid-cols-1 xl:grid-cols-12'}`}>
        {/* 支付输入区域 - 4/12 */}
        <Card className={isMobile ? "" : "xl:col-span-4 overflow-x-auto overflow-y-visible"}>
          <div className="bg-muted/50 px-3 py-1 border-b">
            <span className="text-xs font-bold text-foreground">{t("支付信息", "Payment Info")}</span>
          </div>
          <div className="divide-y divide-border/50">
            {/* 支付奈拉行 */}
            <div className={`${isMobile ? 'p-2.5 space-y-1.5' : 'grid grid-cols-[1fr_auto_auto]'} bg-orange-50/50 dark:bg-orange-950/20`}>
              {isMobile ? (
                <>
                  <Label className="text-xs text-orange-700 dark:text-orange-400 font-medium">{t("支付", "Pay")} {CURRENCIES.NGN.name}</Label>
                  <Input value={formData.payNaira} onChange={(e) => handlePayNairaChange(e.target.value)} onDoubleClick={() => handleDoubleClick('payNaira')} placeholder={t("输入奈拉金额", "Enter NGN amount")} className="h-10 text-center font-bold text-base bg-background border-orange-300/50" />
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{t("利润", "Profit")}: <span className="font-bold text-success">{formData.payNaira ? profitCalculation.nairaProfitRMB : '0'}</span></span>
                    <span className="text-muted-foreground">{t("利率", "Rate")}: <span className="font-bold text-orange-600 dark:text-orange-400">{formData.payNaira ? profitCalculation.nairaRate + '%' : '0%'}</span></span>
                  </div>
                </>
              ) : (
              <>
              <div className="p-2 border-r border-orange-200/30">
                <Label className="text-[10px] text-orange-700 dark:text-orange-400 font-medium block mb-1">{t("支付", "Pay")} {CURRENCIES.NGN.name}</Label>
                <Input value={formData.payNaira} onChange={(e) => handlePayNairaChange(e.target.value)} onDoubleClick={() => handleDoubleClick('payNaira')} placeholder={t("输入奈拉金额", "Enter NGN amount")} className="h-8 text-center font-bold text-sm bg-background border-orange-300/50" />
              </div>
              <div className="px-2 py-2 border-r border-orange-200/30 flex flex-col items-center justify-center min-w-[52px]">
                <span className="text-[10px] text-muted-foreground">{t("利润", "Profit")}</span>
                <span className="text-sm font-bold text-success tabular-nums">{formData.payNaira ? profitCalculation.nairaProfitRMB : '0'}</span>
              </div>
              <div className="px-2 py-2 flex flex-col items-center justify-center min-w-[44px]">
                <span className="text-[10px] text-muted-foreground">{t("利率", "Rate")}</span>
                <span className="text-sm font-bold text-orange-600 dark:text-orange-400 tabular-nums">{formData.payNaira ? profitCalculation.nairaRate + '%' : '0%'}</span>
              </div>
              </>
              )}
            </div>
            {/* 支付赛地行 */}
            <div className={`${isMobile ? 'p-2.5 space-y-1.5' : 'grid grid-cols-[1fr_auto_auto]'} bg-emerald-50/50 dark:bg-emerald-950/20`}>
              {isMobile ? (
                <>
                  <Label className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">{t("支付", "Pay")} {CURRENCIES.GHS.name}</Label>
                  <Input value={formData.payCedi} onChange={(e) => handlePayCediChange(e.target.value)} onDoubleClick={() => handleDoubleClick('payCedi')} placeholder={t("输入赛地金额", "Enter GHS amount")} className="h-10 text-center font-bold text-base bg-background border-emerald-300/50" />
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{t("利润", "Profit")}: <span className="font-bold text-success">{formData.payCedi ? profitCalculation.cediProfitRMB : '0'}</span></span>
                    <span className="text-muted-foreground">{t("利率", "Rate")}: <span className="font-bold text-emerald-600 dark:text-emerald-400">{formData.payCedi ? profitCalculation.cediRate + '%' : '0%'}</span></span>
                  </div>
                </>
              ) : (
              <>
              <div className="p-2 border-r border-emerald-200/30">
                <Label className="text-[10px] text-emerald-700 dark:text-emerald-400 font-medium block mb-1">{t("支付", "Pay")} {CURRENCIES.GHS.name}</Label>
                <Input value={formData.payCedi} onChange={(e) => handlePayCediChange(e.target.value)} onDoubleClick={() => handleDoubleClick('payCedi')} placeholder={t("输入赛地金额", "Enter GHS amount")} className="h-8 text-center font-bold text-sm bg-background border-emerald-300/50" />
              </div>
              <div className="px-2 py-2 border-r border-emerald-200/30 flex flex-col items-center justify-center min-w-[52px]">
                <span className="text-[10px] text-muted-foreground">{t("利润", "Profit")}</span>
                <span className="text-sm font-bold text-success tabular-nums">{formData.payCedi ? profitCalculation.cediProfitRMB : '0'}</span>
              </div>
              <div className="px-2 py-2 flex flex-col items-center justify-center min-w-[44px]">
                <span className="text-[10px] text-muted-foreground">{t("利率", "Rate")}</span>
                <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">{formData.payCedi ? profitCalculation.cediRate + '%' : '0%'}</span>
              </div>
              </>
              )}
            </div>
            {/* 支付USDT行 */}
            <div className={`${isMobile ? 'p-2.5 space-y-1.5' : 'grid grid-cols-[1fr_auto_auto]'} bg-blue-50/50 dark:bg-blue-950/20`}>
              {isMobile ? (
                <>
                  <Label className="text-xs text-blue-700 dark:text-blue-400 font-medium">{t("支付", "Pay")} {CURRENCIES.USDT.name}</Label>
                  <Input value={formData.payUsdt} onChange={(e) => handlePayUsdtChange(e.target.value)} onDoubleClick={() => handleDoubleClick('payUsdt')} placeholder={t("输入USDT金额", "Enter USDT")} className="h-10 text-center font-bold text-base bg-background border-blue-300/50" />
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{t("利润(U)", "Profit")}: <span className="font-bold text-blue-600 dark:text-blue-400">{formData.payUsdt ? profitCalculation.usdtProfitU : '0'}</span></span>
                    <span className="text-muted-foreground">{t("利率", "Rate")}: <span className="font-bold text-blue-600 dark:text-blue-400">{formData.payUsdt ? profitCalculation.usdtRate + '%' : '0%'}</span></span>
                  </div>
                </>
              ) : (
              <>
              <div className="p-2 border-r border-blue-200/30">
                <Label className="text-[10px] text-blue-700 dark:text-blue-400 font-medium block mb-1">{t("支付", "Pay")} {CURRENCIES.USDT.name}</Label>
                <Input value={formData.payUsdt} onChange={(e) => handlePayUsdtChange(e.target.value)} onDoubleClick={() => handleDoubleClick('payUsdt')} placeholder={t("双击清空", "Double-click to clear")} className="h-8 text-center font-bold text-sm bg-background border-blue-300/50" />
              </div>
              <div className="px-2 py-2 border-r border-blue-200/30 flex flex-col items-center justify-center min-w-[52px]">
                <span className="text-[10px] text-muted-foreground">{t("利润(U)", "Profit")}</span>
                <span className="text-sm font-bold text-blue-600 dark:text-blue-400 tabular-nums">{formData.payUsdt ? profitCalculation.usdtProfitU : '0'}</span>
              </div>
              <div className="px-2 py-2 flex flex-col items-center justify-center min-w-[44px]">
                <span className="text-[10px] text-muted-foreground">{t("利率", "Rate")}</span>
                <span className="text-sm font-bold text-blue-600 dark:text-blue-400 tabular-nums">{formData.payUsdt ? profitCalculation.usdtRate + '%' : '0%'}</span>
              </div>
              </>
              )}
            </div>
            {/* 支付BTC行 */}
            <div className={`${isMobile ? 'p-2.5 space-y-1.5' : 'grid grid-cols-[1fr_auto_auto]'} bg-purple-50/50 dark:bg-purple-950/20`}>
              {isMobile ? (
                <>
                  <div className="flex items-center gap-1">
                    <Label className="text-xs text-purple-700 dark:text-purple-400 font-medium">{t("支付BTC", "Pay BTC")}</Label>
                    <Lock className="h-3 w-3 text-purple-400" />
                  </div>
                  <div className="h-10 flex items-center justify-center font-bold text-base text-purple-700 dark:text-purple-300 bg-purple-100/50 dark:bg-purple-900/30 rounded border tabular-nums">{payBtc || '—'}</div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{t("利润(U)", "Profit")}: <span className="font-bold text-purple-600 dark:text-purple-400">{payBtc ? profitCalculation.btcProfitU : '0'}</span></span>
                    <span className="text-muted-foreground">{t("利率", "Rate")}: <span className="font-bold text-purple-600 dark:text-purple-400">{payBtc ? profitCalculation.btcRate + '%' : '0%'}</span></span>
                  </div>
                </>
              ) : (
              <>
              <div className="p-2 border-r border-purple-200/30">
                <Label className="text-[10px] text-purple-700 dark:text-purple-400 font-medium flex items-center gap-1 mb-1">{t("支付BTC", "Pay BTC")} <Lock className="h-2.5 w-2.5" /></Label>
                <div className="h-8 flex items-center justify-center font-bold text-sm text-purple-700 dark:text-purple-300 bg-purple-100/50 dark:bg-purple-900/30 rounded border tabular-nums">{payBtc || '—'}</div>
              </div>
              <div className="px-2 py-2 border-r border-purple-200/30 flex flex-col items-center justify-center min-w-[52px]">
                <span className="text-[10px] text-muted-foreground">{t("利润(U)", "Profit")}</span>
                <span className="text-sm font-bold text-purple-600 dark:text-purple-400 tabular-nums">{payBtc ? profitCalculation.btcProfitU : '0'}</span>
              </div>
              <div className="px-2 py-2 flex flex-col items-center justify-center min-w-[44px]">
                <span className="text-[10px] text-muted-foreground">{t("利率", "Rate")}</span>
                <span className="text-sm font-bold text-purple-600 dark:text-purple-400 tabular-nums">{payBtc ? profitCalculation.btcRate + '%' : '0%'}</span>
              </div>
              </>
              )}
            </div>
          </div>
        </Card>

        {/* 右侧区域 - 8/12 (必填信息 + 会员信息) */}
        <div className={isMobile ? 'space-y-2' : 'xl:col-span-8 space-y-2'}>
          {/* 必填信息 */}
          <Card className="border-warning/30">
            <CardContent className="p-2">
              <div className={`grid gap-x-2 gap-y-1.5 ${isMobile ? 'grid-cols-2' : 'grid-cols-3'}`}>
                {/* 卡类型 */}
                <div className="flex flex-col gap-0.5">
                  <Label className="text-[10px] text-muted-foreground">{t("卡类型", "Card Type")}</Label>
                  <Select value={formData.cardType} onValueChange={(v) => {
                    updateFields({ cardType: v, cardMerchant: "" });
                  }}>
                    <SelectTrigger className="h-7 text-xs">
                      <SelectValue placeholder={t("选择", "Select")} />
                    </SelectTrigger>
                    <SelectContent>
                      {cardsList.map((card) => (
                        <SelectItem key={card.id} value={card.name}>{card.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                {/* 卡商 */}
                <div className="flex flex-col gap-0.5">
                  <Label className="text-[10px] text-muted-foreground">{t("卡商名称", "Vendor")}</Label>
                  <Select value={formData.cardMerchant} onValueChange={(v) => updateField('cardMerchant', v)}>
                    <SelectTrigger className="h-7 text-xs">
                      <SelectValue placeholder={t("选择", "Select")} />
                    </SelectTrigger>
                    <SelectContent>
                      {(() => {
                        const selectedCard = cardsList.find(c => c.name === formData.cardType);
                        if (selectedCard?.cardVendors && selectedCard.cardVendors.length > 0) {
                          return selectedCard.cardVendors.map((vendor) => (
                            <SelectItem key={vendor} value={vendor}>{vendor}</SelectItem>
                          ));
                        } else {
                          return vendorsList.map((vendor) => (
                            <SelectItem key={vendor.id} value={vendor.name}>{vendor.name}</SelectItem>
                          ));
                        }
                      })()}
                    </SelectContent>
                  </Select>
                </div>
                
                {/* 代付商家 */}
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-1">
                    <Label className="text-[10px] text-muted-foreground">{t("代付商家", "Payment Agent")}</Label>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help shrink-0" />
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-[240px] text-xs">
                          {formData.payUsdt && parseFloat(formData.payUsdt) > 0
                            ? t("支付USDT时，仅显示商家名称中含「USDT」的代付商家", "When paying USDT, only providers with 'USDT' in name are shown")
                            : t("选择卡商后，显示该卡商关联的代付商家", "Shows providers linked to selected card merchant")}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <Select value={formData.paymentAgent} onValueChange={(v) => updateField('paymentAgent', v)}>
                    <SelectTrigger className="h-7 text-xs">
                      <SelectValue placeholder={t("选择", "Select")} />
                    </SelectTrigger>
                    <SelectContent>
                      {(() => {
                        let availableProviders: { id: string; name: string }[];
                        const payUsdtVal = formData.payUsdt && parseFloat(formData.payUsdt) > 0;
                        if (payUsdtVal) {
                          // 支付USDT时：只显示名称含USDT的代付商家，忽略卡商关联
                          availableProviders = paymentProvidersList.filter(
                            p => p.name.toUpperCase().includes('USDT')
                          );
                        } else {
                          const selectedVendor = vendorsList.find(v => v.name === formData.cardMerchant);
                          availableProviders = paymentProvidersList;
                          if (selectedVendor?.paymentProviders && selectedVendor.paymentProviders.length > 0) {
                            availableProviders = paymentProvidersList.filter(
                              p => selectedVendor.paymentProviders!.includes(p.name)
                            );
                          }
                        }
                        return availableProviders.map((provider) => (
                          <SelectItem key={provider.id} value={provider.name}>{provider.name}</SelectItem>
                        ));
                      })()}
                    </SelectContent>
                  </Select>
                </div>
                
                {/* 电话号码 */}
                <div className="flex flex-col gap-0.5">
                  <Label className="text-[10px] text-muted-foreground">{t("电话号码", "Phone")}</Label>
                  <Input
                    value={formData.phoneNumber}
                    onChange={(e) => handlePhoneNumberChange(e.target.value)}
                    placeholder={t("输入电话", "Enter phone")}
                    maxLength={18}
                    className="h-7 text-xs"
                  />
                </div>
                
                {/* 银行卡 */}
                <div className="flex flex-col gap-0.5">
                  <Label className="text-[10px] text-muted-foreground">{t("银行卡", "Bank Card")}</Label>
                  <div className="flex gap-1">
                    <Input 
                      value={formData.bankCard} 
                      onChange={(e) => updateField('bankCard', e.target.value)}
                      onBlur={(e) => validateBankCard(e.target.value)}
                      placeholder={t("卡号 银行", "Card# Bank")}
                      className={`h-7 text-xs flex-1 ${bankCardError ? 'border-destructive' : ''}`}
                    />
                    <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={copyBankCard}>
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                
                {/* 会员编号 */}
                <div className="flex flex-col gap-0.5">
                  <Label className="text-[10px] text-muted-foreground">{t("会员编号", "Member Code")}</Label>
                  <Input 
                    value={formData.memberCode} 
                    readOnly
                    placeholder={t("自动生成", "Auto-generated")}
                    className="h-7 text-xs bg-muted/50 font-mono"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 会员信息区域 */}
          <Card className="overflow-x-auto overflow-y-visible">
          <div className="bg-muted/50 px-3 py-1 border-b flex items-center justify-between">
            <span className="text-xs font-bold text-foreground">{t("会员信息", "Member Info")}</span>
          </div>
          <CardContent className="p-2 space-y-2">
            {/* 上半部分：左右两栏 */}
            <div className={`grid gap-3 ${isMobile ? 'grid-cols-1' : 'grid-cols-2'}`}>
              {/* 左栏：手填（特点、来源）→ 自动（常交易卡、等级） */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5 rounded-md border border-primary/35 bg-primary/[0.08] px-1.5 py-0 dark:border-primary/35 dark:bg-primary/15">
                  <Label className="text-[10px] w-14 shrink-0 font-medium text-primary dark:text-primary leading-none">
                    {t("客户特点", "Feature")}
                  </Label>
                  <Input
                    value={formData.customerFeature}
                    onChange={(e) => updateField("customerFeature", e.target.value)}
                    placeholder={t("输入", "Enter")}
                    className="h-6 flex-1 text-[11px] border-primary/25 bg-background/90 shadow-none focus-visible:ring-primary/35 dark:border-primary/30 dark:bg-background/70"
                  />
                </div>
                <div className="flex items-center gap-1.5 rounded-md border border-primary/35 bg-primary/[0.08] px-1.5 py-0 dark:border-primary/35 dark:bg-primary/15">
                  <Label className="text-[10px] w-14 shrink-0 font-medium text-primary dark:text-primary leading-none">
                    {t("来源", "Source")}
                  </Label>
                  <Select value={formData.customerSource || undefined} onValueChange={(v) => updateField("customerSource", v)}>
                    <SelectTrigger className="h-6 flex-1 text-[11px] border-primary/25 bg-background/90 focus:ring-primary/35 dark:border-primary/30 dark:bg-background/70">
                      <SelectValue placeholder={t("选择来源", "Select source")}>
                        {customerSources.find((s) => s.id === formData.customerSource)?.name || t("选择", "Select")}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {customerSources.map((source) => (
                        <SelectItem key={source.id} value={source.id}>
                          {source.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-1.5">
                  <Label className="text-[10px] w-14 shrink-0 text-muted-foreground leading-none">{t("常交易卡", "Common Cards")}</Label>
                  <div className="flex-1 h-6 flex flex-nowrap gap-1 items-center overflow-x-auto overflow-y-hidden rounded-md border border-border/60 bg-muted/30 px-1.5 [scrollbar-width:thin]">
                    {formData.selectedCommonCards.length === 0 ? (
                      <span className="text-[11px] text-muted-foreground truncate min-w-0">
                        {t("暂无（有订单后自动汇总）", "None yet (filled from orders)")}
                      </span>
                    ) : (
                      formData.selectedCommonCards.map((name) => (
                        <Badge key={name} variant="secondary" className="text-[10px] font-normal shrink-0">
                          {name}
                        </Badge>
                      ))
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <Label className="text-[10px] w-14 shrink-0 text-muted-foreground">{t("会员等级", "Level")}</Label>
                  <Input
                    readOnly
                    value={
                      displayMemberLevelLabel(formData.memberLevel, memberLevelZhHint, language) ||
                      (formData.phoneNumber.length >= 8 ? t("新会员→最低档", "New → lowest tier") : "")
                    }
                    title={t("等级由累计积分自动计算，不可在此修改", "Level is automatic from points; not editable here")}
                    className="h-6 flex-1 text-[11px] bg-muted/50 border-border/60"
                  />
                </div>
              </div>
              
              {/* 右栏：系统带出（积分、偏好等） */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <Label className="text-[10px] w-14 shrink-0 text-muted-foreground">{t("客户积分", "Points")}</Label>
                  <div className={`h-6 flex-1 flex items-center justify-end px-2 bg-muted/50 rounded border text-sm font-bold tabular-nums ${getCustomerPoints() < 0 ? 'text-destructive' : 'text-foreground'}`}>
                    {isLoadingPoints ? '...' : getCustomerPoints()}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <Label className="text-[10px] w-14 shrink-0 text-muted-foreground">{t("推荐奖励", "Referral")}</Label>
                  <div className="h-6 flex-1 flex items-center justify-end px-2 bg-muted/50 rounded border text-sm font-medium tabular-nums">
                    {isLoadingPoints ? '...' : getReferralRewardPoints()}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <Label className="text-[10px] w-14 shrink-0 text-muted-foreground">{t("币种偏好", "Currency Pref")}</Label>
                  <div className="h-6 flex-1 flex items-center px-2 bg-muted/50 rounded border text-[11px] truncate">
                    {currencyPreference}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <Label className="text-[10px] w-14 shrink-0 text-muted-foreground">{t("累积次数", "Order Count")}</Label>
                  <div className="h-6 flex-1 flex items-center justify-end px-2 bg-muted/50 rounded border text-sm font-medium tabular-nums">
                    {isLoadingPoints ? '...' : (memberPointsSummary?.orderCount || 0)} {t("次", "times")}
                  </div>
                </div>
              </div>
            </div>
            
            {/* 下半部分：备注（手填，与特点/来源同色带） */}
            <div className="rounded-lg border border-primary/35 bg-primary/[0.06] p-2 dark:border-primary/35 dark:bg-primary/12">
              <div className={`grid gap-3 ${isMobile ? "grid-cols-1" : "grid-cols-2"}`}>
                <div className={`flex ${isMobile ? "flex-col gap-1" : "items-start gap-1.5"}`}>
                  <Label
                    className={`text-[10px] shrink-0 font-medium text-primary dark:text-primary ${isMobile ? "" : "w-14 pt-1.5"}`}
                  >
                    {t("订单备注", "Order Remark")}
                  </Label>
                  <Textarea
                    value={formData.remarkOrder}
                    onChange={(e) => updateField("remarkOrder", e.target.value)}
                    placeholder={t("提交后同步到订单管理", "Syncs to order management")}
                    className="flex-1 h-[52px] min-h-[52px] resize-none text-xs border-primary/25 bg-background/90 focus-visible:ring-primary/35 dark:border-primary/30 dark:bg-background/70"
                  />
                </div>
                <div className={`flex ${isMobile ? "flex-col gap-1" : "items-start gap-1.5"}`}>
                  <Label
                    className={`text-[10px] shrink-0 font-medium text-primary dark:text-primary ${isMobile ? "" : "w-14 pt-1.5"}`}
                  >
                    {t("会员备注", "Member Remark")}
                  </Label>
                  <Textarea
                    value={formData.remarkMember}
                    onChange={(e) => updateField("remarkMember", e.target.value)}
                    placeholder={t("提交后同步到会员管理", "Syncs to member management")}
                    className="flex-1 h-[52px] min-h-[52px] resize-none text-xs border-primary/25 bg-background/90 focus-visible:ring-primary/35 dark:border-primary/30 dark:bg-background/70"
                  />
                </div>
              </div>
            </div>
            
            {/* 积分兑换 + 提交订单按钮 */}
            <div className={`flex ${isMobile ? 'flex-col' : 'flex-row'} items-center justify-center gap-3 pt-3`}>
              <Button
                type="button"
                onClick={openRedeemDialog}
                disabled={!formData.phoneNumber || !formData.memberCode || getCustomerPoints() <= 0 || isLoadingPoints}
                title={getExchangeDisabledMessage() || (!formData.phoneNumber ? t("请先输入电话号码", "Enter phone number first") : undefined)}
                className={`${isMobile ? 'w-full' : 'flex-1 max-w-[220px]'} h-11 gap-2 font-semibold text-base bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white shadow-md hover:shadow-lg border-0`}
              >
                <span className="text-lg">🎁</span>
                {t("积分兑换", "Redeem Points")}
                {!isLoadingPoints && getCustomerPoints() > 0 && (
                  <Badge variant="secondary" className="ml-1 bg-white/20 text-white border-0 text-xs">
                    {getCustomerPoints()} {t("分", "pts")}
                  </Badge>
                )}
              </Button>
              <Button 
                onClick={handleSubmitOrder}
                className={`${isMobile ? 'w-full' : 'flex-1 max-w-[220px]'} h-11 gap-2 font-semibold text-base`}
                disabled={isSubmitting}
              >
                <Send className="h-4 w-4" />
                {isSubmitting ? t("提交中...", "Submitting...") : t("提交订单", "Submit Order")}
              </Button>
            </div>
          </CardContent>
        </Card>
        </div>
      </div>

      {/* 兑换确认对话框 */}
      <DrawerDetail
        open={isRedeemDialogOpen}
        onOpenChange={setIsRedeemDialogOpen}
        title={<span className="text-lg">{t("积分兑换", "Points Redemption")}</span>}
        sheetMaxWidth="xl"
      >
          {redeemPreviewData && (
            <div className="space-y-3">
              <div className="p-3 bg-muted/50 rounded-lg space-y-2">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="flex flex-col">
                    <span className="text-xs text-muted-foreground">{t("会员编号", "Member Code")}</span>
                    <span className="font-mono font-medium truncate">{formData.memberCode}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs text-muted-foreground">{t("电话号码", "Phone Number")}</span>
                    <span className="font-mono font-medium truncate">{formData.phoneNumber}</span>
                  </div>
                </div>
                
                <div className="border-t pt-2 space-y-1.5">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">{t("当前积分", "Current Points")}</span>
                    <span className="font-bold text-primary text-base">{redeemPreviewData.points}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">{t("兑换后剩余", "Remaining After")}</span>
                    <span className="font-bold text-orange-500">0</span>
                  </div>
                </div>
                
                <div className="border-t pt-2 space-y-1.5">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">{t("兑换币种", "Redemption Currency")}</span>
                    <span className="font-medium">{redeemPreviewData.preview?.exchangeCurrency}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">{t("兑换金额", "Redemption Amount")}</span>
                    <span className="font-bold text-green-600 text-base">
                      {redeemPreviewData.preview?.exchangeAmount?.toLocaleString()} {redeemPreviewData.preview?.exchangeCurrency}
                    </span>
                  </div>
                </div>

                <div className="border-t pt-2 space-y-1.5">
                  <Label className="text-xs text-muted-foreground">
                    {t("活动赠送汇率（可修改）", "Gift record rate (editable)")}
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      value={redeemGiftRateInput}
                      onChange={(e) => {
                        const v = e.target.value.replace(/[^0-9.,]/g, "").replace(/(\..*)\./g, "$1");
                        setRedeemGiftRateInput(v);
                      }}
                      placeholder={t("留空则用页面同步价", "Blank = use synced rate")}
                      className="h-9 font-mono text-sm"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-9 shrink-0 px-2 text-xs"
                      onClick={() => {
                        const ec = redeemPreviewData.preview?.exchangeCurrency as CurrencyCode;
                        const s = getSyncedGiftRate(ec);
                        setRedeemGiftRateInput(s > 0 ? String(s) : "");
                      }}
                    >
                      {t("同步", "Sync")}
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-snug">
                    {t(
                      "写入活动赠送记录时使用此汇率计算赠送价值；默认与当前页奈拉/赛地/USDT 同步。",
                      "Used to compute gift value on the activity record; defaults match NGN/GHS/USDT on this page.",
                    )}
                  </p>
                </div>
                
                <div className="border-t pt-2">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">{t("活动类型", "Activity Type")}</span>
                    <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">
                      {redeemPreviewData.preview?.activityType === 'activity_1' 
                        ? t('活动1（阶梯制）', 'Activity 1 (Tiered)') 
                        : t('活动2（固定比例）', 'Activity 2 (Fixed Rate)')}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {redeemPreviewData.preview?.activityType === 'activity_1' 
                      ? t('根据累计积分达到不同档位获得对应奖励', 'Rewards based on accumulated points reaching different tiers')
                      : t('按固定比例将积分兑换为奖励金额', 'Exchange points at a fixed rate for rewards')}
                  </p>
                </div>
              </div>
              
              <div className="space-y-1.5">
                <Label className="text-sm">{t("代付商家", "Payment Agent")} <span className="text-destructive">*</span></Label>
                <Select value={redeemPaymentProvider} onValueChange={setRedeemPaymentProvider}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder={t("请选择代付商家", "Please select payment agent")} />
                  </SelectTrigger>
                  <SelectContent>
                    {paymentProvidersList.map((provider) => (
                      <SelectItem key={provider.id} value={provider.name}>{provider.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-1.5">
                <Label className="text-sm">{t("备注（可选）", "Remark (Optional)")}</Label>
                <Textarea 
                  value={redeemRemark}
                  onChange={(e) => setRedeemRemark(e.target.value)}
                  placeholder={t("输入备注信息", "Enter remark")}
                  className="resize-none h-16 min-h-16"
                />
              </div>
            </div>
          )}
          <div className="flex flex-col md:flex-row gap-2 pt-4 mt-4 border-t border-border">
            <Button variant="outline" onClick={() => setIsRedeemDialogOpen(false)} className="w-full md:w-auto">
              {t("取消", "Cancel")}
            </Button>
            <Button 
              onClick={() => setIsRedeemConfirmOpen(true)} 
              disabled={!redeemPaymentProvider}
              className="w-full md:w-auto"
            >
              {t("确认兑换", "Confirm Redemption")}
            </Button>
          </div>
      </DrawerDetail>

      {/* 兑换二次确认对话框 */}
      <AlertDialog open={isRedeemConfirmOpen} onOpenChange={setIsRedeemConfirmOpen}>
        <AlertDialogContent className="max-w-[95vw] md:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("确认兑换", "Confirm Redemption")}</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2 text-sm">
              <p>
                {t("确定要将", "Are you sure you want to redeem")} <span className="font-bold text-foreground">{redeemPreviewData?.points}</span> {t("积分兑换为", "points for")}{' '}
                <span className="font-bold text-green-600">
                  {redeemPreviewData?.preview?.exchangeAmount?.toLocaleString()} {redeemPreviewData?.preview?.exchangeCurrency}
                </span>?
              </p>
              <p className="text-destructive font-medium">
                ⚠️ {t("兑换后积分将清零，消费奖励和推荐奖励都会归零，重置时间会更新为当前时间！此操作无法恢复！", "After redemption, all points will be reset to zero, including consumption and referral rewards. Reset time will be updated. This action cannot be undone!")}
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col md:flex-row gap-2">
            <AlertDialogCancel className="w-full md:w-auto">{t("取消", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmRedeem} className="w-full md:w-auto">{t("确认兑换", "Confirm Redemption")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={nairaWarningOpen} onOpenChange={setNairaWarningOpen}>
        <AlertDialogContent className="max-w-[95vw] sm:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("实付奈拉金额异常", "Abnormal Naira amount")}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="max-h-[min(55vh,420px)] overflow-y-auto whitespace-pre-line text-left text-sm text-muted-foreground">
                {nairaWarningText}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
            <AlertDialogCancel className="sm:mt-0">{t("返回修改", "Go back and edit")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-amber-600 text-white hover:bg-amber-600/90"
              onClick={() => {
                setNairaWarningOpen(false);
                void performSubmitOrder();
              }}
            >
              {t("仍要提交", "Submit anyway")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
