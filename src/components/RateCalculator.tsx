// 汇率计算器组件 - 优化布局设计
// 核心策略：面值汇率放大 + 利润分析对齐 + 备注直接显示
import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { toast } from "sonner";
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
import { getPointsLedger } from "@/stores/pointsLedgerStore";
import { getPointsSettings } from "@/stores/pointsSettingsStore";
import { getMemberLastResetTime } from "@/stores/pointsAccountStore";
import { getCopySettings, generateEnglishCopyText } from "@/components/CopySettingsTab";
import { useAuth } from "@/contexts/AuthContext";
import { getReferralRelations } from "@/stores/referralStore";
import { getExchangePreview, canExchange, getExchangeDisabledMessage, getActiveActivityType } from "@/services/exchangeService";
import { getExchangeRateFormData } from "@/stores/exchangeRateFormStore";
import { CurrencyCode } from "@/config/currencies";
import { supabase } from "@/integrations/supabase/client";
import { getMemberPointsSummary, MemberPointsSummary } from "@/services/pointsCalculationService";

// 会员等级选项
const memberLevels = ["A", "B", "C", "D"];

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
}: RateCalculatorProps) {
  trackRender('RateCalculator');
  const { t } = useLanguage();
  const { employee } = useAuth();
  const isMobile = useIsMobile();
  
  // 使用独立的表单状态
  const { formData, updateField, updateFields, clearForm } = useCalculatorForm(calcId);
  
  // Dynamic USDT rate: use bid when payUsdt has value, ask when empty
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
  const [bankCardError, setBankCardError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // 积分兑换对话框
  const [isRedeemDialogOpen, setIsRedeemDialogOpen] = useState(false);
  const [isRedeemConfirmOpen, setIsRedeemConfirmOpen] = useState(false);
  const [redeemPaymentProvider, setRedeemPaymentProvider] = useState("");
  const [redeemRemark, setRedeemRemark] = useState("");
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
      try {
        const summary = await getMemberPointsSummary(formData.memberCode, formData.phoneNumber);
        if (isMounted) setMemberPointsSummary(summary);
      } catch (error) {
        console.error('Failed to fetch member points summary:', error);
        if (isMounted) setMemberPointsSummary(null);
      } finally {
        if (isMounted) setIsLoadingPoints(false);
      }
    }, 800);
    
    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
    };
  }, [formData.phoneNumber, formData.memberCode]);

  // 监听积分变化事件
  useEffect(() => {
    const handlePointsUpdated = () => {
      if (formData.phoneNumber && formData.memberCode) {
        getMemberPointsSummary(formData.memberCode, formData.phoneNumber)
          .then(setMemberPointsSummary)
          .catch(console.error);
      }
    };
    
    window.addEventListener('activity-gifts-updated', handlePointsUpdated);
    window.addEventListener('points-updated', handlePointsUpdated);
    return () => {
      window.removeEventListener('activity-gifts-updated', handlePointsUpdated);
      window.removeEventListener('points-updated', handlePointsUpdated);
    };
  }, [formData.phoneNumber, formData.memberCode]);

  const feeSettings = getFeeSettings();
  const usdtFeeNum = parseFloat(usdtFee) || 0;

  // 现金专属（只读计算）
  const cashSpecial = useMemo(() => {
    const rate = parseFloat(formData.cardRate) || 0;
    return (rate * usdtRate).toFixed(2);
  }, [formData.cardRate, usdtRate]);

  // 支付BTC计算
  const payBtc = useMemo(() => {
    const usdt = parseFloat(formData.payUsdt) || 0;
    if (usdt > 0 && btcPrice > 0) {
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
    
    // 利润分析USDT始终使用买入价(bid)
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
          const { supabase } = await import('@/integrations/supabase/client');
          const { data: dbMember, error } = await supabase
            .from('members')
            .select('*')
            .eq('phone_number', cleanedValue)
            .maybeSingle();
          
          if (error) {
            console.error('查询会员失败:', error);
            return;
          }
          
        if (dbMember) {
            updateFields({
              memberCode: dbMember.member_code,
              memberLevel: dbMember.member_level || 'D',
              selectedCommonCards: dbMember.common_cards || [],
              customerFeature: dbMember.customer_feature || "",
              bankCard: dbMember.bank_card || "",
              remarkMember: dbMember.remark || "",
              currencyPreferenceList: dbMember.currency_preferences || [],
              customerSource: dbMember.source_id || "",
            });
            toast.success(t(`已匹配到会员: ${dbMember.member_code}`, `Member matched: ${dbMember.member_code}`));
          } else {
            const newMemberCode = generateMemberId();
            updateFields({
              memberCode: newMemberCode,
              memberLevel: "D",
              selectedCommonCards: [],
              customerFeature: "",
              bankCard: "",
              remarkMember: "",
              currencyPreferenceList: [],
              customerSource: "",
            });
            toast.info(t(`新会员，已生成编号: ${newMemberCode}`, `New member, code generated: ${newMemberCode}`));
          }
        } catch (err) {
          console.error('查询会员出错:', err);
        }
      }, 600);
    } else {
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
  }, [updateField, updateFields]);

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
    toast.success(t(`已填入支付奈拉: ${rounded}`, `Filled Naira: ${rounded}`));
  };

  const fillCediAmount = (value: string) => {
    const num = parseFloat(value) || 0;
    const rounded = Math.floor(num);
    updateFields({ payCedi: rounded.toString(), payNaira: "", payUsdt: "" });
    toast.success(t(`已填入支付赛地: ${rounded}`, `Filled Cedi: ${rounded}`));
  };

  const fillUsdtAmount = (value: string) => {
    const num = parseFloat(value) || 0;
    const rounded = Math.floor(num);
    updateFields({ payUsdt: rounded.toString(), payNaira: "", payCedi: "" });
    toast.success(t(`已填入支付USDT: ${rounded}`, `Filled USDT: ${rounded}`));
  };

  // 双击清空
  const handleDoubleClick = (field: keyof typeof formData) => {
    updateField(field, "" as any);
  };

  // 复制银行卡
  const copyBankCard = () => {
    if (formData.bankCard) {
      navigator.clipboard.writeText(formData.bankCard);
      toast.success(t("复制成功", "Copy successful"));
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
    
    const member = findMemberByPhone(formData.phoneNumber);
    const preferredCurrencies = member?.preferredCurrency || (member as any)?.currency_preferences || [];
    const preview = getExchangePreview(points, preferredCurrencies);
    
    if (!preview.canExchange) {
      showSubmissionError(preview.message);
      return;
    }
    
    setRedeemPreviewData({
      points,
      member,
      preview,
    });
    setRedeemPaymentProvider(formData.paymentAgent || "");
    setRedeemRemark("");
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
    if (currency === "NGN") {
      // NGN金额除以汇率得到RMB价值，手续费也要除以汇率
      return amount / nairaRate + fee;
    } else if (currency === "GHS") {
      // GHS金额乘以汇率得到RMB价值
      return amount * cediRate + fee;
    } else if (currency === "USDT") {
      // USDT金额乘以汇率得到RMB价值
      return amount * usdtRate + fee;
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
    const rate = exchangeCurrency === 'NGN' ? nairaRate : exchangeCurrency === 'GHS' ? cediRate : usdtRate;
    const giftValue = calculateRedeemGiftValue(exchangeCurrency, exchangeAmount, rate, fee);
    
    let existingMember = findMemberByPhone(formData.phoneNumber);
    // 内存中未找到时，直接查数据库兜底
    if (!existingMember?.id) {
      try {
        const { data: dbMember } = await supabase
          .from('members')
          .select('id, phone_number, member_code')
          .eq('phone_number', formData.phoneNumber)
          .maybeSingle();
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
      // 使用数据库 RPC 原子化处理积分兑换
      // 这会同时：1. 重置积分账户 2. 插入负积分流水 3. 创建赠送记录 4. 更新会员活动统计
      const { data: result, error } = await supabase.rpc('redeem_points_and_record', {
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
        p_creator_name: employee?.real_name || '未知',
      });
      
      if (error) {
        console.error('RPC error:', error);
        throw error;
      }
      
      const rpcResult = result as any;
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
        const redeemRemark = `积分兑换: ${redeemPreviewData.points}积分 → ${exchangeAmount.toLocaleString()} ${exchangeCurrency}`;
        try {
          const { error: remarkErr } = await supabase.from('activity_gifts').update({ remark: redeemRemark }).eq('id', rpcResult.gift_id);
          if (remarkErr) {
            console.error('Failed to update gift remark, retrying:', remarkErr);
            // 重试一次
            const { error: retryErr } = await supabase.from('activity_gifts').update({ remark: redeemRemark }).eq('id', rpcResult.gift_id);
            if (retryErr) console.error('Retry failed:', retryErr);
          }
        } catch (remarkError) {
          console.error('Gift remark update exception:', remarkError);
        }
      }

      // 记录赠送余额变动到商家结算账本
      if (redeemPaymentProvider && giftValue > 0 && rpcResult.gift_id) {
        try {
          const { logGiftBalanceChange } = await import('@/services/balanceLogService');
          await logGiftBalanceChange({
            providerName: redeemPaymentProvider,
            giftValue: giftValue,
            giftId: rpcResult.gift_id,
            phoneNumber: formData.phoneNumber,
            operatorId: employee?.id || undefined,
            operatorName: employee?.real_name || undefined,
          });
          window.dispatchEvent(new CustomEvent('ledger-updated'));
        } catch (e) {
          console.error('[RateCalculator] Failed to log gift balance change:', e);
        }
      }
      
      toast.success(t(`兑换成功！已赠送 ${exchangeAmount.toLocaleString()} ${exchangeCurrency}`, `Redeemed! Gifted ${exchangeAmount.toLocaleString()} ${exchangeCurrency}`));
      
      // 记录积分兑换操作日志 - 使用 points_redemption 模块
      try {
        const { logOperation } = await import('@/stores/auditLogStore');
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
        const summary = await getMemberPointsSummary(formData.memberCode, formData.phoneNumber);
        setMemberPointsSummary(summary);
      }
      
      // 触发积分更新事件
      window.dispatchEvent(new CustomEvent('points-updated'));
      window.dispatchEvent(new CustomEvent('activity-gifts-updated'));
      
      setIsRedeemConfirmOpen(false);
      setIsRedeemDialogOpen(false);
    } catch (error) {
      console.error('Redemption failed:', error);
      showSubmissionError(t("兑换失败，请重试", "Redemption failed, please retry"));
    }
  };

  // 自动复制功能 - 生成完整英文模板（接收确定的积分值）
  const performAutoCopy = async (phone: string, memberCode: string, currency: string, amount: number, earnedPoints: number) => {
    try {
      // 🔧 性能优化：并行获取复制设置和积分数据（使用显式参数避免闭包问题）
      const [settingsModule, latestPointsSummary, activitySettingsData] = await Promise.all([
        import('@/components/CopySettingsTab').then(m => m.refreshCopySettings()),
        getMemberPointsSummary(memberCode, phone),
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
      
      // 如果没有活动开启，使用简化版复制
      if (activityType === 'none') {
        const simpleText = `${phone} - ${amount.toLocaleString()} ${currency}${formData.bankCard ? ` - ${formData.bankCard}` : ''}`;
        await navigator.clipboard.writeText(simpleText);
        toast.info(t("已自动复制交易信息到剪贴板", "Transaction info copied to clipboard"));
        return;
      }
      
      const totalPoints = latestPointsSummary.remainingPoints;
      const referralPoints = latestPointsSummary.referralRewardPoints;
      const consumptionPoints = latestPointsSummary.consumptionReward;
      
      // 计算可兑换金额
      let redeemableAmount = '0 ' + currency;
      if (activityType === 'activity2' && activitySettings.activity2) {
        const rate = currency === 'NGN' ? activitySettings.activity2.pointsToNGN :
                     currency === 'GHS' ? activitySettings.activity2.pointsToGHS :
                     activitySettings.activity2.pointsToUSDT || 0;
        redeemableAmount = `${(totalPoints * rate).toLocaleString()} ${currency}`;
      } else {
        const rewardAmount = getRewardAmountByPointsAndCurrency(totalPoints, currency as any);
        redeemableAmount = `${rewardAmount.toLocaleString()} ${currency}`;
      }
      
      // 构建奖励梯度
      const rewardTiers = activitySettings.accumulatedRewardTiers.map(tier => ({
        range: tier.maxPoints === null ? `≥${tier.minPoints}` : `${tier.minPoints}-${tier.maxPoints}`,
        ngn: tier.rewardAmountNGN || 0,
        ghs: tier.rewardAmountGHS || 0,
        usdt: tier.rewardAmountUSDT || 0,
      }));
      
      // 生成复制文本 - 使用传入的 earnedPoints（来自订单创建的确定值）
      const copyText = generateEnglishCopyText({
        phoneNumber: phone,
        memberCode: formData.memberCode,  // 🔧 新增：传递会员编号用于复制文本
        earnedPoints,  // 🔧 使用传入的确定积分值
        totalPoints: totalPoints,
        referralPoints,
        consumptionPoints,
        redeemableAmount,
        currency,
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
        toast.info(t("已自动复制积分信息到剪贴板", "Points info copied to clipboard"));
        // 更新本地状态以保持UI一致
        setMemberPointsSummary(latestPointsSummary);
      }
    } catch (error) {
      console.error('Auto copy failed:', error);
      // 回退到简单版本
      const simpleText = `${phone} - ${amount.toLocaleString()} ${currency}${formData.bankCard ? ` - ${formData.bankCard}` : ''}`;
      try {
        await navigator.clipboard.writeText(simpleText);
      } catch {
        const ta = document.createElement('textarea');
        ta.value = simpleText;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
    }
  };

  // 提交订单
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
    
    // 验证奈拉输入是否可能是人民币金额（防止用户误输入）
    // 🔧 防错机制1：加强阈值检测，使用 cardWorth * 50 作为更严格的阈值
    if (formData.payNaira) {
      const actualPaidNaira = parseFloat(formData.payNaira);
      const cardRate = parseFloat(formData.cardRate) || 0;
      const cardWorthRMB = parseFloat(formData.cardValue) * cardRate;
      
      // 🔧 更严格的检测：如果实付金额 < 卡价值 × 50，几乎可以确定是误输入
      // 典型情况：卡价值100*6=600RMB，正常奈拉应该是600*205=123000
      // 阈值：600*50=30000，任何低于这个值的输入都极其可疑
      if (actualPaidNaira > 0 && actualPaidNaira < cardWorthRMB * 50 && cardWorthRMB > 0) {
        const estimatedCorrectNaira = Math.round(cardWorthRMB * nairaRate * 0.95);
        const ratio = actualPaidNaira / cardWorthRMB;
        const confirmed = window.confirm(
          t(
            `⚠️ 严重警告：实付金额异常！\n\n` +
            `您输入的实付奈拉为: ${actualPaidNaira.toLocaleString()}\n` +
            `此卡价值为: ${cardWorthRMB.toFixed(2)} RMB\n` +
            `比例: ${ratio.toFixed(1)}（正常应为 ${nairaRate} 左右）\n\n` +
            `🚨 这看起来像是人民币金额，不是奈拉金额！\n\n` +
            `提示：奈拉金额通常应该是人民币的 ${nairaRate} 倍左右\n` +
            `本单参考奈拉金额约: ${estimatedCorrectNaira.toLocaleString()}\n\n` +
            `如果确定输入正确，请点击"确定"继续提交。\n` +
            `如果输入错误，请点击"取消"修改。`,
            `⚠️ Serious Warning: Abnormal payment amount!\n\n` +
            `You entered Naira amount: ${actualPaidNaira.toLocaleString()}\n` +
            `Card value: ${cardWorthRMB.toFixed(2)} RMB\n` +
            `Ratio: ${ratio.toFixed(1)} (should be around ${nairaRate})\n\n` +
            `🚨 This looks like RMB amount, not Naira!\n\n` +
            `Tip: Naira amount should typically be ${nairaRate}x of RMB.\n` +
            `Reference Naira for this order: ${estimatedCorrectNaira.toLocaleString()}\n\n` +
            `Click OK to proceed if the input is correct.\n` +
            `Click Cancel to modify.`
          )
        );
        if (!confirmed) return;
      }
    }
    
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

      const existingMember = findMemberByPhone(formData.phoneNumber);
      if (existingMember) {
        memberId = existingMember.id;
        finalMemberCode = existingMember.memberCode;
        
        await updateMemberByPhone(formData.phoneNumber, {
          level: formData.memberLevel || existingMember.level,
          commonCards: formData.selectedCommonCards.length > 0 ? formData.selectedCommonCards : existingMember.commonCards,
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
          level: formData.memberLevel || "D",
          commonCards: formData.selectedCommonCards,
          customerFeature: formData.customerFeature,
          bankCard: formData.bankCard,
          remark: formData.remarkMember,
          preferredCurrency: detectedCurrency ? [detectedCurrency] : [],
          sourceId: formData.customerSource,
          recorderId: employee?.id,
        });
        if (newMember) memberId = newMember.id;
      }

      const orderData = {
        createdAt: new Date().toLocaleString('zh-CN'),
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
        salesPerson: employee?.real_name || '未知',
        remark: formData.remarkOrder,
      };

      // 🔧 修复竞态条件：等待订单创建完成并获取确定的积分值
      const orderResult = await addOrder(orderData, memberId, employee?.id, finalMemberCode);
      
      if (memberId && detectedCurrency) {
        const { batchUpdateMemberActivityAsync } = await import('@/hooks/useMemberActivity');
        batchUpdateMemberActivityAsync({
          memberId,
          phoneNumber: formData.phoneNumber,
          accumulatedAmount: { currency: detectedCurrency, amount: actualPaid },
          profitAmount: profit !== 0 ? profit : undefined,
          incrementOrderCount: true,
        });
      }
      
      toast.success(t("订单提交成功", "Order submitted successfully"));
      
      // 🔧 优化：捕获当前值避免清理表单后闭包失效
      const capturedPhone = formData.phoneNumber;
      const capturedMemberCode = formData.memberCode;
      
      // 复制和清理并行执行，提高响应速度
      const copyPromise = (orderResult.order && detectedCurrency) 
        ? performAutoCopy(capturedPhone, capturedMemberCode, detectedCurrency, actualPaid, orderResult.earnedPoints)
        : Promise.resolve();
      
      await Promise.all([copyPromise, clearForm()]);
    } finally {
      setIsSubmitting(false);
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
      {isMobile ? (
        /* ===== 移动端：垂直布局，面值和汇率各占一行 ===== */
        <div className="space-y-2">
          {/* 卡片面值 */}
          <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/30">
            <CardContent className="p-3">
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <Label className="text-xs font-bold text-primary mb-1.5 block">{t("卡片面值", "Card Value")}</Label>
                  <Input 
                    value={formData.cardValue} 
                    onChange={(e) => updateField('cardValue', e.target.value)}
                    onDoubleClick={(e) => { e.stopPropagation(); handleDoubleClick('cardValue'); }}
                    placeholder={t("输入面值", "Enter value")}
                    className="h-12 text-2xl font-black text-center bg-background/90 border-primary/40 focus:border-primary"
                  />
                </div>
                <div className="grid grid-cols-2 gap-1 shrink-0">
                  {quickAmounts.slice(0, 8).map((amount, index) => (
                    editingAmountIndex === index ? (
                      <Input
                        key={index}
                        value={amount}
                        onChange={(e) => onQuickAmountChange(index, e.target.value)}
                        onBlur={() => setEditingAmountIndex(null)}
                        onKeyDown={(e) => e.key === 'Enter' && setEditingAmountIndex(null)}
                        autoFocus
                        className="h-7 w-12 text-xs text-center p-0"
                      />
                    ) : (
                      <Button
                        key={index}
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-xs hover:bg-primary/20 border-primary/30 min-w-[48px]"
                        onClick={() => updateField('cardValue', amount)}
                        onDoubleClick={(e) => { e.stopPropagation(); setEditingAmountIndex(index); }}
                      >
                        {amount}
                      </Button>
                    )
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 卡片汇率 */}
          <Card className="bg-gradient-to-br from-success/5 to-success/10 border-success/30">
            <CardContent className="p-3">
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <Label className="text-xs font-bold text-success mb-1.5 block">{t("卡片汇率", "Card Rate")}</Label>
                  <Input 
                    value={formData.cardRate} 
                    onChange={(e) => updateField('cardRate', e.target.value)}
                    onDoubleClick={(e) => { e.stopPropagation(); handleDoubleClick('cardRate'); }}
                    placeholder={t("输入汇率", "Enter rate")}
                    className="h-12 text-2xl font-black text-center bg-background/90 border-success/40 focus:border-success"
                  />
                </div>
                <div className="grid grid-cols-2 gap-1 shrink-0">
                  {quickRates.slice(0, 8).map((rate, index) => (
                    editingRateIndex === index ? (
                      <Input
                        key={index}
                        value={rate}
                        onChange={(e) => onQuickRateChange(index, e.target.value)}
                        onBlur={() => setEditingRateIndex(null)}
                        onKeyDown={(e) => e.key === 'Enter' && setEditingRateIndex(null)}
                        autoFocus
                        className="h-7 w-12 text-xs text-center p-0"
                      />
                    ) : (
                      <Button
                        key={index}
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-xs hover:bg-success/20 border-success/30 min-w-[48px]"
                        onClick={() => updateField('cardRate', rate)}
                        onDoubleClick={(e) => { e.stopPropagation(); setEditingRateIndex(index); }}
                      >
                        {rate}
                      </Button>
                    )
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        /* ===== 桌面端：并排布局 ===== */
        <div className="grid grid-cols-2 gap-2">
        {/* 卡片面值 - 放大版 */}
        <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/30">
          <CardContent className="p-2 sm:p-3">
            <div className="flex items-center justify-between mb-2">
              <Label className="text-[10px] sm:text-xs font-bold text-primary">{t("卡片面值", "Card Value")}</Label>
              <div className="flex gap-1 flex-wrap justify-end max-w-[70%]">
                {quickAmounts.slice(0, 8).map((amount, index) => (
                  editingAmountIndex === index ? (
                    <Input
                      key={index}
                      value={amount}
                      onChange={(e) => onQuickAmountChange(index, e.target.value)}
                      onBlur={() => setEditingAmountIndex(null)}
                      onKeyDown={(e) => e.key === 'Enter' && setEditingAmountIndex(null)}
                      autoFocus
                      className="h-5 sm:h-6 w-10 sm:w-12 text-[10px] sm:text-xs text-center p-0"
                    />
                  ) : (
                    <Button
                      key={index}
                      variant="outline"
                      size="sm"
                      className="min-h-11 min-w-11 px-2 text-[10px] sm:text-xs hover:bg-primary/20 border-primary/30 touch-manipulation sm:min-h-0 sm:min-w-[32px] sm:h-5 sm:px-1.5"
                      onClick={() => updateField('cardValue', amount)}
                      onDoubleClick={(e) => { e.stopPropagation(); setEditingAmountIndex(index); }}
                    >
                      {amount}
                    </Button>
                  )
                ))}
              </div>
            </div>
            <Input 
              value={formData.cardValue} 
              onChange={(e) => updateField('cardValue', e.target.value)}
              onDoubleClick={(e) => { e.stopPropagation(); handleDoubleClick('cardValue'); }}
              placeholder={t("输入面值", "Enter value")}
              className="h-10 sm:h-12 text-xl sm:text-2xl font-black text-center bg-background/90 border-primary/40 focus:border-primary"
            />
          </CardContent>
        </Card>

        {/* 卡片汇率 - 放大版 */}
        <Card className="bg-gradient-to-br from-success/5 to-success/10 border-success/30">
          <CardContent className="p-2 sm:p-3">
            <div className="flex items-center justify-between mb-2">
              <Label className="text-[10px] sm:text-xs font-bold text-success">{t("卡片汇率", "Card Rate")}</Label>
              <div className="flex gap-1 flex-wrap justify-end max-w-[70%]">
                {quickRates.slice(0, 8).map((rate, index) => (
                  editingRateIndex === index ? (
                    <Input
                      key={index}
                      value={rate}
                      onChange={(e) => onQuickRateChange(index, e.target.value)}
                      onBlur={() => setEditingRateIndex(null)}
                      onKeyDown={(e) => e.key === 'Enter' && setEditingRateIndex(null)}
                      autoFocus
                      className="h-5 sm:h-6 w-10 sm:w-12 text-[10px] sm:text-xs text-center p-0"
                    />
                  ) : (
                    <Button
                      key={index}
                      variant="outline"
                      size="sm"
                      className="min-h-11 min-w-11 px-2 text-[10px] sm:text-xs hover:bg-success/20 border-success/30 touch-manipulation sm:min-h-0 sm:min-w-[32px] sm:h-5 sm:px-1.5"
                      onClick={() => updateField('cardRate', rate)}
                      onDoubleClick={(e) => { e.stopPropagation(); setEditingRateIndex(index); }}
                    >
                      {rate}
                    </Button>
                  )
                ))}
              </div>
            </div>
            <Input 
              value={formData.cardRate} 
              onChange={(e) => updateField('cardRate', e.target.value)}
              onDoubleClick={(e) => { e.stopPropagation(); handleDoubleClick('cardRate'); }}
              placeholder={t("输入汇率", "Enter rate")}
              className="h-10 sm:h-12 text-xl sm:text-2xl font-black text-center bg-background/90 border-success/40 focus:border-success"
            />
          </CardContent>
        </Card>
      </div>
      )}

      {/* 第二行：利润分析 */}
      {isMobile ? (
        /* ===== 移动端：垂直卡片布局 ===== */
        <Card className="overflow-hidden">
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
        <Card className="overflow-hidden">
          <div className="divide-y divide-border/50 overflow-x-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
            <div className="grid grid-cols-6 bg-muted/50 min-w-[360px]">
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
            <div className="grid grid-cols-6 bg-orange-50 dark:bg-orange-950/30 min-w-[360px]">
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
            <div className="grid grid-cols-6 bg-emerald-50 dark:bg-emerald-950/30 min-w-[360px]">
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
            <div className="grid grid-cols-6 bg-blue-50 dark:bg-blue-950/30 min-w-[360px]">
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
        {/* 支付输入区域 - 5/12 */}
        <Card className={isMobile ? '' : 'xl:col-span-5 overflow-hidden'}>
          <div className="bg-muted/50 px-3 py-1 border-b">
            <span className="text-xs font-bold text-foreground">{t("支付信息", "Payment Info")}</span>
          </div>
          <div className="divide-y divide-border/50">
            {/* 支付奈拉行 */}
            <div className={`${isMobile ? 'p-2.5 space-y-1.5' : 'grid grid-cols-3'} bg-orange-50/50 dark:bg-orange-950/20`}>
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
              <div className="p-2 border-r border-orange-200/30 flex flex-col items-center justify-center">
                <span className="text-[10px] text-muted-foreground">{t("利润(RMB)", "Profit (RMB)")}</span>
                <span className="text-lg font-bold text-success tabular-nums">{formData.payNaira ? profitCalculation.nairaProfitRMB : '0'}</span>
              </div>
              <div className="p-2 flex flex-col items-center justify-center">
                <span className="text-[10px] text-muted-foreground">{t("利率", "Rate")}</span>
                <span className="text-lg font-bold text-orange-600 dark:text-orange-400 tabular-nums">{formData.payNaira ? profitCalculation.nairaRate + '%' : '0%'}</span>
              </div>
              </>
              )}
            </div>
            {/* 支付赛地行 */}
            <div className={`${isMobile ? 'p-2.5 space-y-1.5' : 'grid grid-cols-3'} bg-emerald-50/50 dark:bg-emerald-950/20`}>
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
              <div className="p-2 border-r border-emerald-200/30 flex flex-col items-center justify-center">
                <span className="text-[10px] text-muted-foreground">{t("利润(RMB)", "Profit (RMB)")}</span>
                <span className="text-lg font-bold text-success tabular-nums">{formData.payCedi ? profitCalculation.cediProfitRMB : '0'}</span>
              </div>
              <div className="p-2 flex flex-col items-center justify-center">
                <span className="text-[10px] text-muted-foreground">{t("利率", "Rate")}</span>
                <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">{formData.payCedi ? profitCalculation.cediRate + '%' : '0%'}</span>
              </div>
              </>
              )}
            </div>
            {/* 支付USDT行 */}
            <div className={`${isMobile ? 'p-2.5 space-y-1.5' : 'grid grid-cols-3'} bg-blue-50/50 dark:bg-blue-950/20`}>
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
              <div className="p-2 border-r border-blue-200/30 flex flex-col items-center justify-center">
                <span className="text-[10px] text-muted-foreground">{t("利润(U)", "Profit (U)")}</span>
                <span className="text-lg font-bold text-blue-600 dark:text-blue-400 tabular-nums">{formData.payUsdt ? profitCalculation.usdtProfitU : '0'}</span>
              </div>
              <div className="p-2 flex flex-col items-center justify-center">
                <span className="text-[10px] text-muted-foreground">{t("利率", "Rate")}</span>
                <span className="text-lg font-bold text-blue-600 dark:text-blue-400 tabular-nums">{formData.payUsdt ? profitCalculation.usdtRate + '%' : '0%'}</span>
              </div>
              </>
              )}
            </div>
            {/* 支付BTC行 */}
            <div className={`${isMobile ? 'p-2.5 space-y-1.5' : 'grid grid-cols-3'} bg-purple-50/50 dark:bg-purple-950/20`}>
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
              <div className="p-2 border-r border-purple-200/30 flex flex-col items-center justify-center">
                <span className="text-[10px] text-muted-foreground">{t("利润(U)", "Profit (U)")}</span>
                <span className="text-lg font-bold text-purple-600 dark:text-purple-400 tabular-nums">{payBtc ? profitCalculation.btcProfitU : '0'}</span>
              </div>
              <div className="p-2 flex flex-col items-center justify-center">
                <span className="text-[10px] text-muted-foreground">{t("利率", "Rate")}</span>
                <span className="text-lg font-bold text-purple-600 dark:text-purple-400 tabular-nums">{payBtc ? profitCalculation.btcRate + '%' : '0%'}</span>
              </div>
              </>
              )}
            </div>
          </div>
        </Card>

        {/* 右侧区域 - 7/12 (必填信息 + 会员信息) */}
        <div className={isMobile ? 'space-y-2' : 'xl:col-span-7 space-y-2'}>
          {/* 必填信息 */}
          <Card className="border-warning/30">
            <CardContent className="p-2">
              <div className={`grid gap-2 ${isMobile ? 'grid-cols-2' : 'grid-cols-3 xl:grid-cols-6'}`}>
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
          <Card className="overflow-hidden">
          <div className="bg-muted/50 px-3 py-1 border-b flex items-center justify-between">
            <span className="text-xs font-bold text-foreground">{t("会员信息", "Member Info")}</span>
          </div>
          <CardContent className="p-2 space-y-2">
            {/* 上半部分：左右两栏 */}
            <div className={`grid gap-3 ${isMobile ? 'grid-cols-1' : 'grid-cols-2'}`}>
              {/* 左栏：常交易卡、客户特点、会员等级、来源 */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <Label className="text-[10px] w-14 shrink-0 text-muted-foreground">{t("常交易卡", "Common Cards")}</Label>
                  <Select 
                    value={formData.selectedCommonCards[formData.selectedCommonCards.length - 1] || ""} 
                    onValueChange={(v) => {
                      const current = formData.selectedCommonCards;
                      if (current.includes(v)) {
                        updateField('selectedCommonCards', current.filter(c => c !== v));
                      } else {
                        updateField('selectedCommonCards', [...current, v]);
                      }
                    }}
                  >
                    <SelectTrigger className="h-6 flex-1 text-[11px]">
                      <span className="truncate">
                        {formData.selectedCommonCards.length === 0 
                          ? t("选择", "Select") 
                          : formData.selectedCommonCards.join("、")}
                      </span>
                    </SelectTrigger>
                    <SelectContent>
                      {cardsList.map((card) => (
                        <SelectItem 
                          key={card.id} 
                          value={card.name}
                          className={formData.selectedCommonCards.includes(card.name) ? "bg-primary/10" : ""}
                        >
                          {formData.selectedCommonCards.includes(card.name) ? "✓ " : ""}{card.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-1.5">
                  <Label className="text-[10px] w-14 shrink-0 text-muted-foreground">{t("客户特点", "Feature")}</Label>
                  <Input 
                    value={formData.customerFeature} 
                    onChange={(e) => updateField('customerFeature', e.target.value)}
                    placeholder={t("输入", "Enter")}
                    className="h-6 flex-1 text-[11px]"
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <Label className="text-[10px] w-14 shrink-0 text-muted-foreground">{t("会员等级", "Level")}</Label>
                  <Select value={formData.memberLevel} onValueChange={(v) => updateField('memberLevel', v)}>
                    <SelectTrigger className="h-6 flex-1 text-[11px]">
                      <SelectValue placeholder={t("选择", "Select")} />
                    </SelectTrigger>
                    <SelectContent>
                      {memberLevels.map((level) => (
                        <SelectItem key={level} value={level}>{level}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-1.5">
                  <Label className="text-[10px] w-14 shrink-0 text-muted-foreground">{t("来源", "Source")}</Label>
                  <Select value={formData.customerSource} onValueChange={(v) => updateField('customerSource', v)}>
                    <SelectTrigger className="h-6 flex-1 text-[11px]">
                      <SelectValue placeholder={t("选择来源", "Select source")}>
                        {customerSources.find(s => s.id === formData.customerSource)?.name || t("选择", "Select")}
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
              
              {/* 右栏：客户积分、推荐奖励、币种偏好、累积次数 */}
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
            
            {/* 下半部分：备注（2列，与上方对齐） */}
            <div className={`grid gap-3 pt-2 border-t border-border/50 ${isMobile ? 'grid-cols-1' : 'grid-cols-2'}`}>
              <div className={`flex ${isMobile ? 'flex-col gap-1' : 'items-start gap-1.5'}`}>
                <Label className={`text-[10px] shrink-0 text-muted-foreground ${isMobile ? '' : 'w-14 pt-1.5'}`}>{t("订单备注", "Order Remark")}</Label>
                <Textarea 
                  value={formData.remarkOrder} 
                  onChange={(e) => updateField('remarkOrder', e.target.value)}
                  placeholder={t("提交后同步到订单管理", "Syncs to order management")}
                  className="flex-1 h-[52px] min-h-[52px] resize-none text-xs"
                />
              </div>
              <div className={`flex ${isMobile ? 'flex-col gap-1' : 'items-start gap-1.5'}`}>
                <Label className={`text-[10px] shrink-0 text-muted-foreground ${isMobile ? '' : 'w-14 pt-1.5'}`}>{t("会员备注", "Member Remark")}</Label>
                <Textarea 
                  value={formData.remarkMember} 
                  onChange={(e) => updateField('remarkMember', e.target.value)}
                  placeholder={t("提交后同步到会员管理", "Syncs to member management")}
                  className="flex-1 h-[52px] min-h-[52px] resize-none text-xs"
                />
              </div>
            </div>
            
            {/* 积分兑换 + 提交订单按钮 */}
            <div className={`flex ${isMobile ? 'flex-col' : 'flex-row'} items-center justify-center gap-3 pt-3`}>
              {formData.phoneNumber && formData.memberCode && (
                <Button
                  onClick={openRedeemDialog}
                  disabled={!formData.phoneNumber || !formData.memberCode || getCustomerPoints() <= 0 || !canExchange() || isLoadingPoints}
                  title={getExchangeDisabledMessage() || undefined}
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
              )}
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
      <Dialog open={isRedeemDialogOpen} onOpenChange={setIsRedeemDialogOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg">{t("积分兑换", "Points Redemption")}</DialogTitle>
          </DialogHeader>
          {redeemPreviewData && (
            <div className="space-y-3 py-2">
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
          <DialogFooter className="flex-col sm:flex-row gap-2 pt-2">
            <Button variant="outline" onClick={() => setIsRedeemDialogOpen(false)} className="w-full sm:w-auto">
              {t("取消", "Cancel")}
            </Button>
            <Button 
              onClick={() => setIsRedeemConfirmOpen(true)} 
              disabled={!redeemPaymentProvider}
              className="w-full sm:w-auto"
            >
              {t("确认兑换", "Confirm Redemption")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 兑换二次确认对话框 */}
      <AlertDialog open={isRedeemConfirmOpen} onOpenChange={setIsRedeemConfirmOpen}>
        <AlertDialogContent className="max-w-[95vw] sm:max-w-md">
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
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel className="w-full sm:w-auto">{t("取消", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmRedeem} className="w-full sm:w-auto">{t("确认兑换", "Confirm Redemption")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
