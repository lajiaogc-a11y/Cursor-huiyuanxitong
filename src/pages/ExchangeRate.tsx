import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { safeNumber, safeDivide, safeMultiply, safeToFixed } from "@/lib/safeCalc";
import { cn } from "@/lib/utils";
import { trackRender } from "@/lib/performanceUtils";
// 防止重复提交的状态
let isSubmittingOrder = false;
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Send, Lock, Bell, RefreshCw, Timer, Copy, Settings, Plus, Pencil, Trash2, Image as ImageIcon, ArrowDown, Check, X, Loader2, ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { showSubmissionError } from "@/services/submissionErrorService";
import WorkMemoTab from "@/components/WorkMemoTab";
import ActivityGiftTab from "@/components/ActivityGiftTab";
import ReferralEntryTab from "@/components/ReferralEntryTab";
import MemberEntryTab from "@/components/MemberEntryTab";
import RatePosterGenerator from "@/components/RatePosterGenerator";
import RateSettingsTab from "@/components/exchange-rate/RateSettingsTab";
import ShiftHandoverTab from "@/components/ShiftHandoverTab";
import { useOrders, useUsdtOrders } from "@/hooks/useOrders";
import { useMembers } from "@/hooks/useMembers";
import { useActivityGifts } from "@/hooks/useActivityGifts";
import {
  generateMemberId,
  getFeeSettings,
  getTrxSettings,
  saveTrxSettings,
  getUnreadMemoCount,
  getUsdtFee,
} from "@/stores/systemSettings";
import { getMemberCurrentPoints, redeemPoints } from "@/stores/pointsAccountStore";
import { getActivitySettings } from "@/stores/activitySettingsStore";
import { getFinalRates } from "@/stores/exchangeRateStore";
import { useLanguage } from "@/contexts/LanguageContext";
import { CURRENCIES, CurrencyCode, getCurrencyDisplayName, CURRENCY_LIST } from "@/config/currencies";
import CurrencySelect from "@/components/CurrencySelect";
import { getActiveCustomerSources } from "@/stores/customerSourceStore";
import { getPointsLedger, initializePointsLedgerCache } from "@/stores/pointsLedgerStore";
import { getPointsSettings } from "@/stores/pointsSettingsStore";
import { getMemberLastResetTime } from "@/stores/pointsAccountStore";
import { getMemberPointsSummary } from "@/services/pointsCalculationService";
import { getExchangeRateFormData, saveExchangeRateFormData, ExchangeRateFormData } from "@/stores/exchangeRateFormStore";
import RateCalculator from "@/components/RateCalculator";
import { getCalculatorFormData, CalculatorId } from "@/hooks/useCalculatorStore";
import { getCopySettings, generateEnglishCopyText } from "@/components/CopySettingsTab";
import { getRewardAmountByPointsAndCurrency } from "@/stores/activitySettingsStore";
import { useAuth } from "@/contexts/AuthContext";
import { loadSharedData, saveSharedData, saveSharedDataSync, getSharedDataSync, subscribeToSharedData } from "@/services/sharedDataService";
import { getReferralRelations } from "@/stores/referralStore";
import { BtcPriceConfig } from "@/components/BtcPriceSettingsCard";
import BtcPriceSettingsCard from "@/components/BtcPriceSettingsCard";
import { useIsMobile } from "@/hooks/use-mobile";
import UsdtRatePanel, { UsdtLiveRates } from "@/components/UsdtRatePanel";


// 会员等级选项
const memberLevels = ["A", "B", "C", "D"];

// 从数据库获取卡片列表（异步）- 按 sort_order 升序排列
const fetchCardsFromDatabase = async (): Promise<{ id: string; name: string; cardVendors?: string[] }[]> => {
  try {
    const { supabase } = await import('@/integrations/supabase/client');
    const { data, error } = await supabase
      .from('cards')
      .select('id, name, card_vendors, sort_order')
      .eq('status', 'active')
      .order('sort_order', { ascending: true, nullsFirst: false })
      .order('name', { ascending: true });
    
    if (error) {
      console.error('Failed to fetch cards from database:', error);
      return [];
    }
    return (data || []).map(card => ({
      id: card.id,
      name: card.name,
      cardVendors: card.card_vendors || [],
    }));
  } catch (error) {
    console.error('Failed to fetch cards from database:', error);
    return [];
  }
};

// 从数据库获取卡商列表（异步）- 按 sort_order 升序排列
const fetchVendorsFromDatabase = async (): Promise<{ id: string; name: string; paymentProviders?: string[] }[]> => {
  try {
    const { supabase } = await import('@/integrations/supabase/client');
    const { data, error } = await supabase
      .from('vendors')
      .select('id, name, payment_providers, sort_order')
      .eq('status', 'active')
      .order('sort_order', { ascending: true, nullsFirst: false })
      .order('name', { ascending: true });
    
    if (error) {
      console.error('Failed to fetch vendors from database:', error);
      return [];
    }
    return (data || []).map(vendor => ({
      id: vendor.id,
      name: vendor.name,
      paymentProviders: vendor.payment_providers || [],
    }));
  } catch (error) {
    console.error('Failed to fetch vendors from database:', error);
    return [];
  }
};

// 从数据库获取代付商家列表（异步）- 按 sort_order 升序排列
const fetchPaymentProvidersFromDatabase = async (): Promise<{ id: string; name: string }[]> => {
  try {
    const { supabase } = await import('@/integrations/supabase/client');
    const { data, error } = await supabase
      .from('payment_providers')
      .select('id, name, sort_order')
      .eq('status', 'active')
      .order('sort_order', { ascending: true, nullsFirst: false })
      .order('name', { ascending: true });
    
    if (error) {
      console.error('Failed to fetch payment providers from database:', error);
      return [];
    }
    return (data || []).map(provider => ({
      id: provider.id,
      name: provider.name,
    }));
  } catch (error) {
    console.error('Failed to fetch payment providers from database:', error);
    return [];
  }
};

// 汇率采集数据类型
interface CurrencyRates {
  USD_NGN: number;
  MYR_NGN: number;
  GBP_NGN: number;
  CAD_NGN: number;
  EUR_NGN: number;
  CNY_NGN: number;
  lastUpdated: string;
}

// 默认汇率
const DEFAULT_CURRENCY_RATES: CurrencyRates = {
  USD_NGN: 1434.47,
  MYR_NGN: 304.5,
  GBP_NGN: 1931.23,
  CAD_NGN: 1045.02,
  EUR_NGN: 1681.42,
  CNY_NGN: 204.69,
  lastUpdated: new Date().toISOString(),
};

// 默认汇率（首次加载时使用，后续从数据库读取）
let currencyRatesCache: CurrencyRates = DEFAULT_CURRENCY_RATES;
let currencyRatesCacheLoaded = false;

// 初始化加载汇率（异步）
const initCurrencyRatesFromDb = async (): Promise<CurrencyRates> => {
  const saved = await loadSharedData<CurrencyRates>('currencyRatesToNGN');
  if (saved) {
    // 确保所有属性存在，合并默认值
    const merged: CurrencyRates = {
      ...DEFAULT_CURRENCY_RATES,
      ...saved,
    };
    currencyRatesCache = merged;
    currencyRatesCacheLoaded = true;
    return merged;
  }
  return DEFAULT_CURRENCY_RATES;
};

// 获取保存的汇率（同步，优先使用 sharedData 缓存，确保首次与导航返回一致）
const getSavedCurrencyRates = (): CurrencyRates => {
  const cached = getSharedDataSync<CurrencyRates | null>('currencyRatesToNGN', null);
  if (cached && typeof cached.USD_NGN === 'number') {
    currencyRatesCache = { ...DEFAULT_CURRENCY_RATES, ...cached };
    currencyRatesCacheLoaded = true;
    return currencyRatesCache;
  }
  if (currencyRatesCacheLoaded && currencyRatesCache) {
    return { ...DEFAULT_CURRENCY_RATES, ...currencyRatesCache };
  }
  initCurrencyRatesFromDb();
  return DEFAULT_CURRENCY_RATES;
};

// 保存汇率（同步更新缓存，等待数据库写入完成，确保刷新不丢失）
const saveCurrencyRates = async (rates: CurrencyRates) => {
  currencyRatesCache = rates;
  currencyRatesCacheLoaded = true;
  await saveSharedData('currencyRatesToNGN', rates);
};

const DEFAULT_INTERVAL = 7200; // 2小时

// 获取自动更新设置（兼容 object {enabled, interval} 与 boolean 两种存储格式）
const getCurrencyRatesAutoUpdate = (): boolean => {
  const raw = getSharedDataSync<boolean | { enabled?: boolean; interval?: number }>('currencyRatesAutoUpdate', true);
  if (typeof raw === 'boolean') return raw;
  return raw?.enabled ?? true;
};

// 获取自动更新间隔（秒）
const getCurrencyRatesInterval = (): number => {
  const raw = getSharedDataSync<boolean | { enabled?: boolean; interval?: number }>('currencyRatesAutoUpdate', true);
  if (typeof raw === 'object' && raw !== null && typeof raw.interval === 'number' && raw.interval > 0) {
    return raw.interval;
  }
  return DEFAULT_INTERVAL;
};

// 保存自动更新设置（enabled + interval）
const saveCurrencyRatesAutoUpdate = async (enabled: boolean, interval?: number) => {
  const raw = await loadSharedData<boolean | { enabled?: boolean; interval?: number }>('currencyRatesAutoUpdate');
  const currentInterval = typeof raw === 'object' && raw !== null && typeof raw.interval === 'number'
    ? raw.interval
    : DEFAULT_INTERVAL;
  const toSave = { enabled, interval: interval ?? currentInterval };
  await saveSharedData('currencyRatesAutoUpdate', toSave);
};

// 保存自动更新间隔
const saveCurrencyRatesInterval = async (interval: number) => {
  const raw = await loadSharedData<boolean | { enabled?: boolean; interval?: number }>('currencyRatesAutoUpdate');
  const enabled = typeof raw === 'boolean' ? raw : (raw?.enabled ?? true);
  await saveSharedData('currencyRatesAutoUpdate', { enabled, interval });
};

// 通过 Supabase Edge Function 采集国际汇率（避免浏览器 CORS 限制）
const fetchCurrencyRatesToNGN = async (): Promise<CurrencyRates | null> => {
  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  try {
    const response = await fetch(
      `https://${projectId}.supabase.co/functions/v1/fetch-usdt-rates`,
      {
        method: 'POST',
        signal: AbortSignal.timeout(10000),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${anonKey}`,
          'apikey': anonKey,
        },
        body: JSON.stringify({ includeForex: true }),
      }
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const rates = data?.currencyRatesToNGN;
    if (rates && typeof rates.USD_NGN === 'number') {
      return {
        USD_NGN: rates.USD_NGN,
        MYR_NGN: rates.MYR_NGN ?? DEFAULT_CURRENCY_RATES.MYR_NGN,
        GBP_NGN: rates.GBP_NGN ?? DEFAULT_CURRENCY_RATES.GBP_NGN,
        CAD_NGN: rates.CAD_NGN ?? DEFAULT_CURRENCY_RATES.CAD_NGN,
        EUR_NGN: rates.EUR_NGN ?? DEFAULT_CURRENCY_RATES.EUR_NGN,
        CNY_NGN: rates.CNY_NGN ?? DEFAULT_CURRENCY_RATES.CNY_NGN,
        lastUpdated: rates.lastUpdated ?? new Date().toISOString(),
      };
    }
    throw new Error('Invalid currency rates response');
  } catch (error) {
    console.error('Failed to fetch currency rates:', error);
    return null;
  }
};


const fetchRealTimeBtcRate = async (): Promise<number> => {
  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  try {
    const response = await fetch(
      `https://${projectId}.supabase.co/functions/v1/fetch-usdt-rates`,
      {
        method: 'POST',
        signal: AbortSignal.timeout(10000),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${anonKey}`,
          'apikey': anonKey,
        },
        body: JSON.stringify({ includeBtc: true }),
      }
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const price = data?.btc?.price;
    if (price && price > 0) return price;
    throw new Error(data?.btc?.error || 'BTC price unavailable');
  } catch (error) {
    throw error instanceof Error ? error : new Error(String(error));
  }
};

export default function ExchangeRate() {
  trackRender('ExchangeRate');
  const { t } = useLanguage();
  const { employee } = useAuth();
  const isMobile = useIsMobile();
  
  // 使用数据库hooks获取订单数据
  const { orders, addOrder } = useOrders();
  const { orders: usdtOrdersList, addOrder: addUsdtOrderDb } = useUsdtOrders();
  const { members, addMember, updateMemberByPhoneAsync, findMemberByPhone } = useMembers();
  
  // 使用数据库hooks获取活动赠送
  const { addGift: addActivityGift } = useActivityGifts();
  
  // 从商家管理动态获取的数据
  const [cardsList, setCardsList] = useState<{ id: string; name: string; cardVendors?: string[] }[]>([]);
  const [vendorsList, setVendorsList] = useState<{ id: string; name: string; paymentProviders?: string[] }[]>([]);
  const [paymentProvidersList, setPaymentProvidersList] = useState<{ id: string; name: string }[]>([]);
  
  // 基础信息
  const [cardType, setCardType] = useState("");
  const [cardMerchant, setCardMerchant] = useState("");
  const [paymentAgent, setPaymentAgent] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [memberCode, setMemberCode] = useState("");
  const [memberLevel, setMemberLevel] = useState("");
  const [selectedCommonCards, setSelectedCommonCards] = useState<string[]>([]);
  const [customerFeature, setCustomerFeature] = useState("");
  const [remarkOrder, setRemarkOrder] = useState(""); // 备注（订单）
  const [remarkMember, setRemarkMember] = useState(""); // 备注（会员）
  const [bankCard, setBankCard] = useState(""); // 银行卡
  const [bankCardError, setBankCardError] = useState(""); // 银行卡验证错误
  const [customerSource, setCustomerSource] = useState(""); // 客户来源
  const [customerSources, setCustomerSources] = useState<{ id: string; name: string }[]>([]); // 来源列表

  // 汇率设置 - 初始化时从数据库读取，使用内存缓存而非 localStorage
  // 默认值仅在首次加载且数据库无数据时使用
  const [usdtRate, setUsdtRate] = useState<number | null>(null);
  const [nairaRate, setNairaRate] = useState<number | null>(null);
  const [cediRate, setCediRate] = useState<number | null>(null);
  const [btcPrice, setBtcPrice] = useState<number | null>(null); // BTC价格 - 从数据库加载，初始为null显示骨架屏
  const [ratesInitialized, setRatesInitialized] = useState(false); // 汇率是否已从数据库初始化
  // USDT手续费 - 从系统设置读取，持久化存储
  const [usdtFee, setUsdtFee] = useState(() => {
    return getUsdtFee().toString();
  });

  // USDT live rate bid/ask
  const [usdtBid, setUsdtBid] = useState(0);
  const [usdtAsk, setUsdtAsk] = useState(0);
  
  // 初始化时从系统设置加载BTC价格
  useEffect(() => {
    const loadRatesFromSettings = async () => {
      try {
        // USDT rate is now managed by UsdtRatePanel, just set a safe default
        if (usdtRate === null) {
          setUsdtRate(7.05);
        }
        // 加载BTC价格（从新的btcPriceSettings）
        const btcConfig = await loadSharedData<{
          rawPrice: number;
          multiplierPercent: number;
          calculatedPrice: number;
          autoRefreshEnabled: boolean;
          refreshIntervalSeconds: number;
          lastUpdated: string;
        }>('btcPriceSettings');
        if (btcConfig?.calculatedPrice != null) {
          setBtcPrice(btcConfig.calculatedPrice);
        } else {
          // 没有配置时设置为0，表示未采集
          setBtcPrice(0);
        }
      } catch (error) {
        console.error('Failed to load rates from settings:', error);
        // 加载失败时设置为0而非硬编码值
        setBtcPrice(0);
      }
    };
    loadRatesFromSettings();
  }, []);

  // 订阅共享数据变更（BTC价格、快捷设置、汇率自动更新）
  useEffect(() => {
    const unsubscribe = subscribeToSharedData((key, value) => {
      if (key === 'btcPriceSettings' && value) {
        const btcConfig = value as BtcPriceConfig;
        if (btcConfig.calculatedPrice) {
          setBtcPrice(btcConfig.calculatedPrice);
        }
      }
      if (key === 'quickAmounts' && value && Array.isArray(value)) {
        setQuickAmounts((value as string[]).map(String));
      }
      if (key === 'quickRates' && value && Array.isArray(value)) {
        setQuickRates((value as string[]).map(String));
      }
      if (key === 'currencyRatesAutoUpdate' && value !== null && value !== undefined) {
        const raw = value as boolean | { enabled?: boolean; interval?: number };
        const enabled = typeof raw === 'boolean' ? raw : (raw?.enabled ?? true);
        const interval = typeof raw === 'object' && raw !== null && typeof raw.interval === 'number'
          ? raw.interval
          : DEFAULT_INTERVAL;
        setCurrencyRatesAutoUpdate(enabled);
        setCurrencyRatesInterval(interval);
      }
      if (key === 'calculatorInputRates' && value && typeof value === 'object') {
        const rates = value as { nairaRate?: number; cediRate?: number };
        if (rates.nairaRate != null && rates.nairaRate > 0) setNairaRate(rates.nairaRate);
        if (rates.cediRate != null && rates.cediRate > 0) setCediRate(rates.cediRate);
      }
      if (key === 'currencyRatesToNGN' && value && typeof value === 'object') {
        const rates = value as CurrencyRates;
        if (typeof rates.USD_NGN === 'number') {
          const merged = { ...DEFAULT_CURRENCY_RATES, ...rates };
          currencyRatesCache = merged;
          currencyRatesCacheLoaded = true;
          setCurrencyRates(merged);
        }
      }
    });
    return unsubscribe;
  }, []);

  // BTC price polling fallback (every 60s) - ensures price stays fresh even if Realtime events are missed
  useEffect(() => {
    const pollBtcPrice = async () => {
      try {
        const btcConfig = await loadSharedData<BtcPriceConfig>('btcPriceSettings');
        if (btcConfig?.calculatedPrice != null && btcConfig.calculatedPrice > 0) {
          setBtcPrice(btcConfig.calculatedPrice);
        }
      } catch (e) {
        console.error('BTC price poll failed:', e);
      }
    };
    const interval = setInterval(pollBtcPrice, 60000);
    return () => clearInterval(interval);
  }, []);

  // 快捷金额和汇率
  const [quickAmounts, setQuickAmounts] = useState<string[]>([]);
  const [quickRates, setQuickRates] = useState<string[]>([]);
  const [quickSettingsLoaded, setQuickSettingsLoaded] = useState(false);
  const [editingAmountIndex, setEditingAmountIndex] = useState<number | null>(null);
  const [editingRateIndex, setEditingRateIndex] = useState<number | null>(null);


  // 利润分析百分比（可编辑，支持负数，显示为%格式）- 从数据库持久化
  const [profitRates, setProfitRates] = useState<string[]>(['3', '5', '8', '10', '15']);
  const [profitRatesInitialized, setProfitRatesInitialized] = useState(false);

  // 工作备忘未读数 - 自动计算
  const [memoUnreadCount, setMemoUnreadCount] = useState(0);
  
  // Tab响应式溢出导航
  const tabsContainerRef = useRef<HTMLDivElement>(null);
  const [visibleTabCount, setVisibleTabCount] = useState(8); // 默认显示所有8个Tab
  
  // Tab配置数组
  const TAB_CONFIG = useMemo(() => [
    { value: 'calc1', label: { zh: '汇率计算1', en: 'Calc 1' } },
    { value: 'calc2', label: { zh: '汇率计算2', en: 'Calc 2' } },
    { value: 'calc3', label: { zh: '汇率计算3', en: 'Calc 3' } },
    { value: 'activity', label: { zh: '活动赠送', en: 'Gifts' } },
    { value: 'memo', label: { zh: '工作备忘', en: 'Memos' }, showBadge: true },
    { value: 'referral', label: { zh: '推荐录入', en: 'Referral' } },
    { value: 'rateSettings', label: { zh: '海报设置', en: 'Poster Settings' } },
    { value: 'memberEntry', label: { zh: '新增会员', en: 'New Member' } },
    { value: 'shiftHandover', label: { zh: '交班对账', en: 'Handover' } },
  ], []);
  
  // 可见Tab和溢出Tab
  const visibleTabs = useMemo(() => TAB_CONFIG.slice(0, visibleTabCount), [TAB_CONFIG, visibleTabCount]);
  const overflowTabs = useMemo(() => TAB_CONFIG.slice(visibleTabCount), [TAB_CONFIG, visibleTabCount]);
  
  // ResizeObserver监听容器宽度变化
  useEffect(() => {
    const container = tabsContainerRef.current;
    if (!container) return;
    
    const calculateVisibleTabs = () => {
      const containerWidth = container.offsetWidth;
      // 每个Tab平均宽度约90px（中文）或75px（英文），"更多"按钮约70px
      const tabWidth = 90;
      const moreButtonWidth = 80;
      const padding = 20; // 容器内边距
      const availableWidth = containerWidth - moreButtonWidth - padding;
      const count = Math.floor(availableWidth / tabWidth);
      // 至少显示3个Tab，最多全部显示（8个）
      setVisibleTabCount(Math.min(Math.max(count, 3), TAB_CONFIG.length));
    };
    
    const observer = new ResizeObserver(calculateVisibleTabs);
    observer.observe(container);
    calculateVisibleTabs(); // 初始计算
    
    return () => observer.disconnect();
  }, [TAB_CONFIG.length]);

  // 当前选中的tab - 使用数据库持久化，支持跨设备同步
  const [activeTab, setActiveTab] = useState(() => {
    // 从 sessionStorage 读取临时状态（页面内导航）
    return sessionStorage.getItem('exchangeRateActiveTab') || 'calc1';
  });
  
  // Tab 切换处理 - 保存到 sessionStorage 以便导航返回时恢复
  const handleTabChange = useCallback((value: string) => {
    const prevTab = activeTab;
    setActiveTab(value);
    
    // 保存到 sessionStorage（用于页面导航后返回时恢复）
    sessionStorage.setItem('exchangeRateActiveTab', value);
    
    // 仅在计算器切换时显示提示
    const calcTabs = ['calc1', 'calc2', 'calc3'];
    if (calcTabs.includes(value) && calcTabs.includes(prevTab) && value !== prevTab) {
      const tabNames: Record<string, string> = {
        calc1: '汇率计算 1',
        calc2: '汇率计算 2', 
        calc3: '汇率计算 3',
      };
      toast.success(`已切换到 ${tabNames[value]}`, {
        duration: 1500,
        icon: '✓',
      });
    }
  }, [activeTab]);
  
  // 初始化时从数据库加载利润分析百分比
  useEffect(() => {
    const loadProfitRates = async () => {
      const savedRates = await loadSharedData<string[]>('profitAnalysisRates' as any);
      if (savedRates && savedRates.length > 0) {
        setProfitRates(savedRates);
      }
      setProfitRatesInitialized(true);
    };
    loadProfitRates();
  }, []);
  
  // 利润分析百分比变化时保存到数据库
  useEffect(() => {
    if (profitRatesInitialized) {
      saveSharedData('profitAnalysisRates' as any, profitRates);
    }
  }, [profitRates, profitRatesInitialized]);


  // 汇率采集状态
  const [currencyRates, setCurrencyRates] = useState<CurrencyRates>(getSavedCurrencyRates);
  const [currencyRatesAutoUpdate, setCurrencyRatesAutoUpdate] = useState(getCurrencyRatesAutoUpdate);
  const [currencyRatesInterval, setCurrencyRatesInterval] = useState(getCurrencyRatesInterval);
  const [currencyRatesCountdown, setCurrencyRatesCountdown] = useState(getCurrencyRatesInterval);
  const currencyRatesCountdownRef = useRef<NodeJS.Timeout | null>(null);

  // 积分兑换对话框状态 - 与会员管理活动数据保持一致
  const [isRedeemDialogOpen, setIsRedeemDialogOpen] = useState(false);
  const [isRedeemConfirmOpen, setIsRedeemConfirmOpen] = useState(false);
  const [redeemPaymentProvider, setRedeemPaymentProvider] = useState("");
  const [redeemRemark, setRedeemRemark] = useState("");
  const [redeemPreviewData, setRedeemPreviewData] = useState<{
    memberCode: string;
    phoneNumber: string;
    remainingPoints: number;
    currency: 'NGN' | 'GHS' | 'USDT';
    rewardAmount: number;
    currentRate: number;
    fee: number;
    giftValue: number;
  } | null>(null);
  // 初始化时获取未读数、汇率设置和商家数据
  useEffect(() => {
    const count = getUnreadMemoCount();
    setMemoUnreadCount(count);
    
    setCustomerSources(getActiveCustomerSources());
    
    // 初始化积分缓存（确保推荐积分数据可用）
    initializePointsLedgerCache();
    
    // 异步加载商家管理数据（从数据库）
    const loadMerchantData = async () => {
      const [cards, vendors, providers] = await Promise.all([
        fetchCardsFromDatabase(),
        fetchVendorsFromDatabase(),
        fetchPaymentProvidersFromDatabase(),
      ]);
      setCardsList(cards);
      setVendorsList(vendors);
      setPaymentProvidersList(providers);
    };
    loadMerchantData();
    
    // 从数据库加载快捷金额和汇率设置
    const loadQuickSettings = async () => {
      const savedAmounts = await loadSharedData<string[]>('quickAmounts');
      const savedRates = await loadSharedData<string[]>('quickRates');
      
      // 默认8个值
      const defaultAmounts = ['50', '100', '200', '300', '500', '1000', '1500', '2000'];
      const defaultRates = ['5.7', '5.8', '5.95', '6.22', '6.57', '6.8', '7.0', '7.26'];
      
      // 加载并确保有8个值（数据迁移兼容）
      if (savedAmounts && savedAmounts.length > 0) {
        const extendedAmounts = savedAmounts.length >= 8 
          ? savedAmounts.slice(0, 8) 
          : [...savedAmounts, ...defaultAmounts.slice(savedAmounts.length)].slice(0, 8);
        setQuickAmounts(extendedAmounts.map(String));
        
        if (savedAmounts.length < 8) {
          saveSharedData('quickAmounts', extendedAmounts.map(String));
        }
      } else {
        setQuickAmounts(defaultAmounts);
      }
      
      if (savedRates && savedRates.length > 0) {
        const extendedRates = savedRates.length >= 8 
          ? savedRates.slice(0, 8) 
          : [...savedRates, ...defaultRates.slice(savedRates.length)].slice(0, 8);
        setQuickRates(extendedRates.map(String));
        
        if (savedRates.length < 8) {
          saveSharedData('quickRates', extendedRates.map(String));
        }
      } else {
        setQuickRates(defaultRates);
      }
      
      setQuickSettingsLoaded(true);
    };
    loadQuickSettings();
    
    // 从数据库加载手动输入的汇率（奈拉/赛地）- 确保所有用户同步
    const loadInputRates = async () => {
      const savedRates = await loadSharedData<{
        nairaRate: number;
        cediRate: number;
        usdtRate: number;
        lastUpdated: string;
      }>('calculatorInputRates');
      if (savedRates) {
        if (savedRates.nairaRate && savedRates.nairaRate > 0) {
          setNairaRate(savedRates.nairaRate);
        } else {
          setNairaRate(210); // 数据库无数据时使用安全默认值
        }
        if (savedRates.cediRate && savedRates.cediRate > 0) {
          setCediRate(savedRates.cediRate);
        } else {
          setCediRate(0.6);
        }
        console.log('[ExchangeRate] Loaded saved rates from database:', savedRates);
      } else {
        // 数据库完全无数据，使用安全默认值
        setNairaRate(210);
        setCediRate(0.6);
      }
      setRatesInitialized(true);
    };
    loadInputRates();
    
    // 异步加载汇率采集数据（currencyRatesToNGN）- 确保首次进入与导航返回后显示一致
    loadSharedData<CurrencyRates>('currencyRatesToNGN').then((saved) => {
      if (saved && typeof saved.USD_NGN === 'number') {
        const merged = { ...DEFAULT_CURRENCY_RATES, ...saved };
        currencyRatesCache = merged;
        currencyRatesCacheLoaded = true;
        setCurrencyRates(merged);
      }
    }).catch(console.error);

    // 异步加载汇率自动更新设置（避免 getSharedDataSync 返回默认值后不再更新）
    loadSharedData<boolean | { enabled?: boolean; interval?: number }>('currencyRatesAutoUpdate').then((raw) => {
      if (raw !== null) {
        const enabled = typeof raw === 'boolean' ? raw : (raw?.enabled ?? true);
        const interval = typeof raw === 'object' && raw !== null && typeof raw.interval === 'number'
          ? raw.interval
          : DEFAULT_INTERVAL;
        setCurrencyRatesAutoUpdate(enabled);
        setCurrencyRatesInterval(interval);
      }
    }).catch(console.error);
    
    // 恢复表单数据
    const savedFormData = getExchangeRateFormData();
    if (savedFormData) {
      setCardType(savedFormData.cardType || "");
      setCardMerchant(savedFormData.cardMerchant || "");
      setPaymentAgent(savedFormData.paymentAgent || "");
      setPhoneNumber(savedFormData.phoneNumber || "");
      setMemberCode(savedFormData.memberCode || "");
      setMemberLevel(savedFormData.memberLevel || "");
      setSelectedCommonCards(savedFormData.selectedCommonCards || []);
      setCustomerFeature(savedFormData.customerFeature || "");
      setRemarkOrder(savedFormData.remarkOrder || "");
      setRemarkMember(savedFormData.remarkMember || "");
      setBankCard(savedFormData.bankCard || "");
      setCardValue(savedFormData.cardValue || "");
      setCardRate(savedFormData.cardRate || "");
      setPayNaira(savedFormData.payNaira || "");
      setPayCedi(savedFormData.payCedi || "");
      setPayUsdt(savedFormData.payUsdt || "");
      if (savedFormData.nairaRate) setNairaRate(savedFormData.nairaRate);
      if (savedFormData.cediRate) setCediRate(savedFormData.cediRate);
      setCurrencyPreferenceList(savedFormData.currencyPreferenceList || []);
      setCustomerSource(savedFormData.customerSource || "");
    }
    
    // 每30秒刷新未读数和客户来源（商家数据改用realtime订阅）
    const interval = setInterval(() => {
      const newCount = getUnreadMemoCount();
      setMemoUnreadCount(newCount);
      setCustomerSources(getActiveCustomerSources());
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  // Realtime subscription for merchant tables (cards, payment_providers)
  // Ensures all accounts see new cards/vendors/providers immediately
  useEffect(() => {
    const refetchMerchants = async () => {
      const [cards, vendors, providers] = await Promise.all([
        fetchCardsFromDatabase(),
        fetchVendorsFromDatabase(),
        fetchPaymentProvidersFromDatabase(),
      ]);
      setCardsList(cards);
      setVendorsList(vendors);
      setPaymentProvidersList(providers);
    };

    const channel = supabase
      .channel('exchange-merchant-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cards' }, () => refetchMerchants())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vendors' }, () => refetchMerchants())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payment_providers' }, () => refetchMerchants())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  // 定期刷新USDT手续费（从系统设置读取）
  useEffect(() => {
    const interval = setInterval(() => {
      const fee = getUsdtFee();
      setUsdtFee(fee.toString());
    }, 5000); // 每5秒刷新一次
    return () => clearInterval(interval);
  }, []);

  // 监听汇率变化，同步到数据库（等待写入完成，确保刷新不丢失）
  useEffect(() => {
    if (!ratesInitialized || nairaRate === null || cediRate === null) return;
    const save = async () => {
      const ok = await saveSharedData('calculatorInputRates', {
        nairaRate,
        cediRate,
        usdtRate: usdtRate ?? 0,
        lastUpdated: new Date().toISOString(),
      });
      if (!ok) console.error('[ExchangeRate] Failed to save calculatorInputRates');
    };
    save();
  }, [nairaRate, cediRate, usdtRate, ratesInitialized]);



  // 刷新汇率采集（isManual: 用户点击刷新时 true，自动/页面切换触发时 false）
  // 自动触发失败时静默使用缓存，避免每次切换页面都弹「汇率采集失败」
  const handleRefreshCurrencyRates = useCallback(async (isManual = false) => {
    const oldRates = currencyRates;
    const newRates = await fetchCurrencyRatesToNGN();
    
    if (newRates) {
      // 检查汇率是否有变化
      const hasChanged = 
        Math.abs(newRates.USD_NGN - oldRates.USD_NGN) > 0.01 ||
        Math.abs(newRates.GBP_NGN - oldRates.GBP_NGN) > 0.01 ||
        Math.abs(newRates.CAD_NGN - oldRates.CAD_NGN) > 0.01 ||
        Math.abs(newRates.EUR_NGN - oldRates.EUR_NGN) > 0.01 ||
        Math.abs(newRates.CNY_NGN - oldRates.CNY_NGN) > 0.01;
      
      if (hasChanged) {
        setCurrencyRates(newRates);
        await saveCurrencyRates(newRates);
        toast.success("汇率采集已更新");
      } else {
        // 更新时间但不更新汇率
        const updatedRates = { ...oldRates, lastUpdated: new Date().toISOString() };
        setCurrencyRates(updatedRates);
        await saveCurrencyRates(updatedRates);
        if (isManual) toast.info("汇率无变化");
      }
      setCurrencyRatesCountdown(currencyRatesInterval);
    } else {
      // 采集失败：手动刷新时提示，自动刷新时静默使用缓存
      if (isManual) {
        toast.error("汇率采集失败");
      }
    }
  }, [currencyRates, currencyRatesInterval]);

  // 切换自动更新（等待保存完成）
  const handleToggleCurrencyRatesAutoUpdate = useCallback(async () => {
    const newValue = !currencyRatesAutoUpdate;
    setCurrencyRatesAutoUpdate(newValue);
    await saveCurrencyRatesAutoUpdate(newValue, currencyRatesInterval);
    toast.success(newValue ? "已开启自动更新" : "已关闭自动更新");
  }, [currencyRatesAutoUpdate, currencyRatesInterval]);

  // 修改自动更新间隔
  const handleChangeCurrencyRatesInterval = useCallback(async (intervalSeconds: number) => {
    setCurrencyRatesInterval(intervalSeconds);
    await saveCurrencyRatesInterval(intervalSeconds);
    if (currencyRatesAutoUpdate) {
      setCurrencyRatesCountdown(intervalSeconds);
    }
    toast.success("更新间隔已保存");
  }, [currencyRatesAutoUpdate]);

  // 汇率采集自动更新 - 基于 lastUpdated 计算剩余时间，导航切换回来不触发刷新
  useEffect(() => {
    const interval = getCurrencyRatesInterval();
    if (currencyRates.lastUpdated) {
      const lastTime = new Date(currencyRates.lastUpdated).getTime();
      const now = Date.now();
      const elapsed = Math.floor((now - lastTime) / 1000);
      const remaining = Math.max(0, interval - elapsed);
      setCurrencyRatesCountdown(remaining);
      setCurrencyRatesInterval(interval);
      // 不在此处触发刷新，严格按倒计时；超时后由定时器触发
    } else {
      setCurrencyRatesCountdown(interval);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  
  // 自动更新倒计时（严格按设定间隔，导航切换不触发额外刷新）
  useEffect(() => {
    const interval = currencyRatesInterval;
    if (currencyRatesAutoUpdate && interval > 0) {
      currencyRatesCountdownRef.current = setInterval(() => {
        setCurrencyRatesCountdown(prev => {
          if (prev <= 1) {
            handleRefreshCurrencyRates();
            return interval;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (currencyRatesCountdownRef.current) {
        clearInterval(currencyRatesCountdownRef.current);
      }
    };
  }, [currencyRatesAutoUpdate, currencyRatesInterval, handleRefreshCurrencyRates]);


  // 卡片信息（用于旧逻辑兼容，新逻辑使用计算器独立状态）
  const [cardValue, setCardValue] = useState("");
  const [cardRate, setCardRate] = useState("");

  // 用于触发 cashSpecial 刷新的计数器
  const [cashSpecialRefresh, setCashSpecialRefresh] = useState(0);
  
  // 定期刷新 cashSpecial（每500ms检查一次当前计算器的cardRate）
  useEffect(() => {
    const interval = setInterval(() => {
      setCashSpecialRefresh(prev => prev + 1);
    }, 500);
    return () => clearInterval(interval);
  }, []);

  // 安全汇率值（null时使用0，防止计算错误）
  const safeNairaRate = nairaRate ?? 0;
  const safeCediRate = cediRate ?? 0;
  const safeUsdtRateMid = usdtRate ?? 0;

  // 支付金额（互斥）
  const [payNaira, setPayNaira] = useState("");
  const [payCedi, setPayCedi] = useState("");
  const [payUsdt, setPayUsdt] = useState("");

  // Dynamic USDT rate: bid when payUsdt has value, ask when empty
  const safeUsdtRate = useMemo(() => {
    const payUsdtVal = parseFloat(payUsdt) || 0;
    if (payUsdtVal > 0) {
      return usdtBid > 0 ? usdtBid : safeUsdtRateMid;
    }
    return usdtAsk > 0 ? usdtAsk : safeUsdtRateMid;
  }, [payUsdt, usdtBid, usdtAsk, safeUsdtRateMid]);

  // Label for which USDT rate is active
  const usdtRateLabel = useMemo(() => {
    const payUsdtVal = parseFloat(payUsdt) || 0;
    if (usdtBid === 0 && usdtAsk === 0) return '';
    return payUsdtVal > 0 ? '买入价' : '卖出价';
  }, [payUsdt, usdtBid, usdtAsk]);

  // 现金专属（只读计算）= 当前激活计算器的卡片汇率 × USDT汇率
  const cashSpecial = useMemo(() => {
    const calcTabs = ['calc1', 'calc2', 'calc3'];
    if (calcTabs.includes(activeTab)) {
      const calcFormData = getCalculatorFormData(activeTab as CalculatorId);
      const rate = parseFloat(calcFormData.cardRate) || 0;
      return (rate * safeUsdtRate).toFixed(2);
    }
    return '0.00';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, usdtRate, cashSpecialRefresh, safeUsdtRate]);

  const [currencyPreferenceList, setCurrencyPreferenceList] = useState<string[]>([]);

  // 保存表单数据到本地存储 - 当任何表单字段变化时
  useEffect(() => {
    // 只有在有数据时才保存，避免初始化时覆盖已保存的数据
    if (cardType || cardMerchant || phoneNumber || cardValue || cardRate || payNaira || payCedi || payUsdt) {
      const formData: ExchangeRateFormData = {
        cardType,
        cardMerchant,
        paymentAgent,
        phoneNumber,
        memberCode,
        memberLevel,
        selectedCommonCards,
        customerFeature,
        remarkOrder,
        remarkMember,
        bankCard,
        cardValue,
        cardRate,
        payNaira,
        payCedi,
        payUsdt,
        nairaRate,
        cediRate,
        currencyPreferenceList,
        customerSource,
      };
      saveExchangeRateFormData(formData);
    }
  }, [cardType, cardMerchant, paymentAgent, phoneNumber, memberCode, memberLevel, selectedCommonCards, customerFeature, remarkOrder, remarkMember, bankCard, cardValue, cardRate, payNaira, payCedi, payUsdt, nairaRate, cediRate, currencyPreferenceList, customerSource]);
  // 电话号码自动匹配会员 - 只允许阿拉伯数字，最长18位
  // 重要：必须从数据库实时查询，禁止使用缓存
  const handlePhoneNumberChange = useCallback(async (value: string) => {
    // 只保留阿拉伯数字 (0-9)，自动去除空格和其他字符，最长18位
    const cleanedValue = value.replace(/[^0-9]/g, '').slice(0, 18);
    setPhoneNumber(cleanedValue);
    
    if (cleanedValue.length >= 8) {
      // 从数据库实时查询会员（禁止使用缓存）
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
          // 会员存在 - 填充只读和可编辑字段
          setMemberCode(dbMember.member_code);
          setMemberLevel(dbMember.member_level || 'D');
          setSelectedCommonCards(dbMember.common_cards || []);
          setCustomerFeature(dbMember.customer_feature || "");
          setBankCard(dbMember.bank_card || "");
          setRemarkMember(dbMember.remark || "");
          setCurrencyPreferenceList(dbMember.currency_preferences || []);
          setCustomerSource(dbMember.source_id || "");
          toast.success(`已匹配到会员: ${dbMember.member_code}`);
        } else {
          // 新会员 - 清空所有字段并生成新编号
          const newMemberCode = generateMemberId();
          setMemberCode(newMemberCode);
          setMemberLevel("D");
          setSelectedCommonCards([]);
          setCustomerFeature("");
          setBankCard("");
          setRemarkMember("");
          setCurrencyPreferenceList([]);
          setCustomerSource("");
          toast.info(`新会员，已生成编号: ${newMemberCode}`);
        }
      } catch (err) {
        console.error('查询会员出错:', err);
      }
    } else {
      // 号码太短，清空所有字段
      setMemberCode("");
      setMemberLevel("");
      setSelectedCommonCards([]);
      setCustomerFeature("");
      setBankCard("");
      setRemarkMember("");
      setCurrencyPreferenceList([]);
      setCustomerSource("");
    }
  }, []);

  // 互斥逻辑：填写一个清空其他
  const handlePayNairaChange = (value: string) => {
    const cleaned = value.replace(/[^\d.]/g, '');
    setPayNaira(cleaned);
    if (cleaned) {
      setPayCedi("");
      setPayUsdt("");
    }
  };

  const handlePayCediChange = (value: string) => {
    const cleaned = value.replace(/[^\d.]/g, '');
    setPayCedi(cleaned);
    if (cleaned) {
      setPayNaira("");
      setPayUsdt("");
    }
  };

  const handlePayUsdtChange = (value: string) => {
    const cleaned = value.replace(/[^\d.]/g, '');
    setPayUsdt(cleaned);
    if (cleaned) {
      setPayNaira("");
      setPayCedi("");
    }
  };

  // USDT手续费数值
  const usdtFeeNum = parseFloat(usdtFee) || 0;
  
  // (safe rate values moved above cashSpecial useMemo)

  // 支付BTC = 支付USDT / BTC价格（保留8位小数）
  const payBtc = useMemo(() => {
    const usdt = parseFloat(payUsdt) || 0;
    if (usdt > 0 && btcPrice > 0) {
      return (usdt / btcPrice).toFixed(8);
    }
    return "";
  }, [payUsdt, btcPrice]);

  // 获取手续费设置
  const feeSettings = getFeeSettings();

  // 填充奈拉金额（取500的整数，向下取整）
  const fillNairaAmount = (value: string) => {
    const num = parseInt(value) || 0;
    const rounded = Math.floor(num / 500) * 500;
    setPayNaira(rounded.toString());
    setPayCedi("");
    setPayUsdt("");
    toast.success(`已填入支付奈拉: ${rounded}`);
  };

  // 填充赛地金额（取整数，向下取整）
  const fillCediAmount = (value: string) => {
    const num = parseFloat(value) || 0;
    const rounded = Math.floor(num);
    setPayCedi(rounded.toString());
    setPayNaira("");
    setPayUsdt("");
    toast.success(`已填入支付赛地: ${rounded}`);
  };

  // 填充USDT金额（取整数，向下取整）
  const fillUsdtAmount = (value: string) => {
    const num = parseFloat(value) || 0;
    const rounded = Math.floor(num);
    setPayUsdt(rounded.toString());
    setPayNaira("");
    setPayCedi("");
    toast.success(`已填入支付USDT: ${rounded}`);
  };

  // 复制银行卡信息
  const copyBankCard = () => {
    if (bankCard) {
      navigator.clipboard.writeText(bankCard);
      toast.success(t("复制成功", "Copy successful"));
    }
  };

  // 验证银行卡格式: 6-18位数字 + 空格 + 英文名
  const validateBankCard = (value: string): boolean => {
    if (!value) {
      setBankCardError("");
      return true;
    }
    const pattern = /^\d{6,18}\s+[a-zA-Z\s]+$/;
    if (!pattern.test(value)) {
      setBankCardError(t("格式错误，例如: 8027489826 opay", "Invalid format, e.g., 8027489826 opay"));
      return false;
    }
    setBankCardError("");
    return true;
  };

  const handleBankCardChange = (value: string) => {
    setBankCard(value);
    validateBankCard(value);
  };

  // 利润分析计算
  const profitAnalysis = useMemo(() => {
    const value = parseFloat(cardValue) || 0;
    const rate = parseFloat(cardRate) || 0;
    const cardWorthRMB = value * rate;
    const rates = profitRates.map(r => parseFloat(r) / 100 || 0);
    
    const naira = rates.map(r => {
      if (cardWorthRMB <= 0) return '0';
      const basePayment = cardWorthRMB * (1 - r);
      const estimatedNaira = basePayment * safeNairaRate;
      const fee = estimatedNaira < feeSettings.nairaThreshold 
        ? feeSettings.nairaFeeBelow 
        : feeSettings.nairaFeeAbove;
      const result = basePayment * safeNairaRate - fee * safeNairaRate;
      return Math.round(result).toString();
    });
    
    const cedi = rates.map(r => {
      if (cardWorthRMB <= 0) return '0.0';
      const basePayment = cardWorthRMB * (1 - r);
      const estimatedCedi = safeCediRate > 0 ? basePayment / safeCediRate : 0;
      const fee = estimatedCedi < feeSettings.cediThreshold 
        ? feeSettings.cediFeeBelow 
        : feeSettings.cediFeeAbove;
      // 手续费是赛地单位，直接从赛地金额扣除
      const result = safeCediRate > 0 ? basePayment / safeCediRate - fee : 0;
      return result.toFixed(1);
    });
    
    // 利润分析USDT始终使用买入价(bid)
    const usdtBidRate = usdtBid > 0 ? usdtBid : safeUsdtRate;
    const usdt = rates.map(r => {
      if (cardWorthRMB <= 0) return '0.0';
      const basePayment = cardWorthRMB * (1 - r);
      const result = usdtBidRate > 0 ? basePayment / usdtBidRate - usdtFeeNum : 0;
      return result.toFixed(1);
    });
    
    return { naira, cedi, usdt };
  }, [cardValue, cardRate, nairaRate, cediRate, usdtRate, usdtBid, usdtFeeNum, profitRates, feeSettings]);

  // 计算实际利润和利率 - 使用安全计算防止 NaN
  const profitCalculation = useMemo(() => {
    const value = safeNumber(parseFloat(cardValue));
    const rate = safeNumber(parseFloat(cardRate));
    const cardWorthRMB = safeMultiply(value, rate);
    const cardWorthU = safeDivide(cardWorthRMB, safeUsdtRate);
    
    const payNairaNum = safeNumber(parseFloat(payNaira));
    const payCediNum = safeNumber(parseFloat(payCedi));
    const payUsdtNum = safeNumber(parseFloat(payUsdt));
    const payBtcNum = safeNumber(parseFloat(payBtc));

    const nairaFee = payNairaNum < feeSettings.nairaThreshold 
      ? feeSettings.nairaFeeBelow 
      : feeSettings.nairaFeeAbove;
    const nairaProfitRMB = cardWorthRMB - safeDivide(payNairaNum, safeNairaRate) - nairaFee;
    const nairaActualRate = cardWorthRMB > 0 ? safeDivide(nairaProfitRMB * 100, cardWorthRMB) : 0;

    const cediFee = payCediNum < feeSettings.cediThreshold 
      ? feeSettings.cediFeeBelow 
      : feeSettings.cediFeeAbove;
    const cediProfitRMB = cardWorthRMB - safeMultiply(payCediNum, safeCediRate) - cediFee;
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
  }, [cardValue, cardRate, usdtRate, usdtFeeNum, payNaira, payCedi, payUsdt, payBtc, nairaRate, cediRate, btcPrice, feeSettings]);

  // 币种偏好显示 - 优先显示会员数据，否则显示当前支付选择
  const currencyPreference = useMemo(() => {
    if (currencyPreferenceList.length > 0) {
      return currencyPreferenceList.join(", ");
    }
    const prefs: string[] = [];
    if (payNaira) prefs.push(CURRENCIES.NGN.code);
    if (payCedi) prefs.push(CURRENCIES.GHS.code);
    if (payUsdt) prefs.push(CURRENCIES.USDT.code);
    return prefs.join(", ") || "-";
  }, [currencyPreferenceList, payNaira, payCedi, payUsdt]);

  // 双击清空逻辑
  const handleDoubleClick = (setter: (value: string) => void) => {
    setter("");
  };

  // 快捷按钮双击编辑
  const handleQuickAmountDoubleClick = (index: number) => {
    setEditingAmountIndex(index);
  };

  const handleQuickRateDoubleClick = (index: number) => {
    setEditingRateIndex(index);
  };

  const handleQuickAmountChange = (index: number, value: string) => {
    if (!quickSettingsLoaded) return;
    const newAmounts = [...quickAmounts];
    newAmounts[index] = value;
    setQuickAmounts(newAmounts);
    // 自动保存到数据库
    saveSharedData('quickAmounts', newAmounts);
  };

  const handleQuickRateChange = (index: number, value: string) => {
    if (!quickSettingsLoaded) return;
    const newRates = [...quickRates];
    newRates[index] = value;
    setQuickRates(newRates);
    // 自动保存到数据库
    saveSharedData('quickRates', newRates);
  };

  // 自动复制积分信息到剪贴板 - 直接使用传入的积分值，避免竞态条件
  const performAutoCopy = async (phone: string, code: string, currency: string, earnedPoints: number) => {
    const copySettings = getCopySettings();
    if (!copySettings.enabled) return;
    
    const activitySettings = getActivitySettings();
    
    // 确定活动类型
    let activityType: 'activity1' | 'activity2' | 'none' = 'none';
    let useActivity2 = false;
    if (activitySettings.activity1Enabled) {
      activityType = 'activity1';
    } else if (activitySettings.activity2?.enabled) {
      activityType = 'activity2';
      useActivity2 = true;
    }
    
    // 如果两个活动都关闭，不复制任何内容
    if (activityType === 'none') {
      return;
    }
    
    // 从数据库实时获取积分数据（与活动数据页面统一）
    // 积分已在 addOrder 中同步写入，此时查询可获取最新数据
    const pointsSummary = await getMemberPointsSummary(code, phone);
    
    // 使用数据库实时数据
    const referralRewardPoints = pointsSummary.referralRewardPoints;
    const consumptionReward = pointsSummary.consumptionReward;
    // 总积分 = 剩余积分（与活动数据页面完全一致）
    const totalPoints = pointsSummary.remainingPoints;
    
    // 计算可兑换金额
    let rewardAmount = 0;
    if (useActivity2) {
      // 活动2: 可兑换金额 = 总积分 × 积分兑换率
      switch (currency) {
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
      // 活动1: 使用阶梯奖励
      rewardAmount = getRewardAmountByPointsAndCurrency(totalPoints, currency as 'NGN' | 'GHS' | 'USDT');
    }
    
    // 构建奖励档位列表（活动1使用）
    const rewardTiers = useActivity2 
      ? []
      : activitySettings.accumulatedRewardTiers.map(tier => ({
          range: tier.maxPoints === null ? `≥${tier.minPoints}` : `${tier.minPoints}-${tier.maxPoints}`,
          ngn: tier.rewardAmountNGN || 0,
          ghs: tier.rewardAmountGHS || 0,
          usdt: tier.rewardAmountUSDT || 0,
        }));
    
    // 生成英文复制文本 - 使用传入的 earnedPoints（来自订单创建的确定值）
    const copyText = generateEnglishCopyText({
      phoneNumber: phone,
      memberCode: code,  // 🔧 新增：传递会员编号用于复制文本
      earnedPoints,  // 🔧 关键修复：使用订单创建返回的确定积分值
      totalPoints,
      referralPoints: referralRewardPoints,
      consumptionPoints: consumptionReward,
      redeemableAmount: `${rewardAmount.toLocaleString()} ${currency}`,
      currency,
      rewardTiers,
      activityType,
      activity2Rates: useActivity2 ? activitySettings.activity2 : undefined,
    });
    
    if (!copyText) return;
    
    navigator.clipboard.writeText(copyText).then(() => {
      toast.info(`积分信息已复制到剪贴板 (${activityType === 'activity2' ? '活动2' : '活动1'})`);
    }).catch(() => {
      console.error("复制失败");
    });
  };

  // 异常检测状态
  const [anomalyWarnings, setAnomalyWarnings] = useState<import('@/services/orderAnomalyDetection').AnomalyWarning[]>([]);
  const [showAnomalyDialog, setShowAnomalyDialog] = useState(false);
  const pendingSubmitRef = useRef(false);

  // 提交订单入口 - 先验证，再检测异常
  const handleSubmitOrder = async () => {
    if (isSubmittingOrder) return;
    
    // 必填字段验证
    if (!nairaRate || nairaRate <= 0) {
      showSubmissionError("请填写奈拉汇率");
      return;
    }
    if (!cediRate || cediRate <= 0) {
      showSubmissionError("请填写赛地汇率");
      return;
    }
    if (!usdtFee && usdtFee !== "0") {
      showSubmissionError("请填写USDT手续费");
      return;
    }
    if (!cardValue) {
      showSubmissionError("请填写卡片面值");
      return;
    }
    if (!cardRate) {
      showSubmissionError("请填写卡片汇率");
      return;
    }
    if (!payNaira && !payCedi && !payUsdt) {
      showSubmissionError("请至少填写一个支付金额（支付奈拉、支付赛地或支付USDT）");
      return;
    }
    if (!cardType) {
      showSubmissionError("请选择卡片类型");
      return;
    }
    if (!cardMerchant) {
      showSubmissionError("请选择卡商名称");
      return;
    }
    if (!paymentAgent) {
      showSubmissionError("请选择代付商家");
      return;
    }
    if (!phoneNumber) {
      showSubmissionError("请填写电话号码");
      return;
    }

    // 异常检测
    try {
      const { detectOrderAnomalies } = await import('@/services/orderAnomalyDetection');
      const cardWorthVal = parseFloat(cardValue) * parseFloat(cardRate);
      let profitRateVal = 0;
      let foreignRateVal = 0;
      let currency = 'NGN';
      
      if (payUsdt) {
        profitRateVal = parseFloat(profitCalculation.usdtRate) || 0;
        foreignRateVal = safeUsdtRate;
        currency = 'USDT';
      } else if (payNaira) {
        profitRateVal = parseFloat(profitCalculation.nairaRate) || 0;
        foreignRateVal = safeNairaRate;
        currency = 'NGN';
      } else if (payCedi) {
        profitRateVal = parseFloat(profitCalculation.cediRate) || 0;
        foreignRateVal = safeCediRate;
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
        return; // 等待用户确认
      }
    } catch (err) {
      console.warn('Anomaly detection failed, proceeding:', err);
    }

    // 无异常，直接提交
    await executeOrderSubmit();
  };

  // 用户确认异常后继续提交
  const handleConfirmAnomalySubmit = async () => {
    setShowAnomalyDialog(false);
    setAnomalyWarnings([]);
    await executeOrderSubmit();
  };

  // 提交订单（可跳过异常检测）
  const executeOrderSubmit = async () => {
    // 标记正在提交
    isSubmittingOrder = true;
    
    try {
      // 确定本次检测的币种
      const detectedCurrency: 'NGN' | 'GHS' | 'USDT' | null = payNaira ? 'NGN' : payCedi ? 'GHS' : payUsdt ? 'USDT' : null;
    const actualPayment = payNaira ? parseFloat(payNaira) : payCedi ? parseFloat(payCedi) : parseFloat(payUsdt);

    // ===== 第一步：用 phone 再查一次会员（保证是最新）=====
    // 禁止使用缓存，必须从数据库实时查询
    const { supabase } = await import('@/integrations/supabase/client');
    const { data: dbMember, error: queryError } = await supabase
      .from('members')
      .select('*')
      .eq('phone_number', phoneNumber)
      .maybeSingle();
    
    if (queryError) {
      console.error('查询会员失败:', queryError);
      showSubmissionError('查询会员信息失败');
      return;
    }

    let memberId: string | undefined;
    let finalMemberCode = memberCode;
    
    if (dbMember) {
      // ===== 会员存在：更新 =====
      memberId = dbMember.id;
      finalMemberCode = dbMember.member_code;
      
      // ===== 第二步：处理币种偏好（只追加，不覆盖）=====
      const existingPrefs: string[] = dbMember.currency_preferences || [];
      let mergedPrefs = [...existingPrefs];
      if (detectedCurrency && !existingPrefs.includes(detectedCurrency)) {
        mergedPrefs.push(detectedCurrency);
      }
      
      // ===== 第三步：覆盖更新会员字段（使用 phone 作为条件）=====
      const memberUpdates: any = {
        level: memberLevel || dbMember.member_level || "D",
        preferredCurrency: mergedPrefs,
        remark: remarkMember,
        commonCards: selectedCommonCards,
        customerFeature: customerFeature,
        bankCard: bankCard,
      };
      
      // 来源字段：如果选择了则覆盖
      if (customerSource) {
        memberUpdates.sourceId = customerSource;
      }
      
      // 🚀 使用 fire-and-forget 版本，不阻塞订单提交
      updateMemberByPhoneAsync(phoneNumber, memberUpdates);
    } else {
      // ===== 新会员：创建 =====
      const newMemberCode = memberCode || generateMemberId();
      const newMember = await addMember({
        phoneNumber,
        memberCode: newMemberCode,
        level: memberLevel || "D",
        preferredCurrency: detectedCurrency ? [detectedCurrency] : [],
        remark: remarkMember,
        commonCards: selectedCommonCards,
        customerFeature,
        bankCard,
        sourceId: customerSource,
        recorder: employee?.real_name || '',
        recorderId: employee?.id,
      });
      
      if (newMember) {
        memberId = newMember.id;
        finalMemberCode = newMember.memberCode;
        setMemberCode(finalMemberCode);
      }
    }

    // 如果是USDT支付，提交到USDT订单
    if (payUsdt) {
      const cardWorth = parseFloat(cardValue) * parseFloat(cardRate);
      const totalValueUsdt = safeUsdtRate > 0 ? cardWorth / safeUsdtRate : 0;
      const actualPaidUsdt = parseFloat(payUsdt);
      const paymentValue = actualPaidUsdt + usdtFeeNum;
      const profit = parseFloat(profitCalculation.usdtProfitU);
      const profitRateVal = parseFloat(profitCalculation.usdtRate);

      const usdtOrderData = {
        createdAt: new Date().toLocaleString('zh-CN'),
        cardType,
        cardValue: parseFloat(cardValue),
        cardRate: parseFloat(cardRate),
        cardWorth,
        usdtRate: safeUsdtRate,
        totalValueUsdt,
        actualPaidUsdt,
        feeUsdt: usdtFeeNum,
        paymentValue,
        profit,
        profitRate: profitRateVal,
        vendor: cardMerchant,
        paymentProvider: paymentAgent,
        phoneNumber,
        memberCode: finalMemberCode,
        demandCurrency: "USDT",
        salesPerson: employee?.real_name || '未知',
        remark: remarkOrder, // 备注（订单）
      };

      // 🔧 修复竞态条件：等待订单创建完成并获取确定的积分值
      const usdtResult = await addUsdtOrderDb(usdtOrderData, memberId, employee?.id);
      
      // 累加累积金额、利润和订单计数到永久累积字段（异步，不阻塞）
      if (memberId && detectedCurrency) {
        const { batchUpdateMemberActivityAsync } = await import('@/hooks/useMemberActivity');
        batchUpdateMemberActivityAsync({
          memberId,
          phoneNumber,
          accumulatedAmount: { currency: detectedCurrency, amount: actualPaidUsdt },
          profitAmount: profit !== 0 ? profit : undefined,
          incrementOrderCount: true, // 永久存储订单计数
        });
      }
      
      toast.success("USDT订单提交成功");
      
      // 🔧 修复：立即执行复制，使用 await 确保在页面切换前完成
      if (usdtResult.order) {
        await performAutoCopy(phoneNumber, finalMemberCode, "USDT", usdtResult.earnedPoints);
      }
    } else {
      // 奈拉/赛地订单
      let paymentCurrency = "";
      let actualPaid = 0;
      let foreignRate = 0;
      let fee = 0;
      let profit = 0;
      let profitRateVal = 0;

      if (payNaira) {
        paymentCurrency = CURRENCIES.NGN.name;
        actualPaid = parseFloat(payNaira);
        foreignRate = safeNairaRate;
        fee = actualPaid < feeSettings.nairaThreshold ? feeSettings.nairaFeeBelow : feeSettings.nairaFeeAbove;
        profit = parseFloat(profitCalculation.nairaProfitRMB);
        profitRateVal = parseFloat(profitCalculation.nairaRate);
      } else if (payCedi) {
        paymentCurrency = CURRENCIES.GHS.name;
        actualPaid = parseFloat(payCedi);
        foreignRate = safeCediRate;
        fee = actualPaid < feeSettings.cediThreshold ? feeSettings.cediFeeBelow : feeSettings.cediFeeAbove;
        profit = parseFloat(profitCalculation.cediProfitRMB);
        profitRateVal = parseFloat(profitCalculation.cediRate);
      }
      
      const paymentValue = payNaira 
        ? actualPaid / foreignRate + fee 
        : actualPaid * foreignRate + fee;

      const orderData = {
        createdAt: new Date().toLocaleString('zh-CN'),
        cardType,
        cardValue: parseFloat(cardValue),
        cardRate: parseFloat(cardRate),
        foreignRate,
        cardWorth: parseFloat(cardValue) * parseFloat(cardRate),
        actualPaid,
        fee,
        paymentValue,
        paymentProvider: paymentAgent,
        vendor: cardMerchant,
        profit,
        profitRate: profitRateVal,
        phoneNumber,
        memberCode: finalMemberCode,
        demandCurrency: paymentCurrency,
        salesPerson: employee?.real_name || '未知',
        remark: remarkOrder, // 备注（订单）
      };

      // 🔧 修复竞态条件：等待订单创建完成并获取确定的积分值
      const orderResult = await addOrder(orderData, memberId, employee?.id, finalMemberCode);
      
      // 累加累积金额、利润和订单计数到永久累积字段（异步，不阻塞）
      if (memberId && detectedCurrency) {
        const { batchUpdateMemberActivityAsync } = await import('@/hooks/useMemberActivity');
        batchUpdateMemberActivityAsync({
          memberId,
          phoneNumber,
          accumulatedAmount: { currency: detectedCurrency, amount: actualPaid },
          profitAmount: profit !== 0 ? profit : undefined,
          incrementOrderCount: true, // 永久存储订单计数
        });
      }
      
      toast.success("订单提交成功");
      
      // 🔧 修复：立即执行复制，使用 await 确保在页面切换前完成
      if (orderResult.order) {
        const currencyCode = payNaira ? 'NGN' : 'GHS';
        await performAutoCopy(phoneNumber, finalMemberCode, currencyCode, orderResult.earnedPoints);
      }
    }

    // 重置表单 - 清空所有字段并保存清空状态
    setCardValue("");
    setCardRate("");
    setPayNaira("");
    setPayCedi("");
    setPayUsdt("");
    setCardType("");
    setCardMerchant("");
    setPaymentAgent("");
    setPhoneNumber("");
    setMemberCode("");
    setMemberLevel("");
    setSelectedCommonCards([]);
    setCustomerFeature("");
    setBankCard("");
    setRemarkMember("");
    setRemarkOrder("");
    setCustomerSource("");
    setCurrencyPreferenceList([]);
    
    // 立即保存清空状态，确保页面切换后不会回填
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
      nairaRate,
      cediRate,
      currencyPreferenceList: [],
      customerSource: "",
    });
    } finally {
      // 重置提交状态
      isSubmittingOrder = false;
    }
  };

  return (
    <div className="space-y-4">
      {/* 订单异常检测警告对话框 */}
      <AlertDialog open={showAnomalyDialog} onOpenChange={setShowAnomalyDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-amber-600">
              <Bell className="h-5 w-5" />
              {t('订单异常检测警告', 'Order Anomaly Warning')}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 pt-2">
                <p className="text-sm text-muted-foreground">
                  {t('系统检测到以下异常，请确认是否继续提交：', 'The system detected the following anomalies. Confirm to proceed:')}
                </p>
                {anomalyWarnings.map((w, i) => (
                  <div key={i} className={cn(
                    "flex items-start gap-2 p-3 rounded-lg border text-sm",
                    w.severity === 'danger' 
                      ? "border-destructive/50 bg-destructive/5 text-destructive" 
                      : "border-amber-300 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300"
                  )}>
                    <Bell className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <span>{w.message}</span>
                  </div>
                ))}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('取消提交', 'Cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmAnomalySubmit} className="bg-amber-600 hover:bg-amber-700">
              {t('确认提交', 'Confirm Submit')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Card className="shadow-lg border-0 bg-gradient-to-br from-card to-card/95">
        <CardContent className="pt-5 pb-4">
          {/* 全局共享汇率模块 - 不随Tab切换变化 */}
          <div className="rounded-xl overflow-visible shadow-sm border border-border/50 mb-4">
            <div className="grid grid-cols-3 lg:grid-cols-6 gap-px">
              <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/30 dark:to-blue-800/20 border-r border-border/30 py-2 px-2 lg:px-3 text-center">
                <div className="text-xs font-medium text-blue-600 dark:text-blue-400 flex items-center justify-center gap-1 lg:gap-1.5 mb-0.5">
                  <span className="hidden sm:inline">USDT汇率</span>
                  <span className="sm:hidden">USDT</span>
                  {usdtRateLabel && <span className="text-[10px] opacity-75">({usdtRateLabel})</span>}
                  <Lock className="h-3 w-3 opacity-70" />
                </div>
                <div className="text-base lg:text-lg font-bold text-blue-700 dark:text-blue-300">{usdtRate === null ? <Skeleton className="h-5 w-16 mx-auto" /> : safeUsdtRate.toFixed(4)}</div>
              </div>
              <div className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/30 dark:to-purple-800/20 border-r border-border/30 py-2 px-2 lg:px-3 text-center">
                <div className="text-xs font-medium text-purple-600 dark:text-purple-400 mb-0.5">
                  <span className="hidden sm:inline">奈拉汇率</span>
                  <span className="sm:hidden">奈拉</span>
                </div>
                {nairaRate === null ? (
                  <Skeleton className="h-6 w-full" />
                ) : (
                <Input 
                  type="number"
                  step="any"
                  value={nairaRate} 
                  onChange={(e) => setNairaRate(parseFloat(e.target.value) || 0)}
                  className="h-6 text-center text-base lg:text-lg font-bold text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-700 bg-white/60 dark:bg-white/10"
                />
                )}
              </div>
              <div className="bg-gradient-to-br from-indigo-50 to-indigo-100 dark:from-indigo-900/30 dark:to-indigo-800/20 border-r border-border/30 py-2 px-2 lg:px-3 text-center">
                <div className="text-xs font-medium text-indigo-600 dark:text-indigo-400 mb-0.5">
                  <span className="hidden sm:inline">赛地汇率</span>
                  <span className="sm:hidden">赛地</span>
                </div>
                {cediRate === null ? (
                  <Skeleton className="h-6 w-full" />
                ) : (
                <Input 
                  type="number"
                  step="any"
                  value={cediRate} 
                  onChange={(e) => setCediRate(parseFloat(e.target.value) || 0)}
                  className="h-6 text-center text-base lg:text-lg font-bold text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-700 bg-white/60 dark:bg-white/10"
                />
                )}
              </div>
              <Popover>
                <PopoverTrigger asChild>
                  <div className="bg-gradient-to-br from-amber-50 to-amber-100 dark:from-amber-900/30 dark:to-amber-800/20 border-r border-border/30 py-2 px-2 lg:px-3 text-center cursor-pointer hover:ring-2 hover:ring-amber-300 dark:hover:ring-amber-600 rounded-r-sm transition-all">
                    <div className="text-xs font-medium text-amber-600 dark:text-amber-400 flex items-center justify-center gap-1 lg:gap-1.5 mb-0.5">
                      <span className="hidden sm:inline">BTC价格</span>
                      <span className="sm:hidden">BTC</span>
                      <Settings className="h-3 w-3 opacity-70" />
                    </div>
                    <div className="text-base lg:text-lg font-bold text-amber-700 dark:text-amber-300">
                      {btcPrice === null ? <Skeleton className="h-5 w-16 mx-auto" /> : btcPrice}
                    </div>
                  </div>
                </PopoverTrigger>
                <PopoverContent className="w-[420px] max-w-[95vw] p-0" align="center" forceMount>
                  <BtcPriceSettingsCard />
                </PopoverContent>
              </Popover>
              <div className="bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900/30 dark:to-slate-800/20 border-r border-border/30 py-2 px-2 lg:px-3 text-center">
                <div className="text-xs font-medium text-slate-600 dark:text-slate-400 flex items-center justify-center gap-1 lg:gap-1.5 mb-0.5">
                  <span className="hidden sm:inline">USDT手续费</span>
                  <span className="sm:hidden">手续费</span>
                  <Lock className="h-3 w-3 opacity-70" />
                </div>
                <div className="text-base lg:text-lg font-bold text-slate-700 dark:text-slate-300">{usdtFee || "0"}</div>
              </div>
              <div className="bg-gradient-to-br from-cyan-50 to-cyan-100 dark:from-cyan-900/30 dark:to-cyan-800/20 py-2 px-2 lg:px-3 text-center">
                <div className="text-xs font-medium text-cyan-600 dark:text-cyan-400 flex items-center justify-center gap-1 lg:gap-1.5 mb-0.5">
                  <span className="hidden sm:inline">现金专属</span>
                  <span className="sm:hidden">现金</span>
                  <Lock className="h-3 w-3 opacity-70" />
                </div>
                <div className="text-base lg:text-lg font-bold text-cyan-700 dark:text-cyan-300">{cashSpecial}</div>
              </div>
            </div>
          </div>

          <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
            <div className={cn(
              "flex flex-col xl:flex-row xl:items-center xl:justify-between gap-2 sm:gap-3 mb-4 sm:mb-5 overflow-visible",
              isMobile && "gap-2"
            )}>
              <div ref={tabsContainerRef} className="flex-1 min-w-0">
                <TabsList className={cn(
                  "bg-muted/60 p-1 lg:p-1.5 rounded-xl shadow-inner gap-0.5 lg:gap-1 flex-nowrap overflow-visible",
                  isMobile && "overflow-x-auto w-full [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
                )}>
                  {/* 可见的Tab */}
                  {visibleTabs.map((tab) => (
                    <TabsTrigger 
                      key={tab.value}
                      value={tab.value} 
                      className={`rounded-lg px-2 lg:px-4 py-1.5 lg:py-2 text-xs lg:text-sm font-medium transition-all duration-200 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-lg data-[state=active]:scale-105 hover:bg-muted ${tab.showBadge ? 'relative overflow-visible' : ''}`}
                    >
                      {t(tab.label.zh, tab.label.en)}
                      {tab.showBadge && memoUnreadCount > 0 && (
                        <Badge 
                          className="absolute -top-2 -right-2 h-5 w-5 p-0 flex items-center justify-center bg-destructive text-destructive-foreground text-xs animate-pulse shadow-lg"
                        >
                          {memoUnreadCount > 9 ? "9+" : memoUnreadCount}
                        </Badge>
                      )}
                    </TabsTrigger>
                  ))}
                  
                  {/* 溢出Tab的下拉菜单（只有存在溢出Tab时才显示） */}
                  {overflowTabs.length > 0 && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="rounded-lg px-2 lg:px-3 py-1.5 lg:py-2 text-xs lg:text-sm font-medium h-auto gap-1 hover:bg-muted relative"
                        >
                          {t("更多", "More")}
                          <ChevronDown className="h-3 w-3" />
                          {/* 如果当前选中的Tab在溢出列表中，显示高亮指示 */}
                          {overflowTabs.some(tab => tab.value === activeTab) && (
                            <span className="absolute -top-1 -right-1 h-2 w-2 bg-primary rounded-full" />
                          )}
                          {/* 如果溢出列表中有未读的工作备忘，显示徽章 */}
                          {overflowTabs.some(tab => tab.showBadge) && memoUnreadCount > 0 && (
                            <Badge 
                              className="absolute -top-2 -right-2 h-5 w-5 p-0 flex items-center justify-center bg-destructive text-destructive-foreground text-xs animate-pulse shadow-lg"
                            >
                              {memoUnreadCount > 9 ? "9+" : memoUnreadCount}
                            </Badge>
                          )}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-40">
                        {overflowTabs.map((tab) => (
                          <DropdownMenuItem
                            key={tab.value}
                            onClick={() => handleTabChange(tab.value)}
                            className={`flex items-center justify-between cursor-pointer ${activeTab === tab.value ? 'bg-accent' : ''}`}
                          >
                            <span className="flex items-center gap-2">
                              {t(tab.label.zh, tab.label.en)}
                              {tab.showBadge && memoUnreadCount > 0 && (
                                <Badge 
                                  className="h-5 min-w-[20px] p-0 flex items-center justify-center bg-destructive text-destructive-foreground text-xs"
                                >
                                  {memoUnreadCount > 9 ? "9+" : memoUnreadCount}
                                </Badge>
                              )}
                            </span>
                            {activeTab === tab.value && <Check className="h-4 w-4" />}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </TabsList>
              </div>
              <div className={cn(
                "flex items-center gap-1.5 sm:gap-2 lg:gap-3 flex-shrink-0",
                isMobile && "w-full"
              )}>
                <UsdtRatePanel compact onRateUpdate={(rates: UsdtLiveRates) => {
                  if (rates.mid > 0) {
                    setUsdtRate(rates.mid);
                  }
                  setUsdtBid(rates.bid);
                  setUsdtAsk(rates.ask);
                }} />
              </div>
            </div>

            {/* 汇率计算1 - 使用独立计算器组件 */}
            <TabsContent value="calc1" className="mt-0 animate-fade-in">
              <RateCalculator
                calcId="calc1"
                usdtRate={usdtRate}
                usdtBid={usdtBid}
                usdtAsk={usdtAsk}
                nairaRate={nairaRate}
                cediRate={cediRate}
                btcPrice={btcPrice}
                usdtFee={usdtFee}
                cardsList={cardsList}
                vendorsList={vendorsList}
                paymentProvidersList={paymentProvidersList}
                customerSources={customerSources}
                quickAmounts={quickAmounts}
                quickRates={quickRates}
                profitRates={profitRates}
                onQuickAmountChange={handleQuickAmountChange}
                onQuickRateChange={handleQuickRateChange}
                onProfitRateChange={(index, value) => {
                  const newRates = [...profitRates];
                  newRates[index] = value;
                  setProfitRates(newRates);
                }}
                onPayUsdtChange={activeTab === 'calc1' ? setPayUsdt : undefined}
              />
            </TabsContent>

            {/* 汇率计算2 - 使用独立计算器组件 */}
            <TabsContent value="calc2" className="mt-0 animate-fade-in">
              <RateCalculator
                calcId="calc2"
                usdtRate={usdtRate}
                usdtBid={usdtBid}
                usdtAsk={usdtAsk}
                nairaRate={nairaRate}
                cediRate={cediRate}
                btcPrice={btcPrice}
                usdtFee={usdtFee}
                cardsList={cardsList}
                vendorsList={vendorsList}
                paymentProvidersList={paymentProvidersList}
                customerSources={customerSources}
                quickAmounts={quickAmounts}
                quickRates={quickRates}
                profitRates={profitRates}
                onQuickAmountChange={handleQuickAmountChange}
                onQuickRateChange={handleQuickRateChange}
                onProfitRateChange={(index, value) => {
                  const newRates = [...profitRates];
                  newRates[index] = value;
                  setProfitRates(newRates);
                }}
                onPayUsdtChange={activeTab === 'calc2' ? setPayUsdt : undefined}
              />
            </TabsContent>

            {/* 汇率计算3 - 使用独立计算器组件 */}
            <TabsContent value="calc3" className="mt-0 animate-fade-in">
              <RateCalculator
                calcId="calc3"
                usdtRate={usdtRate}
                usdtBid={usdtBid}
                usdtAsk={usdtAsk}
                nairaRate={nairaRate}
                cediRate={cediRate}
                btcPrice={btcPrice}
                usdtFee={usdtFee}
                cardsList={cardsList}
                vendorsList={vendorsList}
                paymentProvidersList={paymentProvidersList}
                customerSources={customerSources}
                quickAmounts={quickAmounts}
                quickRates={quickRates}
                profitRates={profitRates}
                onQuickAmountChange={handleQuickAmountChange}
                onQuickRateChange={handleQuickRateChange}
                onProfitRateChange={(index, value) => {
                  const newRates = [...profitRates];
                  newRates[index] = value;
                  setProfitRates(newRates);
                }}
                onPayUsdtChange={activeTab === 'calc3' ? setPayUsdt : undefined}
              />
            </TabsContent>

            <TabsContent value="activity">
              <ActivityGiftTab 
                nairaRate={nairaRate}
                cediRate={cediRate}
                usdtRate={usdtRate}
              />
            </TabsContent>

            <TabsContent value="memo">
              <WorkMemoTab onUnreadCountChange={setMemoUnreadCount} />
            </TabsContent>

            <TabsContent value="referral">
              <ReferralEntryTab />
            </TabsContent>

            {/* 海报设置 Tab */}
            <TabsContent value="rateSettings" className="space-y-4">
              <RateSettingsTab
                currencyRates={currencyRates}
                currencyRatesAutoUpdate={currencyRatesAutoUpdate}
                currencyRatesInterval={currencyRatesInterval}
                currencyRatesCountdown={currencyRatesCountdown}
                onRefreshCurrencyRates={handleRefreshCurrencyRates}
                onToggleCurrencyRatesAutoUpdate={handleToggleCurrencyRatesAutoUpdate}
                onChangeCurrencyRatesInterval={handleChangeCurrencyRatesInterval}
                nairaRate={safeNairaRate}
                cediRate={safeCediRate}
                cardsList={cardsList}
              />
            </TabsContent>

            {/* 新增会员 Tab */}
            <TabsContent value="memberEntry">
              <MemberEntryTab />
            </TabsContent>

            {/* 交班对账 Tab */}
            <TabsContent value="shiftHandover">
              <ShiftHandoverTab />
            </TabsContent>

          </Tabs>
        </CardContent>
      </Card>

      {/* 积分兑换对话框 - 与会员管理活动数据保持一致 */}
      <Dialog open={isRedeemDialogOpen} onOpenChange={setIsRedeemDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("积分兑换", "Points Redemption")}</DialogTitle>
          </DialogHeader>
          {redeemPreviewData && (
            <div className="space-y-4 py-4">
              {/* 兑换信息预览 */}
              <div className="p-4 bg-muted/50 rounded-lg space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{t("会员编号", "Member Code")}</span>
                  <span className="font-medium">{redeemPreviewData.memberCode}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{t("电话号码", "Phone Number")}</span>
                  <span className="font-mono">{redeemPreviewData.phoneNumber}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{t("当前剩余积分", "Current Points")}</span>
                  <span className="font-bold text-primary">{redeemPreviewData.remainingPoints}</span>
                </div>
                <div className="border-t pt-3 mt-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{t("判定币种", "Currency")}</span>
                    <Badge variant="outline">{redeemPreviewData.currency}</Badge>
                  </div>
                  <div className="flex justify-between text-sm mt-2">
                    <span className="text-muted-foreground">{t("当前汇率", "Current Rate")}</span>
                    <span>{redeemPreviewData.currentRate}</span>
                  </div>
                  <div className="flex justify-between text-sm mt-2">
                    <span className="text-muted-foreground">{t("可兑换金额", "Redemption Amount")}</span>
                    <span className="font-bold text-green-600">
                      {redeemPreviewData.rewardAmount} {redeemPreviewData.currency}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm mt-2">
                    <span className="text-muted-foreground">{t("手续费", "Fee")}</span>
                    <span>{redeemPreviewData.fee}</span>
                  </div>
                  <div className="flex justify-between text-sm mt-2">
                    <span className="text-muted-foreground">{t("赠送价值", "Gift Value")}</span>
                    <span>{(redeemPreviewData?.giftValue ?? 0).toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* 代付商家选择 */}
              <div className="space-y-2">
                <Label>{t("代付商家", "Payment Provider")} <span className="text-destructive">*</span></Label>
                <Select value={redeemPaymentProvider} onValueChange={setRedeemPaymentProvider}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("请选择代付商家", "Select payment provider")} />
                  </SelectTrigger>
                  <SelectContent>
                    {paymentProvidersList.map(provider => (
                      <SelectItem key={provider.id} value={provider.name}>
                        {provider.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {paymentProvidersList.length === 0 && (
                  <p className="text-xs text-destructive">{t("暂无可用的代付商家，请先在商家管理中添加", "No payment providers available")}</p>
                )}
              </div>

              {/* 备注 */}
              <div className="space-y-2">
                <Label>{t("备注（选填）", "Remark (Optional)")}</Label>
                <Textarea
                  value={redeemRemark}
                  onChange={(e) => setRedeemRemark(e.target.value)}
                  placeholder={t("请输入备注信息", "Enter remark")}
                  rows={2}
                />
              </div>

              {/* 提示信息 */}
              <div className="text-xs text-muted-foreground bg-amber-50 dark:bg-amber-950/20 p-3 rounded">
                ⚠️ {t("兑换后积分将清零，重置时间更新为当前时间，之后的积分从新周期开始累积。", "After redemption, points will be reset to zero and the reset time will be updated.")}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRedeemDialogOpen(false)}>
              {t("取消", "Cancel")}
            </Button>
            <Button 
              onClick={() => {
                if (!redeemPaymentProvider) {
                  toast.error(t("请选择代付商家", "Please select payment provider"));
                  return;
                }
                setIsRedeemConfirmOpen(true);
              }}
              disabled={!redeemPaymentProvider || paymentProvidersList.length === 0}
            >
              {t("确认兑换", "Confirm Redemption")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 兑换确认对话框 */}
      <AlertDialog open={isRedeemConfirmOpen} onOpenChange={setIsRedeemConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("确认兑换", "Confirm Redemption")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                `确认为会员 ${redeemPreviewData?.memberCode} 进行积分兑换吗？兑换后该会员的积分将清零，重置时间将更新为当前时间。`,
                `Confirm points redemption for member ${redeemPreviewData?.memberCode}? Points will be reset to zero after redemption.`
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("取消", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={async () => {
              if (!redeemPreviewData) return;
              
              try {
                // 执行积分兑换
                const result = await redeemPoints(redeemPreviewData.memberCode, redeemPreviewData.phoneNumber, redeemPreviewData.remainingPoints);
                
                if (!result.success) {
                  toast.error(result.message || t("积分扣减失败", "Failed to deduct points"));
                  setIsRedeemConfirmOpen(false);
                  return;
                }
                
                // 保存活动赠送记录到数据库
                await addActivityGift({
                  phoneNumber: redeemPreviewData.phoneNumber,
                  currency: redeemPreviewData.currency,
                  amount: redeemPreviewData.rewardAmount,
                  rate: redeemPreviewData.currentRate,
                  fee: redeemPreviewData.fee,
                  giftValue: redeemPreviewData.giftValue,
                  paymentAgent: redeemPaymentProvider,
                  giftType: "points_redeem",
                  remark: redeemRemark,
                  creatorName: employee?.real_name,
                }, undefined, employee?.id);
                
                toast.success(t(
                  `兑换成功！已兑换 ${result.redeemedPoints} 积分，获得 ${redeemPreviewData.rewardAmount} ${redeemPreviewData.currency}，积分已清零`,
                  `Redemption successful! ${result.redeemedPoints} points redeemed for ${redeemPreviewData.rewardAmount} ${redeemPreviewData.currency}`
                ));
                
                setIsRedeemConfirmOpen(false);
                setIsRedeemDialogOpen(false);
              } catch (error) {
                console.error("兑换过程发生错误:", error);
                toast.error(t("兑换过程发生错误，请重试", "Redemption error, please try again"));
                setIsRedeemConfirmOpen(false);
              }
            }}>
              {t("确认", "Confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
