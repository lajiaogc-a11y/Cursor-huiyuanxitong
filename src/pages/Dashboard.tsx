import { Users, ShoppingCart, DollarSign, TrendingUp, RefreshCw, Timer, Activity, ArrowUpRight, BarChart3 } from "lucide-react";
import { lazy, Suspense } from "react";
const EmployeeLeaderboard = lazy(() => import("@/components/EmployeeLeaderboard"));
const PendingTasksPanel = lazy(() => import("@/components/PendingTasksPanel"));
const MobileDashboard = lazy(() => import("@/components/MobileDashboard"));
import { Button } from "@/components/ui/button";
import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { CURRENCIES } from "@/config/currencies";
import { useMembers, Member } from "@/hooks/useMembers";
import { useOrders, useUsdtOrders, Order, UsdtOrder } from "@/hooks/useOrders";
import { useDashboardTrend } from "@/hooks/useDashboardTrend";
import DateRangeFilter from "@/components/DateRangeFilter";
import {
  TimeRangeType,
  DateRange,
  getTimeRangeDates,
  filterByDateRange,
  getAllTimeRequestRange,
} from "@/lib/dateFilter";
import { useAuth } from "@/contexts/AuthContext";
import { useTenantView } from "@/contexts/TenantViewContext";
import { useNavigate, useLocation } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";
import { useFieldPermissions } from "@/hooks/useFieldPermissions";
import { safeNumber, safeToFixed } from "@/lib/safeCalc";
import { trackRender } from "@/lib/performanceUtils";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, CartesianGrid, BarChart, Bar, Area, AreaChart } from "recharts";
import { printContent } from "@/lib/printUtils";
import { DashboardSummary } from "@/components/DashboardSummary";
import { DashboardQuickStartCard } from "@/components/DashboardQuickStartCard";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";
import { ElitePageHeader } from "@/design-system/elite";

export default function Dashboard() {
  trackRender('Dashboard');
  const isMobile = useIsMobile();

  const { t, language } = useLanguage();
  
  const [selectedRange, setSelectedRange] = useState<TimeRangeType>("今日");
  const [dateRange, setDateRange] = useState<DateRange>(() => getTimeRangeDates("今日"));
  const [customStart, setCustomStart] = useState<Date | undefined>();
  const [customEnd, setCustomEnd] = useState<Date | undefined>();
  const [selectedCurrency, setSelectedCurrency] = useState<"NGN" | "GHS" | "USDT">("NGN");
  
  // Auto refresh state
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(() => {
    return localStorage.getItem('dashboardAutoRefresh') === 'true';
  });
  const [refreshInterval, setRefreshInterval] = useState(() => {
    const saved = localStorage.getItem('dashboardRefreshInterval');
    return saved ? parseInt(saved) : 60;
  });
  const [countdown, setCountdown] = useState(refreshInterval);
  const [lastRefreshTime, setLastRefreshTime] = useState(new Date());
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const countdownRef = useRef<NodeJS.Timeout | null>(null);
  
  // Get current user info and permissions
  const { employee } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { checkPermission } = useFieldPermissions();

  const { isViewingTenant } = useTenantView() || {};

  useEffect(() => {
    // 仅平台总管理员跳转到公司管理；租户总管理员（如 002）应看到正常仪表盘
    if (employee?.is_platform_super_admin && !isViewingTenant) {
      navigate("/company-management", { replace: true });
    }
  }, [employee, isViewingTenant, navigate]);
  
  // Check if only showing own data
  const showOwnDataOnly = useMemo(() => {
    if (!employee) return false;
    if (employee.is_platform_super_admin || employee.role === 'admin' || employee.role === 'manager') return false;
    const permission = checkPermission('dashboard', 'own_data_only');
    return employee.role === 'staff' && permission.canView;
  }, [employee, checkPermission]);
  
  // Use database Hooks
  const { members, refetch: refetchMembers } = useMembers();
  const { orders, refetch: refetchOrders } = useOrders();
  const { orders: usdtOrders, refetch: refetchUsdtOrders } = useUsdtOrders();

  // RPC-based trend data (offloads computation to database)
  const salesPersonFilter = useMemo(() => {
    return showOwnDataOnly && employee ? employee.real_name : null;
  }, [showOwnDataOnly, employee]);

  // 选择「全部」时使用近 2 年范围，避免 2000-至今 导致 RPC 超时
  const trendDateRange = useMemo(() => {
    if (selectedRange === '全部' || !dateRange.start || !dateRange.end) {
      return getAllTimeRequestRange();
    }
    return { start: dateRange.start, end: dateRange.end };
  }, [selectedRange, dateRange.start, dateRange.end]);

  const { trendData: rpcTrendData, summary: rpcSummary, refetch: refetchTrend, isError: trendError, error: trendErrorDetail } = useDashboardTrend(
    trendDateRange.start,
    trendDateRange.end,
    salesPersonFilter
  );

  useEffect(() => {
    if (trendError && trendErrorDetail) {
      toast.error(t('仪表盘数据加载失败', 'Dashboard data load failed') + ': ' + (trendErrorDetail as Error)?.message);
    }
  }, [trendError, trendErrorDetail]);

  // Manual refresh — 用 ref 存最新的 refetch 函数，避免 useCallback 依赖变化导致无限循环
  const refetchMembersRef = useRef(refetchMembers);
  const refetchOrdersRef = useRef(refetchOrders);
  const refetchUsdtOrdersRef = useRef(refetchUsdtOrders);
  const refetchTrendRef = useRef(refetchTrend);
  refetchMembersRef.current = refetchMembers;
  refetchOrdersRef.current = refetchOrders;
  refetchUsdtOrdersRef.current = refetchUsdtOrders;
  refetchTrendRef.current = refetchTrend;

  const refreshIntervalRef = useRef(refreshInterval);
  refreshIntervalRef.current = refreshInterval;

  // 进入或返回数据统计页（/staff）时拉取最新会员/订单/趋势，避免他页产生新数据后仍显示旧数
  useEffect(() => {
    if (location.pathname !== "/staff") return;
    refetchMembersRef.current?.();
    refetchOrdersRef.current?.();
    refetchUsdtOrdersRef.current?.();
    refetchTrendRef.current?.();
    setLastRefreshTime(new Date());
    setCountdown(refreshIntervalRef.current);
  }, [location.pathname]);

  const handleRefresh = useCallback(() => {
    refetchMembersRef.current?.();
    refetchOrdersRef.current?.();
    refetchUsdtOrdersRef.current?.();
    refetchTrendRef.current?.();
    setLastRefreshTime(new Date());
    setCountdown(refreshInterval);
  }, [refreshInterval]);

  // Auto refresh logic
  useEffect(() => {
    if (!autoRefreshEnabled) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
      return;
    }
    countdownRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          handleRefresh();
          return refreshInterval;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [autoRefreshEnabled, refreshInterval, handleRefresh]);

  const toggleAutoRefresh = () => {
    const newValue = !autoRefreshEnabled;
    setAutoRefreshEnabled(newValue);
    localStorage.setItem('dashboardAutoRefresh', newValue.toString());
    if (newValue) setCountdown(refreshInterval);
  };

  const handleIntervalChange = (seconds: number) => {
    setRefreshInterval(seconds);
    setCountdown(seconds);
    localStorage.setItem('dashboardRefreshInterval', seconds.toString());
  };

  const formatCountdown = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins > 0 ? `${mins}:${secs.toString().padStart(2, '0')}` : `${secs}s`;
  };

  const handleDateRangeChange = (range: TimeRangeType, start?: Date, end?: Date) => {
    setSelectedRange(range);
    if (range === "自定义" && start && end) {
      setCustomStart(start);
      setCustomEnd(end);
      setDateRange(getTimeRangeDates(range, start, end));
    } else {
      setDateRange(getTimeRangeDates(range));
    }
  };

  // Stats: user counts from client, order/volume/profit from RPC
  const stats = useMemo(() => {
    let filteredMembersBase = members;
    if (showOwnDataOnly && employee) {
      filteredMembersBase = members.filter(m => m.recorder === employee.real_name);
    }
    const totalUsers = filteredMembersBase.length;
    const filteredMembers = filterByDateRange(filteredMembersBase, 'createdAt', dateRange);
    const newUsers = filteredMembers.length;

    return {
      totalUsers,
      newUsers,
      tradingUsers: rpcSummary.tradingUsers,
      totalOrders: rpcSummary.totalOrders,
      ngnVolume: rpcSummary.ngnVolume,
      ghsVolume: rpcSummary.ghsVolume,
      usdtVolume: rpcSummary.usdtVolume,
      ghsProfit: rpcSummary.ghsProfit,
      ngnProfit: rpcSummary.ngnProfit,
      usdtProfit: rpcSummary.usdtProfit,
    };
  }, [members, dateRange, showOwnDataOnly, employee, rpcSummary]);

  // Trend data from RPC (no client-side loop computation)
  const trendData = useMemo(() => {
    return rpcTrendData.map(r => ({
      date: r.date,
      orders: r.orders,
      profit: r.profit,
    }));
  }, [rpcTrendData]);

  const tradingUserTrendData = useMemo(() => {
    return rpcTrendData.map(r => ({
      date: r.date,
      users: r.users,
    }));
  }, [rpcTrendData]);

  const chartConfig = {
    orders: { label: t('dashboard.orderTrend'), color: "hsl(var(--primary))" },
    profit: { label: t('dashboard.profitTrend'), color: "hsl(var(--success))" },
  };

  const tradingUserChartConfig = {
    users: { label: t('dashboard.users'), color: "hsl(var(--chart-3))" },
  };

  const getCurrentVolume = () => {
    const unit = language === 'zh' ? ' 元' : ' CNY';
    switch (selectedCurrency) {
      case "NGN": return safeToFixed(stats.ngnVolume, 2) + unit;
      case "GHS": return safeToFixed(stats.ghsVolume, 2) + unit;
      case "USDT": return safeToFixed(stats.usdtVolume, 2) + unit;
      default: return "0.00";
    }
  };

  const totalProfit = stats.ghsProfit + stats.ngnProfit;

  if (isMobile) {
    return (
      <div className="elite-staff-shell elite-soft-scroll min-h-full">
        <Suspense fallback={null}>
          <MobileDashboard />
        </Suspense>
      </div>
    );
  }

  return (
    <div className="elite-staff-shell elite-soft-scroll rounded-2xl border border-border/50 p-4 shadow-soft md:p-6">
      <div className="space-y-5">
      <ElitePageHeader
        title={t("数据统计", "Statistics")}
        description={t("会员、订单与利润趋势汇总", "Summary of members, orders, and profit trends.")}
      />
      <DashboardQuickStartCard />
      {/* Top Bar: Time range left + Refresh controls fixed right */}
      <div className="space-y-2">
        <div className="relative flex items-start gap-2">
          {/* Left: date filter, allowed to wrap */}
          <div className="flex-1 min-w-0 space-y-2">
            <DateRangeFilter
              value={selectedRange}
              onChange={handleDateRangeChange}
              dateRange={selectedRange === "自定义" ? { start: null, end: null } : selectedRange === "全部" ? trendDateRange : dateRange}
              showCustomPicker={false}
            />
            {selectedRange === "自定义" && (
              <DateRangeFilter
                value={selectedRange}
                onChange={handleDateRangeChange}
                dateRange={{ start: null, end: null }}
                customPickerOnly
              />
            )}
          </div>
          {/* Right: refresh controls, independent container */}
          <div className="flex items-center gap-1.5 shrink-0">
            <Button
              variant={autoRefreshEnabled ? "default" : "ghost"}
              size="sm"
              className="h-7 gap-1 text-xs px-2"
              onClick={toggleAutoRefresh}
            >
              <Timer className="h-3 w-3" />
              {autoRefreshEnabled ? formatCountdown(countdown) : t('common.autoRefresh')}
            </Button>
            {autoRefreshEnabled && (
              <select
                className="h-7 text-xs bg-background border border-border rounded-md px-1.5 cursor-pointer"
                value={refreshInterval}
                onChange={(e) => handleIntervalChange(parseInt(e.target.value))}
              >
                <option value={30}>{t('refreshInterval.sec30')}</option>
                <option value={60}>{t('refreshInterval.min1')}</option>
                <option value={180}>{t('refreshInterval.min3')}</option>
                <option value={300}>{t('refreshInterval.min5')}</option>
              </select>
            )}
            <Button variant="outline" size="icon" onClick={handleRefresh} className="h-7 w-7">
              <RefreshCw className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </div>

      {/* Smart Summary */}
      <DashboardSummary
        totalOrders={stats.totalOrders}
        newUsers={stats.newUsers}
        tradingUsers={stats.tradingUsers}
        ngnVolume={stats.ngnVolume}
        ghsVolume={stats.ghsVolume}
        usdtVolume={stats.usdtVolume}
        ngnProfit={stats.ngnProfit}
        ghsProfit={stats.ghsProfit}
        usdtProfit={stats.usdtProfit}
        trendData={trendData}
        selectedRange={selectedRange}
      />

      {/* Pending Tasks */}
      <Suspense fallback={null}>
        <PendingTasksPanel />
      </Suspense>

      {/* Stats Cards Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 lg:gap-4">
        {/* Total Users */}
        <div className="dash-stat-card dash-stat-primary">
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground tracking-wide uppercase">
                {t('dashboard.totalUsers')}
              </p>
              <p className="text-2xl sm:text-3xl font-bold tabular-nums text-foreground">
                {stats.totalUsers.toLocaleString()}
              </p>
            </div>
            <div className="dash-icon dash-icon-primary">
              <Users className="h-5 w-5" />
            </div>
          </div>
        </div>

        {/* New Users */}
        <div className="dash-stat-card dash-stat-success">
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground tracking-wide uppercase">
                {t('dashboard.newUsers')}
              </p>
              <p className="text-2xl sm:text-3xl font-bold tabular-nums text-success">
                {stats.newUsers.toLocaleString()}
              </p>
            </div>
            <div className="dash-icon dash-icon-success">
              <ArrowUpRight className="h-5 w-5" />
            </div>
          </div>
        </div>

        {/* Trading Users */}
        <div className="dash-stat-card dash-stat-chart3">
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground tracking-wide uppercase">
                {t('dashboard.tradingUsers')}
              </p>
              <p className="text-2xl sm:text-3xl font-bold tabular-nums" style={{ color: 'hsl(var(--chart-3))' }}>
                {stats.tradingUsers.toLocaleString()}
              </p>
            </div>
            <div className="dash-icon dash-icon-chart3">
              <Activity className="h-5 w-5" />
            </div>
          </div>
        </div>

        {/* Order Count */}
        <div className="dash-stat-card dash-stat-warning">
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground tracking-wide uppercase">
                {t('dashboard.orderCount')}
              </p>
              <p className="text-2xl sm:text-3xl font-bold tabular-nums text-foreground">
                {stats.totalOrders.toLocaleString()}
              </p>
            </div>
            <div className="dash-icon dash-icon-warning">
              <ShoppingCart className="h-5 w-5" />
            </div>
          </div>
        </div>

        {/* Volume with currency toggle */}
        <div className="dash-stat-card dash-stat-success col-span-2 lg:col-span-1">
          <div className="flex items-start justify-between mb-1">
            <p className="text-xs font-medium text-muted-foreground tracking-wide uppercase">
              {t('dashboard.volume')}
            </p>
            <div className="flex gap-0.5 relative z-10">
              {(["NGN", "GHS", "USDT"] as const).map((cur) => (
                <button
                  type="button"
                  key={cur}
                  onClick={(e) => { e.stopPropagation(); setSelectedCurrency(cur); }}
                  className={`px-2 py-0.5 text-[10px] font-semibold rounded-md transition-all cursor-pointer ${
                    selectedCurrency === cur
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-muted/50"
                  }`}
                >
                  {cur}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <div className="dash-icon dash-icon-success">
              <DollarSign className="h-5 w-5" />
            </div>
            <span className="text-xl sm:text-2xl font-bold tabular-nums text-success truncate">
              {getCurrentVolume()}
            </span>
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Order & Profit Trend */}
        <div className="dash-chart-card">
          <div className="px-5 pt-4 pb-2 flex items-center gap-2">
            <div className="dash-icon dash-icon-primary p-1.5">
              <TrendingUp className="h-4 w-4" />
            </div>
            <h3 className="text-sm font-semibold text-foreground">{t('dashboard.orderTrendTitle')}</h3>
          </div>
          <div className="px-3 pb-4">
            <ChartContainer config={chartConfig} className="h-[220px] w-full">
              <AreaChart data={trendData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <defs>
                  <linearGradient id="orderGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="profitGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--success))" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="hsl(var(--success))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
                <XAxis dataKey="date" className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} interval={trendData.length > 7 ? Math.ceil(trendData.length / 5) - 1 : 0} />
                <YAxis yAxisId="left" className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} hide={trendData.length > 14} width={35} />
                <YAxis yAxisId="right" orientation="right" className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} hide={trendData.length > 14} width={35} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Area yAxisId="left" type="monotone" dataKey="orders" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#orderGradient)" dot={trendData.length <= 14 ? { fill: "hsl(var(--primary))", r: 3, strokeWidth: 0 } : false} name={t('dashboard.orderTrend')} />
                <Area yAxisId="right" type="monotone" dataKey="profit" stroke="hsl(var(--success))" strokeWidth={2} fill="url(#profitGradient)" dot={trendData.length <= 14 ? { fill: "hsl(var(--success))", r: 3, strokeWidth: 0 } : false} name={t('dashboard.profitTrend')} />
              </AreaChart>
            </ChartContainer>
          </div>
        </div>

        {/* Trading User Trend */}
        <div className="dash-chart-card">
          <div className="px-5 pt-4 pb-2 flex items-center gap-2">
            <div className="dash-icon dash-icon-chart3 p-1.5">
              <BarChart3 className="h-4 w-4" />
            </div>
            <h3 className="text-sm font-semibold text-foreground">{t('dashboard.tradingUserTrend')}</h3>
          </div>
          <div className="px-3 pb-4">
            <ChartContainer config={tradingUserChartConfig} className="h-[220px] w-full">
              <BarChart data={tradingUserTrendData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <defs>
                  <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--chart-3))" stopOpacity={0.9} />
                    <stop offset="100%" stopColor="hsl(var(--chart-3))" stopOpacity={0.4} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
                <XAxis dataKey="date" className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} interval={tradingUserTrendData.length > 7 ? Math.ceil(tradingUserTrendData.length / 5) - 1 : 0} />
                <YAxis className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} hide={tradingUserTrendData.length > 14} width={35} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="users" fill="url(#barGradient)" radius={[6, 6, 0, 0]} name={t('dashboard.tradingUsers')} />
              </BarChart>
            </ChartContainer>
          </div>
        </div>
      </div>

      {/* Profit Section */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <div className="w-1 h-5 rounded-full bg-success" />
          <h3 className="text-sm font-semibold text-foreground">{t('dashboard.totalProfit')}</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="dash-profit-card dash-profit-ghs">
            <p className="text-xs font-medium text-muted-foreground mb-3">
              {language === 'zh' ? CURRENCIES.GHS.name : 'Cedi'}{t('总利润', ' Total Profit')}
            </p>
            <div className="flex items-center gap-3">
              <DollarSign className="h-5 w-5 text-success shrink-0" />
              <span className="text-xl sm:text-2xl font-bold tabular-nums text-success">
                {safeToFixed(stats.ghsProfit, 2)} {language === 'zh' ? '元' : 'CNY'}
              </span>
            </div>
          </div>
          <div className="dash-profit-card dash-profit-ngn">
            <p className="text-xs font-medium text-muted-foreground mb-3">
              {language === 'zh' ? CURRENCIES.NGN.name : 'Naira'}{t('总利润', ' Total Profit')}
            </p>
            <div className="flex items-center gap-3">
              <DollarSign className="h-5 w-5 text-success shrink-0" />
              <span className="text-xl sm:text-2xl font-bold tabular-nums text-success">
                {safeToFixed(stats.ngnProfit, 2)} {language === 'zh' ? '元' : 'CNY'}
              </span>
            </div>
          </div>
          <div className="dash-profit-card dash-profit-usdt">
            <p className="text-xs font-medium text-muted-foreground mb-3">
              USDT{t('总利润', ' Total Profit')}
            </p>
            <div className="flex items-center gap-3">
              <DollarSign className="h-5 w-5 text-success shrink-0" />
              <span className="text-xl sm:text-2xl font-bold tabular-nums text-success">
                {safeToFixed(stats.usdtProfit, 4)} USDT
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Employee Leaderboard */}
      <Suspense fallback={null}>
        <EmployeeLeaderboard />
      </Suspense>
      </div>
    </div>
  );
}
