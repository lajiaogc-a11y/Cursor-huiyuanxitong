// 汇率计算器组件 - 优化布局设计
// 核心策略：面值汇率放大 + 利润分析对齐 + 备注直接显示
import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useIsMobile } from "@/hooks/ui/use-mobile";
import { Card, CardContent } from "@/components/ui/card";
import { trackRender } from "@/lib/performanceUtils";
import { Input } from "@/components/ui/input";
import { safeNumber, safeDivide, safeMultiply, safeToFixed } from "@/lib/safeCalc";
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Send, Lock, Copy, ArrowDown, HelpCircle } from "lucide-react";
import { notify } from "@/lib/notifyHub";
import { getMemberByPhoneForMyTenant, isMemberInTenant } from "@/services/members/memberLookupService";
import { showSubmissionError } from "@/services/submissionErrorService";
import { CURRENCIES } from "@/config/currencies";
import { useCalculatorForm, CalculatorId } from "@/hooks/finance/useCalculatorStore";
import { useOrders, useUsdtOrders } from "@/hooks/orders";
import { useMembers } from "@/hooks/members/useMembers";

import {
  generateMemberId,
  getFeeSettings,
  getUsdtFee,
} from "@/services/system/systemSettingsService";
import { getMemberCurrentPoints } from "@/services/points/pointsAccountService";
import { useLanguage } from "@/contexts/LanguageContext";
import { displayMemberLevelLabel } from "@/lib/memberLevelDisplay";
// pointsLedgerStore is deprecated — usePointsLedger hook is the single source of truth
import { getPointsSettings } from "@/services/points/pointsSettingsService";
import { getMemberLastResetTime } from "@/services/points/pointsAccountService";
import { useAuth } from "@/contexts/AuthContext";

import { getExchangePreview, getExchangeDisabledMessage } from "@/services/finance/exchangeService";

import { CurrencyCode } from "@/config/currencies";
import { redeemPointsAndRecordRpc } from "@/services/members/memberPointsRedeemRpcService";
import { getMemberPointsSummary, MemberPointsSummary } from "@/services/points/pointsCalculationService";
import { notifyDataMutation } from "@/services/system/dataRefreshManager";
import { logOperation } from "@/services/audit/auditLogService";
import { useCalculatorSubmit } from "@/components/calculator/useCalculatorSubmit";
import { CalculatorRedeemSection } from "@/components/calculator/CalculatorRedeemSection";

/** 桌面端支付信息列宽（ch=数字 0 宽度）：金额 ≥10ch、利润 7ch、利率 7ch；外层列变窄时仍保留该最小内容宽 */
const PAY_INFO_GRID_DESKTOP =
  "grid grid-cols-[minmax(10ch,1fr)_7ch_7ch] gap-0 items-stretch";
/** 三列 ch 宽之和 + 约略间距，避免外层列缩窄时挤压金额/利润/利率区 */
const PAY_INFO_BLOCK_MIN_W = "min-w-[calc(10ch+7ch+7ch+1.25rem)]";
const PAY_INPUT_DESKTOP_CLASS =
  "h-8 w-full min-w-[10ch] max-w-none text-center text-sm font-bold tabular-nums tracking-normal bg-background";

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

  // 积分兑换对话框
  const [isRedeemDialogOpen, setIsRedeemDialogOpen] = useState(false);
  const [isRedeemConfirmOpen, setIsRedeemConfirmOpen] = useState(false);
  const [redeemPaymentProvider, setRedeemPaymentProvider] = useState("");
  const [redeemRemark, setRedeemRemark] = useState("");
  /** 积分兑换写活动赠送用汇率；可与页面同步，也可手改 */
  const [redeemGiftRateInput, setRedeemGiftRateInput] = useState("");
  const [redeemPreviewData, setRedeemPreviewData] = useState<any>(null);

  // 会员积分摘要（从数据库实时获取，与活动数据统一）；matchedMemberId 用于 order_count 与「活动数据 → 累积次数」同一条 member_activity 行
  const [memberPointsSummary, setMemberPointsSummary] = useState<MemberPointsSummary | null>(null);
  const [isLoadingPoints, setIsLoadingPoints] = useState(false);
  const [matchedMemberId, setMatchedMemberId] = useState<string | null>(null);
  const [memberRegisteredAt, setMemberRegisteredAt] = useState<string | null>(null);

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
          getMemberPointsSummary(formData.memberCode, formData.phoneNumber, memberLookupTenantId, matchedMemberId),
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
  }, [formData.phoneNumber, formData.memberCode, memberLookupTenantId, matchedMemberId]);

  // 监听积分变化事件
  useEffect(() => {
    const handlePointsUpdated = () => {
      if (formData.phoneNumber && formData.memberCode) {
        getMemberPointsSummary(formData.memberCode, formData.phoneNumber, memberLookupTenantId, matchedMemberId)
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
  }, [formData.phoneNumber, formData.memberCode, memberLookupTenantId, matchedMemberId]);

  const feeSettings = getFeeSettings();
  const usdtFeeNum = parseFloat(usdtFee) || 0;

  const {
    isSubmitting,
    handleSubmitOrder,
    performSubmitOrder,
    nairaWarningOpen,
    setNairaWarningOpen,
    nairaWarningText,
  } = useCalculatorSubmit({
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
  });

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

  // 注册时间格式化 + 入网天数计算
  const registrationDisplay = useMemo(() => {
    if (!memberRegisteredAt) return { dateStr: '-', days: '-' };
    const d = new Date(memberRegisteredAt);
    if (isNaN(d.getTime())) return { dateStr: '-', days: '-' };
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const diffMs = Date.now() - d.getTime();
    const days = Math.max(0, Math.floor(diffMs / 86_400_000));
    return { dateStr, days: `${days}` };
  }, [memberRegisteredAt]);

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

          if (dbMember && memberLookupTenantId && !isMemberInTenant(dbMember, memberLookupTenantId)) {
            setMemberLevelZhHint(null);
            setMatchedMemberId(null);
            setMemberRegisteredAt(null);
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
            notify.error(
              t(
                "该手机号不属于当前租户，无法自动匹配；请在当前租户新建会员或使用归属本租户的号码。",
                "This phone is not in the current tenant. Create a member here or use a number registered in this tenant.",
              ),
            );
            return;
          }

        if (dbMember) {
            const z = dbMember.member_level_zh?.trim();
            setMemberLevelZhHint(z || null);
            setMatchedMemberId(dbMember.id);
            setMemberRegisteredAt(dbMember.created_at || null);
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
            setMatchedMemberId(null);
            setMemberRegisteredAt(null);
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
      setMatchedMemberId(null);
      setMemberRegisteredAt(null);
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
        if (dbMember && (!memberLookupTenantId || isMemberInTenant(dbMember, memberLookupTenantId))) {
          existingMember = { id: dbMember.id, phoneNumber: dbMember.phone_number, memberCode: dbMember.member_code } as any;
          setMatchedMemberId(dbMember.id);
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
          p_remark_locale: language === 'zh' ? 'zh' : 'en',
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
      
      // 备注文案已由服务端 redeem_points_and_record 按 p_remark_locale 写入，无需再 patch

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
        const summary = await getMemberPointsSummary(
          formData.memberCode,
          formData.phoneNumber,
          memberLookupTenantId,
          matchedMemberId,
        );
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
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 hover:bg-orange-200/50 shrink-0" aria-label="Apply amount" onClick={() => fillNairaAmount(profitAnalysis.naira[rateIndex])}>
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
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 hover:bg-emerald-200/50 shrink-0" aria-label="Apply amount" onClick={() => fillCediAmount(profitAnalysis.cedi[rateIndex])}>
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
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 hover:bg-blue-200/50 shrink-0" aria-label="Apply amount" onClick={() => fillUsdtAmount(profitAnalysis.usdt[rateIndex])}>
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
                  <Button variant="ghost" size="sm" className="h-5 w-5 p-0 hover:bg-orange-200/50" aria-label="Apply amount" onClick={() => fillNairaAmount(value)}>
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
                  <Button variant="ghost" size="sm" className="h-5 w-5 p-0 hover:bg-emerald-200/50" aria-label="Apply amount" onClick={() => fillCediAmount(value)}>
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
                  <Button variant="ghost" size="sm" className="h-5 w-5 p-0 hover:bg-blue-200/50" aria-label="Apply amount" onClick={() => fillUsdtAmount(value)}>
                    <ArrowDown className="h-3 w-3 text-blue-600" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* 第四行：支付信息(3/12，缩窄区块但保留 ch 列宽) + 会员信息(9/12) */}
      <div className={`grid gap-2 ${isMobile ? 'grid-cols-1' : 'grid-cols-1 xl:grid-cols-12 xl:items-start'}`}>
        <Card
          className={
            isMobile
              ? ""
              : `xl:col-span-3 h-fit min-w-0 self-start overflow-x-auto ${PAY_INFO_BLOCK_MIN_W}`
          }
        >
          <div className="bg-muted/50 px-3 py-1 border-b">
            <span className="text-xs font-bold text-foreground">{t("支付信息", "Payment Info")}</span>
          </div>
          {/* 桌面端：单一 grid，表头与数据列共用同一套列宽，避免 1fr 各行独立计算导致错位 */}
          {!isMobile && (
            <div className={`${PAY_INFO_GRID_DESKTOP} border-b border-border/50`}>
              <div className="border-b border-r border-border/40 bg-muted/25 px-2 py-1.5 text-[10px] font-medium text-muted-foreground">
                {t("支付金额", "Amount")}
              </div>
              <div className="flex items-center justify-center border-b border-r border-border/40 bg-muted/25 px-1 py-1.5 text-[10px] font-medium text-muted-foreground whitespace-nowrap">
                {t("利润", "Profit")}
              </div>
              <div className="flex items-center justify-center border-b border-border/40 bg-muted/25 px-1 py-1.5 text-[10px] font-medium text-muted-foreground whitespace-nowrap">
                {t("利率", "Rate")}
              </div>

              <div className="min-w-0 border-b border-r border-orange-200/30 bg-orange-50/50 p-2 dark:bg-orange-950/20">
                <Label className="mb-1 block text-[10px] font-medium text-orange-700 dark:text-orange-400">{t("支付", "Pay")} {CURRENCIES.NGN.name}</Label>
                <Input value={formData.payNaira} onChange={(e) => handlePayNairaChange(e.target.value)} onDoubleClick={() => handleDoubleClick('payNaira')} placeholder={t("输入奈拉金额", "Enter NGN amount")} className={`${PAY_INPUT_DESKTOP_CLASS} border-orange-300/50`} />
              </div>
              <div className="flex min-h-0 min-w-[7ch] flex-col items-center justify-center border-b border-r border-orange-200/30 bg-orange-50/50 px-1 py-2 dark:bg-orange-950/20">
                <span className="text-sm font-bold tabular-nums whitespace-nowrap text-success">{formData.payNaira ? profitCalculation.nairaProfitRMB : '0'}</span>
              </div>
              <div className="flex min-h-0 min-w-[7ch] flex-col items-center justify-center border-b border-orange-200/30 bg-orange-50/50 px-1 py-2 dark:bg-orange-950/20">
                <span className="text-sm font-bold tabular-nums whitespace-nowrap text-orange-600 dark:text-orange-400">{formData.payNaira ? profitCalculation.nairaRate + '%' : '0%'}</span>
              </div>

              <div className="min-w-0 border-b border-r border-emerald-200/30 bg-emerald-50/50 p-2 dark:bg-emerald-950/20">
                <Label className="mb-1 block text-[10px] font-medium text-emerald-700 dark:text-emerald-400">{t("支付", "Pay")} {CURRENCIES.GHS.name}</Label>
                <Input value={formData.payCedi} onChange={(e) => handlePayCediChange(e.target.value)} onDoubleClick={() => handleDoubleClick('payCedi')} placeholder={t("输入赛地金额", "Enter GHS amount")} className={`${PAY_INPUT_DESKTOP_CLASS} border-emerald-300/50`} />
              </div>
              <div className="flex min-h-0 min-w-[7ch] flex-col items-center justify-center border-b border-r border-emerald-200/30 bg-emerald-50/50 px-1 py-2 dark:bg-emerald-950/20">
                <span className="text-sm font-bold tabular-nums whitespace-nowrap text-success">{formData.payCedi ? profitCalculation.cediProfitRMB : '0'}</span>
              </div>
              <div className="flex min-h-0 min-w-[7ch] flex-col items-center justify-center border-b border-emerald-200/30 bg-emerald-50/50 px-1 py-2 dark:bg-emerald-950/20">
                <span className="text-sm font-bold tabular-nums whitespace-nowrap text-emerald-600 dark:text-emerald-400">{formData.payCedi ? profitCalculation.cediRate + '%' : '0%'}</span>
              </div>

              <div className="min-w-0 border-b border-r border-blue-200/30 bg-blue-50/50 p-2 dark:bg-blue-950/20">
                <Label className="mb-1 block text-[10px] font-medium text-blue-700 dark:text-blue-400">{t("支付", "Pay")} {CURRENCIES.USDT.name}</Label>
                <Input value={formData.payUsdt} onChange={(e) => handlePayUsdtChange(e.target.value)} onDoubleClick={() => handleDoubleClick('payUsdt')} placeholder={t("双击清空", "Double-click to clear")} className={`${PAY_INPUT_DESKTOP_CLASS} border-blue-300/50`} />
              </div>
              <div className="flex min-h-0 min-w-[7ch] flex-col items-center justify-center border-b border-r border-blue-200/30 bg-blue-50/50 px-1 py-2 dark:bg-blue-950/20">
                <span className="text-center text-sm font-bold tabular-nums leading-tight text-blue-600 dark:text-blue-400">
                  {formData.payUsdt ? profitCalculation.usdtProfitU : '0'}
                </span>
              </div>
              <div className="flex min-h-0 min-w-[7ch] flex-col items-center justify-center border-b border-blue-200/30 bg-blue-50/50 px-1 py-2 dark:bg-blue-950/20">
                <span className="text-sm font-bold tabular-nums whitespace-nowrap text-blue-600 dark:text-blue-400">{formData.payUsdt ? profitCalculation.usdtRate + '%' : '0%'}</span>
              </div>

              <div className="min-w-0 border-r border-purple-200/30 bg-purple-50/50 p-2 dark:bg-purple-950/20">
                <Label className="mb-1 flex items-center gap-1 text-[10px] font-medium text-purple-700 dark:text-purple-400">{t("支付BTC", "Pay BTC")} <Lock className="h-2.5 w-2.5" /></Label>
                <div className="flex h-8 min-w-[10ch] items-center justify-center rounded border bg-purple-100/50 px-1 text-sm font-bold tabular-nums tracking-normal text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">{payBtc || '—'}</div>
              </div>
              <div className="flex min-h-0 min-w-[7ch] flex-col items-center justify-center border-r border-purple-200/30 bg-purple-50/50 px-1 py-2 dark:bg-purple-950/20">
                <span className="text-center text-sm font-bold tabular-nums leading-tight text-purple-600 dark:text-purple-400">
                  {payBtc ? profitCalculation.btcProfitU : '0'}
                </span>
              </div>
              <div className="flex min-h-0 min-w-[7ch] flex-col items-center justify-center bg-purple-50/50 px-1 py-2 dark:bg-purple-950/20">
                <span className="text-sm font-bold tabular-nums whitespace-nowrap text-purple-600 dark:text-purple-400">{payBtc ? profitCalculation.btcRate + '%' : '0%'}</span>
              </div>
            </div>
          )}
          {isMobile && (
          <div className="divide-y divide-border/50">
            <div className="space-y-1.5 bg-orange-50/50 p-2.5 dark:bg-orange-950/20">
              <Label className="text-xs font-medium text-orange-700 dark:text-orange-400">{t("支付", "Pay")} {CURRENCIES.NGN.name}</Label>
              <Input value={formData.payNaira} onChange={(e) => handlePayNairaChange(e.target.value)} onDoubleClick={() => handleDoubleClick('payNaira')} placeholder={t("输入奈拉金额", "Enter NGN amount")} className="h-10 border-orange-300/50 bg-background text-center text-base font-bold tabular-nums" />
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{t("利润", "Profit")}: <span className="font-bold text-success">{formData.payNaira ? profitCalculation.nairaProfitRMB : '0'}</span></span>
                <span className="text-muted-foreground">{t("利率", "Rate")}: <span className="font-bold text-orange-600 dark:text-orange-400">{formData.payNaira ? profitCalculation.nairaRate + '%' : '0%'}</span></span>
              </div>
            </div>
            <div className="space-y-1.5 bg-emerald-50/50 p-2.5 dark:bg-emerald-950/20">
              <Label className="text-xs font-medium text-emerald-700 dark:text-emerald-400">{t("支付", "Pay")} {CURRENCIES.GHS.name}</Label>
              <Input value={formData.payCedi} onChange={(e) => handlePayCediChange(e.target.value)} onDoubleClick={() => handleDoubleClick('payCedi')} placeholder={t("输入赛地金额", "Enter GHS amount")} className="h-10 border-emerald-300/50 bg-background text-center text-base font-bold tabular-nums" />
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{t("利润", "Profit")}: <span className="font-bold text-success">{formData.payCedi ? profitCalculation.cediProfitRMB : '0'}</span></span>
                <span className="text-muted-foreground">{t("利率", "Rate")}: <span className="font-bold text-emerald-600 dark:text-emerald-400">{formData.payCedi ? profitCalculation.cediRate + '%' : '0%'}</span></span>
              </div>
            </div>
            <div className="space-y-1.5 bg-blue-50/50 p-2.5 dark:bg-blue-950/20">
              <Label className="text-xs font-medium text-blue-700 dark:text-blue-400">{t("支付", "Pay")} {CURRENCIES.USDT.name}</Label>
              <Input value={formData.payUsdt} onChange={(e) => handlePayUsdtChange(e.target.value)} onDoubleClick={() => handleDoubleClick('payUsdt')} placeholder={t("输入USDT金额", "Enter USDT")} className="h-10 border-blue-300/50 bg-background text-center text-base font-bold tabular-nums" />
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{t("利润(U)", "Profit")}: <span className="font-bold text-blue-600 dark:text-blue-400">{formData.payUsdt ? profitCalculation.usdtProfitU : '0'}</span></span>
                <span className="text-muted-foreground">{t("利率", "Rate")}: <span className="font-bold text-blue-600 dark:text-blue-400">{formData.payUsdt ? profitCalculation.usdtRate + '%' : '0%'}</span></span>
              </div>
            </div>
            <div className="space-y-1.5 bg-purple-50/50 p-2.5 dark:bg-purple-950/20">
              <div className="flex items-center gap-1">
                <Label className="text-xs font-medium text-purple-700 dark:text-purple-400">{t("支付BTC", "Pay BTC")}</Label>
                <Lock className="h-3 w-3 text-purple-400" />
              </div>
              <div className="flex h-10 min-w-[10ch] items-center justify-center rounded border bg-purple-100/50 text-base font-bold tabular-nums text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">{payBtc || '—'}</div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{t("利润(U)", "Profit")}: <span className="font-bold text-purple-600 dark:text-purple-400">{payBtc ? profitCalculation.btcProfitU : '0'}</span></span>
                <span className="text-muted-foreground">{t("利率", "Rate")}: <span className="font-bold text-purple-600 dark:text-purple-400">{payBtc ? profitCalculation.btcRate + '%' : '0%'}</span></span>
              </div>
            </div>
          </div>
          )}
        </Card>

        {/* 右侧区域 - 8/12 (必填信息 + 会员信息) */}
        <div className={isMobile ? 'space-y-2' : 'xl:col-span-9 min-w-0 space-y-2'}>
          {/* 订单信息（原必填信息 + 客户特点/来源/备注） */}
          <Card className="border-warning/30">
            <CardContent className="p-2 space-y-1.5">
              <div className={`grid gap-x-2 gap-y-1.5 ${isMobile ? 'grid-cols-1' : 'grid-cols-3'}`}>
                {/* 卡类型 */}
                <div className="flex min-w-0 items-center gap-1.5">
                  <Label className="w-16 shrink-0 text-[10px] leading-tight text-muted-foreground">{t("卡类型", "Card Type")}</Label>
                  <div className="min-w-0 flex-1">
                    <Select value={formData.cardType} onValueChange={(v) => {
                      updateFields({ cardType: v, cardMerchant: "" });
                    }}>
                      <SelectTrigger className="h-7 w-full text-xs">
                        <SelectValue placeholder={t("选择", "Select")} />
                      </SelectTrigger>
                      <SelectContent>
                        {cardsList.map((card) => (
                          <SelectItem key={card.id} value={card.name}>{card.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {/* 卡商 */}
                <div className="flex min-w-0 items-center gap-1.5">
                  <Label className="w-16 shrink-0 text-[10px] leading-tight text-muted-foreground">{t("卡商名称", "Vendor")}</Label>
                  <div className="min-w-0 flex-1">
                    <Select value={formData.cardMerchant} onValueChange={(v) => updateField('cardMerchant', v)}>
                      <SelectTrigger className="h-7 w-full text-xs">
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
                </div>
                {/* 代付商家 */}
                <div className="flex min-w-0 items-center gap-1.5">
                  <div className="flex w-16 shrink-0 items-center gap-0.5">
                    <Label className="text-[10px] leading-tight text-muted-foreground">{t("代付商家", "Agent")}</Label>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="h-3 w-3 shrink-0 cursor-help text-muted-foreground" />
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-[240px] text-xs">
                          {formData.payUsdt && parseFloat(formData.payUsdt) > 0
                            ? t("支付USDT时，仅显示商家名称中含「USDT」的代付商家", "When paying USDT, only providers with 'USDT' in name are shown")
                            : t("选择卡商后，显示该卡商关联的代付商家", "Shows providers linked to selected card merchant")}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <div className="min-w-0 flex-1">
                    <Select value={formData.paymentAgent} onValueChange={(v) => updateField('paymentAgent', v)}>
                      <SelectTrigger className="h-7 w-full text-xs">
                        <SelectValue placeholder={t("选择", "Select")} />
                      </SelectTrigger>
                      <SelectContent>
                        {(() => {
                          let availableProviders: { id: string; name: string }[];
                          const payUsdtVal = formData.payUsdt && parseFloat(formData.payUsdt) > 0;
                          if (payUsdtVal) {
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
                </div>
                {/* 电话号码 */}
                <div className="flex min-w-0 items-center gap-1.5">
                  <Label className="w-16 shrink-0 text-[10px] leading-tight text-muted-foreground">{t("电话号码", "Phone")}</Label>
                  <Input
                    value={formData.phoneNumber}
                    onChange={(e) => handlePhoneNumberChange(e.target.value)}
                    placeholder={t("输入电话", "Enter phone")}
                    maxLength={18}
                    className="h-7 min-w-0 flex-1 text-xs"
                  />
                </div>
                {/* 银行卡 */}
                <div className="flex min-w-0 items-center gap-1.5">
                  <Label className="w-16 shrink-0 text-[10px] leading-tight text-muted-foreground">{t("银行卡", "Bank Card")}</Label>
                  <div className="flex min-w-0 flex-1 gap-1">
                    <Input
                      value={formData.bankCard}
                      onChange={(e) => updateField('bankCard', e.target.value)}
                      onBlur={(e) => validateBankCard(e.target.value)}
                      placeholder={t("卡号 银行", "Card# Bank")}
                      className={`h-7 min-w-0 flex-1 text-xs ${bankCardError ? 'border-destructive' : ''}`}
                    />
                    <Button variant="outline" size="sm" className="h-7 w-7 shrink-0 p-0" aria-label="Copy" onClick={copyBankCard}>
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                {/* 客户特点 */}
                <div className="flex min-w-0 items-center gap-1.5">
                  <Label className="w-16 shrink-0 text-[10px] leading-tight font-medium text-primary dark:text-primary">{t("客户特点", "Feature")}</Label>
                  <Input
                    value={formData.customerFeature}
                    onChange={(e) => updateField("customerFeature", e.target.value)}
                    placeholder={t("输入", "Enter")}
                    className="h-7 min-w-0 flex-1 text-xs border-primary/25 bg-background focus-visible:ring-primary/35"
                  />
                </div>
                {/* 来源 */}
                <div className="flex min-w-0 items-center gap-1.5">
                  <Label className="w-16 shrink-0 text-[10px] leading-tight font-medium text-primary dark:text-primary">{t("来源", "Source")}</Label>
                  <div className="min-w-0 flex-1">
                    <Select value={formData.customerSource || undefined} onValueChange={(v) => updateField("customerSource", v)}>
                      <SelectTrigger className="h-7 w-full text-xs border-primary/25 focus:ring-primary/35">
                        <SelectValue placeholder={t("选择来源", "Select source")}>
                          {customerSources.find((s) => s.id === formData.customerSource)?.name || t("选择", "Select")}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {customerSources.map((source) => (
                          <SelectItem key={source.id} value={source.id}>{source.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
              {/* 备注区域 */}
              <div className={`grid gap-2 ${isMobile ? "grid-cols-1" : "grid-cols-2"}`}>
                <div className={`flex ${isMobile ? "flex-col gap-1" : "items-start gap-1.5"}`}>
                  <Label className={`text-[10px] shrink-0 font-medium text-primary dark:text-primary ${isMobile ? "" : "w-16 pt-1.5"}`}>
                    {t("订单备注", "Order Note")}
                  </Label>
                  <Textarea
                    value={formData.remarkOrder}
                    onChange={(e) => updateField("remarkOrder", e.target.value)}
                    placeholder={t("提交后同步到订单管理", "Syncs to order management")}
                    className="flex-1 h-[44px] min-h-[44px] resize-none text-xs border-primary/25 bg-background focus-visible:ring-primary/35"
                  />
                </div>
                <div className={`flex ${isMobile ? "flex-col gap-1" : "items-start gap-1.5"}`}>
                  <Label className={`text-[10px] shrink-0 font-medium text-primary dark:text-primary ${isMobile ? "" : "w-16 pt-1.5"}`}>
                    {t("会员备注", "Member Note")}
                  </Label>
                  <Textarea
                    value={formData.remarkMember}
                    onChange={(e) => updateField("remarkMember", e.target.value)}
                    placeholder={t("提交后同步到会员管理", "Syncs to member management")}
                    className="flex-1 h-[44px] min-h-[44px] resize-none text-xs border-primary/25 bg-background focus-visible:ring-primary/35"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 会员信息区域 — 3列×3行 */}
          <Card className="overflow-x-auto overflow-y-visible">
          <div className="bg-muted/50 px-3 py-1 border-b flex items-center justify-between">
            <span className="text-xs font-bold text-foreground">{t("会员信息", "Member Info")}</span>
          </div>
          <CardContent className="p-2">
            <div className={`grid gap-x-3 gap-y-1.5 ${isMobile ? 'grid-cols-1' : 'grid-cols-3'}`}>
              {/* Row 1: 会员编号 | 会员等级 | 累积次数 */}
              <div className="flex items-center gap-1.5">
                <Label className="text-[10px] w-16 shrink-0 text-muted-foreground">{t("会员编号", "Member ID")}</Label>
                <Input
                  readOnly
                  value={formData.memberCode}
                  placeholder={t("自动生成", "Auto")}
                  className="h-6 flex-1 text-[11px] bg-muted/50 border-border/60 font-mono"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <Label className="text-[10px] w-16 shrink-0 text-muted-foreground">{t("会员等级", "Level")}</Label>
                <Input
                  readOnly
                  value={
                    displayMemberLevelLabel(formData.memberLevel, memberLevelZhHint, language) ||
                    (formData.phoneNumber.length >= 8 ? t("新会员→最低档", "New → lowest") : "")
                  }
                  title={t("等级由累计积分自动计算", "Level auto-calculated")}
                  className="h-6 flex-1 text-[11px] bg-muted/50 border-border/60"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <Label
                  className="text-[10px] w-16 shrink-0 text-muted-foreground"
                  title={t("有效已完成订单累计", "Completed orders accumulated")}
                >
                  {t("累积次数", "Orders")}
                </Label>
                <div className="h-6 flex-1 flex items-center justify-end px-2 bg-muted/50 rounded border text-sm font-medium tabular-nums">
                  {isLoadingPoints ? '...' : (memberPointsSummary?.orderCount || 0)} {t("次", "x")}
                </div>
              </div>
              {/* Row 2: 推荐奖励 | 客户积分 | 币种偏好 */}
              <div className="flex items-center gap-1.5">
                <Label className="text-[10px] w-16 shrink-0 text-muted-foreground">{t("推荐奖励", "Referral")}</Label>
                <div className="h-6 flex-1 flex items-center justify-end px-2 bg-muted/50 rounded border text-sm font-medium tabular-nums">
                  {isLoadingPoints ? '...' : getReferralRewardPoints()}
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <Label className="text-[10px] w-16 shrink-0 text-muted-foreground">{t("客户积分", "Points")}</Label>
                <div className={`h-6 flex-1 flex items-center justify-end px-2 bg-muted/50 rounded border text-sm font-bold tabular-nums ${getCustomerPoints() < 0 ? 'text-destructive' : 'text-foreground'}`}>
                  {isLoadingPoints ? '...' : getCustomerPoints()}
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <Label className="text-[10px] w-16 shrink-0 text-muted-foreground">{t("币种偏好", "Currency")}</Label>
                <div className="h-6 flex-1 flex items-center px-2 bg-muted/50 rounded border text-[11px] truncate">
                  {currencyPreference}
                </div>
              </div>
              {/* Row 3: 注册时间 | 入网时长 | 常交易卡 */}
              <div className="flex items-center gap-1.5">
                <Label className="text-[10px] w-16 shrink-0 text-muted-foreground">{t("注册时间", "Registered")}</Label>
                <div className="h-6 flex-1 flex items-center px-2 bg-muted/50 rounded border text-[11px] tabular-nums">
                  {registrationDisplay.dateStr}
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <Label className="text-[10px] w-16 shrink-0 text-muted-foreground">{t("入网时长", "Days")}</Label>
                <div className="h-6 flex-1 flex items-center justify-end px-2 bg-muted/50 rounded border text-sm font-medium tabular-nums">
                  {registrationDisplay.days !== '-' ? `${registrationDisplay.days} ${t("天", "d")}` : '-'}
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <Label className="text-[10px] w-16 shrink-0 text-muted-foreground leading-none">{t("常交易卡", "Cards")}</Label>
                <div className="flex-1 h-6 flex flex-nowrap gap-1 items-center overflow-x-auto overflow-y-hidden rounded-md border border-border/60 bg-muted/30 px-1.5 [scrollbar-width:thin]">
                  {formData.selectedCommonCards.length === 0 ? (
                    <span className="text-[11px] text-muted-foreground truncate min-w-0">
                      {t("暂无", "None")}
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
            </div>
          </CardContent>
          </Card>

          {/* 积分兑换 + 提交订单按钮 */}
          <div className={`flex ${isMobile ? 'flex-col' : 'flex-row'} items-center justify-center gap-3 pt-1`}>
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
        </div>
      </div>

      <CalculatorRedeemSection
        t={t}
        formMemberCode={formData.memberCode}
        formPhoneNumber={formData.phoneNumber}
        isRedeemDialogOpen={isRedeemDialogOpen}
        setIsRedeemDialogOpen={setIsRedeemDialogOpen}
        redeemPreviewData={redeemPreviewData}
        redeemGiftRateInput={redeemGiftRateInput}
        setRedeemGiftRateInput={setRedeemGiftRateInput}
        getSyncedGiftRate={getSyncedGiftRate}
        redeemPaymentProvider={redeemPaymentProvider}
        setRedeemPaymentProvider={setRedeemPaymentProvider}
        redeemRemark={redeemRemark}
        setRedeemRemark={setRedeemRemark}
        paymentProvidersList={paymentProvidersList}
        isRedeemConfirmOpen={isRedeemConfirmOpen}
        setIsRedeemConfirmOpen={setIsRedeemConfirmOpen}
        onConfirmRedeem={handleConfirmRedeem}
        nairaWarningOpen={nairaWarningOpen}
        onNairaWarningOpenChange={setNairaWarningOpen}
        nairaWarningText={nairaWarningText}
        onNairaSubmitAnyway={() => void performSubmitOrder()}
      />
    </div>
  );
}
