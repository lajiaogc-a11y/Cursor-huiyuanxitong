import { useState, useMemo, useEffect } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from "@/components/ui/table";
import { StickyScrollTableContainer } from "@/components/ui/sticky-scroll-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useIsMobile, useIsTablet } from "@/hooks/use-mobile";
import { MobileCardList, MobileCard, MobileCardHeader, MobileCardRow, MobileCardCollapsible, MobilePagination, MobileEmptyState } from "@/components/ui/mobile-data-card";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useMerchantNameResolver } from "@/hooks/useNameResolver";
import { useActivityTypes } from "@/hooks/useActivityTypes";
import { useReportBaseData, useReportFilteredData } from "@/hooks/useReportData";
import { ReportFilters, ReportTabsList } from "@/components/report";
import {
  TimeRangeType,
  DateRange,
  getTimeRangeDates,
} from "@/lib/dateFilter";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { getFeeSettings, getUsdtFee, FeeSettings, getGiftDistributionSettings, getEmployeeManualGiftRatios, updateEmployeeManualGiftRatio } from "@/stores/systemSettings";

import { trackRender } from "@/lib/performanceUtils";
import {
  totalGlobalPositiveProfitNgnEquivalent,
  employeeProfitBuckets,
  sumProfitNgnForNonUsdt,
  sumProfitUsdtForUsdtOrders,
} from "@/lib/reportProfitAggregates";
import { ExportConfirmDialog } from "@/components/ExportConfirmDialog";
import { useExportConfirm } from "@/hooks/useExportConfirm";
import { exportToCSV, formatNumberForExport, formatPercentForExport } from "@/lib/exportUtils";
import { SortableTableHead, useSortableData, SortConfig } from "@/components/ui/sortable-table-head";
import { printTable } from "@/lib/printUtils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { lazy, Suspense } from "react";
import { lazyWithRetry } from "@/lib/lazyWithRetry";
const ProfitComparisonTab = lazyWithRetry(() => import("@/components/ProfitComparisonTab"));

// ============= 类型定义 =============

interface EmployeeProfitData {
  employeeId: string;
  employeeName: string;       // 员工姓名（real_name）
  orderCount: number;         // 订单总数（赛地/奈拉 + USDT模式）
  profitNgn: number;          // NGN/GHS正利润（利润 > 0）
  profitUsdt: number;         // USDT正利润（利润 > 0）
  errorProfitNgn: number;     // NGN/GHS负利润（错单，利润 < 0）
  errorProfitUsdt: number;    // USDT负利润（错单，利润 < 0）
  activityGiftRatio: number;  // 活动赠送占比
  activityGiftAmount: number; // 活动赠送金额
  manualGiftRatio: number;    // 手动设置占比（0-100）
  manualGiftAmount: number;   // 承担活动金额
}

interface CardReportData {
  cardType: string;
  orderCount: number;
  cardValueSum: number;
  profitNgn: number;
  profitUsdt: number;
}

interface VendorReportData {
  vendorId: string;
  vendorName: string;
  orderCount: number;
  cardValueSum: number;
  profitNgn: number;
  profitUsdt: number;
}

// 代付报表数据类型
interface PaymentProviderReportData {
  providerId: string;
  providerName: string;
  orderCount: number;         // 订单数量（已完成的）
  paymentValueNgnGhs: number; // 代付总额(人) - NGN/GHS模式的代付价值总和
  paymentValueUsdt: number;   // 代付总额(USDT) - USDT模式的代付价值总和
}

interface DailyReportData {
  date: string;
  orderCount: number;
  cardValueSum: number;
  paymentValueNgnGhs: number; // 代付价值（奈赛）总和
  paymentValueUsdt: number; // 代付价值USDT总和
  activityAmount: number;
  profitNgn: number;
  profitUsdt: number;
  totalProfit: number; // 总利润(人)
}

// 每月报表数据类型
interface MonthlyReportData {
  month: string;           // YYYY/MM
  orderCount: number;
  cardValueSum: number;
  paymentValueNgnGhs: number;
  paymentValueUsdt: number;
  activityAmount: number;
  profitNgn: number;
  profitUsdt: number;
  totalProfit: number;
}

// 需求4：活动报表数据类型 - 按日期+活动类型分组
interface ActivityReportData {
  date: string;
  activityType: string;
  activityTypeLabel: string;
  giftNgn: number;
  giftGhs: number;
  giftUsdt: number;
  giftValueTotal: number;
  effectCount: number;
}

// 分页配置
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];
const DEFAULT_PAGE_SIZE = 20;

/** 代付报表分组键：优先 orders.payment_provider（代付商家 UUID/名称），无则回退 vendor_id（历史数据） */
function orderPaymentAgentKey(o: { payment_provider?: string | null; vendor_id?: string | null }): string {
  const pp = String(o.payment_provider ?? "").trim();
  if (pp) return pp;
  return String(o.vendor_id ?? "").trim();
}

export default function ReportManagement() {
  // Performance tracking
  trackRender('ReportManagement');
  
  const { t } = useLanguage();
  const { employee } = useAuth();
  const queryClient = useQueryClient();
  const exportConfirm = useExportConfirm();
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  const useCompactLayout = isMobile || isTablet;
  const [activeTab, setActiveTab] = useState("employee");
  const [searchTerm, setSearchTerm] = useState("");
  // 日期筛选 - 需在 useReportFilteredData 之前定义
  const [selectedRange, setSelectedRange] = useState<TimeRangeType>("全部");
  const [dateRange, setDateRange] = useState<DateRange>(() => getTimeRangeDates("全部"));
  
  const { resolveCardName, resolveVendorName, resolveProviderName } = useMerchantNameResolver();
  
  const resolveVendorOrProviderName = (id: string | null | undefined) => {
    const vn = resolveVendorName(id);
    if (vn && vn !== id) return vn;
    const pn = resolveProviderName(id);
    if (pn && pn !== id) return pn;
    return vn || id || '';
  };
  
  // 活动类型列表 - 用于活动报表类型名称解析
  const { activityTypes } = useActivityTypes();
  
  // react-query 缓存；订单/活动变更时 invalidate；useReportData 已开启 remount/window focus 拉新，避免旧缓存
  const { employees, cards, vendors, providers: paymentProviders, isLoading: baseLoading } = useReportBaseData();
  const { orders, activityGifts, isLoading: filteredLoading } = useReportFilteredData(dateRange, employee);
  const loading = baseLoading || filteredLoading;
  
  // 手动占比数据状态
  const [manualRatios, setManualRatios] = useState<Record<string, number>>({});
  
  // 分页状态 - 每个标签页独立
  const [employeePage, setEmployeePage] = useState(1);
  const [employeePageSize, setEmployeePageSize] = useState(DEFAULT_PAGE_SIZE);
  const [cardPage, setCardPage] = useState(1);
  const [cardPageSize, setCardPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [vendorPage, setVendorPage] = useState(1);
  const [vendorPageSize, setVendorPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [dailyPage, setDailyPage] = useState(1);
  const [dailyPageSize, setDailyPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [monthlyPage, setMonthlyPage] = useState(1);
  const [monthlyPageSize, setMonthlyPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [activityPage, setActivityPage] = useState(1);
  const [activityPageSize, setActivityPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [providerPage, setProviderPage] = useState(1);
  const [providerPageSize, setProviderPageSize] = useState(DEFAULT_PAGE_SIZE);
  
  // 判断当前用户是否有权编辑手动设置占比（总管理员或管理员）
  const isSuperAdmin = employee?.is_super_admin === true;
  const canEditManualRatio = isSuperAdmin || employee?.role === 'admin';

  // USDT汇率 — 通过统一汇率层获取，用于每日/每月报表总利润计算
  const [usdtRateForReport, setUsdtRateForReport] = useState<number>(7.2);
  useEffect(() => {
    import('@/lib/resolveRates').then(({ resolveUsdtCnyRate }) =>
      resolveUsdtCnyRate().then(setUsdtRateForReport)
    ).catch(() => {/* fallback stays 7.2 */});
  }, []);
  
  // 加载手动占比数据
  useEffect(() => {
    const ratios = getEmployeeManualGiftRatios();
    setManualRatios(ratios);
  }, []);

  // 日期范围变化处理
  const handleDateRangeChange = (range: TimeRangeType, start?: Date, end?: Date) => {
    setSelectedRange(range);
    if (range === "自定义" && start && end) {
      setDateRange(getTimeRangeDates(range, start, end));
    } else {
      setDateRange(getTimeRangeDates(range));
    }
  };

  // ============= 员工利润报表 =============
  // 按员工姓名（real_name）匹配订单的销售员名称统计
  const employeeProfitData = useMemo<EmployeeProfitData[]>(() => {
    // 获取USDT汇率用于计算
    const usdtRate = getUsdtFee() || 1;
    
    // 获取活动赠送分配比例设置
    const distributionSettings = getGiftDistributionSettings();
    const distributionRatio = distributionSettings.enabled 
      ? distributionSettings.distributionRatio / 100 
      : 1;
    
    // 【关键修复】使用已过滤的订单数据（包含日期范围过滤）
    // 根据角色和日期范围过滤订单
    let filteredOrdersForProfit = employee?.role === 'staff' 
      ? orders.filter(o => o.creator_id === employee.id)
      : orders;
    
    // 应用日期范围过滤
    if (dateRange.start && dateRange.end) {
      const endDateBase = new Date(dateRange.end);
      const endDateWithTime = new Date(endDateBase.getFullYear(), endDateBase.getMonth(), endDateBase.getDate(), 23, 59, 59, 999);
      
      filteredOrdersForProfit = filteredOrdersForProfit.filter(order => {
        const orderDate = new Date(order.created_at);
        if (isNaN(orderDate.getTime())) return false;
        return orderDate >= dateRange.start! && orderDate <= endDateWithTime;
      });
    }
    
    // 【修复】排除已删除订单（is_deleted = true）
    const activeOrders = filteredOrdersForProfit.filter((o) => !o.is_deleted);
    
    // 计算全局总正利润（只计算利润>0的订单，用于计算活动赠送占比）
    const {
      ngnGhsPositive: allNgnGhsPositiveProfit,
      usdtPositive: allUsdtPositiveProfit,
      total: totalGlobalProfit,
    } = totalGlobalPositiveProfitNgnEquivalent(activeOrders, usdtRate);
    
    // 计算全局活动赠送总额（使用 gift_value 赠送价值字段）
    // 【关键修复】活动赠送也需要应用日期范围过滤
    let filteredGiftsForProfit = employee?.role === 'staff'
      ? activityGifts.filter(g => g.creator_id === employee.id)
      : activityGifts;
    
    if (dateRange.start && dateRange.end) {
      const endDateBase = new Date(dateRange.end);
      const endDateWithTime = new Date(endDateBase.getFullYear(), endDateBase.getMonth(), endDateBase.getDate(), 23, 59, 59, 999);
      
      filteredGiftsForProfit = filteredGiftsForProfit.filter(gift => {
        const giftDate = new Date(gift.created_at);
        if (isNaN(giftDate.getTime())) return false;
        return giftDate >= dateRange.start! && giftDate <= endDateWithTime;
      });
    }
    
    const totalGiftValue = filteredGiftsForProfit.reduce((sum, g) => sum + (Number(g.gift_value) || 0), 0);
    
    // 应用分配比例后的可分配金额
    const distributableGiftValue = totalGiftValue * distributionRatio;
    
    return employees.map((emp) => {
      // 按销售员ID匹配订单（creator_id 字段存储销售员ID）
      // 【修复】只统计未删除的订单
      const empOrders = activeOrders.filter(
        (o) => o.creator_id === emp.id
      );
      
      // 分离 NGN/GHS（赛地/奈拉模式）和 USDT 模式订单
      const ngnGhsOrders = empOrders.filter((o) => o.currency !== "USDT");
      const usdtOrders = empOrders.filter((o) => o.currency === "USDT");
      
      const {
        profitNgn,
        profitUsdt,
        errorProfitNgn,
        errorProfitUsdt,
      } = employeeProfitBuckets(ngnGhsOrders, usdtOrders);

      // 活动赠送占比 = (员工正利润NGN/GHS + 员工正利润USDT * USDT汇率) / (全局总正利润)
      // 注意：错单(负利润)不参与占比计算，只用正利润计算
      const empTotalProfit = profitNgn + (profitUsdt * usdtRate);
      // 确保活动赠送占比始终有效（即使有错单也不影响）
      const activityGiftRatio = totalGlobalProfit > 0 ? empTotalProfit / totalGlobalProfit : 0;
      
      // 活动赠送金额 = 可分配金额(应用分配比例后) * 活动赠送占比
      // 无论是否有错单，只要有正利润就计算活动赠送金额
      const activityGiftAmount = distributableGiftValue * activityGiftRatio;
      
      // 获取该员工的手动占比（默认为100%）
      const manualGiftRatio = manualRatios[emp.id] ?? 100;
      
      // 承担活动金额 = 手动占比 × 活动赠送金额
      const manualGiftAmount = (manualGiftRatio / 100) * activityGiftAmount;

      return {
        employeeId: emp.id,
        employeeName: emp.real_name ?? emp.username ?? '',  // 使用员工姓名（real_name），空时回退到 username
        orderCount: empOrders.length, // 订单总数 = 赛地/奈拉 + USDT模式
        profitNgn,
        profitUsdt,
        errorProfitNgn,
        errorProfitUsdt,
        activityGiftRatio,
        activityGiftAmount,
        manualGiftRatio,
        manualGiftAmount,
      };
    }).filter((e) => e.orderCount > 0); // 只显示有订单的员工
  }, [employees, orders, activityGifts, manualRatios, dateRange, employee]);

  // 根据用户角色过滤员工利润数据 - 员工只能看到自己的报表
  const filteredEmployeeProfitData = useMemo(() => {
    if (employee?.role === 'staff') {
      // 员工只能看到自己的订单报表
      return employeeProfitData.filter(e => e.employeeName === (employee?.real_name ?? ''));
    }
    // 管理员和主管可以看到所有
    return employeeProfitData;
  }, [employeeProfitData, employee]);

  // ============= 卡片报表 =============
  // 按 order_type (card_id) 统计每种卡片类型的卡价值总额
  // 统计规则：赛地/奈拉模式 + USDT模式下，该卡片类型在订单管理中的卡价值（amount字段）总和
  // 仅 status=completed 且未删除（is_deleted）；员工只能看到自己的订单数据
  const cardReportData = useMemo<CardReportData[]>(() => {
    // 根据角色过滤订单
    let filteredOrders = employee?.role === 'staff' 
      ? orders.filter(o => o.creator_id === employee.id)
      : orders;
    
    // 【关键修复】应用日期范围过滤
    if (dateRange.start && dateRange.end) {
      const endDateBase = new Date(dateRange.end);
      const endDateWithTime = new Date(endDateBase.getFullYear(), endDateBase.getMonth(), endDateBase.getDate(), 23, 59, 59, 999);
      
      filteredOrders = filteredOrders.filter(order => {
        const orderDate = new Date(order.created_at);
        if (isNaN(orderDate.getTime())) return false;
        return orderDate >= dateRange.start! && orderDate <= endDateWithTime;
      });
    }

    filteredOrders = filteredOrders.filter((o) => !o.is_deleted);
    
    // 获取所有唯一的 order_type (card_id)
    const orderTypes = [...new Set(filteredOrders.map((o) => o.order_type).filter(Boolean))];
    
    return orderTypes.map((cardId) => {
      // 按 card_id 统计，不按名称
      const matchedOrders = filteredOrders.filter(
        (o) => o.order_type === cardId && o.status === "completed"
      );
      
      const orderCount = matchedOrders.length;
      // 卡价值总额 = 赛地/奈拉模式 + USDT模式的卡价值（amount字段）总和
      const cardValueSum = matchedOrders.reduce(
        (sum, o) => sum + (Number(o.amount) || 0),
        0
      );
      
      const profitNgn = sumProfitNgnForNonUsdt(matchedOrders);
      const profitUsdt = sumProfitUsdtForUsdtOrders(matchedOrders);

      return {
        cardType: cardId, // 存储card_id，显示时通过resolveCardName解析为名称
        orderCount,
        cardValueSum,
        profitNgn,
        profitUsdt,
      };
    }).filter((c) => c.orderCount > 0);
  }, [orders, employee, dateRange]);

  // ============= 卡商报表 =============
  // 按 card_merchant_id 或 vendor_id 统计每个卡商/供应商的核销面值总额
  // 遗留订单中 card_merchant_id 可能为空，使用 vendor_id 作为兜底；仅 completed 且未删除
  const vendorReportData = useMemo<VendorReportData[]>(() => {
    let filteredOrders = employee?.role === 'staff' 
      ? orders.filter(o => o.creator_id === employee.id)
      : orders;
    
    if (dateRange.start && dateRange.end) {
      const endDateBase = new Date(dateRange.end);
      const endDateWithTime = new Date(endDateBase.getFullYear(), endDateBase.getMonth(), endDateBase.getDate(), 23, 59, 59, 999);
      
      filteredOrders = filteredOrders.filter(order => {
        const orderDate = new Date(order.created_at);
        if (isNaN(orderDate.getTime())) return false;
        return orderDate >= dateRange.start! && orderDate <= endDateWithTime;
      });
    }

    filteredOrders = filteredOrders.filter((o) => !o.is_deleted);
    
    const getVendorKey = (o: any) => o.card_merchant_id || o.vendor_id || '';
    const vendorIds = [...new Set(filteredOrders.map(getVendorKey).filter(Boolean))];
    
    return vendorIds.map((vendorId) => {
      const matchedOrders = filteredOrders.filter(
        (o) => getVendorKey(o) === vendorId && o.status === "completed"
      );
      
      const orderCount = matchedOrders.length;
      const cardValueSum = matchedOrders.reduce(
        (sum, o) => sum + (Number(o.amount) || 0),
        0
      );
      
      const profitNgn = sumProfitNgnForNonUsdt(matchedOrders);
      const profitUsdt = sumProfitUsdtForUsdtOrders(matchedOrders);

      return {
        vendorId: vendorId,
        vendorName: vendorId,
        orderCount,
        cardValueSum,
        profitNgn,
        profitUsdt,
      };
    }).filter((v) => v.orderCount > 0);
  }, [orders, employee, dateRange]);

  // ============= 代付报表 =============
  // 按 payment_provider（代付商家）优先、否则 vendor_id 统计；展示用 resolveVendorOrProviderName
  // 仅 status=completed 且未删除；员工只能看到自己的订单数据
  const paymentProviderReportData = useMemo<PaymentProviderReportData[]>(() => {
    // 根据角色过滤订单
    let filteredOrders = employee?.role === 'staff' 
      ? orders.filter(o => o.creator_id === employee.id)
      : orders;
    
    // 【关键修复】应用日期范围过滤
    if (dateRange.start && dateRange.end) {
      const endDateBase = new Date(dateRange.end);
      const endDateWithTime = new Date(endDateBase.getFullYear(), endDateBase.getMonth(), endDateBase.getDate(), 23, 59, 59, 999);
      
      filteredOrders = filteredOrders.filter(order => {
        const orderDate = new Date(order.created_at);
        if (isNaN(orderDate.getTime())) return false;
        return orderDate >= dateRange.start! && orderDate <= endDateWithTime;
      });
    }

    filteredOrders = filteredOrders.filter((o) => !o.is_deleted);
    
    const providerIds = [...new Set(filteredOrders.map(orderPaymentAgentKey).filter(Boolean))];
    
    return providerIds.map((providerId) => {
      const matchedOrders = filteredOrders.filter(
        (o) => orderPaymentAgentKey(o) === providerId && o.status === "completed"
      );
      
      const orderCount = matchedOrders.length;
      
      // 代付总额(人) = NGN/GHS模式的代付价值(payment_value)总和
      const paymentValueNgnGhs = matchedOrders
        .filter((o) => o.currency !== "USDT")
        .reduce((sum, o) => sum + (Number(o.payment_value) || 0), 0);
      
      // 代付总额(USDT) = USDT模式的代付价值(payment_value)总和
      const paymentValueUsdt = matchedOrders
        .filter((o) => o.currency === "USDT")
        .reduce((sum, o) => sum + (Number(o.payment_value) || 0), 0);

      return {
        providerId: providerId,
        providerName: providerId,
        orderCount,
        paymentValueNgnGhs,
        paymentValueUsdt,
      };
    }).filter((p) => p.orderCount > 0);
  }, [orders, employee, dateRange]);

  // ============= 每日报表 =============
  // 统计规则（仅 status=completed 且未删除 is_deleted；取消等非完成态不计入）：
  // - 卡价值总额 = 赛地/奈拉 + USDT 的卡价值(amount)总和
  // - 代付价值（奈赛）/ USDT 同上分列
  // - 活动发放 = 活动赠送 gift_value 当日总和
  // - 利润（人）/ 利润（USDT）= 各单 profit_ngn / profit_usdt 汇总
  // - 总利润（人）：
  //   · 若 profit_ngn、profit_usdt 聚合后至少一项非零：优先「直接利润折算法」
  //     = 利润(人) + 利润(USDT)×USDT汇率 − 活动发放（与库内 profit_* 一致）
  //   · 否则用公式法：卡价值总额 − 代付(奈赛) − 代付(USDT)×汇率 − 活动发放
  // 员工只能看到自己的订单数据
  const dailyReportData = useMemo<DailyReportData[]>(() => {
    // 根据角色过滤订单
    let filteredOrders = employee?.role === 'staff' 
      ? orders.filter(o => o.creator_id === employee.id)
      : orders;
    
    // 【关键修复】应用日期范围过滤到订单数据
    if (dateRange.start && dateRange.end) {
      // 将结束日期设置为当天的 23:59:59.999
      const endDateBase = new Date(dateRange.end);
      const endDateWithTime = new Date(endDateBase.getFullYear(), endDateBase.getMonth(), endDateBase.getDate(), 23, 59, 59, 999);
      
      filteredOrders = filteredOrders.filter(order => {
        const orderDate = new Date(order.created_at);
        if (isNaN(orderDate.getTime())) return false;
        return orderDate >= dateRange.start! && orderDate <= endDateWithTime;
      });
    }
    
    // 根据角色过滤活动赠送
    let filteredActivityGifts = employee?.role === 'staff'
      ? activityGifts.filter(g => g.creator_id === employee.id)
      : activityGifts;
    
    // 【关键修复】应用日期范围过滤到活动赠送数据
    if (dateRange.start && dateRange.end) {
      // 将结束日期设置为当天的 23:59:59.999
      const endDateBase = new Date(dateRange.end);
      const endDateWithTime = new Date(endDateBase.getFullYear(), endDateBase.getMonth(), endDateBase.getDate(), 23, 59, 59, 999);
      
      filteredActivityGifts = filteredActivityGifts.filter(gift => {
        const giftDate = new Date(gift.created_at);
        if (isNaN(giftDate.getTime())) return false;
        return giftDate >= dateRange.start! && giftDate <= endDateWithTime;
      });
    }
    
    // 当选择"全部"时，用订单数据中最早和最晚日期作为范围
    let startDate: Date;
    let endDate: Date;
    const today = new Date();
    // 【修复】定义今日结束时间为 23:59:59.999，确保当天所有时间点的数据都被包含
    const todayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);
    
    if (!dateRange.start || !dateRange.end) {
      // 【修复】"全部"模式：使用订单最早日期到今天（始终包含今日）
      if (filteredOrders.length === 0) {
        // 没有订单时，仍显示今日
        startDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        endDate = todayEnd;
      } else {
        const orderDates = filteredOrders.map(o => new Date(o.created_at)).filter(d => !isNaN(d.getTime()));
        startDate = orderDates.length > 0 
          ? new Date(Math.min(...orderDates.map(d => d.getTime()))) 
          : new Date(today.getFullYear(), today.getMonth(), today.getDate());
        // 【关键修复】"全部"模式始终包含今日
        endDate = todayEnd;
      }
    } else {
      // 【关键修复】将结束日期设置为当天的 23:59:59.999，确保包含当天所有数据
      startDate = new Date(dateRange.start);
      const endDateBase = new Date(dateRange.end);
      endDate = new Date(endDateBase.getFullYear(), endDateBase.getMonth(), endDateBase.getDate(), 23, 59, 59, 999);
    }
    
    const dateMap = new Map<string, DailyReportData>();
    
    // 使用本地日期格式生成日期键
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const dateKey = formatLocalDateKey(d);
      dateMap.set(dateKey, {
        date: formatDateDisplay(d),
        orderCount: 0,
        cardValueSum: 0,
        paymentValueNgnGhs: 0,
        paymentValueUsdt: 0,
        activityAmount: 0,
        profitNgn: 0,
        profitUsdt: 0,
        totalProfit: 0,
      });
    }

    // 统计订单数据 - 与每月报表一致：仅完成且未删除（排除取消等）
    filteredOrders.forEach((o) => {
      if (o.status !== "completed" || o.is_deleted) return;

      const orderDate = new Date(o.created_at);
      if (isNaN(orderDate.getTime())) return;
      const dateKey = formatLocalDateKey(orderDate);
      if (!dateMap.has(dateKey)) return;
      
      const data = dateMap.get(dateKey)!;
      data.orderCount += 1;
      // 卡价值总额使用 amount 字段（卡价值）
      data.cardValueSum += Number(o.amount) || 0;
      
      // 分别统计NGN/GHS和USDT的代付价值和利润
      if (o.currency === "USDT") {
        data.paymentValueUsdt += Number(o.payment_value) || 0;
        data.profitUsdt += Number(o.profit_usdt) || 0;
      } else {
        data.paymentValueNgnGhs += Number(o.payment_value) || 0;
        data.profitNgn += Number(o.profit_ngn) || 0;
      }
    });

    // 统计活动赠送金额 - 使用 gift_value 字段（赠送价值）
    filteredActivityGifts.forEach((gift) => {
      const giftDate = new Date(gift.created_at);
      if (isNaN(giftDate.getTime())) return;
      const dateKey = formatLocalDateKey(giftDate);
      if (!dateMap.has(dateKey)) return;
      
      const data = dateMap.get(dateKey)!;
      // 活动发放使用 gift_value 字段（赠送价值）
      data.activityAmount += Number(gift.gift_value) || 0;
    });

    // 获取USDT汇率用于计算总利润（从汇率计算页面的USDT汇率中价）
    const usdtExchangeRate = usdtRateForReport;

    return Array.from(dateMap.values()).map(data => {
      const directProfit = data.profitNgn + (data.profitUsdt * usdtExchangeRate);
      const formulaProfit = data.cardValueSum - data.paymentValueNgnGhs - (data.paymentValueUsdt * usdtExchangeRate) - data.activityAmount;
      const hasDirectProfit =
        (Number(data.profitNgn) || 0) !== 0 || (Number(data.profitUsdt) || 0) !== 0;
      return {
        ...data,
        totalProfit: hasDirectProfit ? directProfit - data.activityAmount : formulaProfit,
      };
    }).sort((a, b) => {
      const parseDate = (d: string) => {
        const [y, m, day] = d.split('/').map(Number);
        return new Date(y, m - 1, day).getTime();
      };
      return parseDate(b.date) - parseDate(a.date);
    });
  }, [orders, activityGifts, dateRange, employee, usdtRateForReport]);

  // ============= 每月报表 =============
  // 总利润（人）逻辑与每日一致：profit_* 有非零则直接折奈拉等价后减活动发放，否则公式法。
  const monthlyReportData = useMemo<MonthlyReportData[]>(() => {
    const filteredOrders = employee?.role === 'staff'
      ? orders.filter(o => o.creator_id === employee.id)
      : orders;
    const filteredGifts = employee?.role === 'staff'
      ? activityGifts.filter(g => g.creator_id === employee.id)
      : activityGifts;

    const usdtExchangeRate = usdtRateForReport;

    const monthMap = new Map<string, MonthlyReportData>();

    const ensureMonth = (monthKey: string) => {
      if (!monthMap.has(monthKey)) {
        monthMap.set(monthKey, {
          month: monthKey, orderCount: 0, cardValueSum: 0,
          paymentValueNgnGhs: 0, paymentValueUsdt: 0, activityAmount: 0,
          profitNgn: 0, profitUsdt: 0, totalProfit: 0,
        });
      }
      return monthMap.get(monthKey)!;
    };

    // 仅完成且未删除（排除取消等非完成态）
    filteredOrders.forEach((o) => {
      if (o.status !== "completed" || o.is_deleted) return;
      const d = new Date(o.created_at);
      if (isNaN(d.getTime())) return;
      const monthKey = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}`;
      
      const data = ensureMonth(monthKey);
      data.orderCount += 1;
      data.cardValueSum += Number(o.amount) || 0;
      if (o.currency === "USDT") {
        data.paymentValueUsdt += Number(o.payment_value) || 0;
        data.profitUsdt += Number(o.profit_usdt) || 0;
      } else {
        data.paymentValueNgnGhs += Number(o.payment_value) || 0;
        data.profitNgn += Number(o.profit_ngn) || 0;
      }
    });

    // 活动赠送也创建月份条目（即使该月无订单也统计）
    filteredGifts.forEach((gift) => {
      const d = new Date(gift.created_at);
      if (isNaN(d.getTime())) return;
      const monthKey = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}`;
      const data = ensureMonth(monthKey);
      data.activityAmount += Number(gift.gift_value) || 0;
    });

    return Array.from(monthMap.values()).map(data => {
      const directProfit = data.profitNgn + (data.profitUsdt * usdtExchangeRate);
      const formulaProfit = data.cardValueSum - data.paymentValueNgnGhs - (data.paymentValueUsdt * usdtExchangeRate) - data.activityAmount;
      const hasDirectProfit =
        (Number(data.profitNgn) || 0) !== 0 || (Number(data.profitUsdt) || 0) !== 0;
      return {
        ...data,
        totalProfit: hasDirectProfit ? directProfit - data.activityAmount : formulaProfit,
      };
    }).sort((a, b) => b.month.localeCompare(a.month));
  }, [orders, activityGifts, employee, usdtRateForReport]);

  // 需求4：活动报表 - 按日期+活动类型统计赠送数据（显示每天具体内容）
  const activityReportData = useMemo<ActivityReportData[]>(() => {
    // 根据角色过滤活动赠送
    let filteredGifts = employee?.role === 'staff'
      ? activityGifts.filter(g => g.creator_id === employee.id)
      : activityGifts;
    
    // 【修复】应用日期范围过滤，确保只显示指定日期范围内的活动赠送
    if (dateRange.start && dateRange.end) {
      // 【关键修复】将结束日期设置为当天的 23:59:59.999
      const endDateBase = new Date(dateRange.end);
      const endDateWithTime = new Date(endDateBase.getFullYear(), endDateBase.getMonth(), endDateBase.getDate(), 23, 59, 59, 999);
      
      filteredGifts = filteredGifts.filter(gift => {
        const giftDate = new Date(gift.created_at);
        if (isNaN(giftDate.getTime())) return false;
        return giftDate >= dateRange.start! && giftDate <= endDateWithTime;
      });
    }
    
    // 获取所有订单的电话号码集合
    const orderPhones = new Set(orders.map(o => o.phone_number).filter(Boolean));
    
    // 创建活动类型ID到标签的映射（从 activity_types 表）
    const typeIdToLabel = new Map<string, string>();
    activityTypes.forEach(t => {
      typeIdToLabel.set(t.value, t.label);
      typeIdToLabel.set(t.id, t.label);
    });
    
    // 按日期+活动类型分组
    const groupMap = new Map<string, {
      date: string;
      activityType: string;
      gifts: any[];
    }>();
    
    filteredGifts.forEach(gift => {
      if (!gift.gift_type) return;
      const giftDate = new Date(gift.created_at);
      if (isNaN(giftDate.getTime())) return;
      const dateKey = formatLocalDateKey(giftDate);
      const groupKey = `${dateKey}_${gift.gift_type}`;
      
      if (!groupMap.has(groupKey)) {
        groupMap.set(groupKey, {
          date: formatDateDisplay(giftDate),
          activityType: gift.gift_type,
          gifts: [],
        });
      }
      groupMap.get(groupKey)!.gifts.push(gift);
    });
    
    // 转换为报表数据
    const result: ActivityReportData[] = [];
    groupMap.forEach(({ date, activityType, gifts }) => {
      // 赠送奈拉 - 统计赠送币种是奈拉的赠送价值总和
      const giftNgn = gifts
        .filter(g => g.currency === 'NGN')
        .reduce((sum, g) => sum + (Number(g.gift_value) || 0), 0);
      
      // 赠送赛迪 - 统计赠送币种是赛迪的赠送价值总和
      const giftGhs = gifts
        .filter(g => g.currency === 'GHS')
        .reduce((sum, g) => sum + (Number(g.gift_value) || 0), 0);
      
      // 赠送USDT - 统计赠送币种是USDT的赠送价值总和
      const giftUsdt = gifts
        .filter(g => g.currency === 'USDT')
        .reduce((sum, g) => sum + (Number(g.gift_value) || 0), 0);
      
      // 赠送价值(人) = 该类型所有赠送价值的总和
      const giftValueTotal = gifts.reduce((sum, g) => sum + (Number(g.gift_value) || 0), 0);
      
      // 赠送效果 - 统计得到该类型赠送的客户电话号码在订单管理中有没有出现过订单
      const giftedPhones = [...new Set(gifts.map(g => g.phone_number).filter(Boolean))];
      const effectCount = giftedPhones.filter(phone => orderPhones.has(phone)).length;
      
      // 活动类型标签
      let activityTypeLabel = typeIdToLabel.get(activityType) || activityType;
      if (activityType === 'activity_1') {
        activityTypeLabel = '活动1兑换';
      } else if (activityType === 'activity_2') {
        activityTypeLabel = '活动2兑换';
      } else if (/^type_\d+$/i.test(activityType)) {
        activityTypeLabel = '自定义活动';
      }
      
      result.push({
        date,
        activityType,
        activityTypeLabel,
        giftNgn,
        giftGhs,
        giftUsdt,
        giftValueTotal,
        effectCount,
      });
    });
    
    // 按日期降序排序
    return result.sort((a, b) => {
      const parseDate = (d: string) => {
        const [y, m, day] = d.split('/').map(Number);
        return new Date(y, m - 1, day).getTime();
      };
      return parseDate(b.date) - parseDate(a.date);
    });
  }, [activityGifts, orders, employee, activityTypes, dateRange]);

  // 格式化本地日期为键值 (YYYY-MM-DD)
  function formatLocalDateKey(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // 格式化日期为显示格式
  function formatDateDisplay(date: Date): string {
    return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
  }

  const handleRefresh = async () => {
    await Promise.all([
      queryClient.refetchQueries({ queryKey: ['report-base'] }),
      queryClient.refetchQueries({ queryKey: ['report-filtered'] }),
    ]);
    toast.success("数据已刷新");
  };

  // 汇总统计数据（使用空值安全过滤）
  const searchLowerSafe = (searchTerm ?? '').toLowerCase();
  const employeeSummary = useMemo(() => {
    const data = filteredEmployeeProfitData.filter(item => 
      (item.employeeName ?? '').toLowerCase().includes(searchLowerSafe)
    );
    return {
      orderCount: data.reduce((sum, d) => sum + d.orderCount, 0),
      profitNgn: data.reduce((sum, d) => sum + d.profitNgn, 0),
      profitUsdt: data.reduce((sum, d) => sum + d.profitUsdt, 0),
      errorProfitNgn: data.reduce((sum, d) => sum + d.errorProfitNgn, 0),
      errorProfitUsdt: data.reduce((sum, d) => sum + d.errorProfitUsdt, 0),
      activityGiftAmount: data.reduce((sum, d) => sum + d.activityGiftAmount, 0),
      manualGiftAmount: data.reduce((sum, d) => sum + d.manualGiftAmount, 0),
    };
  }, [filteredEmployeeProfitData, searchTerm, searchLowerSafe]);
  
  // 手动占比更新函数
  const handleManualRatioChange = async (employeeId: string, value: string) => {
    const ratio = Math.min(100, Math.max(0, parseFloat(value) || 0));
    
    // 立即更新本地状态
    setManualRatios(prev => ({ ...prev, [employeeId]: ratio }));
    
    // 保存到数据库
    try {
      await updateEmployeeManualGiftRatio(employeeId, ratio);
    } catch (error) {
      console.error('Failed to update manual ratio:', error);
      toast.error(t('保存失败', 'Save failed'));
    }
  };

  const cardSummary = useMemo(() => {
    const data = cardReportData.filter(item => 
      (item.cardType ?? '').toLowerCase().includes(searchLowerSafe)
    );
    return {
      orderCount: data.reduce((sum, d) => sum + d.orderCount, 0),
      cardValueSum: data.reduce((sum, d) => sum + d.cardValueSum, 0),
      profitNgn: data.reduce((sum, d) => sum + d.profitNgn, 0),
      profitUsdt: data.reduce((sum, d) => sum + d.profitUsdt, 0),
    };
  }, [cardReportData, searchTerm, searchLowerSafe]);

  const vendorSummary = useMemo(() => {
    const data = vendorReportData.filter(item => 
      (item.vendorName ?? '').toLowerCase().includes(searchLowerSafe)
    );
    return {
      orderCount: data.reduce((sum, d) => sum + d.orderCount, 0),
      cardValueSum: data.reduce((sum, d) => sum + d.cardValueSum, 0),
      profitNgn: data.reduce((sum, d) => sum + d.profitNgn, 0),
      profitUsdt: data.reduce((sum, d) => sum + d.profitUsdt, 0),
    };
  }, [vendorReportData, searchTerm, searchLowerSafe]);

  const providerSummary = useMemo(() => {
    const data = paymentProviderReportData.filter((item) => {
      const raw = (item.providerName ?? "").toLowerCase();
      if (raw.includes(searchLowerSafe)) return true;
      return resolveVendorOrProviderName(item.providerName).toLowerCase().includes(searchLowerSafe);
    });
    return {
      orderCount: data.reduce((sum, d) => sum + d.orderCount, 0),
      paymentValueNgnGhs: data.reduce((sum, d) => sum + d.paymentValueNgnGhs, 0),
      paymentValueUsdt: data.reduce((sum, d) => sum + d.paymentValueUsdt, 0),
    };
  }, [paymentProviderReportData, searchTerm, searchLowerSafe]);

  const dailySummary = useMemo(() => {
    const data = dailyReportData.filter(item => String(item.date ?? '').includes(searchTerm));
    return {
      orderCount: data.reduce((sum, d) => sum + d.orderCount, 0),
      cardValueSum: data.reduce((sum, d) => sum + d.cardValueSum, 0),
      paymentValueNgnGhs: data.reduce((sum, d) => sum + d.paymentValueNgnGhs, 0),
      paymentValueUsdt: data.reduce((sum, d) => sum + d.paymentValueUsdt, 0),
      activityAmount: data.reduce((sum, d) => sum + d.activityAmount, 0),
      profitNgn: data.reduce((sum, d) => sum + d.profitNgn, 0),
      profitUsdt: data.reduce((sum, d) => sum + d.profitUsdt, 0),
      totalProfit: data.reduce((sum, d) => sum + d.totalProfit, 0),
    };
  }, [dailyReportData, searchTerm]);

  const monthlySummary = useMemo(() => {
    const data = monthlyReportData.filter(item => String(item.month ?? '').includes(searchTerm));
    return {
      orderCount: data.reduce((sum, d) => sum + d.orderCount, 0),
      cardValueSum: data.reduce((sum, d) => sum + d.cardValueSum, 0),
      paymentValueNgnGhs: data.reduce((sum, d) => sum + d.paymentValueNgnGhs, 0),
      paymentValueUsdt: data.reduce((sum, d) => sum + d.paymentValueUsdt, 0),
      activityAmount: data.reduce((sum, d) => sum + d.activityAmount, 0),
      profitNgn: data.reduce((sum, d) => sum + d.profitNgn, 0),
      profitUsdt: data.reduce((sum, d) => sum + d.profitUsdt, 0),
      totalProfit: data.reduce((sum, d) => sum + d.totalProfit, 0),
    };
  }, [monthlyReportData, searchTerm]);

  const activitySummary = useMemo(() => {
    const data = activityReportData.filter(item => 
      (item.activityTypeLabel ?? '').toLowerCase().includes(searchLowerSafe)
    );
    return {
      giftNgn: data.reduce((sum, d) => sum + d.giftNgn, 0),
      giftGhs: data.reduce((sum, d) => sum + d.giftGhs, 0),
      giftUsdt: data.reduce((sum, d) => sum + d.giftUsdt, 0),
      giftValueTotal: data.reduce((sum, d) => sum + d.giftValueTotal, 0),
      effectCount: data.reduce((sum, d) => sum + d.effectCount, 0),
    };
  }, [activityReportData, searchTerm, searchLowerSafe]);

  const handleExport = () => {
    const isEn = false; // 使用中文导出
    
    switch (activeTab) {
      case 'employee': {
        const data = filteredEmployeeProfitData.filter(item => 
          (item.employeeName ?? '').toLowerCase().includes(searchLowerSafe)
        );
        exportToCSV(data, [
          { key: 'employeeName', label: '员工姓名', labelEn: 'Employee' },
          { key: 'orderCount', label: '订单总数', labelEn: 'Orders' },
          { key: 'profitNgn', label: '利润(NGN/GHS)', labelEn: 'Profit NGN/GHS', formatter: (v) => formatNumberForExport(v) },
          { key: 'profitUsdt', label: '利润(USDT)', labelEn: 'Profit USDT', formatter: (v) => formatNumberForExport(v) },
          { key: 'errorProfitNgn', label: '错单(NGN/GHS)', labelEn: 'Loss NGN/GHS', formatter: (v) => formatNumberForExport(v) },
          { key: 'errorProfitUsdt', label: '错单(USDT)', labelEn: 'Loss USDT', formatter: (v) => formatNumberForExport(v) },
          { key: 'activityGiftRatio', label: '活动赠送占比', labelEn: 'Gift Ratio', formatter: (v) => formatPercentForExport(v) },
          { key: 'activityGiftAmount', label: '活动赠送金额', labelEn: 'Gift Amount', formatter: (v) => formatNumberForExport(v) },
          { key: 'manualGiftRatio', label: '手动设置占比', labelEn: 'Manual Ratio', formatter: (v) => `${v.toFixed(2)}%` },
          { key: 'manualGiftAmount', label: '承担活动金额', labelEn: 'Manual Amount', formatter: (v) => formatNumberForExport(v) },
        ], '员工利润报表', isEn);
        toast.success(t('导出成功', 'Export successful'));
        break;
      }
      case 'card': {
        const data = cardReportData.filter(item => 
          (item.cardType ?? '').toLowerCase().includes(searchLowerSafe)
        );
        exportToCSV(data, [
          { key: 'cardType', label: '卡片类型', labelEn: 'Card Type', formatter: (v) => resolveCardName(v) },
          { key: 'orderCount', label: '订单数量', labelEn: 'Orders' },
          { key: 'cardValueSum', label: '卡价值总额', labelEn: 'Card Value', formatter: (v) => formatNumberForExport(v) },
          { key: 'profitNgn', label: '利润(NGN/GHS)', labelEn: 'Profit NGN/GHS', formatter: (v) => formatNumberForExport(v) },
          { key: 'profitUsdt', label: '利润(USDT)', labelEn: 'Profit USDT', formatter: (v) => formatNumberForExport(v) },
        ], '卡片报表', isEn);
        toast.success(t('导出成功', 'Export successful'));
        break;
      }
      case 'vendor': {
        const data = vendorReportData.filter(item => 
          (item.vendorName ?? '').toLowerCase().includes(searchLowerSafe)
        );
        exportToCSV(data, [
          { key: 'vendorName', label: '卡商名称', labelEn: 'Vendor', formatter: (v) => resolveVendorOrProviderName(v) },
          { key: 'orderCount', label: '订单数量', labelEn: 'Orders' },
          { key: 'cardValueSum', label: '核销面值总额', labelEn: 'Verified Value', formatter: (v) => formatNumberForExport(v) },
          { key: 'profitNgn', label: '利润(NGN/GHS)', labelEn: 'Profit NGN/GHS', formatter: (v) => formatNumberForExport(v) },
          { key: 'profitUsdt', label: '利润(USDT)', labelEn: 'Profit USDT', formatter: (v) => formatNumberForExport(v) },
        ], '卡商报表', isEn);
        toast.success(t('导出成功', 'Export successful'));
        break;
      }
      case 'provider': {
        const data = paymentProviderReportData.filter((item) => {
          const raw = (item.providerName ?? "").toLowerCase();
          if (raw.includes(searchLowerSafe)) return true;
          return resolveVendorOrProviderName(item.providerName).toLowerCase().includes(searchLowerSafe);
        });
        exportToCSV(data, [
          { key: 'providerName', label: '商家名称', labelEn: 'Provider', formatter: (v) => resolveVendorOrProviderName(v) },
          { key: 'orderCount', label: '订单数量', labelEn: 'Orders' },
          { key: 'paymentValueNgnGhs', label: '代付总额(人)', labelEn: 'Payment NGN/GHS', formatter: (v) => formatNumberForExport(v) },
          { key: 'paymentValueUsdt', label: '代付总额(USDT)', labelEn: 'Payment USDT', formatter: (v) => formatNumberForExport(v) },
        ], '代付报表', isEn);
        toast.success(t('导出成功', 'Export successful'));
        break;
      }
      case 'daily': {
        const data = dailyReportData.filter(item => String(item.date ?? '').includes(searchTerm));
        exportToCSV(data, [
          { key: 'date', label: '日期', labelEn: 'Date' },
          { key: 'orderCount', label: '订单数量', labelEn: 'Orders' },
          { key: 'cardValueSum', label: '卡价值总额', labelEn: 'Card Value', formatter: (v) => formatNumberForExport(v) },
          { key: 'paymentValueNgnGhs', label: '代付价值(奈赛)总和', labelEn: 'Payment NGN/GHS', formatter: (v) => formatNumberForExport(v) },
          { key: 'paymentValueUsdt', label: '代付价值USDT总和', labelEn: 'Payment USDT', formatter: (v) => formatNumberForExport(v) },
          { key: 'activityAmount', label: '活动发放', labelEn: 'Activity', formatter: (v) => formatNumberForExport(v) },
          { key: 'profitNgn', label: '利润(人)', labelEn: 'Profit NGN/GHS', formatter: (v) => formatNumberForExport(v) },
          { key: 'profitUsdt', label: '利润(USDT)', labelEn: 'Profit USDT', formatter: (v) => formatNumberForExport(v) },
          { key: 'totalProfit', label: '总利润(人)', labelEn: 'Total Profit', formatter: (v) => formatNumberForExport(v) },
        ], '每日报表', isEn);
        toast.success(t('导出成功', 'Export successful'));
        break;
      }
      case 'monthly': {
        const data = monthlyReportData.filter(item => String(item.month ?? '').includes(searchTerm));
        exportToCSV(data, [
          { key: 'month', label: '月份', labelEn: 'Month' },
          { key: 'orderCount', label: '订单数量', labelEn: 'Orders' },
          { key: 'cardValueSum', label: '卡价值总额', labelEn: 'Card Value', formatter: (v) => formatNumberForExport(v) },
          { key: 'paymentValueNgnGhs', label: '代付价值(奈赛)总和', labelEn: 'Payment NGN/GHS', formatter: (v) => formatNumberForExport(v) },
          { key: 'paymentValueUsdt', label: '代付价值USDT总和', labelEn: 'Payment USDT', formatter: (v) => formatNumberForExport(v) },
          { key: 'activityAmount', label: '活动发放', labelEn: 'Activity', formatter: (v) => formatNumberForExport(v) },
          { key: 'profitNgn', label: '利润(人)', labelEn: 'Profit NGN/GHS', formatter: (v) => formatNumberForExport(v) },
          { key: 'profitUsdt', label: '利润(USDT)', labelEn: 'Profit USDT', formatter: (v) => formatNumberForExport(v) },
          { key: 'totalProfit', label: '总利润(人)', labelEn: 'Total Profit', formatter: (v) => formatNumberForExport(v) },
        ], '每月报表', isEn);
        toast.success(t('导出成功', 'Export successful'));
        break;
      }
      case 'activity': {
        const data = activityReportData.filter(item => 
          (item.activityTypeLabel ?? '').toLowerCase().includes(searchLowerSafe) || String(item.date ?? '').includes(searchTerm)
        );
        exportToCSV(data, [
          { key: 'date', label: '日期', labelEn: 'Date' },
          { key: 'activityTypeLabel', label: '活动类型', labelEn: 'Activity Type' },
          { key: 'giftNgn', label: '赠送奈拉', labelEn: 'Gift NGN', formatter: (v) => formatNumberForExport(v) },
          { key: 'giftGhs', label: '赠送赛迪', labelEn: 'Gift GHS', formatter: (v) => formatNumberForExport(v) },
          { key: 'giftUsdt', label: '赠送USDT', labelEn: 'Gift USDT', formatter: (v) => formatNumberForExport(v) },
          { key: 'giftValueTotal', label: '赠送价值(人)', labelEn: 'Gift Value', formatter: (v) => formatNumberForExport(v) },
          { key: 'effectCount', label: '赠送效果', labelEn: 'Effect Count' },
        ], '活动报表', isEn);
        toast.success(t('导出成功', 'Export successful'));
        break;
      }
    }
  };

  // 打印当前报表
  const handlePrint = () => {
    let headers: string[] = [];
    let rows: (string | number)[][] = [];
    let title = '';
    
    switch (activeTab) {
      case 'employee':
        headers = ['员工姓名', '订单总数', '利润(NGN/GHS)', '利润(USDT)', '错单(NGN/GHS)', '错单(USDT)', '活动赠送占比', '活动赠送金额', '手动设置占比', '承担活动金额'];
        rows = filteredEmployeeProfitData.map(item => [
          item.employeeName, item.orderCount, formatNumber(item.profitNgn), formatNumber(item.profitUsdt),
          formatNumber(item.errorProfitNgn), formatNumber(item.errorProfitUsdt),
          `${(item.activityGiftRatio * 100).toFixed(2)}%`, formatNumber(item.activityGiftAmount),
          `${item.manualGiftRatio.toFixed(2)}%`, formatNumber(item.manualGiftAmount)
        ]);
        title = '员工利润报表';
        break;
      case 'card':
        headers = ['卡片类型', '订单数量', '卡价值总额', '利润(NGN/GHS)', '利润(USDT)'];
        rows = cardReportData.map(item => [
          resolveCardName(item.cardType), item.orderCount, formatNumber(item.cardValueSum),
          formatNumber(item.profitNgn), formatNumber(item.profitUsdt)
        ]);
        title = '卡片报表';
        break;
      case 'vendor':
        headers = ['卡商名称', '订单数量', '核销面值总额', '利润(NGN/GHS)', '利润(USDT)'];
        rows = vendorReportData.map(item => [
          resolveVendorOrProviderName(item.vendorName), item.orderCount, formatNumber(item.cardValueSum),
          formatNumber(item.profitNgn), formatNumber(item.profitUsdt)
        ]);
        title = '卡商报表';
        break;
      case 'provider':
        headers = ['商家名称', '订单数量', '代付总额(人)', '代付总额(USDT)'];
        rows = paymentProviderReportData.map(item => [
          resolveVendorOrProviderName(item.providerName), item.orderCount,
          formatNumber(item.paymentValueNgnGhs), formatNumber(item.paymentValueUsdt)
        ]);
        title = '代付报表';
        break;
      case 'daily':
        headers = ['日期', '订单数量', '卡价值总额', '代付价值(奈赛)', '代付价值USDT', '活动发放', '利润(人)', '利润(USDT)', '总利润(人)'];
        rows = dailyReportData.map(item => [
          item.date, item.orderCount, formatNumber(item.cardValueSum), formatNumber(item.paymentValueNgnGhs),
          formatNumber(item.paymentValueUsdt), formatNumber(item.activityAmount),
          formatNumber(item.profitNgn), formatNumber(item.profitUsdt), formatNumber(item.totalProfit)
        ]);
        title = '每日报表';
        break;
      case 'monthly':
        headers = ['月份', '订单数量', '卡价值总额', '代付价值(奈赛)', '代付价值USDT', '活动发放', '利润(人)', '利润(USDT)', '总利润(人)'];
        rows = monthlyReportData.map(item => [
          item.month, item.orderCount, formatNumber(item.cardValueSum), formatNumber(item.paymentValueNgnGhs),
          formatNumber(item.paymentValueUsdt), formatNumber(item.activityAmount),
          formatNumber(item.profitNgn), formatNumber(item.profitUsdt), formatNumber(item.totalProfit)
        ]);
        title = '每月报表';
        break;
      case 'activity':
        headers = ['日期', '活动类型', '赠送奈拉', '赠送赛迪', '赠送USDT', '赠送价值(人)', '赠送效果'];
        rows = activityReportData.map(item => [
          item.date, item.activityTypeLabel, formatNumber(item.giftNgn), formatNumber(item.giftGhs),
          formatNumber(item.giftUsdt), formatNumber(item.giftValueTotal), item.effectCount
        ]);
        title = '活动报表';
        break;
    }
    
    printTable(headers, rows, title);
  };

  // 排序状态
  const [employeeSort, setEmployeeSort] = useState<SortConfig | undefined>(undefined);
  const [cardSort, setCardSort] = useState<SortConfig | undefined>(undefined);
  const [vendorSort, setVendorSort] = useState<SortConfig | undefined>(undefined);
  const [providerSort, setProviderSort] = useState<SortConfig | undefined>(undefined);
  const [dailySort, setDailySort] = useState<SortConfig | undefined>(undefined);
  const [monthlySort, setMonthlySort] = useState<SortConfig | undefined>(undefined);
  const [activitySort, setActivitySort] = useState<SortConfig | undefined>(undefined);

  // 排序后的数据（使用空值安全过滤，避免 null/undefined 调用 toLowerCase 导致 TypeError）
  const searchLower = (searchTerm ?? '').toLowerCase();
  const { sortedData: sortedEmployeeData, requestSort: requestEmployeeSort, sortConfig: employeeSortConfig } = 
    useSortableData(filteredEmployeeProfitData.filter(item => (item.employeeName ?? '').toLowerCase().includes(searchLower)), employeeSort);
  const { sortedData: sortedCardData, requestSort: requestCardSort, sortConfig: cardSortConfig } = 
    useSortableData(cardReportData.filter(item => (item.cardType ?? '').toLowerCase().includes(searchLower)), cardSort);
  const { sortedData: sortedVendorData, requestSort: requestVendorSort, sortConfig: vendorSortConfig } = 
    useSortableData(vendorReportData.filter(item => (item.vendorName ?? '').toLowerCase().includes(searchLower)), vendorSort);
  const { sortedData: sortedProviderData, requestSort: requestProviderSort, sortConfig: providerSortConfig } = 
    useSortableData(
      paymentProviderReportData.filter((item) => {
        const raw = (item.providerName ?? "").toLowerCase();
        if (raw.includes(searchLower)) return true;
        return resolveVendorOrProviderName(item.providerName).toLowerCase().includes(searchLower);
      }),
      providerSort,
    );
  const { sortedData: sortedDailyData, requestSort: requestDailySort, sortConfig: dailySortConfig } = 
    useSortableData(dailyReportData.filter(item => String(item.date ?? '').includes(searchTerm)), dailySort);
  const { sortedData: sortedMonthlyData, requestSort: requestMonthlySort, sortConfig: monthlySortConfig } = 
    useSortableData(monthlyReportData.filter(item => String(item.month ?? '').includes(searchTerm)), monthlySort);
  const { sortedData: sortedActivityData, requestSort: requestActivitySort, sortConfig: activitySortConfig } = 
    useSortableData(activityReportData.filter(item => (item.activityTypeLabel ?? '').toLowerCase().includes(searchLower) || String(item.date ?? '').includes(searchTerm)), activitySort);

  // 分页后的数据
  const paginatedEmployeeData = useMemo(() => {
    const start = (employeePage - 1) * employeePageSize;
    return sortedEmployeeData.slice(start, start + employeePageSize);
  }, [sortedEmployeeData, employeePage, employeePageSize]);

  const paginatedCardData = useMemo(() => {
    const start = (cardPage - 1) * cardPageSize;
    return sortedCardData.slice(start, start + cardPageSize);
  }, [sortedCardData, cardPage, cardPageSize]);

  const paginatedVendorData = useMemo(() => {
    const start = (vendorPage - 1) * vendorPageSize;
    return sortedVendorData.slice(start, start + vendorPageSize);
  }, [sortedVendorData, vendorPage, vendorPageSize]);

  const paginatedProviderData = useMemo(() => {
    const start = (providerPage - 1) * providerPageSize;
    return sortedProviderData.slice(start, start + providerPageSize);
  }, [sortedProviderData, providerPage, providerPageSize]);

  const paginatedDailyData = useMemo(() => {
    const start = (dailyPage - 1) * dailyPageSize;
    return sortedDailyData.slice(start, start + dailyPageSize);
  }, [sortedDailyData, dailyPage, dailyPageSize]);

  const paginatedMonthlyData = useMemo(() => {
    const start = (monthlyPage - 1) * monthlyPageSize;
    return sortedMonthlyData.slice(start, start + monthlyPageSize);
  }, [sortedMonthlyData, monthlyPage, monthlyPageSize]);

  const paginatedActivityData = useMemo(() => {
    const start = (activityPage - 1) * activityPageSize;
    return sortedActivityData.slice(start, start + activityPageSize);
  }, [sortedActivityData, activityPage, activityPageSize]);

  // 总页数
  const employeeTotalPages = Math.ceil(sortedEmployeeData.length / employeePageSize);
  const cardTotalPages = Math.ceil(sortedCardData.length / cardPageSize);
  const vendorTotalPages = Math.ceil(sortedVendorData.length / vendorPageSize);
  const dailyTotalPages = Math.ceil(sortedDailyData.length / dailyPageSize);
  const monthlyTotalPages = Math.ceil(sortedMonthlyData.length / monthlyPageSize);
  const activityTotalPages = Math.ceil(sortedActivityData.length / activityPageSize);
  const providerTotalPages = Math.ceil(sortedProviderData.length / providerPageSize);

  // 搜索/筛选变化时重置页码
  useEffect(() => {
    setEmployeePage(1);
    setCardPage(1);
    setVendorPage(1);
    setProviderPage(1);
    setDailyPage(1);
    setMonthlyPage(1);
    setActivityPage(1);
  }, [searchTerm, dateRange]);

  // 分页控件 - 使用渲染函数而非组件避免ref警告
  const renderPaginationControls = ({ 
    currentPage, 
    totalPages, 
    totalItems, 
    pageSize, 
    onPageChange, 
    onPageSizeChange 
  }: { 
    currentPage: number; 
    totalPages: number; 
    totalItems: number; 
    pageSize: number; 
    onPageChange: (page: number) => void; 
    onPageSizeChange: (size: number) => void;
  }) => {
    if (totalItems === 0) return null;
    const startItem = (currentPage - 1) * pageSize + 1;
    const endItem = Math.min(currentPage * pageSize, totalItems);
    
    return (
      <div className={isMobile ? "flex flex-col gap-2 py-2 px-1 border-t" : "flex items-center justify-between py-2 px-1 border-t"}>
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <span className="text-xs text-muted-foreground shrink-0">{t("每页", "Per page")}</span>
          <Select value={pageSize.toString()} onValueChange={(v) => { onPageSizeChange(parseInt(v)); onPageChange(1); }}>
            <SelectTrigger className="h-7 w-[70px] text-xs shrink-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map(size => (
                <SelectItem key={size} value={size.toString()}>{size}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground shrink-0">{t("条", "items")}</span>
          <span className="text-xs text-muted-foreground truncate">
            {startItem}-{endItem} / {totalItems}
          </span>
        </div>
        <div className={isMobile ? "flex items-center justify-center gap-1" : "flex items-center gap-1 shrink-0"}>
          <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => onPageChange(currentPage - 1)} disabled={currentPage <= 1}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-xs px-2 whitespace-nowrap">{currentPage} / {totalPages || 1}</span>
          <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => onPageChange(currentPage + 1)} disabled={currentPage >= totalPages}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  };

  // 格式化数字显示
  const formatNumber = (num: number) => {
    return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  return (
    <div className="flex flex-col h-full gap-2 overflow-x-hidden">
      <ReportFilters
        activeTab={activeTab}
        selectedRange={selectedRange}
        dateRange={dateRange}
        onDateRangeChange={handleDateRangeChange}
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        onRefresh={handleRefresh}
        onExport={() => exportConfirm.requestExport(handleExport)}
        onPrint={handlePrint}
        isMobile={isMobile}
      />

      <Card className="flex-1 min-h-0 flex flex-col overflow-hidden">
        <CardHeader className={isMobile ? "py-2 px-2" : "py-2 px-4"}>
          <ReportTabsList
            activeTab={activeTab}
            onTabChange={setActiveTab}
            isMobile={isMobile}
          />
        </CardHeader>
        <CardContent className={`${isMobile ? "py-2 px-2" : "py-2 px-4"} flex-1 min-h-0 flex flex-col overflow-x-hidden`}>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
              <span className="ml-2 text-muted-foreground">{t("加载中...", "Loading...")}</span>
            </div>
          ) : (
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsContent value="employee" className="mt-0 flex flex-col">
                {useCompactLayout ? (
                  <MobileCardList>
                    {paginatedEmployeeData.length === 0 ? (
                      <MobileEmptyState message={t("暂无数据", "No data")} />
                    ) : paginatedEmployeeData.map((item) => (
                      <MobileCard key={item.employeeId} accent="default">
                        <MobileCardHeader>
                          <span className="font-medium text-sm">{item.employeeName}</span>
                          <Badge variant="outline" className="text-xs">{item.orderCount} {t("单", "orders")}</Badge>
                        </MobileCardHeader>
                        <MobileCardRow label={t("利润(NGN/GHS)", "Profit NGN/GHS")} value={formatNumber(item.profitNgn)} highlight />
                        <MobileCardRow label={t("利润(USDT)", "Profit USDT")} value={formatNumber(item.profitUsdt)} highlight />
                        <MobileCardCollapsible>
                          <MobileCardRow label={t("错单(NGN/GHS)", "Loss NGN/GHS")} value={<span className="text-destructive">{formatNumber(item.errorProfitNgn)}</span>} />
                          <MobileCardRow label={t("错单(USDT)", "Loss USDT")} value={<span className="text-destructive">{formatNumber(item.errorProfitUsdt)}</span>} />
                          <MobileCardRow label={t("活动赠送占比", "Gift Ratio")} value={`${(item.activityGiftRatio * 100).toFixed(2)}%`} />
                          <MobileCardRow label={t("活动赠送金额", "Gift Amount")} value={formatNumber(item.activityGiftAmount)} />
                          <MobileCardRow label={t("手动设置占比", "Manual Ratio")} value={`${item.manualGiftRatio.toFixed(2)}%`} />
                          <MobileCardRow label={t("承担活动金额", "Manual Amount")} value={formatNumber(item.manualGiftAmount)} />
                        </MobileCardCollapsible>
                      </MobileCard>
                    ))}
                    <MobilePagination currentPage={employeePage} totalPages={employeeTotalPages} totalItems={sortedEmployeeData.length} onPageChange={setEmployeePage} pageSize={employeePageSize} onPageSizeChange={(s) => { setEmployeePageSize(s); setEmployeePage(1); }} />
                  </MobileCardList>
                ) : (
                <>
                <StickyScrollTableContainer minWidth="1400px">
                  <Table className="text-xs">
                    <TableHeader className="sticky top-0 z-10 bg-muted/80 backdrop-blur-sm">
                      <TableRow>
                        <SortableTableHead sortKey="employeeName" currentSort={employeeSortConfig} onSort={requestEmployeeSort} className="text-center px-1.5">{t("员工姓名", "Employee")}</SortableTableHead>
                        <SortableTableHead sortKey="orderCount" currentSort={employeeSortConfig} onSort={requestEmployeeSort} className="text-center px-1.5">{t("订单总数", "Orders")}</SortableTableHead>
                        <SortableTableHead sortKey="profitNgn" currentSort={employeeSortConfig} onSort={requestEmployeeSort} className="text-center px-1.5">{t("利润(NGN/GHS)", "Profit NGN/GHS")}</SortableTableHead>
                        <SortableTableHead sortKey="profitUsdt" currentSort={employeeSortConfig} onSort={requestEmployeeSort} className="text-center px-1.5">{t("利润(USDT)", "Profit USDT")}</SortableTableHead>
                        <SortableTableHead sortKey="errorProfitNgn" currentSort={employeeSortConfig} onSort={requestEmployeeSort} className="text-center px-1.5">{t("错单(NGN/GHS)", "Loss NGN/GHS")}</SortableTableHead>
                        <SortableTableHead sortKey="errorProfitUsdt" currentSort={employeeSortConfig} onSort={requestEmployeeSort} className="text-center px-1.5">{t("错单(USDT)", "Loss USDT")}</SortableTableHead>
                        <SortableTableHead sortKey="activityGiftRatio" currentSort={employeeSortConfig} onSort={requestEmployeeSort} className="text-center px-1.5">{t("活动赠送占比", "Gift Ratio")}</SortableTableHead>
                        <SortableTableHead sortKey="activityGiftAmount" currentSort={employeeSortConfig} onSort={requestEmployeeSort} className="text-center px-1.5">{t("活动赠送金额", "Gift Amount")}</SortableTableHead>
                        <SortableTableHead sortKey="manualGiftRatio" currentSort={employeeSortConfig} onSort={requestEmployeeSort} className="text-center px-1.5">{t("手动设置占比", "Manual Ratio")}</SortableTableHead>
                        <SortableTableHead sortKey="manualGiftAmount" currentSort={employeeSortConfig} onSort={requestEmployeeSort} className="text-center px-1.5">{t("承担活动金额", "Manual Amount")}</SortableTableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedEmployeeData.map((item) => (
                          <TableRow key={item.employeeId}>
                            <TableCell className="text-center font-medium px-1.5">{item.employeeName}</TableCell>
                            <TableCell className="text-center px-1.5">{item.orderCount}</TableCell>
                            <TableCell className="text-center px-1.5">{formatNumber(item.profitNgn)}</TableCell>
                            <TableCell className="text-center px-1.5">{formatNumber(item.profitUsdt)}</TableCell>
                            <TableCell className="text-center text-destructive px-1.5">{formatNumber(item.errorProfitNgn)}</TableCell>
                            <TableCell className="text-center text-destructive px-1.5">{formatNumber(item.errorProfitUsdt)}</TableCell>
                            <TableCell className="text-center text-primary px-1.5">{(item.activityGiftRatio * 100).toFixed(2)}%</TableCell>
                            <TableCell className="text-center px-1.5">{formatNumber(item.activityGiftAmount)}</TableCell>
                            <TableCell className="text-center px-1.5">
                              {canEditManualRatio ? (
                                <Input
                                  type="number"
                                  min={0}
                                  max={100}
                                  step={0.01}
                                  value={item.manualGiftRatio}
                                  onChange={(e) => handleManualRatioChange(item.employeeId, e.target.value)}
                                  className="w-20 h-7 text-center text-xs mx-auto"
                                  placeholder="0"
                                />
                              ) : (
                                <span>{item.manualGiftRatio.toFixed(2)}%</span>
                              )}
                            </TableCell>
                            <TableCell className="text-center font-medium px-1.5">{formatNumber(item.manualGiftAmount)}</TableCell>
                          </TableRow>
                        ))}
                      {sortedEmployeeData.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                            {t("暂无数据", "No data")}
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                    <TableFooter className="bg-muted/50 font-semibold">
                      <TableRow>
                        <TableCell className="text-center px-1.5">{t("合计", "Total")}</TableCell>
                        <TableCell className="text-center px-1.5">{employeeSummary.orderCount}</TableCell>
                        <TableCell className="text-center px-1.5">{formatNumber(employeeSummary.profitNgn)}</TableCell>
                        <TableCell className="text-center px-1.5">{formatNumber(employeeSummary.profitUsdt)}</TableCell>
                        <TableCell className="text-center text-destructive px-1.5">{formatNumber(employeeSummary.errorProfitNgn)}</TableCell>
                        <TableCell className="text-center text-destructive px-1.5">{formatNumber(employeeSummary.errorProfitUsdt)}</TableCell>
                        <TableCell className="text-center px-1.5">-</TableCell>
                        <TableCell className="text-center px-1.5">{formatNumber(employeeSummary.activityGiftAmount)}</TableCell>
                        <TableCell className="text-center px-1.5">-</TableCell>
                        <TableCell className="text-center px-1.5">{formatNumber(employeeSummary.manualGiftAmount)}</TableCell>
                      </TableRow>
                    </TableFooter>
                  </Table>
                </StickyScrollTableContainer>
                {renderPaginationControls({
                  currentPage: employeePage,
                  totalPages: employeeTotalPages,
                  totalItems: sortedEmployeeData.length,
                  pageSize: employeePageSize,
                  onPageChange: setEmployeePage,
                  onPageSizeChange: setEmployeePageSize,
                })}
                </>
                )}
              </TabsContent>

              {/* 卡片报表 */}
              <TabsContent value="card" className="mt-0 flex flex-col">
                {useCompactLayout ? (
                  <MobileCardList>
                    {paginatedCardData.length === 0 ? (
                      <MobileEmptyState message={t("暂无数据", "No data")} />
                    ) : paginatedCardData.map((item, index) => (
                      <MobileCard key={index} accent="default">
                        <MobileCardHeader>
                          <span className="font-medium text-sm">{resolveCardName(item.cardType)}</span>
                          <Badge variant="outline" className="text-xs">{item.orderCount} {t("单", "orders")}</Badge>
                        </MobileCardHeader>
                        <MobileCardRow label={t("卡价值总额", "Card Value")} value={formatNumber(item.cardValueSum)} highlight />
                        <MobileCardRow label={t("利润(NGN/GHS)", "Profit NGN/GHS")} value={formatNumber(item.profitNgn)} />
                        <MobileCardRow label={t("利润(USDT)", "Profit USDT")} value={formatNumber(item.profitUsdt)} />
                      </MobileCard>
                    ))}
                    <MobilePagination currentPage={cardPage} totalPages={cardTotalPages} totalItems={sortedCardData.length} onPageChange={setCardPage} pageSize={cardPageSize} onPageSizeChange={(s) => { setCardPageSize(s); setCardPage(1); }} />
                  </MobileCardList>
                ) : (
                <StickyScrollTableContainer minWidth="800px">
                  <Table className="text-xs">
                    <TableHeader className="sticky top-0 z-10 bg-muted/80 backdrop-blur-sm">
                      <TableRow>
                        <TableHead className="text-center px-1.5">{t("卡片类型", "Card Type")}</TableHead>
                        <TableHead className="text-center px-1.5">{t("订单数量", "Orders")}</TableHead>
                        <TableHead className="text-center px-1.5">{t("卡价值总额", "Card Value")}</TableHead>
                        <TableHead className="text-center px-1.5">{t("利润(NGN/GHS)", "Profit NGN/GHS")}</TableHead>
                        <TableHead className="text-center px-1.5">{t("利润(USDT)", "Profit USDT")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedCardData.map((item, index) => (
                          <TableRow key={index}>
                            <TableCell className="text-center font-medium px-1.5">{resolveCardName(item.cardType)}</TableCell>
                            <TableCell className="text-center px-1.5">{item.orderCount}</TableCell>
                            <TableCell className="text-center px-1.5">{formatNumber(item.cardValueSum)}</TableCell>
                            <TableCell className="text-center px-1.5">{formatNumber(item.profitNgn)}</TableCell>
                            <TableCell className="text-center px-1.5">{formatNumber(item.profitUsdt)}</TableCell>
                          </TableRow>
                        ))}
                      {sortedCardData.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                            {t("暂无数据", "No data")}
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                    <TableFooter className="bg-muted/50 font-semibold">
                      <TableRow>
                        <TableCell className="text-center px-1.5">{t("合计", "Total")}</TableCell>
                        <TableCell className="text-center px-1.5">{cardSummary.orderCount}</TableCell>
                        <TableCell className="text-center px-1.5">{formatNumber(cardSummary.cardValueSum)}</TableCell>
                        <TableCell className="text-center px-1.5">{formatNumber(cardSummary.profitNgn)}</TableCell>
                        <TableCell className="text-center px-1.5">{formatNumber(cardSummary.profitUsdt)}</TableCell>
                      </TableRow>
                    </TableFooter>
                  </Table>
                </StickyScrollTableContainer>
                )}
                {!isMobile && renderPaginationControls({
                  currentPage: cardPage,
                  totalPages: cardTotalPages,
                  totalItems: sortedCardData.length,
                  pageSize: cardPageSize,
                  onPageChange: setCardPage,
                  onPageSizeChange: setCardPageSize,
                })}
              </TabsContent>

              {/* 卡商报表 */}
              <TabsContent value="vendor" className="mt-0 flex flex-col">
                {useCompactLayout ? (
                  <MobileCardList>
                    {paginatedVendorData.length === 0 ? (
                      <MobileEmptyState message={t("暂无数据", "No data")} />
                    ) : paginatedVendorData.map((item) => (
                      <MobileCard key={item.vendorId} accent="default">
                        <MobileCardHeader>
                          <span className="font-medium text-sm">{resolveVendorOrProviderName(item.vendorName)}</span>
                          <Badge variant="outline" className="text-xs">{item.orderCount} {t("单", "orders")}</Badge>
                        </MobileCardHeader>
                        <MobileCardRow label={t("核销面值总额", "Verified Value")} value={formatNumber(item.cardValueSum)} highlight />
                        <MobileCardRow label={t("利润(NGN/GHS)", "Profit NGN/GHS")} value={formatNumber(item.profitNgn)} />
                        <MobileCardRow label={t("利润(USDT)", "Profit USDT")} value={formatNumber(item.profitUsdt)} />
                      </MobileCard>
                    ))}
                    <MobilePagination currentPage={vendorPage} totalPages={vendorTotalPages} totalItems={sortedVendorData.length} onPageChange={setVendorPage} pageSize={vendorPageSize} onPageSizeChange={(s) => { setVendorPageSize(s); setVendorPage(1); }} />
                  </MobileCardList>
                ) : (
                <StickyScrollTableContainer minWidth="800px">
                  <Table className="text-xs">
                    <TableHeader className="sticky top-0 z-10 bg-muted/80 backdrop-blur-sm">
                      <TableRow>
                        <TableHead className="text-center px-1.5">{t("卡商名称", "Vendor")}</TableHead>
                        <TableHead className="text-center px-1.5">{t("订单数量", "Orders")}</TableHead>
                        <TableHead className="text-center px-1.5">{t("核销面值总额", "Verified Value")}</TableHead>
                        <TableHead className="text-center px-1.5">{t("利润(NGN/GHS)", "Profit NGN/GHS")}</TableHead>
                        <TableHead className="text-center px-1.5">{t("利润(USDT)", "Profit USDT")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedVendorData.map((item) => (
                          <TableRow key={item.vendorId}>
                            <TableCell className="text-center font-medium px-1.5">{resolveVendorOrProviderName(item.vendorName)}</TableCell>
                            <TableCell className="text-center px-1.5">{item.orderCount}</TableCell>
                            <TableCell className="text-center px-1.5">{formatNumber(item.cardValueSum)}</TableCell>
                            <TableCell className="text-center px-1.5">{formatNumber(item.profitNgn)}</TableCell>
                            <TableCell className="text-center px-1.5">{formatNumber(item.profitUsdt)}</TableCell>
                          </TableRow>
                        ))}
                      {sortedVendorData.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                            {t("暂无数据", "No data")}
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                    <TableFooter className="bg-muted/50 font-semibold">
                      <TableRow>
                        <TableCell className="text-center px-1.5">{t("合计", "Total")}</TableCell>
                        <TableCell className="text-center px-1.5">{vendorSummary.orderCount}</TableCell>
                        <TableCell className="text-center px-1.5">{formatNumber(vendorSummary.cardValueSum)}</TableCell>
                        <TableCell className="text-center px-1.5">{formatNumber(vendorSummary.profitNgn)}</TableCell>
                        <TableCell className="text-center px-1.5">{formatNumber(vendorSummary.profitUsdt)}</TableCell>
                      </TableRow>
                    </TableFooter>
                  </Table>
                </StickyScrollTableContainer>
                )}
                {!isMobile && renderPaginationControls({
                  currentPage: vendorPage,
                  totalPages: vendorTotalPages,
                  totalItems: sortedVendorData.length,
                  pageSize: vendorPageSize,
                  onPageChange: setVendorPage,
                  onPageSizeChange: setVendorPageSize,
                })}
              </TabsContent>

              {/* 代付报表 */}
              <TabsContent value="provider" className="mt-0 flex flex-col">
                {useCompactLayout ? (
                  <MobileCardList>
                    {paginatedProviderData.length === 0 ? (
                      <MobileEmptyState message={t("暂无数据", "No data")} />
                    ) : paginatedProviderData.map((item) => (
                      <MobileCard key={item.providerId} accent="default">
                        <MobileCardHeader>
                          <span className="font-medium text-sm">{resolveVendorOrProviderName(item.providerName)}</span>
                          <Badge variant="outline" className="text-xs">{item.orderCount} {t("单", "orders")}</Badge>
                        </MobileCardHeader>
                        <MobileCardRow label={t("代付总额(人)", "Payment NGN/GHS")} value={formatNumber(item.paymentValueNgnGhs)} highlight />
                        <MobileCardRow label={t("代付总额(USDT)", "Payment USDT")} value={formatNumber(item.paymentValueUsdt)} />
                      </MobileCard>
                    ))}
                    <MobilePagination currentPage={providerPage} totalPages={providerTotalPages} totalItems={sortedProviderData.length} onPageChange={setProviderPage} pageSize={providerPageSize} onPageSizeChange={(s) => { setProviderPageSize(s); setProviderPage(1); }} />
                  </MobileCardList>
                ) : (
                <StickyScrollTableContainer minWidth="700px">
                  <Table className="text-xs">
                    <TableHeader className="sticky top-0 z-10 bg-muted/80 backdrop-blur-sm">
                      <TableRow>
                        <SortableTableHead sortKey="providerName" currentSort={providerSortConfig} onSort={requestProviderSort} className="text-center px-1.5">{t("商家名称", "Provider")}</SortableTableHead>
                        <SortableTableHead sortKey="orderCount" currentSort={providerSortConfig} onSort={requestProviderSort} className="text-center px-1.5">{t("订单数量", "Orders")}</SortableTableHead>
                        <SortableTableHead sortKey="paymentValueNgnGhs" currentSort={providerSortConfig} onSort={requestProviderSort} className="text-center px-1.5">{t("代付总额(人)", "Payment NGN/GHS")}</SortableTableHead>
                        <SortableTableHead sortKey="paymentValueUsdt" currentSort={providerSortConfig} onSort={requestProviderSort} className="text-center px-1.5">{t("代付总额(USDT)", "Payment USDT")}</SortableTableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedProviderData.map((item) => (
                          <TableRow key={item.providerId}>
                            <TableCell className="text-center font-medium px-1.5">{resolveVendorOrProviderName(item.providerName)}</TableCell>
                            <TableCell className="text-center px-1.5">{item.orderCount}</TableCell>
                            <TableCell className="text-center px-1.5">{formatNumber(item.paymentValueNgnGhs)}</TableCell>
                            <TableCell className="text-center px-1.5">{formatNumber(item.paymentValueUsdt)}</TableCell>
                          </TableRow>
                        ))}
                      {sortedProviderData.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                            {t("暂无数据", "No data")}
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                    <TableFooter className="bg-muted/50 font-semibold">
                      <TableRow>
                        <TableCell className="text-center px-1.5">{t("合计", "Total")}</TableCell>
                        <TableCell className="text-center px-1.5">{providerSummary.orderCount}</TableCell>
                        <TableCell className="text-center px-1.5">{formatNumber(providerSummary.paymentValueNgnGhs)}</TableCell>
                        <TableCell className="text-center px-1.5">{formatNumber(providerSummary.paymentValueUsdt)}</TableCell>
                      </TableRow>
                    </TableFooter>
                  </Table>
                </StickyScrollTableContainer>
                )}
                {!isMobile && renderPaginationControls({
                  currentPage: providerPage,
                  totalPages: providerTotalPages,
                  totalItems: sortedProviderData.length,
                  pageSize: providerPageSize,
                  onPageChange: setProviderPage,
                  onPageSizeChange: setProviderPageSize,
                })}
              </TabsContent>

              {/* 每日报表 */}
              <TabsContent value="daily" className="mt-0 flex flex-col">
                {useCompactLayout ? (
                  <MobileCardList>
                    {paginatedDailyData.length === 0 ? (
                      <MobileEmptyState message={t("暂无数据", "No data")} />
                    ) : paginatedDailyData.map((item, index) => (
                      <MobileCard key={index} accent="default">
                        <MobileCardHeader>
                          <span className="font-medium text-sm">{item.date}</span>
                          <Badge variant="outline" className="text-xs">{item.orderCount} {t("单", "orders")}</Badge>
                        </MobileCardHeader>
                        <MobileCardRow label={t("卡价值总额", "Card Value")} value={formatNumber(item.cardValueSum)} />
                        <MobileCardRow label={t("总利润(人)", "Total Profit")} value={formatNumber(item.totalProfit)} highlight />
                        <MobileCardCollapsible>
                          <MobileCardRow label={t("代付(奈赛)", "Pay NGN/GHS")} value={formatNumber(item.paymentValueNgnGhs)} />
                          <MobileCardRow label={t("代付(USDT)", "Pay USDT")} value={formatNumber(item.paymentValueUsdt)} />
                          <MobileCardRow label={t("活动发放", "Activity")} value={formatNumber(item.activityAmount)} />
                          <MobileCardRow label={t("利润(人)", "Profit NGN")} value={formatNumber(item.profitNgn)} />
                          <MobileCardRow label={t("利润(USDT)", "Profit USDT")} value={formatNumber(item.profitUsdt)} />
                        </MobileCardCollapsible>
                      </MobileCard>
                    ))}
                    <MobilePagination currentPage={dailyPage} totalPages={dailyTotalPages} totalItems={sortedDailyData.length} onPageChange={setDailyPage} pageSize={dailyPageSize} onPageSizeChange={(s) => { setDailyPageSize(s); setDailyPage(1); }} />
                  </MobileCardList>
                ) : (
                <StickyScrollTableContainer minWidth="1200px">
                  <Table className="text-xs">
                    <TableHeader className="sticky top-0 z-10 bg-muted/80 backdrop-blur-sm">
                      <TableRow>
                        <TableHead className="text-center px-1.5">{t("日期", "Date")}</TableHead>
                        <TableHead className="text-center px-1.5">{t("订单数量", "Orders")}</TableHead>
                        <TableHead className="text-center px-1.5">{t("卡价值总额", "Card Value")}</TableHead>
                        <TableHead className="text-center px-1.5">{t("代付价值（奈赛）总和", "Payment NGN/GHS")}</TableHead>
                        <TableHead className="text-center px-1.5">{t("代付价值USDT总和", "Payment USDT")}</TableHead>
                        <TableHead className="text-center px-1.5">{t("活动发放", "Activity")}</TableHead>
                        <TableHead className="text-center px-1.5">{t("利润(人)", "Profit NGN/GHS")}</TableHead>
                        <TableHead className="text-center px-1.5">{t("利润(USDT)", "Profit USDT")}</TableHead>
                        <TableHead className="text-center px-1.5">{t("总利润(人)", "Total Profit")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedDailyData.map((item, index) => (
                          <TableRow key={index}>
                            <TableCell className="text-center font-medium px-1.5">{item.date}</TableCell>
                            <TableCell className="text-center px-1.5">{item.orderCount}</TableCell>
                            <TableCell className="text-center px-1.5">{formatNumber(item.cardValueSum)}</TableCell>
                            <TableCell className="text-center px-1.5">{formatNumber(item.paymentValueNgnGhs)}</TableCell>
                            <TableCell className="text-center px-1.5">{formatNumber(item.paymentValueUsdt)}</TableCell>
                            <TableCell className="text-center px-1.5">{formatNumber(item.activityAmount)}</TableCell>
                            <TableCell className="text-center px-1.5">{formatNumber(item.profitNgn)}</TableCell>
                            <TableCell className="text-center px-1.5">{formatNumber(item.profitUsdt)}</TableCell>
                            <TableCell className="text-center font-medium px-1.5">{formatNumber(item.totalProfit)}</TableCell>
                          </TableRow>
                        ))}
                      {sortedDailyData.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                            {t("暂无数据", "No data")}
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                    <TableFooter className="bg-muted/50 font-semibold">
                      <TableRow>
                        <TableCell className="text-center px-1.5">{t("合计", "Total")}</TableCell>
                        <TableCell className="text-center px-1.5">{dailySummary.orderCount}</TableCell>
                        <TableCell className="text-center px-1.5">{formatNumber(dailySummary.cardValueSum)}</TableCell>
                        <TableCell className="text-center px-1.5">{formatNumber(dailySummary.paymentValueNgnGhs)}</TableCell>
                        <TableCell className="text-center px-1.5">{formatNumber(dailySummary.paymentValueUsdt)}</TableCell>
                        <TableCell className="text-center px-1.5">{formatNumber(dailySummary.activityAmount)}</TableCell>
                        <TableCell className="text-center px-1.5">{formatNumber(dailySummary.profitNgn)}</TableCell>
                        <TableCell className="text-center px-1.5">{formatNumber(dailySummary.profitUsdt)}</TableCell>
                        <TableCell className="text-center px-1.5">{formatNumber(dailySummary.totalProfit)}</TableCell>
                      </TableRow>
                    </TableFooter>
                  </Table>
                </StickyScrollTableContainer>
                )}
                {!isMobile && renderPaginationControls({
                  currentPage: dailyPage,
                  totalPages: dailyTotalPages,
                  totalItems: sortedDailyData.length,
                  pageSize: dailyPageSize,
                  onPageChange: setDailyPage,
                  onPageSizeChange: setDailyPageSize,
                })}
              </TabsContent>

              {/* 每月报表 */}
              <TabsContent value="monthly" className="mt-0 flex flex-col">
                {useCompactLayout ? (
                  <MobileCardList>
                    {paginatedMonthlyData.length === 0 ? (
                      <MobileEmptyState message={t("暂无数据", "No data")} />
                    ) : paginatedMonthlyData.map((item, index) => (
                      <MobileCard key={index} accent="default">
                        <MobileCardHeader>
                          <span className="font-medium text-sm">{item.month}</span>
                          <Badge variant="outline" className="text-xs">{item.orderCount} {t("单", "orders")}</Badge>
                        </MobileCardHeader>
                        <MobileCardRow label={t("卡价值总额", "Card Value")} value={formatNumber(item.cardValueSum)} />
                        <MobileCardRow label={t("总利润(人)", "Total Profit")} value={formatNumber(item.totalProfit)} highlight />
                        <MobileCardCollapsible>
                          <MobileCardRow label={t("代付(奈赛)", "Pay NGN/GHS")} value={formatNumber(item.paymentValueNgnGhs)} />
                          <MobileCardRow label={t("代付(USDT)", "Pay USDT")} value={formatNumber(item.paymentValueUsdt)} />
                          <MobileCardRow label={t("活动发放", "Activity")} value={formatNumber(item.activityAmount)} />
                          <MobileCardRow label={t("利润(人)", "Profit NGN")} value={formatNumber(item.profitNgn)} />
                          <MobileCardRow label={t("利润(USDT)", "Profit USDT")} value={formatNumber(item.profitUsdt)} />
                        </MobileCardCollapsible>
                      </MobileCard>
                    ))}
                    <MobilePagination currentPage={monthlyPage} totalPages={monthlyTotalPages} totalItems={sortedMonthlyData.length} onPageChange={setMonthlyPage} pageSize={monthlyPageSize} onPageSizeChange={(s) => { setMonthlyPageSize(s); setMonthlyPage(1); }} />
                  </MobileCardList>
                ) : (
                <StickyScrollTableContainer minWidth="1200px">
                  <Table className="text-xs">
                    <TableHeader className="sticky top-0 z-10 bg-muted/80 backdrop-blur-sm">
                      <TableRow>
                        <TableHead className="text-center px-1.5">{t("月份", "Month")}</TableHead>
                        <TableHead className="text-center px-1.5">{t("订单数量", "Orders")}</TableHead>
                        <TableHead className="text-center px-1.5">{t("卡价值总额", "Card Value")}</TableHead>
                        <TableHead className="text-center px-1.5">{t("代付价值（奈赛）总和", "Payment NGN/GHS")}</TableHead>
                        <TableHead className="text-center px-1.5">{t("代付价值USDT总和", "Payment USDT")}</TableHead>
                        <TableHead className="text-center px-1.5">{t("活动发放", "Activity")}</TableHead>
                        <TableHead className="text-center px-1.5">{t("利润(人)", "Profit NGN/GHS")}</TableHead>
                        <TableHead className="text-center px-1.5">{t("利润(USDT)", "Profit USDT")}</TableHead>
                        <TableHead className="text-center px-1.5">{t("总利润(人)", "Total Profit")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedMonthlyData.map((item, index) => (
                          <TableRow key={index}>
                            <TableCell className="text-center font-medium px-1.5">{item.month}</TableCell>
                            <TableCell className="text-center px-1.5">{item.orderCount}</TableCell>
                            <TableCell className="text-center px-1.5">{formatNumber(item.cardValueSum)}</TableCell>
                            <TableCell className="text-center px-1.5">{formatNumber(item.paymentValueNgnGhs)}</TableCell>
                            <TableCell className="text-center px-1.5">{formatNumber(item.paymentValueUsdt)}</TableCell>
                            <TableCell className="text-center px-1.5">{formatNumber(item.activityAmount)}</TableCell>
                            <TableCell className="text-center px-1.5">{formatNumber(item.profitNgn)}</TableCell>
                            <TableCell className="text-center px-1.5">{formatNumber(item.profitUsdt)}</TableCell>
                            <TableCell className="text-center font-medium px-1.5">{formatNumber(item.totalProfit)}</TableCell>
                          </TableRow>
                        ))}
                      {sortedMonthlyData.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                            {t("暂无数据", "No data")}
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                    <TableFooter className="bg-muted/50 font-semibold">
                      <TableRow>
                        <TableCell className="text-center px-1.5">{t("合计", "Total")}</TableCell>
                        <TableCell className="text-center px-1.5">{monthlySummary.orderCount}</TableCell>
                        <TableCell className="text-center px-1.5">{formatNumber(monthlySummary.cardValueSum)}</TableCell>
                        <TableCell className="text-center px-1.5">{formatNumber(monthlySummary.paymentValueNgnGhs)}</TableCell>
                        <TableCell className="text-center px-1.5">{formatNumber(monthlySummary.paymentValueUsdt)}</TableCell>
                        <TableCell className="text-center px-1.5">{formatNumber(monthlySummary.activityAmount)}</TableCell>
                        <TableCell className="text-center px-1.5">{formatNumber(monthlySummary.profitNgn)}</TableCell>
                        <TableCell className="text-center px-1.5">{formatNumber(monthlySummary.profitUsdt)}</TableCell>
                        <TableCell className="text-center px-1.5">{formatNumber(monthlySummary.totalProfit)}</TableCell>
                      </TableRow>
                    </TableFooter>
                  </Table>
                </StickyScrollTableContainer>
                )}
                {!isMobile && renderPaginationControls({
                  currentPage: monthlyPage,
                  totalPages: monthlyTotalPages,
                  totalItems: sortedMonthlyData.length,
                  pageSize: monthlyPageSize,
                  onPageChange: setMonthlyPage,
                  onPageSizeChange: setMonthlyPageSize,
                })}
              </TabsContent>

              {/* 活动报表 */}
              <TabsContent value="activity" className="mt-0 flex flex-col">
                {useCompactLayout ? (
                  <MobileCardList>
                    {paginatedActivityData.length === 0 ? (
                      <MobileEmptyState message={t("暂无数据", "No data")} />
                    ) : paginatedActivityData.map((item, index) => (
                      <MobileCard key={index} accent="default">
                        <MobileCardHeader>
                          <span className="font-medium text-sm">{item.date}</span>
                          <Badge variant="outline" className="text-xs">{item.activityTypeLabel}</Badge>
                        </MobileCardHeader>
                        <MobileCardRow label={t("赠送价值(人)", "Gift Value")} value={formatNumber(item.giftValueTotal)} highlight />
                        <MobileCardRow label={t("赠送效果", "Effect")} value={item.effectCount} />
                        <MobileCardCollapsible>
                          <MobileCardRow label={t("赠送奈拉", "Gift NGN")} value={formatNumber(item.giftNgn)} />
                          <MobileCardRow label={t("赠送赛迪", "Gift GHS")} value={formatNumber(item.giftGhs)} />
                          <MobileCardRow label={t("赠送USDT", "Gift USDT")} value={formatNumber(item.giftUsdt)} />
                        </MobileCardCollapsible>
                      </MobileCard>
                    ))}
                    <MobilePagination currentPage={activityPage} totalPages={activityTotalPages} totalItems={sortedActivityData.length} onPageChange={setActivityPage} pageSize={activityPageSize} onPageSizeChange={(s) => { setActivityPageSize(s); setActivityPage(1); }} />
                  </MobileCardList>
                ) : (
                <StickyScrollTableContainer minWidth="900px">
                  <Table className="text-xs">
                    <TableHeader className="sticky top-0 z-10 bg-muted/80 backdrop-blur-sm">
                      <TableRow>
                        <TableHead className="text-center px-1.5">{t("日期", "Date")}</TableHead>
                        <TableHead className="text-center px-1.5">{t("活动类型", "Activity Type")}</TableHead>
                        <TableHead className="text-center px-1.5">{t("赠送奈拉", "Gift NGN")}</TableHead>
                        <TableHead className="text-center px-1.5">{t("赠送赛迪", "Gift GHS")}</TableHead>
                        <TableHead className="text-center px-1.5">{t("赠送USDT", "Gift USDT")}</TableHead>
                        <TableHead className="text-center px-1.5">{t("赠送价值(人)", "Gift Value")}</TableHead>
                        <TableHead className="text-center px-1.5">{t("赠送效果", "Effect Count")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedActivityData.map((item, index) => (
                          <TableRow key={index}>
                            <TableCell className="text-center font-medium px-1.5">{item.date}</TableCell>
                            <TableCell className="text-center px-1.5">{item.activityTypeLabel}</TableCell>
                            <TableCell className="text-center px-1.5">{formatNumber(item.giftNgn)}</TableCell>
                            <TableCell className="text-center px-1.5">{formatNumber(item.giftGhs)}</TableCell>
                            <TableCell className="text-center px-1.5">{formatNumber(item.giftUsdt)}</TableCell>
                            <TableCell className="text-center font-medium px-1.5">{formatNumber(item.giftValueTotal)}</TableCell>
                            <TableCell className="text-center font-medium px-1.5">{item.effectCount}</TableCell>
                          </TableRow>
                        ))}
                      {sortedActivityData.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                            {t("暂无数据", "No data")}
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                    <TableFooter className="bg-muted/50 font-semibold">
                      <TableRow>
                        <TableCell className="text-center px-1.5" colSpan={2}>{t("合计", "Total")}</TableCell>
                        <TableCell className="text-center px-1.5">{formatNumber(activitySummary.giftNgn)}</TableCell>
                        <TableCell className="text-center px-1.5">{formatNumber(activitySummary.giftGhs)}</TableCell>
                        <TableCell className="text-center px-1.5">{formatNumber(activitySummary.giftUsdt)}</TableCell>
                        <TableCell className="text-center px-1.5">{formatNumber(activitySummary.giftValueTotal)}</TableCell>
                        <TableCell className="text-center px-1.5">{activitySummary.effectCount}</TableCell>
                      </TableRow>
                    </TableFooter>
                  </Table>
                </StickyScrollTableContainer>
                )}
                {!isMobile && renderPaginationControls({
                  currentPage: activityPage,
                  totalPages: activityTotalPages,
                  totalItems: sortedActivityData.length,
                  pageSize: activityPageSize,
                  onPageChange: setActivityPage,
                  onPageSizeChange: setActivityPageSize,
                })}
              </TabsContent>
              <TabsContent value="compare" className="mt-0">
                <Suspense fallback={<div className="flex items-center justify-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" /></div>}>
                  <ProfitComparisonTab />
                </Suspense>
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>

      <ExportConfirmDialog
        open={exportConfirm.open}
        onOpenChange={exportConfirm.handleOpenChange}
        onConfirm={exportConfirm.handleConfirm}
      />
    </div>
  );
}
