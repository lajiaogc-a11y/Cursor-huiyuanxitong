import { useState, useEffect, useMemo } from "react";
import { safeNumber } from "@/lib/safeCalc";
import { 
  calculateNormalOrderDerivedValues, 
  calculateUsdtOrderDerivedValues,
  calculateProfit,
  calculateProfitRate
} from "@/lib/orderCalculations";
import { logOrderUpdateBalanceChange, syncMemberActivityOnOrderEdit } from "@/services/balanceLogService";
import { adjustPointsOnOrderEdit } from "@/services/pointsService";
import { logOperation } from '@/stores/auditLogStore';
import { useLanguage } from "@/contexts/LanguageContext";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
import { Search, RefreshCw, Filter, Upload, Download } from "lucide-react";
import TableImportButton from "@/components/TableImportButton";
import { exportTableToCSV } from "@/services/dataExportImportService";
import { toast } from "sonner";
import { TimeRangeType, DateRange, getTimeRangeDates, ALL_TIME_DATE_RANGE } from "@/lib/dateFilter";
import { useOrders, useUsdtOrders, useOrderStats, Order, UsdtOrder } from "@/hooks/useOrders";
import { supabase } from "@/integrations/supabase/client";
import { useMerchantNameResolver } from "@/hooks/useNameResolver";
import { useColumnVisibility, ColumnConfig } from "@/hooks/useColumnVisibility";
import ColumnVisibilityDropdown from "@/components/ColumnVisibilityDropdown";

import { useAuth } from "@/contexts/AuthContext";
import { useTenantView } from "@/contexts/TenantViewContext";
import { getActiveEmployees, getEmployees, Employee } from "@/stores/employeeStore";
import { useModulePermissions, useFieldPermissions } from "@/hooks/useFieldPermissions";
import { isUserTyping, trackRender } from "@/lib/performanceUtils";
import { useAuditWorkflow } from "@/hooks/useAuditWorkflow";
import { useIsMobile, useIsTablet } from "@/hooks/use-mobile";
import { OrderFilters, OrderEditDialog, OrderUsdtEditDialog, OrderTable, OrderUsdtTable } from "@/components/orders";
import { queryClient } from "@/lib/queryClient";

// UUID 校验函数 - 防止把姓名字符串写入 uuid 字段
const isUuid = (str: string): boolean => {
  if (!str || typeof str !== 'string') return false;
  return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(str);
};

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

export default function OrderManagement() {
  trackRender('OrderManagement');
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  const useCompactLayout = isMobile || isTablet;
  const { t, tr, formatDate } = useLanguage();
  const { isAdmin, employee: currentEmployee } = useAuth();
  const { viewingTenantId } = useTenantView() || {};
  const effectiveTenantId = viewingTenantId || currentEmployee?.tenant_id || null;
  const [activeTab, setActiveTab] = useState("normal");
  
  // 检查当前用户是否为总管理员
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [allEmployees, setAllEmployees] = useState<{ id: string; real_name: string }[]>([]);
  
  // 获取订单管理模块的所有字段权限
  const { canEditField, canDeleteField } = useModulePermissions('orders');
  
  // 审核工作流
  const { checkCanEditDirectly, submitBatchForApproval } = useAuditWorkflow();
  
  // 使用商家名称解析器 - 实时获取最新商家名称
  const { resolveCardName, resolveVendorName, resolveProviderName } = useMerchantNameResolver();
  
  // 列显示/隐藏设置 - 使用 useMemo 保持稳定引用
  const normalOrderColumns = useMemo(() => getNormalOrderColumns(t), [t]);
  const usdtOrderColumns = useMemo(() => getUsdtOrderColumns(t), [t]);
  const orderStatusOptions = useMemo(() => getOrderStatusOptions(t), [t]);
  const currencyOptions = useMemo(() => getCurrencyOptions(t), [t]);
  
  const normalColumnVisibility = useColumnVisibility('order-normal', normalOrderColumns);
  const usdtColumnVisibility = useColumnVisibility('order-usdt', usdtOrderColumns);

  const [searchTerm, setSearchTerm] = useState("");
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [originalOrder, setOriginalOrder] = useState<Order | null>(null); // 保存原始订单用于对比
  const [editingUsdtOrder, setEditingUsdtOrder] = useState<UsdtOrder | null>(null);
  const [originalUsdtOrder, setOriginalUsdtOrder] = useState<UsdtOrder | null>(null); // 保存原始USDT订单用于对比
  const [usdtRateInput, setUsdtRateInput] = useState<string>(""); // USDT汇率字符串输入状态
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isUsdtEditDialogOpen, setIsUsdtEditDialogOpen] = useState(false);
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
  const [jumpToPage, setJumpToPage] = useState("");

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
      searchTerm: searchTerm.trim() || undefined,
    };
  }, [statusFilter, currencyFilter, vendorFilter, paymentProviderFilter, cardTypeFilter, salesPersonFilter, minProfit, maxProfit, selectedRange, dateRange, searchTerm, allEmployees]);

  // 使用数据库 hooks - 服务端分页
  const { orders, totalCount, updateOrder, cancelOrder, restoreOrder, deleteOrder, refetch: refetchOrders } = useOrders({
    page: currentPage,
    pageSize: PAGE_SIZE,
    filters: orderFilters,
  });
  const { orders: usdtOrders, totalCount: usdtTotalCount, cancelOrder: cancelUsdtOrder, restoreOrder: restoreUsdtOrder, deleteOrder: deleteUsdtOrder, refetch: refetchUsdtOrders } = useUsdtOrders({
    page: currentUsdtPage,
    pageSize: PAGE_SIZE,
    filters: orderFilters,
  });

  const { totalProfit: statsTotalProfit, totalCardValue: statsTotalCardValue, tradingUsers: statsTradingUsers } = useOrderStats(orderFilters);

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
        setIsSuperAdmin(emp?.is_super_admin === true);
      });
    }
    
    // 从数据库加载商家管理数据
    const loadMerchantData = async () => {
      const [cardsResult, vendorsResult, providersResult] = await Promise.all([
        supabase.from('cards').select('id, name').eq('status', 'active'),
        supabase.from('vendors').select('id, name').eq('status', 'active'),
        supabase.from('payment_providers').select('id, name').eq('status', 'active'),
      ]);
      
      if (cardsResult.data) setCardsList(cardsResult.data);
      if (vendorsResult.data) setVendorsList(vendorsResult.data);
      if (providersResult.data) setPaymentProvidersList(providersResult.data);
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
        refetchOrders();
        refetchUsdtOrders();
        refreshTimeoutId = null;
      }, 300); // 300ms debounce
    };
    
    // Consolidated subscription - single channel for all related entity changes
    const syncChannel = supabase
      .channel('order-page-entity-sync')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'employees' }, () => {
        // 员工信息变更时刷新订单数据和员工名称列表
        getActiveEmployees(effectiveTenantId).then(employees => {
          setEmployeeNames(employees.map(e => e.real_name));
        });
        debouncedRefresh(false);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cards' }, () => {
        debouncedRefresh(true);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vendors' }, () => {
        debouncedRefresh(true);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payment_providers' }, () => {
        debouncedRefresh(true);
      })
      .subscribe();
    
    return () => {
      supabase.removeChannel(syncChannel);
      if (refreshTimeoutId) {
        clearTimeout(refreshTimeoutId);
      }
    };
  }, [refetchOrders, refetchUsdtOrders, effectiveTenantId]);

  // 筛选下拉选项：使用商家管理数据（服务端分页后不从订单推导）
  const uniqueSalesPersons = useMemo(() => employeeNames.sort(), [employeeNames]);

  // 处理日期范围变化
  const handleDateRangeChange = (range: TimeRangeType, start?: Date, end?: Date) => {
    setSelectedRange(range);
    if (range === "自定义" && start && end) {
      setDateRange(getTimeRangeDates(range, start, end));
    } else {
      setDateRange(getTimeRangeDates(range));
    }
  };

  // 服务端分页：orders/usdtOrders 已是筛选后的当前页数据
  const filteredOrders = orders;
  const filteredUsdtOrders = usdtOrders;

  // 重置筛选
  const resetFilters = () => {
    setSearchTerm("");
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
    totalCardValue: statsTotalCardValue,
    tradingUsers: statsTradingUsers,
  }), [totalCount, usdtTotalCount, statsTotalProfit, statsTotalCardValue, statsTradingUsers]);

  // 排序功能 - 普通订单
  const { sortedData: sortedOrders, sortConfig: orderSortConfig, requestSort: requestOrderSort } = useSortableData(filteredOrders);
  
  // 排序功能 - USDT订单
  const { sortedData: sortedUsdtOrders, sortConfig: usdtSortConfig, requestSort: requestUsdtSort } = useSortableData(filteredUsdtOrders);

  // 分页计算 - 服务端分页，每页50条
  const totalPages = useMemo(() => Math.max(1, Math.ceil(totalCount / PAGE_SIZE)), [totalCount]);
  const totalUsdtPages = useMemo(() => Math.max(1, Math.ceil(usdtTotalCount / PAGE_SIZE)), [usdtTotalCount]);
  const paginatedOrders = sortedOrders;
  const paginatedUsdtOrders = sortedUsdtOrders;

  // 重置页码当筛选变化时
  useEffect(() => {
    setCurrentPage(1);
    setCurrentUsdtPage(1);
  }, [orderFilters]);

  // 跳转到指定页
  const handleJumpToPage = (isUsdt: boolean) => {
    const page = parseInt(jumpToPage);
    const maxPage = isUsdt ? totalUsdtPages : totalPages;
    if (!isNaN(page) && page >= 1 && page <= maxPage) {
      if (isUsdt) {
        setCurrentUsdtPage(page);
      } else {
        setCurrentPage(page);
      }
      setJumpToPage("");
    }
  };

  const handleRefresh = async () => {
    await Promise.all([refetchOrders(), refetchUsdtOrders()]);
    toast.success("订单已刷新");
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

  const handleSaveEdit = async () => {
    if (!editingOrder || !originalOrder || isEditSubmitting) return;
    
    setIsEditSubmitting(true);
    try {
    
    const canEditSalesPerson = isSuperAdmin; // 只有总管理员可以改销售员
    
    // 收集所有字段变更
    const changes: { fieldKey: string; oldValue: any; newValue: any }[] = [];
    
    // 检查所有可编辑字段（使用数值比较避免类型不匹配）
    const numDiff = (a: any, b: any) => parseFloat(String(a || 0)) !== parseFloat(String(b || 0));
    const strDiff = (a: any, b: any) => String(a || '') !== String(b || '');
    
    if (strDiff(editingOrder.cardType, originalOrder.cardType)) {
      changes.push({ fieldKey: 'card_type', oldValue: originalOrder.cardType, newValue: editingOrder.cardType });
    }
    if (numDiff(editingOrder.cardValue, originalOrder.cardValue)) {
      changes.push({ fieldKey: 'card_value', oldValue: originalOrder.cardValue, newValue: editingOrder.cardValue });
    }
    if (numDiff(editingOrder.cardRate, originalOrder.cardRate)) {
      changes.push({ fieldKey: 'card_rate', oldValue: originalOrder.cardRate, newValue: editingOrder.cardRate });
    }
    if (numDiff(editingOrder.actualPaid, originalOrder.actualPaid)) {
      changes.push({ fieldKey: 'actual_paid', oldValue: originalOrder.actualPaid, newValue: editingOrder.actualPaid });
    }
    if (numDiff(editingOrder.paymentValue, originalOrder.paymentValue)) {
      changes.push({ fieldKey: 'payment_value', oldValue: originalOrder.paymentValue, newValue: editingOrder.paymentValue });
    }
    if (numDiff(editingOrder.foreignRate, originalOrder.foreignRate)) {
      changes.push({ fieldKey: 'foreign_rate', oldValue: originalOrder.foreignRate, newValue: editingOrder.foreignRate });
    }
    if (numDiff(editingOrder.fee, originalOrder.fee)) {
      changes.push({ fieldKey: 'fee', oldValue: originalOrder.fee, newValue: editingOrder.fee });
    }
    if (strDiff(editingOrder.demandCurrency, originalOrder.demandCurrency)) {
      changes.push({ fieldKey: 'demand_currency', oldValue: originalOrder.demandCurrency, newValue: editingOrder.demandCurrency });
    }
    if (strDiff(editingOrder.phoneNumber, originalOrder.phoneNumber)) {
      changes.push({ fieldKey: 'phone_number', oldValue: originalOrder.phoneNumber, newValue: editingOrder.phoneNumber });
    }
    if (strDiff(editingOrder.paymentProvider, originalOrder.paymentProvider)) {
      changes.push({ fieldKey: 'payment_provider', oldValue: originalOrder.paymentProvider, newValue: editingOrder.paymentProvider });
    }
    if (strDiff(editingOrder.vendor, originalOrder.vendor)) {
      changes.push({ fieldKey: 'vendor', oldValue: originalOrder.vendor, newValue: editingOrder.vendor });
    }
    if (strDiff(editingOrder.remark, originalOrder.remark)) {
      changes.push({ fieldKey: 'remark', oldValue: originalOrder.remark, newValue: editingOrder.remark });
    }
    if (isSuperAdmin && strDiff(editingOrder.salesPerson, originalOrder.salesPerson)) {
      changes.push({ fieldKey: 'sales_person', oldValue: originalOrder.salesPerson, newValue: editingOrder.salesPerson });
    }
    
    if (changes.length === 0) {
      toast.info("没有检测到修改");
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
      
      // 重要：正确的字段映射
      // - order_type: 卡片类型UUID (cards表)
      // - card_merchant_id: 卡商UUID (vendors表)
      // - vendor_id: 代付商家UUID (payment_providers表)
      const updates: any = {
        order_type: editingOrder.cardType,              // 卡片类型
        card_merchant_id: editingOrder.vendor,          // 卡商
        vendor_id: editingOrder.paymentProvider,        // 代付商家
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
      
      // 只有当销售员是合法 UUID 时才写入（防止把姓名写入 uuid 字段）
      if (isSuperAdmin && editingOrder.salesPerson && isUuid(editingOrder.salesPerson)) {
        updates.sales_user_id = editingOrder.salesPerson;
        updates.creator_id = editingOrder.salesPerson;
      }
      
      return updates;
    };
    
    // 检查是否需要提交审核
    // 管理员直接编辑，不需要审核
    if (isAdmin) {
      const updates = buildUpdates();
      
      const { data, error } = await supabase
        .from('orders')
        .update(updates)
        .eq('id', editingOrder.dbId)
        .select('id');
      
      if (error) {
        toast.error(`更新失败: ${error.message}`);
        return; // 保持弹窗打开，用户可修正后重试
      }
      
      if (!data || data.length === 0) {
        toast.error("更新失败: 未找到匹配的订单记录");
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
      
      // 🔧 积分自动同步：订单编辑后自动调整积分差额
      if (editingOrder.memberCode && editingOrder.phoneNumber) {
        try {
          const pointsResult = await adjustPointsOnOrderEdit({
            orderId: editingOrder.dbId,
            memberCode: editingOrder.memberCode,
            phoneNumber: editingOrder.phoneNumber,
            oldActualPayment: parseFloat(String(originalOrder.actualPaid)) || 0,
            oldCurrency: (originalOrder.demandCurrency || 'NGN') as any,
            newActualPayment: parseFloat(String(editingOrder.actualPaid)) || 0,
            newCurrency: (editingOrder.demandCurrency || 'NGN') as any,
            creatorId: currentEmployee?.id,
          });
          if (pointsResult.delta !== 0) {
            console.log('[OrderEdit] Points adjusted:', pointsResult);
          }
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
        `修改订单: ${editingOrder.id}`
      );
        
      await refetchOrders();
      queryClient.invalidateQueries({ queryKey: ['dashboard-trend'] });
      queryClient.invalidateQueries({ queryKey: ['profit-compare-current'] });
      queryClient.invalidateQueries({ queryKey: ['profit-compare-previous'] });
      window.dispatchEvent(new CustomEvent('report-cache-invalidate'));
      window.dispatchEvent(new CustomEvent('leaderboard-refresh'));
      window.dispatchEvent(new CustomEvent('ledger-updated'));
      window.dispatchEvent(new CustomEvent('points-updated'));
      toast.success("订单已更新");
    } else {
      // 非管理员：按字段判断，需审核的只提交审核不直接更新，可直接编辑的才更新
      const result = await submitBatchForApproval({
        module: 'order',
        changes,
        targetId: editingOrder.dbId,
        targetDescription: `订单 ${editingOrder.id}`,
        originalData: originalOrder,
      });
      
      if (result.hasRejected) {
        toast.error(result.message);
        return;
      }
      
      // 有需审核的字段时，不直接更新订单（避免未审批的修改生效），仅提交审核
      if (result.pendingFields.length > 0) {
        toast.success(result.message);
        setIsEditDialogOpen(false);
        setEditingOrder(null);
        setOriginalOrder(null);
        await refetchOrders();
        return;
      }
      
      // 全部为可直接编辑的字段，执行完整更新
      const updates = buildUpdates();
      
      const { data, error } = await supabase
        .from('orders')
        .update(updates)
        .eq('id', editingOrder.dbId)
        .select('id');
      
      if (error) {
        toast.error(`更新失败: ${error.message}`);
        return;
      }
      
      if (!data || data.length === 0) {
        toast.error("更新失败: 未找到匹配的订单记录");
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
        `修改订单: ${editingOrder.id}`
      );
        
      await refetchOrders();
      queryClient.invalidateQueries({ queryKey: ['dashboard-trend'] });
      queryClient.invalidateQueries({ queryKey: ['profit-compare-current'] });
      queryClient.invalidateQueries({ queryKey: ['profit-compare-previous'] });
      window.dispatchEvent(new CustomEvent('report-cache-invalidate'));
      window.dispatchEvent(new CustomEvent('leaderboard-refresh'));
      window.dispatchEvent(new CustomEvent('ledger-updated'));
      window.dispatchEvent(new CustomEvent('points-updated'));
      toast.success("订单已更新");
    }
    
    setIsEditDialogOpen(false);
    setEditingOrder(null);
    setOriginalOrder(null);
    } finally {
      setIsEditSubmitting(false);
    }
  };

  const handleCancel = async (dbId: string) => {
    await cancelOrder(dbId);
    toast.success("订单已取消");
  };

  // 恢复订单确认对话框状态
  const [restoreOrderId, setRestoreOrderId] = useState<string | null>(null);
  const [restoreUsdtOrderId, setRestoreUsdtOrderId] = useState<string | null>(null);

  const handleRestore = (dbId: string) => {
    setRestoreOrderId(dbId);
  };

  const confirmRestore = async () => {
    if (restoreOrderId) {
      await restoreOrder(restoreOrderId);
      toast.success("订单已恢复为已完成");
      setRestoreOrderId(null);
    }
  };

  const handleDelete = async (dbId: string) => {
    const success = await deleteOrder(dbId);
    if (success) {
      toast.success("订单已删除");
    }
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
    
    // 收集所有字段变更
    const changes: { fieldKey: string; oldValue: any; newValue: any }[] = [];
    
    // 检查所有可编辑字段
    if (editingUsdtOrder.cardType !== originalUsdtOrder.cardType) {
      changes.push({ fieldKey: 'card_type', oldValue: originalUsdtOrder.cardType, newValue: editingUsdtOrder.cardType });
    }
    if (editingUsdtOrder.cardValue !== originalUsdtOrder.cardValue) {
      changes.push({ fieldKey: 'card_value', oldValue: originalUsdtOrder.cardValue, newValue: editingUsdtOrder.cardValue });
    }
    if (editingUsdtOrder.cardRate !== originalUsdtOrder.cardRate) {
      changes.push({ fieldKey: 'card_rate', oldValue: originalUsdtOrder.cardRate, newValue: editingUsdtOrder.cardRate });
    }
    if (editingUsdtOrder.usdtRate !== originalUsdtOrder.usdtRate) {
      changes.push({ fieldKey: 'usdt_rate', oldValue: originalUsdtOrder.usdtRate, newValue: editingUsdtOrder.usdtRate });
    }
    if (editingUsdtOrder.actualPaidUsdt !== originalUsdtOrder.actualPaidUsdt) {
      changes.push({ fieldKey: 'actual_paid', oldValue: originalUsdtOrder.actualPaidUsdt, newValue: editingUsdtOrder.actualPaidUsdt });
    }
    if (editingUsdtOrder.phoneNumber !== originalUsdtOrder.phoneNumber) {
      changes.push({ fieldKey: 'phone_number', oldValue: originalUsdtOrder.phoneNumber, newValue: editingUsdtOrder.phoneNumber });
    }
    if (editingUsdtOrder.paymentProvider !== originalUsdtOrder.paymentProvider) {
      changes.push({ fieldKey: 'payment_provider', oldValue: originalUsdtOrder.paymentProvider, newValue: editingUsdtOrder.paymentProvider });
    }
    if (editingUsdtOrder.vendor !== originalUsdtOrder.vendor) {
      changes.push({ fieldKey: 'vendor', oldValue: originalUsdtOrder.vendor, newValue: editingUsdtOrder.vendor });
    }
    if (editingUsdtOrder.feeUsdt !== originalUsdtOrder.feeUsdt) {
      changes.push({ fieldKey: 'fee', oldValue: originalUsdtOrder.feeUsdt, newValue: editingUsdtOrder.feeUsdt });
    }
    if (editingUsdtOrder.remark !== originalUsdtOrder.remark) {
      changes.push({ fieldKey: 'remark', oldValue: originalUsdtOrder.remark, newValue: editingUsdtOrder.remark });
    }
    if (isSuperAdmin && editingUsdtOrder.salesPerson !== originalUsdtOrder.salesPerson) {
      changes.push({ fieldKey: 'sales_person', oldValue: originalUsdtOrder.salesPerson, newValue: editingUsdtOrder.salesPerson });
    }
    
    if (changes.length === 0) {
      toast.info("没有检测到修改");
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
      
      // 重要：正确的字段映射
      // - order_type: 卡片类型UUID (cards表)
      // - card_merchant_id: 卡商UUID (vendors表)
      // - vendor_id: 代付商家UUID (payment_providers表)
      const updates: any = {
        order_type: editingUsdtOrder.cardType,          // 卡片类型
        card_merchant_id: editingUsdtOrder.vendor,      // 卡商
        vendor_id: editingUsdtOrder.paymentProvider,    // 代付商家
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
      
      // 只有当销售员是合法 UUID 时才写入（防止把姓名写入 uuid 字段）
      if (isSuperAdmin && editingUsdtOrder.salesPerson && isUuid(editingUsdtOrder.salesPerson)) {
        updates.sales_user_id = editingUsdtOrder.salesPerson;
        updates.creator_id = editingUsdtOrder.salesPerson;
      }
      
      return updates;
    };
    
    // 检查是否需要提交审核
    // 管理员直接编辑，不需要审核
    if (isAdmin) {
      const updates = buildUpdates();
      
      const { data, error } = await supabase
        .from('orders')
        .update(updates)
        .eq('id', editingUsdtOrder.dbId)
        .select('id');
      
      if (error) {
        toast.error(`更新失败: ${error.message}`);
        return; // 保持弹窗打开，用户可修正后重试
      }
      
      if (!data || data.length === 0) {
        toast.error("更新失败: 未找到匹配的订单记录");
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
        `修改USDT订单: ${editingUsdtOrder.id}`
      );
        
      await refetchUsdtOrders();
      queryClient.invalidateQueries({ queryKey: ['dashboard-trend'] });
      queryClient.invalidateQueries({ queryKey: ['profit-compare-current'] });
      queryClient.invalidateQueries({ queryKey: ['profit-compare-previous'] });
      window.dispatchEvent(new CustomEvent('report-cache-invalidate'));
      window.dispatchEvent(new CustomEvent('leaderboard-refresh'));
      window.dispatchEvent(new CustomEvent('ledger-updated'));
      window.dispatchEvent(new CustomEvent('points-updated'));
      toast.success("USDT订单已更新");
    } else {
      // 非管理员：按字段判断，需审核的只提交审核不直接更新
      const result = await submitBatchForApproval({
        module: 'order',
        changes,
        targetId: editingUsdtOrder.dbId,
        targetDescription: `USDT订单 ${editingUsdtOrder.id}`,
        originalData: originalUsdtOrder,
      });
      
      if (result.hasRejected) {
        toast.error(result.message);
        return;
      }
      
      // 有需审核的字段时，不直接更新订单
      if (result.pendingFields.length > 0) {
        toast.success(result.message);
        setIsUsdtEditDialogOpen(false);
        setEditingUsdtOrder(null);
        setOriginalUsdtOrder(null);
        await refetchUsdtOrders();
        return;
      }
      
      // 全部为可直接编辑的字段，执行更新
      const updates = buildUpdates();
      
      const { data, error } = await supabase
        .from('orders')
        .update(updates)
        .eq('id', editingUsdtOrder.dbId)
        .select('id');
      
      if (error) {
        toast.error(`更新失败: ${error.message}`);
        return;
      }
      
      if (!data || data.length === 0) {
        toast.error("更新失败: 未找到匹配的订单记录");
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
        `修改USDT订单: ${editingUsdtOrder.id}`
      );
        
      await refetchUsdtOrders();
      queryClient.invalidateQueries({ queryKey: ['dashboard-trend'] });
      queryClient.invalidateQueries({ queryKey: ['profit-compare-current'] });
      queryClient.invalidateQueries({ queryKey: ['profit-compare-previous'] });
      window.dispatchEvent(new CustomEvent('report-cache-invalidate'));
      window.dispatchEvent(new CustomEvent('leaderboard-refresh'));
      window.dispatchEvent(new CustomEvent('ledger-updated'));
      window.dispatchEvent(new CustomEvent('points-updated'));
      toast.success("USDT订单已更新");
    }
    
    setIsUsdtEditDialogOpen(false);
    setEditingUsdtOrder(null);
    setOriginalUsdtOrder(null);
    } finally {
      setIsUsdtEditSubmitting(false);
    }
  };

  const handleCancelUsdt = async (dbId: string) => {
    await cancelUsdtOrder(dbId);
    toast.success("USDT订单已取消");
  };

  const handleRestoreUsdt = (dbId: string) => {
    setRestoreUsdtOrderId(dbId);
  };

  const confirmRestoreUsdt = async () => {
    if (restoreUsdtOrderId) {
      await restoreUsdtOrder(restoreUsdtOrderId);
      toast.success("USDT订单已恢复为已完成");
      setRestoreUsdtOrderId(null);
    }
  };

  const handleDeleteUsdt = async (dbId: string) => {
    const success = await deleteUsdtOrder(dbId);
    if (success) {
      toast.success("USDT订单已删除");
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-2 pt-3">
          <div className={isMobile ? "space-y-3" : "flex items-center justify-between gap-3 flex-wrap"}>
            {/* 模式切换 */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-auto shrink-0">
              <TabsList className="grid grid-cols-2 h-9">
                <TabsTrigger value="normal" className="text-xs px-3">{isMobile ? "奈拉/赛地" : "赛地 / 奈拉模式"}</TabsTrigger>
                <TabsTrigger value="usdt" className="text-xs px-3">USDT{!isMobile && " 模式"}</TabsTrigger>
              </TabsList>
            </Tabs>
            {/* 搜索、筛选、刷新 */}
            <div className={isMobile ? "flex items-center gap-2 flex-wrap" : "flex items-center gap-3"}>
              <div className={isMobile ? "relative flex-1 min-w-0" : "relative"}>
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={t("搜索订单...", "Search orders...")}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className={isMobile ? "pl-9 w-full" : "pl-9 w-64"}
                />
              </div>
              <Button
                variant={showAdvancedFilter ? "secondary" : "outline"}
                size="sm"
                onClick={() => setShowAdvancedFilter(!showAdvancedFilter)}
                className="shrink-0"
              >
                <Filter className="h-4 w-4" />
                {!isMobile && <span className="ml-1">{t("筛选", "Filter")}</span>}
              </Button>
              <Button variant="outline" size="icon" onClick={handleRefresh} className="shrink-0">
                <RefreshCw className="h-4 w-4" />
              </Button>
              {!isMobile && (
                <>
                  <ColumnVisibilityDropdown
                    columns={activeTab === 'normal' ? normalOrderColumns : usdtOrderColumns}
                    visibleColumns={activeTab === 'normal' ? normalColumnVisibility.visibleColumns : usdtColumnVisibility.visibleColumns}
                    onToggleColumn={activeTab === 'normal' ? normalColumnVisibility.toggleColumn : usdtColumnVisibility.toggleColumn}
                    onReset={activeTab === 'normal' ? normalColumnVisibility.resetToDefault : usdtColumnVisibility.resetToDefault}
                  />
                  <TableImportButton tableName="orders" onImportComplete={() => {
                    refetchOrders();
                    refetchUsdtOrders();
                    queryClient.invalidateQueries({ queryKey: ['dashboard-trend'] });
                    queryClient.invalidateQueries({ queryKey: ['profit-compare-current'] });
                    queryClient.invalidateQueries({ queryKey: ['profit-compare-previous'] });
                    window.dispatchEvent(new CustomEvent('report-cache-invalidate'));
                    window.dispatchEvent(new CustomEvent('leaderboard-refresh'));
                  }} />
                  <Button variant="outline" size="sm" onClick={() => exportTableToCSV('orders', false, { tenantId: effectiveTenantId ?? undefined, useMyTenantRpc: !!(effectiveTenantId && currentEmployee?.tenant_id && effectiveTenantId === currentEmployee.tenant_id) })}>
                    <Download className="h-4 w-4" />
                    <span className="ml-1">{t("导出", "Export")}</span>
                  </Button>
                </>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* 统计汇总：始终可见，无需展开筛选 */}
          <div className="flex flex-wrap gap-4 pb-4 mb-4 border-b text-sm">
            <span>{t("筛选结果", "Results")}: <strong>{stats.totalOrders}</strong> {t("单", "orders")}</span>
            <span>{t("交易用户", "Trading Users")}: <strong>{stats.tradingUsers ?? 0}</strong></span>
            <span>{t("卡值总和", "Total Card Value")}: <strong>¥{(stats.totalCardValue ?? 0).toLocaleString()}</strong></span>
            <span>{t("利润总和", "Total Profit")}: <strong className="text-emerald-600">¥{(stats.totalProfit ?? 0).toLocaleString()}</strong></span>
          </div>
          {/* 高级筛选面板 */}
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
          
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">

            <TabsContent value="normal">
              <OrderTable
                orders={paginatedOrders}
                useCompactLayout={useCompactLayout}
                columnVisibility={normalColumnVisibility}
                sortConfig={orderSortConfig}
                onSort={requestOrderSort}
                onEdit={handleEdit}
                onCancel={handleCancel}
                onRestore={restoreOrder}
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
                onJumpToPage={() => handleJumpToPage(false)}
                t={t}
              />
            </TabsContent>

            {/* USDT模式 */}
            <TabsContent value="usdt">
              <OrderUsdtTable
                orders={paginatedUsdtOrders}
                useCompactLayout={useCompactLayout}
                columnVisibility={usdtColumnVisibility}
                sortConfig={usdtSortConfig}
                onSort={requestUsdtSort}
                onEdit={handleEditUsdt}
                onCancel={handleCancelUsdt}
                onRestore={restoreUsdtOrder}
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
                onJumpToPage={() => handleJumpToPage(true)}
                t={t}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* 编辑普通订单对话框 */}
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
      />
    </div>
  );
}
