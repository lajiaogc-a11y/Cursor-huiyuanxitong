import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { safeNumber, safeDivide, safeMultiply, safeToFixed } from "@/lib/safeCalc";
import { cn } from "@/lib/utils";
import { trackRender } from "@/lib/performanceUtils";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Send, Lock, Bell, RefreshCw, Timer, Copy, Settings, Plus, Pencil, Trash2, Image as ImageIcon, ArrowDown, Check, X, Loader2, ChevronDown, PanelRightClose, PanelRightOpen } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { notify } from "@/lib/notifyHub";
import WorkMemoTab from "@/components/WorkMemoTab";
import ActivityGiftTab from "@/components/ActivityGiftTab";
import ReferralEntryTab from "@/components/ReferralEntryTab";
import MemberEntryTab from "@/components/MemberEntryTab";
import RatePosterGenerator from "@/components/RatePosterGenerator";
import RateSettingsTab from "@/components/exchange-rate/RateSettingsTab";
import ShiftHandoverTab from "@/components/ShiftHandoverTab";
import TasksQuickPanel from "@/components/TasksQuickPanel";
import { PhoneExtractPanel } from "@/components/PhoneExtractPanel";
import { ExchangePaymentInfoPanel } from "@/components/ExchangePaymentInfoPanel";
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
} from "@/services/system/systemSettingsService";
import { redeemPoints } from "@/services/points/pointsAccountService";
import { useLanguage } from "@/contexts/LanguageContext";
import { CURRENCIES, CurrencyCode, getCurrencyDisplayName, CURRENCY_LIST } from "@/config/currencies";
import CurrencySelect from "@/components/CurrencySelect";
import { getActiveCustomerSources, initializeCustomerSourceCache } from "@/hooks/useCustomerSources";
// pointsLedgerStore is deprecated — usePointsLedger hook is the single source of truth
import { getPointsSettings } from "@/services/points/pointsSettingsService";
import { getMemberLastResetTime } from "@/services/points/pointsAccountService";
import { getMemberByPhoneForMyTenant, isMemberInTenant } from "@/services/members/memberLookupService";
import { getExchangeRateFormDataAsync, saveExchangeRateFormData, ExchangeRateFormData } from "@/services/finance/exchangeRateFormService";
import RateCalculator from "@/components/RateCalculator";
import { getCalculatorFormData, CalculatorId, subscribeCalculatorChange } from "@/hooks/useCalculatorStore";
import { useAuth } from "@/contexts/AuthContext";
import { useTenantView } from "@/contexts/TenantViewContext";
import {
  loadSharedData,
  loadMultipleSharedData,
  saveSharedData,
  saveSharedDataSync,
  getSharedDataSync,
  subscribeToSharedData,
  type CalculatorInputRates,
  type SharedDataKey,
} from "@/services/finance/sharedDataService";

import { BtcPriceConfig } from "@/components/BtcPriceSettingsCard";
import BtcPriceSettingsCard from "@/components/BtcPriceSettingsCard";
import { useIsMobile } from "@/hooks/use-mobile";
import UsdtRatePanel, { UsdtLiveRates } from "@/components/UsdtRatePanel";
import { useIsPlatformAdminViewingTenant } from "@/hooks/useIsPlatformAdminViewingTenant";
import {
  type CurrencyRates,
  DEFAULT_CURRENCY_RATES,
  getSavedCurrencyRates,
  saveCurrencyRates,
  fetchCurrencyRatesToNGN,
} from "@/services/finance/currencyRatesService";
import {
  DEFAULT_QUICK_AMOUNTS,
  DEFAULT_QUICK_RATES,
} from "@/pages/exchangeRate/exchangeRateHelpers";
import { useMerchantConfig } from "@/hooks/useMerchantConfig";
import { ExchangeRateRedeemDrawer, type ExchangeRateRedeemPreviewData } from "@/pages/exchangeRate/ExchangeRateRedeemDrawer";
import { useOrderSubmit } from "@/pages/exchangeRate/useOrderSubmit";

let currencyRatesCache: CurrencyRates | null = null;
let currencyRatesCacheLoaded = false;

export default function ExchangeRate() {
  trackRender('ExchangeRate');
  const { t } = useLanguage();
  const { employee } = useAuth();
  const { viewingTenantId } = useTenantView() || {};

  /** 会员查询/下单与后端租户一致（含平台进入某租户视图） */
  const effectiveMemberTenantId = useMemo(() => {
    if (employee?.is_platform_super_admin) {
      return viewingTenantId || employee?.tenant_id || null;
    }
    return viewingTenantId || employee?.tenant_id || null;
  }, [employee?.is_platform_super_admin, employee?.tenant_id, viewingTenantId]);
  const isPlatformAdminReadonlyView = useIsPlatformAdminViewingTenant();
  const isMobile = useIsMobile();
  const blockReadonly = useCallback((actionText: string) => {
    if (!isPlatformAdminReadonlyView) return false;
    notify.error(t(`平台总管理查看租户时为只读，无法${actionText}`, `Read-only in admin view, cannot ${actionText}`));
    return true;
  }, [isPlatformAdminReadonlyView, t]);
  
  // 使用数据库hooks获取订单数据
  const { orders, addOrder } = useOrders();
  const { orders: usdtOrdersList, addOrder: addUsdtOrderDb } = useUsdtOrders();
  const { members, addMember, updateMemberByPhone, findMemberByPhone } = useMembers();
  
  // 使用数据库hooks获取活动赠送
  const { addGift: addActivityGift } = useActivityGifts();
  
  const { cardsList, vendorsList, paymentProvidersList } = useMerchantConfig();
  
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

  const [usdtRate, setUsdtRate] = useState<number | null>(null);
  const [nairaRate, setNairaRate] = useState<number | null>(null);
  const [cediRate, setCediRate] = useState<number | null>(null);
  const [btcPrice, setBtcPrice] = useState<number | null>(null);
  const [ratesInitialized, setRatesInitialized] = useState(false);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 订阅共享数据变更（BTC价格、快捷设置、汇率采集等）
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
      if (key === 'calculatorInputRates' && value && typeof value === 'object') {
        const rates = value as CalculatorInputRates;
        if (rates.nairaRate != null && rates.nairaRate > 0) setNairaRate(rates.nairaRate);
        if (rates.cediRate != null && rates.cediRate > 0) setCediRate(rates.cediRate);
        if (rates.usdtRate != null && rates.usdtRate > 0) setUsdtRate(rates.usdtRate);
        if (rates.usdtSellRate != null && rates.usdtSellRate > 0) setUsdtBid(rates.usdtSellRate);
      }
      if (key === 'usdtLiveRates' && value && typeof value === 'object') {
        const u = value as UsdtLiveRates;
        if (u.mid > 0) setUsdtRate(u.mid);
        if (u.bid > 0) setUsdtBid(u.bid);
        if (u.ask > 0) setUsdtAsk(u.ask);
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

  // 快捷金额和汇率（默认先填满 8 格，后台单次批量拉取后再对齐服务器）
  const [quickAmounts, setQuickAmounts] = useState<string[]>(() => [...DEFAULT_QUICK_AMOUNTS]);
  const [quickRates, setQuickRates] = useState<string[]>(() => [...DEFAULT_QUICK_RATES]);
  const [quickSettingsLoaded, setQuickSettingsLoaded] = useState(false);


  // 利润分析百分比（可编辑，支持负数，显示为%格式）- 从数据库持久化
  const [profitRates, setProfitRates] = useState<string[]>(['3', '5', '8', '10', '15']);
  const [profitRatesInitialized, setProfitRatesInitialized] = useState(false);

  // 工作备忘未读数 - 自动计算
  const [memoUnreadCount, setMemoUnreadCount] = useState(0);

  // 右侧工作面板显示状态（可折叠）
  const [showRightPanel, setShowRightPanel] = useState(() =>
    localStorage.getItem('exchangeRightPanel') !== 'hidden'
  );
  const toggleRightPanel = () => {
    setShowRightPanel(prev => {
      const next = !prev;
      localStorage.setItem('exchangeRightPanel', next ? 'visible' : 'hidden');
      return next;
    });
  };
  
  // Tab响应式溢出导航（桌面：窄宽时收起到「更多」；移动端：全部 Tab 横向滚动，避免子导航被藏进下拉而难以发现）
  const tabsContainerRef = useRef<HTMLDivElement>(null);
  const [visibleTabCount, setVisibleTabCount] = useState(9);

  // Tab配置数组
  const TAB_CONFIG = useMemo(() => [
    { value: 'calc1', label: { zh: '台位 A', en: 'Desk A' } },
    { value: 'calc2', label: { zh: '台位 B', en: 'Desk B' } },
    { value: 'calc3', label: { zh: '美卡专区', en: 'US Card Zone' } },
    { value: 'activity', label: { zh: '活动赠送', en: 'Gifts' } },
    { value: 'memo', label: { zh: '工作备忘', en: 'Memos' }, showBadge: true },
    { value: 'referral', label: { zh: '推荐录入', en: 'Referral' } },
    { value: 'rateSettings', label: { zh: '海报设置', en: 'Poster Settings' } },
    { value: 'memberEntry', label: { zh: '新增会员', en: 'New Member' } },
    { value: 'shiftHandover', label: { zh: '交班对账', en: 'Handover' } },
  ], []);

  const effectiveVisibleTabCount = isMobile ? TAB_CONFIG.length : visibleTabCount;

  // 可见Tab和溢出Tab
  const visibleTabs = useMemo(
    () => TAB_CONFIG.slice(0, effectiveVisibleTabCount),
    [TAB_CONFIG, effectiveVisibleTabCount],
  );
  const overflowTabs = useMemo(
    () => TAB_CONFIG.slice(effectiveVisibleTabCount),
    [TAB_CONFIG, effectiveVisibleTabCount],
  );

  // ResizeObserver监听容器宽度变化（移动端不收缩，由横向滚动承载全部子导航）
  useEffect(() => {
    if (isMobile) return;
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
      // 至少显示3个Tab，最多全部显示
      setVisibleTabCount(Math.min(Math.max(count, 3), TAB_CONFIG.length));
    };

    const observer = new ResizeObserver(calculateVisibleTabs);
    observer.observe(container);
    calculateVisibleTabs(); // 初始计算

    return () => observer.disconnect();
  }, [TAB_CONFIG.length, isMobile]);

  const [searchParams] = useSearchParams();
  const tabFromUrl = searchParams.get("tab");

  // 当前选中的tab - 优先使用 URL 参数，否则 sessionStorage，默认 calc1
  const [activeTab, setActiveTab] = useState(() => {
    const urlTab = searchParams.get("tab");
    if (urlTab && TAB_CONFIG.some((t) => t.value === urlTab)) return urlTab;
    return sessionStorage.getItem('exchangeRateActiveTab') || 'calc1';
  });

  // URL 参数变化时同步 tab（如从海报库点击「去汇率页生成海报」跳转）
  useEffect(() => {
    if (tabFromUrl && TAB_CONFIG.some((t) => t.value === tabFromUrl)) {
      setActiveTab(tabFromUrl);
      sessionStorage.setItem('exchangeRateActiveTab', tabFromUrl);
    }
  }, [tabFromUrl, TAB_CONFIG]);
  
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
        calc1: t('台位 A', 'Station A'),
        calc2: t('台位 B', 'Station B'),
        calc3: t('美卡专区', 'US Card Zone'),
      };
      notify.success(t(`已切换到 ${tabNames[value]}`, `Switched to ${tabNames[value]}`), {
        duration: 1500,
        icon: '✓',
      });
    }
  }, [activeTab, t]);
  
  // 初始化时从数据库加载利润分析百分比（过短数组会与桌面 grid 列数不一致，表现为「先全后只剩一列」）
  useEffect(() => {
    const DEFAULT_RATES = ['3', '5', '8', '10', '15'];
    const normalizeProfitRates = (raw: unknown): string[] => {
      if (!Array.isArray(raw) || raw.length === 0) return [...DEFAULT_RATES];
      const cells = raw.map((x) => {
        const s = String(x ?? '').trim();
        return s === '' ? '' : s;
      });
      const out: string[] = [];
      for (let i = 0; i < DEFAULT_RATES.length; i++) {
        out.push(cells[i] !== '' && cells[i] !== undefined ? cells[i]! : DEFAULT_RATES[i]!);
      }
      for (let i = DEFAULT_RATES.length; i < cells.length; i++) {
        if (cells[i] !== '') out.push(cells[i]!);
      }
      return out;
    };
    const loadProfitRates = async () => {
      const savedRates = await loadSharedData<string[]>('profitAnalysisRates' as any);
      if (savedRates && Array.isArray(savedRates) && savedRates.length > 0) {
        setProfitRates(normalizeProfitRates(savedRates));
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


  // 汇率采集状态（仅手动刷新，无自动倒计时）
  const [currencyRates, setCurrencyRates] = useState<CurrencyRates>(getSavedCurrencyRates);

  // BTC设置弹窗（移动端用Dialog）
  const [btcDialogOpen, setBtcDialogOpen] = useState(false);

  // 积分兑换对话框状态 - 与会员管理活动数据保持一致
  const [isRedeemDialogOpen, setIsRedeemDialogOpen] = useState(false);
  const [isRedeemConfirmOpen, setIsRedeemConfirmOpen] = useState(false);
  const [redeemPaymentProvider, setRedeemPaymentProvider] = useState("");
  const [redeemRemark, setRedeemRemark] = useState("");
  const [redeemPreviewData, setRedeemPreviewData] = useState<ExchangeRateRedeemPreviewData | null>(null);
  // 初始化时获取未读数、汇率设置和商家数据
  useEffect(() => {
    const count = getUnreadMemoCount();
    setMemoUnreadCount(count);

    // 客户来源为异步拉取后写入内存缓存；必须先 await，否则首屏下拉为空，切页返回才有数据
    void initializeCustomerSourceCache().then(() => {
      setCustomerSources(getActiveCustomerSources());
    });
    
    // 快捷金额/汇率：一次批量请求替代两次串行 loadSharedData，缩短首包后对齐时间
    const loadQuickSettings = async () => {
      const keys = ['quickAmounts', 'quickRates'] as const;
      let savedAmounts: string[] | null = null;
      let savedRates: string[] | null = null;
      try {
        const batch = await loadMultipleSharedData([...keys] as SharedDataKey[]);
        const a = batch.quickAmounts;
        const r = batch.quickRates;
        if (Array.isArray(a) && a.length > 0) savedAmounts = a.map(String);
        if (Array.isArray(r) && r.length > 0) savedRates = r.map(String);
      } catch (e) {
        console.error('[ExchangeRate] loadQuickSettings batch failed:', e);
      }

      if (savedAmounts) {
        const extendedAmounts =
          savedAmounts.length >= 8
            ? savedAmounts.slice(0, 8)
            : [...savedAmounts, ...DEFAULT_QUICK_AMOUNTS.slice(savedAmounts.length)].slice(0, 8);
        setQuickAmounts(extendedAmounts.map(String));
        if (savedAmounts.length < 8) {
          void saveSharedData('quickAmounts', extendedAmounts.map(String));
        }
      } else {
        setQuickAmounts([...DEFAULT_QUICK_AMOUNTS]);
      }

      if (savedRates) {
        const extendedRates =
          savedRates.length >= 8
            ? savedRates.slice(0, 8)
            : [...savedRates, ...DEFAULT_QUICK_RATES.slice(savedRates.length)].slice(0, 8);
        setQuickRates(extendedRates.map(String));
        if (savedRates.length < 8) {
          void saveSharedData('quickRates', extendedRates.map(String));
        }
      } else {
        setQuickRates([...DEFAULT_QUICK_RATES]);
      }

      setQuickSettingsLoaded(true);
    };
    void loadQuickSettings();
    
    // 从数据库加载手动输入的汇率（奈拉/赛地）- 确保所有用户同步
    const loadInputRates = async () => {
      const [savedRates, liveUsdt] = await Promise.all([
        loadSharedData<CalculatorInputRates>('calculatorInputRates'),
        loadSharedData<UsdtLiveRates>('usdtLiveRates' as any),
      ]);
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
        // 已持久化的 USDT 中间价与活动赠送用卖价（与 calculatorInputRates.usdtSellRate 一致）
        if (savedRates.usdtRate != null && savedRates.usdtRate > 0) {
          setUsdtRate(savedRates.usdtRate);
        }
        if (savedRates.usdtSellRate != null && savedRates.usdtSellRate > 0) {
          setUsdtBid(savedRates.usdtSellRate);
        }
      } else {
        setNairaRate(210);
        setCediRate(0.6);
      }
      // 与 USDT 采集组件缓存对齐：优先用最新采集的 bid/ask/mid 覆盖手输区
      if (liveUsdt && liveUsdt.mid > 0) {
        setUsdtRate(liveUsdt.mid);
        if (liveUsdt.bid > 0) setUsdtBid(liveUsdt.bid);
        if (liveUsdt.ask > 0) setUsdtAsk(liveUsdt.ask);
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
    
    // 恢复表单数据（async 避免使用过期内存缓存导致闪跳）
    void getExchangeRateFormDataAsync().then((savedFormData) => {
      if (!savedFormData) return;
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
      // nairaRate / cediRate are intentionally NOT restored here —
      // they are always loaded fresh from calculatorInputRates to avoid stale→new flash.
      setCurrencyPreferenceList(savedFormData.currencyPreferenceList || []);
      setCustomerSource(savedFormData.customerSource || "");
    }).catch(console.error);
    
    // 每30秒刷新未读数和客户来源（商家数据改用realtime订阅）
    const interval = setInterval(() => {
      const newCount = getUnreadMemoCount();
      setMemoUnreadCount(newCount);
      setCustomerSources(getActiveCustomerSources());
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  // 设置页增删客户来源后同步下拉选项（不依赖 30s 轮询）
  useEffect(() => {
    const onCustomerSourcesRefresh = () => {
      setCustomerSources(getActiveCustomerSources());
    };
    window.addEventListener('data-refresh:customer_sources', onCustomerSourcesRefresh);
    return () => window.removeEventListener('data-refresh:customer_sources', onCustomerSourcesRefresh);
  }, []);

  // Merchant tables Realtime: delegate to useMerchantConfig's refetch
  const { refetch: refetchMerchantConfig } = useMerchantConfig();
  useEffect(() => {
    const handler = () => { refetchMerchantConfig(); };
    window.addEventListener('data-refresh:cards', handler);
    window.addEventListener('data-refresh:vendors', handler);
    window.addEventListener('data-refresh:payment_providers', handler);
    return () => {
      window.removeEventListener('data-refresh:cards', handler);
      window.removeEventListener('data-refresh:vendors', handler);
      window.removeEventListener('data-refresh:payment_providers', handler);
    };
  }, [refetchMerchantConfig]);

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
    if (isPlatformAdminReadonlyView) return;
    const save = async () => {
      const prev = await loadSharedData<CalculatorInputRates>('calculatorInputRates');
      // 当前无采集 bid 时不要写 0 覆盖已有卖价，否则活动赠送会错误回退到中间价
      const sellPersist =
        usdtBid > 0 ? usdtBid : prev?.usdtSellRate && prev.usdtSellRate > 0 ? prev.usdtSellRate : 0;
      const ok = await saveSharedData('calculatorInputRates', {
        nairaRate,
        cediRate,
        usdtRate: usdtRate ?? 0,
        usdtSellRate: sellPersist,
        lastUpdated: new Date().toISOString(),
      });
      if (!ok) console.error('[ExchangeRate] Failed to save calculatorInputRates');
    };
    save();
  }, [nairaRate, cediRate, usdtRate, usdtBid, ratesInitialized, isPlatformAdminReadonlyView]);



  // 刷新汇率采集（isManual: 用户点击刷新时 true，自动/页面切换触发时 false）
  // 自动触发失败时静默使用缓存，避免每次切换页面都弹「汇率采集失败」
  const handleRefreshCurrencyRates = useCallback(async (isManual = false) => {
    if (isPlatformAdminReadonlyView) {
      if (isManual) {
        notify.error(t("平台总管理查看租户时为只读，无法手动更新汇率采集", "Read-only in admin view, cannot refresh exchange rates"));
      }
      return;
    }
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
        notify.success(t("汇率采集已更新", "Exchange rates updated"));
      } else {
        // 更新时间但不更新汇率
        const updatedRates = { ...oldRates, lastUpdated: new Date().toISOString() };
        setCurrencyRates(updatedRates);
        await saveCurrencyRates(updatedRates);
        if (isManual) notify.info(t("汇率无变化", "No rate changes"));
      }
    } else {
      // 采集失败：手动刷新时提示，自动刷新时静默使用缓存
      if (isManual) {
        notify.error(t("汇率采集失败", "Failed to fetch rates"));
      }
    }
  }, [currencyRates, isPlatformAdminReadonlyView, t]);

  // 卡片信息（用于旧逻辑兼容，新逻辑使用计算器独立状态）
  const [cardValue, setCardValue] = useState("");
  const [cardRate, setCardRate] = useState("");

  const [cashSpecialRefresh, setCashSpecialRefresh] = useState(0);

  useEffect(() => {
    return subscribeCalculatorChange(() => {
      setCashSpecialRefresh(prev => prev + 1);
    });
  }, []);

  // 安全汇率值（null时使用0，防止计算错误）
  const safeNairaRate = nairaRate ?? 0;
  const safeCediRate = cediRate ?? 0;
  const safeUsdtRateMid = usdtRate ?? 0;

  // 支付金额（互斥）
  const [payNaira, setPayNaira] = useState("");
  const [payCedi, setPayCedi] = useState("");
  const [payUsdt, setPayUsdt] = useState("");

  // 动态 USDT 汇率：已填支付 USDT 时用较低价(usdtBid=卖单侧)；未填时用较高价(usdtAsk=买入侧)
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
    return payUsdtVal > 0 ? t('卖出价', 'Sell rate') : t('买入价', 'Buy rate');
  }, [payUsdt, usdtBid, usdtAsk, t]);

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
        nairaRate: 0,
        cediRate: 0,
        currencyPreferenceList,
        customerSource,
      };
      saveExchangeRateFormData(formData);
    }
  }, [cardType, cardMerchant, paymentAgent, phoneNumber, memberCode, memberLevel, selectedCommonCards, customerFeature, remarkOrder, remarkMember, bankCard, cardValue, cardRate, payNaira, payCedi, payUsdt, currencyPreferenceList, customerSource]);
  // 电话号码自动匹配会员 - 只允许阿拉伯数字，最长18位
  // 使用 RPC 避免 profiles.employee_id 为空时 RLS 拦截
  const handlePhoneNumberChange = useCallback(async (value: string) => {
    // 只保留阿拉伯数字 (0-9)，自动去除空格和其他字符，最长18位
    const cleanedValue = value.replace(/[^0-9]/g, '').slice(0, 18);
    setPhoneNumber(cleanedValue);
    
    if (cleanedValue.length >= 8) {
      try {
        const dbMember = await getMemberByPhoneForMyTenant(cleanedValue, effectiveMemberTenantId);

        if (dbMember && effectiveMemberTenantId && !isMemberInTenant(dbMember, effectiveMemberTenantId)) {
          const newMemberCode = generateMemberId();
          setMemberCode(newMemberCode);
          setMemberLevel("");
          setSelectedCommonCards([]);
          setCustomerFeature("");
          setBankCard("");
          setRemarkMember("");
          setCurrencyPreferenceList([]);
          setCustomerSource("");
          notify.error(
            t(
              "该手机号不属于当前租户，无法自动匹配；请在当前租户新建会员或使用归属本租户的号码。",
              "This phone is not in the current tenant. Create a member here or use a number registered in this tenant.",
            ),
          );
        } else if (dbMember) {
          // 会员存在 - 填充只读和可编辑字段
          setMemberCode(dbMember.member_code);
          setMemberLevel(dbMember.member_level || '');
          setSelectedCommonCards(dbMember.common_cards || []);
          setCustomerFeature(dbMember.customer_feature || "");
          setBankCard(dbMember.bank_card || "");
          setRemarkMember(dbMember.remark || "");
          setCurrencyPreferenceList(dbMember.currency_preferences || []);
          setCustomerSource(dbMember.source_id || "");
          notify.success(t(`已匹配到会员: ${dbMember.member_code}`, `Member matched: ${dbMember.member_code}`));
        } else {
          // 新会员 - 清空所有字段并生成新编号
          const newMemberCode = generateMemberId();
          setMemberCode(newMemberCode);
          setMemberLevel("");
          setSelectedCommonCards([]);
          setCustomerFeature("");
          setBankCard("");
          setRemarkMember("");
          setCurrencyPreferenceList([]);
          setCustomerSource("");
          notify.info(t(`新会员，已生成编号: ${newMemberCode}`, `New member, code generated: ${newMemberCode}`));
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
  }, [t, effectiveMemberTenantId]);

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
    if (usdt > 0 && btcPrice != null && btcPrice > 0) {
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
    notify.success(t(`已填入支付奈拉: ${rounded}`, `Naira payment filled: ${rounded}`));
  };

  // 填充赛地金额（取整数，向下取整）
  const fillCediAmount = (value: string) => {
    const num = parseFloat(value) || 0;
    const rounded = Math.floor(num);
    setPayCedi(rounded.toString());
    setPayNaira("");
    setPayUsdt("");
    notify.success(t(`已填入支付赛地: ${rounded}`, `Cedi payment filled: ${rounded}`));
  };

  // 填充USDT金额（取整数，向下取整）
  const fillUsdtAmount = (value: string) => {
    const num = parseFloat(value) || 0;
    const rounded = Math.floor(num);
    setPayUsdt(rounded.toString());
    setPayNaira("");
    setPayCedi("");
    notify.success(t(`已填入支付USDT: ${rounded}`, `USDT payment filled: ${rounded}`));
  };

  // 复制银行卡信息
  const copyBankCard = () => {
    if (bankCard) {
      navigator.clipboard.writeText(bankCard);
      notify.success(t("复制成功", "Copy successful"));
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
    
    // 利润分析 USDT：使用较低参考价(usdtBid = P2P 卖单侧，用户买入 USDT 的均价)
    const usdtBidRate = usdtBid > 0 ? usdtBid : safeUsdtRate;
    const usdt = rates.map(r => {
      if (cardWorthRMB <= 0) return '0.0';
      const basePayment = cardWorthRMB * (1 - r);
      const result = usdtBidRate > 0 ? basePayment / usdtBidRate - usdtFeeNum : 0;
      return result.toFixed(1);
    });
    
    return { naira, cedi, usdt };
  }, [cardValue, cardRate, usdtBid, usdtFeeNum, profitRates, feeSettings, safeCediRate, safeNairaRate, safeUsdtRate]);

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
  }, [cardValue, cardRate, usdtFeeNum, payNaira, payCedi, payUsdt, payBtc, btcPrice, feeSettings, safeCediRate, safeNairaRate, safeUsdtRate]);

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

  const {
    handleConfirmAnomalySubmit,
    anomalyWarnings,
    showAnomalyDialog,
    setShowAnomalyDialog,
  } = useOrderSubmit({
    t,
    blockReadonly,
    nairaRate,
    cediRate,
    usdtFee,
    cardValue,
    cardRate,
    payNaira,
    payCedi,
    payUsdt,
    profitCalculation,
    safeUsdtRate,
    safeNairaRate,
    safeCediRate,
    phoneNumber,
    memberCode,
    currencyPreferenceList,
    remarkMember,
    customerFeature,
    bankCard,
    customerSource,
    cardType,
    cardMerchant,
    paymentAgent,
    remarkOrder,
    effectiveMemberTenantId,
    usdtFeeNum,
    feeSettings,
    findMemberByPhone,
    updateMemberByPhone,
    addMember,
    addOrder,
    addUsdtOrderDb,
    employee,
    setMemberCode,
    setCardValue,
    setCardRate,
    setPayNaira,
    setPayCedi,
    setPayUsdt,
    setCardType,
    setCardMerchant,
    setPaymentAgent,
    setPhoneNumber,
    setMemberLevel,
    setSelectedCommonCards,
    setCustomerFeature,
    setBankCard,
    setRemarkMember,
    setRemarkOrder,
    setCustomerSource,
    setCurrencyPreferenceList,
  });

  const handleConfirmRedeem = useCallback(async () => {
    if (!redeemPreviewData) return;
    if (blockReadonly("进行积分兑换")) return;

    try {
      const result = await redeemPoints(redeemPreviewData.memberCode, redeemPreviewData.phoneNumber, redeemPreviewData.remainingPoints);

      if (!result.success) {
        notify.error(result.message || t("积分扣减失败", "Failed to deduct points"));
        setIsRedeemConfirmOpen(false);
        return;
      }

      const finalRemark = redeemRemark.trim()
        ? redeemRemark
        : `${redeemPreviewData.remainingPoints}积分兑换`;
      await addActivityGift({
        phoneNumber: redeemPreviewData.phoneNumber,
        currency: redeemPreviewData.currency,
        amount: redeemPreviewData.rewardAmount,
        rate: redeemPreviewData.currentRate,
        fee: redeemPreviewData.fee,
        giftValue: redeemPreviewData.giftValue,
        paymentAgent: redeemPaymentProvider,
        giftType: "points_redeem",
        remark: finalRemark,
        creatorName: employee?.real_name,
      }, undefined, employee?.id);

      notify.success(t(
        `兑换成功！已兑换 ${result.redeemedPoints} 积分，获得 ${redeemPreviewData.rewardAmount} ${redeemPreviewData.currency}，积分已清零`,
        `Redemption successful! ${result.redeemedPoints} points redeemed for ${redeemPreviewData.rewardAmount} ${redeemPreviewData.currency}`
      ));

      setIsRedeemConfirmOpen(false);
      setIsRedeemDialogOpen(false);
    } catch (error) {
      console.error("兑换过程发生错误:", error);
      notify.error(t("兑换过程发生错误，请重试", "Redemption error, please try again"));
      setIsRedeemConfirmOpen(false);
    }
  }, [
    redeemPreviewData,
    redeemRemark,
    redeemPaymentProvider,
    blockReadonly,
    t,
    addActivityGift,
    employee?.real_name,
    employee?.id,
  ]);

  const handleQuickAmountChange = (index: number, value: string) => {
    if (!quickSettingsLoaded) return;
    if (blockReadonly("修改快捷金额")) return;
    const newAmounts = [...quickAmounts];
    newAmounts[index] = value;
    setQuickAmounts(newAmounts);
    // 自动保存到数据库
    saveSharedData('quickAmounts', newAmounts);
  };

  const handleQuickRateChange = (index: number, value: string) => {
    if (!quickSettingsLoaded) return;
    if (blockReadonly("修改快捷汇率")) return;
    const newRates = [...quickRates];
    newRates[index] = value;
    setQuickRates(newRates);
    // 自动保存到数据库
    saveSharedData('quickRates', newRates);
  };

  // 右侧工作栏宽度 420px = 原 280px 加宽 50%，便于付款信息表格等
  return (
    <div className={cn("grid grid-cols-1 gap-4", showRightPanel ? "lg:grid-cols-[1fr_420px]" : "lg:grid-cols-1")}>
      <div className="space-y-4 min-w-0">
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
              {t('确认提交', 'Confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Card className="shadow-lg border-0 bg-gradient-to-br from-card to-card/95">
        <CardContent className="px-3 pt-5 pb-4 sm:px-6">
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
                  <span className="hidden sm:inline">{t("奈拉汇率", "Naira Rate")}</span>
                  <span className="sm:hidden">{t("奈拉", "Naira")}</span>
                </div>
                {nairaRate === null ? (
                  <Skeleton className="h-6 w-full" />
                ) : (
                <Input 
                  type="number"
                  step="any"
                  value={nairaRate} 
                  onChange={(e) => setNairaRate(parseFloat(e.target.value) || 0)}
                  disabled={isPlatformAdminReadonlyView}
                  className="h-6 text-center text-base lg:text-lg font-bold text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-700 bg-white/60 dark:bg-white/10"
                />
                )}
              </div>
              <div className="bg-gradient-to-br from-indigo-50 to-indigo-100 dark:from-indigo-900/30 dark:to-indigo-800/20 border-r border-border/30 py-2 px-2 lg:px-3 text-center">
                <div className="text-xs font-medium text-indigo-600 dark:text-indigo-400 mb-0.5">
                  <span className="hidden sm:inline">{t("赛地汇率", "Cedi Rate")}</span>
                  <span className="sm:hidden">{t("赛地", "Cedi")}</span>
                </div>
                {cediRate === null ? (
                  <Skeleton className="h-6 w-full" />
                ) : (
                <Input 
                  type="number"
                  step="any"
                  value={cediRate} 
                  onChange={(e) => setCediRate(parseFloat(e.target.value) || 0)}
                  disabled={isPlatformAdminReadonlyView}
                  className="h-6 text-center text-base lg:text-lg font-bold text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-700 bg-white/60 dark:bg-white/10"
                />
                )}
              </div>
              {/* BTC 价格 — 移动端 DrawerDetail，桌面端 Popover */}
              {isMobile ? (
                <>
                  <div
                    className="bg-gradient-to-br from-amber-50 to-amber-100 dark:from-amber-900/30 dark:to-amber-800/20 border-r border-border/30 py-2 px-2 lg:px-3 text-center cursor-pointer hover:ring-2 hover:ring-amber-300 dark:hover:ring-amber-600 rounded-r-sm transition-all"
                    onClick={() => setBtcDialogOpen(true)}
                  >
                    <div className="text-xs font-medium text-amber-600 dark:text-amber-400 flex items-center justify-center gap-1 lg:gap-1.5 mb-0.5">
                      <span>BTC</span>
                      <Settings className="h-3 w-3 opacity-70" />
                    </div>
                    <div className="text-base lg:text-lg font-bold text-amber-700 dark:text-amber-300">
                      {btcPrice === null ? <Skeleton className="h-5 w-16 mx-auto" /> : btcPrice}
                    </div>
                  </div>
                  <DrawerDetail
                    open={btcDialogOpen}
                    onOpenChange={setBtcDialogOpen}
                    title={t("BTC 价格", "BTC Price")}
                    sheetMaxWidth="3xl"
                  >
                    <BtcPriceSettingsCard />
                  </DrawerDetail>
                </>
              ) : (
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
              )}
              <div className="bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900/30 dark:to-slate-800/20 border-r border-border/30 py-2 px-2 lg:px-3 text-center">
                <div className="text-xs font-medium text-muted-foreground flex items-center justify-center gap-1 lg:gap-1.5 mb-0.5">
                  <span className="hidden sm:inline">{t("USDT手续费", "USDT Fee")}</span>
                  <span className="sm:hidden">{t("手续费", "Fee")}</span>
                  <Lock className="h-3 w-3 opacity-70" />
                </div>
                <div className="text-base lg:text-lg font-bold text-foreground">{usdtFee || "0"}</div>
              </div>
              <div className="bg-gradient-to-br from-cyan-50 to-cyan-100 dark:from-cyan-900/30 dark:to-cyan-800/20 py-2 px-2 lg:px-3 text-center">
                <div className="text-xs font-medium text-cyan-600 dark:text-cyan-400 flex items-center justify-center gap-1 lg:gap-1.5 mb-0.5">
                  <span className="hidden sm:inline">{t("现金专属", "Cash Exclusive")}</span>
                  <span className="sm:hidden">{t("现金", "Cash")}</span>
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
                  isMobile &&
                    "w-full min-w-0 justify-start overflow-x-auto overflow-y-visible [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]",
                )}>
                  {/* 可见的Tab */}
                  {visibleTabs.map((tab) => (
                    <TabsTrigger 
                      key={tab.value}
                      value={tab.value} 
                      className={cn(
                        "rounded-lg px-2 lg:px-4 py-1.5 lg:py-2 text-xs lg:text-sm font-medium transition-all duration-200 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-lg data-[state=active]:scale-105 hover:bg-muted",
                        tab.showBadge ? "relative overflow-visible" : "",
                        isMobile && "shrink-0 whitespace-nowrap",
                      )}
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
                {/* 右侧工作面板折叠按钮（仅桌面端显示） */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="hidden lg:flex h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                  onClick={toggleRightPanel}
                  aria-expanded={showRightPanel}
                  title={showRightPanel ? t("隐藏工作面板", "Hide Panel") : t("显示工作面板", "Show Panel")}
                >
                  {showRightPanel ? (
                    <PanelRightClose className="h-4 w-4" />
                  ) : (
                    <PanelRightOpen className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            {/* 汇率计算1 - 使用独立计算器组件 */}
            <TabsContent value="calc1" className="mt-0 animate-fade-in">
              <RateCalculator
                calcId="calc1"
                usdtRate={usdtRate ?? 0}
                usdtBid={usdtBid}
                usdtAsk={usdtAsk}
                nairaRate={nairaRate ?? 0}
                cediRate={cediRate ?? 0}
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
                memberLookupTenantId={effectiveMemberTenantId}
              />
            </TabsContent>

            {/* 汇率计算2 - 使用独立计算器组件 */}
            <TabsContent value="calc2" className="mt-0 animate-fade-in">
              <RateCalculator
                calcId="calc2"
                usdtRate={usdtRate ?? 0}
                usdtBid={usdtBid}
                usdtAsk={usdtAsk}
                nairaRate={nairaRate ?? 0}
                cediRate={cediRate ?? 0}
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
                memberLookupTenantId={effectiveMemberTenantId}
              />
            </TabsContent>

            {/* 汇率计算3 - 使用独立计算器组件 */}
            <TabsContent value="calc3" className="mt-0 animate-fade-in">
              <RateCalculator
                calcId="calc3"
                usdtRate={usdtRate ?? 0}
                usdtBid={usdtBid}
                usdtAsk={usdtAsk}
                nairaRate={nairaRate ?? 0}
                cediRate={cediRate ?? 0}
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
                memberLookupTenantId={effectiveMemberTenantId}
              />
            </TabsContent>

            <TabsContent value="activity">
              <ActivityGiftTab 
                nairaRate={nairaRate ?? 0}
                cediRate={cediRate ?? 0}
                usdtRate={usdtBid > 0 ? usdtBid : (usdtRate ?? 0)}
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
                onRefreshCurrencyRates={handleRefreshCurrencyRates}
                nairaRate={safeNairaRate}
                cediRate={safeCediRate}
                cardsList={cardsList}
                isReadOnly={isPlatformAdminReadonlyView}
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

      {/* 移动端：号码提取 + 工作任务（主内容下方） */}
      <div className="lg:hidden space-y-4">
        <PhoneExtractPanel />
        <TasksQuickPanel />
      </div>

      </div>

      {/* 右侧：号码提取 + 工作任务（可折叠） */}
      {showRightPanel && (
        <div className="hidden lg:block space-y-4">
          <PhoneExtractPanel />
          <ExchangePaymentInfoPanel />
          <TasksQuickPanel />
        </div>
      )}

      <ExchangeRateRedeemDrawer
        open={isRedeemDialogOpen}
        onOpenChange={setIsRedeemDialogOpen}
        confirmOpen={isRedeemConfirmOpen}
        onConfirmOpenChange={setIsRedeemConfirmOpen}
        paymentProvider={redeemPaymentProvider}
        onPaymentProviderChange={setRedeemPaymentProvider}
        remark={redeemRemark}
        onRemarkChange={setRedeemRemark}
        previewData={redeemPreviewData}
        paymentProvidersList={paymentProvidersList}
        isReadOnly={isPlatformAdminReadonlyView}
        blockReadonly={blockReadonly}
        t={t}
        onConfirmRedeem={handleConfirmRedeem}
      />
    </div>
  );
}
