import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
import CurrencySelect, { useCurrencies } from "@/components/CurrencySelect";
import { CurrencyCode } from "@/config/currencies";
import { getFeeSettings, getTrxSettings } from "@/stores/systemSettings";
import { useAuth } from "@/contexts/AuthContext";
import { getDisplayPhone } from "@/lib/phoneMask";
import { cleanPhoneNumber, validatePhoneLength } from "@/lib/phoneValidation";
import { useMembers } from "@/hooks/useMembers";
import { usePaymentProviders } from "@/hooks/useMerchantConfig";
import { useActivityGifts } from "@/hooks/useActivityGifts";
import { useIsPlatformAdminViewingTenant } from "@/hooks/useIsPlatformAdminViewingTenant";
import { markInputActive } from "@/lib/performanceUtils";
import { useLanguage } from "@/contexts/LanguageContext";
import { useIsMobile } from "@/hooks/use-mobile";

interface ActivityGift {
  id: string;
  currency: string;
  amount: string;
  rate: number;
  phoneNumber: string;
  paymentAgent: string;
  giftType: string;
  fee: number;
  giftValue: number;
  remark: string;
  createdAt: string;
}

interface ActivityGiftTabProps {
  nairaRate: number;
  cediRate: number;
  usdtRate: number;
}

// 表单状态持久化 key
const FORM_DATA_KEY = 'activityGiftForm' as const;
// 防抖保存延迟（毫秒）
const SAVE_DEBOUNCE_MS = 1500;

// 表单状态类型
interface ActivityGiftFormState {
  currency: string;
  amount: string;
  phoneNumber: string;
  paymentAgent: string;
  giftType: string;
  remark: string;
}

// 内存缓存
let formStateCache: ActivityGiftFormState | null = null;

// 从数据库加载表单状态（异步）
async function loadFormStateAsync(): Promise<ActivityGiftFormState | null> {
  try {
    const { loadSharedData } = await import('@/services/sharedDataService');
    const saved = await loadSharedData<ActivityGiftFormState>(FORM_DATA_KEY);
    if (saved) {
      formStateCache = saved;
      return saved;
    }
  } catch (e) {
    console.error('[ActivityGiftTab] Failed to load form state:', e);
  }
  return null;
}

// 获取缓存的表单状态（同步，用于初始化）
function loadFormState(): ActivityGiftFormState | null {
  return formStateCache;
}

// 保存表单状态到数据库（带防抖）
let saveTimeoutId: NodeJS.Timeout | null = null;
async function saveFormStateDebounced(state: any, skipPersist = false) {
  if (saveTimeoutId) {
    clearTimeout(saveTimeoutId);
  }
  if (skipPersist) return;
  saveTimeoutId = setTimeout(async () => {
    try {
      formStateCache = state;
      const { saveSharedData } = await import('@/services/sharedDataService');
      await saveSharedData(FORM_DATA_KEY, state);
    } catch (e) {
      console.error('[ActivityGiftTab] Failed to save form state:', e);
    }
  }, SAVE_DEBOUNCE_MS);
}

// 清除表单状态
async function clearFormState(skipPersist = false) {
  if (saveTimeoutId) {
    clearTimeout(saveTimeoutId);
  }
  formStateCache = null;
  if (skipPersist) return;
  try {
    const { saveSharedData } = await import('@/services/sharedDataService');
    await saveSharedData(FORM_DATA_KEY, null);
  } catch (e) {
    console.error('[ActivityGiftTab] Failed to clear form state:', e);
  }
}

export default function ActivityGiftTab({ nairaRate, cediRate, usdtRate }: ActivityGiftTabProps) {
  const { currencies } = useCurrencies();
  const { employee } = useAuth();
  const isPlatformAdminReadonlyView = useIsPlatformAdminViewingTenant();
  const { members, findMemberByPhone } = useMembers();
  const { activeProviders } = usePaymentProviders();
  const { addGift } = useActivityGifts();
  const { t } = useLanguage();
  const isMobile = useIsMobile();
  
  // 初始化使用缓存（同步），异步加载更新
  const savedState = loadFormState();
  
  const [currency, setCurrency] = useState<CurrencyCode>((savedState?.currency as CurrencyCode) || "NGN");
  const [amount, setAmount] = useState(savedState?.amount || "");
  const [phoneNumber, setPhoneNumber] = useState(savedState?.phoneNumber || "");
  const [paymentAgent, setPaymentAgent] = useState(savedState?.paymentAgent || "");
  const [giftType, setGiftType] = useState(savedState?.giftType || "");
  const [remark, setRemark] = useState(savedState?.remark || "");
  const [activityTypes, setActivityTypes] = useState<{ value: string; label: string }[]>([]);
  const [memberError, setMemberError] = useState("");
  const [isFormLoaded, setIsFormLoaded] = useState(false);

  // 异步加载表单状态（从数据库）
  useEffect(() => {
    let isMounted = true;
    
    loadFormStateAsync().then(saved => {
      if (isMounted && saved && !isFormLoaded) {
        if (saved.currency) setCurrency(saved.currency as CurrencyCode);
        if (saved.amount) setAmount(saved.amount);
        if (saved.phoneNumber) setPhoneNumber(saved.phoneNumber);
        if (saved.paymentAgent) setPaymentAgent(saved.paymentAgent);
        if (saved.giftType) setGiftType(saved.giftType);
        if (saved.remark) setRemark(saved.remark);
        setIsFormLoaded(true);
      }
    });
    
    return () => { isMounted = false; };
  }, []);

  // Load activity types from database (activity_types table)
  useEffect(() => {
    const loadActivityTypes = async () => {
      try {
        const { supabase } = await import('@/integrations/supabase/client');
        const { data, error } = await supabase
          .from('activity_types')
          .select('value, label')
          .eq('is_active', true)
          .order('sort_order', { ascending: true });
        
        if (error) throw error;
        
        const types = (data || []).map(t => ({ value: t.value, label: t.label }));
        setActivityTypes(types);
        
        if (types.length > 0 && !giftType) {
          setGiftType(savedState?.giftType || types[0].value);
        }
      } catch (error) {
        console.error('Failed to load activity types:', error);
      }
    };
    
    loadActivityTypes();
  }, []);
  
  // 自动保存表单状态 - 使用防抖
  useEffect(() => {
    saveFormStateDebounced({ currency, amount, phoneNumber, paymentAgent, giftType, remark }, isPlatformAdminReadonlyView);
  }, [currency, amount, phoneNumber, paymentAgent, giftType, remark, isPlatformAdminReadonlyView]);

  // Get rate based on currency - with null safety
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

  // Get rate label - simplified
  const getRateLabel = () => {
    return t("汇率", "Rate");
  };

  // 计算手续费 - 根据币种和金额自动引用规则
  const calculatedFee = useMemo(() => {
    const amountNum = parseFloat(amount) || 0;
    const absAmount = Math.abs(amountNum);
    
    if (currency === "NGN") {
      const feeSettings = getFeeSettings();
      return absAmount >= feeSettings.nairaThreshold 
        ? feeSettings.nairaFeeAbove 
        : feeSettings.nairaFeeBelow;
    } else if (currency === "GHS") {
      const feeSettings = getFeeSettings();
      return absAmount >= feeSettings.cediThreshold 
        ? feeSettings.cediFeeAbove 
        : feeSettings.cediFeeBelow;
    } else if (currency === "USDT") {
      const trxSettings = getTrxSettings();
      // USDT 手续费取自汇率计算模块中的 USDT 手续费数值
      // 这里暂时使用 TRX 设置中的相关值，后续可调整
      return 0; // USDT 当前默认为 0，待后续定义具体取值
    }
    return 0;
  }, [currency, amount]);

  // 计算赠送价值（含手续费）(RMB)
  // NGN: amount / rate = RMB价值
  // GHS: amount * rate = RMB价值
  // USDT: amount * rate = RMB价值
  const calculatedGiftValue = useMemo(() => {
    const amountNum = parseFloat(amount) || 0;
    const rate = getRate();
    
    if (!amountNum || !rate) return 0;
    
    // 奈拉：赠送金额 ÷ 当时汇率 + 手续费
    // 赛地/USDT：赠送金额 × 当时汇率 + 手续费
    if (currency === "NGN") {
      return Math.abs(amountNum) / rate + calculatedFee;
    } else {
      return Math.abs(amountNum) * rate + calculatedFee;
    }
  }, [currency, amount, calculatedFee]);

  // Handle phone number or member code change - 支持电话号码和会员编号两种查询
  const handlePhoneNumberChange = async (value: string) => {
    // 保留原始输入（允许字母用于会员编号）
    const trimmedValue = value.trim();
    setPhoneNumber(trimmedValue);
    
    // 判断是电话号码还是会员编号
    const isPhoneNumber = /^\d+$/.test(trimmedValue);
    
    if (isPhoneNumber) {
      // 电话号码逻辑
      const cleanedValue = cleanPhoneNumber(trimmedValue);
      const limitedValue = cleanedValue.slice(0, 18);
      setPhoneNumber(limitedValue);
      
      // 验证长度
      const lengthValidation = validatePhoneLength(limitedValue);
      if (!lengthValidation.valid) {
        setMemberError(lengthValidation.message);
        return;
      }
      
      // 从数据库实时查询会员
      if (limitedValue.length >= 8) {
        try {
          const { supabase } = await import('@/integrations/supabase/client');
          const { data: dbMember, error } = await supabase
            .from('members')
            .select('*')
            .eq('phone_number', limitedValue)
            .maybeSingle();
          
          if (error) {
            console.error('查询会员失败:', error);
            setMemberError(t("查询失败，请重试", "Query failed, please retry"));
            return;
          }
          
          if (dbMember) {
            setMemberError("");
            toast.success(t(`会员匹配: ${dbMember.member_code}`, `Member matched: ${dbMember.member_code}`));
          } else {
            setMemberError(t("未找到会员", "Member not found"));
          }
        } catch (err) {
          console.error('查询会员出错:', err);
          setMemberError(t("查询失败", "Query failed"));
        }
      } else {
        setMemberError("");
      }
    } else {
      // 会员编号逻辑 - 支持字母和数字
      if (trimmedValue.length >= 2) {
        try {
          const { supabase } = await import('@/integrations/supabase/client');
          const { data: dbMember, error } = await supabase
            .from('members')
            .select('*')
            .eq('member_code', trimmedValue)
            .maybeSingle();
          
          if (error) {
            console.error('查询会员失败:', error);
            setMemberError(t("查询失败，请重试", "Query failed, please retry"));
            return;
          }
          
          if (dbMember) {
            setMemberError("");
            // 自动填充电话号码以便后续提交
            setPhoneNumber(dbMember.phone_number);
            toast.success(t(`会员匹配: ${dbMember.member_code}`, `Member matched: ${dbMember.member_code}`));
          } else {
            setMemberError(t("未找到会员", "Member not found"));
          }
        } catch (err) {
          console.error('查询会员出错:', err);
          setMemberError(t("查询失败", "Query failed"));
        }
      } else {
        setMemberError("");
      }
    }
  };

  const handleSubmit = async () => {
    if (isPlatformAdminReadonlyView) {
      toast.error("平台总管理查看租户时为只读，无法提交活动赠送");
      return;
    }
    if (!amount) {
      toast.error(t('activityGift.pleaseEnterAmount'));
      return;
    }
    if (!phoneNumber) {
      toast.error(t('activityGift.pleaseEnterPhone'));
      return;
    }
    const member = findMemberByPhone(phoneNumber);
    if (!member) {
      toast.error(t('activityGift.memberNotFoundError'));
      return;
    }
    if (!paymentAgent) {
      toast.error(t('activityGift.pleaseSelectAgent'));
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
      creatorName: employee?.real_name || 'Unknown',
    }, member.id, employee?.id);

    if (result) {
      toast.success(t('activityGift.submitted'));
      handleReset();
    }
  };

  const handleReset = () => {
    setCurrency("NGN");
    setAmount("");
    setPhoneNumber("");
    setPaymentAgent("");
    setGiftType(activityTypes.length > 0 ? activityTypes[0].value : "");
    setRemark("");
    setMemberError("");
    clearFormState(isPlatformAdminReadonlyView);
  };

  // 代付商家列表（来自商家管理的代付商家）
  const activeVendors = activeProviders.filter(v => v.status === "active");

  return (
    <div className="p-2">
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-base">{t('activityGift.title')}</CardTitle>
        </CardHeader>
        <CardContent className="py-2">
          <div className={`grid ${isMobile ? 'grid-cols-1' : 'grid-cols-2'} gap-x-4 gap-y-2`}>
            {/* Left column */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label className="text-xs w-20 shrink-0">{t('activityGift.giftCurrency')}</Label>
              <Select value={currency} onValueChange={(v) => setCurrency(v as CurrencyCode)}>
                  <SelectTrigger className="h-7 flex-1 bg-secondary border-border text-foreground">
                    <SelectValue placeholder={t('activityGift.selectAgent')} />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-border">
                    {currencies.map((c) => (
                      <SelectItem key={c.code} value={c.code}>
                        {c.code}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <Label className="text-xs w-20 shrink-0 text-orange-600">* {t('activityGift.giftAmount')}</Label>
                <Input
                  value={amount}
                  onChange={(e) => {
                    const cleaned = e.target.value.replace(/[^0-9.\-]/g, '').replace(/(\..*)\./g, '$1').replace(/(?!^)-/g, '');
                    setAmount(cleaned);
                  }}
                  onPaste={(e) => {
                    e.preventDefault();
                    const pasted = e.clipboardData.getData('text').replace(/[^0-9.\-]/g, '').replace(/(\..*)\./g, '$1').replace(/(?!^)-/g, '');
                    setAmount(prev => prev + pasted);
                  }}
                  placeholder={t('activityGift.amountPlaceholder')}
                  className="h-7 flex-1 border-orange-200 text-sm placeholder:text-muted-foreground/40"
                />
              </div>

              <div className="flex items-center gap-2">
                <Label className="text-xs w-20 shrink-0 text-orange-600">* {t('activityGift.rate')}</Label>
                <Input
                  value={getRate().toString()}
                  readOnly
                  className="h-7 flex-1 bg-muted text-sm"
                />
              </div>

              <div className="flex items-center gap-2">
                <Label className="text-xs w-20 shrink-0 text-orange-600">* {t('activityGift.phoneNumber')}</Label>
                <div className="flex-1">
                  <Input
                    value={phoneNumber}
                    onChange={(e) => {
                      const cleaned = e.target.value.replace(/[^0-9]/g, '').slice(0, 18);
                      setPhoneNumber(cleaned);
                      setMemberError("");
                      if (cleaned.length >= 8) {
                        handlePhoneNumberChange(cleaned);
                      }
                    }}
                    onPaste={(e) => {
                      e.preventDefault();
                      const pasted = e.clipboardData.getData('text').replace(/[^0-9]/g, '').slice(0, 18);
                      setPhoneNumber(pasted);
                      setMemberError("");
                      if (pasted.length >= 8) {
                        handlePhoneNumberChange(pasted);
                      }
                    }}
                    placeholder={t("电话号码/会员编号", "Phone/Member Code")}
                    className={`h-7 text-sm placeholder:text-muted-foreground/40 ${memberError ? "border-red-500" : "border-orange-200"}`}
                  />
                  {memberError && (
                    <div className="flex items-center gap-1 text-red-500 text-xs mt-0.5">
                      <AlertCircle className="h-3 w-3" />
                      {memberError}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Label className="text-xs w-20 shrink-0 text-orange-600">* {t('activityGift.paymentAgent')}</Label>
                <Select value={paymentAgent} onValueChange={setPaymentAgent}>
                  <SelectTrigger className="h-7 flex-1 border-orange-200">
                    <SelectValue placeholder={t('activityGift.selectAgent')} />
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

            {/* Right column */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label className="text-xs w-20 shrink-0">{t("类型", "Type")}</Label>
                <Select value={giftType} onValueChange={setGiftType}>
                  <SelectTrigger className="h-7 flex-1">
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
                  className="h-7 flex-1 bg-muted text-sm"
                />
              </div>

              {/* 赠送价值 */}
              <div className="flex items-center gap-2">
                <Label className="text-xs w-20 shrink-0">{t("赠送价值", "Gift Value")}</Label>
                <Input
                  value={calculatedGiftValue ? calculatedGiftValue.toFixed(2) : "0.00"}
                  readOnly
                  className="h-7 flex-1 bg-muted text-sm"
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
                <Button onClick={handleSubmit} size="sm" className="gap-1 h-7" disabled={isPlatformAdminReadonlyView}>
                  <Plus className="h-3 w-3" />
                  {t("提交", "Submit")}
                </Button>
                <Button variant="outline" size="sm" onClick={handleReset} className="gap-1 h-7">
                  <RotateCcw className="h-3 w-3" />
                  {t("重置", "Reset")}
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
