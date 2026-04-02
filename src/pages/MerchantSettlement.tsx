import { useState, useEffect, useMemo, useRef } from "react";
import { trackRender } from "@/lib/performanceUtils";
import { TablePageSkeleton } from "@/components/skeletons/TablePageSkeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
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
import { Search, RefreshCw, Loader2, Download, ChevronLeft, ChevronRight, Pencil, Trash2, History, MoreHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PageSizeSelect } from "@/components/ui/page-size-select";
import { exportToCSV, formatNumberForExport } from "@/lib/exportUtils";
import { ExportConfirmDialog } from "@/components/ExportConfirmDialog";
import { useExportConfirm } from "@/hooks/useExportConfirm";
import { notify } from "@/lib/notifyHub";
import { showSubmissionError } from "@/services/submissionErrorService";
import { useLanguage } from "@/contexts/LanguageContext";
import { notifyDataMutation } from "@/services/system/dataRefreshManager";
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
} from "@/services/finance/merchantConfigReadService";
import { listEmployeesApi } from "@/api/employees";
import { getActivityDataApi } from "@/services/staff/dataApi";
import { apiPost } from "@/api/client";
import { useMerchantNameResolver, getEmployeeNameById } from "@/hooks/useNameResolver";
import ShiftHandoverHistoryTab from "@/components/ShiftHandoverHistoryTab";
import { CardMerchantSettlementTab, PaymentProviderSettlementTab } from "@/components/merchant-settlement";
import {
  calculateAllVendorBalances,
  calculateAllProviderBalances,
  VendorBalanceResult,
  ProviderBalanceResult,
} from "@/services/finance/settlementCalculationService";
import { useSortableData } from "@/components/ui/sortable-table-head";
import {
  ensureUserPreferencesLoaded,
  getMerchantSettlementPageSizes,
  setMerchantSettlementPageSizes,
} from "@/services/userPreferencesService";
import { useIsMobile, useIsTablet } from "@/hooks/use-mobile";
import { subscribeToSharedData } from "@/services/finance/sharedDataService";

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
const _MS_CACHE_TTL = 60 * 1000; // 1 minute – keep data fresh on page revisit
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
  const blockReadonly = (actionCn: string, actionEn: string) => {
    if (!isPlatformAdminReadonlyView) return false;
    notify.error(t(`平台总管理查看租户时为只读，无法${actionCn}`, `Read-only mode when viewing tenant, cannot ${actionEn}`));
    return true;
  };
  
  // 商家名称解析器 - 实时获取最新商家名称
  const { resolveVendorName, resolveProviderName } = useMerchantNameResolver();
  
  // 统一搜索词和当前激活的 Tab
  const [activeTab, setActiveTab] = useState<'card-merchant' | 'payment-agent' | 'shift-handover'>('card-merchant');
  const exportConfirm = useExportConfirm();
  const [searchTerm, setSearchTerm] = useState("");
  const [cards, setCards] = useState<any[]>(() => _msCache?.cards || []);
  const [vendors, setVendors] = useState<any[]>(() => _msCache?.vendors || []);
  const [providers, setProviders] = useState<any[]>(() => _msCache?.providers || []);
  const [cardSettlements, setCardSettlements] = useState<CardMerchantSettlement[]>(() => _msCache?.cardSettlements || []);
  const [providerSettlements, setProviderSettlements] = useState<PaymentProviderSettlement[]>(() => _msCache?.providerSettlements || []);
  /** 供 loadData 在结算拉取失败时保留上一份明细，避免整表被 [] 覆盖导致「明细消失」 */
  const cardSettlementsRef = useRef<CardMerchantSettlement[]>(_msCache?.cardSettlements || []);
  const providerSettlementsRef = useRef<PaymentProviderSettlement[]>(_msCache?.providerSettlements || []);

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
  const [selectedWithdrawalIds, setSelectedWithdrawalIds] = useState<Set<string>>(() => new Set());
  const [pendingBatchWithdrawalDelete, setPendingBatchWithdrawalDelete] = useState<string[] | null>(null);
  const [deletingRechargeId, setDeletingRechargeId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const withdrawalSelectionState = useMemo(() => {
    const ids = currentWithdrawals.map((w) => w.id);
    const selectedOnPage = ids.filter((id) => selectedWithdrawalIds.has(id)).length;
    return {
      ids,
      allSelected: canEditBalance && ids.length > 0 && selectedOnPage === ids.length,
      someSelected: canEditBalance && selectedOnPage > 0 && selectedOnPage < ids.length,
    };
  }, [currentWithdrawals, selectedWithdrawalIds, canEditBalance]);
  
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
  const [initError, setInitError] = useState<string | null>(null);
  
  
  // 统一管理弹窗状态
  const [isVendorManagementOpen, setIsVendorManagementOpen] = useState(false);
  const [vendorManagementDefaultTab, setVendorManagementDefaultTab] = useState('details');
  const [isProviderManagementOpen, setIsProviderManagementOpen] = useState(false);
  const [providerManagementDefaultTab, setProviderManagementDefaultTab] = useState('details');
  
  useEffect(() => {
    cardSettlementsRef.current = cardSettlements;
  }, [cardSettlements]);
  useEffect(() => {
    providerSettlementsRef.current = providerSettlements;
  }, [providerSettlements]);

  // 设置当前操作人信息（用于余额变动记录）
  useEffect(() => {
    if (employee) {
      setCurrentOperator(employee.id, employee.real_name);
    }
  }, [employee]);

  // 不在卸载时清空 _msCache：否则 SPA 每次切回商家结算都会全量重拉，与全局「切页复用缓存」策略一致。
  // 新鲜度由 _MS_CACHE_TTL、刷新按钮、租户切换、userDataSynced / Realtime / data-refresh 保证。

  const initDoneRef = useRef(false);
  useEffect(() => {
    if (_msCacheValid() || initDoneRef.current) return;
    if (!employee) return; // Wait for auth to be ready before loading data
    initDoneRef.current = true;
    const initData = async () => {
      setIsLoading(true);
      setInitError(null);
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
        setInitError(error instanceof Error ? error.message : t('初始化失败', 'Initialization failed'));
      } finally {
        setIsLoading(false);
      }
    };
    initData();
  }, [employee]);

  // 租户切换时清除缓存并重新加载（跳过首次挂载，避免与 initData 重复）
  const prevTenantRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (prevTenantRef.current === undefined) {
      prevTenantRef.current = effectiveTenantId;
      return;
    }
    if (prevTenantRef.current !== effectiveTenantId) {
      prevTenantRef.current = effectiveTenantId;
      _msCache = null;
      loadData().then(() => loadEmployees());
    }
  }, [effectiveTenantId]);

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
    Promise.resolve().then(() => {
      unsubscribe = subscribeToSharedData((key) => {
        if (key === 'cardMerchantSettlements' || key === 'paymentProviderSettlements') {
          // Skip reload if a local save is in progress to prevent race condition overwrite
          if (localSavePendingRef.current) {
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

  // orders / ledger_transactions Realtime is already handled by dataRefreshManager
  // — listen for its refresh events instead of duplicating Realtime channels
  useEffect(() => {
    const handleOrdersRefresh = () => {
      if (localSavePendingRef.current) return;
      loadDataRef.current();
    };
    window.addEventListener('data-refresh:orders', handleOrdersRefresh);
    window.addEventListener('data-refresh:ledger_transactions', handleOrdersRefresh);
    return () => {
      window.removeEventListener('data-refresh:orders', handleOrdersRefresh);
      window.removeEventListener('data-refresh:ledger_transactions', handleOrdersRefresh);
    };
  }, []);

  const loadEmployees = async () => {
    try {
      const list = await listEmployeesApi(effectiveTenantId ? { tenant_id: effectiveTenantId } : undefined);
      const data = (list || []).map((e) => ({ id: e.id, real_name: e.real_name }));
      setEmployees(data);
      if (_msCache) _msCache.employees = data;
    } catch (error) {
      console.warn('[MerchantSettlement] Failed to load employees:', error);
    }
  };

  const loadData = async () => {
    // Use allSettled for orders to tolerate partial failures
    const orderResults = (effectiveTenantId && !useMyTenantRpc)
      ? await Promise.allSettled([getTenantOrdersFull(effectiveTenantId), getTenantUsdtOrdersFull(effectiveTenantId)])
      : await Promise.allSettled([getMyTenantOrdersFull(), getMyTenantUsdtOrdersFull()]);
    const normalOrders = orderResults[0].status === 'fulfilled' ? orderResults[0].value : [];
    const usdtOrders = orderResults[1].status === 'fulfilled' ? orderResults[1].value : [];
    const allOrders = [...(normalOrders || []), ...(usdtOrders || [])].sort(
      (a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    const results = await Promise.allSettled([
      fetchMerchantCards(),
      fetchMerchantVendors(),
      fetchMerchantPaymentProviders(),
      getActivityDataApi(effectiveTenantId ?? undefined),
      getCardMerchantSettlementsAsync(),
      getPaymentProviderSettlementsAsync(),
    ]);
    const cardsRes = results[0].status === 'fulfilled' ? results[0].value : [];
    const vendorsRes = results[1].status === 'fulfilled' ? results[1].value : [];
    const providersRes = results[2].status === 'fulfilled' ? results[2].value : [];
    const activityDataRes = results[3].status === 'fulfilled' ? results[3].value : { gifts: [] };
    const cardSettlementsData =
      results[4].status === 'fulfilled' ? results[4].value : cardSettlementsRef.current;
    const providerSettlementsData =
      results[5].status === 'fulfilled' ? results[5].value : providerSettlementsRef.current;

    // Log any individual failures for debugging
    results.forEach((r, i) => {
      if (r.status === 'rejected') console.warn(`[MerchantSettlement] loadData call ${i} failed:`, r.reason);
    });

    const cardsData = (cardsRes || [])
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
    const vendorsData = (vendorsRes || [])
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
    const providersData = (providersRes || [])
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
    setActivityGifts(activityDataRes?.gifts || []);
    const nextCardSettlements = [...(cardSettlementsData || [])];
    const nextProviderSettlements = [...(providerSettlementsData || [])];
    setCardSettlements(nextCardSettlements);
    setProviderSettlements(nextProviderSettlements);
    cardSettlementsRef.current = nextCardSettlements;
    providerSettlementsRef.current = nextProviderSettlements;
    // Update module-level cache
    _msCache = {
      cards: cardsData, vendors: vendorsData, providers: providersData,
      dbOrders: allOrders, activityGifts: activityDataRes?.gifts || [],
      cardSettlements: nextCardSettlements, providerSettlements: nextProviderSettlements,
      employees: _msCache?.employees || [], loadedAt: Date.now(),
    };
  };

  // Keep loadDataRef always pointing to the latest loadData
  useEffect(() => {
    loadDataRef.current = loadData;
  }, [loadData]);

  useEffect(() => {
    setSelectedWithdrawalIds(new Set());
  }, [currentVendor]);

  useEffect(() => {
    if (!isDetailsDialogOpen) setSelectedWithdrawalIds(new Set());
  }, [isDetailsDialogOpen]);

  // 刷新按钮处理函数 - 强制重新加载数据
  const handleRefresh = async () => {
    await forceRefreshSettlementCache(); // 先强制刷新缓存
    await loadData();
    notify.success(t("数据已刷新", "Data refreshed"));
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
    .filter(v => String(v.vendorName ?? '').toLowerCase().includes(searchTerm.toLowerCase())),
    [vendorSettlementData, searchTerm]);

  const baseFilteredProviderData = useMemo(() => providerSettlementData
    .filter(p => String(p.providerName ?? '').toLowerCase().includes(searchTerm.toLowerCase())),
    [providerSettlementData, searchTerm]);

  // 默认按实时余额从高到低；点击表头可切换排序或恢复原始顺序
  const { sortedData: sortedVendorData, sortConfig: vendorSortConfig, requestSort: requestVendorSort } =
    useSortableData(baseFilteredVendorData, { key: "realTimeBalance", direction: "desc" });

  const { sortedData: sortedProviderData, sortConfig: providerSortConfig, requestSort: requestProviderSort } =
    useSortableData(baseFilteredProviderData, { key: "realTimeBalance", direction: "desc" });
  
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
  
  // 统一导出处理函数（先确认再执行）
  const handleUnifiedExport = () => {
    exportConfirm.requestExport(() => {
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
    });
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
      notify.error(t("没有数据可导出", "No data to export"));
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
    notify.success(t("导出成功", "Export successful"));
  };
  
  // Export payment provider settlement data
  const handleExportProviders = () => {
    if (filteredProviderData.length === 0) {
      notify.error(t("没有数据可导出", "No data to export"));
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
    notify.success(t("导出成功", "Export successful"));
  };

  // ==================== Card Merchant Handlers ====================
  const handleOpenInitialBalance = (vendorName: string) => {
    setCurrentVendor(vendorName);
    const settlement = cardSettlements.find(s => s.vendorName === vendorName);
    setInitialBalanceAmount(settlement?.initialBalance?.toString() || "0");
    setIsInitialBalanceDialogOpen(true);
  };

  const handleSaveInitialBalance = async () => {
    if (blockReadonly("设置初始余额", "set initial balance")) return;
    const amount = parseFloat(initialBalanceAmount);
    if (isNaN(amount)) {
      showSubmissionError(t("请输入有效数值", "Please enter a valid number"));
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
      notify.success(t("初始余额已设置", "Initial balance set"));
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
    if (blockReadonly("录入提款", "add withdrawal")) return;
    const amountUsdt = parseFloat(withdrawalAmountUsdt);
    const rate = parseFloat(withdrawalUsdtRate);
    
    if (isNaN(amountUsdt) || isNaN(rate)) {
      showSubmissionError(t("请输入有效数值", "Please enter a valid number"));
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
      notify.success(t("提款已录入", "Withdrawal added"));
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
      showSubmissionError(t("没有可撤回的初始余额操作", "No initial balance action to undo"));
      return;
    }
    const lastAction = settlement.history[settlement.history.length - 1];
    if (lastAction.action !== 'initial_balance') {
      showSubmissionError(t("没有可撤回的初始余额操作", "No initial balance action to undo"));
      return;
    }
    setUndoDescription(lastAction.description || lastAction.action);
    setCurrentVendor(vendorName);
    resetUndoAuthState();
    setIsUndoConfirmOpen(true);
  };

  const handleConfirmUndo = async () => {
    if (blockReadonly("撤回操作", "undo action")) return;
    if (!employee?.id) {
      setUndoAuthError(t('无法获取当前账号信息', 'Cannot get current account info'));
      return;
    }
    if (!undoPassword) {
      setUndoAuthError(t('请输入密码', 'Please enter password'));
      return;
    }
    setIsUndoVerifying(true);
    setUndoAuthError('');
    try {
      const verifyRes = await apiPost<{ success?: boolean; valid?: boolean }>('/api/auth/verify-password', {
        password: undoPassword,
      });
      if (!verifyRes || verifyRes.valid !== true) {
        const msg =
          verifyRes?.valid === false
            ? t('密码错误', 'Wrong password')
            : t('验证失败', 'Verification failed');
        setUndoAuthError(msg);
        setIsUndoVerifying(false);
        return;
      }
    } catch (e: unknown) {
      const detail = e instanceof Error ? e.message : '';
      setUndoAuthError(
        detail
          ? t(`验证失败：${detail}`, `Verification failed: ${detail}`)
          : t('验证异常，请重试', 'Verification error, please retry'),
      );
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
        notify.success(t("已撤回上一步操作", "Last action undone"));
      } else {
        showSubmissionError(result.error || t("撤回失败", "Undo failed"));
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
    if (blockReadonly("编辑提款记录", "edit withdrawal")) return;
    if (!editingWithdrawal) return;
    
    setIsSaving(true);
    try {
      // 获取当前实时余额用于记录变动明细
      const vendorData = vendorSettlementData.find(v => v.vendorName === currentVendor);
      const currentBalance = vendorData?.realTimeBalance || 0;
      
      markLocalSave();
      const wdOk = await updateWithdrawal(currentVendor, editingWithdrawal.id, {
        withdrawalAmountUsdt: editingWithdrawal.withdrawalAmountUsdt,
        usdtRate: editingWithdrawal.usdtRate,
        remark: editingWithdrawal.remark,
      }, currentBalance);
      if (!wdOk) {
        showSubmissionError(
          t(
            '未找到该提款记录，可能缓存未与服务器同步。请点「刷新」或关闭弹窗后重试。',
            'Withdrawal record not found; cache may be out of sync. Refresh the page or reopen the dialog.',
          ),
        );
        return;
      }
      // Skip forceRefreshSettlementCache — cache already updated by save
      await loadData();
      const withdrawals = getWithdrawalsForVendor(currentVendor);
      // 保持排序
      const sortedWithdrawals = [...withdrawals].sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      setCurrentWithdrawals(sortedWithdrawals);
      setEditingWithdrawal(null);
      notify.success(t("提款记录已更新", "Withdrawal updated"));
      // 通知变动明细对话框刷新
      notifyDataMutation({ table: 'ledger_transactions', operation: 'UPDATE', source: 'manual' }).catch(console.error);
    } finally {
      setIsSaving(false);
    }
  };

  // 删除提款记录
  const handleConfirmDeleteWithdrawal = async () => {
    if (blockReadonly("删除提款记录", "delete withdrawal")) return;
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
      notify.success(t("提款记录已删除", "Withdrawal deleted"));
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirmBatchDeleteWithdrawals = async () => {
    if (blockReadonly("删除提款记录", "delete withdrawal")) return;
    const ids = pendingBatchWithdrawalDelete;
    if (!ids?.length || !currentVendor) return;

    setIsSaving(true);
    try {
      markLocalSave();
      for (const id of ids) {
        await deleteWithdrawal(currentVendor, id);
      }
      await loadData();
      const withdrawals = getWithdrawalsForVendor(currentVendor);
      const sortedWithdrawals = [...withdrawals].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
      setCurrentWithdrawals(sortedWithdrawals);
      setSelectedWithdrawalIds(new Set());
      notify.success(t(`已删除 ${ids.length} 条提款记录`, `Deleted ${ids.length} withdrawal(s)`));
      notifyDataMutation({ table: "ledger_transactions", operation: "UPDATE", source: "manual" }).catch(console.error);
    } catch (err) {
      console.error("[MerchantSettlement] batch delete withdrawals:", err);
      showSubmissionError(t("批量删除失败，请重试", "Batch delete failed, please try again"));
    } finally {
      setPendingBatchWithdrawalDelete(null);
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
    if (blockReadonly("设置代付初始余额", "set provider initial balance")) return;
    const amount = parseFloat(providerInitialBalanceAmount);
    if (isNaN(amount)) {
      showSubmissionError(t("请输入有效数值", "Please enter a valid number"));
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
      notify.success(t("初始余额已设置", "Initial balance set"));
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
    if (blockReadonly("录入充值", "add recharge")) return;
    const amountUsdt = parseFloat(rechargeAmountUsdt);
    const rate = parseFloat(rechargeUsdtRate);
    
    if (isNaN(amountUsdt) || isNaN(rate)) {
      showSubmissionError(t("请输入有效数值", "Please enter a valid number"));
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
      notify.success(t("充值已录入", "Recharge added"));
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
      showSubmissionError(t("没有可撤回的初始余额操作", "No initial balance action to undo"));
      return;
    }
    const lastAction = settlement.history[settlement.history.length - 1];
    if (lastAction.action !== 'initial_balance') {
      showSubmissionError(t("没有可撤回的初始余额操作", "No initial balance action to undo"));
      return;
    }
    setProviderUndoDescription(lastAction.description || lastAction.action);
    setCurrentProvider(providerName);
    resetUndoAuthState();
    setIsProviderUndoConfirmOpen(true);
  };

  const handleConfirmProviderUndo = async () => {
    if (blockReadonly("撤回操作", "undo action")) return;
    if (!employee?.id) {
      setUndoAuthError(t('无法获取当前账号信息', 'Cannot get current account info'));
      return;
    }
    if (!undoPassword) {
      setUndoAuthError(t('请输入密码', 'Please enter password'));
      return;
    }
    setIsUndoVerifying(true);
    setUndoAuthError('');
    try {
      const verifyRes = await apiPost<{ success?: boolean; valid?: boolean }>('/api/auth/verify-password', {
        password: undoPassword,
      });
      if (!verifyRes || verifyRes.valid !== true) {
        const msg =
          verifyRes?.valid === false
            ? t('密码错误', 'Wrong password')
            : t('验证失败', 'Verification failed');
        setUndoAuthError(msg);
        setIsUndoVerifying(false);
        return;
      }
    } catch (e: unknown) {
      const detail = e instanceof Error ? e.message : '';
      setUndoAuthError(
        detail
          ? t(`验证失败：${detail}`, `Verification failed: ${detail}`)
          : t('验证异常，请重试', 'Verification error, please retry'),
      );
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
        notify.success(t("已撤回上一步操作", "Last action undone"));
      } else {
        showSubmissionError(result.error || t("撤回失败", "Undo failed"));
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
    if (blockReadonly("编辑充值记录", "edit recharge")) return;
    if (!editingRecharge) return;
    
    setIsSaving(true);
    try {
      // 获取当前实时余额用于记录变动明细
      const providerData = providerSettlementData.find(p => p.providerName === currentProvider);
      const currentBalance = providerData?.realTimeBalance || 0;
      
      markLocalSave();
      const rcOk = await updateRecharge(currentProvider, editingRecharge.id, {
        rechargeAmountUsdt: editingRecharge.rechargeAmountUsdt,
        usdtRate: editingRecharge.usdtRate,
        remark: editingRecharge.remark,
      }, currentBalance);
      if (!rcOk) {
        showSubmissionError(
          t(
            '未找到该充值记录，可能缓存未与服务器同步。请点「刷新」或关闭弹窗后重试。',
            'Recharge record not found; cache may be out of sync. Refresh the page or reopen the dialog.',
          ),
        );
        return;
      }
      // Skip forceRefreshSettlementCache — cache already updated by save
      await loadData();
      const recharges = getRechargesForProvider(currentProvider);
      // 保持排序
      const sortedRecharges = [...recharges].sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      setCurrentRecharges(sortedRecharges);
      setEditingRecharge(null);
      notify.success(t("充值记录已更新", "Recharge updated"));
      // 通知变动明细对话框刷新
      notifyDataMutation({ table: 'ledger_transactions', operation: 'UPDATE', source: 'manual' }).catch(console.error);
    } finally {
      setIsSaving(false);
    }
  };

  // 删除充值记录
  const handleConfirmDeleteRecharge = async () => {
    if (blockReadonly("删除充值记录", "delete recharge")) return;
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
      notify.success(t("充值记录已删除", "Recharge deleted"));
    } finally {
      setIsSaving(false);
    }
  };

  const settlementTotal = safeNumber(withdrawalAmountUsdt) * safeNumber(withdrawalUsdtRate);
  const rechargeSettlementTotal = safeNumber(rechargeAmountUsdt) * safeNumber(rechargeUsdtRate);

  const currentVendorData = vendorSettlementData.find(v => v.vendorName === currentVendor);
  const currentProviderData = providerSettlementData.find(p => p.providerName === currentProvider);

  // 重试函数
  const handleRetryInit = async () => {
    setIsLoading(true);
    setInitError(null);
    try {
      await initializeSettlementCache();
      await loadData();
      await loadEmployees();
    } catch (error) {
      console.error('[MerchantSettlement] Retry failed:', error);
      setInitError(error instanceof Error ? error.message : t('加载失败', 'Load failed'));
    } finally {
      setIsLoading(false);
    }
  };

  // 加载中显示
  if (isLoading) {
    return <TablePageSkeleton columns={6} />;
  }

  // 初始化失败显示
  if (initError) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        <p className="text-muted-foreground text-sm">{t("数据加载失败，请重试", "Failed to load data, please retry")}</p>
        <Button onClick={handleRetryInit} className="gap-2">
          <RefreshCw className="h-4 w-4" />
          {t("重新加载", "Reload")}
        </Button>
      </div>
    );
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
      
      <DrawerDetail open={isInitialBalanceDialogOpen} onOpenChange={setIsInitialBalanceDialogOpen} title={t("填入初始余额", "Set Initial Balance")} sheetMaxWidth="xl">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("卡商名称", "Vendor Name")}</Label>
              <Input value={currentVendor} disabled />
            </div>
            <div className="space-y-2">
              <Label>{t("初始余额", "Initial Balance")}</Label>
              <div className="flex gap-2">
                <Input 
                  type="number" 
                  placeholder={t("输入金额", "Enter amount")} 
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
                <p>{t("当前实时余额", "Current real-time balance")}: ¥{currentVendorData.realTimeBalance.toFixed(2)}</p>
                <p className="text-xs mt-1">{t("提示：设置初始余额后，将重置最后重置时间并清空提款记录", "Note: Setting initial balance will reset the last reset time and clear withdrawal records")}</p>
              </div>
            )}
          </div>
          <div className="flex flex-wrap justify-end gap-2 pt-4 mt-4 border-t border-border">
            <Button variant="outline" onClick={() => setIsInitialBalanceDialogOpen(false)}>{t("取消", "Cancel")}</Button>
            <Button onClick={handleSaveInitialBalance} disabled={isSaving}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("确定", "Confirm")}
            </Button>
          </div>
      </DrawerDetail>

      <DrawerDetail open={isWithdrawalDialogOpen} onOpenChange={setIsWithdrawalDialogOpen} title={t("录入提款", "Add Withdrawal")} sheetMaxWidth="xl">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("卡商名称", "Vendor Name")}</Label>
              <Input value={currentVendor} disabled />
            </div>
            <div className="space-y-2">
              <Label>{t("提款金额USDT", "Withdrawal Amount USDT")}</Label>
              <Input 
                type="number" 
                placeholder={t("输入USDT金额（支持负数）", "Enter USDT amount (negative allowed)")} 
                value={withdrawalAmountUsdt}
                onChange={(e) => setWithdrawalAmountUsdt(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("USDT汇率", "USDT Rate")}</Label>
              <Input 
                type="number" 
                placeholder={t("输入汇率", "Enter rate")} 
                value={withdrawalUsdtRate}
                onChange={(e) => setWithdrawalUsdtRate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("结算总额", "Settlement Total")}</Label>
              <Input 
                type="number" 
                value={isNaN(settlementTotal) ? 0 : settlementTotal.toFixed(2)} 
                disabled 
              />
              <p className="text-xs text-muted-foreground">= {t("提款金额USDT", "Withdrawal USDT")} × {t("USDT汇率", "USDT Rate")}</p>
            </div>
            <div className="space-y-2">
              <Label>{t("备注", "Remark")}</Label>
              <Textarea 
                placeholder={t("输入备注（可选）", "Enter remark (optional)")} 
                value={withdrawalRemark}
                onChange={(e) => setWithdrawalRemark(e.target.value)}
                className="min-h-[60px]"
              />
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-2 pt-4 mt-4 border-t border-border">
            <Button variant="outline" onClick={() => setIsWithdrawalDialogOpen(false)}>{t("取消", "Cancel")}</Button>
            <Button onClick={handleSaveWithdrawal} disabled={isSaving}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("确定", "Confirm")}
            </Button>
          </div>
      </DrawerDetail>

      <DrawerDetail
        open={isDetailsDialogOpen}
        onOpenChange={setIsDetailsDialogOpen}
        title={`${t("提款明细", "Withdrawal Details")} - ${currentVendor}`}
        description={t("查看和管理该卡商的提款记录", "View and manage withdrawal records for this vendor")}
        sheetMaxWidth="4xl"
      >
          <div className="max-h-96 overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 border-b sticky top-0">
                  {canEditBalance ? (
                    <th className="w-10 p-3 text-center font-medium">
                      <div className="flex justify-center">
                        <Checkbox
                          checked={
                            withdrawalSelectionState.allSelected
                              ? true
                              : withdrawalSelectionState.someSelected
                                ? "indeterminate"
                                : false
                          }
                          onCheckedChange={() => {
                            setSelectedWithdrawalIds((prev) => {
                              const ids = withdrawalSelectionState.ids;
                              const allOn =
                                ids.length > 0 && ids.every((id) => prev.has(id));
                              const next = new Set(prev);
                              if (allOn) ids.forEach((id) => next.delete(id));
                              else ids.forEach((id) => next.add(id));
                              return next;
                            });
                          }}
                          aria-label={t("全选列表", "Select all")}
                        />
                      </div>
                    </th>
                  ) : null}
                  <th className="text-left p-3 font-medium">{t("序号", "#")}</th>
                  <th className="text-left p-3 font-medium">{t("录入时间", "Entry Time")}</th>
                  <th className="text-left p-3 font-medium">{t("卡商名称", "Vendor Name")}</th>
                  <th className="text-left p-3 font-medium">{t("提款金额USDT", "Withdrawal USDT")}</th>
                  <th className="text-left p-3 font-medium">{t("USDT汇率", "USDT Rate")}</th>
                  <th className="text-left p-3 font-medium">{t("结算总额", "Settlement Total")}</th>
                  <th className="text-left p-3 font-medium">{t("备注", "Remark")}</th>
                  <th className="text-left p-3 font-medium">{t("录入人", "Recorder")}</th>
                  <th className="text-center p-3 font-medium">{t("操作", "Actions")}</th>
                </tr>
              </thead>
              <tbody>
                {currentWithdrawals.map((w, index) => (
                  <tr key={w.id} className="border-b">
                    {canEditBalance ? (
                      <td className="p-3 text-center">
                        <div className="flex justify-center">
                          <Checkbox
                            checked={selectedWithdrawalIds.has(w.id)}
                            onCheckedChange={() => {
                              setSelectedWithdrawalIds((prev) => {
                                const next = new Set(prev);
                                if (next.has(w.id)) next.delete(w.id);
                                else next.add(w.id);
                                return next;
                              });
                            }}
                            aria-label={t("选择该行", "Select row")}
                          />
                        </div>
                      </td>
                    ) : null}
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
                        <TooltipProvider delayDuration={300}>
                          <div className="flex items-center justify-center gap-2">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleEditWithdrawal(w)}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent side="bottom">{t("编辑", "Edit")}</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-destructive hover:text-destructive"
                                  onClick={() => setDeletingWithdrawalId(w.id)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent side="bottom">{t("删除", "Delete")}</TooltipContent>
                            </Tooltip>
                          </div>
                        </TooltipProvider>
                      ) : (
                        <span className="text-muted-foreground text-xs">-</span>
                      )}
                    </td>
                  </tr>
                ))}
                {currentWithdrawals.length === 0 && (
                  <tr>
                    <td colSpan={canEditBalance ? 10 : 9} className="p-6 text-center text-muted-foreground">
                      {t("暂无提款记录", "No withdrawal records")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap justify-end gap-2 pt-4 mt-4 border-t border-border">
            {canEditBalance && selectedWithdrawalIds.size > 0 ? (
              <TooltipProvider delayDuration={300}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      onClick={() => setPendingBatchWithdrawalDelete([...selectedWithdrawalIds])}
                    >
                      {t("批量删除", "Batch delete")}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    {t(`删除已选的 ${selectedWithdrawalIds.size} 条记录`, `Delete ${selectedWithdrawalIds.size} selected`)}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : null}
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button onClick={() => setIsDetailsDialogOpen(false)}>{t("关闭", "Close")}</Button>
                </TooltipTrigger>
                <TooltipContent side="top">{t("关闭抽屉", "Close panel")}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
      </DrawerDetail>

      <DrawerDetail
        open={!!editingWithdrawal}
        onOpenChange={(open) => !open && setEditingWithdrawal(null)}
        title={t("编辑提款记录", "Edit Withdrawal")}
        description={t("修改提款金额和汇率", "Modify withdrawal amount and rate")}
        sheetMaxWidth="xl"
      >
          {editingWithdrawal && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>{t("提款金额USDT", "Withdrawal Amount USDT")}</Label>
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
                <Label>{t("USDT汇率", "USDT Rate")}</Label>
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
                <Label>{t("结算总额", "Settlement Total")}</Label>
                <Input
                  type="number"
                  value={(editingWithdrawal.withdrawalAmountUsdt * editingWithdrawal.usdtRate).toFixed(2)}
                  disabled
                />
              </div>
              <div className="space-y-2">
                <Label>{t("备注", "Remark")}</Label>
                <Textarea
                  placeholder={t("输入备注（可选）", "Enter remark (optional)")}
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
          <div className="flex flex-wrap justify-end gap-2 pt-4 mt-4 border-t border-border">
            <Button variant="outline" onClick={() => setEditingWithdrawal(null)}>{t("取消", "Cancel")}</Button>
            <Button onClick={handleSaveEditWithdrawal} disabled={isSaving}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("保存", "Save")}
            </Button>
          </div>
      </DrawerDetail>

      {/* Delete Withdrawal Confirmation */}
      <AlertDialog open={!!deletingWithdrawalId} onOpenChange={(open) => !open && setDeletingWithdrawalId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("确认删除", "Confirm Delete")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("确定要删除这条提款记录吗？此操作不可恢复。", "Are you sure you want to delete this withdrawal record? This action cannot be undone.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("取消", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDeleteWithdrawal} disabled={isSaving}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("删除", "Delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={pendingBatchWithdrawalDelete !== null}
        onOpenChange={(open) => !open && setPendingBatchWithdrawalDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("确认批量删除", "Confirm batch delete")}</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingBatchWithdrawalDelete?.length
                ? t(
                    `将删除 ${pendingBatchWithdrawalDelete.length} 条提款记录，确定继续？`,
                    `Delete ${pendingBatchWithdrawalDelete.length} withdrawal record(s)?`,
                  )
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("取消", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                void handleConfirmBatchDeleteWithdrawals();
              }}
              disabled={isSaving}
            >
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("删除", "Delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Card Merchant Undo Confirmation Dialog */}
      <AlertDialog open={isUndoConfirmOpen} onOpenChange={(open) => { setIsUndoConfirmOpen(open); if (!open) resetUndoAuthState(); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("确认撤回", "Confirm Undo")}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                <p>{t("确定要撤回以下操作吗？此操作将恢复到修改前的状态并同步更新账本明细。", "Are you sure you want to undo the following action? This will restore the previous state and update the ledger.")}</p>
                <p className="mt-1"><strong className="text-foreground">{t("即将撤回", "About to undo")}: {undoDescription}</strong></p>
                <div className="mt-4 space-y-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">{t("账号", "Account")}</Label>
                    <Input value={employee?.username || ''} disabled className="bg-muted/30" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">{t("密码", "Password")}</Label>
                    <Input
                      type="password"
                      placeholder={t("请输入密码以确认身份", "Enter password to confirm identity")}
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
            <AlertDialogCancel>{t("取消", "Cancel")}</AlertDialogCancel>
            <Button onClick={handleConfirmUndo} disabled={isUndoVerifying || isSaving || !undoPassword}>
              {(isUndoVerifying || isSaving) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("确定", "Confirm")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ==================== Payment Provider Dialogs ==================== */}
      
      <DrawerDetail open={isProviderInitialBalanceDialogOpen} onOpenChange={setIsProviderInitialBalanceDialogOpen} title={t("填入初始余额", "Set Initial Balance")} sheetMaxWidth="xl">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("代付商家", "Payment Provider")}</Label>
              <Input value={currentProvider} disabled />
            </div>
            <div className="space-y-2">
              <Label>{t("初始余额", "Initial Balance")}</Label>
              <div className="flex gap-2">
                <Input 
                  type="number" 
                  placeholder={t("输入金额", "Enter amount")} 
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
                <p>{t("当前实时余额", "Current real-time balance")}: ¥{currentProviderData.realTimeBalance.toFixed(2)}</p>
                <p className="text-xs mt-1">{t("提示：设置初始余额后，将重置最后重置时间并清空充值记录", "Note: Setting initial balance will reset the last reset time and clear recharge records")}</p>
              </div>
            )}
          </div>
          <div className="flex flex-wrap justify-end gap-2 pt-4 mt-4 border-t border-border">
            <Button variant="outline" onClick={() => setIsProviderInitialBalanceDialogOpen(false)}>{t("取消", "Cancel")}</Button>
            <Button onClick={handleSaveProviderInitialBalance} disabled={isSaving}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("确定", "Confirm")}
            </Button>
          </div>
      </DrawerDetail>

      <DrawerDetail open={isRechargeDialogOpen} onOpenChange={setIsRechargeDialogOpen} title={t("录入充值", "Add Recharge")} sheetMaxWidth="xl">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("代付商家", "Payment Provider")}</Label>
              <Input value={currentProvider} disabled />
            </div>
            <div className="space-y-2">
              <Label>{t("充值金额USDT", "Recharge Amount USDT")}</Label>
              <Input 
                type="number" 
                placeholder={t("输入USDT金额（支持负数）", "Enter USDT amount (negative allowed)")} 
                value={rechargeAmountUsdt}
                onChange={(e) => setRechargeAmountUsdt(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("USDT汇率", "USDT Rate")}</Label>
              <Input 
                type="number" 
                placeholder={t("输入汇率", "Enter rate")} 
                value={rechargeUsdtRate}
                onChange={(e) => setRechargeUsdtRate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("结算总额", "Settlement Total")}</Label>
              <Input 
                type="number" 
                value={isNaN(rechargeSettlementTotal) ? 0 : rechargeSettlementTotal.toFixed(2)} 
                disabled 
              />
              <p className="text-xs text-muted-foreground">= {t("充值金额USDT", "Recharge USDT")} × {t("USDT汇率", "USDT Rate")}</p>
            </div>
            <div className="space-y-2">
              <Label>{t("备注", "Remark")}</Label>
              <Textarea 
                placeholder={t("输入备注（可选）", "Enter remark (optional)")} 
                value={rechargeRemark}
                onChange={(e) => setRechargeRemark(e.target.value)}
                className="min-h-[60px]"
              />
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-2 pt-4 mt-4 border-t border-border">
            <Button variant="outline" onClick={() => setIsRechargeDialogOpen(false)}>{t("取消", "Cancel")}</Button>
            <Button onClick={handleSaveRecharge} disabled={isSaving}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("确定", "Confirm")}
            </Button>
          </div>
      </DrawerDetail>

      <DrawerDetail
        open={isProviderDetailsDialogOpen}
        onOpenChange={setIsProviderDetailsDialogOpen}
        title={`${t("充值明细", "Recharge Details")} - ${currentProvider}`}
        description={t("查看和管理该代付商家的充值记录", "View and manage recharge records for this provider")}
        sheetMaxWidth="4xl"
      >
          <div className="max-h-96 overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 border-b sticky top-0">
                  <th className="text-left p-3 font-medium">{t("序号", "#")}</th>
                  <th className="text-left p-3 font-medium">{t("录入时间", "Entry Time")}</th>
                  <th className="text-left p-3 font-medium">{t("代付商家", "Payment Provider")}</th>
                  <th className="text-left p-3 font-medium">{t("充值金额USDT", "Recharge USDT")}</th>
                  <th className="text-left p-3 font-medium">{t("USDT汇率", "USDT Rate")}</th>
                  <th className="text-left p-3 font-medium">{t("结算总额", "Settlement Total")}</th>
                  <th className="text-left p-3 font-medium">{t("备注", "Remark")}</th>
                  <th className="text-left p-3 font-medium">{t("录入人", "Recorder")}</th>
                  <th className="text-center p-3 font-medium">{t("操作", "Actions")}</th>
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
                      {t("暂无充值记录", "No recharge records")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap justify-end gap-2 pt-4 mt-4 border-t border-border">
            <Button onClick={() => setIsProviderDetailsDialogOpen(false)}>{t("关闭", "Close")}</Button>
          </div>
      </DrawerDetail>

      <DrawerDetail
        open={!!editingRecharge}
        onOpenChange={(open) => !open && setEditingRecharge(null)}
        title={t("编辑充值记录", "Edit Recharge")}
        description={t("修改充值金额和汇率", "Modify recharge amount and rate")}
        sheetMaxWidth="xl"
      >
          {editingRecharge && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>{t("充值金额USDT", "Recharge Amount USDT")}</Label>
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
                <Label>{t("USDT汇率", "USDT Rate")}</Label>
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
                <Label>{t("结算总额", "Settlement Total")}</Label>
                <Input
                  type="number"
                  value={(editingRecharge.rechargeAmountUsdt * editingRecharge.usdtRate).toFixed(2)}
                  disabled
                />
              </div>
              <div className="space-y-2">
                <Label>{t("备注", "Remark")}</Label>
                <Textarea
                  placeholder={t("输入备注（可选）", "Enter remark (optional)")}
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
          <div className="flex flex-wrap justify-end gap-2 pt-4 mt-4 border-t border-border">
            <Button variant="outline" onClick={() => setEditingRecharge(null)}>{t("取消", "Cancel")}</Button>
            <Button onClick={handleSaveEditRecharge} disabled={isSaving}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("保存", "Save")}
            </Button>
          </div>
      </DrawerDetail>

      {/* Delete Recharge Confirmation */}
      <AlertDialog open={!!deletingRechargeId} onOpenChange={(open) => !open && setDeletingRechargeId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("确认删除", "Confirm Delete")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("确定要删除这条充值记录吗？此操作不可恢复。", "Are you sure you want to delete this recharge record? This action cannot be undone.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("取消", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDeleteRecharge} disabled={isSaving}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("删除", "Delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Provider Undo Confirmation Dialog */}
      <AlertDialog open={isProviderUndoConfirmOpen} onOpenChange={(open) => { setIsProviderUndoConfirmOpen(open); if (!open) resetUndoAuthState(); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("确认撤回", "Confirm Undo")}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                <p>{t("确定要撤回以下操作吗？此操作将恢复到修改前的状态并同步更新账本明细。", "Are you sure you want to undo the following action? This will restore the previous state and update the ledger.")}</p>
                <p className="mt-1"><strong className="text-foreground">{t("即将撤回", "About to undo")}: {providerUndoDescription}</strong></p>
                <div className="mt-4 space-y-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">{t("账号", "Account")}</Label>
                    <Input value={employee?.username || ''} disabled className="bg-muted/30" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">{t("密码", "Password")}</Label>
                    <Input
                      type="password"
                      placeholder={t("请输入密码以确认身份", "Enter password to confirm identity")}
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
            <AlertDialogCancel>{t("取消", "Cancel")}</AlertDialogCancel>
            <Button onClick={handleConfirmProviderUndo} disabled={isUndoVerifying || isSaving || !undoPassword}>
              {(isUndoVerifying || isSaving) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("确定", "Confirm")}
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
          if (blockReadonly("录入提款", "add withdrawal")) return;
          setIsSaving(true);
          try {
            const recorderId = employee?.id || '';
            const vendorData = vendorSettlementData.find(v => v.vendorName === currentVendor);
            const currentBalance = vendorData?.realTimeBalance || 0;
            markLocalSave();
            await addWithdrawal(currentVendor, amountUsdt, rate, remark || undefined, currentBalance);
            await loadData();
            const withdrawals = getWithdrawalsForVendor(currentVendor);
            setCurrentWithdrawals([...withdrawals].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
            notify.success(t("提款已录入", "Withdrawal added"));
            notifyDataMutation({ table: 'ledger_transactions', operation: 'INSERT', source: 'manual' }).catch(console.error);
          } finally { setIsSaving(false); }
        }}
        onSaveInitialBalance={async (amount) => {
          if (blockReadonly("设置初始余额", "set initial balance")) return;
          setIsSaving(true);
          try {
            const vendorData = vendorSettlementData.find(v => v.vendorName === currentVendor);
            markLocalSave();
            await setInitialBalance(currentVendor, amount, vendorData?.realTimeBalance || 0);
            await loadData();
            notify.success(t("初始余额已设置", "Initial balance set"));
            notifyDataMutation({ table: 'ledger_transactions', operation: 'UPDATE', source: 'manual' }).catch(console.error);
          } finally { setIsSaving(false); }
        }}
        onEditWithdrawal={async (withdrawal, updates) => {
          if (blockReadonly("编辑提款记录", "edit withdrawal")) return;
          setIsSaving(true);
          try {
            const vendorData = vendorSettlementData.find(v => v.vendorName === currentVendor);
            markLocalSave();
            await updateWithdrawal(currentVendor, withdrawal.id, updates, vendorData?.realTimeBalance || 0);
            await loadData();
            const withdrawals = getWithdrawalsForVendor(currentVendor);
            setCurrentWithdrawals([...withdrawals].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
            notify.success(t("提款记录已更新", "Withdrawal updated"));
            notifyDataMutation({ table: 'ledger_transactions', operation: 'UPDATE', source: 'manual' }).catch(console.error);
          } finally { setIsSaving(false); }
        }}
        onDeleteWithdrawal={async (withdrawalId) => {
          if (blockReadonly("删除提款记录", "delete withdrawal")) return;
          setIsSaving(true);
          try {
            const vendorData = vendorSettlementData.find(v => v.vendorName === currentVendor);
            markLocalSave();
            await deleteWithdrawal(currentVendor, withdrawalId, vendorData?.realTimeBalance || 0);
            await loadData();
            const withdrawals = getWithdrawalsForVendor(currentVendor);
            setCurrentWithdrawals([...withdrawals].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
            notify.success(t("提款记录已删除", "Withdrawal deleted"));
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
          if (blockReadonly("录入充值", "add recharge")) return;
          setIsSaving(true);
          try {
            const recorderId = employee?.id || '';
            const providerData = providerSettlementData.find(p => p.providerName === currentProvider);
            markLocalSave();
            await addRecharge(currentProvider, amountUsdt, rate, remark || undefined, providerData?.realTimeBalance || 0);
            await loadData();
            const recharges = getRechargesForProvider(currentProvider);
            setCurrentRecharges([...recharges].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
            notify.success(t("充值已录入", "Recharge added"));
          } finally { setIsSaving(false); }
        }}
        onSaveInitialBalance={async (amount) => {
          if (blockReadonly("设置代付初始余额", "set provider initial balance")) return;
          setIsSaving(true);
          try {
            const providerData = providerSettlementData.find(p => p.providerName === currentProvider);
            markLocalSave();
            await setProviderInitialBalance(currentProvider, amount, providerData?.realTimeBalance || 0);
            await loadData();
            notify.success(t("初始余额已设置", "Initial balance set"));
          } finally { setIsSaving(false); }
        }}
        onEditRecharge={async (recharge, updates) => {
          if (blockReadonly("编辑充值记录", "edit recharge")) return;
          setIsSaving(true);
          try {
            const providerData = providerSettlementData.find(p => p.providerName === currentProvider);
            markLocalSave();
            await updateRecharge(currentProvider, recharge.id, updates, providerData?.realTimeBalance || 0);
            await loadData();
            const recharges = getRechargesForProvider(currentProvider);
            setCurrentRecharges([...recharges].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
            notify.success(t("充值记录已更新", "Recharge updated"));
            notifyDataMutation({ table: 'ledger_transactions', operation: 'UPDATE', source: 'manual' }).catch(console.error);
          } finally { setIsSaving(false); }
        }}
        onDeleteRecharge={async (rechargeId) => {
          if (blockReadonly("删除充值记录", "delete recharge")) return;
          setIsSaving(true);
          try {
            const providerData = providerSettlementData.find(p => p.providerName === currentProvider);
            markLocalSave();
            await deleteRecharge(currentProvider, rechargeId, providerData?.realTimeBalance || 0);
            await loadData();
            const recharges = getRechargesForProvider(currentProvider);
            setCurrentRecharges([...recharges].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
            notify.success(t("充值记录已删除", "Recharge deleted"));
            notifyDataMutation({ table: 'ledger_transactions', operation: 'UPDATE', source: 'manual' }).catch(console.error);
          } finally { setIsSaving(false); }
        }}
      />

      <ExportConfirmDialog
        open={exportConfirm.open}
        onOpenChange={exportConfirm.handleOpenChange}
        onConfirm={exportConfirm.handleConfirm}
      />
    </div>
  );
}
