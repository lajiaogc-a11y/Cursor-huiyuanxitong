import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { DrawerDetail } from "@/components/shell/DrawerDetail";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, RotateCcw, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { useCurrencies } from "@/components/CurrencySelect";
import { CurrencyCode } from "@/config/currencies";
import { calculateTransactionFee } from "@/lib/feeCalculation";
import { useAuth } from "@/contexts/AuthContext";
import { cleanPhoneNumber } from "@/lib/phoneValidation";
import { useMembers } from "@/hooks/useMembers";
import { usePaymentProviders } from "@/hooks/useMerchantConfig";
import { useActivityGifts } from "@/hooks/useActivityGifts";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  loadSharedData,
  resolveUsdtRateForActivityGift,
  type CalculatorInputRates,
} from "@/services/finance/sharedDataService";
import { getActivityTypesApi } from "@/services/staff/dataApi";

interface ActivityGiftDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export default function ActivityGiftDialog({ open, onOpenChange, onSuccess }: ActivityGiftDialogProps) {
  const { t } = useLanguage();
  const { currencies } = useCurrencies();
  const { employee } = useAuth();
  const { members, findMemberByPhone } = useMembers();
  const { activeProviders } = usePaymentProviders();
  const { addGift } = useActivityGifts();
  
  const [currency, setCurrency] = useState<CurrencyCode>("NGN");
  const [amount, setAmount] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [paymentAgent, setPaymentAgent] = useState("");
  const [giftType, setGiftType] = useState("");
  const [remark, setRemark] = useState("");
  const [activityTypes, setActivityTypes] = useState<{ value: string; label: string }[]>([]);
  const [memberError, setMemberError] = useState("");
  const [nairaRate, setNairaRate] = useState(0);
  const [cediRate, setCediRate] = useState(0);
  const [usdtRate, setUsdtRate] = useState(0);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);

  // 加载汇率（与汇率计算页同源：奈拉/赛地 + USDT 采集卖价优先）
  useEffect(() => {
    const loadRates = async () => {
      const input = await loadSharedData<CalculatorInputRates>("calculatorInputRates");
      if (input) {
        setNairaRate(input.nairaRate > 0 ? input.nairaRate : 0);
        setCediRate(input.cediRate > 0 ? input.cediRate : 0);
        setUsdtRate(resolveUsdtRateForActivityGift(input));
      }
    };
    if (open) {
      loadRates();
    }
  }, [open]);

  // Load activity types from database
  useEffect(() => {
    const loadActivityTypes = async () => {
      try {
        const data = await getActivityTypesApi();
        const types = (data || [])
          .filter((item) => item.is_active !== false)
          .map((t) => ({ value: t.value, label: t.label }));
        setActivityTypes(types);
        
        if (types.length > 0 && !giftType) {
          setGiftType(types[0].value);
        }
      } catch (error) {
        console.error('Failed to load activity types:', error);
      }
    };
    
    if (open) {
      loadActivityTypes();
    }
  }, [open]);

  // Get rate based on currency
  const getRate = (): number => {
    switch (currency) {
      case "NGN":
        return nairaRate ?? 0;
      case "GHS":
        return cediRate ?? 0;
      case "USDT":
        return usdtRate ?? 0;
      default:
        return 0;
    }
  };

  const calculatedFee = useMemo(() => calculateTransactionFee(currency, amount), [currency, amount]);

  // 计算赠送价值 (RMB)
  // NGN: amount / rate = RMB价值
  // GHS: amount * rate = RMB价值
  // USDT: amount * rate = RMB价值
  const calculatedGiftValue = useMemo(() => {
    const amountNum = parseFloat(amount) || 0;
    const rate = getRate();
    
    if (!amountNum || !rate) return 0;
    
    if (currency === "NGN") {
      // 奈拉：赠送金额 ÷ 当时汇率 + 手续费
      return Math.abs(amountNum) / rate + calculatedFee;
    } else {
      // 赛地/USDT：赠送金额 × 当时汇率 + 手续费
      return Math.abs(amountNum) * rate + calculatedFee;
    }
  }, [currency, amount, calculatedFee, nairaRate, cediRate, usdtRate]);

  // Debounce ref for member lookup
  const memberLookupTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Member lookup with debounce
  const lookupMember = useCallback(async (phone: string) => {
    if (phone.length < 8) {
      setMemberError("");
      return;
    }
    try {
      const dbMember = findMemberByPhone(phone);
      if (dbMember) {
        setMemberError("");
        toast.success(`${t("已匹配到会员", "Member matched")}: ${dbMember.memberCode}`);
      } else {
        setMemberError(t("无此会员，请先在会员管理中录入", "Member not found"));
      }
    } catch (err) {
      console.error('查询会员出错:', err);
      setMemberError(t("查询失败，请重试", "Query failed, please retry"));
    }
  }, [t]);

  // Handle phone number change - auto-clean and debounced lookup
  // 逻辑与汇率计算器一致：只保留数字，自动去除空格和特殊字符
  const handlePhoneNumberChange = (value: string) => {
    const cleanedValue = value.replace(/[^0-9]/g, '').slice(0, 18);
    setPhoneNumber(cleanedValue);
    setMemberError("");
    
    // Debounced member lookup (300ms)
    if (memberLookupTimerRef.current) {
      clearTimeout(memberLookupTimerRef.current);
    }
    if (cleanedValue.length >= 8) {
      memberLookupTimerRef.current = setTimeout(() => {
        lookupMember(cleanedValue);
      }, 300);
    }
  };

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (memberLookupTimerRef.current) {
        clearTimeout(memberLookupTimerRef.current);
      }
    };
  }, []);

  const handleSubmit = async () => {
    if (!amount) {
      toast.error(t("请填写赠送金额", "Please enter gift amount"));
      return;
    }
    if (!phoneNumber) {
      toast.error(t("请填写电话号码", "Please enter phone number"));
      return;
    }
    const member = findMemberByPhone(phoneNumber);
    if (!member) {
      toast.error(t("无此会员，请先在会员管理中录入该会员", "Member not found"));
      return;
    }
    if (!paymentAgent) {
      toast.error(t("请选择代付商家", "Please select payment agent"));
      return;
    }

    const result = await addGift({
      currency,
      amount: parseFloat(amount),
      rate: getRate(),
      phoneNumber,
      paymentAgent,
      giftType,
      fee: calculatedFee,
      giftValue: calculatedGiftValue,
      remark,
      creatorName: employee?.real_name || '未知',
    }, member.id, employee?.id);

    if (result) {
      toast.success(t("活动赠送已提交", "Activity gift submitted"));
      performReset();
      onOpenChange(false);
      onSuccess?.();
    }
  };

  const performReset = () => {
    setCurrency("NGN");
    setAmount("");
    setPhoneNumber("");
    setPaymentAgent("");
    setGiftType(activityTypes.length > 0 ? activityTypes[0].value : "");
    setRemark("");
    setMemberError("");
  };

  const activeVendors = activeProviders.filter(v => v.status === "active");

  return (
    <>
    <DrawerDetail
      open={open}
      onOpenChange={onOpenChange}
      title={t("活动赠送录入", "Activity Gift Entry")}
      sheetMaxWidth="2xl"
    >
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          {/* 左列 */}
          <div className="space-y-3">
            {/* 赠送币种 */}
            <div className="flex items-center gap-2">
              <Label className="text-xs w-20 shrink-0">{t("赠送币种", "Currency")}</Label>
              <Select value={currency} onValueChange={(v) => setCurrency(v as CurrencyCode)}>
              <SelectTrigger 
                className="h-8 flex-1 text-foreground"
                style={{ 
                  backgroundColor: 'hsl(var(--muted))', 
                  borderColor: 'hsl(var(--border))' 
                }}
              >
                  <SelectValue placeholder={t("请选择币种", "Select currency")} />
                </SelectTrigger>
                <SelectContent>
                  {currencies.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      {c.code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* 赠送金额 */}
            <div className="flex items-center gap-2">
              <Label className="text-xs w-20 shrink-0 text-destructive">* {t("赠送金额", "Amount")}</Label>
              <Input
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9.-]/g, '').replace(/(\..*)\./g, '$1').replace(/(?!^)-/g, ''))}
                onPaste={(e) => {
                  e.preventDefault();
                  const pasted = e.clipboardData.getData('text').replace(/[^0-9.-]/g, '').replace(/(\..*)\./g, '$1').replace(/(?!^)-/g, '');
                  setAmount(prev => prev + pasted);
                }}
                placeholder={t("填入赠送金额", "Enter amount")}
                className="h-8 flex-1 border-destructive/30 text-sm text-foreground bg-background placeholder:text-muted-foreground/40"
              />
            </div>

            {/* 汇率 */}
            <div className="flex items-center gap-2">
              <Label className="text-xs w-20 shrink-0 text-destructive">* {t("汇率", "Rate")}</Label>
              <Input
                value={getRate().toString()}
                readOnly
                className="h-8 flex-1 bg-muted text-sm"
              />
            </div>

            {/* 电话号码 */}
            <div className="flex items-center gap-2">
              <Label className="text-xs w-20 shrink-0 text-destructive">* {t("电话号码", "Phone")}</Label>
              <div className="flex-1">
                <Input
                  value={phoneNumber}
                  onChange={(e) => handlePhoneNumberChange(e.target.value)}
                  onPaste={(e) => {
                    e.preventDefault();
                    const pasted = e.clipboardData.getData('text').replace(/[^0-9]/g, '');
                    handlePhoneNumberChange(pasted);
                  }}
                  placeholder={t("可粘贴，自动去掉空格", "Paste, auto trim")}
                  className={`h-8 text-sm text-foreground bg-background placeholder:text-muted-foreground/40 ${memberError ? "border-destructive" : "border-destructive/30"}`}
                />
                {memberError && (
                  <div className="flex items-center gap-1 text-red-500 text-xs mt-0.5">
                    <AlertCircle className="h-3 w-3" />
                    {memberError}
                  </div>
                )}
              </div>
            </div>

            {/* 代付商家 */}
            <div className="flex items-center gap-2">
              <Label className="text-xs w-20 shrink-0 text-destructive">* {t("代付商家", "Agent")}</Label>
              <Select value={paymentAgent} onValueChange={setPaymentAgent}>
                <SelectTrigger className="h-8 flex-1 border-destructive/30">
                  <SelectValue placeholder={t("请选择", "Select")} />
                </SelectTrigger>
                <SelectContent>
                  {activeVendors.map((vendor) => (
                    <SelectItem key={vendor.id} value={vendor.name}>
                      {vendor.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* 右列 */}
          <div className="space-y-3">
            {/* 类型 */}
            <div className="flex items-center gap-2">
              <Label className="text-xs w-20 shrink-0">{t("类型", "Type")}</Label>
              <Select value={giftType} onValueChange={setGiftType}>
                <SelectTrigger className="h-8 flex-1">
                  <SelectValue placeholder={t("请选择", "Select")} />
                </SelectTrigger>
                <SelectContent>
                  {activityTypes.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* 手续费 */}
            <div className="flex items-center gap-2">
              <Label className="text-xs w-20 shrink-0">{t("手续费", "Fee")}</Label>
              <Input
                value={calculatedFee.toString()}
                readOnly
                className="h-8 flex-1 bg-muted text-sm"
              />
            </div>

            {/* 赠送价值 */}
            <div className="flex items-center gap-2">
              <Label className="text-xs w-20 shrink-0">{t("赠送价值", "Gift Value")}</Label>
              <Input
                value={calculatedGiftValue ? calculatedGiftValue.toFixed(2) : "0.00"}
                readOnly
                className="h-8 flex-1 bg-muted text-sm"
              />
            </div>

            {/* 备注 */}
            <div className="flex items-start gap-2">
              <Label className="text-xs w-20 shrink-0 pt-1">{t("备注", "Remark")}</Label>
              <Textarea
                value={remark}
                onChange={(e) => setRemark(e.target.value)}
                placeholder={t("请输入备注", "Enter remark")}
                rows={2}
                className="flex-1 text-sm resize-none placeholder:text-muted-foreground/40"
              />
            </div>

            {/* 按钮 */}
            <div className="flex gap-2 pt-1">
              <Button onClick={handleSubmit} size="sm" className="gap-1 h-8">
                <Plus className="h-3 w-3" />
                {t("提交", "Submit")}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setResetConfirmOpen(true)} className="gap-1 h-8">
                <RotateCcw className="h-3 w-3" />
                {t("重置", "Reset")}
              </Button>
            </div>
          </div>
        </div>
    </DrawerDetail>

    <AlertDialog open={resetConfirmOpen} onOpenChange={setResetConfirmOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("重置表单？", "Reset the form?")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t(
              "将清空当前输入；此操作不可撤销。",
              "This clears all fields. This cannot be undone.",
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("取消", "Cancel")}</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => {
              performReset();
            }}
          >
            {t("重置", "Reset")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
