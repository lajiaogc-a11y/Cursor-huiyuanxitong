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
import { notify } from "@/lib/notifyHub";
import CurrencySelect, { useCurrencies } from "@/components/CurrencySelect";
import { CurrencyCode } from "@/config/currencies";
import { calculateTransactionFee } from "@/lib/feeCalculation";
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
import { getActivityTypesApi } from "@/services/staff/dataApi";
import { apiGet } from "@/api/client";
import { loadSharedData, saveSharedData } from "@/services/finance/sharedDataService";

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
  /** USDT：CNY/USDT，应与汇率页采集「卖出价」(bid) 一致；由 ExchangeRate 传入 */
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
  /** 手工汇率；空字符串表示沿用页面同步汇率 */
  giftRateManual?: string;
}

// 内存缓存
let formStateCache: ActivityGiftFormState | null = null;

// 从数据库加载表单状态（异步）
async function loadFormStateAsync(): Promise<ActivityGiftFormState | null> {
  try {
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
    await saveSharedData(FORM_DATA_KEY, null);
  } catch (e) {
    console.error('[ActivityGiftTab] Failed to clear form state:', e);
  }
}

export default function ActivityGiftTab({ nairaRate, cediRate, usdtRate }: ActivityGiftTabProps) {
  const { currencies } = useCurrencies();
  const { employee } = useAuth();
  const isPlatformAdminReadonlyView = useIsPlatformAdminViewingTenant({ allowOperationalMutations: true });
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
  const [giftRateManual, setGiftRateManual] = useState(savedState?.giftRateManual ?? "");
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
        if (saved.giftRateManual != null) setGiftRateManual(saved.giftRateManual);
        setIsFormLoaded(true);
      }
    });
    
    return () => { isMounted = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load activity types from database (activity_types table)
  useEffect(() => {
    const loadActivityTypes = async () => {
      try {
        const data = await getActivityTypesApi();
        const types = (data || [])
          .filter((item) => item.is_active !== false)
          .map((t) => ({ value: t.value, label: t.label }));
        setActivityTypes(types);
        
        if (types.length > 0 && !giftType) {
          setGiftType(savedState?.giftType || types[0].value);
        }
      } catch (error) {
        console.error('Failed to load activity types:', error);
      }
    };
    
    loadActivityTypes();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  
  // 自动保存表单状态 - 使用防抖
  useEffect(() => {
    saveFormStateDebounced(
      { currency, amount, phoneNumber, paymentAgent, giftType, remark, giftRateManual },
      isPlatformAdminReadonlyView,
    );
  }, [currency, amount, phoneNumber, paymentAgent, giftType, remark, giftRateManual, isPlatformAdminReadonlyView]);

  const syncedRate = useMemo((): number => {
    switch (currency) {
      case "NGN": return nairaRate ?? 0;
      case "GHS": return cediRate ?? 0;
      case "USDT": return usdtRate ?? 0;
      default: return 0;
    }
  }, [currency, nairaRate, cediRate, usdtRate]);

  const effectiveRate = useMemo((): number => {
    const raw = giftRateManual.trim().replace(/,/g, "");
    if (raw === "") return syncedRate;
    const n = parseFloat(raw);
    if (!Number.isFinite(n) || n <= 0) return syncedRate;
    return n;
  }, [giftRateManual, syncedRate]);

  // 计算手续费 - 与活动报表/汇率页同源规则
  const calculatedFee = useMemo(() => {
    return calculateTransactionFee(currency, amount);
  }, [currency, amount]);

  // 计算赠送价值（含手续费）(RMB)
  // NGN: amount / rate = RMB价值
  // GHS: amount * rate = RMB价值
  // USDT: amount * rate = RMB价值
  const calculatedGiftValue = useMemo(() => {
    const amountNum = parseFloat(amount) || 0;
    if (!amountNum || !effectiveRate) return 0;

    if (currency === "NGN") {
      return Math.abs(amountNum) / effectiveRate + calculatedFee;
    } else {
      return Math.abs(amountNum) * effectiveRate + calculatedFee;
    }
  }, [currency, amount, calculatedFee, effectiveRate]);

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
          const dbMember = await apiGet<Record<string, unknown> | null>(
            `/api/data/table/members?select=*&phone_number=eq.${encodeURIComponent(limitedValue)}&single=true`
          );

          if (dbMember && dbMember.id) {
            setMemberError("");
            notify.success(t(`会员匹配: ${dbMember.member_code}`, `Member matched: ${String(dbMember.member_code ?? '')}`));
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
          const dbMember = await apiGet<Record<string, unknown> | null>(
            `/api/data/table/members?select=*&member_code=eq.${encodeURIComponent(trimmedValue)}&single=true`
          );

          if (dbMember && dbMember.id) {
            setMemberError("");
            setPhoneNumber(String(dbMember.phone_number ?? ''));
            notify.success(t(`会员匹配: ${dbMember.member_code}`, `Member matched: ${String(dbMember.member_code ?? '')}`));
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

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);

  const handleSubmit = async () => {
    if (isPlatformAdminReadonlyView) {
      notify.error(t("平台总管理查看租户时为只读，无法提交活动赠送", "Read-only in admin view, cannot submit activity gift"));
      return;
    }
    if (!amount) {
      notify.error(t('activityGift.pleaseEnterAmount'));
      return;
    }
    if (!phoneNumber) {
      notify.error(t('activityGift.pleaseEnterPhone'));
      return;
    }
    if (!paymentAgent) {
      notify.error(t('activityGift.pleaseSelectAgent'));
      return;
    }
    if (!effectiveRate || effectiveRate <= 0) {
      notify.error(t("请填写有效汇率或等待页面汇率同步", "Enter a valid rate or wait for rates to sync"));
      return;
    }

    let member = findMemberByPhone(phoneNumber);
    if (!member) {
      try {
        const dbMember = await apiGet<Record<string, unknown> | null>(
          `/api/data/table/members?select=*&phone_number=eq.${encodeURIComponent(phoneNumber)}&single=true`
        );
        if (dbMember?.id) {
          member = { id: dbMember.id, phoneNumber: dbMember.phone_number } as any;
        }
      } catch { /* DB lookup optional fallback */ }
    }
    if (!member) {
      notify.error(t('activityGift.memberNotFoundError'));
      return;
    }

    setConfirmOpen(true);
  };

  const executeSubmit = async () => {
    if (isPlatformAdminReadonlyView) return;
    let member = findMemberByPhone(phoneNumber);
    if (!member) {
      try {
        const dbMember = await apiGet<Record<string, unknown> | null>(
          `/api/data/table/members?select=*&phone_number=eq.${encodeURIComponent(phoneNumber)}&single=true`
        );
        if (dbMember?.id) {
          member = { id: dbMember.id, phoneNumber: dbMember.phone_number } as any;
        }
      } catch { /* ignore */ }
    }
    if (!member) {
      notify.error(t('activityGift.memberNotFoundError'));
      setConfirmOpen(false);
      return;
    }
    if (!effectiveRate || effectiveRate <= 0) {
      notify.error(t("请填写有效汇率或等待页面汇率同步", "Enter a valid rate or wait for rates to sync"));
      setConfirmOpen(false);
      return;
    }

    setConfirmOpen(false);
    setIsSubmitting(true);
    try {
      const result = await addGift({
        currency,
        amount: parseFloat(amount),
        rate: effectiveRate,
        phoneNumber,
        paymentAgent,
        giftType,
        fee: calculatedFee,
        giftValue: calculatedGiftValue,
        remark,
        creatorName: employee?.real_name || 'Unknown',
      }, member.id, employee?.id);

      if (result) {
        notify.success(t('activityGift.submitted'));
        performReset();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const performReset = () => {
    setCurrency("NGN");
    setAmount("");
    setPhoneNumber("");
    setPaymentAgent("");
    setGiftType(activityTypes.length > 0 ? activityTypes[0].value : "");
    setRemark("");
    setGiftRateManual("");
    setMemberError("");
    clearFormState(isPlatformAdminReadonlyView);
  };

  // 代付商家列表（来自商家管理的代付商家）
  const activeVendors = activeProviders.filter(v => v.status === "active");

  const giftTypeLabel = activityTypes.find((x) => x.value === giftType)?.label ?? giftType;

  return (
    <div className="p-2">
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("确认提交活动赠送？", "Confirm activity gift submission?")}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>{t("提交后将写入活动赠送记录并影响会员数据，请核对：", "This will create a gift record. Please verify:")}</p>
                <ul className="list-disc pl-4 space-y-1 text-foreground/90">
                  <li>{t("电话", "Phone")}: {getDisplayPhone(phoneNumber)}</li>
                  <li>{t("币种", "Currency")}: {currency}</li>
                  <li>{t("赠送金额", "Amount")}: {amount}</li>
                  <li>
                    {t("汇率", "FX rate")}: {effectiveRate.toLocaleString(undefined, { maximumFractionDigits: 6 })}
                  </li>
                  <li>{t("赠送价值", "Gift value")} (RMB): {calculatedGiftValue ? calculatedGiftValue.toFixed(2) : "0.00"}</li>
                  <li>{t("代付商家", "Payment agent")}: {paymentAgent}</li>
                  <li>{t("类型", "Type")}: {giftTypeLabel || "-"}</li>
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("取消", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void executeSubmit()}>
              {t("确认提交", "Confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={resetConfirmOpen} onOpenChange={setResetConfirmOpen}>
        <AlertDialogContent className="z-[2200]">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("确认重置活动赠送？", "Reset activity gift form?")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "将清空当前填写的电话、金额、代付商家、类型与备注，并删除已同步保存的草稿。此操作不可撤销。",
                "This will clear phone, amount, payment agent, type, and remark, and remove the saved draft. This cannot be undone.",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel type="button">{t("取消", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              type="button"
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                performReset();
                setResetConfirmOpen(false);
              }}
            >
              {t("确认重置", "Confirm reset")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
              <Select
                value={currency}
                onValueChange={(v) => {
                  setGiftRateManual("");
                  setCurrency(v as CurrencyCode);
                }}
              >
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
                    const cleaned = e.target.value.replace(/[^0-9.-]/g, '').replace(/(\..*)\./g, '$1').replace(/(?!^)-/g, '');
                    setAmount(cleaned);
                  }}
                  onPaste={(e) => {
                    e.preventDefault();
                    const pasted = e.clipboardData.getData('text').replace(/[^0-9.-]/g, '').replace(/(\..*)\./g, '$1').replace(/(?!^)-/g, '');
                    setAmount(prev => prev + pasted);
                  }}
                  placeholder={t('activityGift.amountPlaceholder')}
                  className="h-7 flex-1 border-orange-200 text-sm placeholder:text-muted-foreground/40"
                />
              </div>

              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
                <Label className="text-xs w-20 shrink-0 text-orange-600 pt-0 sm:pt-0">
                  * {t('activityGift.rate')}
                </Label>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex gap-1.5">
                    <Input
                      value={giftRateManual}
                      onChange={(e) => {
                        const v = e.target.value.replace(/[^0-9.,]/g, "").replace(/(\..*)\./g, "$1");
                        setGiftRateManual(v);
                      }}
                      placeholder={
                        syncedRate > 0
                          ? t("留空则用", "Blank = use") + ` ${syncedRate}`
                          : t("等待汇率或手填", "Wait for rate or type")
                      }
                      className="h-7 flex-1 text-sm border-orange-200"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 shrink-0 px-2 text-[10px]"
                      onClick={() => setGiftRateManual("")}
                    >
                      {t("同步页汇率", "Sync")}
                    </Button>
                  </div>
                  <p className="text-[10px] text-muted-foreground leading-snug">
                    {t(
                      "默认与汇率页当前币种一致；可改为您需要的数值后再提交。",
                      "Defaults to the rate shown on this page for the selected currency; override when needed.",
                    )}
                  </p>
                </div>
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
                <Button
                  type="button"
                  onClick={handleSubmit}
                  size="sm"
                  className="gap-1 h-7"
                  disabled={isPlatformAdminReadonlyView || isSubmitting}
                >
                  <Plus className="h-3 w-3" />
                  {isSubmitting ? t("提交中...", "Submitting...") : t("提交", "Submit")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1 h-7"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setResetConfirmOpen(true);
                  }}
                >
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
