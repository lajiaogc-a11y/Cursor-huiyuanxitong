import { lazy, Suspense, useMemo, useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Users, ShoppingCart, DollarSign, TrendingUp, ArrowUpRight,
  Activity, RefreshCw, UserPlus, Calculator, ClipboardList,
  Building2, BarChart3,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useMembers } from "@/hooks/useMembers";
import { useOrders, useUsdtOrders } from "@/hooks/useOrders";
import { useDashboardTrend } from "@/hooks/useDashboardTrend";
import { useFieldPermissions } from "@/hooks/useFieldPermissions";
import { safeToFixed } from "@/lib/safeCalc";
import { trackRender } from "@/lib/performanceUtils";
import {
  TimeRangeType,
  DateRange,
  getTimeRangeDates,
  filterByDateRange,
  getAllTimeRequestRange,
} from "@/lib/dateFilter";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { AreaChart, Area, XAxis, CartesianGrid, BarChart, Bar } from "recharts";
import { CURRENCIES } from "@/config/currencies";
import { DashboardSummary } from "@/components/DashboardSummary";
import { formatBeijingMonthDayShort } from "@/lib/beijingTime";
const PendingTasksPanel = lazy(() => import("@/components/PendingTasksPanel"));
const EmployeeLeaderboard = lazy(() => import("@/components/EmployeeLeaderboard"));

const TIME_RANGES: { label: string; labelEn: string; value: TimeRangeType }[] = [
  { label: "今日", labelEn: "Today", value: "今日" },
  { label: "昨日", labelEn: "Yesterday", value: "昨日" },
  { label: "本周", labelEn: "Week", value: "本周" },
  { label: "本月", labelEn: "Month", value: "本月" },
  { label: "全部", labelEn: "All", value: "全部" },
];

const QUICK_ACTIONS = [
  { icon: UserPlus, labelZh: "新增会员", labelEn: "Add Member", path: "/staff/member-management", color: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
  { icon: Calculator, labelZh: "汇率计算", labelEn: "Exchange", path: "/staff/exchange-rate", color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  { icon: ClipboardList, labelZh: "订单管理", labelEn: "Orders", path: "/staff/orders", color: "bg-violet-500/10 text-violet-600 dark:text-violet-400" },
  { icon: Building2, labelZh: "商家结算", labelEn: "Settlement", path: "/staff/merchant-settlement", color: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
] as const;

export default function MobileDashboard() {
  trackRender('MobileDashboard');

  const { employee } = useAuth();
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const { checkPermission } = useFieldPermissions();

  const [selectedRange, setSelectedRange] = useState<TimeRangeType>("今日");
  const [dateRange, setDateRange] = useState<DateRange>(() => getTimeRangeDates("今日"));

  const showOwnDataOnly = useMemo(() => {
    if (!employee) return false;
    if (employee.is_platform_super_admin || employee.role === 'admin' || employee.role === 'manager') return false;
    const permission = checkPermission('dashboard', 'own_data_only');
    return employee.role === 'staff' && permission.canView;
  }, [employee, checkPermission]);

  const { members, refetch: refetchMembers } = useMembers();
  const { refetch: refetchOrders } = useOrders();
  const { refetch: refetchUsdtOrders } = useUsdtOrders();

  const salesPersonFilter = useMemo(() => {
    return showOwnDataOnly && employee ? employee.real_name : null;
  }, [showOwnDataOnly, employee]);

  const trendDateRange = useMemo(() => {
    if (selectedRange === '全部' || !dateRange.start || !dateRange.end) {
      return getAllTimeRequestRange();
    }
    return { start: dateRange.start, end: dateRange.end };
  }, [selectedRange, dateRange.start, dateRange.end]);

  const { trendData: rpcTrendData, summary: rpcSummary, refetch: refetchTrend } = useDashboardTrend(
    trendDateRange.start,
    trendDateRange.end,
    salesPersonFilter
  );

  const hasInitRefreshed = useRef(false);
  useEffect(() => {
    if (!hasInitRefreshed.current && refetchTrend) {
      hasInitRefreshed.current = true;
      refetchTrend();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const refetchMembersRef = useRef(refetchMembers);
  const refetchOrdersRef = useRef(refetchOrders);
  const refetchUsdtOrdersRef = useRef(refetchUsdtOrders);
  const refetchTrendRef = useRef(refetchTrend);
  refetchMembersRef.current = refetchMembers;
  refetchOrdersRef.current = refetchOrders;
  refetchUsdtOrdersRef.current = refetchUsdtOrders;
  refetchTrendRef.current = refetchTrend;

  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    refetchMembersRef.current?.();
    refetchOrdersRef.current?.();
    refetchUsdtOrdersRef.current?.();
    refetchTrendRef.current?.();
    setTimeout(() => setRefreshing(false), 800);
  }, []);

  const handleRangeChange = useCallback((value: TimeRangeType) => {
    setSelectedRange(value);
    setDateRange(getTimeRangeDates(value));
  }, []);

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

  const trendData = useMemo(() => rpcTrendData.map(r => ({ date: r.date, orders: r.orders, profit: r.profit })), [rpcTrendData]);
  const tradingUserTrendData = useMemo(() => rpcTrendData.map(r => ({ date: r.date, users: r.users })), [rpcTrendData]);

  const totalProfit = stats.ghsProfit + stats.ngnProfit;
  const roleLabel = useMemo(() => {
    const roleMap: Record<string, { zh: string; en: string }> = {
      admin: { zh: "管理员", en: "Admin" },
      manager: { zh: "经理", en: "Manager" },
      staff: { zh: "员工", en: "Staff" },
    };
    return roleMap[employee?.role || 'staff'] || roleMap.staff;
  }, [employee?.role]);

  const dateStr = formatBeijingMonthDayShort(
    new Date(),
    language === "zh" ? "zh-CN" : "en-US",
  );

  return (
    <div className="space-y-4">
      {/* ── User Greeting Header ── */}
      <div className="px-0 pt-2 pb-2 sm:px-1">
        <div className="flex items-center gap-3">
          <Avatar className="h-11 w-11 shrink-0">
            <AvatarFallback className="bg-primary text-primary-foreground text-base font-semibold">
              {employee?.real_name?.charAt(0) || 'U'}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold text-foreground truncate">
              {t(`你好，${employee?.real_name || '用户'}`, `Hi, ${employee?.real_name || 'User'}`)}
            </h1>
            <p className="text-xs text-muted-foreground">
              {t(roleLabel.zh, roleLabel.en)} · {dateStr}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0"
            onClick={handleRefresh}
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* ── 数据概览：时间筛选 + 指标合一（去掉与顶部重复的订单/新增/订单量等） ── */}
      <div className="px-0 sm:px-1">
        <div className="rounded-2xl border border-border/80 bg-card shadow-sm overflow-hidden">
          <div className="px-3 pt-4 pb-3 border-b border-border/50 bg-gradient-to-br from-primary/[0.06] to-transparent sm:px-4">
            <div className="flex items-center gap-2">
              <div className="h-9 w-9 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
                <BarChart3 className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-bold text-foreground leading-tight">
                  {t("数据概览", "Overview")}
                </h2>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {t("全站全部来源数据汇总；除「总用户」外均按所选周期统计", "All-source site-wide summary; all except Total Users use the selected range")}
                </p>
              </div>
            </div>
            <div className="flex gap-1.5 overflow-x-auto mt-3 pb-1 -mx-1 px-1 scrollbar-hide touch-pan-x">
              {TIME_RANGES.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => handleRangeChange(r.value)}
                  className={`px-3.5 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-all shrink-0 min-h-10 touch-manipulation active:scale-[0.98] ${
                    selectedRange === r.value
                      ? "bg-primary text-primary-foreground shadow-md ring-2 ring-primary/20"
                      : "bg-background/80 text-muted-foreground border border-border/80 active:bg-muted"
                  }`}
                >
                  {t(r.label, r.labelEn)}
                </button>
              ))}
            </div>
          </div>

          <div className="p-2.5 space-y-4 sm:p-3">
            {/* 核心指标（仅保留一份） */}
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-0.5">
                {t("核心指标", "Key metrics")}
              </p>
              <div className="grid grid-cols-3 gap-2">
                <OverviewKpi
                  icon={<ShoppingCart className="h-3.5 w-3.5" />}
                  label={t("订单", "Orders")}
                  value={stats.totalOrders.toLocaleString()}
                  accent="text-primary"
                  bg="bg-primary/10"
                />
                <OverviewKpi
                  icon={<ArrowUpRight className="h-3.5 w-3.5" />}
                  label={t("新增会员", "New members")}
                  value={stats.newUsers.toLocaleString()}
                  accent="text-emerald-600 dark:text-emerald-400"
                  bg="bg-emerald-500/10"
                />
                <OverviewKpi
                  icon={<DollarSign className="h-3.5 w-3.5" />}
                  label={t("利润(¥)", "Profit ¥")}
                  value={
                    totalProfit >= 1000
                      ? `¥${(totalProfit / 1000).toFixed(1)}K`
                      : `¥${safeToFixed(totalProfit, 0)}`
                  }
                  accent="text-amber-600 dark:text-amber-400"
                  bg="bg-amber-500/10"
                />
              </div>
              <p className="text-[10px] text-muted-foreground text-center mt-1.5 px-1">
                {t("利润 = 赛地 + 奈拉（人民币），不含 USDT 利润", "Profit = GHS + NGN in CNY; USDT profit shown below")}
              </p>
            </div>

            {/* 用户：总用户为累计，交易用户为周期内 */}
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-0.5">
                {t("用户", "Users")}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <OverviewKpi
                  icon={<Users className="h-3.5 w-3.5" />}
                  label={t("总用户", "Total users")}
                  sub={t("累计", "All time")}
                  value={stats.totalUsers.toLocaleString()}
                  accent="text-primary"
                  bg="bg-primary/10"
                />
                <OverviewKpi
                  icon={<Activity className="h-3.5 w-3.5" />}
                  label={t("交易用户", "Traders")}
                  sub={t("周期内", "In range")}
                  value={stats.tradingUsers.toLocaleString()}
                  accent="text-violet-600 dark:text-violet-400"
                  bg="bg-violet-500/10"
                />
              </div>
            </div>

            {/* 成交额 */}
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-0.5">
                {t("成交额", "Trading volume")}
              </p>
              <div className="grid grid-cols-3 gap-2">
                <OverviewKpi
                  icon={<DollarSign className="h-3 w-3" />}
                  label="NGN"
                  value={`¥${safeToFixed(stats.ngnVolume, 0)}`}
                  accent="text-emerald-600 dark:text-emerald-400"
                  bg="bg-emerald-500/10"
                  compact
                />
                <OverviewKpi
                  icon={<DollarSign className="h-3 w-3" />}
                  label="GHS"
                  value={`¥${safeToFixed(stats.ghsVolume, 0)}`}
                  accent="text-amber-600 dark:text-amber-400"
                  bg="bg-amber-500/10"
                  compact
                />
                <OverviewKpi
                  icon={<DollarSign className="h-3 w-3" />}
                  label="USDT"
                  value={`$${safeToFixed(stats.usdtVolume, 2)}`}
                  accent="text-teal-600 dark:text-teal-400"
                  bg="bg-teal-500/10"
                  compact
                />
              </div>
              <p className="text-[10px] text-muted-foreground text-center mt-1.5">
                {t("USDT 为成交量，非利润", "USDT: volume, not profit")}
              </p>
            </div>

            {/* 分渠道利润（原「利润详情」并入） */}
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-0.5">
                {t("分渠道利润", "Profit by channel")}
              </p>
              <div className="rounded-xl bg-muted/40 px-3 py-1 border border-border/50">
                <ProfitRow
                  embedded
                  label={language === "zh" ? CURRENCIES.GHS.name : "Cedi"}
                  value={safeToFixed(stats.ghsProfit, 2)}
                  unit={language === "zh" ? "元" : "CNY"}
                />
                <ProfitRow
                  embedded
                  label={language === "zh" ? CURRENCIES.NGN.name : "Naira"}
                  value={safeToFixed(stats.ngnProfit, 2)}
                  unit={language === "zh" ? "元" : "CNY"}
                />
                <ProfitRow
                  embedded
                  label="USDT"
                  value={safeToFixed(stats.usdtProfit, 4)}
                  unit="USDT"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Quick Actions ── */}
      <div className="px-0 sm:px-1">
        <h2 className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">
          {t("快捷操作", "Quick Actions")}
        </h2>
        <div className="grid grid-cols-4 gap-2">
          {QUICK_ACTIONS.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.path}
                onClick={() => navigate(action.path)}
                className="flex flex-col items-center gap-1.5 py-3 rounded-xl bg-card border border-border active:scale-95 transition-transform"
              >
                <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${action.color}`}>
                  <Icon className="h-[18px] w-[18px]" />
                </div>
                <span className="text-[10px] font-medium text-foreground leading-tight text-center">
                  {t(action.labelZh, action.labelEn)}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Smart Summary ── */}
      <div className="px-0 sm:px-1">
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
      </div>

      {/* ── Pending Tasks ── */}
      <div className="px-0 sm:px-1">
        <Suspense fallback={null}>
          <PendingTasksPanel />
        </Suspense>
      </div>

      {/* ── Order Trend Chart ── */}
      {trendData.length > 1 && (
        <div className="px-0 sm:px-1">
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="px-3 pt-3 pb-1 flex items-center gap-2 sm:px-4">
              <TrendingUp className="h-3.5 w-3.5 text-primary" />
              <h3 className="text-xs font-semibold text-foreground">{t("订单与利润趋势", "Order & Profit Trend")}</h3>
            </div>
            <div className="px-2 pb-3">
              <ChartContainer
                config={{
                  orders: { label: t("订单", "Orders"), color: "hsl(var(--primary))" },
                  profit: { label: t("利润", "Profit"), color: "hsl(var(--success))" },
                }}
                className="h-[180px] w-full"
              >
                <AreaChart data={trendData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="m-orderGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.2} />
                      <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="m-profitGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--success))" stopOpacity={0.2} />
                      <stop offset="100%" stopColor="hsl(var(--success))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} interval={Math.max(0, Math.ceil(trendData.length / 4) - 1)} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Area type="monotone" dataKey="orders" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#m-orderGrad)" dot={false} />
                  <Area type="monotone" dataKey="profit" stroke="hsl(var(--success))" strokeWidth={2} fill="url(#m-profitGrad)" dot={false} />
                </AreaChart>
              </ChartContainer>
            </div>
          </div>
        </div>
      )}

      {/* ── Trading User Trend ── */}
      {tradingUserTrendData.length > 1 && (
        <div className="px-0 sm:px-1">
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="px-3 pt-3 pb-1 flex items-center gap-2 sm:px-4">
              <BarChart3 className="h-3.5 w-3.5 text-violet-500" />
              <h3 className="text-xs font-semibold text-foreground">{t("交易用户趋势", "Trading User Trend")}</h3>
            </div>
            <div className="px-2 pb-3">
              <ChartContainer
                config={{ users: { label: t("用户", "Users"), color: "hsl(var(--chart-3))" } }}
                className="h-[160px] w-full"
              >
                <BarChart data={tradingUserTrendData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="m-barGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--chart-3))" stopOpacity={0.9} />
                      <stop offset="100%" stopColor="hsl(var(--chart-3))" stopOpacity={0.3} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} interval={Math.max(0, Math.ceil(tradingUserTrendData.length / 4) - 1)} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="users" fill="url(#m-barGrad)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartContainer>
            </div>
          </div>
        </div>
      )}

      {/* ── Employee Leaderboard ── */}
      <div className="px-0 sm:px-1">
        <Suspense fallback={null}>
          <EmployeeLeaderboard />
        </Suspense>
      </div>

      <div className="h-4" />
    </div>
  );
}

function OverviewKpi({
  icon,
  label,
  value,
  accent,
  bg,
  sub,
  compact,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent: string;
  bg: string;
  sub?: string;
  compact?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-background/60 p-2.5 shadow-sm">
      <div className="flex items-center gap-1.5 mb-1">
        <div className={`h-6 w-6 rounded-md flex items-center justify-center shrink-0 ${bg} ${accent}`}>
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <span className={`font-medium text-muted-foreground block truncate ${compact ? "text-[9px]" : "text-[10px]"}`}>
            {label}
          </span>
          {sub ? (
            <span className="text-[9px] text-muted-foreground/80">{sub}</span>
          ) : null}
        </div>
      </div>
      <p className={`font-bold tabular-nums leading-tight truncate ${accent} ${compact ? "text-sm" : "text-base sm:text-lg"}`}>
        {value}
      </p>
    </div>
  );
}

function ProfitRow({ label, value, unit, embedded }: { label: string; value: string; unit: string; embedded?: boolean }) {
  if (embedded) {
    return (
      <div className="flex items-center justify-between py-2 px-1 border-b border-border/40 last:border-0 last:pb-0 first:pt-0">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-xs font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
          {value} {unit}
        </span>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-between bg-card rounded-xl px-4 py-3 border border-border">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
        {value} {unit}
      </span>
    </div>
  );
}
