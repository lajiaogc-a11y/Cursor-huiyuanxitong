import { useState, useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { safeNumber } from "@/lib/safeCalc";
import { 
  calculateNormalOrderDerivedValues, 
  calculateUsdtOrderDerivedValues,
  calculateProfit,
  calculateProfitRate
} from "@/lib/orderCalculations";
import { logOrderUpdateBalanceChange, syncMemberActivityOnOrderEdit } from "@/services/finance/balanceLogService";
import { adjustPointsOnOrderEdit } from "@/services/points/pointsService";
import { logOperation } from '@/stores/auditLogStore';
import { useLanguage } from "@/contexts/LanguageContext";
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useSortableData } from "@/components/ui/sortable-table-head";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Search, RefreshCw, Filter, Upload, Download, X } from "lucide-react";
import TableImportButton from "@/components/TableImportButton";
import { ExportConfirmDialog } from "@/components/ExportConfirmDialog";
import { useExportConfirm } from "@/hooks/useExportConfirm";
import { exportTableToXLSX } from "@/services/dataExportImportService";
import { notify } from "@/lib/notifyHub";
import { showServiceErrorToast } from "@/services/serviceErrorToast";
import { TimeRangeType, DateRange, getTimeRangeDates, ALL_TIME_DATE_RANGE } from "@/lib/dateFilter";
import {
  useOrders,
  useUsdtOrders,
  useMeikaOrders,
  useMeikaUsdtOrders,
  useOrderStats,
  Order,
  UsdtOrder,
} from "@/hooks/useOrders";
import { updateOrderUseCase } from "@/application/order/useCases/orderLifecycleUseCases";
import { useMerchantNameResolver } from "@/hooks/useNameResolver";
import { useColumnVisibility, ColumnConfig } from "@/hooks/useColumnVisibility";
import ColumnVisibilityDropdown from "@/components/ColumnVisibilityDropdown";

import { useAuth } from "@/contexts/AuthContext";
import { useTenantView } from "@/contexts/TenantViewContext";
import { getActiveEmployees, getEmployees, Employee } from "@/stores/employeeStore";
import { useModulePermissions, useFieldPermissions } from "@/hooks/useFieldPermissions";
import { isUserTyping, trackRender } from "@/lib/performanceUtils";
import { cn } from "@/lib/utils";
import { useAuditWorkflow } from "@/hooks/useAuditWorkflow";
import { useIsMobile, useIsTablet } from "@/hooks/use-mobile";
import {
  OrderFilters,
  OrderEditDialog,
  OrderUsdtEditDialog,
  OrderTable,
  OrderUsdtTable,
  OrderMallRedemptionsSection,
} from "@/components/orders";
import { queryClient } from "@/lib/queryClient";
import { notifyDataMutation } from "@/services/system/dataRefreshManager";
import {
  fetchMerchantCards,
  fetchMerchantPaymentProviders,
  fetchMerchantVendors,
} from "@/services/finance/merchantConfigReadService";
import { PageHeader, PageActions, FilterBar, KPIGrid, SectionCard, ErrorState } from "@/components/common";
import { useDebouncedValue } from "@/hooks/useDebounce";

// UUID 校验函数 - 防止把姓名字符串写入 uuid 字段
const isUuid = (str: string): boolean => {
  if (!str || typeof str !== 'string') return false;
  return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(str);
};

/** 订单编辑里 salesPerson 可能是员工 UUID，也可能是 nameResolver 解析后的姓名，统一解析为 employees.id */
function resolveOrderSalesEmployeeId(
  salesPersonField: string | undefined,
  employees: { id: string; real_name: string }[],
): string | null {
  const s = String(salesPersonField ?? "").trim();
  if (!s) return null;
  if (isUuid(s)) return s;
  const byName = employees.find((e) => e.real_name === s);
  return byName?.id ?? null;
}

// 订单状态选项

// 订单状态选项 - 移到组件内部使用 t() 函数
const getOrderStatusOptions = (t: (zh: string, en: string) => string) => [
  { value: "all", label: t("全部状态", "All Status") },
  { value: "cancelled", label: t("已取消", "Cancelled") },
  { value: "completed", label: t("已完成", "Completed") },
];

// 币种选项 - 移到组件内部使用 t() 函数
const getCurrencyOptions = (t: (zh: string, en: string) => string) => [
  { value: "all", label: t("全部币种", "All Currencies") },
  { value: "NGN", label: t("奈拉 (NGN)", "Naira (NGN)") },
  { value: "GHS", label: t("赛地 (GHS)", "Cedi (GHS)") },
  { value: "USDT", label: "USDT" },
];

// 普通订单列配置 - 移到组件内部使用 t() 函数
const getNormalOrderColumns = (t: (zh: string, en: string) => string): ColumnConfig[] => [
  { key: 'createdAt', label: t('创建时间', 'Created At') },
  { key: 'id', label: t('订单ID', 'Order ID') },
  { key: 'cardType', label: t('卡片类型', 'Card Type') },
  { key: 'cardValue', label: t('卡片面值', 'Card Value') },
  { key: 'cardRate', label: t('卡片汇率', 'Card Rate') },
  { key: 'cardWorth', label: t('此卡价值', 'Card Worth') },
  { key: 'actualPaid', label: t('实付外币', 'Actual Paid') },
  { key: 'foreignRate', label: t('外币汇率', 'Foreign Rate') },
  { key: 'fee', label: t('手续费', 'Fee') },
  { key: 'paymentValue', label: t('代付价值', 'Payment Value') },
  { key: 'paymentProvider', label: t('代付商家', 'Payment Provider') },
  { key: 'vendor', label: t('卡商名称', 'Vendor') },
  { key: 'profit', label: t('本单利润', 'Profit') },
  { key: 'profitRate', label: t('本单利率', 'Profit Rate') },
  { key: 'phoneNumber', label: t('电话号码', 'Phone') },
  { key: 'memberCode', label: t('会员编号', 'Member Code') },
  { key: 'demandCurrency', label: t('需求币种', 'Demand Currency') },
  { key: 'salesPerson', label: t('销售员', 'Salesperson') },
  { key: 'remark', label: t('备注', 'Remark') },
  { key: 'status', label: t('状态', 'Status') },
  { key: 'actions', label: t('操作', 'Actions') },
];

// USDT订单列配置 - 移到组件内部使用 t() 函数
const getUsdtOrderColumns = (t: (zh: string, en: string) => string): ColumnConfig[] => [
  { key: 'createdAt', label: t('创建时间', 'Created At') },
  { key: 'id', label: t('订单ID', 'Order ID') },
  { key: 'cardType', label: t('卡片类型', 'Card Type') },
  { key: 'cardValue', label: t('卡片面值', 'Card Value') },
  { key: 'cardRate', label: t('卡片汇率', 'Card Rate') },
  { key: 'cardWorth', label: t('此卡价值', 'Card Worth') },
  { key: 'usdtRate', label: t('USDT汇率', 'USDT Rate') },
  { key: 'totalValueUsdt', label: t('总价值USDT', 'Total Value (USDT)') },
  { key: 'actualPaidUsdt', label: t('实付USDT', 'Actual Paid (USDT)') },
  { key: 'feeUsdt', label: t('手续费USDT', 'Fee (USDT)') },
  { key: 'paymentValue', label: t('代付价值', 'Payment Value') },
  { key: 'profit', label: t('本单利润', 'Profit') },
  { key: 'profitRate', label: t('本单利率', 'Profit Rate') },
  { key: 'vendor', label: t('卡商名称', 'Vendor') },
  { key: 'paymentProvider', label: t('代付商家', 'Payment Provider') },
  { key: 'phoneNumber', label: t('电话号码', 'Phone') },
  { key: 'memberCode', label: t('会员编号', 'Member Code') },
  { key: 'demandCurrency', label: t('需求币种', 'Demand Currency') },
  { key: 'salesPerson', label: t('销售员', 'Salesperson') },
  { key: 'remark', label: t('备注', 'Remark') },
  { key: 'status', label: t('状态', 'Status') },
  { key: 'actions', label: t('操作', 'Actions') },
];

type OrderAuditChange = { fieldKey: string; oldValue: unknown; newValue: unknown };

function computeNormalOrderFieldChanges(
  editing: Order,
  original: Order,
  isSuperAdmin: boolean,
): OrderAuditChange[] {
  const changes: OrderAuditChange[] = [];
  const numDiff = (a: unknown, b: unknown) => parseFloat(String(a || 0)) !== parseFloat(String(b || 0));
  const strDiff = (a: unknown, b: unknown) => String(a || "") !== String(b || "");
  if (strDiff(editing.cardType, original.cardType)) {
    changes.push({ fieldKey: "card_type", oldValue: original.cardType, newValue: editing.cardType });
  }
  if (numDiff(editing.cardValue, original.cardValue)) {
    changes.push({ fieldKey: "card_value", oldValue: original.cardValue, newValue: editing.cardValue });
  }
  if (numDiff(editing.cardRate, original.cardRate)) {
    changes.push({ fieldKey: "card_rate", oldValue: original.cardRate, newValue: editing.cardRate });
  }
  if (numDiff(editing.actualPaid, original.actualPaid)) {
    changes.push({ fieldKey: "actual_paid", oldValue: original.actualPaid, newValue: editing.actualPaid });
  }
  if (numDiff(editing.paymentValue, original.paymentValue)) {
    changes.push({ fieldKey: "payment_value", oldValue: original.paymentValue, newValue: editing.paymentValue });
  }
  if (numDiff(editing.foreignRate, original.foreignRate)) {
    changes.push({ fieldKey: "foreign_rate", oldValue: original.foreignRate, newValue: editing.foreignRate });
  }
  if (numDiff(editing.fee, original.fee)) {
    changes.push({ fieldKey: "fee", oldValue: original.fee, newValue: editing.fee });
  }
  if (strDiff(editing.demandCurrency, original.demandCurrency)) {
    changes.push({ fieldKey: "demand_currency", oldValue: original.demandCurrency, newValue: editing.demandCurrency });
  }
  if (strDiff(editing.phoneNumber, original.phoneNumber)) {
    changes.push({ fieldKey: "phone_number", oldValue: original.phoneNumber, newValue: editing.phoneNumber });
  }
  if (strDiff(editing.paymentProvider, original.paymentProvider)) {
    changes.push({ fieldKey: "payment_provider", oldValue: original.paymentProvider, newValue: editing.paymentProvider });
  }
  if (strDiff(editing.vendor, original.vendor)) {
    changes.push({ fieldKey: "vendor", oldValue: original.vendor, newValue: editing.vendor });
  }
  if (strDiff(editing.remark, original.remark)) {
    changes.push({ fieldKey: "remark", oldValue: original.remark, newValue: editing.remark });
  }
  if (isSuperAdmin && strDiff(editing.salesPerson, original.salesPerson)) {
    changes.push({ fieldKey: "sales_person", oldValue: original.salesPerson, newValue: editing.salesPerson });
  }
  return changes;
}

function computeUsdtOrderFieldChanges(
  editing: UsdtOrder,
  original: UsdtOrder,
  isSuperAdmin: boolean,
): OrderAuditChange[] {
  const changes: OrderAuditChange[] = [];
  if (editing.cardType !== original.cardType) {
    changes.push({ fieldKey: "card_type", oldValue: original.cardType, newValue: editing.cardType });
  }
  if (editing.cardValue !== original.cardValue) {
    changes.push({ fieldKey: "card_value", oldValue: original.cardValue, newValue: editing.cardValue });
  }
  if (editing.cardRate !== original.cardRate) {
    changes.push({ fieldKey: "card_rate", oldValue: original.cardRate, newValue: editing.cardRate });
  }
  if (editing.usdtRate !== original.usdtRate) {
    changes.push({ fieldKey: "usdt_rate", oldValue: original.usdtRate, newValue: editing.usdtRate });
  }
  if (editing.actualPaidUsdt !== original.actualPaidUsdt) {
    changes.push({ fieldKey: "actual_paid", oldValue: original.actualPaidUsdt, newValue: editing.actualPaidUsdt });
  }
  if (editing.phoneNumber !== original.phoneNumber) {
    changes.push({ fieldKey: "phone_number", oldValue: original.phoneNumber, newValue: editing.phoneNumber });
  }
  if (editing.paymentProvider !== original.paymentProvider) {
    changes.push({ fieldKey: "payment_provider", oldValue: original.paymentProvider, newValue: editing.paymentProvider });
  }
  if (editing.vendor !== original.vendor) {
    changes.push({ fieldKey: "vendor", oldValue: original.vendor, newValue: editing.vendor });
  }
  if (editing.feeUsdt !== original.feeUsdt) {
    changes.push({ fieldKey: "fee", oldValue: original.feeUsdt, newValue: editing.feeUsdt });
  }
  if (editing.remark !== original.remark) {
    changes.push({ fieldKey: "remark", oldValue: original.remark, newValue: editing.remark });
  }
  if (isSuperAdmin && editing.salesPerson !== original.salesPerson) {
    changes.push({ fieldKey: "sales_person", oldValue: original.salesPerson, newValue: editing.salesPerson });
  }
  return changes;
}

export default function OrderManagement() {
  trackRender('OrderManagement');
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  const useCompactLayout = isMobile || isTablet;
  const { t, tr } = useLanguage();
  const { isAdmin, employee: currentEmployee } = useAuth();
  const { viewingTenantId } = useTenantView() || {};
  const effectiveTenantId = viewingTenantId || currentEmployee?.tenant_id || null;
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<
    "normal" | "usdt" | "meika-fiat" | "meika-usdt" | "mall"
  >("normal");
  const [mallOrdersRefreshNonce, setMallOrdersRefreshNonce] = useState(0);
  const [mallHighlightId, setMallHighlightId] = useState<string | null>(null);
  /** 商城订单状态筛选（与列表 API / 客户端搜索配合） */
  const [mallStatusFilter, setMallStatusFilter] = useState<"all" | "pending" | "completed" | "rejected">("all");
  const exportConfirm = useExportConfirm();

  // 检查当前用户是否为总管理员
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [allEmployees, setAllEmployees] = useState<{ id: string; real_name: string }[]>([]);
  
  // 获取订单管理模块的所有字段权限
  const { canEditField, canDeleteField } = useModulePermissions('orders');
  
  // 审核工作流
  const { checkNeedsApproval, submitBatchForApproval } = useAuditWorkflow();
  
  // 使用商家名称解析器 - 实时获取最新商家名称
  const { resolveCardName, resolveVendorName, resolveProviderName } = useMerchantNameResolver();
  
  // 列显示/隐藏设置 - 使用 useMemo 保持稳定引用
  const normalOrderColumns = useMemo(() => getNormalOrderColumns(t), [t]);
  const usdtOrderColumns = useMemo(() => getUsdtOrderColumns(t), [t]);
  const orderStatusOptions = useMemo(() => getOrderStatusOptions(t), [t]);
  const currencyOptions = useMemo(() => getCurrencyOptions(t), [t]);
  
  const normalColumnVisibility = useColumnVisibility('order-normal', normalOrderColumns);
  const usdtColumnVisibility = useColumnVisibility('order-usdt', usdtOrderColumns);

  const [searchDraft, setSearchDraft] = useState("");
  const debouncedSearchDraft = useDebouncedValue(searchDraft, 300);
  const [searchQuery, setSearchQuery] = useState("");
  useEffect(() => {
    setSearchQuery(debouncedSearchDraft.trim());
  }, [debouncedSearchDraft]);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [originalOrder, setOriginalOrder] = useState<Order | null>(null); // 保存原始订单用于对比
  const [editingUsdtOrder, setEditingUsdtOrder] = useState<UsdtOrder | null>(null);
  const [originalUsdtOrder, setOriginalUsdtOrder] = useState<UsdtOrder | null>(null); // 保存原始USDT订单用于对比
  const [usdtRateInput, setUsdtRateInput] = useState<string>(""); // USDT汇率字符串输入状态
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isUsdtEditDialogOpen, setIsUsdtEditDialogOpen] = useState(false);
  const [normalOrderPreferSubmitReview, setNormalOrderPreferSubmitReview] = useState(false);
  const [usdtOrderPreferSubmitReview, setUsdtOrderPreferSubmitReview] = useState(false);
  const [employeeNames, setEmployeeNames] = useState<string[]>([]);
  const [cardsList, setCardsList] = useState<{ id: string; name: string }[]>([]);
  const [vendorsList, setVendorsList] = useState<{ id: string; name: string }[]>([]);
  const [paymentProvidersList, setPaymentProvidersList] = useState<{ id: string; name: string }[]>([]);
  
  // 高级筛选状态
  const [showAdvancedFilter, setShowAdvancedFilter] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [currencyFilter, setCurrencyFilter] = useState("all");
  const [vendorFilter, setVendorFilter] = useState("");
  const [salesPersonFilter, setSalesPersonFilter] = useState("");
  const [paymentProviderFilter, setPaymentProviderFilter] = useState("");
  const [cardTypeFilter, setCardTypeFilter] = useState("");
  const [minProfit, setMinProfit] = useState("");
  const [maxProfit, setMaxProfit] = useState("");
  
  // 日期筛选 - 默认全部（避免导入数据时因日期筛选而看不到数据）
  const [selectedRange, setSelectedRange] = useState<TimeRangeType>("全部");
  const [dateRange, setDateRange] = useState<DateRange>(() => getTimeRangeDates("全部"));

  // 分页状态 - 固定每页50条
  const PAGE_SIZE = 50;
  const [currentPage, setCurrentPage] = useState(1);
  const [currentUsdtPage, setCurrentUsdtPage] = useState(1);
  const [currentMeikaFiatPage, setCurrentMeikaFiatPage] = useState(1);
  const [currentMeikaUsdtPage, setCurrentMeikaUsdtPage] = useState(1);
  const [jumpToPage, setJumpToPage] = useState("");
  const [selectedNormalDbIds, setSelectedNormalDbIds] = useState<Set<string>>(() => new Set());
  const [selectedUsdtDbIds, setSelectedUsdtDbIds] = useState<Set<string>>(() => new Set());
  const [selectedMeikaFiatDbIds, setSelectedMeikaFiatDbIds] = useState<Set<string>>(() => new Set());
  const [selectedMeikaUsdtDbIds, setSelectedMeikaUsdtDbIds] = useState<Set<string>>(() => new Set());
  const [orderBatchDialog, setOrderBatchDialog] = useState<
    null | { mode: "delete" | "cancel"; tab: "normal" | "usdt" | "meika-fiat" | "meika-usdt" }
  >(null);

  // 构建筛选参数（用于服务端分页）
  const orderFilters = useMemo(() => {
    const creatorId = salesPersonFilter && allEmployees.length
      ? allEmployees.find(e => e.real_name === salesPersonFilter)?.id
      : undefined;
    return {
      status: statusFilter !== 'all' ? statusFilter : undefined,
      currency: currencyFilter !== 'all' ? currencyFilter : undefined,
      vendor: vendorFilter || undefined,
      paymentProvider: paymentProviderFilter || undefined,
      cardType: cardTypeFilter || undefined,
      creatorId,
      minProfit: minProfit ? safeNumber(minProfit) : undefined,
      maxProfit: maxProfit ? safeNumber(maxProfit) : undefined,
      // 「全部」使用显式宽日期范围，避免无日期筛选时出现「上月」数据多于「全部」的异常
      dateRange: selectedRange === '全部'
        ? ALL_TIME_DATE_RANGE
        : (dateRange.start && dateRange.end ? { start: dateRange.start, end: dateRange.end } : undefined),
      searchTerm: searchQuery || undefined,
    };
  }, [statusFilter, currencyFilter, vendorFilter, paymentProviderFilter, cardTypeFilter, salesPersonFilter, minProfit, maxProfit, selectedRange, dateRange, searchQuery, allEmployees]);

  const isAnyDialogOpen = !!(editingOrder || editingUsdtOrder);

  // 使用数据库 hooks - 服务端分页；弹窗打开时暂停轮询避免 Select 卡顿
  const { orders, totalCount, isError: isOrdersError, updateOrder, cancelOrder, restoreOrder, deleteOrder, refetch: refetchOrders } = useOrders({
    page: currentPage,
    pageSize: PAGE_SIZE,
    filters: orderFilters,
    paused: isAnyDialogOpen,
    enabled: activeTab === "normal",
  });
  const { orders: usdtOrders, totalCount: usdtTotalCount, isError: isUsdtOrdersError, cancelOrder: cancelUsdtOrder, restoreOrder: restoreUsdtOrder, deleteOrder: deleteUsdtOrder, refetch: refetchUsdtOrders } = useUsdtOrders({
    page: currentUsdtPage,
    pageSize: PAGE_SIZE,
    filters: orderFilters,
    paused: isAnyDialogOpen,
    enabled: activeTab === "usdt",
  });
  const {
    orders: meikaFiatOrders,
    totalCount: meikaFiatTotalCount,
    isError: isMeikaFiatError,
    cancelOrder: cancelMeikaFiatOrder,
    restoreOrder: restoreMeikaFiatOrder,
    deleteOrder: deleteMeikaFiatOrder,
    refetch: refetchMeikaFiatOrders,
  } = useMeikaOrders({
    page: currentMeikaFiatPage,
    pageSize: PAGE_SIZE,
    filters: orderFilters,
    paused: isAnyDialogOpen,
    enabled: activeTab === "meika-fiat",
  });
  const {
    orders: meikaUsdtOrders,
    totalCount: meikaUsdtTotalCount,
    isError: isMeikaUsdtError,
    cancelOrder: cancelMeikaUsdtOrder,
    restoreOrder: restoreMeikaUsdtOrder,
    deleteOrder: deleteMeikaUsdtOrder,
    refetch: refetchMeikaUsdtOrders,
  } = useMeikaUsdtOrders({
    page: currentMeikaUsdtPage,
    pageSize: PAGE_SIZE,
    filters: orderFilters,
    paused: isAnyDialogOpen,
    enabled: activeTab === "meika-usdt",
  });

  const { totalProfit: statsTotalProfit, usdtProfit: statsUsdtProfit, totalCardValue: statsTotalCardValue, tradingUsers: statsTradingUsers } = useOrderStats(orderFilters);

  const isAnyDialogOpenRef = useRef(isAnyDialogOpen);
  isAnyDialogOpenRef.current = isAnyDialogOpen;

  // 用 ref 存储 refetch 函数，避免 useEffect 依赖变化导致无限循环
  const refetchOrdersRef = useRef(refetchOrders);
  const refetchUsdtOrdersRef = useRef(refetchUsdtOrders);
  const refetchMeikaFiatOrdersRef = useRef(refetchMeikaFiatOrders);
  const refetchMeikaUsdtOrdersRef = useRef(refetchMeikaUsdtOrders);
  refetchOrdersRef.current = refetchOrders;
  refetchUsdtOrdersRef.current = refetchUsdtOrders;
  refetchMeikaFiatOrdersRef.current = refetchMeikaFiatOrders;
  refetchMeikaUsdtOrdersRef.current = refetchMeikaUsdtOrders;

  const cancelOrderRef = useRef(cancelOrder);
  const deleteOrderRef = useRef(deleteOrder);
  const cancelUsdtOrderRef = useRef(cancelUsdtOrder);
  const deleteUsdtOrderRef = useRef(deleteUsdtOrder);
  const deleteMeikaFiatOrderRef = useRef(deleteMeikaFiatOrder);
  const cancelMeikaFiatOrderRef = useRef(cancelMeikaFiatOrder);
  const deleteMeikaUsdtOrderRef = useRef(deleteMeikaUsdtOrder);
  const cancelMeikaUsdtOrderRef = useRef(cancelMeikaUsdtOrder);
  cancelOrderRef.current = cancelOrder;
  deleteOrderRef.current = deleteOrder;
  cancelUsdtOrderRef.current = cancelUsdtOrder;
  deleteUsdtOrderRef.current = deleteUsdtOrder;
  deleteMeikaFiatOrderRef.current = deleteMeikaFiatOrder;
  cancelMeikaFiatOrderRef.current = cancelMeikaFiatOrder;
  deleteMeikaUsdtOrderRef.current = deleteMeikaUsdtOrder;
  cancelMeikaUsdtOrderRef.current = cancelMeikaUsdtOrder;

  // 右下角商城兑换通知「前往订单」：?tab=mall&highlightMall=<redemptionId>
  // 审核中心「积分兑换待审核」：?tab=mall&mallStatus=pending
  useEffect(() => {
    const tab = searchParams.get("tab");
    const raw = searchParams.get("highlightMall");
    const ms = searchParams.get("mallStatus");
    if (tab !== "mall" && !raw && !ms) return;
    if (tab === "mall") setActiveTab("mall");
    if (raw) {
      try {
        setMallHighlightId(decodeURIComponent(raw).trim() || null);
      } catch {
        setMallHighlightId(String(raw).trim() || null);
      }
    }
    if (ms === "pending" || ms === "completed" || ms === "rejected" || ms === "all") {
      setMallStatusFilter(ms);
      setActiveTab("mall");
    }
    setMallOrdersRefreshNonce((n) => n + 1);
    const next = new URLSearchParams(searchParams);
    next.delete("tab");
    next.delete("highlightMall");
    next.delete("mallStatus");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (!mallHighlightId) return;
    const timer = window.setTimeout(() => setMallHighlightId(null), 6000);
    return () => window.clearTimeout(timer);
  }, [mallHighlightId]);

  // 加载商家管理数据 + 检查总管理员身份
  useEffect(() => {
    // 加载员工列表用于销售员筛选（按租户过滤）
    getActiveEmployees(effectiveTenantId).then(employees => {
      setEmployeeNames(employees.map(e => e.real_name));
      setAllEmployees(employees);
    });
    
    // 检查当前用户是否为总管理员
    if (currentEmployee?.id) {
      getEmployees().then(employees => {
        const emp = employees.find(e => e.id === currentEmployee.id);
        setIsSuperAdmin(
          emp?.is_super_admin === true || currentEmployee.is_platform_super_admin === true,
        );
      });
    } else {
      setIsSuperAdmin(currentEmployee?.is_platform_super_admin === true);
    }
    
    // 从数据库加载商家管理数据
    const loadMerchantData = async () => {
      const [cardsResult, vendorsResult, providersResult] = await Promise.all([
        fetchMerchantCards(),
        fetchMerchantVendors(),
        fetchMerchantPaymentProviders(),
      ]);

      setCardsList(cardsResult.filter((row) => row.status === "active").map((row) => ({ id: row.id, name: row.name })));
      setVendorsList(vendorsResult.filter((row) => row.status === "active").map((row) => ({ id: row.id, name: row.name })));
      setPaymentProvidersList(providersResult.filter((row) => row.status === "active").map((row) => ({ id: row.id, name: row.name })));
    };
    
    loadMerchantData();
    
    // 检查是否有从活动数据页面传来的搜索信息
    const searchMemberCode = sessionStorage.getItem("orderSearchMemberCode");
    const searchTab = sessionStorage.getItem("orderSearchTab");
    const searchPhone = sessionStorage.getItem("orderSearchPhone");
    
    if (searchMemberCode) {
      setSearchTerm(searchMemberCode);
      sessionStorage.removeItem("orderSearchMemberCode");
    } else if (searchPhone) {
      setSearchTerm(searchPhone);
      sessionStorage.removeItem("orderSearchPhone");
    }
    
    if (searchTab) {
      setActiveTab(searchTab);
      sessionStorage.removeItem("orderSearchTab");
    }
    
    // Debounced refresh handler - consolidates all related entity changes
    let refreshTimeoutId: NodeJS.Timeout | null = null;
    const debouncedRefresh = (refreshMerchantData = false) => {
      if (refreshTimeoutId) {
        clearTimeout(refreshTimeoutId);
      }
      refreshTimeoutId = setTimeout(() => {
        // Skip refresh if user is actively typing
        if (isUserTyping()) {
          // Retry after a short delay
          debouncedRefresh(refreshMerchantData);
          return;
        }
        if (refreshMerchantData) {
          loadMerchantData();
        }
        refetchOrdersRef.current();
        refetchUsdtOrdersRef.current();
        refetchMeikaFiatOrdersRef.current();
        refetchMeikaUsdtOrdersRef.current();
        refreshTimeoutId = null;
      }, 300); // 300ms debounce
    };
    
    const auxPollTimer = setInterval(() => {
      if (isUserTyping() || isAnyDialogOpenRef.current) return;
      getActiveEmployees(effectiveTenantId).then((employees) => {
        setEmployeeNames(employees.map((e) => e.real_name));
        setAllEmployees(employees);
      });
      loadMerchantData();
    }, 30000);
    
    return () => {
      clearInterval(auxPollTimer);
      if (refreshTimeoutId) {
        clearTimeout(refreshTimeoutId);
      }
    };
  }, [effectiveTenantId]); // eslint-disable-line react-hooks/exhaustive-deps

  // 筛选下拉选项：使用商家管理数据（服务端分页后不从订单推导）
  const uniqueSalesPersons = useMemo(() => [...employeeNames].sort(), [employeeNames]);

  // 处理日期范围变化
  const handleDateRangeChange = (range: TimeRangeType, start?: Date, end?: Date) => {
    setSelectedRange(range);
    if (range === "自定义" && start && end) {
      setDateRange(getTimeRangeDates(range, start, end));
    } else {
      setDateRange(getTimeRangeDates(range));
    }
  };

  // 服务端分页：orders/usdtOrders/meika* 已是筛选后的当前页数据
  const filteredOrders = orders;
  const filteredUsdtOrders = usdtOrders;

  // 重置筛选
  const resetFilters = () => {
    setSearchDraft("");
    setSearchQuery("");
    setStatusFilter("all");
    setCurrencyFilter("all");
    setVendorFilter("");
    setPaymentProviderFilter("");
    setCardTypeFilter("");
    setSalesPersonFilter("");
    setMinProfit("");
    setMaxProfit("");
    setSelectedRange("本月");
    setDateRange(getTimeRangeDates("本月"));
  };

  // 统计信息：总条数来自分页，利润/卡值/交易用户来自全量汇总（useOrderStats）
  const stats = useMemo(() => ({
    totalOrders: totalCount + usdtTotalCount,
    totalProfit: statsTotalProfit,
    usdtProfit: statsUsdtProfit,
    totalCardValue: statsTotalCardValue,
    tradingUsers: statsTradingUsers,
  }), [totalCount, usdtTotalCount, statsTotalProfit, statsUsdtProfit, statsTotalCardValue, statsTradingUsers]);

  const orderKpiItems = useMemo(
    () => [
      {
        label: t("列表条数（当前模式）", "Rows (current mode)"),
        value: String(
          activeTab === "usdt"
            ? usdtTotalCount
            : activeTab === "meika-fiat"
              ? meikaFiatTotalCount
              : activeTab === "meika-usdt"
                ? meikaUsdtTotalCount
                : totalCount,
        ),
        change:
          activeTab === "usdt"
            ? "USDT"
            : activeTab === "meika-fiat"
              ? t("美卡专区（赛奈）", "Meika · NGN/GHS")
              : activeTab === "meika-usdt"
                ? t("美卡专区 USDT", "Meika · USDT")
                : t("奈拉/赛地", "NGN/GHS"),
        tone: "neutral" as const,
      },
      {
        label: t("交易用户", "Trading users"),
        value: String(stats.tradingUsers ?? 0),
      },
      {
        label: t("卡值总和", "Total card value"),
        value: `¥${(stats.totalCardValue ?? 0).toLocaleString()}`,
      },
      {
        label: t("利润总和（人）", "Total profit (NGN)"),
        value: `¥${(stats.totalProfit ?? 0).toLocaleString()}`,
        tone: "positive" as const,
      },
      {
        label: t("利润总和USDT", "Total profit (USDT)"),
        value: `$${(stats.usdtProfit ?? 0).toLocaleString()}`,
        tone: "positive" as const,
      },
    ],
    [activeTab, totalCount, usdtTotalCount, meikaFiatTotalCount, meikaUsdtTotalCount, stats, t],
  );

  // 排序功能 - 普通订单
  const { sortedData: sortedOrders, sortConfig: orderSortConfig, requestSort: requestOrderSort } = useSortableData(filteredOrders);
  
  // 排序功能 - USDT订单
  const { sortedData: sortedUsdtOrders, sortConfig: usdtSortConfig, requestSort: requestUsdtSort } = useSortableData(filteredUsdtOrders);

  const { sortedData: sortedMeikaFiatOrders, sortConfig: meikaFiatSortConfig, requestSort: requestMeikaFiatSort } =
    useSortableData(meikaFiatOrders);
  const { sortedData: sortedMeikaUsdtOrders, sortConfig: meikaUsdtSortConfig, requestSort: requestMeikaUsdtSort } =
    useSortableData(meikaUsdtOrders);

  // 分页计算 - 服务端分页，每页50条
  const totalPages = useMemo(() => Math.max(1, Math.ceil(totalCount / PAGE_SIZE)), [totalCount]);
  const totalUsdtPages = useMemo(() => Math.max(1, Math.ceil(usdtTotalCount / PAGE_SIZE)), [usdtTotalCount]);
  const totalMeikaFiatPages = useMemo(() => Math.max(1, Math.ceil(meikaFiatTotalCount / PAGE_SIZE)), [meikaFiatTotalCount]);
  const totalMeikaUsdtPages = useMemo(() => Math.max(1, Math.ceil(meikaUsdtTotalCount / PAGE_SIZE)), [meikaUsdtTotalCount]);
  const paginatedOrders = sortedOrders;
  const paginatedUsdtOrders = sortedUsdtOrders;
  const paginatedMeikaFiatOrders = sortedMeikaFiatOrders;
  const paginatedMeikaUsdtOrders = sortedMeikaUsdtOrders;

  useEffect(() => {
    setSelectedNormalDbIds(new Set());
    setSelectedUsdtDbIds(new Set());
    setSelectedMeikaFiatDbIds(new Set());
    setSelectedMeikaUsdtDbIds(new Set());
  }, [activeTab]);

  const normalBatchCancelCount = useMemo(
    () =>
      paginatedOrders.filter((o) => selectedNormalDbIds.has(o.dbId) && o.status === "completed").length,
    [paginatedOrders, selectedNormalDbIds],
  );

  const usdtBatchCancelCount = useMemo(
    () =>
      paginatedUsdtOrders.filter((o) => selectedUsdtDbIds.has(o.dbId) && o.status === "completed").length,
    [paginatedUsdtOrders, selectedUsdtDbIds],
  );

  const meikaFiatBatchCancelCount = useMemo(
    () =>
      paginatedMeikaFiatOrders.filter((o) => selectedMeikaFiatDbIds.has(o.dbId) && o.status === "completed").length,
    [paginatedMeikaFiatOrders, selectedMeikaFiatDbIds],
  );

  const meikaUsdtBatchCancelCount = useMemo(
    () =>
      paginatedMeikaUsdtOrders.filter((o) => selectedMeikaUsdtDbIds.has(o.dbId) && o.status === "completed").length,
    [paginatedMeikaUsdtOrders, selectedMeikaUsdtDbIds],
  );

  // 重置页码当筛选变化时
  useEffect(() => {
    setCurrentPage(1);
    setCurrentUsdtPage(1);
    setCurrentMeikaFiatPage(1);
    setCurrentMeikaUsdtPage(1);
  }, [orderFilters]);

  // 跳转到指定页
  const handleJumpToPage = (target: "normal" | "usdt" | "meika-fiat" | "meika-usdt") => {
    const page = parseInt(jumpToPage);
    const maxPage =
      target === "usdt"
        ? totalUsdtPages
        : target === "meika-fiat"
          ? totalMeikaFiatPages
          : target === "meika-usdt"
            ? totalMeikaUsdtPages
            : totalPages;
    if (!isNaN(page) && page >= 1 && page <= maxPage) {
      if (target === "usdt") setCurrentUsdtPage(page);
      else if (target === "meika-fiat") setCurrentMeikaFiatPage(page);
      else if (target === "meika-usdt") setCurrentMeikaUsdtPage(page);
      else setCurrentPage(page);
      setJumpToPage("");
    }
  };

  const handleRefresh = async () => {
    await Promise.all([
      refetchOrders(),
      refetchUsdtOrders(),
      refetchMeikaFiatOrders(),
      refetchMeikaUsdtOrders(),
    ]);
    setMallOrdersRefreshNonce((n) => n + 1);
    notify.success(t("订单已刷新", "Orders refreshed"));
  };

  // Normal order handlers
  const handleEdit = (order: Order) => {
    setOriginalOrder({ ...order }); // 保存原始订单
    setEditingOrder({ ...order });
    setIsEditDialogOpen(true);
  };

// 编辑提交状态
  const [isEditSubmitting, setIsEditSubmitting] = useState(false);
  const [isUsdtEditSubmitting, setIsUsdtEditSubmitting] = useState(false);

  useEffect(() => {
    if (!isEditDialogOpen || !editingOrder || !originalOrder || isAdmin) {
      setNormalOrderPreferSubmitReview(false);
      return;
    }
    const changes = computeNormalOrderFieldChanges(editingOrder, originalOrder, isSuperAdmin);
    if (changes.length === 0) {
      setNormalOrderPreferSubmitReview(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      for (const c of changes) {
        if (await checkNeedsApproval("order", c.fieldKey)) {
          if (!cancelled) setNormalOrderPreferSubmitReview(true);
          return;
        }
      }
      if (!cancelled) setNormalOrderPreferSubmitReview(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [isEditDialogOpen, editingOrder, originalOrder, isAdmin, isSuperAdmin, checkNeedsApproval]);

  useEffect(() => {
    if (!isUsdtEditDialogOpen || !editingUsdtOrder || !originalUsdtOrder || isAdmin) {
      setUsdtOrderPreferSubmitReview(false);
      return;
    }
    const changes = computeUsdtOrderFieldChanges(editingUsdtOrder, originalUsdtOrder, isSuperAdmin);
    if (changes.length === 0) {
      setUsdtOrderPreferSubmitReview(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      for (const c of changes) {
        if (await checkNeedsApproval("order", c.fieldKey)) {
          if (!cancelled) setUsdtOrderPreferSubmitReview(true);
          return;
        }
      }
      if (!cancelled) setUsdtOrderPreferSubmitReview(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [isUsdtEditDialogOpen, editingUsdtOrder, originalUsdtOrder, isAdmin, isSuperAdmin, checkNeedsApproval]);

  const handleSaveEdit = async () => {
    if (!editingOrder || !originalOrder || isEditSubmitting) return;
    
    setIsEditSubmitting(true);
    try {
    const changes = computeNormalOrderFieldChanges(editingOrder, originalOrder, isSuperAdmin);
    
    if (changes.length === 0) {
      notify.info(t("没有检测到修改", "No changes detected"));
      setIsEditDialogOpen(false);
      setEditingOrder(null);
      setOriginalOrder(null);
      return;
    }
    
    // 构建更新对象 - 包含所有可编辑字段，并重新计算所有关联值
    const buildUpdates = () => {
      const currency = editingOrder.demandCurrency || 'NGN';
      
      // 使用统一计算公式重新计算所有派生值
      // 公式：
      // - 卡价值 = 卡片面值 × 卡片汇率
      // - 代付价值 = (实付外币 ÷ 外币汇率) + 手续费 (NGN) 或 (实付外币 × 外币汇率) + 手续费 (GHS)
      // - 利润 = 卡价值 - 代付价值
      // - 利润率 = 利润 ÷ 卡价值 × 100%
      const derived = calculateNormalOrderDerivedValues({
        cardValue: editingOrder.cardValue,
        cardRate: editingOrder.cardRate,
        actualPaid: editingOrder.actualPaid,
        foreignRate: editingOrder.foreignRate,
        fee: editingOrder.fee,
        currency: currency,
      });
      
      // 重要：与 mapOrderToDbAsync 一致 — vendor_id / card_merchant_id 为卡商(vendors FK)，代付写入 payment_provider
      const updates: any = {
        order_type: editingOrder.cardType,              // 卡片类型（表代理映射为 card_type）
        card_merchant_id: editingOrder.vendor,
        vendor_id: editingOrder.vendor,
        payment_provider: editingOrder.paymentProvider
          ? String(editingOrder.paymentProvider).trim() || null
          : null,
        card_value: editingOrder.cardValue,
        exchange_rate: editingOrder.cardRate,
        payment_value: derived.paymentValue,            // 自动计算代付价值
        foreign_rate: editingOrder.foreignRate,
        fee: editingOrder.fee,
        currency: currency,
        phone_number: editingOrder.phoneNumber,
        actual_payment: editingOrder.actualPaid,        // 实付外币直接保存
        amount: derived.cardWorth,                      // 此卡价值
        profit_ngn: derived.profit,                     // 利润 = 卡价值 - 代付价值
        profit_rate: derived.profitRate,                // 利润率 = 利润 ÷ 卡价值 × 100%
        remark: editingOrder.remark,
      };
      
      if (isSuperAdmin) {
        const newSid = resolveOrderSalesEmployeeId(editingOrder.salesPerson, allEmployees);
        const oldSid = resolveOrderSalesEmployeeId(originalOrder.salesPerson, allEmployees);
        if (newSid && newSid !== oldSid) {
          updates.sales_user_id = newSid;
          updates.creator_id = newSid;
          updates.account_id = newSid;
        }
      }

      return updates;
    };

    // 检查是否需要提交审核
    // 管理员直接编辑，不需要审核
    if (isAdmin) {
      const updates = buildUpdates();
      
      try {
        await updateOrderUseCase(editingOrder.dbId, updates);
      } catch (error) {
        showServiceErrorToast(error, t, "更新失败", "Update failed");
        return; // 保持弹窗打开，用户可修正后重试
      }
      
      // 记录余额变动日志（订单调整）
      const derived = calculateNormalOrderDerivedValues({
        cardValue: editingOrder.cardValue,
        cardRate: editingOrder.cardRate,
        actualPaid: editingOrder.actualPaid,
        foreignRate: editingOrder.foreignRate,
        fee: editingOrder.fee,
        currency: editingOrder.demandCurrency,
      });
      const oldDerived = calculateNormalOrderDerivedValues({
        cardValue: originalOrder.cardValue,
        cardRate: originalOrder.cardRate,
        actualPaid: originalOrder.actualPaid,
        foreignRate: originalOrder.foreignRate,
        fee: originalOrder.fee,
        currency: originalOrder.demandCurrency,
      });
      
      await logOrderUpdateBalanceChange({
        vendorName: resolveVendorName(editingOrder.vendor) || '',
        providerName: resolveProviderName(editingOrder.paymentProvider) || '',
        oldVendorName: resolveVendorName(originalOrder.vendor) || '',
        oldProviderName: resolveProviderName(originalOrder.paymentProvider) || '',
        oldCardWorth: oldDerived.cardWorth,
        oldPaymentValue: oldDerived.paymentValue,
        oldCurrency: originalOrder.demandCurrency,
        oldForeignRate: originalOrder.foreignRate,
        newCardWorth: derived.cardWorth,
        newPaymentValue: derived.paymentValue,
        newCurrency: editingOrder.demandCurrency,
        newForeignRate: editingOrder.foreignRate,
        orderId: editingOrder.dbId,
        orderNumber: editingOrder.id,
        orderCreatedAt: editingOrder.createdAt,
        operatorId: currentEmployee?.id,
        operatorName: currentEmployee?.real_name,
      });
      
      // 🔧 修复：订单编辑后同步更新 member_activity 的累积金额和利润
      if (editingOrder.phoneNumber) {
        try {
          await syncMemberActivityOnOrderEdit({
            memberId: '',
            phoneNumber: editingOrder.phoneNumber || '',
            oldActualPaid: originalOrder.actualPaid || 0,
            oldProfit: oldDerived.profit || 0,
            oldCurrency: originalOrder.demandCurrency || 'NGN',
            newActualPaid: editingOrder.actualPaid || 0,
            newProfit: derived.profit || 0,
            newCurrency: editingOrder.demandCurrency || 'NGN',
          });
        } catch (err) {
          console.error('[OrderEdit] Member activity sync failed:', err);
        }
      }
      
      // 🔧 积分自动同步：订单编辑后自动调整积分差额
      if (editingOrder.memberCode && editingOrder.phoneNumber) {
        try {
          await adjustPointsOnOrderEdit({
            orderId: editingOrder.dbId,
            memberCode: editingOrder.memberCode,
            phoneNumber: editingOrder.phoneNumber,
            oldActualPayment: parseFloat(String(originalOrder.actualPaid)) || 0,
            oldCurrency: (originalOrder.demandCurrency || 'NGN') as any,
            newActualPayment: parseFloat(String(editingOrder.actualPaid)) || 0,
            newCurrency: (editingOrder.demandCurrency || 'NGN') as any,
            creatorId: currentEmployee?.id,
          });
        } catch (err) {
          console.error('[OrderEdit] Points adjustment failed:', err);
        }
      }
        
      // 记录操作日志
      logOperation(
        'order_management',
        'update',
        editingOrder.dbId,
        originalOrder,
        { ...editingOrder, paymentValue: derived.paymentValue, cardWorth: derived.cardWorth, profit: derived.profit, profitRate: derived.profitRate },
        t(`修改订单: ${editingOrder.id}`, `Edit order: ${editingOrder.id}`)
      );
        
      await refetchOrders();
      queryClient.invalidateQueries({ queryKey: ["meika-fiat-orders"] });
      queryClient.invalidateQueries({ queryKey: ["meika-usdt-orders"] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-trend'] });
      queryClient.invalidateQueries({ queryKey: ['profit-compare-current'] });
      queryClient.invalidateQueries({ queryKey: ['profit-compare-previous'] });
      notifyDataMutation({ table: 'orders', operation: 'UPDATE', source: 'manual' }).catch(console.error);
      notifyDataMutation({ table: 'ledger_transactions', operation: 'UPDATE', source: 'manual' }).catch(console.error);
      notifyDataMutation({ table: 'points_ledger', operation: 'UPDATE', source: 'manual' }).catch(console.error);
      notify.success(t("订单已更新", "Order updated"));
    } else {
      // 非管理员：按字段判断，需审核的只提交审核不直接更新，可直接编辑的才更新
      const result = await submitBatchForApproval({
        module: 'order',
        changes,
        targetId: editingOrder.dbId,
        targetDescription: t(`订单 ${editingOrder.id}`, `Order ${editingOrder.id}`),
        originalData: originalOrder,
      });
      
      if (result.hasRejected) {
        showServiceErrorToast({ message: result.message }, t, "更新失败", "Update failed");
        return;
      }
      
      // 有需审核的字段时，不直接更新订单（避免未审批的修改生效），仅提交审核
      if (result.pendingFields.length > 0) {
        notify.success(result.message);
        setIsEditDialogOpen(false);
        setEditingOrder(null);
        setOriginalOrder(null);
        await refetchOrders();
        queryClient.invalidateQueries({ queryKey: ["meika-fiat-orders"] });
        queryClient.invalidateQueries({ queryKey: ["meika-usdt-orders"] });
        return;
      }
      
      // 全部为可直接编辑的字段，执行完整更新
      const updates = buildUpdates();
      
      try {
        await updateOrderUseCase(editingOrder.dbId, updates);
      } catch (error) {
        showServiceErrorToast(error, t, "更新失败", "Update failed");
        return;
      }
      
      // 记录余额变动日志（订单调整）
      const derived = calculateNormalOrderDerivedValues({
        cardValue: editingOrder.cardValue,
        cardRate: editingOrder.cardRate,
        actualPaid: editingOrder.actualPaid,
        foreignRate: editingOrder.foreignRate,
        fee: editingOrder.fee,
        currency: editingOrder.demandCurrency,
      });
      const oldDerived = calculateNormalOrderDerivedValues({
        cardValue: originalOrder.cardValue,
        cardRate: originalOrder.cardRate,
        actualPaid: originalOrder.actualPaid,
        foreignRate: originalOrder.foreignRate,
        fee: originalOrder.fee,
        currency: originalOrder.demandCurrency,
      });
      
      await logOrderUpdateBalanceChange({
        vendorName: resolveVendorName(editingOrder.vendor) || '',
        providerName: resolveProviderName(editingOrder.paymentProvider) || '',
        oldVendorName: resolveVendorName(originalOrder.vendor) || '',
        oldProviderName: resolveProviderName(originalOrder.paymentProvider) || '',
        oldCardWorth: oldDerived.cardWorth,
        oldPaymentValue: oldDerived.paymentValue,
        oldCurrency: originalOrder.demandCurrency,
        oldForeignRate: originalOrder.foreignRate,
        newCardWorth: derived.cardWorth,
        newPaymentValue: derived.paymentValue,
        newCurrency: editingOrder.demandCurrency,
        newForeignRate: editingOrder.foreignRate,
        orderId: editingOrder.dbId,
        orderNumber: editingOrder.id,
        orderCreatedAt: editingOrder.createdAt,
        operatorId: currentEmployee?.id,
        operatorName: currentEmployee?.real_name,
      });
      
      // 🔧 修复：订单编辑后同步更新 member_activity 的累积金额和利润
      if (editingOrder.phoneNumber) {
        try {
          await syncMemberActivityOnOrderEdit({
            memberId: '',
            phoneNumber: editingOrder.phoneNumber || '',
            oldActualPaid: originalOrder.actualPaid || 0,
            oldProfit: oldDerived.profit || 0,
            oldCurrency: originalOrder.demandCurrency || 'NGN',
            newActualPaid: editingOrder.actualPaid || 0,
            newProfit: derived.profit || 0,
            newCurrency: editingOrder.demandCurrency || 'NGN',
          });
        } catch (err) {
          console.error('[OrderEdit] Member activity sync failed:', err);
        }
      }
      
      // 🔧 积分自动同步：非管理员直接编辑后也自动调整积分差额
      if (editingOrder.memberCode && editingOrder.phoneNumber) {
        try {
          await adjustPointsOnOrderEdit({
            orderId: editingOrder.dbId,
            memberCode: editingOrder.memberCode,
            phoneNumber: editingOrder.phoneNumber,
            oldActualPayment: parseFloat(String(originalOrder.actualPaid)) || 0,
            oldCurrency: (originalOrder.demandCurrency || 'NGN') as any,
            newActualPayment: parseFloat(String(editingOrder.actualPaid)) || 0,
            newCurrency: (editingOrder.demandCurrency || 'NGN') as any,
            creatorId: currentEmployee?.id,
          });
        } catch (err) {
          console.error('[OrderEdit] Points adjustment failed:', err);
        }
      }
        
      // 记录操作日志
      logOperation(
        'order_management',
        'update',
        editingOrder.dbId,
        originalOrder,
        { ...editingOrder, paymentValue: derived.paymentValue, cardWorth: derived.cardWorth, profit: derived.profit, profitRate: derived.profitRate },
        t(`修改订单: ${editingOrder.id}`, `Edit order: ${editingOrder.id}`)
      );
        
      await refetchOrders();
      queryClient.invalidateQueries({ queryKey: ["meika-fiat-orders"] });
      queryClient.invalidateQueries({ queryKey: ["meika-usdt-orders"] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-trend'] });
      queryClient.invalidateQueries({ queryKey: ['profit-compare-current'] });
      queryClient.invalidateQueries({ queryKey: ['profit-compare-previous'] });
      notifyDataMutation({ table: 'orders', operation: 'UPDATE', source: 'manual' }).catch(console.error);
      notifyDataMutation({ table: 'ledger_transactions', operation: 'UPDATE', source: 'manual' }).catch(console.error);
      notifyDataMutation({ table: 'points_ledger', operation: 'UPDATE', source: 'manual' }).catch(console.error);
      notify.success(t("订单已更新", "Order updated"));
    }
    
    setIsEditDialogOpen(false);
    setEditingOrder(null);
    setOriginalOrder(null);
    } finally {
      setIsEditSubmitting(false);
    }
  };

  const handleCancel = async (dbId: string): Promise<boolean> => {
    if (activeTab === "meika-fiat") await cancelMeikaFiatOrder(dbId);
    else await cancelOrder(dbId);
    notify.success(t("订单已取消", "Order cancelled"));
    return true;
  };

  // 恢复订单确认对话框状态
  const [restoreOrderId, setRestoreOrderId] = useState<string | null>(null);
  const [restoreUsdtOrderId, setRestoreUsdtOrderId] = useState<string | null>(null);

  const handleRestore = (dbId: string) => {
    setRestoreOrderId(dbId);
  };

  const confirmRestore = async () => {
    if (restoreOrderId) {
      if (activeTab === "meika-fiat") await restoreMeikaFiatOrder(restoreOrderId);
      else await restoreOrder(restoreOrderId);
      notify.success(t("订单已恢复为已完成", "Order restored to completed"));
      setRestoreOrderId(null);
    }
  };

  const handleDelete = async (dbId: string): Promise<boolean> => {
    const success =
      activeTab === "meika-fiat" ? await deleteMeikaFiatOrder(dbId) : await deleteOrder(dbId);
    if (success) {
      notify.success(t("订单已删除", "Order deleted"));
    }
    return !!success;
  };

  // USDT order handlers
  const handleEditUsdt = (order: UsdtOrder) => {
    setOriginalUsdtOrder({ ...order }); // 保存原始订单
    setEditingUsdtOrder({ ...order });
    setUsdtRateInput(order.usdtRate.toString()); // 初始化字符串输入状态
    setIsUsdtEditDialogOpen(true);
  };

  const handleSaveUsdtEdit = async () => {
    if (!editingUsdtOrder || !originalUsdtOrder || isUsdtEditSubmitting) return;
    
    setIsUsdtEditSubmitting(true);
    try {
    const changes = computeUsdtOrderFieldChanges(editingUsdtOrder, originalUsdtOrder, isSuperAdmin);
    
    if (changes.length === 0) {
      notify.info(t("没有检测到修改", "No changes detected"));
      setIsUsdtEditDialogOpen(false);
      setEditingUsdtOrder(null);
      setOriginalUsdtOrder(null);
      return;
    }
    
    // 构建更新对象 - 包含所有可编辑字段
    const buildUpdates = () => {
      // 确保 USDT 汇率保留4位小数
      const usdtRateValue = Number((editingUsdtOrder.usdtRate || 0).toFixed(4));
      
      // 使用统一计算公式重新计算所有派生值
      // 公式：
      // - 卡价值 = 卡片面值 × 卡片汇率
      // - 总价值USDT = 卡价值 ÷ USDT汇率
      // - 代付价值 = 实付USDT + 手续费USDT
      // - 利润 = 总价值USDT - 代付价值
      // - 利润率 = 利润 ÷ 总价值USDT × 100%
      const derived = calculateUsdtOrderDerivedValues({
        cardValue: editingUsdtOrder.cardValue,
        cardRate: editingUsdtOrder.cardRate,
        usdtRate: usdtRateValue,
        actualPaidUsdt: editingUsdtOrder.actualPaidUsdt,
        feeUsdt: editingUsdtOrder.feeUsdt,
      });
      
      // 重要：与 mapOrderToDbAsync 一致 — vendor_id / card_merchant_id 为卡商，代付写入 payment_provider
      const updates: any = {
        order_type: editingUsdtOrder.cardType,
        card_merchant_id: editingUsdtOrder.vendor,
        vendor_id: editingUsdtOrder.vendor,
        payment_provider: editingUsdtOrder.paymentProvider
          ? String(editingUsdtOrder.paymentProvider).trim() || null
          : null,
        card_value: editingUsdtOrder.cardValue,
        exchange_rate: editingUsdtOrder.cardRate,
        foreign_rate: usdtRateValue,                    // USDT汇率，保留4位小数
        actual_payment: editingUsdtOrder.actualPaidUsdt,
        phone_number: editingUsdtOrder.phoneNumber,
        fee: editingUsdtOrder.feeUsdt,
        payment_value: derived.paymentValue,            // 代付价值 = 实付USDT + 手续费
        amount: derived.cardWorth,                      // 此卡价值
        profit_usdt: derived.profit,                    // 利润 = 总价值USDT - 代付价值
        profit_rate: derived.profitRate,                // 利润率 = 利润 ÷ 总价值USDT × 100%
        remark: editingUsdtOrder.remark,
      };
      
      if (isSuperAdmin) {
        const newSid = resolveOrderSalesEmployeeId(editingUsdtOrder.salesPerson, allEmployees);
        const oldSid = resolveOrderSalesEmployeeId(originalUsdtOrder.salesPerson, allEmployees);
        if (newSid && newSid !== oldSid) {
          updates.sales_user_id = newSid;
          updates.creator_id = newSid;
          updates.account_id = newSid;
        }
      }

      return updates;
    };

    // 检查是否需要提交审核
    // 管理员直接编辑，不需要审核
    if (isAdmin) {
      const updates = buildUpdates();

      try {
        await updateOrderUseCase(editingUsdtOrder.dbId, updates);
      } catch (error) {
        showServiceErrorToast(error, t, "更新失败", "Update failed");
        return; // 保持弹窗打开，用户可修正后重试
      }
      
      // 记录余额变动日志（USDT订单调整）
      const usdtRateValue = Number((editingUsdtOrder.usdtRate || 0).toFixed(4));
      const oldUsdtRate = Number((originalUsdtOrder.usdtRate || 0).toFixed(4));
      
      const derived = calculateUsdtOrderDerivedValues({
        cardValue: editingUsdtOrder.cardValue,
        cardRate: editingUsdtOrder.cardRate,
        usdtRate: usdtRateValue,
        actualPaidUsdt: editingUsdtOrder.actualPaidUsdt,
        feeUsdt: editingUsdtOrder.feeUsdt,
      });
      const oldDerived = calculateUsdtOrderDerivedValues({
        cardValue: originalUsdtOrder.cardValue,
        cardRate: originalUsdtOrder.cardRate,
        usdtRate: oldUsdtRate,
        actualPaidUsdt: originalUsdtOrder.actualPaidUsdt,
        feeUsdt: originalUsdtOrder.feeUsdt,
      });
      
      await logOrderUpdateBalanceChange({
        vendorName: resolveVendorName(editingUsdtOrder.vendor) || '',
        providerName: resolveProviderName(editingUsdtOrder.paymentProvider) || '',
        oldVendorName: resolveVendorName(originalUsdtOrder.vendor) || '',
        oldProviderName: resolveProviderName(originalUsdtOrder.paymentProvider) || '',
        oldCardWorth: oldDerived.cardWorth,
        oldPaymentValue: oldDerived.paymentValue,
        oldCurrency: 'USDT',
        oldForeignRate: oldUsdtRate,
        newCardWorth: derived.cardWorth,
        newPaymentValue: derived.paymentValue,
        newCurrency: 'USDT',
        newForeignRate: usdtRateValue,
        orderId: editingUsdtOrder.dbId,
        orderNumber: editingUsdtOrder.id,
        orderCreatedAt: editingUsdtOrder.createdAt,
        operatorId: currentEmployee?.id,
        operatorName: currentEmployee?.real_name,
      });
      
      // 🔧 积分自动同步：USDT订单编辑后自动调整积分差额
      if (editingUsdtOrder.memberCode && editingUsdtOrder.phoneNumber) {
        try {
          await adjustPointsOnOrderEdit({
            orderId: editingUsdtOrder.dbId,
            memberCode: editingUsdtOrder.memberCode,
            phoneNumber: editingUsdtOrder.phoneNumber,
            oldActualPayment: parseFloat(String(originalUsdtOrder.actualPaidUsdt)) || 0,
            oldCurrency: 'USDT',
            newActualPayment: parseFloat(String(editingUsdtOrder.actualPaidUsdt)) || 0,
            newCurrency: 'USDT',
            creatorId: currentEmployee?.id,
          });
        } catch (err) {
          console.error('[OrderEdit] USDT Points adjustment failed:', err);
        }
      }
      
      // 记录操作日志
      logOperation(
        'order_management',
        'update',
        editingUsdtOrder.dbId,
        originalUsdtOrder,
        { ...editingUsdtOrder, paymentValue: derived.paymentValue, cardWorth: derived.cardWorth, profit: derived.profit, profitRate: derived.profitRate },
        t(`修改USDT订单: ${editingUsdtOrder.id}`, `Edit USDT order: ${editingUsdtOrder.id}`)
      );
        
      await refetchUsdtOrders();
      queryClient.invalidateQueries({ queryKey: ["meika-fiat-orders"] });
      queryClient.invalidateQueries({ queryKey: ["meika-usdt-orders"] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-trend'] });
      queryClient.invalidateQueries({ queryKey: ['profit-compare-current'] });
      queryClient.invalidateQueries({ queryKey: ['profit-compare-previous'] });
      notifyDataMutation({ table: 'orders', operation: 'UPDATE', source: 'manual' }).catch(console.error);
      notifyDataMutation({ table: 'ledger_transactions', operation: 'UPDATE', source: 'manual' }).catch(console.error);
      notifyDataMutation({ table: 'points_ledger', operation: 'UPDATE', source: 'manual' }).catch(console.error);
      notify.success(t("USDT订单已更新", "USDT order updated"));
    } else {
      // 非管理员：按字段判断，需审核的只提交审核不直接更新
      const result = await submitBatchForApproval({
        module: 'order',
        changes,
        targetId: editingUsdtOrder.dbId,
        targetDescription: t(`USDT订单 ${editingUsdtOrder.id}`, `USDT Order ${editingUsdtOrder.id}`),
        originalData: originalUsdtOrder,
      });
      
      if (result.hasRejected) {
        showServiceErrorToast({ message: result.message }, t, "更新失败", "Update failed");
        return;
      }
      
      // 有需审核的字段时，不直接更新订单
      if (result.pendingFields.length > 0) {
        notify.success(result.message);
        setIsUsdtEditDialogOpen(false);
        setEditingUsdtOrder(null);
        setOriginalUsdtOrder(null);
        await refetchUsdtOrders();
        queryClient.invalidateQueries({ queryKey: ["meika-fiat-orders"] });
        queryClient.invalidateQueries({ queryKey: ["meika-usdt-orders"] });
        return;
      }
      
      // 全部为可直接编辑的字段，执行更新
      const updates = buildUpdates();
      
      try {
        await updateOrderUseCase(editingUsdtOrder.dbId, updates);
      } catch (error) {
        showServiceErrorToast(error, t, "更新失败", "Update failed");
        return;
      }
      
      // 记录余额变动日志（USDT订单调整）
      const usdtRateValue = Number((editingUsdtOrder.usdtRate || 0).toFixed(4));
      const oldUsdtRate = Number((originalUsdtOrder.usdtRate || 0).toFixed(4));
      
      const derived = calculateUsdtOrderDerivedValues({
        cardValue: editingUsdtOrder.cardValue,
        cardRate: editingUsdtOrder.cardRate,
        usdtRate: usdtRateValue,
        actualPaidUsdt: editingUsdtOrder.actualPaidUsdt,
        feeUsdt: editingUsdtOrder.feeUsdt,
      });
      const oldDerived = calculateUsdtOrderDerivedValues({
        cardValue: originalUsdtOrder.cardValue,
        cardRate: originalUsdtOrder.cardRate,
        usdtRate: oldUsdtRate,
        actualPaidUsdt: originalUsdtOrder.actualPaidUsdt,
        feeUsdt: originalUsdtOrder.feeUsdt,
      });
      
      await logOrderUpdateBalanceChange({
        vendorName: resolveVendorName(editingUsdtOrder.vendor) || '',
        providerName: resolveProviderName(editingUsdtOrder.paymentProvider) || '',
        oldVendorName: resolveVendorName(originalUsdtOrder.vendor) || '',
        oldProviderName: resolveProviderName(originalUsdtOrder.paymentProvider) || '',
        oldCardWorth: oldDerived.cardWorth,
        oldPaymentValue: oldDerived.paymentValue,
        oldCurrency: 'USDT',
        oldForeignRate: oldUsdtRate,
        newCardWorth: derived.cardWorth,
        newPaymentValue: derived.paymentValue,
        newCurrency: 'USDT',
        newForeignRate: usdtRateValue,
        orderId: editingUsdtOrder.dbId,
        orderNumber: editingUsdtOrder.id,
        orderCreatedAt: editingUsdtOrder.createdAt,
        operatorId: currentEmployee?.id,
        operatorName: currentEmployee?.real_name,
      });
      
      // 🔧 积分自动同步：非管理员USDT订单编辑后自动调整积分差额
      if (editingUsdtOrder.memberCode && editingUsdtOrder.phoneNumber) {
        try {
          await adjustPointsOnOrderEdit({
            orderId: editingUsdtOrder.dbId,
            memberCode: editingUsdtOrder.memberCode,
            phoneNumber: editingUsdtOrder.phoneNumber,
            oldActualPayment: parseFloat(String(originalUsdtOrder.actualPaidUsdt)) || 0,
            oldCurrency: 'USDT',
            newActualPayment: parseFloat(String(editingUsdtOrder.actualPaidUsdt)) || 0,
            newCurrency: 'USDT',
            creatorId: currentEmployee?.id,
          });
        } catch (err) {
          console.error('[OrderEdit] USDT Points adjustment failed:', err);
        }
      }
      
      // 记录操作日志
      logOperation(
        'order_management',
        'update',
        editingUsdtOrder.dbId,
        originalUsdtOrder,
        { ...editingUsdtOrder, paymentValue: derived.paymentValue, cardWorth: derived.cardWorth, profit: derived.profit, profitRate: derived.profitRate },
        t(`修改USDT订单: ${editingUsdtOrder.id}`, `Edit USDT order: ${editingUsdtOrder.id}`)
      );
        
      await refetchUsdtOrders();
      queryClient.invalidateQueries({ queryKey: ["meika-fiat-orders"] });
      queryClient.invalidateQueries({ queryKey: ["meika-usdt-orders"] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-trend'] });
      queryClient.invalidateQueries({ queryKey: ['profit-compare-current'] });
      queryClient.invalidateQueries({ queryKey: ['profit-compare-previous'] });
      notifyDataMutation({ table: 'orders', operation: 'UPDATE', source: 'manual' }).catch(console.error);
      notifyDataMutation({ table: 'ledger_transactions', operation: 'UPDATE', source: 'manual' }).catch(console.error);
      notifyDataMutation({ table: 'points_ledger', operation: 'UPDATE', source: 'manual' }).catch(console.error);
      notify.success(t("USDT订单已更新", "USDT order updated"));
    }
    
    setIsUsdtEditDialogOpen(false);
    setEditingUsdtOrder(null);
    setOriginalUsdtOrder(null);
    } finally {
      setIsUsdtEditSubmitting(false);
    }
  };

  const handleCancelUsdt = async (dbId: string): Promise<boolean> => {
    if (activeTab === "meika-usdt") await cancelMeikaUsdtOrder(dbId);
    else await cancelUsdtOrder(dbId);
    notify.success(t("USDT订单已取消", "USDT order cancelled"));
    return true;
  };

  const handleRestoreUsdt = (dbId: string) => {
    setRestoreUsdtOrderId(dbId);
  };

  const confirmRestoreUsdt = async () => {
    if (restoreUsdtOrderId) {
      if (activeTab === "meika-usdt") await restoreMeikaUsdtOrder(restoreUsdtOrderId);
      else await restoreUsdtOrder(restoreUsdtOrderId);
      notify.success(t("USDT订单已恢复为已完成", "USDT order restored to completed"));
      setRestoreUsdtOrderId(null);
    }
  };

  const handleDeleteUsdt = async (dbId: string): Promise<boolean> => {
    const success =
      activeTab === "meika-usdt" ? await deleteMeikaUsdtOrder(dbId) : await deleteUsdtOrder(dbId);
    if (success) {
      notify.success(t("USDT订单已删除", "USDT order deleted"));
    }
    return !!success;
  };

  const toggleNormalDbId = (dbId: string) => {
    setSelectedNormalDbIds((prev) => {
      const next = new Set(prev);
      if (next.has(dbId)) next.delete(dbId);
      else next.add(dbId);
      return next;
    });
  };

  const toggleNormalPage = () => {
    const pageIds = paginatedOrders.map((o) => o.dbId);
    setSelectedNormalDbIds((prev) => {
      const allOn = pageIds.length > 0 && pageIds.every((id) => prev.has(id));
      const next = new Set(prev);
      if (allOn) pageIds.forEach((id) => next.delete(id));
      else pageIds.forEach((id) => next.add(id));
      return next;
    });
  };

  const toggleUsdtDbId = (dbId: string) => {
    setSelectedUsdtDbIds((prev) => {
      const next = new Set(prev);
      if (next.has(dbId)) next.delete(dbId);
      else next.add(dbId);
      return next;
    });
  };

  const toggleUsdtPage = () => {
    const pageIds = paginatedUsdtOrders.map((o) => o.dbId);
    setSelectedUsdtDbIds((prev) => {
      const allOn = pageIds.length > 0 && pageIds.every((id) => prev.has(id));
      const next = new Set(prev);
      if (allOn) pageIds.forEach((id) => next.delete(id));
      else pageIds.forEach((id) => next.add(id));
      return next;
    });
  };

  const toggleMeikaFiatDbId = (dbId: string) => {
    setSelectedMeikaFiatDbIds((prev) => {
      const next = new Set(prev);
      if (next.has(dbId)) next.delete(dbId);
      else next.add(dbId);
      return next;
    });
  };

  const toggleMeikaFiatPage = () => {
    const pageIds = paginatedMeikaFiatOrders.map((o) => o.dbId);
    setSelectedMeikaFiatDbIds((prev) => {
      const allOn = pageIds.length > 0 && pageIds.every((id) => prev.has(id));
      const next = new Set(prev);
      if (allOn) pageIds.forEach((id) => next.delete(id));
      else pageIds.forEach((id) => next.add(id));
      return next;
    });
  };

  const toggleMeikaUsdtDbId = (dbId: string) => {
    setSelectedMeikaUsdtDbIds((prev) => {
      const next = new Set(prev);
      if (next.has(dbId)) next.delete(dbId);
      else next.add(dbId);
      return next;
    });
  };

  const toggleMeikaUsdtPage = () => {
    const pageIds = paginatedMeikaUsdtOrders.map((o) => o.dbId);
    setSelectedMeikaUsdtDbIds((prev) => {
      const allOn = pageIds.length > 0 && pageIds.every((id) => prev.has(id));
      const next = new Set(prev);
      if (allOn) pageIds.forEach((id) => next.delete(id));
      else pageIds.forEach((id) => next.add(id));
      return next;
    });
  };

  const runBatchNormalDelete = async () => {
    if (!orderBatchDialog) return;
    const { tab } = orderBatchDialog;
    setOrderBatchDialog(null);
    const ids = tab === "meika-fiat" ? [...selectedMeikaFiatDbIds] : [...selectedNormalDbIds];
    if (ids.length === 0) return;
    let ok = 0;
    const failedIds = new Set<string>();
    for (const id of ids) {
      const success = tab === "meika-fiat"
        ? await deleteMeikaFiatOrderRef.current(id)
        : await deleteOrderRef.current(id);
      if (success) ok++;
      else failedIds.add(id);
    }
    if (tab === "meika-fiat") setSelectedMeikaFiatDbIds(failedIds);
    else setSelectedNormalDbIds(failedIds);
    if (tab === "meika-fiat") await refetchMeikaFiatOrders();
    else await refetchOrders();
    if (ok > 0) {
      queryClient.invalidateQueries({ queryKey: ["dashboard-trend"] });
      queryClient.invalidateQueries({ queryKey: ["profit-compare-current"] });
      queryClient.invalidateQueries({ queryKey: ["profit-compare-previous"] });
      notifyDataMutation({ table: "orders", operation: "DELETE", source: "manual" }).catch(console.error);
      notifyDataMutation({ table: "ledger_transactions", operation: "UPDATE", source: "manual" }).catch(console.error);
      notifyDataMutation({ table: "points_ledger", operation: "UPDATE", source: "manual" }).catch(console.error);
    }
    if (failedIds.size === 0) {
      notify.success(t(`已删除 ${ok} 条订单`, `Deleted ${ok} order(s)`));
    } else if (ok > 0) {
      notify.warning(t(`已删除 ${ok} 条，${failedIds.size} 条失败（已保留选中）`, `Deleted ${ok}, ${failedIds.size} failed (kept selected)`));
    } else {
      notify.error(t(`删除失败：${failedIds.size} 条均未成功`, `Delete failed: all ${failedIds.size} order(s) failed`));
    }
  };

  const runBatchNormalCancel = async () => {
    if (!orderBatchDialog) return;
    const { tab } = orderBatchDialog;
    setOrderBatchDialog(null);
    const rows = tab === "meika-fiat" ? paginatedMeikaFiatOrders : paginatedOrders;
    const sel = tab === "meika-fiat" ? selectedMeikaFiatDbIds : selectedNormalDbIds;
    const ids = rows.filter((o) => sel.has(o.dbId) && o.status === "completed").map((o) => o.dbId);
    if (ids.length === 0) return;
    let ok = 0;
    const failedIds = new Set<string>();
    for (const id of ids) {
      const success = tab === "meika-fiat"
        ? await cancelMeikaFiatOrderRef.current(id)
        : await cancelOrderRef.current(id);
      if (success) ok++;
      else failedIds.add(id);
    }
    if (tab === "meika-fiat") setSelectedMeikaFiatDbIds(failedIds);
    else setSelectedNormalDbIds(failedIds);
    if (tab === "meika-fiat") await refetchMeikaFiatOrders();
    else await refetchOrders();
    if (ok > 0) {
      queryClient.invalidateQueries({ queryKey: ["dashboard-trend"] });
      queryClient.invalidateQueries({ queryKey: ["profit-compare-current"] });
      queryClient.invalidateQueries({ queryKey: ["profit-compare-previous"] });
      notifyDataMutation({ table: "orders", operation: "UPDATE", source: "manual" }).catch(console.error);
      notifyDataMutation({ table: "ledger_transactions", operation: "UPDATE", source: "manual" }).catch(console.error);
      notifyDataMutation({ table: "points_ledger", operation: "UPDATE", source: "manual" }).catch(console.error);
    }
    if (failedIds.size === 0) {
      notify.success(t(`已取消 ${ok} 条订单`, `Cancelled ${ok} order(s)`));
    } else if (ok > 0) {
      notify.warning(t(`已取消 ${ok} 条，${failedIds.size} 条失败（已保留选中）`, `Cancelled ${ok}, ${failedIds.size} failed (kept selected)`));
    } else {
      notify.error(t(`取消失败：${failedIds.size} 条均未成功`, `Cancel failed: all ${failedIds.size} order(s) failed`));
    }
  };

  const runBatchUsdtDelete = async () => {
    if (!orderBatchDialog) return;
    const { tab } = orderBatchDialog;
    setOrderBatchDialog(null);
    const ids = tab === "meika-usdt" ? [...selectedMeikaUsdtDbIds] : [...selectedUsdtDbIds];
    if (ids.length === 0) return;
    let ok = 0;
    const failedIds = new Set<string>();
    for (const id of ids) {
      const success = tab === "meika-usdt"
        ? await deleteMeikaUsdtOrderRef.current(id)
        : await deleteUsdtOrderRef.current(id);
      if (success) ok++;
      else failedIds.add(id);
    }
    if (tab === "meika-usdt") setSelectedMeikaUsdtDbIds(failedIds);
    else setSelectedUsdtDbIds(failedIds);
    if (tab === "meika-usdt") await refetchMeikaUsdtOrders();
    else await refetchUsdtOrders();
    if (ok > 0) {
      queryClient.invalidateQueries({ queryKey: ["dashboard-trend"] });
      queryClient.invalidateQueries({ queryKey: ["profit-compare-current"] });
      queryClient.invalidateQueries({ queryKey: ["profit-compare-previous"] });
      notifyDataMutation({ table: "orders", operation: "DELETE", source: "manual" }).catch(console.error);
      notifyDataMutation({ table: "ledger_transactions", operation: "UPDATE", source: "manual" }).catch(console.error);
      notifyDataMutation({ table: "points_ledger", operation: "UPDATE", source: "manual" }).catch(console.error);
    }
    if (failedIds.size === 0) {
      notify.success(t(`已删除 ${ok} 条 USDT 订单`, `Deleted ${ok} USDT order(s)`));
    } else if (ok > 0) {
      notify.warning(t(`已删除 ${ok} 条，${failedIds.size} 条失败（已保留选中）`, `Deleted ${ok}, ${failedIds.size} failed (kept selected)`));
    } else {
      notify.error(t(`删除失败：${failedIds.size} 条均未成功`, `Delete failed: all ${failedIds.size} USDT order(s) failed`));
    }
  };

  const runBatchUsdtCancel = async () => {
    if (!orderBatchDialog) return;
    const { tab } = orderBatchDialog;
    setOrderBatchDialog(null);
    const rows = tab === "meika-usdt" ? paginatedMeikaUsdtOrders : paginatedUsdtOrders;
    const sel = tab === "meika-usdt" ? selectedMeikaUsdtDbIds : selectedUsdtDbIds;
    const ids = rows.filter((o) => sel.has(o.dbId) && o.status === "completed").map((o) => o.dbId);
    if (ids.length === 0) return;
    let ok = 0;
    const failedIds = new Set<string>();
    for (const id of ids) {
      const success = tab === "meika-usdt"
        ? await cancelMeikaUsdtOrderRef.current(id)
        : await cancelUsdtOrderRef.current(id);
      if (success) ok++;
      else failedIds.add(id);
    }
    if (tab === "meika-usdt") setSelectedMeikaUsdtDbIds(failedIds);
    else setSelectedUsdtDbIds(failedIds);
    if (tab === "meika-usdt") await refetchMeikaUsdtOrders();
    else await refetchUsdtOrders();
    if (ok > 0) {
      queryClient.invalidateQueries({ queryKey: ["dashboard-trend"] });
      queryClient.invalidateQueries({ queryKey: ["profit-compare-current"] });
      queryClient.invalidateQueries({ queryKey: ["profit-compare-previous"] });
      notifyDataMutation({ table: "orders", operation: "UPDATE", source: "manual" }).catch(console.error);
      notifyDataMutation({ table: "ledger_transactions", operation: "UPDATE", source: "manual" }).catch(console.error);
      notifyDataMutation({ table: "points_ledger", operation: "UPDATE", source: "manual" }).catch(console.error);
    }
    if (failedIds.size === 0) {
      notify.success(t(`已取消 ${ok} 条 USDT 订单`, `Cancelled ${ok} USDT order(s)`));
    } else if (ok > 0) {
      notify.warning(t(`已取消 ${ok} 条，${failedIds.size} 条失败（已保留选中）`, `Cancelled ${ok}, ${failedIds.size} failed (kept selected)`));
    } else {
      notify.error(t(`取消失败：${failedIds.size} 条均未成功`, `Cancel failed: all ${failedIds.size} USDT order(s) failed`));
    }
  };

  const confirmOrderBatchAction = () => {
    if (!orderBatchDialog) return;
    const { mode, tab } = orderBatchDialog;
    if (tab === "normal" || tab === "meika-fiat") {
      void (mode === "delete" ? runBatchNormalDelete() : runBatchNormalCancel());
    } else {
      void (mode === "delete" ? runBatchUsdtDelete() : runBatchUsdtCancel());
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        description={t(
          "查看与处理赛地/奈拉、USDT、美卡专区（汇率页美卡专区台位提交）与积分商城兑换订单，支持筛选、导入导出与列显示设置。",
          "View and manage NGN/GHS, USDT, Meika-zone orders (from Exchange Rate · US Card Zone), mall redemptions, filters, import/export, and columns.",
        )}
        actions={
          !isMobile ? (
            <PageActions>
              <Button variant="outline" size="sm" onClick={handleRefresh}>
                <RefreshCw className="h-4 w-4 sm:mr-1" />
                <span className="hidden sm:inline">{t("刷新", "Refresh")}</span>
              </Button>
              {activeTab !== "mall" ? (
                <>
                  <ColumnVisibilityDropdown
                    columns={activeTab === "usdt" || activeTab === "meika-usdt" ? usdtOrderColumns : normalOrderColumns}
                    visibleColumns={
                      activeTab === "usdt" || activeTab === "meika-usdt"
                        ? usdtColumnVisibility.visibleColumns
                        : normalColumnVisibility.visibleColumns
                    }
                    onToggleColumn={
                      activeTab === "usdt" || activeTab === "meika-usdt"
                        ? usdtColumnVisibility.toggleColumn
                        : normalColumnVisibility.toggleColumn
                    }
                    onReset={
                      activeTab === "usdt" || activeTab === "meika-usdt"
                        ? usdtColumnVisibility.resetToDefault
                        : normalColumnVisibility.resetToDefault
                    }
                  />
                  <TableImportButton
                    tableName="orders"
                    onImportComplete={() => {
                      refetchOrders();
                      refetchUsdtOrders();
                      refetchMeikaFiatOrders();
                      refetchMeikaUsdtOrders();
                      queryClient.invalidateQueries({ queryKey: ["dashboard-trend"] });
                      queryClient.invalidateQueries({ queryKey: ["profit-compare-current"] });
                      queryClient.invalidateQueries({ queryKey: ["profit-compare-previous"] });
                      notifyDataMutation({ table: "orders", operation: "*", source: "manual" }).catch(console.error);
                    }}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      exportConfirm.requestExport(async () => {
                        const r = await exportTableToXLSX("orders", false, {
                          tenantId: effectiveTenantId ?? undefined,
                          useMyTenantRpc: !!(
                            effectiveTenantId &&
                            currentEmployee?.tenant_id &&
                            effectiveTenantId === currentEmployee.tenant_id
                          ),
                        });
                        if (r.success) {
                          notify.success(t("已导出 Excel（.xlsx）", "Exported as Excel (.xlsx)"));
                        } else if (r.error) {
                          notify.error(r.error);
                        }
                      })
                    }
                  >
                    <Download className="h-4 w-4 sm:mr-1" />
                    <span className="hidden sm:inline">{t("导出", "Export")}</span>
                  </Button>
                </>
              ) : null}
            </PageActions>
          ) : undefined
        }
      />

      {activeTab !== "mall" ? <KPIGrid items={orderKpiItems} /> : null}

      <FilterBar>
        <div className={isMobile ? "flex w-full flex-col gap-3" : "flex w-full flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"}>
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-auto shrink-0">
            <TabsList className="flex h-auto min-h-9 flex-wrap gap-1 min-w-0 max-w-full sm:max-w-none">
              <TabsTrigger value="normal" className="px-1.5 text-[10px] sm:px-3 sm:text-xs">
                {isMobile ? t("奈拉/赛地", "Naira/Cedi") : t("赛地 / 奈拉模式", "Cedi / Naira Mode")}
              </TabsTrigger>
              <TabsTrigger value="usdt" className="px-1.5 text-[10px] sm:px-3 sm:text-xs">
                USDT{!isMobile && t(" 模式", " Mode")}
              </TabsTrigger>
              <TabsTrigger value="meika-fiat" className="px-1.5 text-[10px] sm:px-3 sm:text-xs">
                {isMobile ? t("美卡·赛奈", "Meika N/G") : t("美卡专区（赛奈）", "Meika · NGN/GHS")}
              </TabsTrigger>
              <TabsTrigger value="meika-usdt" className="px-1.5 text-[10px] sm:px-3 sm:text-xs">
                {isMobile ? t("美卡·U", "Meika U") : t("美卡专区 USDT", "Meika · USDT")}
              </TabsTrigger>
              <TabsTrigger value="mall" className="px-1.5 text-[10px] sm:px-3 sm:text-xs">
                {isMobile ? t("商城", "Mall") : t("商城订单", "Mall orders")}
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <div className={isMobile ? "flex flex-wrap items-center gap-2" : "flex flex-wrap items-center gap-3"}>
            <div className={isMobile ? "relative min-w-0 flex-1" : "relative"}>
              <Search className="pointer-events-none absolute left-3 top-1/2 z-[1] h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                placeholder={
                  activeTab === "mall"
                    ? t("商品、手机、会员编号…", "Item, phone, member code…")
                    : t("搜索订单...", "Search orders...")
                }
                value={searchDraft}
                data-staff-page-search
                onChange={(e) => setSearchDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    setSearchQuery(searchDraft.trim());
                  }
                }}
                className={isMobile ? "w-full pl-9 pr-9" : "w-64 min-w-[12rem] pl-9 pr-9"}
              />
              {searchDraft ? (
                <button
                  type="button"
                  className="absolute right-2 top-1/2 z-[1] -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  onClick={() => {
                    setSearchDraft("");
                    setSearchQuery("");
                  }}
                  aria-label={t("清空搜索", "Clear search")}
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              ) : null}
            </div>
            {activeTab === "mall" ? (
              <Select value={mallStatusFilter} onValueChange={(v) => setMallStatusFilter(v as typeof mallStatusFilter)}>
                <SelectTrigger className={cn(isMobile ? "h-9 w-full min-w-0" : "h-9 w-[132px] shrink-0", "text-xs")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("全部状态", "All statuses")}</SelectItem>
                  <SelectItem value="pending">{t("待处理", "Pending")}</SelectItem>
                  <SelectItem value="completed">{t("已完成", "Completed")}</SelectItem>
                  <SelectItem value="rejected">{t("已驳回", "Rejected")}</SelectItem>
                </SelectContent>
              </Select>
            ) : null}
            <Button
              variant={showAdvancedFilter ? "secondary" : "outline"}
              size="sm"
              onClick={() => setShowAdvancedFilter(!showAdvancedFilter)}
              className="shrink-0"
            >
              <Filter className="h-4 w-4" />
              {!isMobile && <span className="ml-1">{t("筛选", "Filter")}</span>}
            </Button>
            {isMobile && (
              <Button variant="outline" size="icon" onClick={handleRefresh} className="shrink-0">
                <RefreshCw className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </FilterBar>

      {activeTab === "mall" && showAdvancedFilter ? (
        <p className="text-xs text-muted-foreground px-1">
          {t(
            "日期、币种、卡商等高级筛选仅适用于赛地/奈拉与 USDT 订单；商城订单请使用上方「状态」与搜索框。",
            "Date, currency, and vendor filters apply only to NGN/GHS and USDT orders. For mall orders, use status and search above.",
          )}
        </p>
      ) : null}

      <SectionCard
        title={
          activeTab === "mall"
            ? t("商城订单", "Mall orders")
            : ""
        }
        description={
          activeTab === "mall"
            ? t("会员积分商城提交的兑换单；驳回将退回积分。", "Points mall redemptions; rejecting refunds points.")
            : ""
        }
      >
          {activeTab !== "mall" ? (
            <OrderFilters
              showAdvancedFilter={showAdvancedFilter}
              onShowAdvancedFilterChange={setShowAdvancedFilter}
              statusFilter={statusFilter}
              onStatusFilterChange={setStatusFilter}
              currencyFilter={currencyFilter}
              onCurrencyFilterChange={setCurrencyFilter}
              vendorFilter={vendorFilter}
              onVendorFilterChange={setVendorFilter}
              paymentProviderFilter={paymentProviderFilter}
              onPaymentProviderFilterChange={setPaymentProviderFilter}
              cardTypeFilter={cardTypeFilter}
              onCardTypeFilterChange={setCardTypeFilter}
              salesPersonFilter={salesPersonFilter}
              onSalesPersonFilterChange={setSalesPersonFilter}
              minProfit={minProfit}
              onMinProfitChange={setMinProfit}
              maxProfit={maxProfit}
              onMaxProfitChange={setMaxProfit}
              selectedRange={selectedRange}
              dateRange={dateRange}
              onDateRangeChange={handleDateRangeChange}
              onResetFilters={resetFilters}
              vendorsList={vendorsList}
              paymentProvidersList={paymentProvidersList}
              cardsList={cardsList}
              uniqueSalesPersons={uniqueSalesPersons}
              orderStatusOptions={orderStatusOptions}
              currencyOptions={currencyOptions}
              stats={stats}
              isMobile={isMobile}
              t={t}
            />
          ) : null}

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">

            <TabsContent value="normal">
              {isOrdersError && (
                <div className="mb-3">
                  <ErrorState
                    title={t("订单数据加载失败", "Failed to load orders")}
                    description={t("请点击刷新重试。", "Please refresh and try again.")}
                  />
                </div>
              )}
              <OrderTable
                orders={paginatedOrders}
                useCompactLayout={useCompactLayout}
                columnVisibility={normalColumnVisibility}
                sortConfig={orderSortConfig}
                onSort={requestOrderSort}
                onEdit={handleEdit}
                onCancel={handleCancel}
                onRestore={async (dbId: string) => { await restoreOrder(dbId); return true; }}
                onDelete={handleDelete}
                canEditCancelButton={canEditField('cancel_button')}
                canDelete={canDeleteField('delete_button')}
                resolveCardName={resolveCardName}
                resolveVendorName={resolveVendorName}
                resolveProviderName={resolveProviderName}
                isAdmin={isAdmin}
                currentPage={currentPage}
                totalPages={totalPages}
                totalCount={totalCount}
                pageSize={PAGE_SIZE}
                onPageChange={setCurrentPage}
                jumpToPage={jumpToPage}
                onJumpToPageChange={setJumpToPage}
                onJumpToPage={() => handleJumpToPage("normal")}
                t={t}
                {...(!useCompactLayout
                  ? {
                      selectedDbIds: selectedNormalDbIds,
                      onToggleSelectDbId: toggleNormalDbId,
                      onToggleSelectAllPage: toggleNormalPage,
                      batchActionBar:
                        selectedNormalDbIds.size > 0 ? (
                          <TooltipProvider delayDuration={300}>
                            <div className="flex flex-wrap items-center gap-2 mb-2">
                              <span className="text-sm text-muted-foreground">
                                {t(`已选 ${selectedNormalDbIds.size} 条`, `${selectedNormalDbIds.size} selected`)}
                              </span>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="outline" size="sm" onClick={() => setSelectedNormalDbIds(new Set())}>
                                    {t("清空选择", "Clear selection")}
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>{t("取消全部勾选", "Clear all checkboxes")}</TooltipContent>
                              </Tooltip>
                              {canDeleteField("delete_button") ? (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => setOrderBatchDialog({ mode: "delete", tab: "normal" })}
                                    >
                                      {t("批量删除", "Batch delete")}
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>{t("删除所选订单", "Delete selected orders")}</TooltipContent>
                                </Tooltip>
                              ) : null}
                              {canEditField("cancel_button") ? (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      disabled={normalBatchCancelCount === 0}
                                      onClick={() => setOrderBatchDialog({ mode: "cancel", tab: "normal" })}
                                    >
                                      {t("批量处理", "Batch process")}
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    {normalBatchCancelCount === 0
                                      ? t("所选行中没有「已完成」订单", "No completed orders in selection")
                                      : t("将所选「已完成」订单批量取消", "Cancel selected completed orders")}
                                  </TooltipContent>
                                </Tooltip>
                              ) : null}
                            </div>
                          </TooltipProvider>
                        ) : null,
                    }
                  : {})}
              />
            </TabsContent>

            {/* USDT模式 */}
            <TabsContent value="usdt">
              {isUsdtOrdersError && (
                <div className="mb-3">
                  <ErrorState
                    title={t("USDT 订单加载失败", "Failed to load USDT orders")}
                    description={t("请点击刷新重试。", "Please refresh and try again.")}
                  />
                </div>
              )}
              <OrderUsdtTable
                orders={paginatedUsdtOrders}
                useCompactLayout={useCompactLayout}
                columnVisibility={usdtColumnVisibility}
                sortConfig={usdtSortConfig}
                onSort={requestUsdtSort}
                onEdit={handleEditUsdt}
                onCancel={handleCancelUsdt}
                onRestore={async (dbId: string) => { await restoreUsdtOrder(dbId); return true; }}
                onDelete={handleDeleteUsdt}
                canEditCancelButton={canEditField('cancel_button')}
                canDelete={canDeleteField('delete_button')}
                resolveCardName={resolveCardName}
                resolveVendorName={resolveVendorName}
                resolveProviderName={resolveProviderName}
                isAdmin={isAdmin}
                currentPage={currentUsdtPage}
                totalPages={totalUsdtPages}
                totalCount={usdtTotalCount}
                pageSize={PAGE_SIZE}
                onPageChange={setCurrentUsdtPage}
                jumpToPage={jumpToPage}
                onJumpToPageChange={setJumpToPage}
                onJumpToPage={() => handleJumpToPage("usdt")}
                t={t}
                {...(!useCompactLayout
                  ? {
                      selectedDbIds: selectedUsdtDbIds,
                      onToggleSelectDbId: toggleUsdtDbId,
                      onToggleSelectAllPage: toggleUsdtPage,
                      batchActionBar:
                        selectedUsdtDbIds.size > 0 ? (
                          <TooltipProvider delayDuration={300}>
                            <div className="flex flex-wrap items-center gap-2 mb-2">
                              <span className="text-sm text-muted-foreground">
                                {t(`已选 ${selectedUsdtDbIds.size} 条`, `${selectedUsdtDbIds.size} selected`)}
                              </span>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="outline" size="sm" onClick={() => setSelectedUsdtDbIds(new Set())}>
                                    {t("清空选择", "Clear selection")}
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>{t("取消全部勾选", "Clear all checkboxes")}</TooltipContent>
                              </Tooltip>
                              {canDeleteField("delete_button") ? (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => setOrderBatchDialog({ mode: "delete", tab: "usdt" })}
                                    >
                                      {t("批量删除", "Batch delete")}
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>{t("删除所选订单", "Delete selected orders")}</TooltipContent>
                                </Tooltip>
                              ) : null}
                              {canEditField("cancel_button") ? (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      disabled={usdtBatchCancelCount === 0}
                                      onClick={() => setOrderBatchDialog({ mode: "cancel", tab: "usdt" })}
                                    >
                                      {t("批量处理", "Batch process")}
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    {usdtBatchCancelCount === 0
                                      ? t("所选行中没有「已完成」订单", "No completed orders in selection")
                                      : t("将所选「已完成」订单批量取消", "Cancel selected completed orders")}
                                  </TooltipContent>
                                </Tooltip>
                              ) : null}
                            </div>
                          </TooltipProvider>
                        ) : null,
                    }
                  : {})}
              />
            </TabsContent>

            <TabsContent value="meika-fiat">
              {isMeikaFiatError && (
                <div className="mb-3">
                  <ErrorState
                    title={t("美卡专区订单加载失败", "Failed to load Meika orders")}
                    description={t("请点击刷新重试。", "Please refresh and try again.")}
                  />
                </div>
              )}
              <p className="mb-2 text-xs text-muted-foreground">
                {t(
                  "此列表为只读视图，数据跟随「赛地/奈拉模式」同步刷新。如需修改请前往对应主列表操作。",
                  "Read-only view — data syncs from the Fiat tab. Edit or manage orders there.",
                )}
              </p>
              <OrderTable
                orders={paginatedMeikaFiatOrders}
                useCompactLayout={useCompactLayout}
                columnVisibility={normalColumnVisibility}
                sortConfig={meikaFiatSortConfig}
                onSort={requestMeikaFiatSort}
                onEdit={undefined as never}
                onCancel={undefined as never}
                onRestore={undefined as never}
                onDelete={undefined as never}
                canEditCancelButton={false}
                canDelete={false}
                resolveCardName={resolveCardName}
                resolveVendorName={resolveVendorName}
                resolveProviderName={resolveProviderName}
                isAdmin={isAdmin}
                currentPage={currentMeikaFiatPage}
                totalPages={totalMeikaFiatPages}
                totalCount={meikaFiatTotalCount}
                pageSize={PAGE_SIZE}
                onPageChange={setCurrentMeikaFiatPage}
                jumpToPage={jumpToPage}
                onJumpToPageChange={setJumpToPage}
                onJumpToPage={() => handleJumpToPage("meika-fiat")}
                t={t}
              />
            </TabsContent>

            <TabsContent value="meika-usdt">
              {isMeikaUsdtError && (
                <div className="mb-3">
                  <ErrorState
                    title={t("美卡专区 USDT 订单加载失败", "Failed to load Meika USDT orders")}
                    description={t("请点击刷新重试。", "Please refresh and try again.")}
                  />
                </div>
              )}
              <p className="mb-2 text-xs text-muted-foreground">
                {t(
                  "此列表为只读视图，数据跟随「USDT 模式」同步刷新。如需修改请前往对应主列表操作。",
                  "Read-only view — data syncs from the USDT tab. Edit or manage orders there.",
                )}
              </p>
              <OrderUsdtTable
                orders={paginatedMeikaUsdtOrders}
                useCompactLayout={useCompactLayout}
                columnVisibility={usdtColumnVisibility}
                sortConfig={meikaUsdtSortConfig}
                onSort={requestMeikaUsdtSort}
                onEdit={undefined as never}
                onCancel={undefined as never}
                onRestore={undefined as never}
                onDelete={undefined as never}
                canEditCancelButton={false}
                canDelete={false}
                resolveCardName={resolveCardName}
                resolveVendorName={resolveVendorName}
                resolveProviderName={resolveProviderName}
                isAdmin={isAdmin}
                currentPage={currentMeikaUsdtPage}
                totalPages={totalMeikaUsdtPages}
                totalCount={meikaUsdtTotalCount}
                pageSize={PAGE_SIZE}
                onPageChange={setCurrentMeikaUsdtPage}
                jumpToPage={jumpToPage}
                onJumpToPageChange={setJumpToPage}
                onJumpToPage={() => handleJumpToPage("meika-usdt")}
                t={t}
              />
            </TabsContent>

            <TabsContent value="mall">
              <OrderMallRedemptionsSection
                tenantId={effectiveTenantId}
                searchTerm={searchQuery}
                statusFilter={mallStatusFilter}
                isActive={activeTab === "mall"}
                isMobile={isMobile}
                refreshNonce={mallOrdersRefreshNonce}
                highlightRedemptionId={mallHighlightId}
                canProcessOrders={
                  isAdmin ||
                  currentEmployee?.role === "manager" ||
                  !!currentEmployee?.is_super_admin ||
                  !!currentEmployee?.is_platform_super_admin
                }
                t={t}
              />
            </TabsContent>
          </Tabs>
      </SectionCard>

      {/* 编辑普通订单（右侧 Drawer / 移动端底部 Sheet） */}
      <OrderEditDialog
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        order={editingOrder}
        onOrderChange={setEditingOrder}
        onSave={handleSaveEdit}
        isSubmitting={isEditSubmitting}
        isAdmin={isAdmin}
        isSuperAdmin={isSuperAdmin}
        cardsList={cardsList}
        vendorsList={vendorsList}
        paymentProvidersList={paymentProvidersList}
        allEmployees={allEmployees}
        resolveCardName={resolveCardName}
        resolveVendorName={resolveVendorName}
        resolveProviderName={resolveProviderName}
        preferSubmitReview={normalOrderPreferSubmitReview}
      />

      {/* 编辑USDT订单对话框 */}
      <OrderUsdtEditDialog
        open={isUsdtEditDialogOpen}
        onOpenChange={setIsUsdtEditDialogOpen}
        order={editingUsdtOrder}
        onOrderChange={setEditingUsdtOrder}
        usdtRateInput={usdtRateInput}
        onUsdtRateInputChange={setUsdtRateInput}
        onSave={handleSaveUsdtEdit}
        isSubmitting={isUsdtEditSubmitting}
        isAdmin={isAdmin}
        isSuperAdmin={isSuperAdmin}
        cardsList={cardsList}
        vendorsList={vendorsList}
        paymentProvidersList={paymentProvidersList}
        allEmployees={allEmployees}
        resolveCardName={resolveCardName}
        resolveVendorName={resolveVendorName}
        resolveProviderName={resolveProviderName}
        preferSubmitReview={usdtOrderPreferSubmitReview}
      />

      <ExportConfirmDialog
        open={exportConfirm.open}
        onOpenChange={exportConfirm.handleOpenChange}
        onConfirm={exportConfirm.handleConfirm}
      />

      <AlertDialog open={orderBatchDialog !== null} onOpenChange={(open) => !open && setOrderBatchDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {orderBatchDialog?.mode === "delete"
                ? t("确认批量删除", "Confirm batch delete")
                : t("确认批量处理", "Confirm batch process")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {orderBatchDialog ? (
                orderBatchDialog.mode === "delete" ? (
                  orderBatchDialog.tab === "normal" || orderBatchDialog.tab === "meika-fiat" ? (
                    t(
                      `将删除所选的 ${orderBatchDialog.tab === "meika-fiat" ? selectedMeikaFiatDbIds.size : selectedNormalDbIds.size} 条订单，确定继续？`,
                      `Delete ${orderBatchDialog.tab === "meika-fiat" ? selectedMeikaFiatDbIds.size : selectedNormalDbIds.size} selected order(s)?`,
                    )
                  ) : (
                    t(
                      `将删除所选的 ${orderBatchDialog.tab === "meika-usdt" ? selectedMeikaUsdtDbIds.size : selectedUsdtDbIds.size} 条 USDT 订单，确定继续？`,
                      `Delete ${orderBatchDialog.tab === "meika-usdt" ? selectedMeikaUsdtDbIds.size : selectedUsdtDbIds.size} selected USDT order(s)?`,
                    )
                  )
                ) : orderBatchDialog.tab === "normal" || orderBatchDialog.tab === "meika-fiat" ? (
                  t(
                    `将把 ${orderBatchDialog.tab === "meika-fiat" ? meikaFiatBatchCancelCount : normalBatchCancelCount} 条「已完成」订单取消，确定继续？`,
                    `Cancel ${orderBatchDialog.tab === "meika-fiat" ? meikaFiatBatchCancelCount : normalBatchCancelCount} completed order(s)?`,
                  )
                ) : (
                  t(
                    `将把 ${orderBatchDialog.tab === "meika-usdt" ? meikaUsdtBatchCancelCount : usdtBatchCancelCount} 条「已完成」USDT 订单取消，确定继续？`,
                    `Cancel ${orderBatchDialog.tab === "meika-usdt" ? meikaUsdtBatchCancelCount : usdtBatchCancelCount} completed USDT order(s)?`,
                  )
                )
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("取消", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className={orderBatchDialog?.mode === "delete" ? "bg-destructive hover:bg-destructive/90" : undefined}
              onClick={(e) => {
                e.preventDefault();
                confirmOrderBatchAction();
              }}
            >
              {orderBatchDialog?.mode === "delete" ? t("删除", "Delete") : t("确认", "Confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
