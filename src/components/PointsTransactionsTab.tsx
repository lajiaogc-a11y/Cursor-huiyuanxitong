import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StickyScrollTableContainer } from "@/components/ui/sticky-scroll-table";
import { useIsMobile } from "@/hooks/use-mobile";
import { MobileCardList, MobileCard, MobileCardHeader, MobileCardRow, MobileCardCollapsible, MobilePagination, MobileEmptyState } from "@/components/ui/mobile-data-card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Search, RefreshCw, Info, Download, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { notify } from "@/lib/notifyHub";
import { usePointsLedger, type PointsLedgerEntry } from "@/hooks/usePointsLedger";
import { useMembers } from "@/hooks/useMembers";
import { CURRENCIES, CURRENCY_LIST, type CurrencyCode } from "@/config/currencies";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { formatBeijingTime } from "@/lib/beijingTime";
import { getDisplayPhone } from "@/lib/phoneMask";
import { ExportConfirmDialog } from "@/components/ExportConfirmDialog";
import { useExportConfirm } from "@/hooks/useExportConfirm";
import { exportToCSV, formatNumberForExport, formatDateTimeForExport } from "@/lib/exportUtils";
import { cleanPhoneNumber, validatePhoneLength } from "@/lib/phoneValidation";
import { repairUtf8MisdecodedAsLatin1 } from "@/lib/utf8MojibakeRepair";
import type { TimeRange } from "@/components/member/MemberActivityFilters";

/** 备注：库内可能为 UTF-8 字节被按 Latin-1 存入的乱码，展示前统一修复 */
function formatPointsLedgerDescription(d: string | null | undefined): string {
  if (d == null || d === "") return "";
  return repairUtf8MisdecodedAsLatin1(String(d));
}

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];
const STAFF_ORDERS_PATH = "/staff/orders";

// 积分类型配置
// 需求2：兑换类型统一显示"积分兑换"
const POINTS_TYPE_CONFIG: Record<string, { label: string; labelEn: string; color: string; variant: 'default' | 'secondary' | 'outline' }> = {
  'consumption': { label: '消费积分', labelEn: 'Consumption', color: 'bg-blue-100 text-blue-800 border-blue-200', variant: 'default' },
  'referral_1': { label: '推荐积分1', labelEn: 'Referral 1', color: 'bg-green-100 text-green-800 border-green-200', variant: 'secondary' },
  'referral_2': { label: '推荐积分2', labelEn: 'Referral 2', color: 'bg-purple-100 text-purple-800 border-purple-200', variant: 'secondary' },
  'lottery': { label: '抽奖积分', labelEn: 'Lottery points', color: 'bg-amber-100 text-amber-900 border-amber-200', variant: 'secondary' },
  'consumption_reversal': { label: '消费积分冲正', labelEn: 'Consumption Rev.', color: 'bg-red-100 text-red-800 border-red-200', variant: 'outline' },
  'referral_1_reversal': { label: '推荐积分1冲正', labelEn: 'Referral 1 Rev.', color: 'bg-red-100 text-red-800 border-red-200', variant: 'outline' },
  'referral_2_reversal': { label: '推荐积分2冲正', labelEn: 'Referral 2 Rev.', color: 'bg-red-100 text-red-800 border-red-200', variant: 'outline' },
  // 需求2：兑换类型统一显示"积分兑换"
  'redeem_activity_1': { label: '积分兑换', labelEn: 'Points Redemption', color: 'bg-orange-100 text-orange-800 border-orange-200', variant: 'default' },
  'redeem_activity_2': { label: '积分兑换', labelEn: 'Points Redemption', color: 'bg-orange-100 text-orange-800 border-orange-200', variant: 'default' },
  'redemption': { label: '积分兑换', labelEn: 'Points Redemption', color: 'bg-orange-100 text-orange-800 border-orange-200', variant: 'default' },
  'redeem': { label: '积分兑换', labelEn: 'Points Redemption', color: 'bg-orange-100 text-orange-800 border-orange-200', variant: 'default' },
  /** 历史数据：删除赠送回退曾单独类型；新逻辑已并入 redeem_* 正数流水 */
  'gift_delete_restore': { label: '积分兑换回退', labelEn: 'Redemption restore', color: 'bg-orange-100 text-orange-800 border-orange-200', variant: 'secondary' },
  'regular': { label: '消费积分', labelEn: 'Consumption', color: 'bg-blue-100 text-blue-800 border-blue-200', variant: 'default' },
  'usdt': { label: '消费积分', labelEn: 'Consumption', color: 'bg-blue-100 text-blue-800 border-blue-200', variant: 'default' },
  'REFERRAL': { label: '推荐积分', labelEn: 'Referral', color: 'bg-green-100 text-green-800 border-green-200', variant: 'secondary' },
  'ORDER_REVERSAL': { label: '消费积分冲正', labelEn: 'Consumption Rev.', color: 'bg-red-100 text-red-800 border-red-200', variant: 'outline' },
  'REFERRAL_REVERSAL': { label: '推荐积分冲正', labelEn: 'Referral Rev.', color: 'bg-red-100 text-red-800 border-red-200', variant: 'outline' },
  'ORDER_RESTORE': { label: '消费积分恢复', labelEn: 'Consumption Restore', color: 'bg-blue-100 text-blue-800 border-blue-200', variant: 'default' },
  'REFERRAL_RESTORE': { label: '推荐积分恢复', labelEn: 'Referral Restore', color: 'bg-green-100 text-green-800 border-green-200', variant: 'secondary' },
  'freeze': { label: '积分冻结', labelEn: 'Points frozen', color: 'bg-slate-100 text-slate-800 border-slate-200', variant: 'outline' },
  'redeem_confirmed': { label: '兑换确认', labelEn: 'Redemption confirmed', color: 'bg-orange-50 text-orange-800 border-orange-200', variant: 'outline' },
  'redeem_rejected': { label: '兑换退回', labelEn: 'Redemption refund', color: 'bg-emerald-50 text-emerald-900 border-emerald-200', variant: 'outline' },
  'mall_redemption': { label: '会员商城兑换', labelEn: 'Mall redemption', color: 'bg-orange-100 text-orange-800 border-orange-200', variant: 'default' },
};

interface PointsTransactionsTabProps {
  showToolbar?: boolean;
  /** 为 true 时刷新/导出由父级 Tab 行触发（window 自定义事件），不在本组件工具条重复显示 */
  toolbarActionsInTabRow?: boolean;
  searchTerm?: string;
  onSearchChange?: (value: string) => void;
}

export default function PointsTransactionsTab({ 
  showToolbar = true,
  toolbarActionsInTabRow = false,
  searchTerm: externalSearchTerm,
  onSearchChange 
}: PointsTransactionsTabProps) {
  const { t } = useLanguage();
  const { isAdmin } = useAuth();
  const isMobile = useIsMobile();
  const { entries, loading, getPointsStatistics, refetch } = usePointsLedger();
  const { members } = useMembers();
  const exportConfirm = useExportConfirm();

  /** 抽奖等流水可能仅有 member_id，列表需与会员表对齐才能搜索/展示 */
  const entriesForUi = useMemo(() => {
    const byId = new Map(members.map((m) => [m.id, m]));
    return entries.map((e) => {
      const mid = e.member_id;
      const m = mid ? byId.get(mid) : undefined;
      return {
        ...e,
        member_code: e.member_code || m?.memberCode || "",
        phone_number: e.phone_number || m?.phoneNumber || "",
      };
    });
  }, [entries, members]);

  const lotteryIssuedTotal = useMemo(
    () =>
      entries.reduce((sum, e) => {
        if (e.transaction_type === "lottery" && e.points_earned > 0) return sum + e.points_earned;
        return sum;
      }, 0),
    [entries]
  );
  const [internalSearchTerm, setInternalSearchTerm] = useState("");
  const [searchError, setSearchError] = useState("");
  const [filterCurrency, setFilterCurrency] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [timeRange, setTimeRange] = useState<TimeRange>("today");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const searchTerm = externalSearchTerm !== undefined ? externalSearchTerm : internalSearchTerm;
  const setSearchTerm = onSearchChange || setInternalSearchTerm;

  const timeRangeDates = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    switch (timeRange) {
      case "all": return { start: null as Date | null, end: null as Date | null };
      case "today": return { start: todayStart, end: todayEnd };
      case "yesterday": {
        const ys = new Date(todayStart); ys.setDate(ys.getDate() - 1);
        const ye = new Date(todayEnd); ye.setDate(ye.getDate() - 1);
        return { start: ys, end: ye };
      }
      case "thisMonth": return { start: new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0), end: todayEnd };
      case "lastMonth": {
        return { start: new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0), end: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999) };
      }
      case "custom":
        if (customStart && customEnd) {
          const s = new Date(customStart); s.setHours(0,0,0,0);
          const e = new Date(customEnd); e.setHours(23,59,59,999);
          return { start: s, end: e };
        }
        return { start: null as Date | null, end: null as Date | null };
      default: return { start: null as Date | null, end: null as Date | null };
    }
  }, [timeRange, customStart, customEnd]);

  // 计算带累计积分的流水记录
  const ledgerWithBalance = useMemo(() => {
    const entriesByMember: Record<string, PointsLedgerEntry[]> = {};
    
    entriesForUi.forEach(entry => {
      const mid = entry.member_id || '';
      const memberKey = mid || entry.member_code || entry.phone_number || 'unknown';
      if (!entriesByMember[memberKey]) {
        entriesByMember[memberKey] = [];
      }
      entriesByMember[memberKey].push(entry);
    });
    
    const result: (PointsLedgerEntry & { pointsBefore: number; pointsAfter: number })[] = [];
    
    Object.values(entriesByMember).forEach(memberEntries => {
      const sorted = [...memberEntries].sort((a, b) => 
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
      
      let runningTotal = 0;
      sorted.forEach(entry => {
        const dbBalAfter = Number((entry as { balance_after?: unknown }).balance_after);
        const pe = entry.points_earned;
        if (Number.isFinite(dbBalAfter) && dbBalAfter !== 0) {
          const pointsAfter = dbBalAfter;
          const pointsBefore = pointsAfter - pe;
          runningTotal = pointsAfter;
          result.push({ ...entry, pointsBefore, pointsAfter });
        } else {
          const pointsBefore = runningTotal;
          const pointsAfter = runningTotal + pe;
          runningTotal = pointsAfter;
          result.push({ ...entry, pointsBefore, pointsAfter });
        }
      });
    });
    
    return result;
  }, [entriesForUi]);

  const filteredLedger = useMemo(() => {
    // Sort by created_at descending (newest first)
    const sorted = [...ledgerWithBalance].sort((a, b) => 
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    
    return sorted.filter((entry) => {
      // 时间范围筛选
      if (timeRangeDates.start || timeRangeDates.end) {
        const d = new Date(entry.created_at);
        if (isNaN(d.getTime())) return false;
        if (timeRangeDates.start && d < timeRangeDates.start) return false;
        if (timeRangeDates.end && d > timeRangeDates.end) return false;
      }

      const q = searchTerm.toLowerCase().trim();
      const matchesSearch = 
        String(entry.member_code ?? '').toLowerCase().includes(q) ||
        String(entry.phone_number ?? '').includes(searchTerm.trim()) ||
        String(entry.order_id ?? '').toLowerCase().includes(q) ||
        String(entry.reference_id ?? '').toLowerCase().includes(q) ||
        formatPointsLedgerDescription(entry.description).toLowerCase().includes(q);
      
      const matchesCurrency = filterCurrency === "all" || entry.currency === filterCurrency;
      
      // 类型筛选
      let matchesType = true;
      if (filterType === "consumption") {
        matchesType = entry.transaction_type === 'consumption' || entry.transaction_type === 'regular' || entry.transaction_type === 'usdt';
      } else if (filterType === "referral_1") {
        matchesType = entry.transaction_type === 'referral_1';
      } else if (filterType === "referral_2") {
        matchesType = entry.transaction_type === 'referral_2';
      } else if (filterType === "lottery") {
        matchesType = entry.transaction_type === 'lottery';
      } else if (filterType === "earn") {
        matchesType = entry.points_earned > 0;
      } else if (filterType === "reverse") {
        matchesType = entry.points_earned < 0 || entry.transaction_type?.includes('reversal');
      }
      
      const matchesStatus = filterStatus === "all" || entry.status === filterStatus;
      
      return matchesSearch && matchesCurrency && matchesType && matchesStatus;
    });
  }, [ledgerWithBalance, searchTerm, filterCurrency, filterType, filterStatus, timeRangeDates]);

  // Paginated ledger
  const paginatedLedger = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredLedger.slice(start, start + pageSize);
  }, [filteredLedger, currentPage, pageSize]);

  const totalPages = Math.ceil(filteredLedger.length / pageSize);

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterCurrency, filterType, filterStatus, pageSize, timeRange]);

  const formatDateTime = (dateStr: string) => {
    return formatBeijingTime(dateStr);
  };

  const getTypeConfig = useCallback((type: string | null | undefined, referenceType?: string | null) => {
    const raw = type || "unknown";
    const safeType = raw.toLowerCase();
    const ref = String(referenceType || "").toLowerCase();
    if (safeType === "freeze") {
      if (ref === "mall_redemption_freeze") {
        return {
          label: "商城兑换冻结",
          labelEn: "Mall redemption freeze",
          color: "bg-slate-100 text-slate-800 border-slate-200",
          variant: "outline" as const,
        };
      }
      if (ref === "point_order_freeze") {
        return {
          label: "兑换单冻结",
          labelEn: "Point order freeze",
          color: "bg-slate-100 text-slate-800 border-slate-200",
          variant: "outline" as const,
        };
      }
      return POINTS_TYPE_CONFIG.freeze;
    }
    return (
      POINTS_TYPE_CONFIG[raw] ||
      POINTS_TYPE_CONFIG[safeType] || {
        label: "其它类型",
        labelEn: raw === "unknown" ? "Unknown" : raw,
        color: "bg-gray-100 text-gray-800",
        variant: "outline" as const,
      }
    );
  }, []);

  const handleRefresh = useCallback(() => {
    refetch();
    notify.success(t("已刷新", "Refreshed"));
  }, [refetch, t]);

  const handleExport = useCallback(() => {
    exportToCSV(filteredLedger, [
      { key: 'created_at', label: '获得时间', labelEn: 'Earned At', formatter: (v) => formatDateTimeForExport(v) },
      { key: 'member_code', label: '会员编号', labelEn: 'Member Code' },
      { key: 'phone_number', label: '电话号码', labelEn: 'Phone' },
      { key: 'order_id', label: '订单/关联', labelEn: 'Order / Ref' },
      { key: 'description', label: '备注', labelEn: 'Note', formatter: (v) => formatPointsLedgerDescription(v != null ? String(v) : '') },
      { key: 'actual_payment', label: '实付外币', labelEn: 'Paid Amount', formatter: (v) => v ? formatNumberForExport(v) : '' },
      { key: 'currency', label: '币种', labelEn: 'Currency' },
      { key: 'exchange_rate', label: '当时汇率', labelEn: 'FX Rate' },
      { key: 'usd_amount', label: '兑换USD', labelEn: 'USD Amount', formatter: (v) => v ? formatNumberForExport(v) : '' },
      { key: 'points_rate', label: '积分倍率', labelEn: 'Points Rate' },
      { key: 'points_earned', label: '获得积分', labelEn: 'Points Earned' },
      {
        key: "transaction_type",
        label: "类型",
        labelEn: "Type",
        formatter: (v, row) => getTypeConfig(v, row?.reference_type).label,
      },
      { key: 'status', label: '状态', labelEn: 'Status', formatter: (v) => v === 'issued' ? '已发放' : v === 'reversed' ? '已回收' : v },
    ], '积分流水明细', false);
    notify.success(t("导出成功", "Export successful"));
  }, [filteredLedger, t, getTypeConfig]);

  useEffect(() => {
    const onRefresh = () => handleRefresh();
    const onExport = () => handleExport();
    window.addEventListener("points-ledger-refresh", onRefresh);
    window.addEventListener("points-ledger-export", onExport);
    return () => {
      window.removeEventListener("points-ledger-refresh", onRefresh);
      window.removeEventListener("points-ledger-export", onExport);
    };
  }, [handleRefresh, handleExport]);

  /** 仅订单类流水有实付/汇率/USD；抽奖、推荐、兑换等不走订单列 */
  const showOrderFxColumns = (txn: string | null | undefined) =>
    txn === "consumption" || txn === "regular" || txn === "usdt";

  const stats = getPointsStatistics();
  const {
    totalRecoveredIssued,
    totalMallRedeemPoints,
    totalStaffRedeemPoints,
  } = stats;

  if (loading && entries.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* 统计卡片 */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3 mb-3 shrink-0">
        <Card className="shadow-sm">
          <CardContent className="py-3 px-4">
            <div className="text-xl font-bold text-green-600">+{stats.totalIssued.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">{t("累计发放积分", "Total Earned Points")}</p>
            <p className="text-[10px] text-muted-foreground mt-1 leading-tight">
              {t("含消费/推荐/抽奖等全部正数流水", "All positive entries: orders, referral, lottery, etc.")}
            </p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="py-3 px-4">
            <div className="text-xl font-bold text-amber-700">+{lotteryIssuedTotal.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">{t("抽奖发放积分", "Lottery points issued")}</p>
            <p className="text-[10px] text-muted-foreground mt-1 leading-tight">
              {t("转盘抽中积分奖品（points_ledger）", "Wheel points prizes (points_ledger)")}
            </p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="py-3 px-4">
            <div className="text-xl font-bold text-blue-600">{stats.netPoints.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">{t("净发放积分", "Net Points")}</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="py-3 px-4">
            <div className="text-xl font-bold text-gray-600">{stats.transactionCount}</div>
            <p className="text-xs text-muted-foreground">{t("流水记录数", "Total Entries")}</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="py-3 px-4">
            <div className="text-xl font-bold text-rose-600">−{totalRecoveredIssued.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">{t("累计回收积分", "Total recovered points")}</p>
            <p className="text-[10px] text-muted-foreground mt-1 leading-tight">
              {t("订单等冲正流水（status=已回收）", "Reversal entries (reversed status)")}
            </p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="py-3 px-4">
            <div className="text-xl font-bold text-violet-600">−{totalMallRedeemPoints.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">{t("累计商品兑换积分", "Mall redemption points")}</p>
            <p className="text-[10px] text-muted-foreground mt-1 leading-tight">
              {t("积分商城 / 会员端兑换单冻结", "Points mall & member point-order freeze")}
            </p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="py-3 px-4">
            <div className="text-xl font-bold text-orange-600">−{totalStaffRedeemPoints.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">{t("累计兑换积分", "Staff redemption points")}</p>
            <p className="text-[10px] text-muted-foreground mt-1 leading-tight">
              {t("后台积分兑换活动", "Staff activity points redemption")}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 积分明细列表 - 采用订单管理的表格容器逻辑 */}
      <Card className="flex-1 flex flex-col min-h-0 shadow-sm">
        <CardContent className="pt-3 pb-2 flex flex-col flex-1 min-h-0">
          {showToolbar && (
            <div className="flex items-center gap-3 flex-wrap mb-4">
              <div className="relative flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder={t("搜索电话/会员编号...", "Search phone/member code...")}
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value);
                      setSearchError("");
                    }}
                    onPaste={(e) => {
                      e.preventDefault();
                      const pasted = e.clipboardData.getData('text').replace(/[^a-zA-Z0-9]/g, '');
                      setSearchTerm(pasted);
                      setSearchError("");
                    }}
                    className={`pl-9 w-56 ${searchError ? 'border-destructive' : ''}`}
                  />
                </div>
                {searchError && <span className="text-xs text-destructive whitespace-nowrap">{searchError}</span>}
              </div>
              <Select value={timeRange} onValueChange={(v) => setTimeRange(v as TimeRange)}>
                <SelectTrigger className="w-28">
                  <SelectValue placeholder={t("时间范围", "Time Range")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("全部", "All")}</SelectItem>
                  <SelectItem value="today">{t("今天", "Today")}</SelectItem>
                  <SelectItem value="yesterday">{t("昨天", "Yesterday")}</SelectItem>
                  <SelectItem value="thisMonth">{t("本月", "This Month")}</SelectItem>
                  <SelectItem value="lastMonth">{t("上月", "Last Month")}</SelectItem>
                  <SelectItem value="custom">{t("自定义", "Custom")}</SelectItem>
                </SelectContent>
              </Select>
              {timeRange === "custom" && (
                <>
                  <Input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className="w-36" />
                  <span className="text-muted-foreground">-</span>
                  <Input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="w-36" />
                </>
              )}
              <Select value={filterCurrency} onValueChange={setFilterCurrency}>
                <SelectTrigger className="w-28">
                  <SelectValue placeholder={t("币种", "Currency")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("全部币种", "All")}</SelectItem>
                  {CURRENCY_LIST.map(c => (
                    <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder={t("积分类型", "Type")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("全部类型", "All Types")}</SelectItem>
                  <SelectItem value="consumption">{t("消费积分", "Consumption")}</SelectItem>
                  <SelectItem value="referral_1">{t("推荐积分1", "Referral 1")}</SelectItem>
                  <SelectItem value="referral_2">{t("推荐积分2", "Referral 2")}</SelectItem>
                  <SelectItem value="lottery">{t("抽奖积分", "Lottery")}</SelectItem>
                  <SelectItem value="earn">{t("获得", "Earn")}</SelectItem>
                  <SelectItem value="reverse">{t("冲正", "Reverse")}</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-24">
                  <SelectValue placeholder={t("状态", "Status")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("全部", "All")}</SelectItem>
                  <SelectItem value="issued">{t("已发放", "Issued")}</SelectItem>
                  <SelectItem value="reversed">{t("已回收", "Reversed")}</SelectItem>
                </SelectContent>
              </Select>
              {!toolbarActionsInTabRow && (
                <>
                  <Button variant="outline" size="icon" onClick={handleRefresh}>
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="icon" onClick={() => exportConfirm.requestExport(handleExport)}>
                    <Download className="h-4 w-4" />
                  </Button>
                </>
              )}
            </div>
          )}
          
          {isMobile ? (
            <>
              <MobileCardList>
                {paginatedLedger.length === 0 ? (
                  <MobileEmptyState message={t("暂无积分流水记录", "No points ledger entries")} />
                ) : (
                  paginatedLedger.map((entry) => {
                    const typeConfig = getTypeConfig(entry.transaction_type, entry.reference_type);
                    const showFx = showOrderFxColumns(entry.transaction_type);
                    const noteText = formatPointsLedgerDescription(entry.description);
                    return (
                      <MobileCard key={entry.id} accent="default" className={entry.status === 'reversed' ? 'opacity-60' : ''}>
                        <MobileCardHeader>
                          <div className="flex items-center gap-2">
                            <Badge variant={typeConfig.variant} className={typeConfig.color}>
                              {t(typeConfig.label, typeConfig.labelEn)}
                            </Badge>
                            <span className={`font-semibold ${entry.points_earned > 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {entry.points_earned > 0 ? '+' : ''}{entry.points_earned}
                            </span>
                          </div>
                          <span className="text-xs text-muted-foreground">{formatDateTime(entry.created_at)}</span>
                        </MobileCardHeader>
                        <MobileCardRow label={t("会员编号", "Member")} value={entry.member_code || "—"} />
                        <MobileCardRow label={t("电话号码", "Phone")} value={getDisplayPhone(entry.phone_number || '', isAdmin)} />
                        {noteText ? (
                          <MobileCardRow label={t("备注", "Note")} value={noteText} />
                        ) : null}
                        <MobileCardRow label={t("变动后积分", "After")} value={entry.pointsAfter} highlight />
                        <MobileCardCollapsible>
                          {showFx && <MobileCardRow label={t("实付外币", "Paid")} value={entry.actual_payment?.toLocaleString() || '-'} />}
                          {showFx && <MobileCardRow label={t("币种", "Currency")} value={entry.currency || '-'} />}
                          {showFx && <MobileCardRow label={t("兑换USD", "USD")} value={entry.usd_amount ? `$${Number(entry.usd_amount).toFixed(2)}` : '-'} />}
                          <MobileCardRow label={t("变动前积分", "Before")} value={entry.pointsBefore} />
                          <MobileCardRow label={t("状态", "Status")} value={
                            entry.points_earned > 0 ? t("已发放", "Issued") : t("已回收", "Reversed")
                          } />
                        </MobileCardCollapsible>
                      </MobileCard>
                    );
                  })
                )}
                <MobilePagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  totalItems={filteredLedger.length}
                  onPageChange={setCurrentPage}
                  pageSize={pageSize}
                  onPageSizeChange={setPageSize}
                />
              </MobileCardList>
            </>
          ) : (
          <StickyScrollTableContainer minWidth="1400px">
            <Table className="text-xs">
              <TableHeader className="sticky top-0 z-10 bg-muted/80 backdrop-blur-sm">
                <TableRow className="bg-muted/50">
                  <TableHead className="whitespace-nowrap text-center px-1.5 h-8">{t("获得时间", "Earned At")}</TableHead>
                  <TableHead className="whitespace-nowrap text-center px-1.5 h-8">{t("会员编号", "Member Code")}</TableHead>
                  <TableHead className="whitespace-nowrap text-center px-1.5 h-8">{t("电话号码", "Phone")}</TableHead>
                  <TableHead className="whitespace-nowrap text-center px-1.5 h-8">{t("订单/关联", "Order / Ref")}</TableHead>
                  <TableHead className="whitespace-nowrap text-center px-1.5 h-8">{t("实付外币", "Paid Amount")}</TableHead>
                  <TableHead className="whitespace-nowrap text-center px-1.5 h-8">{t("币种", "Currency")}</TableHead>
                  <TableHead className="whitespace-nowrap text-center px-1.5 h-8">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger className="flex items-center gap-1 justify-center">
                          {t("当时汇率", "FX Rate")}
                          <Info className="h-3 w-3" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{t("积分生成时的币种→USD汇率快照", "Currency→USD rate snapshot at points generation")}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </TableHead>
                  <TableHead className="whitespace-nowrap text-center px-1.5 h-8">{t("兑换USD", "USD Amount")}</TableHead>
                  <TableHead className="whitespace-nowrap text-center px-1.5 h-8">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger className="flex items-center gap-1 justify-center">
                          {t("积分倍率", "Points Rate")}
                          <Info className="h-3 w-3" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{t("积分生成时的1USD=X积分快照", "1 USD = X Points snapshot at generation")}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </TableHead>
                  <TableHead className="whitespace-nowrap text-center px-1.5 h-8">{t("获得积分", "Points Earned")}</TableHead>
                  <TableHead className="whitespace-nowrap text-center px-1.5 h-8">{t("变动前积分", "Before")}</TableHead>
                  <TableHead className="whitespace-nowrap text-center px-1.5 h-8">{t("变动后积分", "After")}</TableHead>
                  <TableHead className="whitespace-nowrap text-center px-1.5 h-8 max-w-[140px]">{t("备注", "Note")}</TableHead>
                  <TableHead className="whitespace-nowrap text-center px-1.5 h-8">{t("类型", "Type")}</TableHead>
                  <TableHead className="whitespace-nowrap text-center px-1.5 h-8">{t("状态", "Status")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedLedger.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={15} className="text-center text-muted-foreground py-8">
                      {t("暂无积分流水记录", "No points ledger entries")}
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedLedger.map((entry) => {
                    const typeConfig = getTypeConfig(entry.transaction_type, entry.reference_type);
                    const showFx = showOrderFxColumns(entry.transaction_type);
                    const noteText = formatPointsLedgerDescription(entry.description);
                    return (
                      <TableRow 
                        key={entry.id}
                        className={entry.status === 'reversed' ? 'opacity-60 bg-muted/30' : 'hover:bg-muted/30'}
                      >
                        <TableCell className="whitespace-nowrap text-center px-1.5 py-1.5">
                          {formatDateTime(entry.created_at)}
                        </TableCell>
                        <TableCell className="font-medium whitespace-nowrap text-center px-1.5 py-1.5">{entry.member_code || "—"}</TableCell>
                        <TableCell className="whitespace-nowrap text-center px-1.5 py-1.5">{getDisplayPhone(entry.phone_number || '', isAdmin)}</TableCell>
                        <TableCell className="font-mono whitespace-nowrap text-center px-1.5 py-1.5">
                          {entry.order_id ? (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger 
                                  className="text-primary hover:underline cursor-pointer"
                                  onClick={() => {
                                    sessionStorage.setItem('targetOrderId', entry.order_id || '');
                                    navigate(STAFF_ORDERS_PATH);
                                  }}
                                >
                                  {entry.order_id.substring(0, 8).toUpperCase()}
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p className="font-mono text-xs">{entry.order_id}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          ) : entry.reference_type === "lottery_log" && entry.reference_id ? (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger className="text-muted-foreground cursor-default">
                                  {entry.reference_id.substring(0, 8).toUpperCase()}…
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p className="text-xs">{t("抽奖记录 ID", "Lottery log ID")}</p>
                                  <p className="font-mono text-[10px] break-all">{entry.reference_id}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          ) : (
                            "-"
                          )}
                        </TableCell>
                        <TableCell className="text-center whitespace-nowrap px-1.5 py-1.5">
                          {showFx ? (entry.actual_payment ? entry.actual_payment.toLocaleString() : '-') : '-'}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-center px-1.5 py-1.5">
                          {showFx ? (
                            entry.currency ? (
                              <Badge 
                                variant="outline" 
                                style={{ borderColor: CURRENCIES[entry.currency as CurrencyCode]?.color }}
                              >
                                {CURRENCIES[entry.currency as CurrencyCode]?.name || entry.currency}
                              </Badge>
                            ) : '-'
                          ) : '-'}
                        </TableCell>
                        <TableCell className="text-center whitespace-nowrap font-mono px-1.5 py-1.5">
                          {showFx ? (entry.exchange_rate || '-') : '-'}
                        </TableCell>
                        <TableCell className="text-center whitespace-nowrap px-1.5 py-1.5">
                          {showFx ? (entry.usd_amount ? `$${Number(entry.usd_amount).toFixed(2)}` : '-') : '-'}
                        </TableCell>
                        <TableCell className="text-center whitespace-nowrap px-1.5 py-1.5">
                          {showFx ? (entry.points_multiplier ? `×${entry.points_multiplier}` : '-') : '-'}
                        </TableCell>
                        <TableCell className={`text-center font-medium whitespace-nowrap px-1.5 py-1.5 ${
                          entry.points_earned > 0 ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {entry.points_earned > 0 ? '+' : ''}{entry.points_earned}
                        </TableCell>
                        <TableCell className="text-center whitespace-nowrap text-muted-foreground px-1.5 py-1.5">
                          {entry.pointsBefore}
                        </TableCell>
                        <TableCell className="text-center whitespace-nowrap font-medium px-1.5 py-1.5">
                          {entry.pointsAfter}
                        </TableCell>
                        <TableCell className="text-center px-1.5 py-1.5 max-w-[160px] truncate text-muted-foreground" title={noteText || undefined}>
                          {noteText || "—"}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-center px-1.5 py-1.5">
                          <Badge 
                            variant={typeConfig.variant}
                            className={typeConfig.color}
                          >
                            {t(typeConfig.label, typeConfig.labelEn)}
                          </Badge>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-center px-1.5 py-1.5">
                          {(() => {
                            const isRedemptionType = entry.transaction_type === 'redeem_activity_1' || 
                              entry.transaction_type === 'redeem_activity_2' || 
                              entry.transaction_type === 'redemption' ||
                              entry.transaction_type === 'redeem';
                            if (isRedemptionType) {
                              return (
                                <Badge variant="outline" className="border-orange-500 text-orange-600">
                                  {t("已兑换", "Redeemed")}
                                </Badge>
                              );
                            }
                            return (
                              <Badge 
                                variant={entry.points_earned > 0 ? 'outline' : 'destructive'}
                                className={entry.points_earned > 0 ? 'border-green-500 text-green-600' : ''}
                              >
                                {entry.points_earned > 0 ? t("已发放", "Issued") : t("已回收", "Reversed")}
                              </Badge>
                            );
                          })()}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </StickyScrollTableContainer>
          )}

          {/* Pagination - 仅桌面端显示（移动端已有 MobilePagination） */}
          {!isMobile && filteredLedger.length > 0 && (
            <div className="flex items-center justify-between mt-3 pt-2 border-t shrink-0">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>{t("每页", "Per page")}</span>
                <Select value={pageSize.toString()} onValueChange={(v) => setPageSize(Number(v))}>
                  <SelectTrigger className="w-[70px] h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAGE_SIZE_OPTIONS.map(size => (
                      <SelectItem key={size} value={size.toString()}>{size}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span>{t("条", "items")}</span>
                <span className="ml-2 hidden sm:inline">
                  {t("显示", "Showing")} {Math.min((currentPage - 1) * pageSize + 1, filteredLedger.length)}-{Math.min(currentPage * pageSize, filteredLedger.length)} / {t("共", "Total")} {filteredLedger.length} {t("条", "records")}
                </span>
              </div>
              <div className="flex items-center gap-1">
                {totalPages > 2 && (
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setCurrentPage(1)}
                    disabled={currentPage === 1}
                  >
                    <ChevronsLeft className="h-4 w-4" />
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm tabular-nums px-3">
                  {currentPage} / {totalPages || 1}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
                {totalPages > 2 && (
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setCurrentPage(totalPages)}
                    disabled={currentPage >= totalPages}
                  >
                    <ChevronsRight className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
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
