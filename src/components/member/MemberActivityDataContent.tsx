import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useIsMobile } from "@/hooks/use-mobile";
import { MobileCardList, MobileCard, MobileCardHeader, MobileCardRow, MobileCardCollapsible, MobileCardActions, MobilePagination } from "@/components/ui/mobile-data-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { 
  Gift, 
  Users,
  FileText,
  Copy,
} from "lucide-react";
import { MemberActivityFilters, type TimeRange } from "./MemberActivityFilters";
import { toast } from "sonner";
import { useColumnVisibility, ColumnConfig } from "@/hooks/useColumnVisibility";
import ColumnVisibilityDropdown from "@/components/ColumnVisibilityDropdown";
import { useLanguage } from "@/contexts/LanguageContext";
import { getFeeSettings, getUsdtFee } from "@/stores/systemSettings";
import { 
  redeemPoints,
  getMemberLastResetTime,
  addPoints,
  deductPoints,
} from "@/stores/pointsAccountStore";
import { getActivitySettings, getRewardAmountByPointsAndCurrency } from "@/stores/activitySettingsStore";
import { getPointsSettings } from "@/stores/pointsSettingsStore";
// getPointsLedger 已废弃，现在直接从数据库读取 points_ledger 表
import { useAuth } from "@/contexts/AuthContext";
import { CurrencyCode } from "@/config/currencies";
import { getExchangeRateFormData } from "@/stores/exchangeRateFormStore";
import { getFinalRates } from "@/stores/exchangeRateStore";
import { getExchangePreview, canExchange, getExchangeDisabledMessage, getActiveActivityType } from "@/services/finance/exchangeService";
import { isDateInRange, DateRange } from "@/lib/dateFilter";
import { supabase } from "@/integrations/supabase/client";
import { useTenantView } from "@/contexts/TenantViewContext";
import { useModulePermissions } from "@/hooks/useFieldPermissions";
import { addGiftAmount, deductAccumulatedProfit } from "@/hooks/useMemberActivity";
import { cleanPhoneNumber, validatePhoneLength } from "@/lib/phoneValidation";
import { trackRender } from "@/lib/performanceUtils";
import { useMembers } from "@/hooks/useMembers";
import { useActivityDataContent } from "@/hooks/useActivityDataContent";
import { TablePageSkeleton } from "@/components/skeletons/TablePageSkeleton";
import { generateEnglishCopyText, refreshCopySettings } from "@/components/CopySettingsTab";
import { getMemberPointsSummary } from "@/services/points/pointsCalculationService";

// 类型定义
interface Member {
  id: string;
  phone_number: string;
  member_code: string;
  currency_preferences?: string[];
  [key: string]: any;
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
  // 永久累积字段
  permanentAccumulatedNgn: number;
  permanentAccumulatedGhs: number;
  permanentAccumulatedUsdt: number;
  permanentGiftNgn: number;
  permanentGiftGhs: number;
  permanentGiftUsdt: number;
  accumulatedProfit: number; // 累积利润（人民币，来自NGN/GHS订单）
  accumulatedProfitUsdt: number; // 累积利润（USDT，来自USDT订单）
  orderCount: number; // 订单累积次数（永久存储，从 member_activity.order_count 读取）
  remainingPoints: number;
  resetTime: string | null;
  referralCount: number;
  referralList: ReferralListItem[];
  referralOrderCount: number;
  referralReward: { points: number };
  consumptionReward: number;
  consumptionCount: number; // 下级次数
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
  if (!phone || phone.length < 8) return phone;
  return `${phone.slice(0, 3)}***${phone.slice(-5)}`;
}

// 注: 活动赠送数据现在完全从 Supabase 数据库加载
// localStorage 版本已弃用

// 计算手续费
function calculateFee(currency: string, amount: number): number {
  const feeSettings = getFeeSettings();
  
  if (currency === "NGN") {
    return amount >= feeSettings.nairaThreshold 
      ? feeSettings.nairaFeeAbove 
      : feeSettings.nairaFeeBelow;
  } else if (currency === "GHS") {
    return amount >= feeSettings.cediThreshold 
      ? feeSettings.cediFeeAbove 
      : feeSettings.cediFeeBelow;
  } else if (currency === "USDT") {
    // USDT手续费从系统设置获取
    return getUsdtFee() || 0;
  }
  return 0;
}

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
  const { t } = useLanguage();
  const { employee } = useAuth();
  const { viewingTenantId } = useTenantView() || {};
  const effectiveTenantId = viewingTenantId || employee?.tenant_id || null;
  const useMyTenantRpc = !!(effectiveTenantId && employee?.tenant_id && effectiveTenantId === employee.tenant_id);
  // 使用 useMembers 与会员管理保持一致（含租户过滤），避免活动数据与会员管理会员数量不一致
  const { members: membersFromHook } = useMembers();
  // react-query 缓存，页面切换秒开
  const {
    orders,
    gifts,
    paymentProviders,
    referrals,
    memberActivities,
    pointsLedgerData,
    pointsAccountsData,
    cachedRates,
    isLoading: activityDataLoading,
    refetch: refetchActivityData,
  } = useActivityDataContent(effectiveTenantId, useMyTenantRpc);
  const [timeRange, setTimeRange] = useState<TimeRange>("today");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [searchError, setSearchError] = useState("");
  
  // 列配置 - 定义所有可隐藏的列
  const ACTIVITY_COLUMNS: ColumnConfig[] = useMemo(() => [
    { key: 'phone', label: t('电话号码', 'Phone') },
    { key: 'memberCode', label: t('会员编号', 'Member Code') },
    { key: 'orderCount', label: t('累积次数', 'Order Count') },
    { key: 'accumulatedProfit', label: t('累积利润', 'Accum. Profit') },
    { key: 'permanentAccumulatedNgn', label: t('累积奈拉', 'Accum. NGN') },
    { key: 'permanentAccumulatedGhs', label: t('累积赛地', 'Accum. GHS') },
    { key: 'permanentAccumulatedUsdt', label: t('累积US', 'Accum. USDT') },
    { key: 'giftNgn', label: t('赠送奈拉', 'Gift NGN') },
    { key: 'giftGhs', label: t('赠送赛地', 'Gift GHS') },
    { key: 'giftUsdt', label: t('赠送US', 'Gift USDT') },
    { key: 'resetTime', label: t('重置时间', 'Reset Time') },
    { key: 'referralCount', label: t('推荐人数', 'Referrals') },
    { key: 'consumptionCount', label: t('下级次数', 'Subordinate Count') },
    { key: 'consumptionReward', label: t('消费奖励', 'Consumption Reward') },
    { key: 'referralReward', label: t('推荐奖励', 'Referral Reward') },
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
  
  // 分页状态 - 默认20条
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const pageSizeOptions = [10, 20, 50, 100];

  const handleRefresh = () => {
    refetchActivityData();
    toast.success("数据已刷新");
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
      const memberAccount = pointsAccountsData.find(a => a.member_code === member.member_code);
      const resetTime = memberAccount?.last_reset_time || null;
      const resetDate = resetTime ? new Date(resetTime) : null;
      
      // 判断数据是否在重置时间之后（如果有重置时间的话）
      // 使用 > 而不是 >= 确保兑换记录不被包含在新周期
      const isAfterReset = (dateStr: string): boolean => {
        if (!resetDate) return true;
        return new Date(dateStr) > resetDate;
      };

      // 1. 累积奈拉 - 使用数据库字段名
      const accumulatedNgn = orders
        .filter(o => 
          (o.member_id === member.id || o.phone_number === member.phone_number) && 
          o.currency === "奈拉" &&
          o.status === "completed" &&
          isAfterReset(o.created_at)
        )
        .reduce((sum, o) => sum + (Number(o.actual_payment) || 0), 0);

      // 2. 累积赛地
      const accumulatedGhs = orders
        .filter(o => 
          (o.member_id === member.id || o.phone_number === member.phone_number) && 
          o.currency === "赛地" &&
          o.status === "completed" &&
          isAfterReset(o.created_at)
        )
        .reduce((sum, o) => sum + (Number(o.actual_payment) || 0), 0);

      // 3. 累积USDT
      const accumulatedUsdt = orders
        .filter(o => 
          (o.member_id === member.id || o.phone_number === member.phone_number) && 
          o.currency === "USDT" &&
          o.status === "completed" &&
          isAfterReset(o.created_at)
        )
        .reduce((sum, o) => sum + (Number(o.actual_payment) || 0), 0);

      // 4-6. 赠送金额统计 - 使用数据库字段名
      const memberGifts = gifts.filter(g => 
        g.phone_number === member.phone_number &&
        isAfterReset(g.created_at)
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

      // 8. 消费次数 = 推荐人数中所有被推荐人电话在订单中出现的次数（非取消状态）
      const referredPhones = memberReferrals.map(r => r.referee_phone);
      const consumptionCount = 
        orders.filter(o => referredPhones.includes(o.phone_number || '') && o.status !== "cancelled" && isAfterReset(o.created_at)).length;

      // 9. 推荐奖励 = 积分明细里面电话号码匹配，类型为推荐的所有积分净值（重置时间之后）
      // ⚠️ 核心规则（与 RPC calculate_member_points 保持一致）：
      // - issued + 正数 = 原始发放的推荐积分
      // - reversed + 负数 = 订单删除后的回收
      // 净积分 = 所有匹配记录的 points_earned 总和（正负自动抵消）
      const referralRewardPoints = pointsLedgerData
        .filter(e => {
          const matchPhone = e.phone_number === member.phone_number;
          const matchType = e.transaction_type === 'referral_1' || e.transaction_type === 'referral_2';
          // ⚠️ 包含 issued 和 reversed，与 RPC 保持一致
          const validStatus = e.status === 'issued' || e.status === 'reversed';
          // 使用 > 而不是 >= 确保兑换记录不被包含在新周期
          const afterReset = resetDate ? new Date(e.created_at) > resetDate : true;
          return matchPhone && matchType && validStatus && afterReset;
        })
        .reduce((sum, e) => sum + (e.points_earned || 0), 0);

      // 10. 消费奖励 = 积分明细里面电话号码匹配，类型为消费的所有积分净值（重置时间之后）
      // ⚠️ 核心规则（与 RPC calculate_member_points 保持一致）：
      // - issued + 正数 = 原始发放的消费积分
      // - reversed + 负数 = 订单删除后的回收
      // 净积分 = 所有匹配记录的 points_earned 总和（正负自动抵消）
      const consumptionReward = pointsLedgerData
        .filter(e => {
          const matchPhone = e.phone_number === member.phone_number;
          const matchType = e.transaction_type === 'consumption';
          // ⚠️ 包含 issued 和 reversed，与 RPC 保持一致
          const validStatus = e.status === 'issued' || e.status === 'reversed';
          // 使用 > 而不是 >= 确保兑换记录不被包含在新周期
          const afterReset = resetDate ? new Date(e.created_at) > resetDate : true;
          return matchPhone && matchType && validStatus && afterReset;
        })
        .reduce((sum, e) => sum + (e.points_earned || 0), 0);

      // 10.5 兑换扣减（负积分）- 只统计 reset 之后的兑换扣减
      // 兑换记录始终是 issued 状态 + 负积分
      const redemptionDeduction = pointsLedgerData
        .filter(e => {
          const matchPhone = e.phone_number === member.phone_number;
          const isRedemption = e.transaction_type === 'redeem_activity_1' || 
                               e.transaction_type === 'redeem_activity_2' || 
                               e.transaction_type === 'redemption';
          const isIssued = e.status === 'issued';
          // 使用 > 而不是 >= 确保兑换记录不被包含在新周期
          const afterReset = resetDate ? new Date(e.created_at) > resetDate : true;
          return matchPhone && isRedemption && isIssued && afterReset && e.points_earned < 0;
        })
        .reduce((sum, e) => sum + (e.points_earned || 0), 0); // 负数

      // 11. 剩余积分 = 消费奖励 + 推荐奖励 + 兑换扣减（负数）
      // 允许负数显示（积分透支的情况）
      const remainingPoints = consumptionReward + referralRewardPoints + redemptionDeduction;

      // 被推荐人交易次数（用于显示）- 使用已有的 referredPhones
      const referralOrderCount = 
        orders.filter(o => referredPhones.includes(o.phone_number || '') && o.status === "completed").length;

      // 创建兼容的 member 对象（转换字段名）
      const compatibleMember = {
        ...member,
        phoneNumber: member.phone_number,
        memberCode: member.member_code,
        preferredCurrency: member.currency_preferences || [],
      };

      // 获取永久累积数据
      const memberActivity = memberActivities.find(a => a.member_id === member.id);
      
      return {
        member: compatibleMember as any,
        accumulatedNgn,
        accumulatedGhs,
        accumulatedUsdt,
        giftNgn,
        giftGhs,
        giftUsdt,
        // 永久累积字段 - 从 member_activity 表读取
        permanentAccumulatedNgn: memberActivity?.total_accumulated_ngn || 0,
        permanentAccumulatedGhs: memberActivity?.total_accumulated_ghs || 0,
        permanentAccumulatedUsdt: memberActivity?.total_accumulated_usdt || 0,
        permanentGiftNgn: memberActivity?.total_gift_ngn || 0,
        permanentGiftGhs: memberActivity?.total_gift_ghs || 0,
        permanentGiftUsdt: memberActivity?.total_gift_usdt || 0,
        accumulatedProfit: memberActivity?.accumulated_profit || 0, // 累积利润（人民币）
        accumulatedProfitUsdt: memberActivity?.accumulated_profit_usdt || 0, // 累积利润（USDT）
        orderCount: memberActivity?.order_count || 0, // 订单累积次数（永久存储）
        remainingPoints,
        resetTime,
        referralCount,
        referralList,
        referralOrderCount,
        referralReward: {
          points: referralRewardPoints,
        },
        consumptionReward,
        consumptionCount,
      };
    });
  }, [members, orders, gifts, referrals, memberActivities, pointsLedgerData, pointsAccountsData, dateRange]);

  // 搜索过滤并按最新订单时间排序（最新的排在最上面）
  const filteredActivityData = useMemo(() => {
    let data = activityData;
    
    // 搜索过滤
    if (searchTerm.trim()) {
      const search = searchTerm.toLowerCase().trim();
      data = data.filter(row => 
        row.member.phoneNumber.toLowerCase().includes(search) ||
        row.member.memberCode.toLowerCase().includes(search)
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

  // 获取会员的积分流水 - 使用从数据库实时读取的数据
  // 需要同时包含：
  // 1. 该会员作为下单人的消费积分/兑换记录（member_code 匹配）
  // 2. 该会员作为推荐人获得的推荐奖励（phone_number 匹配 且 transaction_type 是 referral_*）
  const getMemberPointsHistory = (memberCode: string) => {
    // 先找到该会员的电话号码
    const member = members.find(m => m.member_code === memberCode);
    const phoneNumber = member?.phone_number || '';
    
    return pointsLedgerData
      .filter(e => {
        // 条件1：member_code 直接匹配（消费积分、兑换记录）
        const isDirectMatch = e.member_code === memberCode;
        
        // 条件2：电话号码匹配 且 是推荐奖励类型
        // 推荐奖励记录的 member_code 可能与当前会员不同，但 phone_number 应该匹配
        const isReferralForPhone = phoneNumber && 
          e.phone_number === phoneNumber && 
          (e.transaction_type === 'referral_1' || e.transaction_type === 'referral_2');
        
        return isDirectMatch || isReferralForPhone;
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
        // 使用汇率计算页面自动采集的USDT汇率（如6.91）
        return cachedRates.usdtRate > 0 ? cachedRates.usdtRate : null;
      default:
        return null;
    }
  };

  // 打开确认兑换对话框
  const handleRedeemClick = () => {
    if (!redeemingRow) return;
    
    if (!selectedPaymentProvider) {
      toast.error("请选择代付商家");
      return;
    }

    // 打开确认对话框
    setIsRedeemConfirmOpen(true);
  };

  // 完整兑换逻辑（事务化：使用后端RPC确保所有操作原子性）
  const handleCompleteRedeem = async () => {
    if (!redeemingRow) return;

    const member = redeemingRow.member;
    
    // ===== 步骤1: 重新校验剩余积分（从活动数据统一来源）=====
    const remainingPoints = redeemingRow.remainingPoints;
    
    // 校验失败立即返回，不执行后续写库逻辑
    if (remainingPoints <= 0) {
      toast.error("剩余积分不足，兑换失败");
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
      showSubmissionError("当前汇率未配置，请先在汇率计算页面设置汇率");
      setIsRedeemConfirmOpen(false);
      return;
    }
    
    // ===== 步骤4: 计算手续费和赠送价值 =====
    const fee = calculateFee(preferredCurrency, rewardAmount);
    const giftValue = calculateGiftValue(preferredCurrency, rewardAmount, currentRate, fee);

    // ===== 步骤5: 调用事务性 RPC，确保所有操作原子性 =====
    try {
      const memberId = members.find(m => m.member_code === member.memberCode)?.id || null;
      const currentEmployeeId = employee?.id || null;
      
      // 调用后端事务性 RPC
      const { data: rpcResult, error: rpcError } = await supabase.rpc('redeem_points_and_record', {
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
        p_creator_name: employee?.real_name || null
      });

      if (rpcError) {
        console.error("RPC调用失败:", rpcError);
        const { showSubmissionError } = await import('@/services/submissionErrorService');
        showSubmissionError(`兑换失败: ${rpcError.message}`);
        setIsRedeemConfirmOpen(false);
        return;
      }

      // 检查 RPC 返回结果
      const result = rpcResult as { success: boolean; error?: string; points_redeemed?: number };
      
      if (!result.success) {
        let errorMessage = "兑换失败";
        switch (result.error) {
          case 'NO_POINTS':
            errorMessage = "该会员没有可兑换的积分";
            break;
          case 'POINTS_MISMATCH':
            errorMessage = "积分数据已变化，请刷新后重试";
            break;
          default:
            errorMessage = `兑换失败: ${result.error || '未知错误'}`;
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
          memberId: memberId,
          memberCode: member.memberCode,
          phoneNumber: member.phoneNumber,
          points: remainingPoints,
          createdAt: new Date().toISOString(),
        }).catch(err => console.error('[MemberActivityData] Webhook trigger failed:', err));
      });
      
      const activityLabel = activityType === 'activity_1' ? '活动1（阶梯制）' : '活动2（固定比例）';
      toast.success(`兑换成功！[${activityLabel}] 已兑换 ${remainingPoints} 积分，获得 ${rewardAmount} ${preferredCurrency}，积分已清零`);
      setIsRedeemConfirmOpen(false);
      setIsRedeemDialogOpen(false);
      loadData();
    } catch (error) {
      console.error("兑换过程发生错误:", error);
      const { showSubmissionError } = await import('@/services/submissionErrorService');
      showSubmissionError("兑换过程发生错误，请重试");
      setIsRedeemConfirmOpen(false);
    }
  };

  // 计算兑换预览信息（使用统一兑换服务）
  // 格式化汇率显示（NGN: 2位, GHS: 2位, USDT: 4位）
  const formatRateDisplay = (rate: number | null, currency: CurrencyCode): string => {
    if (rate === null || rate <= 0) return "未配置";
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
        currentRateDisplay: "未配置",
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
        message: "当前汇率未配置，请先在汇率计算页面设置汇率",
        currency: exchangePreview.exchangeCurrency,
        rewardAmount: 0,
        currentRate: 0,
        currentRateDisplay: "未配置",
        fee: 0,
        giftValue: 0,
        activityType: exchangePreview.activityType,
      };
    }
    
    const fee = calculateFee(exchangePreview.exchangeCurrency, exchangePreview.exchangeAmount);
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
      toast.error("请输入有效的积分数值");
      return;
    }
    
    const member = members.find(m => m.member_code === editingMemberCode);
    if (!member) {
      toast.error("会员不存在");
      return;
    }
    
    if (adjustment > 0) {
      addPoints(editingMemberCode, member.phone_number, adjustment);
      toast.success(`已添加 ${adjustment} 积分`);
    } else {
      deductPoints(editingMemberCode, Math.abs(adjustment));
      toast.success(`已扣减 ${Math.abs(adjustment)} 积分`);
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
    loadData();
  };

  // 导出数据
  const handleExport = () => {
    const csvContent = [
      ["电话号码", "会员编号", "累积次数", "累积利润", "累积奈拉", "累积赛地", "累积US", "赠送奈拉", "赠送赛地", "赠送US", "重置时间", "推荐人数", "下级次数", "消费奖励", "推荐奖励", "剩余积分"].join(","),
      ...activityData.map(row => [
        row.member.phoneNumber,
        row.member.memberCode,
        row.orderCount,
        row.accumulatedProfit.toFixed(2),
        row.permanentAccumulatedNgn.toFixed(2),
        row.permanentAccumulatedGhs.toFixed(2),
        row.permanentAccumulatedUsdt.toFixed(2),
        row.giftNgn.toFixed(2),
        row.giftGhs.toFixed(2),
        row.giftUsdt.toFixed(2),
        row.resetTime ? new Date(row.resetTime).toLocaleString("zh-CN") : "-",
        row.referralCount,
        row.consumptionCount,
        row.consumptionReward,
        row.referralReward.points,
        row.remainingPoints,
      ].join(","))
    ].join("\n");

    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `活动数据_${new Date().toLocaleDateString("zh-CN")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("数据已导出");
  };

  // 监听导出事件
  useEffect(() => {
    const handleExportEvent = () => handleExport();
    window.addEventListener('activity-export', handleExportEvent);
    return () => window.removeEventListener('activity-export', handleExportEvent);
  }, [activityData]);

  const showReferralDialog = (list: ReferralListItem[], memberPhone: string) => {
    setCurrentReferralList(list);
    setCurrentReferralMemberPhone(memberPhone);
    setIsReferralDialogOpen(true);
  };

  // 跳转到订单管理并自动搜索
  const navigateToOrderWithSearch = (memberCode: string, currency?: string) => {
    const isUsdt = currency === 'USDT';
    sessionStorage.setItem("orderSearchMemberCode", memberCode);
    sessionStorage.setItem("orderSearchTab", isUsdt ? "usdt" : "normal");
    navigate("/staff/orders");
    setIsReferralDialogOpen(false);
  };

  // 复制会员积分信息（与汇率计算提交后自动复制的内容一致）
  const handleCopyMemberInfo = async (row: MemberActivityRow) => {
    try {
      const settings = await refreshCopySettings();
      if (!settings.enabled) {
        toast.info(t("自动复制功能已关闭", "Auto copy is disabled"));
        return;
      }

      const activitySettings = getActivitySettings();
      let activityType: 'activity1' | 'activity2' | 'none' = 'none';
      if (activitySettings.activity1Enabled) {
        activityType = 'activity1';
      } else if (activitySettings.activity2?.enabled) {
        activityType = 'activity2';
      }

      if (activityType === 'none') {
        toast.info(t("当前没有活动开启", "No activity is currently enabled"));
        return;
      }

      // 从数据库获取最新积分数据
      const summary = await getMemberPointsSummary(row.member.memberCode, row.member.phoneNumber);
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
        toast.success(t("已复制会员积分信息到剪贴板", "Member points info copied to clipboard"));
      }
    } catch (error) {
      console.error('Copy member info failed:', error);
      toast.error(t("复制失败，请重试", "Copy failed, please retry"));
    }
  };

  // 获取当前用户角色
  const { isAdmin } = useAuth();

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
      // 从数据库重新加载活动赠送数据
      loadData();
    };

    window.addEventListener('activity-set-today', handleSetToday);
    window.addEventListener('activity-refresh', handleActivityRefresh);
    window.addEventListener('activity-gifts-updated', handleGiftsUpdated);

    return () => {
      window.removeEventListener('activity-set-today', handleSetToday);
      window.removeEventListener('activity-refresh', handleActivityRefresh);
      window.removeEventListener('activity-gifts-updated', handleGiftsUpdated);
    };
  }, []);

  if (activityDataLoading) {
    return <TablePageSkeleton columns={8} rows={6} showTitle={false} />;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="py-3">
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
        <CardContent className="pt-0">
          {isMobile ? (
            /* Mobile card list */
            <MobileCardList>
              {paginatedActivityData.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground text-sm">
                  {searchTerm ? t("未找到匹配的会员数据", "No matching member data") : t("暂无会员数据", "No member data")}
                </p>
              ) : paginatedActivityData.map((row) => (
                <MobileCard key={row.member.id}>
                  <MobileCardHeader>
                    <span className="font-mono text-sm">{displayPhone(row.member.phoneNumber)}</span>
                    <Badge variant="outline" className="font-mono text-xs">{row.member.memberCode}</Badge>
                  </MobileCardHeader>
                  <MobileCardRow label={t("累积次数", "Orders")} value={row.orderCount} />
                  <MobileCardRow label={t("剩余积分", "Points")} value={<span className="font-bold text-primary">{row.remainingPoints}</span>} highlight />
                  <MobileCardRow label={t("累积利润", "Profit")} value={(() => {
                    const parts: string[] = [];
                    if (row.accumulatedProfit) parts.push(`CNY${row.accumulatedProfit.toFixed(2)}`);
                    if (row.accumulatedProfitUsdt) parts.push(`U${row.accumulatedProfitUsdt.toFixed(4)}`);
                    return parts.length > 0 ? parts.join(' ') : '0';
                  })()} />
                  <MobileCardCollapsible>
                    <MobileCardRow label={t("累积奈拉", "NGN")} value={row.permanentAccumulatedNgn > 0 ? row.permanentAccumulatedNgn.toLocaleString("zh-CN", { minimumFractionDigits: 2 }) : "0"} />
                    <MobileCardRow label={t("累积赛地", "GHS")} value={row.permanentAccumulatedGhs > 0 ? row.permanentAccumulatedGhs.toLocaleString("zh-CN", { minimumFractionDigits: 2 }) : "0"} />
                    <MobileCardRow label={t("累积USDT", "USDT")} value={row.permanentAccumulatedUsdt > 0 ? row.permanentAccumulatedUsdt.toLocaleString("zh-CN", { minimumFractionDigits: 2 }) : "0"} />
                    <MobileCardRow label={t("赠送奈拉", "Gift NGN")} value={row.giftNgn > 0 ? `+${row.giftNgn.toFixed(2)}` : "0"} />
                    <MobileCardRow label={t("赠送赛地", "Gift GHS")} value={row.giftGhs > 0 ? `+${row.giftGhs.toFixed(2)}` : "0"} />
                    <MobileCardRow label={t("赠送USDT", "Gift USDT")} value={row.giftUsdt > 0 ? `+${row.giftUsdt.toFixed(2)}` : "0"} />
                    <MobileCardRow label={t("推荐人数", "Referrals")} value={row.referralCount > 0 ? (
                      <Button variant="ghost" size="sm" className="h-6 px-1 text-xs" onClick={() => showReferralDialog(row.referralList, row.member.phoneNumber)}>
                        <Users className="h-3 w-3 mr-1" />{row.referralCount}
                      </Button>
                    ) : "0"} />
                    <MobileCardRow label={t("消费奖励", "Reward")} value={row.consumptionReward > 0 ? `${row.consumptionReward} ${t("积分", "pts")}` : "0"} />
                    <MobileCardRow label={t("推荐奖励", "Ref. Reward")} value={row.referralReward.points > 0 ? `${row.referralReward.points} ${t("积分", "pts")}` : "0"} />
                    {row.resetTime && <MobileCardRow label={t("重置时间", "Reset")} value={new Date(row.resetTime).toLocaleString("zh-CN", { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })} />}
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
          <StickyScrollTableContainer minWidth="1200px">
            <Table className="text-sm">
              <TableHeader className="sticky top-0 z-10 bg-muted/80 backdrop-blur-sm">
                <TableRow className="bg-muted/50">
                  {isVisible('phone') && <TableHead className="text-center whitespace-nowrap px-2">{t("电话号码", "Phone")}</TableHead>}
                  {isVisible('memberCode') && <TableHead className="text-center whitespace-nowrap px-2">{t("会员编号", "Member Code")}</TableHead>}
                  {isVisible('orderCount') && <SortableTableHead sortKey="orderCount" currentSort={activitySortConfig} onSort={requestActivitySort} className="text-center whitespace-nowrap px-2">{t("累积次数", "Order Count")}</SortableTableHead>}
                  {isVisible('accumulatedProfit') && <SortableTableHead sortKey="accumulatedProfit" currentSort={activitySortConfig} onSort={requestActivitySort} className="text-center whitespace-nowrap px-2">{t("累积利润", "Profit")}</SortableTableHead>}
                  {isVisible('permanentAccumulatedNgn') && <SortableTableHead sortKey="permanentAccumulatedNgn" currentSort={activitySortConfig} onSort={requestActivitySort} className="text-center whitespace-nowrap px-2">{t("累积奈拉", "Accum. NGN")}</SortableTableHead>}
                  {isVisible('permanentAccumulatedGhs') && <SortableTableHead sortKey="permanentAccumulatedGhs" currentSort={activitySortConfig} onSort={requestActivitySort} className="text-center whitespace-nowrap px-2">{t("累积赛地", "Accum. GHS")}</SortableTableHead>}
                  {isVisible('permanentAccumulatedUsdt') && <SortableTableHead sortKey="permanentAccumulatedUsdt" currentSort={activitySortConfig} onSort={requestActivitySort} className="text-center whitespace-nowrap px-2">{t("累积US", "Accum. USDT")}</SortableTableHead>}
                  {isVisible('giftNgn') && <SortableTableHead sortKey="giftNgn" currentSort={activitySortConfig} onSort={requestActivitySort} className="text-center whitespace-nowrap px-2">{t("赠送奈拉", "Gift NGN")}</SortableTableHead>}
                  {isVisible('giftGhs') && <SortableTableHead sortKey="giftGhs" currentSort={activitySortConfig} onSort={requestActivitySort} className="text-center whitespace-nowrap px-2">{t("赠送赛地", "Gift GHS")}</SortableTableHead>}
                  {isVisible('giftUsdt') && <SortableTableHead sortKey="giftUsdt" currentSort={activitySortConfig} onSort={requestActivitySort} className="text-center whitespace-nowrap px-2">{t("赠送US", "Gift USDT")}</SortableTableHead>}
                  {isVisible('resetTime') && <TableHead className="text-center whitespace-nowrap px-2">{t("重置时间", "Reset Time")}</TableHead>}
                  {isVisible('referralCount') && <SortableTableHead sortKey="referralCount" currentSort={activitySortConfig} onSort={requestActivitySort} className="text-center whitespace-nowrap px-2">{t("推荐人数", "Referrals")}</SortableTableHead>}
                  {isVisible('consumptionCount') && <SortableTableHead sortKey="consumptionCount" currentSort={activitySortConfig} onSort={requestActivitySort} className="text-center whitespace-nowrap px-2">{t("下级次数", "Subordinate")}</SortableTableHead>}
                  {isVisible('consumptionReward') && <SortableTableHead sortKey="consumptionReward" currentSort={activitySortConfig} onSort={requestActivitySort} className="text-center whitespace-nowrap px-2">{t("消费奖励", "Reward")}</SortableTableHead>}
                  {isVisible('referralReward') && <TableHead className="text-center whitespace-nowrap px-2">{t("推荐奖励", "Ref. Reward")}</TableHead>}
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
                      {isVisible('orderCount') && <TableCell className="text-center font-medium text-blue-600 dark:text-blue-400">
                        {row.orderCount > 0 ? row.orderCount : "0"}
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
                        {row.permanentAccumulatedNgn > 0 ? row.permanentAccumulatedNgn.toLocaleString("zh-CN", { minimumFractionDigits: 2 }) : "0"}
                      </TableCell>}
                      {isVisible('permanentAccumulatedGhs') && <TableCell className="text-center font-medium">
                        {row.permanentAccumulatedGhs > 0 ? row.permanentAccumulatedGhs.toLocaleString("zh-CN", { minimumFractionDigits: 2 }) : "0"}
                      </TableCell>}
                      {isVisible('permanentAccumulatedUsdt') && <TableCell className="text-center font-medium">
                        {row.permanentAccumulatedUsdt > 0 ? row.permanentAccumulatedUsdt.toLocaleString("zh-CN", { minimumFractionDigits: 2 }) : "0"}
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
                            {new Date(row.resetTime).toLocaleString("zh-CN", {
                              year: "numeric",
                              month: "2-digit",
                              day: "2-digit",
                              hour: "2-digit",
                              minute: "2-digit",
                              second: "2-digit",
                            })}
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
                        {row.consumptionReward > 0 ? (
                          <Badge variant="outline" className="bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800">
                            {row.consumptionReward} {t("积分", "pts")}
                          </Badge>
                        ) : "0"}
                      </TableCell>}
                      {isVisible('referralReward') && <TableCell className="text-center">
                        {row.referralReward.points > 0 ? (
                          <Badge variant="outline" className="bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800">
                            {row.referralReward.points} {t("积分", "pts")}
                          </Badge>
                        ) : "0"}
                      </TableCell>}
                      {isVisible('remainingPoints') && <TableCell className="text-center px-2 whitespace-nowrap">
                        <span className="font-bold text-primary">{row.remainingPoints}</span>
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

      {/* 推荐人列表对话框 */}
      <Dialog open={isReferralDialogOpen} onOpenChange={setIsReferralDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("被推荐人列表", "Referral List")}</DialogTitle>
          </DialogHeader>
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
                        {ref.referredAt ? new Date(ref.referredAt).toLocaleDateString("zh-CN") : "-"}
                      </TableCell>
                      <TableCell className="text-center">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-xs gap-1"
                          onClick={() => {
                            navigator.clipboard.writeText(ref.memberCode);
                            toast.success(t("已复制会员编号", "Member code copied"));
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
        </DialogContent>
      </Dialog>

      {/* 积分修改对话框 */}
      <Dialog open={isPointsDialogOpen} onOpenChange={setIsPointsDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>修改积分</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>会员编号</Label>
              <Input value={editingMemberCode} disabled />
            </div>
            <div className="space-y-2">
              <Label>积分调整值</Label>
              <Input 
                type="number"
                value={pointsAdjustment}
                onChange={(e) => setPointsAdjustment(e.target.value)}
                placeholder="正数增加，负数扣减"
              />
              <p className="text-xs text-muted-foreground">
                输入正数添加积分，输入负数扣减积分
              </p>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setIsPointsDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={handleAdjustPoints}>确认修改</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 兑换对话框 - 优化响应式布局 */}
      <Dialog open={isRedeemDialogOpen} onOpenChange={setIsRedeemDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader className="sticky top-0 bg-background z-10 pb-2">
            <DialogTitle>积分兑换</DialogTitle>
          </DialogHeader>
          {redeemingRow && redeemPreview && (
            <div className="space-y-3 py-2">
              {/* 活动类型提示 */}
              {redeemPreview.activityType && (
                <div className={`p-2 rounded-lg text-sm flex items-center gap-2 ${
                  redeemPreview.activityType === 'activity_1' 
                    ? 'bg-blue-50 text-blue-700 border border-blue-200' 
                    : 'bg-purple-50 text-purple-700 border border-purple-200'
                }`}>
                  <Gift className="h-4 w-4 flex-shrink-0" />
                  <span className="font-medium text-xs sm:text-sm">
                    {redeemPreview.activityType === 'activity_1' ? '活动1：阶梯制兑换' : '活动2：固定积分兑换'}
                  </span>
                </div>
              )}
              
              {/* 不可兑换提示 */}
              {!redeemPreview.canExchange && (
                <div className="p-2 rounded-lg text-xs sm:text-sm bg-destructive/10 text-destructive border border-destructive/20">
                  ⚠️ {redeemPreview.message}
                </div>
              )}
              
              {/* 兑换信息预览 - 紧凑布局 */}
              <div className="p-3 bg-muted/50 rounded-lg space-y-2 text-xs sm:text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">会员编号</span>
                  <span className="font-medium">{redeemingRow.member.memberCode}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">电话号码</span>
                  <span className="font-mono">{displayPhone(redeemingRow.member.phoneNumber)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">当前剩余积分</span>
                  <span className="font-bold text-primary">{redeemingRow.remainingPoints}</span>
                </div>
                {redeemPreview.canExchange && redeemPreview.currency && (
                  <div className="border-t pt-2 mt-2 space-y-1.5">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">判定币种</span>
                      <Badge variant="outline" className="text-xs">{redeemPreview.currency}</Badge>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">当前汇率</span>
                      <span>{redeemPreview.currentRateDisplay}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">可兑换金额</span>
                      <span className="font-bold text-green-600">
                        {typeof redeemPreview.rewardAmount === 'number' 
                          ? redeemPreview.rewardAmount.toFixed(2) 
                          : redeemPreview.rewardAmount} {redeemPreview.currency}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">手续费</span>
                      <span>{redeemPreview.fee}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">赠送价值</span>
                      <span>{redeemPreview.giftValue.toFixed(2)}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* 代付商家选择 - 紧凑版 */}
              <div className="space-y-1.5">
                <Label className="text-xs sm:text-sm">代付商家 <span className="text-destructive">*</span></Label>
                <Select value={selectedPaymentProvider} onValueChange={setSelectedPaymentProvider}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="请选择代付商家" />
                  </SelectTrigger>
                  <SelectContent>
                    {paymentProviders.map(provider => (
                      <SelectItem key={provider.id} value={provider.name}>
                        {provider.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {paymentProviders.length === 0 && (
                  <p className="text-xs text-destructive">暂无可用的代付商家</p>
                )}
              </div>

              {/* 备注 - 紧凑版 */}
              <div className="space-y-1.5">
                <Label className="text-xs sm:text-sm">备注（选填）</Label>
                <Textarea
                  value={redeemRemark}
                  onChange={(e) => setRedeemRemark(e.target.value)}
                  placeholder="请输入备注信息"
                  rows={2}
                  className="text-xs sm:text-sm"
                />
              </div>

              {/* 提示信息 - 紧凑版 */}
              <div className="text-xs text-muted-foreground bg-amber-50 dark:bg-amber-950/20 p-2 rounded">
                ⚠️ 兑换后积分将清零，重置时间更新为当前时间。
              </div>
            </div>
          )}
          <DialogFooter className="sticky bottom-0 bg-background pt-2 gap-2 flex-row">
            <Button variant="outline" onClick={() => setIsRedeemDialogOpen(false)} className="flex-1 sm:flex-none">
              取消
            </Button>
            <Button 
              onClick={handleRedeemClick}
              disabled={!selectedPaymentProvider || paymentProviders.length === 0 || !redeemPreview?.canExchange}
              className="flex-1 sm:flex-none"
            >
              确认兑换
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 兑换确认对话框 */}
      <AlertDialog open={isRedeemConfirmOpen} onOpenChange={setIsRedeemConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认兑换</AlertDialogTitle>
            <AlertDialogDescription>
              确认为会员 {redeemingRow?.member.memberCode} 进行积分兑换吗？
              <br />
              <br />
              兑换后该会员的积分将清零，重置时间将更新为当前时间，之后的积分将从新周期开始累积。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleCompleteRedeem}>
              确认
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 积分流水详情对话框 */}
      <Dialog open={isPointsHistoryDialogOpen} onOpenChange={setIsPointsHistoryDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              积分流水详情 - {selectedMemberForHistory?.memberCode}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {selectedMemberForHistory && (
              <>
                <div className="text-sm text-muted-foreground">
                  电话号码：{displayPhone(selectedMemberForHistory.phoneNumber)}
                </div>
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="text-center">时间</TableHead>
                        <TableHead className="text-center">订单ID</TableHead>
                        <TableHead className="text-center">类型</TableHead>
                        <TableHead className="text-center">获得积分</TableHead>
                        <TableHead className="text-center">变动前积分</TableHead>
                        <TableHead className="text-center">变动后积分</TableHead>
                        <TableHead className="text-center">币种</TableHead>
                        <TableHead className="text-center">状态</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {getMemberPointsHistory(selectedMemberForHistory.memberCode).length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                            暂无积分流水记录
                          </TableCell>
                        </TableRow>
                      ) : (
                        (() => {
                          const history = getMemberPointsHistory(selectedMemberForHistory.memberCode);
                          // 按时间正序计算累计积分（从最早开始）
                          const sortedAsc = [...history].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
                          let runningTotal = 0;
                          const entriesWithRunning = sortedAsc.map(entry => {
                            const pointsBefore = runningTotal;
                            const pointsAfter = runningTotal + (entry.points_earned || 0);
                            runningTotal = pointsAfter;
                            return { ...entry, pointsBefore, pointsAfter };
                          });
                          // 显示时按时间倒序
                          const displayEntries = [...entriesWithRunning].reverse();
                          return displayEntries.map((entry) => {
                            // 获取类型标签 - 从积分明细的 transaction_type 获取
                            // 需求2：兑换类型统一显示"积分兑换"
                            const isRedemptionType = entry.transaction_type === 'redeem_activity_1' || 
                              entry.transaction_type === 'redeem_activity_2' || 
                              entry.transaction_type === 'redemption';
                            const typeLabel = entry.transaction_type === 'consumption' ? '消费奖励' :
                              entry.transaction_type === 'referral_1' ? '推荐奖励1' :
                              entry.transaction_type === 'referral_2' ? '推荐奖励2' :
                              isRedemptionType ? '积分兑换' : (entry.transaction_type || '未知');
                            
                            // 判断是否为兑换类型
                            const isRedemption = entry.transaction_type === 'redeem_activity_1' || 
                              entry.transaction_type === 'redeem_activity_2' || 
                              entry.transaction_type === 'redemption';
                            
                            // 获取关联的订单号（兑换类型显示"无"，其他类型显示订单号）
                            const orderDisplayId = isRedemption ? '无' : (entry.order_id ? 
                              (orders.find(o => o.id === entry.order_id)?.order_number || entry.order_id.substring(0, 8)) : '-');
                            
                            // 币种显示（兑换类型显示"无"）
                            const currencyDisplay = isRedemption ? '无' : (entry.currency || '-');
                            
                            return (
                              <TableRow key={entry.id}>
                                <TableCell className="text-center text-xs">
                                  {new Date(entry.created_at).toLocaleString("zh-CN")}
                                </TableCell>
                                <TableCell className="text-center font-mono text-xs">
                                  {orderDisplayId}
                                </TableCell>
                                <TableCell className="text-center">
                                  <Badge variant="outline">{typeLabel}</Badge>
                                </TableCell>
                                <TableCell className={`text-center font-medium ${(entry.points_earned || 0) > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                  {(entry.points_earned || 0) > 0 ? `+${entry.points_earned}` : entry.points_earned}
                                </TableCell>
                                <TableCell className="text-center text-muted-foreground">
                                  {entry.pointsBefore}
                                </TableCell>
                                <TableCell className="text-center font-bold text-primary">
                                  {entry.pointsAfter}
                                </TableCell>
                                <TableCell className="text-center">
                                  {currencyDisplay}
                                </TableCell>
                                <TableCell className="text-center">
                                  {/* 需求2：兑换类型显示"已兑换"，其他类型按正负积分显示 */}
                                  <Badge 
                                    variant="outline" 
                                    className={isRedemptionType ? 'bg-orange-50 text-orange-700' : 
                                      (entry.points_earned > 0 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700')}
                                  >
                                    {isRedemptionType ? '已兑换' : (entry.points_earned > 0 ? '已发放' : '已回收')}
                                  </Badge>
                                </TableCell>
                              </TableRow>
                            );
                          });
                        })()
                      )}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPointsHistoryDialogOpen(false)}>
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
