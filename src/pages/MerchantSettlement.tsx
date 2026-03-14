import { useState, useEffect, useMemo, useRef } from "react";
import { trackRender } from "@/lib/performanceUtils";
import { TablePageSkeleton } from "@/components/skeletons/TablePageSkeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
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
import { Search, RefreshCw, Loader2, Download, ChevronLeft, ChevronRight, Pencil, Trash2, History, MoreHorizontal } from "lucide-react";
import { DialogDescription } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PageSizeSelect } from "@/components/ui/page-size-select";
import { exportToCSV, formatNumberForExport } from "@/lib/exportUtils";
import { toast as sonnerToast } from "sonner";

// Compatibility wrapper: converts old Radix toast API to sonner
const toast = (opts: { title: string; variant?: string; description?: string }) => {
  if (opts.variant === 'destructive') {
    sonnerToast.error(opts.title, opts.description ? { description: opts.description } : undefined);
  } else {
    sonnerToast.success(opts.title, opts.description ? { description: opts.description } : undefined);
  }
};
import { showSubmissionError } from "@/services/submissionErrorService";
import { useLanguage } from "@/contexts/LanguageContext";
import { notifyDataMutation } from "@/services/dataRefreshManager";
import { safeNumber, safeToFixed } from "@/lib/safeCalc";
import {
  getCardMerchantSettlements,
  setInitialBalance,
  addWithdrawal,
  undoLastAction,
  calculateWithdrawalTotal,
  getWithdrawalsForVendor,
  CardMerchantSettlement,
  WithdrawalRecord,
  getPaymentProviderSettlements,
  setProviderInitialBalance,
  addRecharge,
  undoProviderLastAction,
  calculateRechargeTotal,
  getRechargesForProvider,
  PaymentProviderSettlement,
  RechargeRecord,
  initializeSettlementCache,
  updateWithdrawal,
  deleteWithdrawal,
  updateRecharge,
  deleteRecharge,
  getCardMerchantSettlementsAsync,
  getPaymentProviderSettlementsAsync,
  setCurrentOperator,
  forceRefreshSettlementCache,
  getArchivedWithdrawalsForVendor,
  getArchivedRechargesForProvider,
  ArchivedWithdrawals,
  ArchivedRecharges,
} from "@/stores/merchantSettlementStore";
import VendorManagementDialog from "@/components/VendorManagementDialog";
import ProviderManagementDialog from "@/components/ProviderManagementDialog";
import { MerchantType } from "@/stores/merchantSettlementStore";
import { useAuth } from "@/contexts/AuthContext";
import { useTenantView } from "@/contexts/TenantViewContext";
import { useIsPlatformAdminViewingTenant } from "@/hooks/useIsPlatformAdminViewingTenant";
import { getMyTenantOrdersFull, getMyTenantUsdtOrdersFull, getTenantOrdersFull, getTenantUsdtOrdersFull } from "@/services/tenantService";
import { useFieldPermissions } from "@/hooks/useFieldPermissions";
import {
  fetchMerchantCards,
  fetchMerchantPaymentProviders,
  fetchMerchantVendors,
} from "@/services/merchantConfigReadService";
import { supabase } from "@/integrations/supabase/client";
import { useMerchantNameResolver, getEmployeeNameById } from "@/hooks/useNameResolver";
import ShiftHandoverHistoryTab from "@/components/ShiftHandoverHistoryTab";
import { CardMerchantSettlementTab, PaymentProviderSettlementTab } from "@/components/merchant-settlement";
import {
  calculateAllVendorBalances,
  calculateAllProviderBalances,
  VendorBalanceResult,
  ProviderBalanceResult,
} from "@/services/settlementCalculationService";
import { useSortableData } from "@/components/ui/sortable-table-head";
import {
  ensureUserPreferencesLoaded,
  getMerchantSettlementPageSizes,
  setMerchantSettlementPageSizes,
} from "@/services/userPreferencesService";
import { useIsMobile, useIsTablet } from "@/hooks/use-mobile";

interface VendorSettlementData {
  vendorName: string;
  initialBalance: number;
  orderTotal: number;
  withdrawalTotal: number;
  postResetAdjustment: number;
  realTimeBalance: number;
  lastResetTime: string | null;
  settlement: CardMerchantSettlement | null;
}

interface ProviderSettlementData {
  providerName: string;
  initialBalance: number;
  orderTotal: number;
  giftTotal: number;
  rechargeTotal: number;
  postResetAdjustment: number;
  realTimeBalance: number;
  lastResetTime: string | null;
  settlement: PaymentProviderSettlement | null;
}

// ============= Module-level settlement data cache =============
interface _MSCacheData {
  cards: any[]; vendors: any[]; providers: any[];
  dbOrders: any[]; activityGifts: any[];
  cardSettlements: CardMerchantSettlement[];
  providerSettlements: PaymentProviderSettlement[];
  employees: { id: string; real_name: string }[];
  loadedAt: number;
}
let _msCache: _MSCacheData | null = null;
const _MS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const _msCacheValid = () => _msCache != null && Date.now() - _msCache.loadedAt < _MS_CACHE_TTL;
if (typeof window !== 'undefined') {
  window.addEventListener('userDataSynced', () => { _msCache = null; });
}

export default function MerchantSettlement() {
  trackRender('MerchantSettlement');
  const { employee } = useAuth();
  const { viewingTenantId } = useTenantView() || {};
  const effectiveTenantId = viewingTenantId || employee?.tenant_id || null;
  const useMyTenantRpc = !!(effectiveTenantId && employee?.tenant_id && effectiveTenantId === employee.tenant_id);
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  const useCompactLayout = isMobile || isTablet;
  const { checkPermission } = useFieldPermissions();
  const { t, tr } = useLanguage();
  const isPlatformAdminReadonlyView = useIsPlatformAdminViewingTenant();
  // 编辑余额权限 - 控制提款/充值/初始余额/撤回操作
  const canEditBalance = useMemo(() => {
    return checkPermission('merchant_settlement', 'edit_balance').canEdit && !isPlatformAdminReadonlyView;
  }, [checkPermission, isPlatformAdminReadonlyView]);
  const blockReadonly = (action: string) => {
    if (!isPlatformAdminReadonlyView) return false;
    sonnerToast.error(`平台总管理查看租户时为只读，无法${action}`);
    return true;
  };
  
  // 商家名称解析器 - 实时获取最新商家名称
  const { resolveVendorName, resolveProviderName } = useMerchantNameResolver();
  
  // 统一搜索词和当前激活的 Tab
  const [activeTab, setActiveTab] = useState<'card-merchant' | 'payment-agent' | 'shift-handover'>('card-merchant');
  const [searchTerm, setSearchTerm] = useState("");
  const [cards, setCards] = useState<any[]>(() => _msCache?.cards || []);
  const [vendors, setVendors] = useState<any[]>(() => _msCache?.vendors || []);
  const [providers, setProviders] = useState<any[]>(() => _msCache?.providers || []);
  const [cardSettlements, setCardSettlements] = useState<CardMerchantSettlement[]>(() => _msCache?.cardSettlements || []);
  const [providerSettlements, setProviderSettlements] = useState<PaymentProviderSettlement[]>(() => _msCache?.providerSettlements || []);
  
  // Card Merchant Dialog states
  const [isInitialBalanceDialogOpen, setIsInitialBalanceDialogOpen] = useState(false);
  const [isWithdrawalDialogOpen, setIsWithdrawalDialogOpen] = useState(false);
  const [isDetailsDialogOpen, setIsDetailsDialogOpen] = useState(false);
  const [isUndoConfirmOpen, setIsUndoConfirmOpen] = useState(false);
  
  // Payment Provider Dialog states
  const [isProviderInitialBalanceDialogOpen, setIsProviderInitialBalanceDialogOpen] = useState(false);
  const [isRechargeDialogOpen, setIsRechargeDialogOpen] = useState(false);
  const [isProviderDetailsDialogOpen, setIsProviderDetailsDialogOpen] = useState(false);
  const [isProviderUndoConfirmOpen, setIsProviderUndoConfirmOpen] = useState(false);
  
  // 员工列表（用于显示录入人姓名）
  const [employees, setEmployees] = useState<{ id: string; real_name: string }[]>(() => _msCache?.employees || []);
  
  // Current editing vendor/provider
  const [currentVendor, setCurrentVendor] = useState<string>("");
  const [currentProvider, setCurrentProvider] = useState<string>("");
  const [initialBalanceAmount, setInitialBalanceAmount] = useState("");
  const [withdrawalAmountUsdt, setWithdrawalAmountUsdt] = useState("");
  const [withdrawalUsdtRate, setWithdrawalUsdtRate] = useState("");
  const [currentWithdrawals, setCurrentWithdrawals] = useState<WithdrawalRecord[]>([]);
  const [currentArchivedWithdrawals, setCurrentArchivedWithdrawals] = useState<ArchivedWithdrawals[]>([]);
  
  // 编辑/删除状态
  const [editingWithdrawal, setEditingWithdrawal] = useState<WithdrawalRecord | null>(null);
  const [editingRecharge, setEditingRecharge] = useState<RechargeRecord | null>(null);
  const [deletingWithdrawalId, setDeletingWithdrawalId] = useState<string | null>(null);
  const [deletingRechargeId, setDeletingRechargeId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  
  // Provider form states
  const [providerInitialBalanceAmount, setProviderInitialBalanceAmount] = useState("");
  const [rechargeAmountUsdt, setRechargeAmountUsdt] = useState("");
  const [rechargeUsdtRate, setRechargeUsdtRate] = useState("");
  const [rechargeRemark, setRechargeRemark] = useState("");
  const [currentRecharges, setCurrentRecharges] = useState<RechargeRecord[]>();
  const [currentArchivedRecharges, setCurrentArchivedRecharges] = useState<ArchivedRecharges[]>([]);
  
  // 备注状态
  const [withdrawalRemark, setWithdrawalRemark] = useState("");

  // 从数据库加载订单数据
  const [dbOrders, setDbOrders] = useState<any[]>(() => _msCache?.dbOrders || []);
  
  // 分页状态
  const [vendorPage, setVendorPage] = useState(1);
  const [providerPage, setProviderPage] = useState(1);
  const [vendorPageSize, setVendorPageSize] = useState(20);
  const [providerPageSize, setProviderPageSize] = useState(20);
  
  // 赠送数据
  const [activityGifts, setActivityGifts] = useState<any[]>(() => _msCache?.activityGifts || []);

  // 加载状态
  const [isLoading, setIsLoading] = useState(!_msCacheValid());
  
  
  // 统一管理弹窗状态
  const [isVendorManagementOpen, setIsVendorManagementOpen] = useState(false);
  const [vendorManagementDefaultTab, setVendorManagementDefaultTab] = useState('details');
  const [isProviderManagementOpen, setIsProviderManagementOpen] = useState(false);
  const [providerManagementDefaultTab, setProviderManagementDefaultTab] = useState('details');
  
  // 设置当前操作人信息（用于余额变动记录）
  useEffect(() => {
    if (employee) {
      setCurrentOperator(employee.id, employee.real_name);
    }
  }, [employee]);

  useEffect(() => {
    if (_msCacheValid()) return; // Module-level cache still fresh, skip loading
    const initData = async () => {
      setIsLoading(true);
      try {
        await initializeSettlementCache();
        await ensureUserPreferencesLoaded();
        const sizes = getMerchantSettlementPageSizes({ vendorPageSize: 20, providerPageSize: 20 });
        setVendorPageSize(sizes.vendorPageSize);
        setProviderPageSize(sizes.providerPageSize);
        await loadData();
        await loadEmployees();
      } catch (error) {
        console.error('[MerchantSettlement] Failed to initialize:', error);
      } finally {
        setIsLoading(false);
      }
    };
    initData();
  }, []);

  // Local save guard: suppress Realtime reloads during local saves to prevent race conditions
  const localSavePendingRef = useRef(false);
  const localSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Ref to always hold the latest loadData function, avoiding stale closures in Realtime callbacks
  const loadDataRef = useRef<() => Promise<void>>(async () => {});

  const markLocalSave = () => {
    localSavePendingRef.current = true;
    if (localSaveTimerRef.current) clearTimeout(localSaveTimerRef.current);
    localSaveTimerRef.current = setTimeout(() => {
      localSavePendingRef.current = false;
    }, 3000); // 3秒内忽略 Realtime 重载，防止覆盖本地修改
  };

  // Realtime subscription for settlement data changes
  useEffect(() => {
    let unsubscribe: (() => void) | null = null;
    import('@/services/sharedDataService').then(({ subscribeToSharedData }) => {
      unsubscribe = subscribeToSharedData((key) => {
        if (key === 'cardMerchantSettlements' || key === 'paymentProviderSettlements') {
          // Skip reload if a local save is in progress to prevent race condition overwrite
          if (localSavePendingRef.current) {
            console.log('[MerchantSettlement] Skipping Realtime reload during local save');
            return;
          }
          forceRefreshSettlementCache().then(() => loadDataRef.current());
        }
      });
    });

    // Listen for postResetAdjustment updates (with debounce to prevent double refresh with Realtime)
    const handleAdjustmentUpdate = () => {
      // Set local save guard to suppress Realtime reload for this same change
      localSavePendingRef.current = true;
      if (localSaveTimerRef.current) clearTimeout(localSaveTimerRef.current);
      localSaveTimerRef.current = setTimeout(() => {
        localSavePendingRef.current = false;
      }, 3000);
      forceRefreshSettlementCache().then(() => loadDataRef.current());
    };
    window.addEventListener('settlement-adjustment-updated', handleAdjustmentUpdate);

    return () => {
      unsubscribe?.();
      window.removeEventListener('settlement-adjustment-updated', handleAdjustmentUpdate);
      if (localSaveTimerRef.current) clearTimeout(localSaveTimerRef.current);
    };
  }, []);

  // Realtime subscription for orders table — refreshes balance when orders are cancelled/deleted/updated
  useEffect(() => {
    const channel = supabase
      .channel('merchant-settlement-orders-rt')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'orders',
      }, () => {
        if (localSavePendingRef.current) return;
        loadDataRef.current();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  // Realtime subscription for ledger_transactions — refreshes when ledger entries change
  useEffect(() => {
    const channel = supabase
      .channel('merchant-settlement-ledger-rt')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'ledger_transactions',
      }, () => {
        if (localSavePendingRef.current) return;
        loadDataRef.current();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const loadEmployees = async () => {
    const { data } = await supabase.from("employees").select("id, real_name");
    setEmployees(data || []);
    if (_msCache) _msCache.employees = data || [];
  };

  const loadData = async () => {
    const [normalOrders, usdtOrders] = (effectiveTenantId && !useMyTenantRpc)
      ? await Promise.all([getTenantOrdersFull(effectiveTenantId), getTenantUsdtOrdersFull(effectiveTenantId)])
      : await Promise.all([getMyTenantOrdersFull(), getMyTenantUsdtOrdersFull()]);
    const allOrders = [...(normalOrders || []), ...(usdtOrders || [])].sort(
      (a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    const [cardsRes, vendorsRes, providersRes, giftsRes, cardSettlementsData, providerSettlementsData] = await Promise.all([
      fetchMerchantCards(),
      fetchMerchantVendors(),
      fetchMerchantPaymentProviders(),
      supabase.from("activity_gifts").select("*"),
      getCardMerchantSettlementsAsync(),
      getPaymentProviderSettlementsAsync(),
    ]);

    const cardsData = cardsRes
      .filter((row) => row.status === "active")
      .map((row) => ({
        id: row.id,
        name: row.name,
        type: row.type,
        status: row.status,
        remark: row.remark,
        created_at: row.createdAt,
        card_vendors: row.cardVendors || [],
        sort_order: row.sortOrder ?? 0,
      }));
    const vendorsData = vendorsRes
      .filter((row) => row.status === "active")
      .map((row) => ({
        id: row.id,
        name: row.name,
        status: row.status,
        remark: row.remark,
        created_at: row.createdAt,
        payment_providers: row.paymentProviders || [],
        sort_order: row.sortOrder ?? 0,
      }));
    const providersData = providersRes
      .filter((row) => row.status === "active")
      .map((row) => ({
        id: row.id,
        name: row.name,
        status: row.status,
        remark: row.remark,
        created_at: row.createdAt,
        sort_order: row.sortOrder ?? 0,
      }));

    setCards(cardsData);
    setVendors(vendorsData);
    setProviders(providersData);
    setDbOrders(allOrders);
    setActivityGifts(giftsRes.data || []);
    // 使用异步获取的结算数据（展开运算符创建新引用，确保 React 重渲染）
    setCardSettlements([...cardSettlementsData]);
    setProviderSettlements([...providerSettlementsData]);
    // Update module-level cache
    _msCache = {
      cards: cardsData, vendors: vendorsData, providers: providersData,
      dbOrders: allOrders, activityGifts: giftsRes.data || [],
      cardSettlements: [...cardSettlementsData], providerSettlements: [...providerSettlementsData],
      employees: _msCache?.employees || [], loadedAt: Date.now(),
    };
  };

  // Keep loadDataRef always pointing to the latest loadData
  useEffect(() => {
    loadDataRef.current = loadData;
  });

  // 刷新按钮处理函数 - 强制重新加载数据
  const handleRefresh = async () => {
    await forceRefreshSettlementCache(); // 先强制刷新缓存
    await loadData();
    toast({ title: t("数据已刷新", "Data refreshed") });
  };


  // 使用共享计算服务计算卡商余额
  // 卡商结算逻辑：实时余额 = 初始余额 + 订单总金额 - 提款总金额
  // 排序按照商家管理中的 sort_order 排序
  const vendorSettlementData = useMemo<VendorSettlementData[]>(() => {
    const results = calculateAllVendorBalances(vendors, dbOrders, cardSettlements);
    
    // 创建 vendorName -> sort_order 的映射
    const vendorSortMap = new Map<string, number>();
    vendors.forEach(v => {
      vendorSortMap.set(v.name, v.sort_order ?? 999);
    });
    
    // 按商家管理中的 sort_order 排序
    const sortedResults = results.sort((a, b) => {
      const sortA = vendorSortMap.get(a.vendorName) ?? 999;
      const sortB = vendorSortMap.get(b.vendorName) ?? 999;
      return sortA - sortB;
    });
    
    return sortedResults.map(r => ({
      vendorName: r.vendorName,
      initialBalance: r.initialBalance,
      orderTotal: r.orderTotal,
      withdrawalTotal: r.withdrawalTotal,
      postResetAdjustment: r.postResetAdjustment,
      realTimeBalance: r.realTimeBalance,
      lastResetTime: r.lastResetTime,
      settlement: cardSettlements.find(s => s.vendorName === r.vendorName) || null,
    }));
  }, [vendors, cardSettlements, dbOrders]);

  // 使用共享计算服务计算代付商家余额
  // 代付结算逻辑：实时余额 = 初始余额 - 订单总金额 - 赠送总金额 + 充值总额
  // 排序按照商家管理中的 sort_order 排序
  const providerSettlementData = useMemo<ProviderSettlementData[]>(() => {
    // 将赠送数据转换为计算服务需要的格式（包含 created_at 用于重置时间过滤）
    const giftsForCalc = activityGifts.map(g => ({
      payment_agent: g.payment_agent,
      gift_value: g.gift_value,
      created_at: g.created_at,  // 传递创建时间用于过滤
    }));
    
    const results = calculateAllProviderBalances(providers, dbOrders, providerSettlements, giftsForCalc);
    
    // 创建 providerName -> sort_order 的映射
    const providerSortMap = new Map<string, number>();
    providers.forEach(p => {
      providerSortMap.set(p.name, p.sort_order ?? 999);
    });
    
    // 按商家管理中的 sort_order 排序
    const sortedResults = results.sort((a, b) => {
      const sortA = providerSortMap.get(a.providerName) ?? 999;
      const sortB = providerSortMap.get(b.providerName) ?? 999;
      return sortA - sortB;
    });
    
    return sortedResults.map(r => ({
      providerName: r.providerName,
      initialBalance: r.initialBalance,
      orderTotal: r.orderTotal,
      giftTotal: r.giftTotal,
      rechargeTotal: r.rechargeTotal,
      postResetAdjustment: r.postResetAdjustment,
      realTimeBalance: r.realTimeBalance,
      lastResetTime: r.lastResetTime,
      settlement: providerSettlements.find(s => s.providerName === r.providerName) || null,
    }));
  }, [providers, providerSettlements, dbOrders, activityGifts]);

  // 过滤后的基础数据（统一使用 searchTerm）
  const baseFilteredVendorData = useMemo(() => vendorSettlementData
    .filter(v => v.vendorName.toLowerCase().includes(searchTerm.toLowerCase())), 
    [vendorSettlementData, searchTerm]);

  const baseFilteredProviderData = useMemo(() => providerSettlementData
    .filter(p => p.providerName.toLowerCase().includes(searchTerm.toLowerCase())), 
    [providerSettlementData, searchTerm]);

  // 使用排序 hook - 默认不排序，保持商家管理中的 sort_order 顺序
  const { sortedData: sortedVendorData, sortConfig: vendorSortConfig, requestSort: requestVendorSort } = 
    useSortableData(baseFilteredVendorData, null);
  
  const { sortedData: sortedProviderData, sortConfig: providerSortConfig, requestSort: requestProviderSort } = 
    useSortableData(baseFilteredProviderData, null);
  
  // 使用排序后的数据
  const filteredVendorData = sortedVendorData;
  const filteredProviderData = sortedProviderData;
  
  // 分页数据
  const vendorTotalPages = Math.ceil(filteredVendorData.length / vendorPageSize);
  const paginatedVendorData = useMemo(() => {
    const start = (vendorPage - 1) * vendorPageSize;
    return filteredVendorData.slice(start, start + vendorPageSize);
  }, [filteredVendorData, vendorPage, vendorPageSize]);
  
  const providerTotalPages = Math.ceil(filteredProviderData.length / providerPageSize);
  const paginatedProviderData = useMemo(() => {
    const start = (providerPage - 1) * providerPageSize;
    return filteredProviderData.slice(start, start + providerPageSize);
  }, [filteredProviderData, providerPage, providerPageSize]);
  
  // 分页大小变化处理
  const handleVendorPageSizeChange = (size: number) => {
    setVendorPageSize(size);
    setVendorPage(1);
    void setMerchantSettlementPageSizes({ vendorPageSize: size });
  };
  
  const handleProviderPageSizeChange = (size: number) => {
    setProviderPageSize(size);
    setProviderPage(1);
    void setMerchantSettlementPageSizes({ providerPageSize: size });
  };
  
  // 搜索变化时重置分页
  useEffect(() => { 
    setVendorPage(1); 
    setProviderPage(1);
  }, [searchTerm]);
  
  // 交班数据导出和刷新函数（由子组件注册）
  const shiftHandoverExportRef = useRef<(() => void) | null>(null);
  const shiftHandoverRefreshRef = useRef<(() => void) | null>(null);
  
  // 根据当前 Tab 动态获取搜索框 placeholder
  const searchPlaceholder = useMemo(() => {
    switch (activeTab) {
      case 'card-merchant':
        return t("搜索卡商名称", "Search vendor name");
      case 'payment-agent':
        return t("搜索代付商家", "Search provider");
      case 'shift-handover':
        return t("搜索交班人/接班人", "Search handover/receiver");
      default:
        return t("搜索", "Search");
    }
  }, [activeTab, t]);
  
  // 统一导出处理函数
  const handleUnifiedExport = () => {
    switch (activeTab) {
      case 'card-merchant':
        handleExportVendors();
        break;
      case 'payment-agent':
        handleExportProviders();
        break;
      case 'shift-handover':
        shiftHandoverExportRef.current?.();
        break;
    }
  };
  
  // 统一刷新处理函数
  const handleUnifiedRefresh = async () => {
    if (activeTab === 'shift-handover') {
      shiftHandoverRefreshRef.current?.();
    } else {
      await handleRefresh();
    }
  };
  
  // 导出卡商结算数据
  const handleExportVendors = () => {
    if (filteredVendorData.length === 0) {
      toast({ title: t("没有数据可导出", "No data to export"), variant: "destructive" });
      return;
    }
    const columns = [
      { key: 'vendorName', label: '卡商名称', labelEn: 'Vendor Name' },
      { key: 'initialBalance', label: '初始余额', labelEn: 'Initial Balance', formatter: (v: number) => formatNumberForExport(v) },
      { key: 'realTimeBalance', label: '实时余额', labelEn: 'Real-time Balance', formatter: (v: number) => formatNumberForExport(v) },
      { key: 'orderTotal', label: '订单总金额', labelEn: 'Order Total', formatter: (v: number) => formatNumberForExport(v) },
      { key: 'withdrawalTotal', label: '提款总金额', labelEn: 'Withdrawal Total', formatter: (v: number) => formatNumberForExport(v) },
      { key: 'postResetAdjustment', label: '重置后调整', labelEn: 'Post-Reset Adjustment', formatter: (v: number) => formatNumberForExport(v) },
      { key: 'lastResetTime', label: '最后重置时间', labelEn: 'Last Reset Time', formatter: (v: string | null) => v || '-' },
    ];
    exportToCSV(filteredVendorData, columns, 'vendor-settlement');
    toast({ title: t("导出成功", "Export successful") });
  };
  
  // Export payment provider settlement data
  const handleExportProviders = () => {
    if (filteredProviderData.length === 0) {
      toast({ title: t("没有数据可导出", "No data to export"), variant: "destructive" });
      return;
    }
    const columns = [
      { key: 'providerName', label: '代付商家', labelEn: 'Provider Name' },
      { key: 'initialBalance', label: '初始余额', labelEn: 'Initial Balance', formatter: (v: number) => formatNumberForExport(v) },
      { key: 'realTimeBalance', label: '实时余额', labelEn: 'Real-time Balance', formatter: (v: number) => formatNumberForExport(v) },
      { key: 'orderTotal', label: '订单总金额', labelEn: 'Order Total', formatter: (v: number) => formatNumberForExport(v) },
      { key: 'giftTotal', label: '赠送总金额', labelEn: 'Gift Total', formatter: (v: number) => formatNumberForExport(v) },
      { key: 'rechargeTotal', label: '充值总额', labelEn: 'Recharge Total', formatter: (v: number) => formatNumberForExport(v) },
      { key: 'postResetAdjustment', label: '重置后调整', labelEn: 'Post-Reset Adjustment', formatter: (v: number) => formatNumberForExport(v) },
      { key: 'lastResetTime', label: '最后重置时间', labelEn: 'Last Reset Time', formatter: (v: string | null) => v || '-' },
    ];
    exportToCSV(filteredProviderData, columns, 'provider-settlement');
    toast({ title: t("导出成功", "Export successful") });
  };

  // ==================== Card Merchant Handlers ====================
  const handleOpenInitialBalance = (vendorName: string) => {
    setCurrentVendor(vendorName);
    const settlement = cardSettlements.find(s => s.vendorName === vendorName);
    setInitialBalanceAmount(settlement?.initialBalance?.toString() || "0");
    setIsInitialBalanceDialogOpen(true);
  };

  const handleSaveInitialBalance = async () => {
    if (blockReadonly("设置初始余额")) return;
    const amount = parseFloat(initialBalanceAmount);
    if (isNaN(amount)) {
      showSubmissionError("请输入有效数值");
      return;
    }
    
    setIsSaving(true);
    try {
      // 获取当前实时余额用于记录变动明细
      const vendorData = vendorSettlementData.find(v => v.vendorName === currentVendor);
      const currentRealTimeBalance = vendorData?.realTimeBalance || 0;
      
      markLocalSave();
      await setInitialBalance(currentVendor, amount, currentRealTimeBalance);
      // Skip forceRefreshSettlementCache — cache already updated by save; re-reading DB risks stale data
      await loadData();
      setIsInitialBalanceDialogOpen(false);
      toast({ title: "初始余额已设置" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenWithdrawal = (vendorName: string) => {
    setCurrentVendor(vendorName);
    setWithdrawalAmountUsdt("");
    setWithdrawalUsdtRate("");
    setWithdrawalRemark("");
    setIsWithdrawalDialogOpen(true);
  };

  const handleSaveWithdrawal = async () => {
    if (blockReadonly("录入提款")) return;
    const amountUsdt = parseFloat(withdrawalAmountUsdt);
    const rate = parseFloat(withdrawalUsdtRate);
    
    if (isNaN(amountUsdt) || isNaN(rate)) {
      showSubmissionError("请输入有效数值");
      return;
    }
    
    setIsSaving(true);
    try {
      // 获取当前录入人ID（不再存储姓名，姓名通过ID实时获取）
      const recorderId = employee?.id || '';
      
      // 获取当前实时余额用于记录变动明细
      const vendorData = vendorSettlementData.find(v => v.vendorName === currentVendor);
      const currentBalance = vendorData?.realTimeBalance || 0;
      
      markLocalSave();
      await addWithdrawal(currentVendor, amountUsdt, rate, withdrawalRemark || undefined, currentBalance);
      // Skip forceRefreshSettlementCache — cache already updated by save
      await loadData();
      setIsWithdrawalDialogOpen(false);
      toast({ title: "提款已录入" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleViewDetails = (vendorName: string) => {
    setCurrentVendor(vendorName);
    const withdrawals = getWithdrawalsForVendor(vendorName);
    // 按创建时间倒序排列（新数据在前）
    const sortedWithdrawals = [...withdrawals].sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    setCurrentWithdrawals(sortedWithdrawals);
    setIsDetailsDialogOpen(true);
  };
  

  // 打开统一管理弹窗
  const handleOpenVendorManagement = async (vendorName: string, tab: string = 'details') => {
    setCurrentVendor(vendorName);
    await forceRefreshSettlementCache();
    const withdrawals = getWithdrawalsForVendor(vendorName);
    const sortedWithdrawals = [...withdrawals].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    setCurrentWithdrawals(sortedWithdrawals);
    setCurrentArchivedWithdrawals(getArchivedWithdrawalsForVendor(vendorName));
    setVendorManagementDefaultTab(tab);
    setIsVendorManagementOpen(true);
  };

  const handleOpenProviderManagement = async (providerName: string, tab: string = 'details') => {
    setCurrentProvider(providerName);
    await forceRefreshSettlementCache();
    const recharges = getRechargesForProvider(providerName);
    const sortedRecharges = [...recharges].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    setCurrentRecharges(sortedRecharges);
    setCurrentArchivedRecharges(getArchivedRechargesForProvider(providerName));
    setProviderManagementDefaultTab(tab);
    setIsProviderManagementOpen(true);
  };

  // 获取即将撤回的描述信息
  const [undoDescription, setUndoDescription] = useState('');
  const [providerUndoDescription, setProviderUndoDescription] = useState('');

  // 撤回密码验证状态
  const [undoPassword, setUndoPassword] = useState('');
  const [undoAuthError, setUndoAuthError] = useState('');
  const [isUndoVerifying, setIsUndoVerifying] = useState(false);

  const resetUndoAuthState = () => {
    setUndoPassword('');
    setUndoAuthError('');
    setIsUndoVerifying(false);
  };

  const handleOpenUndo = (vendorName: string) => {
    const settlement = cardSettlements.find(s => s.vendorName === vendorName);
    if (!settlement || settlement.history.length === 0) {
      showSubmissionError("没有可撤回的初始余额操作");
      return;
    }
    const lastAction = settlement.history[settlement.history.length - 1];
    if (lastAction.action !== 'initial_balance') {
      showSubmissionError("没有可撤回的初始余额操作");
      return;
    }
    setUndoDescription(lastAction.description || lastAction.action);
    setCurrentVendor(vendorName);
    resetUndoAuthState();
    setIsUndoConfirmOpen(true);
  };

  const handleConfirmUndo = async () => {
    if (blockReadonly("撤回操作")) return;
    if (!employee?.username) {
      setUndoAuthError('无法获取当前账号信息');
      return;
    }
    if (!undoPassword) {
      setUndoAuthError('请输入密码');
      return;
    }
    setIsUndoVerifying(true);
    setUndoAuthError('');
    try {
      // 验证密码
      const { data: verifyData, error: verifyError } = await supabase.rpc(
        'verify_employee_login_detailed',
        { p_username: employee.username, p_password: undoPassword }
      );
      if (verifyError) {
        setUndoAuthError('验证失败，请重试');
        setIsUndoVerifying(false);
        return;
      }
      const v = Array.isArray(verifyData) && verifyData.length > 0 ? verifyData[0] : null;
      if (!v || v.error_code) {
        const msg = v?.error_code === 'WRONG_PASSWORD' ? '密码错误' : v?.error_code === 'USER_NOT_FOUND' ? '账号不存在' : '验证失败';
        setUndoAuthError(msg);
        setIsUndoVerifying(false);
        return;
      }
    } catch {
      setUndoAuthError('验证异常，请重试');
      setIsUndoVerifying(false);
      return;
    }
    setIsUndoVerifying(false);

    // 密码验证通过，执行撤回
    setIsSaving(true);
    try {
      const currentData = vendorSettlementData.find(v => v.vendorName === currentVendor);
      const currentBalance = currentData?.realTimeBalance ?? 0;
      
      markLocalSave();
      const result = await undoLastAction(currentVendor, currentBalance, employee?.id);
      if (result.success) {
        await loadData();
        const withdrawals = getWithdrawalsForVendor(currentVendor);
        const sortedWithdrawals = [...withdrawals].sort((a, b) => 
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        setCurrentWithdrawals(sortedWithdrawals);
        toast({ title: "已撤回上一步操作" });
      } else {
        showSubmissionError(result.error || "撤回失败");
      }
    } finally {
      setIsSaving(false);
      setIsUndoConfirmOpen(false);
      resetUndoAuthState();
    }
  };

  // 编辑提款记录
  const handleEditWithdrawal = (withdrawal: WithdrawalRecord) => {
    setEditingWithdrawal({ ...withdrawal });
  };

  const handleSaveEditWithdrawal = async () => {
    if (blockReadonly("编辑提款记录")) return;
    if (!editingWithdrawal) return;
    
    setIsSaving(true);
    try {
      // 获取当前实时余额用于记录变动明细
      const vendorData = vendorSettlementData.find(v => v.vendorName === currentVendor);
      const currentBalance = vendorData?.realTimeBalance || 0;
      
      markLocalSave();
      await updateWithdrawal(currentVendor, editingWithdrawal.id, {
        withdrawalAmountUsdt: editingWithdrawal.withdrawalAmountUsdt,
        usdtRate: editingWithdrawal.usdtRate,
        remark: editingWithdrawal.remark,
      }, currentBalance);
      // Skip forceRefreshSettlementCache — cache already updated by save
      await loadData();
      const withdrawals = getWithdrawalsForVendor(currentVendor);
      // 保持排序
      const sortedWithdrawals = [...withdrawals].sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      setCurrentWithdrawals(sortedWithdrawals);
      setEditingWithdrawal(null);
      toast({ title: "提款记录已更新" });
      // 通知变动明细对话框刷新
      notifyDataMutation({ table: 'ledger_transactions', operation: 'UPDATE', source: 'manual' }).catch(console.error);
    } finally {
      setIsSaving(false);
    }
  };

  // 删除提款记录
  const handleConfirmDeleteWithdrawal = async () => {
    if (blockReadonly("删除提款记录")) return;
    if (!deletingWithdrawalId) return;
    
    setIsSaving(true);
    try {
      // 获取当前实时余额用于记录变动明细
      const vendorData = vendorSettlementData.find(v => v.vendorName === currentVendor);
      const currentBalance = vendorData?.realTimeBalance || 0;
      
      markLocalSave();
      await deleteWithdrawal(currentVendor, deletingWithdrawalId, currentBalance);
      // Skip forceRefreshSettlementCache — cache already updated by save
      await loadData();
      const withdrawals = getWithdrawalsForVendor(currentVendor);
      // 保持排序
      const sortedWithdrawals = [...withdrawals].sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      setCurrentWithdrawals(sortedWithdrawals);
      setDeletingWithdrawalId(null);
      toast({ title: "提款记录已删除" });
    } finally {
      setIsSaving(false);
    }
  };

  // ==================== Payment Provider Handlers ====================
  const handleOpenProviderInitialBalance = (providerName: string) => {
    setCurrentProvider(providerName);
    const settlement = providerSettlements.find(s => s.providerName === providerName);
    setProviderInitialBalanceAmount(settlement?.initialBalance?.toString() || "0");
    setIsProviderInitialBalanceDialogOpen(true);
  };

  const handleSaveProviderInitialBalance = async () => {
    if (blockReadonly("设置代付初始余额")) return;
    const amount = parseFloat(providerInitialBalanceAmount);
    if (isNaN(amount)) {
      showSubmissionError("请输入有效数值");
      return;
    }
    
    setIsSaving(true);
    try {
      // 获取当前实时余额用于记录变动明细
      const providerData = providerSettlementData.find(p => p.providerName === currentProvider);
      const currentRealTimeBalance = providerData?.realTimeBalance || 0;
      
      markLocalSave();
      await setProviderInitialBalance(currentProvider, amount, currentRealTimeBalance);
      // Skip forceRefreshSettlementCache — cache already updated by save
      await loadData();
      setIsProviderInitialBalanceDialogOpen(false);
      toast({ title: "初始余额已设置" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenRecharge = (providerName: string) => {
    setCurrentProvider(providerName);
    setRechargeAmountUsdt("");
    setRechargeUsdtRate("");
    setRechargeRemark("");
    setIsRechargeDialogOpen(true);
  };

  const handleSaveRecharge = async () => {
    if (blockReadonly("录入充值")) return;
    const amountUsdt = parseFloat(rechargeAmountUsdt);
    const rate = parseFloat(rechargeUsdtRate);
    
    if (isNaN(amountUsdt) || isNaN(rate)) {
      showSubmissionError("请输入有效数值");
      return;
    }
    
    setIsSaving(true);
    try {
      // 获取当前录入人ID（不再存储姓名，姓名通过ID实时获取）
      const recorderId = employee?.id || '';
      
      // 获取当前实时余额用于记录变动明细
      const providerData = providerSettlementData.find(p => p.providerName === currentProvider);
      const currentBalance = providerData?.realTimeBalance || 0;
      
      markLocalSave();
      await addRecharge(currentProvider, amountUsdt, rate, rechargeRemark || undefined, currentBalance);
      // Skip forceRefreshSettlementCache — cache already updated by save
      await loadData();
      setIsRechargeDialogOpen(false);
      toast({ title: "充值已录入" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleViewProviderDetails = async (providerName: string) => {
    setCurrentProvider(providerName);
    // Force refresh cache to ensure recharge records are up-to-date
    await forceRefreshSettlementCache();
    const recharges = getRechargesForProvider(providerName);
    // 按创建时间倒序排列（新数据在前）
    const sortedRecharges = [...recharges].sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    setCurrentRecharges(sortedRecharges);
    setIsProviderDetailsDialogOpen(true);
  };

  const handleOpenProviderUndo = (providerName: string) => {
    const settlement = providerSettlements.find(s => s.providerName === providerName);
    if (!settlement || settlement.history.length === 0) {
      showSubmissionError("没有可撤回的初始余额操作");
      return;
    }
    const lastAction = settlement.history[settlement.history.length - 1];
    if (lastAction.action !== 'initial_balance') {
      showSubmissionError("没有可撤回的初始余额操作");
      return;
    }
    setProviderUndoDescription(lastAction.description || lastAction.action);
    setCurrentProvider(providerName);
    resetUndoAuthState();
    setIsProviderUndoConfirmOpen(true);
  };

  const handleConfirmProviderUndo = async () => {
    if (blockReadonly("撤回操作")) return;
    if (!employee?.username) {
      setUndoAuthError('无法获取当前账号信息');
      return;
    }
    if (!undoPassword) {
      setUndoAuthError('请输入密码');
      return;
    }
    setIsUndoVerifying(true);
    setUndoAuthError('');
    try {
      const { data: verifyData, error: verifyError } = await supabase.rpc(
        'verify_employee_login_detailed',
        { p_username: employee.username, p_password: undoPassword }
      );
      if (verifyError) {
        setUndoAuthError('验证失败，请重试');
        setIsUndoVerifying(false);
        return;
      }
      const v = Array.isArray(verifyData) && verifyData.length > 0 ? verifyData[0] : null;
      if (!v || v.error_code) {
        const msg = v?.error_code === 'WRONG_PASSWORD' ? '密码错误' : v?.error_code === 'USER_NOT_FOUND' ? '账号不存在' : '验证失败';
        setUndoAuthError(msg);
        setIsUndoVerifying(false);
        return;
      }
    } catch {
      setUndoAuthError('验证异常，请重试');
      setIsUndoVerifying(false);
      return;
    }
    setIsUndoVerifying(false);

    setIsSaving(true);
    try {
      const currentData = providerSettlementData.find(p => p.providerName === currentProvider);
      const currentBalance = currentData?.realTimeBalance ?? 0;
      
      markLocalSave();
      const result = await undoProviderLastAction(currentProvider, currentBalance, employee?.id);
      if (result.success) {
        await loadData();
        const recharges = getRechargesForProvider(currentProvider);
        const sortedRecharges = [...recharges].sort((a, b) => 
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        setCurrentRecharges(sortedRecharges);
        toast({ title: "已撤回上一步操作" });
      } else {
        showSubmissionError(result.error || "撤回失败");
      }
    } finally {
      setIsSaving(false);
      setIsProviderUndoConfirmOpen(false);
      resetUndoAuthState();
    }
  };

  // 编辑充值记录
  const handleEditRecharge = (recharge: RechargeRecord) => {
    setEditingRecharge({ ...recharge });
  };

  const handleSaveEditRecharge = async () => {
    if (blockReadonly("编辑充值记录")) return;
    if (!editingRecharge) return;
    
    setIsSaving(true);
    try {
      // 获取当前实时余额用于记录变动明细
      const providerData = providerSettlementData.find(p => p.providerName === currentProvider);
      const currentBalance = providerData?.realTimeBalance || 0;
      
      markLocalSave();
      await updateRecharge(currentProvider, editingRecharge.id, {
        rechargeAmountUsdt: editingRecharge.rechargeAmountUsdt,
        usdtRate: editingRecharge.usdtRate,
        remark: editingRecharge.remark,
      }, currentBalance);
      // Skip forceRefreshSettlementCache — cache already updated by save
      await loadData();
      const recharges = getRechargesForProvider(currentProvider);
      // 保持排序
      const sortedRecharges = [...recharges].sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      setCurrentRecharges(sortedRecharges);
      setEditingRecharge(null);
      toast({ title: "充值记录已更新" });
      // 通知变动明细对话框刷新
      notifyDataMutation({ table: 'ledger_transactions', operation: 'UPDATE', source: 'manual' }).catch(console.error);
    } finally {
      setIsSaving(false);
    }
  };

  // 删除充值记录
  const handleConfirmDeleteRecharge = async () => {
    if (blockReadonly("删除充值记录")) return;
    if (!deletingRechargeId) return;
    
    setIsSaving(true);
    try {
      // 获取当前实时余额用于记录变动明细
      const providerData = providerSettlementData.find(p => p.providerName === currentProvider);
      const currentBalance = providerData?.realTimeBalance || 0;
      
      markLocalSave();
      await deleteRecharge(currentProvider, deletingRechargeId, currentBalance);
      // Skip forceRefreshSettlementCache — cache already updated by save
      await loadData();
      const recharges = getRechargesForProvider(currentProvider);
      // 保持排序
      const sortedRecharges = [...recharges].sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      setCurrentRecharges(sortedRecharges);
      setDeletingRechargeId(null);
      toast({ title: "充值记录已删除" });
    } finally {
      setIsSaving(false);
    }
  };

  const settlementTotal = safeNumber(withdrawalAmountUsdt) * safeNumber(withdrawalUsdtRate);
  const rechargeSettlementTotal = safeNumber(rechargeAmountUsdt) * safeNumber(rechargeUsdtRate);

  const currentVendorData = vendorSettlementData.find(v => v.vendorName === currentVendor);
  const currentProviderData = providerSettlementData.find(p => p.providerName === currentProvider);

  // 加载中显示
  if (isLoading) {
    return <TablePageSkeleton columns={6} />;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-6">
          <Tabs 
            defaultValue="card-merchant" 
            className="w-full"
            onValueChange={(value) => setActiveTab(value as 'card-merchant' | 'payment-agent' | 'shift-handover')}
          >
            {useCompactLayout ? (
              <div className="flex flex-col gap-3 mb-4">
                <TabsList className="w-full overflow-x-auto flex-nowrap">
                  <TabsTrigger value="card-merchant" className="text-xs flex-1 whitespace-nowrap">{t("卡商结算", "Card Vendor")}</TabsTrigger>
                  <TabsTrigger value="payment-agent" className="text-xs flex-1 whitespace-nowrap">{t("代付结算", "Payment Provider")}</TabsTrigger>
                  <TabsTrigger value="shift-handover" className="text-xs flex-1 whitespace-nowrap">{t("交班数据", "Shift Handover")}</TabsTrigger>
                </TabsList>
                <div className="relative w-full">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder={searchPlaceholder}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" className="gap-1.5 flex-1" onClick={handleUnifiedExport}>
                    <Download className="h-4 w-4" />
                    {t("导出", "Export")}
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1.5 flex-1" onClick={handleUnifiedRefresh}>
                    <RefreshCw className="h-4 w-4" />
                    {t("刷新", "Refresh")}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between mb-6">
                <TabsList>
                  <TabsTrigger value="card-merchant">{t("卡商结算", "Card Vendor Settlement")}</TabsTrigger>
                  <TabsTrigger value="payment-agent">{t("代付结算", "Payment Provider Settlement")}</TabsTrigger>
                  <TabsTrigger value="shift-handover">{t("交班数据", "Shift Handover Data")}</TabsTrigger>
                </TabsList>
                <div className="flex items-center gap-3">
                  <div className="relative w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder={searchPlaceholder}
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  <Button variant="outline" size="sm" className="gap-2" onClick={handleUnifiedExport}>
                    <Download className="h-4 w-4" />
                    {t("导出", "Export")}
                  </Button>
                  <Button variant="outline" size="sm" className="gap-2" onClick={handleUnifiedRefresh}>
                    <RefreshCw className="h-4 w-4" />
                    {t("刷新", "Refresh")}
                  </Button>
                </div>
              </div>
            )}

            {/* 卡商结算 Tab */}
            <TabsContent value="card-merchant" className="space-y-4">
              <CardMerchantSettlementTab
                paginatedData={paginatedVendorData}
                filteredData={filteredVendorData}
                useCompactLayout={useCompactLayout}
                resolveVendorName={resolveVendorName}
                canEditBalance={canEditBalance}
                sortConfig={vendorSortConfig}
                onSort={requestVendorSort}
                onOpenManagement={handleOpenVendorManagement}
                onOpenUndo={handleOpenUndo}
                page={vendorPage}
                totalPages={vendorTotalPages}
                pageSize={vendorPageSize}
                onPageChange={setVendorPage}
                onPageSizeChange={handleVendorPageSizeChange}
              />
            </TabsContent>

            {/* 代付结算 Tab */}
            <TabsContent value="payment-agent" className="space-y-4">
              <PaymentProviderSettlementTab
                paginatedData={paginatedProviderData}
                filteredData={filteredProviderData}
                useCompactLayout={useCompactLayout}
                resolveProviderName={resolveProviderName}
                canEditBalance={canEditBalance}
                sortConfig={providerSortConfig}
                onSort={requestProviderSort}
                onOpenManagement={handleOpenProviderManagement}
                onOpenUndo={handleOpenProviderUndo}
                page={providerPage}
                totalPages={providerTotalPages}
                pageSize={providerPageSize}
                onPageChange={setProviderPage}
                onPageSizeChange={handleProviderPageSizeChange}
              />
            </TabsContent>

            {/* 交班数据 Tab */}
            <TabsContent value="shift-handover" className="mt-4">
              <ShiftHandoverHistoryTab 
                searchTerm={searchTerm}
                onExportReady={(fn) => { shiftHandoverExportRef.current = fn; }}
                onRefreshReady={(fn) => { shiftHandoverRefreshRef.current = fn; }}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* ==================== Card Merchant Dialogs ==================== */}
      
      {/* Initial Balance Dialog */}
      <Dialog open={isInitialBalanceDialogOpen} onOpenChange={setIsInitialBalanceDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>填入初始余额</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>卡商名称</Label>
              <Input value={currentVendor} disabled />
            </div>
            <div className="space-y-2">
              <Label>初始余额</Label>
              <div className="flex gap-2">
                <Input 
                  type="number" 
                  placeholder="输入金额" 
                  value={initialBalanceAmount}
                  onChange={(e) => setInitialBalanceAmount(e.target.value)}
                  className="flex-1"
                />
                {currentVendorData && (
                  <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={() => setInitialBalanceAmount(currentVendorData.realTimeBalance.toFixed(2))}>
                    {t("一键填入", "Fill")}
                  </Button>
                )}
              </div>
            </div>
            {currentVendorData && (
              <div className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-lg">
                <p>当前实时余额: ¥{currentVendorData.realTimeBalance.toFixed(2)}</p>
                <p className="text-xs mt-1">提示：设置初始余额后，将重置最后重置时间并清空提款记录</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsInitialBalanceDialogOpen(false)}>取消</Button>
            <Button onClick={handleSaveInitialBalance} disabled={isSaving}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              确定
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Withdrawal Dialog */}
      <Dialog open={isWithdrawalDialogOpen} onOpenChange={setIsWithdrawalDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>录入提款</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>卡商名称</Label>
              <Input value={currentVendor} disabled />
            </div>
            <div className="space-y-2">
              <Label>提款金额USDT</Label>
              <Input 
                type="number" 
                placeholder="输入USDT金额（支持负数）" 
                value={withdrawalAmountUsdt}
                onChange={(e) => setWithdrawalAmountUsdt(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>USDT汇率</Label>
              <Input 
                type="number" 
                placeholder="输入汇率" 
                value={withdrawalUsdtRate}
                onChange={(e) => setWithdrawalUsdtRate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>结算总额</Label>
              <Input 
                type="number" 
                value={isNaN(settlementTotal) ? 0 : settlementTotal.toFixed(2)} 
                disabled 
              />
              <p className="text-xs text-muted-foreground">= 提款金额USDT × USDT汇率</p>
            </div>
            <div className="space-y-2">
              <Label>备注</Label>
              <Textarea 
                placeholder="输入备注（可选）" 
                value={withdrawalRemark}
                onChange={(e) => setWithdrawalRemark(e.target.value)}
                className="min-h-[60px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsWithdrawalDialogOpen(false)}>取消</Button>
            <Button onClick={handleSaveWithdrawal} disabled={isSaving}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              确定
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Card Merchant Details Dialog */}
      <Dialog open={isDetailsDialogOpen} onOpenChange={setIsDetailsDialogOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>提款明细 - {currentVendor}</DialogTitle>
            <DialogDescription>查看和管理该卡商的提款记录</DialogDescription>
          </DialogHeader>
          <div className="max-h-96 overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 border-b sticky top-0">
                  <th className="text-left p-3 font-medium">序号</th>
                  <th className="text-left p-3 font-medium">录入时间</th>
                  <th className="text-left p-3 font-medium">卡商名称</th>
                  <th className="text-left p-3 font-medium">提款金额USDT</th>
                  <th className="text-left p-3 font-medium">USDT汇率</th>
                  <th className="text-left p-3 font-medium">结算总额</th>
                  <th className="text-left p-3 font-medium">备注</th>
                  <th className="text-left p-3 font-medium">录入人</th>
                  <th className="text-center p-3 font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {currentWithdrawals.map((w, index) => (
                  <tr key={w.id} className="border-b">
                    <td className="p-3">{index + 1}</td>
                    <td className="p-3">{w.createdAt}</td>
                    <td className="p-3">{w.vendorName}</td>
                    <td className="p-3">{w.withdrawalAmountUsdt}</td>
                    <td className="p-3">{w.usdtRate}</td>
                    <td className="p-3">¥{w.settlementTotal.toFixed(2)}</td>
                    <td className="p-3 max-w-[150px] truncate" title={w.remark || ''}>{w.remark || '-'}</td>
                    <td className="p-3">{w.recorderId ? getEmployeeNameById(w.recorderId) : '-'}</td>
                    <td className="p-3 text-center">
                      {canEditBalance ? (
                        <div className="flex items-center justify-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEditWithdrawal(w)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => setDeletingWithdrawalId(w.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-xs">-</span>
                      )}
                    </td>
                  </tr>
                ))}
                {currentWithdrawals.length === 0 && (
                  <tr>
                    <td colSpan={9} className="p-6 text-center text-muted-foreground">
                      暂无提款记录
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <DialogFooter>
            <Button onClick={() => setIsDetailsDialogOpen(false)}>关闭</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Withdrawal Dialog */}
      <Dialog open={!!editingWithdrawal} onOpenChange={(open) => !open && setEditingWithdrawal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>编辑提款记录</DialogTitle>
            <DialogDescription>修改提款金额和汇率</DialogDescription>
          </DialogHeader>
          {editingWithdrawal && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>提款金额USDT</Label>
                <Input
                  type="number"
                  value={editingWithdrawal.withdrawalAmountUsdt}
                  onChange={(e) => setEditingWithdrawal({
                    ...editingWithdrawal,
                    withdrawalAmountUsdt: parseFloat(e.target.value) || 0
                  })}
                />
              </div>
              <div className="space-y-2">
                <Label>USDT汇率</Label>
                <Input
                  type="number"
                  value={editingWithdrawal.usdtRate}
                  onChange={(e) => setEditingWithdrawal({
                    ...editingWithdrawal,
                    usdtRate: parseFloat(e.target.value) || 0
                  })}
                />
              </div>
              <div className="space-y-2">
                <Label>结算总额</Label>
                <Input
                  type="number"
                  value={(editingWithdrawal.withdrawalAmountUsdt * editingWithdrawal.usdtRate).toFixed(2)}
                  disabled
                />
              </div>
              <div className="space-y-2">
                <Label>备注</Label>
                <Textarea
                  placeholder="输入备注（可选）"
                  value={editingWithdrawal.remark || ''}
                  onChange={(e) => setEditingWithdrawal({
                    ...editingWithdrawal,
                    remark: e.target.value
                  })}
                  className="min-h-[60px]"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingWithdrawal(null)}>取消</Button>
            <Button onClick={handleSaveEditWithdrawal} disabled={isSaving}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Withdrawal Confirmation */}
      <AlertDialog open={!!deletingWithdrawalId} onOpenChange={(open) => !open && setDeletingWithdrawalId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除这条提款记录吗？此操作不可恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDeleteWithdrawal} disabled={isSaving}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Card Merchant Undo Confirmation Dialog */}
      <AlertDialog open={isUndoConfirmOpen} onOpenChange={(open) => { setIsUndoConfirmOpen(open); if (!open) resetUndoAuthState(); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认撤回</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                <p>确定要撤回以下操作吗？此操作将恢复到修改前的状态并同步更新账本明细。</p>
                <p className="mt-1"><strong className="text-foreground">即将撤回: {undoDescription}</strong></p>
                <div className="mt-4 space-y-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">账号</Label>
                    <Input value={employee?.username || ''} disabled className="bg-muted/30" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">密码</Label>
                    <Input
                      type="password"
                      placeholder="请输入密码以确认身份"
                      value={undoPassword}
                      onChange={(e) => { setUndoPassword(e.target.value); setUndoAuthError(''); }}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleConfirmUndo(); }}
                    />
                  </div>
                  {undoAuthError && (
                    <p className="text-sm text-destructive">{undoAuthError}</p>
                  )}
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <Button onClick={handleConfirmUndo} disabled={isUndoVerifying || isSaving || !undoPassword}>
              {(isUndoVerifying || isSaving) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              确定
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ==================== Payment Provider Dialogs ==================== */}
      
      {/* Provider Initial Balance Dialog */}
      <Dialog open={isProviderInitialBalanceDialogOpen} onOpenChange={setIsProviderInitialBalanceDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>填入初始余额</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>代付商家</Label>
              <Input value={currentProvider} disabled />
            </div>
            <div className="space-y-2">
              <Label>初始余额</Label>
              <div className="flex gap-2">
                <Input 
                  type="number" 
                  placeholder="输入金额" 
                  value={providerInitialBalanceAmount}
                  onChange={(e) => setProviderInitialBalanceAmount(e.target.value)}
                  className="flex-1"
                />
                {currentProviderData && (
                  <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={() => setProviderInitialBalanceAmount(currentProviderData.realTimeBalance.toFixed(2))}>
                    {t("一键填入", "Fill")}
                  </Button>
                )}
              </div>
            </div>
            {currentProviderData && (
              <div className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-lg">
                <p>当前实时余额: ¥{currentProviderData.realTimeBalance.toFixed(2)}</p>
                <p className="text-xs mt-1">提示：设置初始余额后，将重置最后重置时间并清空充值记录</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsProviderInitialBalanceDialogOpen(false)}>取消</Button>
            <Button onClick={handleSaveProviderInitialBalance} disabled={isSaving}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              确定
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Recharge Dialog */}
      <Dialog open={isRechargeDialogOpen} onOpenChange={setIsRechargeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>录入充值</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>代付商家</Label>
              <Input value={currentProvider} disabled />
            </div>
            <div className="space-y-2">
              <Label>充值金额USDT</Label>
              <Input 
                type="number" 
                placeholder="输入USDT金额（支持负数）" 
                value={rechargeAmountUsdt}
                onChange={(e) => setRechargeAmountUsdt(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>USDT汇率</Label>
              <Input 
                type="number" 
                placeholder="输入汇率" 
                value={rechargeUsdtRate}
                onChange={(e) => setRechargeUsdtRate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>结算总额</Label>
              <Input 
                type="number" 
                value={isNaN(rechargeSettlementTotal) ? 0 : rechargeSettlementTotal.toFixed(2)} 
                disabled 
              />
              <p className="text-xs text-muted-foreground">= 充值金额USDT × USDT汇率</p>
            </div>
            <div className="space-y-2">
              <Label>备注</Label>
              <Textarea 
                placeholder="输入备注（可选）" 
                value={rechargeRemark}
                onChange={(e) => setRechargeRemark(e.target.value)}
                className="min-h-[60px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRechargeDialogOpen(false)}>取消</Button>
            <Button onClick={handleSaveRecharge} disabled={isSaving}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              确定
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Provider Details Dialog */}
      <Dialog open={isProviderDetailsDialogOpen} onOpenChange={setIsProviderDetailsDialogOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>充值明细 - {currentProvider}</DialogTitle>
            <DialogDescription>查看和管理该代付商家的充值记录</DialogDescription>
          </DialogHeader>
          <div className="max-h-96 overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 border-b sticky top-0">
                  <th className="text-left p-3 font-medium">序号</th>
                  <th className="text-left p-3 font-medium">录入时间</th>
                  <th className="text-left p-3 font-medium">代付商家</th>
                  <th className="text-left p-3 font-medium">充值金额USDT</th>
                  <th className="text-left p-3 font-medium">USDT汇率</th>
                  <th className="text-left p-3 font-medium">结算总额</th>
                  <th className="text-left p-3 font-medium">备注</th>
                  <th className="text-left p-3 font-medium">录入人</th>
                  <th className="text-center p-3 font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {currentRecharges?.map((r, index) => (
                  <tr key={r.id} className="border-b">
                    <td className="p-3">{index + 1}</td>
                    <td className="p-3">{r.createdAt}</td>
                    <td className="p-3">{r.providerName}</td>
                    <td className="p-3">{r.rechargeAmountUsdt}</td>
                    <td className="p-3">{r.usdtRate}</td>
                    <td className="p-3">¥{r.settlementTotal.toFixed(2)}</td>
                    <td className="p-3 max-w-[150px] truncate" title={r.remark || ''}>{r.remark || '-'}</td>
                    <td className="p-3">{r.recorderId ? getEmployeeNameById(r.recorderId) : '-'}</td>
                    <td className="p-3 text-center">
                      {canEditBalance ? (
                        <div className="flex items-center justify-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEditRecharge(r)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => setDeletingRechargeId(r.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-xs">-</span>
                      )}
                    </td>
                  </tr>
                ))}
                {(!currentRecharges || currentRecharges.length === 0) && (
                  <tr>
                    <td colSpan={9} className="p-6 text-center text-muted-foreground">
                      暂无充值记录
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <DialogFooter>
            <Button onClick={() => setIsProviderDetailsDialogOpen(false)}>关闭</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Recharge Dialog */}
      <Dialog open={!!editingRecharge} onOpenChange={(open) => !open && setEditingRecharge(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>编辑充值记录</DialogTitle>
            <DialogDescription>修改充值金额和汇率</DialogDescription>
          </DialogHeader>
          {editingRecharge && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>充值金额USDT</Label>
                <Input
                  type="number"
                  value={editingRecharge.rechargeAmountUsdt}
                  onChange={(e) => setEditingRecharge({
                    ...editingRecharge,
                    rechargeAmountUsdt: parseFloat(e.target.value) || 0
                  })}
                />
              </div>
              <div className="space-y-2">
                <Label>USDT汇率</Label>
                <Input
                  type="number"
                  value={editingRecharge.usdtRate}
                  onChange={(e) => setEditingRecharge({
                    ...editingRecharge,
                    usdtRate: parseFloat(e.target.value) || 0
                  })}
                />
              </div>
              <div className="space-y-2">
                <Label>结算总额</Label>
                <Input
                  type="number"
                  value={(editingRecharge.rechargeAmountUsdt * editingRecharge.usdtRate).toFixed(2)}
                  disabled
                />
              </div>
              <div className="space-y-2">
                <Label>备注</Label>
                <Textarea
                  placeholder="输入备注（可选）"
                  value={editingRecharge.remark || ''}
                  onChange={(e) => setEditingRecharge({
                    ...editingRecharge,
                    remark: e.target.value
                  })}
                  className="min-h-[60px]"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingRecharge(null)}>取消</Button>
            <Button onClick={handleSaveEditRecharge} disabled={isSaving}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Recharge Confirmation */}
      <AlertDialog open={!!deletingRechargeId} onOpenChange={(open) => !open && setDeletingRechargeId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除这条充值记录吗？此操作不可恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDeleteRecharge} disabled={isSaving}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Provider Undo Confirmation Dialog */}
      <AlertDialog open={isProviderUndoConfirmOpen} onOpenChange={(open) => { setIsProviderUndoConfirmOpen(open); if (!open) resetUndoAuthState(); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认撤回</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                <p>确定要撤回以下操作吗？此操作将恢复到修改前的状态并同步更新账本明细。</p>
                <p className="mt-1"><strong className="text-foreground">即将撤回: {providerUndoDescription}</strong></p>
                <div className="mt-4 space-y-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">账号</Label>
                    <Input value={employee?.username || ''} disabled className="bg-muted/30" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">密码</Label>
                    <Input
                      type="password"
                      placeholder="请输入密码以确认身份"
                      value={undoPassword}
                      onChange={(e) => { setUndoPassword(e.target.value); setUndoAuthError(''); }}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleConfirmProviderUndo(); }}
                    />
                  </div>
                  {undoAuthError && (
                    <p className="text-sm text-destructive">{undoAuthError}</p>
                  )}
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <Button onClick={handleConfirmProviderUndo} disabled={isUndoVerifying || isSaving || !undoPassword}>
              {(isUndoVerifying || isSaving) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              确定
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>


      {/* 卡商统一管理弹窗 */}
      <VendorManagementDialog
        open={isVendorManagementOpen}
        onOpenChange={setIsVendorManagementOpen}
        vendorName={currentVendor}
        withdrawals={currentWithdrawals}
        archivedWithdrawals={currentArchivedWithdrawals}
        realTimeBalance={currentVendorData?.realTimeBalance || 0}
        initialBalance={currentVendorData?.initialBalance || 0}
        canEditBalance={canEditBalance}
        isSaving={isSaving}
        defaultTab={vendorManagementDefaultTab}
        onSaveWithdrawal={async (amountUsdt, rate, remark) => {
          if (blockReadonly("录入提款")) return;
          setIsSaving(true);
          try {
            const recorderId = employee?.id || '';
            const vendorData = vendorSettlementData.find(v => v.vendorName === currentVendor);
            const currentBalance = vendorData?.realTimeBalance || 0;
            await addWithdrawal(currentVendor, amountUsdt, rate, remark || undefined, currentBalance);
            await forceRefreshSettlementCache();
            await loadData();
            const withdrawals = getWithdrawalsForVendor(currentVendor);
            setCurrentWithdrawals([...withdrawals].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
            toast({ title: t("提款已录入", "Withdrawal added") });
          } finally { setIsSaving(false); }
        }}
        onSaveInitialBalance={async (amount) => {
          if (blockReadonly("设置初始余额")) return;
          setIsSaving(true);
          try {
            const vendorData = vendorSettlementData.find(v => v.vendorName === currentVendor);
            await setInitialBalance(currentVendor, amount, vendorData?.realTimeBalance || 0);
            await forceRefreshSettlementCache();
            await loadData();
            toast({ title: t("初始余额已设置", "Initial balance set") });
          } finally { setIsSaving(false); }
        }}
        onEditWithdrawal={async (withdrawal, updates) => {
          if (blockReadonly("编辑提款记录")) return;
          setIsSaving(true);
          try {
            const vendorData = vendorSettlementData.find(v => v.vendorName === currentVendor);
            await updateWithdrawal(currentVendor, withdrawal.id, updates, vendorData?.realTimeBalance || 0);
            await forceRefreshSettlementCache();
            await loadData();
            const withdrawals = getWithdrawalsForVendor(currentVendor);
            setCurrentWithdrawals([...withdrawals].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
            toast({ title: t("提款记录已更新", "Withdrawal updated") });
            notifyDataMutation({ table: 'ledger_transactions', operation: 'UPDATE', source: 'manual' }).catch(console.error);
          } finally { setIsSaving(false); }
        }}
        onDeleteWithdrawal={async (withdrawalId) => {
          if (blockReadonly("删除提款记录")) return;
          setIsSaving(true);
          try {
            const vendorData = vendorSettlementData.find(v => v.vendorName === currentVendor);
            await deleteWithdrawal(currentVendor, withdrawalId, vendorData?.realTimeBalance || 0);
            await forceRefreshSettlementCache();
            await loadData();
            const withdrawals = getWithdrawalsForVendor(currentVendor);
            setCurrentWithdrawals([...withdrawals].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
            toast({ title: t("提款记录已删除", "Withdrawal deleted") });
            notifyDataMutation({ table: 'ledger_transactions', operation: 'UPDATE', source: 'manual' }).catch(console.error);
          } finally { setIsSaving(false); }
        }}
      />

      {/* 代付商家统一管理弹窗 */}
      <ProviderManagementDialog
        open={isProviderManagementOpen}
        onOpenChange={setIsProviderManagementOpen}
        providerName={currentProvider}
        recharges={currentRecharges || []}
        archivedRecharges={currentArchivedRecharges}
        realTimeBalance={currentProviderData?.realTimeBalance || 0}
        initialBalance={currentProviderData?.initialBalance || 0}
        canEditBalance={canEditBalance}
        isSaving={isSaving}
        defaultTab={providerManagementDefaultTab}
        onSaveRecharge={async (amountUsdt, rate, remark) => {
          if (blockReadonly("录入充值")) return;
          setIsSaving(true);
          try {
            const recorderId = employee?.id || '';
            const providerData = providerSettlementData.find(p => p.providerName === currentProvider);
            await addRecharge(currentProvider, amountUsdt, rate, remark || undefined, providerData?.realTimeBalance || 0);
            await forceRefreshSettlementCache();
            await loadData();
            const recharges = getRechargesForProvider(currentProvider);
            setCurrentRecharges([...recharges].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
            toast({ title: t("充值已录入", "Recharge added") });
          } finally { setIsSaving(false); }
        }}
        onSaveInitialBalance={async (amount) => {
          if (blockReadonly("设置代付初始余额")) return;
          setIsSaving(true);
          try {
            const providerData = providerSettlementData.find(p => p.providerName === currentProvider);
            await setProviderInitialBalance(currentProvider, amount, providerData?.realTimeBalance || 0);
            await forceRefreshSettlementCache();
            await loadData();
            toast({ title: t("初始余额已设置", "Initial balance set") });
          } finally { setIsSaving(false); }
        }}
        onEditRecharge={async (recharge, updates) => {
          if (blockReadonly("编辑充值记录")) return;
          setIsSaving(true);
          try {
            const providerData = providerSettlementData.find(p => p.providerName === currentProvider);
            await updateRecharge(currentProvider, recharge.id, updates, providerData?.realTimeBalance || 0);
            await forceRefreshSettlementCache();
            await loadData();
            const recharges = getRechargesForProvider(currentProvider);
            setCurrentRecharges([...recharges].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
            toast({ title: t("充值记录已更新", "Recharge updated") });
            notifyDataMutation({ table: 'ledger_transactions', operation: 'UPDATE', source: 'manual' }).catch(console.error);
          } finally { setIsSaving(false); }
        }}
        onDeleteRecharge={async (rechargeId) => {
          if (blockReadonly("删除充值记录")) return;
          setIsSaving(true);
          try {
            const providerData = providerSettlementData.find(p => p.providerName === currentProvider);
            await deleteRecharge(currentProvider, rechargeId, providerData?.realTimeBalance || 0);
            await forceRefreshSettlementCache();
            await loadData();
            const recharges = getRechargesForProvider(currentProvider);
            setCurrentRecharges([...recharges].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
            toast({ title: t("充值记录已删除", "Recharge deleted") });
            notifyDataMutation({ table: 'ledger_transactions', operation: 'UPDATE', source: 'manual' }).catch(console.error);
          } finally { setIsSaving(false); }
        }}
      />

    </div>
  );
}
