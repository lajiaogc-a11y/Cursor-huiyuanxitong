import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useIsMobile } from "@/hooks/use-mobile";
import { MobileCardList, MobileCard, MobileCardHeader, MobileCardRow, MobileCardCollapsible, MobileCardActions, MobilePagination, MobileEmptyState } from "@/components/ui/mobile-data-card";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SortableTableHead, useSortableData } from "@/components/ui/sortable-table-head";
import { StickyScrollTableContainer } from "@/components/ui/sticky-scroll-table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DrawerDetail } from "@/components/shell/DrawerDetail";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Gift, 
  Users,
  FileText,
  Copy,
} from "lucide-react";
import { MemberActivityFilters, type TimeRange } from "./MemberActivityFilters";
import { notify } from "@/lib/notifyHub";
import { useColumnVisibility, ColumnConfig } from "@/hooks/useColumnVisibility";
import ColumnVisibilityDropdown from "@/components/ColumnVisibilityDropdown";
import { useLanguage } from "@/contexts/LanguageContext";
import { calculateTransactionFee } from "@/lib/feeCalculation";
import { 
  redeemPoints,
  getMemberLastResetTime,
  addPoints,
  deductPoints,
} from "@/services/points/pointsAccountService";
import { getActivitySettings, getRewardAmountByPointsAndCurrency } from "@/services/activity/activitySettingsService";
import { getPointsSettings } from "@/services/points/pointsSettingsService";
// getPointsLedger 已废弃，现在直接从数据库读取 points_ledger 表
import { useAuth } from "@/contexts/AuthContext";
import { CurrencyCode } from "@/config/currencies";

import { getExchangePreview, canExchange, getExchangeDisabledMessage, getActiveActivityType } from "@/services/finance/exchangeService";
import { isDateInRange, DateRange } from "@/lib/dateFilter";
import { redeemPointsAndRecordRpc } from "@/services/members/memberPointsRedeemRpcService";
import { useTenantView } from "@/contexts/TenantViewContext";
import { useModulePermissions } from "@/hooks/useFieldPermissions";
import { addGiftAmount, deductAccumulatedProfit } from "@/hooks/useMemberActivity";
import { cleanPhoneNumber, validatePhoneLength } from "@/lib/phoneValidation";
import { trackRender } from "@/lib/performanceUtils";
import { useMembers } from "@/hooks/useMembers";
import { usePointsLedger, type PointsLedgerEntry } from "@/hooks/usePointsLedger";
import { useActivityDataContent } from "@/hooks/useActivityDataContent";
import { TablePageSkeleton } from "@/components/skeletons/TablePageSkeleton";
import { generateEnglishCopyText, refreshCopySettings } from "@/components/CopySettingsTab";
import { getMemberPointsSummary } from "@/services/points/pointsCalculationService";
import { formatBeijingTime, formatBeijingDate, getNowBeijingISO } from "@/lib/beijingTime";
import { getSpinCreditsDetailApi, type SpinCreditDetailRow } from "@/services/staff/dataApi/activityData";
import { ActivityPointsHistoryDrawer } from "./ActivityPointsHistoryDrawer";
import { ActivitySpinDetailDrawer } from "./ActivitySpinDetailDrawer";
import { ActivityRedeemDialog } from "./ActivityRedeemDialog";

// 类型定义
interface Member {
  id: string;
  phone_number: string;
  member_code: string;
  nickname?: string | null;
  /** 行内展示用：昵称或会员编号 */
  memberDisplayName?: string;
  currency_preferences?: string[];
  [key: string]: any;
}

/** 会员名称：门户昵称优先，未设置则与会员编号一致 */
function formatMemberDisplayName(nickname: string | null | undefined, memberCode: string): string {
  const n = (nickname ?? "").trim();
  return n || memberCode;
}

interface Order {
  id: string;
  created_at: string;
  phone_number?: string;
  member_id?: string;
  currency?: string;
  actual_payment?: number;
  status: string;
  [key: string]: any;
}

interface ActivityGift {
  id: string;
  phone_number: string;
  currency: string;
  amount: number;
  rate: number;
  fee: number;
  gift_value: number;
  payment_agent: string;
  gift_type: string;
  remark: string;
  created_at: string;
}

interface PaymentProvider {
  id: string;
  name: string;
  status: string;
}

interface ReferralRelation {
  id: string;
  referrer_phone: string;
  referee_phone: string;
  referee_member_code: string;
  created_at: string;
}

interface ReferralListItem {
  phone: string;
  memberCode: string;
  referredAt: string;
  currency?: string;
}

interface MemberActivityRow {
  member: Member;
  accumulatedNgn: number;
  accumulatedGhs: number;
  accumulatedUsdt: number;
  giftNgn: number;
  giftGhs: number;
  giftUsdt: number;
  /** 兑换口径：时间筛选 + 重置后（订单实付） */
  exchangeNgn: number;
  exchangeGhs: number;
  exchangeUsdt: number;
  /** 永久累积（member_activity，仅利润等仍用） */
  permanentAccumulatedNgn: number;
  permanentAccumulatedGhs: number;
  permanentAccumulatedUsdt: number;
  permanentGiftNgn: number;
  permanentGiftGhs: number;
  permanentGiftUsdt: number;
  accumulatedProfit: number;
  accumulatedProfitUsdt: number;
  /** 抽奖剩余次数余额（服务端 member_activity.lottery_spin_balance，不含当日免费额度） */
  lotterySpinBalance: number;
  /** 消费次数：本人已完成订单，时间筛选 + 重置后 */
  orderCount: number;
  /** 累积次数：member_activity.order_count（永久累积有效订单数，删除/取消会回滚） */
  permanentOrderCount: number;
  remainingPoints: number;
  resetTime: string | null;
  referralCount: number;
  referralList: ReferralListItem[];
  referralOrderCount: number;
  referralReward: { points: number };
  consumptionReward: number;
  lotteryReward: number;
  /** 下级次数：所有被推荐人在订单管理中「已完成」的有效交易笔数之和（时间+重置后；不含已取消等） */
  consumptionCount: number;
  /** 邀抽累次：该用户从 spin_credits 累计获得的抽奖次数（永久累积） */
  inviteSpinCredits: number;
}

// 统一时间范围计算（使用系统级时间搜索规则：00:00:00 至 23:59:59.999）
function getLocalTimeRangeDates(range: TimeRange, customStart?: string, customEnd?: string): DateRange {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  
  switch (range) {
    case "all":
      return { start: null, end: null };
    case "today":
      return { start: todayStart, end: todayEnd };
    case "yesterday": {
      const yesterdayStart = new Date(todayStart);
      yesterdayStart.setDate(yesterdayStart.getDate() - 1);
      const yesterdayEnd = new Date(todayEnd);
      yesterdayEnd.setDate(yesterdayEnd.getDate() - 1);
      return { start: yesterdayStart, end: yesterdayEnd };
    }
    case "thisMonth": {
      const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      return { start: thisMonthStart, end: todayEnd };
    }
    case "lastMonth": {
      const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
      const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      return { start: lastMonthStart, end: lastMonthEnd };
    }
    case "custom":
      if (customStart && customEnd) {
        const start = new Date(customStart);
        start.setHours(0, 0, 0, 0);
        const end = new Date(customEnd);
        end.setHours(23, 59, 59, 999);
        return { start, end };
      }
      return { start: null, end: null };
    default:
      return { start: todayStart, end: todayEnd };
  }
}

// 脱敏电话号码
function maskPhone(phone: string): string {
  const s = String(phone ?? '');
  if (!s || s.length < 8) return s;
  return `${s.slice(0, 3)}***${s.slice(-5)}`;
}

// 注: 活动赠送数据由后端 API / 数据库加载；localStorage 版本已弃用

// 计算赠送价值
function calculateGiftValue(currency: string, amount: number, rate: number, fee: number): number {
  if (!amount || !rate) return 0;
  
  // 奈拉：赠送金额 ÷ 当时汇率 + 手续费
  // 赛地/USDT：赠送金额 × 当时汇率 + 手续费
  if (currency === "NGN") {
    return amount / rate + fee;
  } else {
    return amount * rate + fee;
  }
}

export default function MemberActivityDataContent() {
  trackRender('MemberActivityDataContent');
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const { t, language } = useLanguage();
  const { employee, isAdmin } = useAuth();
  const { viewingTenantId } = useTenantView() || {};
  const effectiveTenantId = viewingTenantId || employee?.tenant_id || null;
  const useMyTenantRpc = !!(effectiveTenantId && employee?.tenant_id && effectiveTenantId === employee.tenant_id);
  // 使用 useMembers 与会员管理保持一致（含租户过滤），避免活动数据与会员管理会员数量不一致
  const { members: membersFromHook } = useMembers();
  // usePointsLedger = single source of truth for all staff-side points ledger data.
  // Both the main table aggregation and the detail drawer use the same entries.
  const { entries: pointsLedgerEntries, loading: pointsLedgerLoading } = usePointsLedger();
  // react-query 缓存，页面切换秒开（orders, gifts, accounts, spin credits, etc.）
  const {
    orders,
    gifts,
    paymentProviders,
    referrals,
    memberActivities,
    pointsAccountsData,
    spinCreditsData,
    cachedRates,
    isLoading: activityDataLoading,
    refetch: refetchActivityData,
  } = useActivityDataContent(effectiveTenantId, useMyTenantRpc);
  const pointsLedgerData = pointsLedgerEntries;
  const [timeRange, setTimeRange] = useState<TimeRange>("thisMonth");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [searchError, setSearchError] = useState("");

  // 列配置 - 定义所有可隐藏的列
  const ACTIVITY_COLUMNS: ColumnConfig[] = useMemo(() => [
    { key: 'phone', label: t('电话号码', 'Phone') },
    { key: 'memberCode', label: t('会员编号', 'Member Code') },
    { key: 'memberName', label: t('会员名称', 'Member name') },
    { key: 'lotterySpinBalance', label: t('抽奖次数', 'Lottery draws') },
    { key: 'inviteSpinCredits', label: t('邀抽累次', 'Invite spins earned') },
    { key: 'orderCount', label: t('消费次数', 'Consumption count') },
    { key: 'permanentOrderCount', label: t('累积次数', 'Accumulated count') },
    { key: 'accumulatedProfit', label: t('累计利润', 'Total profit') },
    { key: 'permanentAccumulatedNgn', label: t('兑换奈拉', 'Redeem NGN') },
    { key: 'permanentAccumulatedGhs', label: t('兑换赛地', 'Redeem GHS') },
    { key: 'permanentAccumulatedUsdt', label: t('兑换US', 'Redeem US') },
    { key: 'giftNgn', label: t('赠送奈拉', 'Gift NGN') },
    { key: 'giftGhs', label: t('赠送赛地', 'Gift GHS') },
    { key: 'giftUsdt', label: t('赠送US', 'Gift USDT') },
    { key: 'resetTime', label: t('重置时间', 'Reset Time') },
    { key: 'referralCount', label: t('推荐人数', 'Referrals') },
    { key: 'consumptionCount', label: t('下级次数', 'Sub. order count') },
    { key: 'consumptionReward', label: t('消费奖励', 'Consumption Reward') },
    { key: 'referralReward', label: t('推广奖励', 'Promo reward') },
    { key: 'lotteryReward', label: t('抽奖奖励', 'Lottery reward') },
    { key: 'remainingPoints', label: t('剩余积分', 'Remaining Points') },
    { key: 'actions', label: t('操作', 'Actions') },
  ], [t]);
  
  // 列显示/隐藏状态 - 持久化到 localStorage
  const { visibleColumns, toggleColumn, resetToDefault, isVisible } = useColumnVisibility('member-activity-data', ACTIVITY_COLUMNS);
  
  // 权限控制
  const { permissions: fieldPerms, canViewField, canEditField } = useModulePermissions('activity');
  
  // 积分流水详情对话框
  const [isPointsHistoryDialogOpen, setIsPointsHistoryDialogOpen] = useState(false);
  const [selectedMemberForHistory, setSelectedMemberForHistory] = useState<Member | null>(null);
  
  const [isReferralDialogOpen, setIsReferralDialogOpen] = useState(false);
  const [currentReferralList, setCurrentReferralList] = useState<ReferralListItem[]>([]);
  const [currentReferralMemberPhone, setCurrentReferralMemberPhone] = useState("");
  
  // 积分修改对话框状态
  const [isPointsDialogOpen, setIsPointsDialogOpen] = useState(false);
  const [editingMemberCode, setEditingMemberCode] = useState("");
  const [pointsAdjustment, setPointsAdjustment] = useState("");

  // 兑换对话框状态
  const [isRedeemDialogOpen, setIsRedeemDialogOpen] = useState(false);
  const [redeemingRow, setRedeemingRow] = useState<MemberActivityRow | null>(null);
  const [selectedPaymentProvider, setSelectedPaymentProvider] = useState("");
  const [redeemRemark, setRedeemRemark] = useState("");
  
  // 兑换确认对话框状态
  const [isRedeemConfirmOpen, setIsRedeemConfirmOpen] = useState(false);

  // 抽奖次数明细对话框
  const [isSpinDetailOpen, setIsSpinDetailOpen] = useState(false);
  const [spinDetailMember, setSpinDetailMember] = useState<{ id: string; label: string } | null>(null);
  const [spinDetailRows, setSpinDetailRows] = useState<SpinCreditDetailRow[]>([]);
  const [spinDetailRemaining, setSpinDetailRemaining] = useState(0);
  const [spinDetailLoading, setSpinDetailLoading] = useState(false);
  
  // 分页状态 - 默认20条
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const pageSizeOptions = [10, 20, 50, 100];

  const handleRefresh = () => {
    refetchActivityData();
    notify.success(t("数据已刷新", "Data refreshed"));
  };

  // 根据时间范围过滤数据（使用统一的系统级日期筛选规则）
  const dateRange = useMemo(
    () => getLocalTimeRangeDates(timeRange, customStart, customEnd),
    [timeRange, customStart, customEnd]
  );

  const isInTimeRange = (dateStr: string): boolean => {
    return isDateInRange(dateStr, dateRange);
  };

  // 将 useMembers 的 Member 格式转为活动数据所需的 raw 格式（与会员管理数据源一致）
  const members: Member[] = useMemo(() => 
    membersFromHook.map(m => ({
      id: m.id,
      phone_number: m.phoneNumber,
      member_code: m.memberCode,
      nickname: m.nickname ?? null,
      currency_preferences: m.preferredCurrency || [],
    })),
    [membersFromHook]
  );

  // 计算每个会员的活动数据 - 使用数据库字段名
  const activityData: MemberActivityRow[] = useMemo(() => {
    const activitySettings = getActivitySettings();
    const pointsSettings = getPointsSettings();
    // 使用从数据库实时读取的积分明细数据，而不是缓存
    
    return members.map(member => {
      // 获取重置时间 - 从 pointsAccountsData 实时读取，不使用缓存
      // 这确保兑换后重置时间立即更新
      const memberAccount = pointsAccountsData.find(
        (a: { member_id?: string; member_code?: string }) =>
          a.member_id === member.id || a.member_code === member.member_code,
      );
      const resetTime = memberAccount?.last_reset_time || null;
      const resetDate = resetTime ? new Date(resetTime) : null;
      
      // 判断数据是否在重置时间之后（如果有重置时间的话）
      // 使用 > 而不是 >= 确保兑换记录不被包含在新周期
      const isAfterReset = (dateStr: string): boolean => {
        if (!resetDate) return true;
        return new Date(dateStr) > resetDate;
      };

      /** 顶部时间范围 + 重置后（活动数据口径） */
      const inScope = (dateStr: string): boolean =>
        isAfterReset(dateStr) && isInTimeRange(dateStr);

      const isOrderCurrencyNgn = (c: string | undefined) =>
        c === '奈拉' || c === 'NGN' || String(c || '').toUpperCase() === 'NAIRA';
      const isOrderCurrencyGhs = (c: string | undefined) =>
        c === '赛地' || c === 'GHS' || String(c || '').toUpperCase() === 'CEDI' || c === '赛迪';

      const orderMatchesMember = (o: (typeof orders)[0]) =>
        o.member_id === member.id || o.phone_number === member.phone_number;

      // 1–3. 兑换口径：已完成订单实付，时间筛选 + 重置后
      const exchangeNgn = orders
        .filter(
          (o) =>
            orderMatchesMember(o) &&
            isOrderCurrencyNgn(o.currency) &&
            o.status === 'completed' &&
            inScope(o.created_at),
        )
        .reduce((sum, o) => sum + (Number(o.actual_payment) || 0), 0);

      const exchangeGhs = orders
        .filter(
          (o) =>
            orderMatchesMember(o) &&
            isOrderCurrencyGhs(o.currency) &&
            o.status === 'completed' &&
            inScope(o.created_at),
        )
        .reduce((sum, o) => sum + (Number(o.actual_payment) || 0), 0);

      const exchangeUsdt = orders
        .filter(
          (o) =>
            orderMatchesMember(o) &&
            o.currency === 'USDT' &&
            o.status === 'completed' &&
            inScope(o.created_at),
        )
        .reduce((sum, o) => sum + (Number(o.actual_payment) || 0), 0);

      const accumulatedNgn = exchangeNgn;
      const accumulatedGhs = exchangeGhs;
      const accumulatedUsdt = exchangeUsdt;

      // 消费次数：本人已完成订单笔数（时间 + 重置后）
      const consumptionOrderCount = orders.filter(
        (o) => orderMatchesMember(o) && o.status === 'completed' && inScope(o.created_at),
      ).length;

      // 4-6. 赠送金额统计 — 从活动赠送汇总，按币种分列（仅时间筛选，不受重置影响）
      const memberGifts = gifts.filter(
        (g) =>
          (g.phone_number === member.phone_number || g.member_id === member.id) &&
          isInTimeRange(g.created_at),
      );
      
      const giftNgn = memberGifts
        .filter(g => g.currency === "NGN")
        .reduce((sum, g) => sum + (Number(g.amount) || 0), 0);
      
      const giftGhs = memberGifts
        .filter(g => g.currency === "GHS")
        .reduce((sum, g) => sum + (Number(g.amount) || 0), 0);
      
      const giftUsdt = memberGifts
        .filter(g => g.currency === "USDT")
        .reduce((sum, g) => sum + (Number(g.amount) || 0), 0);

      // 邀抽累次：仅邀请相关 source（与 memberAuth invite_lifetime_reward_spins 一致）
      const inviteSpinCredits = (
        spinCreditsData as {
          member_id?: string;
          total_spins?: number | string;
          source?: string;
        }[]
      )
        .filter(
          (sc) =>
            sc.member_id === member.id &&
            (sc.source === 'referral' || sc.source === 'invite_welcome'),
        )
        .reduce((sum, sc) => sum + Math.max(0, Math.floor(Number(sc.total_spins) || 0)), 0);

      // 7. 推荐人数 - 使用数据库字段名
      const memberReferrals = referrals.filter(r => r.referrer_phone === member.phone_number);
      const referralCount = memberReferrals.length;
      
      // 获取被推荐人的订单币种信息用于跳转
      const referralList: ReferralListItem[] = memberReferrals.map(r => {
        const memberOrders = orders.filter(o => o.phone_number === r.referee_phone && o.status === "completed");
        let currency: string | undefined;
        if (memberOrders.length > 0) {
          currency = memberOrders[0].currency || 'NGN';
        }
        return {
          phone: r.referee_phone,
          memberCode: r.referee_member_code,
          referredAt: r.created_at,
          currency,
        };
      });

      const ledgerAmt = (e: { points_earned?: number; amount?: number | string }) =>
        Number(e.points_earned ?? e.amount ?? 0);
      const ledgerTxn = (e: { transaction_type?: string; type?: string }) =>
        String(e.transaction_type || e.type || '').toLowerCase();
      const ledgerOk = (e: { status?: string | null }) => {
        const st = e.status;
        return (
          st === 'issued' ||
          st === 'reversed' ||
          st === 'active' ||
          st === 'VALID' ||
          st == null ||
          st === ''
        );
      };

      const matchMemberLedger = (e: {
        member_id?: string | null;
        phone_number?: string | null;
        member_code?: string | null;
      }) =>
        e.member_id === member.id ||
        e.phone_number === member.phone_number ||
        e.member_code === member.member_code;

      // 9. 推广奖励（原推荐奖励）：时间 + 重置后
      const referralRewardPoints = pointsLedgerData
        .filter((e) => {
          const tt = ledgerTxn(e);
          const matchType = tt === 'referral_1' || tt === 'referral_2';
          return matchMemberLedger(e) && matchType && ledgerOk(e) && inScope(e.created_at);
        })
        .reduce((sum, e) => sum + ledgerAmt(e), 0);

      // 10. 消费奖励：时间 + 重置后
      const consumptionReward = pointsLedgerData
        .filter((e) => {
          return matchMemberLedger(e) && ledgerTxn(e) === 'consumption' && ledgerOk(e) && inScope(e.created_at);
        })
        .reduce((sum, e) => sum + ledgerAmt(e), 0);

      // 抽奖奖励：全端抽奖发放的积分，时间 + 重置后
      const lotteryReward = pointsLedgerData
        .filter((e) => {
          return matchMemberLedger(e) && ledgerTxn(e) === 'lottery' && ledgerOk(e) && inScope(e.created_at);
        })
        .reduce((sum, e) => sum + ledgerAmt(e), 0);

      /** 下级次数：各被推荐人在订单管理中的「已完成」订单笔数之和（赛地/奈拉 + USDT 合并列表；不含已取消；取消后从列表消失则自然不计） */
      const countRefereeCompletedOrders = (refereePhone: string) => {
        const refM = members.find((m) => m.phone_number === refereePhone);
        return orders.filter(
          (o) =>
            (o.phone_number === refereePhone || (refM && o.member_id === refM.id)) &&
            o.status === 'completed' &&
            inScope(o.created_at),
        ).length;
      };
      const consumptionCount = memberReferrals.reduce(
        (sum, r) => sum + countRefereeCompletedOrders(r.referee_phone),
        0,
      );

      // 与下级次数同一口径（被推荐人已完成订单总数，时间+重置后）
      const referralOrderCount = consumptionCount;

      // 剩余积分：与「详细」中最新变动后一致 — 优先账户余额，否则流水最新 balance_after
      const acctBalRow = pointsAccountsData.find(
        (a: { member_id?: string; member_code?: string }) =>
          a.member_id === member.id || a.member_code === member.member_code,
      ) as { balance?: number | string } | undefined;
      const balRaw = acctBalRow != null ? Number(acctBalRow.balance) : NaN;
      let remainingPoints: number;
      if (Number.isFinite(balRaw)) {
        remainingPoints = balRaw;
      } else {
        const sortedLedger = pointsLedgerData
          .filter((e) => matchMemberLedger(e) && ledgerOk(e))
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        const last = sortedLedger[0] as { balance_after?: number | string } | undefined;
        const after = last != null ? Number(last.balance_after) : NaN;
        remainingPoints = Number.isFinite(after) ? after : 0;
      }

      // 创建兼容的 member 对象（转换字段名）
      const memberDisplayName = formatMemberDisplayName(member.nickname, member.member_code);
      const compatibleMember = {
        ...member,
        phoneNumber: member.phone_number,
        memberCode: member.member_code,
        memberDisplayName,
        preferredCurrency: member.currency_preferences || [],
      };

      // 获取永久累积数据
      const memberActivity = memberActivities.find(a => a.member_id === member.id);
      
      return {
        member: compatibleMember as any,
        accumulatedNgn,
        accumulatedGhs,
        accumulatedUsdt,
        exchangeNgn,
        exchangeGhs,
        exchangeUsdt,
        giftNgn,
        giftGhs,
        giftUsdt,
        // 永久累积字段 - 从 member_activity 表读取（利润等仍为全量）
        permanentAccumulatedNgn: memberActivity?.total_accumulated_ngn || 0,
        permanentAccumulatedGhs: memberActivity?.total_accumulated_ghs || 0,
        permanentAccumulatedUsdt: memberActivity?.total_accumulated_usdt || 0,
        permanentGiftNgn: memberActivity?.total_gift_ngn || 0,
        permanentGiftGhs: memberActivity?.total_gift_ghs || 0,
        permanentGiftUsdt: memberActivity?.total_gift_usdt || 0,
        accumulatedProfit: memberActivity?.accumulated_profit || 0,
        accumulatedProfitUsdt: memberActivity?.accumulated_profit_usdt || 0,
        lotterySpinBalance: Math.max(0, Math.floor(Number(memberActivity?.lottery_spin_balance ?? 0))),
        orderCount: consumptionOrderCount,
        permanentOrderCount: Math.max(0, Number(memberActivity?.order_count ?? 0)),
        remainingPoints,
        resetTime,
        referralCount,
        referralList,
        referralOrderCount,
        referralReward: {
          points: referralRewardPoints,
        },
        consumptionReward,
        lotteryReward,
        consumptionCount,
        inviteSpinCredits,
      };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [members, orders, gifts, referrals, memberActivities, pointsLedgerData, pointsAccountsData, spinCreditsData, dateRange]);

  // 搜索过滤并按最新订单时间排序（最新的排在最上面）
  const filteredActivityData = useMemo(() => {
    let data = activityData;
    
    // 搜索过滤
    if (searchTerm.trim()) {
      const search = searchTerm.toLowerCase().trim();
      data = data.filter(row => 
        String(row.member.phoneNumber ?? '').toLowerCase().includes(search) ||
        String(row.member.memberCode ?? '').toLowerCase().includes(search) ||
        String(row.member.memberDisplayName ?? '').toLowerCase().includes(search)
      );
    }
    
    // 按最新活动时间排序（最新的在最上面）
    // 计算每个会员的最新活动时间（最新订单或最新赠送）
    return data.sort((a, b) => {
      // 获取会员a的最新活动时间
      const aOrders = orders.filter(o => 
        o.member_id === a.member.id || o.phone_number === a.member.phoneNumber
      );
      const aGifts = gifts.filter(g => g.phone_number === a.member.phoneNumber);
      const aLatestOrder = aOrders.length > 0 ? new Date(aOrders[0].created_at).getTime() : 0;
      const aLatestGift = aGifts.length > 0 ? Math.max(...aGifts.map(g => new Date(g.created_at).getTime())) : 0;
      const aLatest = Math.max(aLatestOrder, aLatestGift);
      
      // 获取会员b的最新活动时间
      const bOrders = orders.filter(o => 
        o.member_id === b.member.id || o.phone_number === b.member.phoneNumber
      );
      const bGifts = gifts.filter(g => g.phone_number === b.member.phoneNumber);
      const bLatestOrder = bOrders.length > 0 ? new Date(bOrders[0].created_at).getTime() : 0;
      const bLatestGift = bGifts.length > 0 ? Math.max(...bGifts.map(g => new Date(g.created_at).getTime())) : 0;
      const bLatest = Math.max(bLatestOrder, bLatestGift);
      
      // 降序排列（最新的在前面）
      return bLatest - aLatest;
    });
  }, [activityData, searchTerm, orders, gifts]);

  // 排序功能 - 活动数据表格
  const { sortedData: sortedActivityData, sortConfig: activitySortConfig, requestSort: requestActivitySort } = useSortableData(filteredActivityData);

  // 分页后的活动数据
  const paginatedActivityData = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return sortedActivityData.slice(startIndex, startIndex + pageSize);
  }, [sortedActivityData, currentPage, pageSize]);
  
  // 总页数
  const totalPages = Math.ceil(sortedActivityData.length / pageSize);
  
  // 重置页码当筛选条件变化
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, timeRange, customStart, customEnd, pageSize]);

  // 获取会员的完整积分流水 — 使用 usePointsLedger 同源数据（与积分明细一致）
  const getMemberPointsHistory = (memberCode: string): PointsLedgerEntry[] => {
    const member = members.find(m => m.member_code === memberCode);
    const phoneNumber = member?.phone_number || '';
    const mid = member?.id;

    const byId = new Map(membersFromHook.map(m => [m.id, m]));
    return pointsLedgerEntries
      .filter((e) => {
        const eMid = e.member_id || '';
        if (mid && eMid === mid) return true;
        const eMc = e.member_code || (eMid ? byId.get(eMid)?.memberCode : '') || '';
        if (eMc === memberCode) return true;
        const ePh = e.phone_number || (eMid ? byId.get(eMid)?.phoneNumber : '') || '';
        if (phoneNumber && ePh === phoneNumber) return true;
        return false;
      })
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  };

  // 打开兑换对话框
  const openRedeemDialog = (row: MemberActivityRow) => {
    setRedeemingRow(row);
    setSelectedPaymentProvider("");
    setRedeemRemark("");
    setIsRedeemDialogOpen(true);
  };

  // 获取会员需求币种
  const getMemberPreferredCurrency = (member: Member): CurrencyCode => {
    // 从会员的preferredCurrency数组中获取第一个
    if (member.preferredCurrency && member.preferredCurrency.length > 0) {
      const firstPref = member.preferredCurrency[0];
      if (["NGN", "GHS", "USDT"].includes(firstPref)) {
        return firstPref as CurrencyCode;
      }
    }
    // 默认返回NGN
    return "NGN";
  };

  // 获取当前汇率 - 从汇率计算页面采集手动输入的汇率（人民币基准）
  const getCurrentExchangeRate = (currency: CurrencyCode): number | null => {
    // 使用组件状态中的汇率（已在loadData中预加载）
    if (!cachedRates) return null;
    
    switch (currency) {
      case "NGN":
        // 使用汇率计算页面手动输入的奈拉汇率（如210）
        return cachedRates.nairaRate > 0 ? cachedRates.nairaRate : null;
      case "GHS":
        // 使用汇率计算页面手动输入的赛地汇率（如0.6）
        return cachedRates.cediRate > 0 ? cachedRates.cediRate : null;
      case "USDT":
        // 与汇率页 USDT 采集一致：优先卖价（bid），见 calculatorInputRates / resolveUsdtRateForActivityGift
        return cachedRates.usdtRate > 0 ? cachedRates.usdtRate : null;
      default:
        return null;
    }
  };

  // 打开确认兑换对话框
  const handleRedeemClick = () => {
    if (!redeemingRow) return;
    
    if (!selectedPaymentProvider) {
      notify.error(t("请选择代付商家", "Please select a payment provider"));
      return;
    }

    // 打开确认对话框
    setIsRedeemConfirmOpen(true);
  };

  // 兑换：getExchangePreview（活动设置）+ redeemPointsAndRecordRpc；与「复制」无关，与计算器兑换同属后端 RPC
  const handleCompleteRedeem = async () => {
    if (!redeemingRow) return;

    const member = redeemingRow.member;
    
    // ===== 步骤1: 重新校验剩余积分（从活动数据统一来源）=====
    const remainingPoints = redeemingRow.remainingPoints;
    
    // 校验失败立即返回，不执行后续写库逻辑
    if (remainingPoints <= 0) {
      notify.error(t("剩余积分不足，兑换失败", "Insufficient points, redemption failed"));
      setIsRedeemConfirmOpen(false);
      return;
    }

    // ===== 步骤2: 使用统一兑换服务获取兑换预览 =====
    const preferredCurrencies = member.preferredCurrency || member.currency_preferences || [];
    const exchangePreview = getExchangePreview(remainingPoints, preferredCurrencies);
    
    // 检查是否可以兑换
    if (!exchangePreview.canExchange) {
      const { showSubmissionError } = await import('@/services/submissionErrorService');
      showSubmissionError(exchangePreview.message);
      setIsRedeemConfirmOpen(false);
      return;
    }
    
    const preferredCurrency = exchangePreview.exchangeCurrency!;
    const rewardAmount = exchangePreview.exchangeAmount;
    const activityType = exchangePreview.activityType;

    // ===== 步骤3: 获取当前汇率（从汇率计算页面手动输入的汇率）=====
    const currentRate = getCurrentExchangeRate(preferredCurrency);
    
    // 检查汇率是否配置
    if (currentRate === null || currentRate <= 0) {
      const { showSubmissionError } = await import('@/services/submissionErrorService');
      showSubmissionError(t("当前汇率未配置，请先在汇率计算页面设置汇率", "Exchange rate not configured, please set it on the rate calculation page"));
      setIsRedeemConfirmOpen(false);
      return;
    }
    
    // ===== 步骤4: 计算手续费和赠送价值 =====
    const fee = calculateTransactionFee(preferredCurrency, rewardAmount);
    const giftValue = calculateGiftValue(preferredCurrency, rewardAmount, currentRate, fee);

    // ===== 步骤5: 调用事务性 RPC，确保所有操作原子性 =====
    try {
      const memberId = members.find(m => m.member_code === member.memberCode)?.id || null;
      const currentEmployeeId = employee?.id || null;
      
      // 调用后端事务性 RPC
      const result = await redeemPointsAndRecordRpc({
        p_member_code: member.memberCode,
        p_phone: member.phoneNumber,
        p_member_id: memberId,
        p_points_to_redeem: remainingPoints,
        p_activity_type: activityType,
        p_gift_currency: preferredCurrency,
        p_gift_amount: rewardAmount,
        p_gift_rate: currentRate,
        p_gift_fee: fee,
        p_gift_value: giftValue,
        p_payment_agent: selectedPaymentProvider,
        p_creator_id: currentEmployeeId,
        p_creator_name: employee?.real_name || null,
        p_remark_locale: language === 'zh' ? 'zh' : 'en',
      });
      
      if (!result.success) {
        let errorMessage = t("兑换失败", "Redemption failed");
        switch (result.error) {
          case 'NO_POINTS':
            errorMessage = t("该会员没有可兑换的积分", "This member has no redeemable points");
            break;
          case 'POINTS_MISMATCH':
            errorMessage = t("积分数据已变化，请刷新后重试", "Points data has changed, please refresh and retry");
            break;
          default:
            errorMessage = `${t("兑换失败", "Redemption failed")}: ${result.error || t('未知错误', 'Unknown error')}`;
        }
        const { showSubmissionError } = await import('@/services/submissionErrorService');
        showSubmissionError(errorMessage);
        setIsRedeemConfirmOpen(false);
        return;
      }

      // ===== 事务成功：所有操作已在后端原子完成 =====
      
      // 🔧 记录代付商家余额变动日志（兑换积分产生的赠送支出）
      if (selectedPaymentProvider && giftValue > 0) {
        try {
          const { logGiftBalanceChange } = await import('@/services/finance/balanceLogService');
          await logGiftBalanceChange({
            providerName: selectedPaymentProvider,
            giftValue: giftValue,
            giftId: (result as any).gift_id || '',
            phoneNumber: member.phoneNumber,
            operatorId: currentEmployeeId || undefined,
            operatorName: employee?.real_name || undefined,
          });
        } catch (e) {
          console.error('[MemberActivityData] Failed to log gift balance change:', e);
        }
      }
      
      // 🔧 记录操作日志（兑换积分）- 传递完整操作人信息避免获取失败
      try {
        const { logOperationToDb } = await import('@/hooks/useOperationLogs');
        await logOperationToDb(
          'activity',
          'redeem_points',
          member.memberCode,
          { remainingPoints, memberCode: member.memberCode, phoneNumber: member.phoneNumber },
          { pointsRedeemed: remainingPoints, currency: preferredCurrency, amount: rewardAmount, giftValue, activityType, paymentAgent: selectedPaymentProvider },
          `兑换积分: ${member.memberCode} (${member.phoneNumber}) - ${remainingPoints}积分 -> ${rewardAmount} ${preferredCurrency}`,
          { id: employee?.id, account: employee?.real_name || 'unknown', role: employee?.role || 'staff' }
        );
      } catch (e) {
        console.error('[MemberActivityData] Failed to log redeem operation:', e);
      }

      // 触发 points.redeemed Webhook 事件（异步，不阻塞）
      import('@/services/webhookService').then(({ triggerPointsRedeemed }) => {
        triggerPointsRedeemed({
          memberId: memberId ?? undefined,
          memberCode: member.memberCode,
          phoneNumber: member.phoneNumber,
          points: remainingPoints,
          createdAt: new Date().toISOString(),
        }).catch(err => console.error('[MemberActivityData] Webhook trigger failed:', err));
      });
      
      const activityLabel = activityType === 'activity_1' ? t('活动1（阶梯制）', 'Activity 1 (Tiered)') : t('活动2（固定比例）', 'Activity 2 (Fixed Rate)');
      notify.success(t(`兑换成功！[${activityLabel}] 已兑换 ${remainingPoints} 积分，获得 ${rewardAmount} ${preferredCurrency}，积分已清零`, `Redemption successful! [${activityLabel}] Redeemed ${remainingPoints} points, received ${rewardAmount} ${preferredCurrency}, points reset to zero`));
      setIsRedeemConfirmOpen(false);
      setIsRedeemDialogOpen(false);
      refetchActivityData();
    } catch (error) {
      console.error("兑换过程发生错误:", error);
      const { showSubmissionError } = await import('@/services/submissionErrorService');
      showSubmissionError(t("兑换过程发生错误，请重试", "An error occurred during redemption, please retry"));
      setIsRedeemConfirmOpen(false);
    }
  };

  // 计算兑换预览信息（使用统一兑换服务）
  // 格式化汇率显示（NGN: 2位, GHS: 2位, USDT: 4位）
  const formatRateDisplay = (rate: number | null, currency: CurrencyCode): string => {
    if (rate === null || rate <= 0) return t("未配置", "Not configured");
    switch (currency) {
      case "USDT": return rate.toFixed(4);
      case "NGN":
      case "GHS":
      default: return rate.toFixed(2);
    }
  };

  const getRedeemPreviewData = () => {
    if (!redeemingRow) return null;
    
    const member = redeemingRow.member;
    const remainingPoints = redeemingRow.remainingPoints;
    const preferredCurrencies = member.preferredCurrency || member.currency_preferences || [];
    
    // 使用统一兑换服务
    const exchangePreview = getExchangePreview(remainingPoints, preferredCurrencies);
    
    if (!exchangePreview.canExchange || !exchangePreview.exchangeCurrency) {
      return {
        canExchange: false,
        message: exchangePreview.message,
        currency: null as CurrencyCode | null,
        rewardAmount: 0,
        currentRate: 0,
        currentRateDisplay: t("未配置", "Not configured"),
        fee: 0,
        giftValue: 0,
        activityType: exchangePreview.activityType,
      };
    }
    
    const currentRate = getCurrentExchangeRate(exchangePreview.exchangeCurrency);
    
    // 检查汇率是否配置
    if (currentRate === null || currentRate <= 0) {
      return {
        canExchange: false,
        message: t("当前汇率未配置，请先在汇率计算页面设置汇率", "Exchange rate not configured, please set it on the rate calculation page"),
        currency: exchangePreview.exchangeCurrency,
        rewardAmount: 0,
        currentRate: 0,
        currentRateDisplay: t("未配置", "Not configured"),
        fee: 0,
        giftValue: 0,
        activityType: exchangePreview.activityType,
      };
    }
    
    const fee = calculateTransactionFee(exchangePreview.exchangeCurrency, exchangePreview.exchangeAmount);
    const giftValue = calculateGiftValue(exchangePreview.exchangeCurrency, exchangePreview.exchangeAmount, currentRate, fee);
    
    return {
      canExchange: true,
      message: exchangePreview.message,
      currency: exchangePreview.exchangeCurrency,
      rewardAmount: exchangePreview.exchangeAmount,
      currentRate,
      currentRateDisplay: formatRateDisplay(currentRate, exchangePreview.exchangeCurrency),
      fee,
      giftValue,
      activityType: exchangePreview.activityType,
    };
  };

  // 修改积分
  const handleAdjustPoints = async () => {
    const adjustment = parseInt(pointsAdjustment);
    if (isNaN(adjustment) || adjustment === 0) {
      notify.error(t("请输入有效的积分数值", "Please enter a valid points value"));
      return;
    }
    
    const member = members.find(m => m.member_code === editingMemberCode);
    if (!member) {
      notify.error(t("会员不存在", "Member not found"));
      return;
    }
    
    if (adjustment > 0) {
      addPoints(editingMemberCode, member.phone_number, adjustment);
      notify.success(t(`已添加 ${adjustment} 积分`, `Added ${adjustment} points`));
    } else {
      deductPoints(editingMemberCode, Math.abs(adjustment));
      notify.success(t(`已扣减 ${Math.abs(adjustment)} 积分`, `Deducted ${Math.abs(adjustment)} points`));
    }

    // 🔧 记录操作日志（积分手动调整）
    try {
      const { logOperationToDb } = await import('@/hooks/useOperationLogs');
      await logOperationToDb(
        'activity',
        adjustment > 0 ? 'add_points' : 'deduct_points',
        editingMemberCode,
        { memberCode: editingMemberCode },
        { adjustment, memberCode: editingMemberCode },
        `${adjustment > 0 ? '添加' : '扣减'}积分: ${editingMemberCode} ${adjustment > 0 ? '+' : ''}${adjustment}`
      );
    } catch (e) {
      console.error('[MemberActivityData] Failed to log points adjustment:', e);
    }
    
    setIsPointsDialogOpen(false);
    refetchActivityData();
  };

  // 导出数据
  const handleExport = () => {
    const csvContent = [
      [
        t("电话号码", "Phone"),
        t("会员编号", "Member Code"),
        t("会员名称", "Member name"),
        t("抽奖次数", "Lottery draws"),
        t("消费次数", "Consumption count"),
        t("累积次数", "Accumulated count"),
        t("累计利润", "Total profit"),
        t("兑换奈拉", "Redeem NGN"),
        t("兑换赛地", "Redeem GHS"),
        t("兑换US", "Redeem US"),
        t("赠送奈拉", "Gift NGN"),
        t("赠送赛地", "Gift GHS"),
        t("赠送US", "Gift USDT"),
        t("重置时间", "Reset Time"),
        t("推荐人数", "Referrals"),
        t("下级次数", "Sub. order count"),
        t("消费奖励", "Consumption Reward"),
        t("推广奖励", "Promo reward"),
        t("抽奖奖励", "Lottery reward"),
        t("剩余积分", "Remaining Points"),
      ].join(","),
      ...activityData.map((row) =>
        [
          row.member.phoneNumber,
          row.member.memberCode,
          row.member.memberDisplayName ?? row.member.memberCode,
          row.lotterySpinBalance,
          row.orderCount,
          row.permanentOrderCount,
          (() => {
            const parts: string[] = [];
            if (row.accumulatedProfit) parts.push(`CNY${row.accumulatedProfit.toFixed(2)}`);
            if (row.accumulatedProfitUsdt) parts.push(`U${row.accumulatedProfitUsdt.toFixed(4)}`);
            return parts.length ? parts.join(" ") : "0";
          })(),
          row.exchangeNgn.toFixed(2),
          row.exchangeGhs.toFixed(2),
          row.exchangeUsdt.toFixed(2),
          row.giftNgn.toFixed(2),
          row.giftGhs.toFixed(2),
          row.giftUsdt.toFixed(2),
          row.resetTime ? formatBeijingTime(row.resetTime) : "-",
          row.referralCount,
          row.consumptionCount,
          row.consumptionReward,
          row.referralReward.points,
          row.lotteryReward,
          row.remainingPoints,
        ].join(","),
      ),
    ].join("\n");

    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `活动数据_${getNowBeijingISO().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    notify.success(t("数据已导出", "Data exported"));
  };

  // 监听导出事件
  useEffect(() => {
    const handleExportEvent = () => handleExport();
    window.addEventListener('activity-export', handleExportEvent);
    return () => window.removeEventListener('activity-export', handleExportEvent);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activityData, t]);

  const showReferralDialog = (list: ReferralListItem[], memberPhone: string) => {
    setCurrentReferralList(list);
    setCurrentReferralMemberPhone(memberPhone);
    setIsReferralDialogOpen(true);
  };

  const openSpinDetail = async (memberId: string, memberLabel: string) => {
    setSpinDetailMember({ id: memberId, label: memberLabel });
    setSpinDetailRows([]);
    setIsSpinDetailOpen(true);
    setSpinDetailLoading(true);
    try {
      const data = await getSpinCreditsDetailApi(memberId);
      setSpinDetailRows(data.credits);
      setSpinDetailRemaining(data.remaining);
    } catch {
      notify.error(t("加载抽奖次数明细失败", "Failed to load spin credits detail"));
    } finally {
      setSpinDetailLoading(false);
    }
  };

  // 跳转到订单管理并自动搜索
  const navigateToOrderWithSearch = (memberCode: string, currency?: string) => {
    const isUsdt = currency === 'USDT';
    sessionStorage.setItem("orderSearchMemberCode", memberCode);
    sessionStorage.setItem("orderSearchTab", isUsdt ? "usdt" : "normal");
    navigate("/staff/orders");
    setIsReferralDialogOpen(false);
  };

  // 仅剪贴板复制说明文案；与「兑换」无关（兑换见下方 handleCompleteRedeem → RPC）
  const handleCopyMemberInfo = async (row: MemberActivityRow) => {
    try {
      const settings = await refreshCopySettings();
      if (!settings.enabled) {
        notify.info(t("自动复制功能已关闭", "Auto copy is disabled"));
        return;
      }

      const activitySettings = getActivitySettings();
      let activityType: 'activity1' | 'activity2' | 'none' = 'none';
      if (activitySettings.activity1Enabled) {
        activityType = 'activity1';
      } else if (activitySettings.activity2?.enabled) {
        activityType = 'activity2';
      }

      // 活动数据页复制与活动营销开关一致；无活动时请用订单提交页自动复制或先开启活动
      if (activityType === 'none') {
        notify.info(t("当前没有活动开启", "No activity is currently enabled"));
        return;
      }

      // 从数据库获取最新积分数据
      const summary = await getMemberPointsSummary(
        row.member.memberCode,
        row.member.phoneNumber,
        undefined,
        row.member.id,
      );
      const totalPoints = summary.remainingPoints;
      const referralPoints = summary.referralRewardPoints;
      const consumptionPoints = summary.consumptionReward;

      // 判断币种 - 使用会员的币种偏好
      const memberCurrency = row.member.currency_preferences?.[0] || 'NGN';

      // 计算可兑换金额
      let redeemableAmount = '0 ' + memberCurrency;
      if (activityType === 'activity2' && activitySettings.activity2) {
        const rate = memberCurrency === 'NGN' ? activitySettings.activity2.pointsToNGN :
                     memberCurrency === 'GHS' ? activitySettings.activity2.pointsToGHS :
                     activitySettings.activity2.pointsToUSDT || 0;
        redeemableAmount = `${(totalPoints * rate).toLocaleString()} ${memberCurrency}`;
      } else {
        const rewardAmount = getRewardAmountByPointsAndCurrency(totalPoints, memberCurrency as any);
        redeemableAmount = `${rewardAmount.toLocaleString()} ${memberCurrency}`;
      }

      // 获取最后一笔订单的积分
      const lastOrderEntry = pointsLedgerData.find(
        e => e.member_code === row.member.memberCode && e.transaction_type === 'consumption' && e.status === 'issued' && e.points_earned > 0
      );
      const lastEarnedPoints = lastOrderEntry?.points_earned || 0;

      const rewardTiers = activitySettings.accumulatedRewardTiers.map(tier => ({
        range: tier.maxPoints === null ? `≥${tier.minPoints}` : `${tier.minPoints}-${tier.maxPoints}`,
        ngn: tier.rewardAmountNGN || 0,
        ghs: tier.rewardAmountGHS || 0,
        usdt: tier.rewardAmountUSDT || 0,
      }));

      const copyText = generateEnglishCopyText({
        phoneNumber: row.member.phoneNumber,
        memberCode: row.member.memberCode,
        earnedPoints: lastEarnedPoints,
        totalPoints,
        referralPoints,
        consumptionPoints,
        redeemableAmount,
        currency: memberCurrency,
        rewardTiers,
        activityType,
        activity2Rates: activityType === 'activity2' ? {
          pointsToNGN: activitySettings.activity2?.pointsToNGN || 0,
          pointsToGHS: activitySettings.activity2?.pointsToGHS || 0,
          pointsToUSDT: activitySettings.activity2?.pointsToUSDT || 0,
        } : undefined,
      });

      if (copyText) {
        try {
          await navigator.clipboard.writeText(copyText);
        } catch {
          const ta = document.createElement('textarea');
          ta.value = copyText;
          ta.style.position = 'fixed';
          ta.style.left = '-9999px';
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
        }
        notify.success(t("已复制会员积分信息到剪贴板", "Member points info copied to clipboard"));
      }
    } catch (error) {
      console.error('Copy member info failed:', error);
      notify.error(t("复制失败，请重试", "Copy failed, please retry"));
    }
  };

  // 根据角色决定是否脱敏显示电话号码
  const displayPhone = (phone: string) => {
    if (isAdmin) {
      return phone; // 管理员不脱敏
    }
    return maskPhone(phone); // 主管和员工脱敏
  };

  const redeemPreview = getRedeemPreviewData();

  // 监听设置今日和刷新事件
  useEffect(() => {
    const handleSetToday = () => setTimeRange("today");
    const handleActivityRefresh = () => handleRefresh();
    const handleGiftsUpdated = () => {
      refetchActivityData();
    };

    window.addEventListener('activity-set-today', handleSetToday);
    window.addEventListener('activity-refresh', handleActivityRefresh);
    window.addEventListener('activity-gifts-updated', handleGiftsUpdated);

    return () => {
      window.removeEventListener('activity-set-today', handleSetToday);
      window.removeEventListener('activity-refresh', handleActivityRefresh);
      window.removeEventListener('activity-gifts-updated', handleGiftsUpdated);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if ((activityDataLoading || pointsLedgerLoading) && orders.length === 0 && gifts.length === 0) {
    return <TablePageSkeleton columns={8} rows={6} showTitle={false} />;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="py-3 px-3 sm:px-6">
          <MemberActivityFilters
            searchTerm={searchTerm}
            onSearchChange={(v) => { setSearchTerm(v); setSearchError(""); }}
            searchError={searchError}
            onSearchErrorClear={() => setSearchError("")}
            onSearchPaste={(pasted) => { setSearchTerm(pasted); setSearchError(""); }}
            timeRange={timeRange}
            onTimeRangeChange={setTimeRange}
            customStart={customStart}
            customEnd={customEnd}
            onCustomStartChange={setCustomStart}
            onCustomEndChange={setCustomEnd}
            columns={ACTIVITY_COLUMNS}
            visibleColumns={visibleColumns}
            onToggleColumn={toggleColumn}
            onResetColumns={resetToDefault}
            isMobile={isMobile}
          />
        </CardHeader>
        <CardContent className="px-3 pt-0 pb-4 sm:px-6 sm:pb-6">
          {isMobile ? (
            /* Mobile card list */
            <MobileCardList>
              {paginatedActivityData.length === 0 ? (
                <MobileEmptyState message={searchTerm ? t("未找到匹配的会员数据", "No matching member data") : t("暂无会员数据", "No member data")} />
              ) : paginatedActivityData.map((row) => (
                <MobileCard key={row.member.id} accent="default">
                  <MobileCardHeader>
                    <span className="font-mono text-sm">{displayPhone(row.member.phoneNumber)}</span>
                    <Badge variant="outline" className="font-mono text-xs">{row.member.memberCode}</Badge>
                  </MobileCardHeader>
                  <MobileCardRow label={t("会员名称", "Member name")} value={row.member.memberDisplayName ?? row.member.memberCode} />
                  <MobileCardRow
                    label={t("抽奖次数", "Lottery draws")}
                    value={
                      <button
                        type="button"
                        className="underline decoration-dotted underline-offset-2 text-violet-600 dark:text-violet-400 font-medium"
                        onClick={() => openSpinDetail(row.member.id, row.member.memberCode)}
                      >
                        {row.lotterySpinBalance}
                      </button>
                    }
                  />
                  <MobileCardRow label={t("邀抽累次", "Invite spins")} value={String(row.inviteSpinCredits)} />
                  <MobileCardRow label={t("消费次数", "Consumption count")} value={row.orderCount} />
                  <MobileCardRow label={t("累积次数", "Accumulated count")} value={row.permanentOrderCount} />
                  <MobileCardRow label={t("剩余积分", "Points")} value={<span className={`font-bold ${row.remainingPoints < 0 ? "text-destructive" : "text-primary"}`}>{row.remainingPoints}</span>} highlight />
                  <MobileCardRow label={t("累计利润", "Total profit")} value={(() => {
                    const parts: string[] = [];
                    if (row.accumulatedProfit) parts.push(`CNY${row.accumulatedProfit.toFixed(2)}`);
                    if (row.accumulatedProfitUsdt) parts.push(`U${row.accumulatedProfitUsdt.toFixed(4)}`);
                    return parts.length > 0 ? parts.join(' ') : '0';
                  })()} />
                  <MobileCardCollapsible>
                    <MobileCardRow label={t("兑换奈拉", "Redeem NGN")} value={row.exchangeNgn > 0 ? row.exchangeNgn.toLocaleString("zh-CN", { minimumFractionDigits: 2 }) : "0"} />
                    <MobileCardRow label={t("兑换赛地", "Redeem GHS")} value={row.exchangeGhs > 0 ? row.exchangeGhs.toLocaleString("zh-CN", { minimumFractionDigits: 2 }) : "0"} />
                    <MobileCardRow label={t("兑换US", "Redeem US")} value={row.exchangeUsdt > 0 ? row.exchangeUsdt.toLocaleString("zh-CN", { minimumFractionDigits: 2 }) : "0"} />
                    <MobileCardRow label={t("赠送奈拉", "Gift NGN")} value={row.giftNgn > 0 ? `+${row.giftNgn.toFixed(2)}` : "0"} />
                    <MobileCardRow label={t("赠送赛地", "Gift GHS")} value={row.giftGhs > 0 ? `+${row.giftGhs.toFixed(2)}` : "0"} />
                    <MobileCardRow label={t("赠送US", "Gift USDT")} value={row.giftUsdt > 0 ? `+${row.giftUsdt.toFixed(2)}` : "0"} />
                    <MobileCardRow label={t("推荐人数", "Referrals")} value={row.referralCount > 0 ? (
                      <Button variant="ghost" size="sm" className="h-6 px-1 text-xs" onClick={() => showReferralDialog(row.referralList, row.member.phoneNumber)}>
                        <Users className="h-3 w-3 mr-1" />{row.referralCount}
                      </Button>
                    ) : "0"} />
                    <MobileCardRow label={t("下级次数", "Sub. order count")} value={row.consumptionCount > 0 ? String(row.consumptionCount) : "0"} />
                    <MobileCardRow label={t("消费奖励", "Reward")} value={row.consumptionReward !== 0 ? `${row.consumptionReward} ${t("积分", "pts")}` : "0"} />
                    <MobileCardRow label={t("推广奖励", "Promo reward")} value={row.referralReward.points !== 0 ? `${row.referralReward.points} ${t("积分", "pts")}` : "0"} />
                    <MobileCardRow label={t("抽奖奖励", "Lottery reward")} value={row.lotteryReward !== 0 ? `${row.lotteryReward} ${t("积分", "pts")}` : "0"} />
                    {row.resetTime && <MobileCardRow label={t("重置时间", "Reset")} value={formatBeijingTime(row.resetTime)} />}
                  </MobileCardCollapsible>
                  <MobileCardActions>
                    {row.remainingPoints > 0 && canEditField('amount') && (
                      <Button size="sm" variant="outline" className="flex-1 h-8 text-xs" onClick={() => openRedeemDialog(row)} disabled={!canExchange()}>
                        <Gift className="h-3 w-3 mr-1" />{t("兑换", "Redeem")}
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => handleCopyMemberInfo(row)}>
                      <Copy className="h-3 w-3 mr-1" />{t("复制", "Copy")}
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => { setSelectedMemberForHistory(row.member); setIsPointsHistoryDialogOpen(true); }}>
                      <FileText className="h-3 w-3 mr-1" />{t("详细", "Details")}
                    </Button>
                  </MobileCardActions>
                </MobileCard>
              ))}
              <MobilePagination currentPage={currentPage} totalPages={totalPages || 1} totalItems={filteredActivityData.length} onPageChange={setCurrentPage} pageSize={pageSize} onPageSizeChange={setPageSize} />
            </MobileCardList>
          ) : (
          <>
          <StickyScrollTableContainer minWidth="1260px">
            <Table className="text-sm">
              <TableHeader className="sticky top-0 z-10 bg-muted/80 backdrop-blur-sm">
                <TableRow className="bg-muted/50">
                  {isVisible('phone') && <TableHead className="text-center whitespace-nowrap px-2">{t("电话号码", "Phone")}</TableHead>}
                  {isVisible('memberCode') && <TableHead className="text-center whitespace-nowrap px-2">{t("会员编号", "Member Code")}</TableHead>}
                  {isVisible('memberName') && <SortableTableHead sortKey="member.memberDisplayName" currentSort={activitySortConfig} onSort={requestActivitySort} className="text-center whitespace-nowrap px-2 max-w-[140px]">{t("会员名称", "Member name")}</SortableTableHead>}
                  {isVisible('lotterySpinBalance') && <SortableTableHead sortKey="lotterySpinBalance" currentSort={activitySortConfig} onSort={requestActivitySort} className="text-center whitespace-nowrap px-2">{t("抽奖次数", "Lottery draws")}</SortableTableHead>}
                  {isVisible('inviteSpinCredits') && <SortableTableHead sortKey="inviteSpinCredits" currentSort={activitySortConfig} onSort={requestActivitySort} className="text-center whitespace-nowrap px-2">{t("邀抽累次", "Invite spins")}</SortableTableHead>}
                  {isVisible('orderCount') && <SortableTableHead sortKey="orderCount" currentSort={activitySortConfig} onSort={requestActivitySort} className="text-center whitespace-nowrap px-2">{t("消费次数", "Consumption count")}</SortableTableHead>}
                  {isVisible('permanentOrderCount') && <SortableTableHead sortKey="permanentOrderCount" currentSort={activitySortConfig} onSort={requestActivitySort} className="text-center whitespace-nowrap px-2">{t("累积次数", "Accumulated count")}</SortableTableHead>}
                  {isVisible('accumulatedProfit') && <SortableTableHead sortKey="accumulatedProfit" currentSort={activitySortConfig} onSort={requestActivitySort} className="text-center whitespace-nowrap px-2">{t("累计利润", "Total profit")}</SortableTableHead>}
                  {isVisible('permanentAccumulatedNgn') && <SortableTableHead sortKey="exchangeNgn" currentSort={activitySortConfig} onSort={requestActivitySort} className="text-center whitespace-nowrap px-2">{t("兑换奈拉", "Redeem NGN")}</SortableTableHead>}
                  {isVisible('permanentAccumulatedGhs') && <SortableTableHead sortKey="exchangeGhs" currentSort={activitySortConfig} onSort={requestActivitySort} className="text-center whitespace-nowrap px-2">{t("兑换赛地", "Redeem GHS")}</SortableTableHead>}
                  {isVisible('permanentAccumulatedUsdt') && <SortableTableHead sortKey="exchangeUsdt" currentSort={activitySortConfig} onSort={requestActivitySort} className="text-center whitespace-nowrap px-2">{t("兑换US", "Redeem US")}</SortableTableHead>}
                  {isVisible('giftNgn') && <SortableTableHead sortKey="giftNgn" currentSort={activitySortConfig} onSort={requestActivitySort} className="text-center whitespace-nowrap px-2">{t("赠送奈拉", "Gift NGN")}</SortableTableHead>}
                  {isVisible('giftGhs') && <SortableTableHead sortKey="giftGhs" currentSort={activitySortConfig} onSort={requestActivitySort} className="text-center whitespace-nowrap px-2">{t("赠送赛地", "Gift GHS")}</SortableTableHead>}
                  {isVisible('giftUsdt') && <SortableTableHead sortKey="giftUsdt" currentSort={activitySortConfig} onSort={requestActivitySort} className="text-center whitespace-nowrap px-2">{t("赠送US", "Gift USDT")}</SortableTableHead>}
                  {isVisible('resetTime') && <TableHead className="text-center whitespace-nowrap px-2">{t("重置时间", "Reset Time")}</TableHead>}
                  {isVisible('referralCount') && <SortableTableHead sortKey="referralCount" currentSort={activitySortConfig} onSort={requestActivitySort} className="text-center whitespace-nowrap px-2">{t("推荐人数", "Referrals")}</SortableTableHead>}
                  {isVisible('consumptionCount') && <SortableTableHead sortKey="consumptionCount" currentSort={activitySortConfig} onSort={requestActivitySort} className="text-center whitespace-nowrap px-2">{t("下级次数", "Subordinate")}</SortableTableHead>}
                  {isVisible('consumptionReward') && <SortableTableHead sortKey="consumptionReward" currentSort={activitySortConfig} onSort={requestActivitySort} className="text-center whitespace-nowrap px-2">{t("消费奖励", "Reward")}</SortableTableHead>}
                  {isVisible('referralReward') && <SortableTableHead sortKey="referralReward.points" currentSort={activitySortConfig} onSort={requestActivitySort} className="text-center whitespace-nowrap px-2">{t("推广奖励", "Promo reward")}</SortableTableHead>}
                  {isVisible('lotteryReward') && <SortableTableHead sortKey="lotteryReward" currentSort={activitySortConfig} onSort={requestActivitySort} className="text-center whitespace-nowrap px-2">{t("抽奖奖励", "Lottery reward")}</SortableTableHead>}
                  {isVisible('remainingPoints') && <SortableTableHead sortKey="remainingPoints" currentSort={activitySortConfig} onSort={requestActivitySort} className="text-center whitespace-nowrap px-2">{t("剩余积分", "Points")}</SortableTableHead>}
                  {isVisible('actions') && <TableHead className="text-center whitespace-nowrap px-2 w-[120px] sticky right-0 z-20 bg-muted shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.15)]">{t("操作", "Actions")}</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedActivityData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={visibleColumns.size} className="text-center py-8 text-muted-foreground">
                      {searchTerm ? t("未找到匹配的会员数据", "No matching member data") : t("暂无会员数据", "No member data")}
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedActivityData.map((row) => (
                    <TableRow key={row.member.id}>
                      {isVisible('phone') && <TableCell className="font-mono text-center">{displayPhone(row.member.phoneNumber)}</TableCell>}
                      {isVisible('memberCode') && <TableCell className="text-center">
                        <Badge variant="outline" className="font-mono">
                          {row.member.memberCode}
                        </Badge>
                      </TableCell>}
                      {isVisible('memberName') && <TableCell className="text-center max-w-[160px] truncate" title={row.member.memberDisplayName ?? row.member.memberCode}>
                        {row.member.memberDisplayName ?? row.member.memberCode}
                      </TableCell>}
                      {isVisible('lotterySpinBalance') && <TableCell className="text-center font-medium text-violet-600 dark:text-violet-400 tabular-nums">
                        <button
                          type="button"
                          className="underline decoration-dotted underline-offset-2 hover:text-violet-800 dark:hover:text-violet-300 cursor-pointer"
                          onClick={() => openSpinDetail(row.member.id, row.member.memberCode)}
                        >
                          {row.lotterySpinBalance}
                        </button>
                      </TableCell>}
                      {isVisible('inviteSpinCredits') && <TableCell className="text-center font-medium text-pink-600 dark:text-pink-400 tabular-nums">
                        {row.inviteSpinCredits > 0 ? row.inviteSpinCredits : "0"}
                      </TableCell>}
                      {isVisible('orderCount') && <TableCell className="text-center font-medium text-blue-600 dark:text-blue-400">
                        {row.orderCount > 0 ? row.orderCount : "0"}
                      </TableCell>}
                      {isVisible('permanentOrderCount') && <TableCell className="text-center font-medium text-emerald-600 dark:text-emerald-400 tabular-nums">
                        {row.permanentOrderCount > 0 ? row.permanentOrderCount : "0"}
                      </TableCell>}
                      {isVisible('accumulatedProfit') && <TableCell className="text-center font-medium text-amber-600 dark:text-amber-400">
                        {(() => {
                          const profitRmb = row.accumulatedProfit || 0;
                          const profitUsdt = row.accumulatedProfitUsdt || 0;
                          const parts: string[] = [];
                          if (profitRmb !== 0) {
                            parts.push(`CNY${profitRmb.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
                          }
                          if (profitUsdt !== 0) {
                            parts.push(`U${profitUsdt.toLocaleString("zh-CN", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`);
                          }
                          return parts.length > 0 ? parts.join(' ') : '0';
                        })()}
                      </TableCell>}
                      {isVisible('permanentAccumulatedNgn') && <TableCell className="text-center font-medium">
                        {row.exchangeNgn > 0 ? row.exchangeNgn.toLocaleString("zh-CN", { minimumFractionDigits: 2 }) : "0"}
                      </TableCell>}
                      {isVisible('permanentAccumulatedGhs') && <TableCell className="text-center font-medium">
                        {row.exchangeGhs > 0 ? row.exchangeGhs.toLocaleString("zh-CN", { minimumFractionDigits: 2 }) : "0"}
                      </TableCell>}
                      {isVisible('permanentAccumulatedUsdt') && <TableCell className="text-center font-medium">
                        {row.exchangeUsdt > 0 ? row.exchangeUsdt.toLocaleString("zh-CN", { minimumFractionDigits: 2 }) : "0"}
                      </TableCell>}
                      {isVisible('giftNgn') && <TableCell className="text-center text-green-600 dark:text-green-400">
                        {row.giftNgn > 0 ? `+${row.giftNgn.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}` : "0"}
                      </TableCell>}
                      {isVisible('giftGhs') && <TableCell className="text-center text-green-600 dark:text-green-400">
                        {row.giftGhs > 0 ? `+${row.giftGhs.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}` : "0"}
                      </TableCell>}
                      {isVisible('giftUsdt') && <TableCell className="text-center text-green-600 dark:text-green-400">
                        {row.giftUsdt > 0 ? `+${row.giftUsdt.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}` : "0"}
                      </TableCell>}
                      {isVisible('resetTime') && <TableCell className="text-center text-xs">
                        {row.resetTime ? (
                          <span className="text-muted-foreground">
                            {formatBeijingTime(row.resetTime)}
                          </span>
                        ) : "-"}
                      </TableCell>}
                      {isVisible('referralCount') && <TableCell className="text-center">
                        {row.referralCount > 0 ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2"
                            onClick={() => showReferralDialog(row.referralList, row.member.phoneNumber)}
                          >
                            <Users className="h-3 w-3 mr-1" />
                            {row.referralCount}
                          </Button>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </TableCell>}
                      {isVisible('consumptionCount') && <TableCell className="text-center">
                        {row.consumptionCount > 0 ? row.consumptionCount : "0"}
                      </TableCell>}
                      {isVisible('consumptionReward') && <TableCell className="text-center">
                        {row.consumptionReward !== 0 ? (
                          <Badge variant="outline" className="bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800">
                            {row.consumptionReward} {t("积分", "pts")}
                          </Badge>
                        ) : "0"}
                      </TableCell>}
                      {isVisible('referralReward') && <TableCell className="text-center">
                        {row.referralReward.points !== 0 ? (
                          <Badge variant="outline" className="bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800">
                            {row.referralReward.points} {t("积分", "pts")}
                          </Badge>
                        ) : "0"}
                      </TableCell>}
                      {isVisible('lotteryReward') && <TableCell className="text-center">
                        {row.lotteryReward !== 0 ? (
                          <Badge variant="outline" className="bg-yellow-50 dark:bg-yellow-950/30 text-yellow-800 dark:text-yellow-200 border-yellow-200 dark:border-yellow-800">
                            {row.lotteryReward} {t("积分", "pts")}
                          </Badge>
                        ) : "0"}
                      </TableCell>}
                      {isVisible('remainingPoints') && <TableCell className="text-center px-2 whitespace-nowrap">
                        <span className={`font-bold ${row.remainingPoints < 0 ? "text-destructive" : "text-primary"}`}>{row.remainingPoints}</span>
                      </TableCell>}
                      {isVisible('actions') && <TableCell className="text-center px-2 whitespace-nowrap sticky right-0 bg-background shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.08)]">
                        <div className="flex items-center justify-center gap-1">
                          {row.remainingPoints > 0 && canEditField('amount') && (
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="h-7 px-2 text-xs"
                              onClick={() => openRedeemDialog(row)}
                              disabled={!canExchange()}
                              title={getExchangeDisabledMessage() || undefined}
                            >
                              <Gift className="h-3 w-3 mr-1" />
                              {t("兑换", "Redeem")}
                            </Button>
                          )}
                          {row.remainingPoints > 0 && canEditField('amount') && !canExchange() && (
                            <span className="text-xs text-destructive ml-1" title={getExchangeDisabledMessage() || ''}>
                              ⚠️
                            </span>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() => handleCopyMemberInfo(row)}
                            title={t("复制积分信息", "Copy points info")}
                          >
                            <Copy className="h-3 w-3 mr-1" />
                            {t("复制", "Copy")}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() => {
                              setSelectedMemberForHistory(row.member);
                              setIsPointsHistoryDialogOpen(true);
                            }}
                          >
                            <FileText className="h-3 w-3 mr-1" />
                            {t("详细", "Details")}
                          </Button>
                        </div>
                      </TableCell>}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </StickyScrollTableContainer>
          
          {/* 分页控件 */}
          <div className="flex items-center justify-between mt-4 pt-4 border-t">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>{t("共", "Total")} {filteredActivityData.length} {t("条", "items")}</span>
              <span>|</span>
              <span>{t("每页", "Per page")}</span>
              <Select 
                value={pageSize.toString()} 
                onValueChange={(v) => setPageSize(parseInt(v))}
              >
                <SelectTrigger className="h-8 w-20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {pageSizeOptions.map((size) => (
                    <SelectItem key={size} value={size.toString()}>{size}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
              >
                {t("首页", "First")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                {t("上一页", "Prev")}
              </Button>
              <span className="px-3 text-sm">
                {currentPage} / {totalPages || 1}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
              >
                {t("下一页", "Next")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage >= totalPages}
              >
                {t("末页", "Last")}
              </Button>
            </div>
          </div>
          </>
          )}
        </CardContent>
      </Card>

      <DrawerDetail
        open={isReferralDialogOpen}
        onOpenChange={setIsReferralDialogOpen}
        title={t("被推荐人列表", "Referral List")}
        sheetMaxWidth="3xl"
      >
        <div className="space-y-2">
          {currentReferralList.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">{t("暂无被推荐人", "No referrals")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("被推荐人电话", "Referee Phone")}</TableHead>
                  <TableHead>{t("会员编号", "Member Code")}</TableHead>
                  <TableHead>{t("推荐时间", "Referral Date")}</TableHead>
                  <TableHead className="text-center">{t("操作", "Actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {currentReferralList.map((ref, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="font-mono">{isAdmin ? ref.phone : maskPhone(ref.phone)}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{ref.memberCode}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {ref.referredAt ? formatBeijingDate(ref.referredAt) : "-"}
                    </TableCell>
                    <TableCell className="text-center">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-xs gap-1"
                        onClick={() => {
                          navigator.clipboard.writeText(ref.memberCode);
                          notify.success(t("已复制会员编号", "Member code copied"));
                        }}
                      >
                        {t("复制会员编号", "Copy Code")}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </DrawerDetail>

      <DrawerDetail
        open={isPointsDialogOpen}
        onOpenChange={setIsPointsDialogOpen}
        title={t("修改积分", "Modify Points")}
        sheetMaxWidth="xl"
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>{t("会员编号", "Member Code")}</Label>
            <Input value={editingMemberCode} disabled />
          </div>
          <div className="space-y-2">
            <Label>{t("积分调整值", "Points Adjustment")}</Label>
            <Input
              type="number"
              value={pointsAdjustment}
              onChange={(e) => setPointsAdjustment(e.target.value)}
              placeholder={t("正数增加，负数扣减", "Positive to add, negative to deduct")}
            />
            <p className="text-xs text-muted-foreground">
              {t("输入正数添加积分，输入负数扣减积分", "Enter a positive number to add points, negative to deduct")}
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-border pt-4 mt-4">
          <Button variant="outline" onClick={() => setIsPointsDialogOpen(false)}>
            {t("取消", "Cancel")}
          </Button>
          <Button onClick={handleAdjustPoints}>{t("确认修改", "Confirm")}</Button>
        </div>
      </DrawerDetail>

      <ActivityRedeemDialog
        redeemOpen={isRedeemDialogOpen}
        onRedeemOpenChange={setIsRedeemDialogOpen}
        redeemingRow={redeemingRow}
        redeemPreview={redeemPreview}
        paymentProviders={paymentProviders}
        selectedPaymentProvider={selectedPaymentProvider}
        onSelectedPaymentProviderChange={setSelectedPaymentProvider}
        redeemRemark={redeemRemark}
        onRedeemRemarkChange={setRedeemRemark}
        confirmOpen={isRedeemConfirmOpen}
        onConfirmOpenChange={setIsRedeemConfirmOpen}
        displayPhone={displayPhone}
        onRedeemClick={handleRedeemClick}
        onCompleteRedeem={handleCompleteRedeem}
      />

      <ActivityPointsHistoryDrawer
        open={isPointsHistoryDialogOpen}
        onOpenChange={setIsPointsHistoryDialogOpen}
        member={selectedMemberForHistory}
        entries={
          selectedMemberForHistory
            ? getMemberPointsHistory(selectedMemberForHistory.member_code)
            : []
        }
        orders={orders}
        displayPhone={displayPhone}
      />

      <ActivitySpinDetailDrawer
        open={isSpinDetailOpen}
        onOpenChange={setIsSpinDetailOpen}
        rows={spinDetailRows}
        remaining={spinDetailRemaining}
        loading={spinDetailLoading}
        memberLabel={spinDetailMember?.label ?? ""}
      />
    </div>
  );
}
