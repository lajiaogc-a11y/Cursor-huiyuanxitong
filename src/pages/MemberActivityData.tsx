import { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from "react-router-dom";
import { safeNumber, safeToFixed } from "@/lib/safeCalc";
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
import { StickyScrollTableContainer } from "@/components/ui/sticky-scroll-table";
import { TablePagination } from "@/components/ui/table-pagination";
import { SortableTableHead, useSortableData } from "@/components/ui/sortable-table-head";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { 
  Activity, 
  RefreshCw, 
  Download, 
  Gift, 
  Users,
  ExternalLink,
  Pencil,
  Trash2,
} from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { MobileCardList, MobileCard, MobileCardHeader, MobileCardRow, MobileCardCollapsible, MobileCardActions, MobilePagination } from "@/components/ui/mobile-data-card";
import { toast } from "sonner";
import { getFeeSettings } from "@/stores/systemSettings";
import { useMembers, type Member } from "@/hooks/useMembers";
import { getOrders, getUsdtOrders, Order, UsdtOrder } from "@/stores/orderStore";
import { 
  getMemberCurrentPoints, 
  redeemPoints,
  getMemberLastResetTime,
  addPoints,
  deductPoints,
} from "@/stores/pointsAccountStore";
import { getActivitySettings, getRewardAmountByPointsAndCurrency } from "@/stores/activitySettingsStore";
import { getPointsSettings } from "@/stores/pointsSettingsStore";
import { getReferralsByReferrer, ReferralRelation } from "@/stores/referralStore";
import { getPointsLedger, refreshPointsLedgerCache } from "@/stores/pointsLedgerStore";
import { getActivePaymentProviders, PaymentProvider } from "@/stores/merchantConfigStore";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { CurrencyCode } from "@/config/currencies";
import { isDateInRange, DateRange } from "@/lib/dateFilter";
import { supabase } from "@/integrations/supabase/client";

type TimeRange = "all" | "today" | "yesterday" | "thisMonth" | "lastMonth" | "custom";

// 活动赠送数据结构 - 对应数据库字段
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
  creator_id: string | null;
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
  remainingPoints: number;
  resetTime: string | null;
  referralCount: number;
  referralList: ReferralListItem[];
  referralOrderCount: number;
  referralReward: { points: number };
  consumptionReward: number;
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

// 从Supabase加载活动赠送数据
async function loadActivityGiftsFromDB(): Promise<ActivityGift[]> {
  try {
    const { data, error } = await supabase
      .from('activity_gifts')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Failed to load activity gifts:', error);
    return [];
  }
}

// 保存活动赠送数据到Supabase
async function saveActivityGiftToDB(gift: {
  phone_number: string;
  currency: string;
  amount: number;
  rate: number;
  fee: number;
  gift_value: number;
  payment_agent: string;
  gift_type: string;
  remark: string;
  creator_id: string | null;
}): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('activity_gifts')
      .insert(gift);
    
    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Failed to save activity gift:', error);
    return false;
  }
}

// 更新活动赠送记录
async function updateActivityGiftInDB(id: string, updates: Partial<ActivityGift>): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('activity_gifts')
      .update(updates)
      .eq('id', id);
    
    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Failed to update activity gift:', error);
    return false;
  }
}

// 删除活动赠送记录
async function deleteActivityGiftFromDB(id: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('activity_gifts')
      .delete()
      .eq('id', id);
    
    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Failed to delete activity gift:', error);
    return false;
  }
}

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

export default function MemberActivityData() {
  const navigate = useNavigate();
  const { employee, isAdmin } = useAuth();
  const isMobile = useIsMobile();
  const { t } = useLanguage();
  // 使用 useMembers hook 获取会员数据
  const { members, refetch: refetchMembers } = useMembers();
  
  const queryClient = useQueryClient();

  const { data: activityPageData } = useQuery({
    queryKey: ['member-activity-page-data'],
    queryFn: async () => {
      await refreshPointsLedgerCache();
      const giftsData = await loadActivityGiftsFromDB();
      return {
        orders: getOrders(),
        usdtOrders: getUsdtOrders(),
        gifts: giftsData,
        providers: getActivePaymentProviders(),
        pointsLedger: [...getPointsLedger()],
      };
    },
  });

  const orders = activityPageData?.orders ?? [];
  const usdtOrders = activityPageData?.usdtOrders ?? [];
  const gifts = activityPageData?.gifts ?? [];
  const pointsLedgerData = activityPageData?.pointsLedger ?? [];

  const [timeRange, setTimeRange] = useState<TimeRange>("today");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  
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
  const paymentProviders = activityPageData?.providers ?? [];

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(isMobile ? 10 : 20);

  // Realtime subscription -> invalidate react-query cache
  useEffect(() => {
    const channel = supabase
      .channel('activity-gifts-page-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'activity_gifts' }, () => {
        queryClient.invalidateQueries({ queryKey: ['member-activity-page-data'] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['member-activity-page-data'] });
    refetchMembers();
    toast.success(t("数据已刷新", "Data refreshed"));
  };

  // 根据时间范围过滤数据（使用统一的系统级日期筛选规则）
  const dateRange = useMemo(
    () => getLocalTimeRangeDates(timeRange, customStart, customEnd),
    [timeRange, customStart, customEnd]
  );

  const isInTimeRange = (dateStr: string): boolean => {
    return isDateInRange(dateStr, dateRange);
  };

  // 计算每个会员的活动数据
  const activityData: MemberActivityRow[] = useMemo(() => {
    const activitySettings = getActivitySettings();
    const pointsSettings = getPointsSettings();
    // 使用状态中的积分流水数据，确保刷新时能触发重新计算
    const pointsLedger = pointsLedgerData.length > 0 ? pointsLedgerData : getPointsLedger();
    
    return members.map(member => {
      // 1. 累积兑奈拉 - 赛地/奈拉模式，需求币种=NGN，已完成订单
      const accumulatedNgn = orders
        .filter(o => 
          o.phoneNumber === member.phoneNumber && 
          o.demandCurrency === "NGN" &&
          o.status === "completed" &&
          isInTimeRange(o.createdAt)
        )
        .reduce((sum, o) => sum + (o.actualPaid || 0), 0);

      // 2. 累积兑赛地 - 赛地/奈拉模式，需求币种=GHS，已完成订单
      const accumulatedGhs = orders
        .filter(o => 
          o.phoneNumber === member.phoneNumber && 
          o.demandCurrency === "GHS" &&
          o.status === "completed" &&
          isInTimeRange(o.createdAt)
        )
        .reduce((sum, o) => sum + (o.actualPaid || 0), 0);

      // 3. 累积兑USDT - USDT模式，已完成订单
      const accumulatedUsdt = usdtOrders
        .filter(o => 
          o.phoneNumber === member.phoneNumber &&
          o.status === "completed" &&
          isInTimeRange(o.createdAt)
        )
        .reduce((sum, o) => sum + (o.actualPaidUsdt || 0), 0);

      // 4-6. 赠送金额统计 - 来源于活动赠送记录（使用数据库字段名）
      const memberGifts = gifts.filter(g => 
        g.phone_number === member.phoneNumber &&
        isInTimeRange(g.created_at)
      );
      
      const giftNgn = memberGifts
        .filter(g => g.currency === "NGN")
        .reduce((sum, g) => sum + (g.amount || 0), 0);
      
      const giftGhs = memberGifts
        .filter(g => g.currency === "GHS")
        .reduce((sum, g) => sum + (g.amount || 0), 0);
      
      const giftUsdt = memberGifts
        .filter(g => g.currency === "USDT")
        .reduce((sum, g) => sum + (g.amount || 0), 0);

      // 7. 消费奖励 = 积分明细中电话号码匹配且类型为consumption，status=issued的正积分
      // 只统计发放的正积分，回收记录不影响（回收的是 reset 前的积分）
      const consumptionReward = pointsLedger
        .filter(e => e.phone === member.phoneNumber && e.transaction_type === 'consumption' && e.status === 'VALID')
        .reduce((sum, e) => sum + (e.points_earned > 0 ? e.points_earned : 0), 0);

      // 8. 推荐奖励 = 积分明细中电话号码匹配且类型为referral_1或referral_2，status=issued的正积分
      // 只统计发放的正积分，回收记录不影响
      const referralRewardPoints = pointsLedger
        .filter(e => e.phone === member.phoneNumber && 
          (e.transaction_type === 'referral_1' || e.transaction_type === 'referral_2') && e.status === 'VALID')
        .reduce((sum, e) => sum + (e.points_earned > 0 ? e.points_earned : 0), 0);

      // 9. 剩余积分 = 消费奖励 + 推荐奖励
      const remainingPoints = consumptionReward + referralRewardPoints;

      // 10. 推荐人数 - 从推荐关系存储读取
      const referrals: ReferralRelation[] = getReferralsByReferrer(member.phoneNumber);
      const referralCount = referrals.length;
      
      // 获取被推荐人的订单币种信息用于跳转
      const referralList: ReferralListItem[] = referrals.map(r => {
        // 查找该被推荐人的最新订单来确定币种
        const memberOrders = orders.filter(o => o.phoneNumber === r.refereePhone && o.status === "completed");
        const memberUsdtOrders = usdtOrders.filter(o => o.phoneNumber === r.refereePhone && o.status === "completed");
        let currency: string | undefined;
        if (memberUsdtOrders.length > 0) {
          currency = 'USDT';
        } else if (memberOrders.length > 0) {
          currency = memberOrders[0].demandCurrency || 'NGN';
        }
        return {
          phone: r.refereePhone,
          memberCode: r.refereeMemberCode,
          referredAt: r.createdAt,
          currency,
        };
      });

      // 11. 推荐人交易次数 - 被推荐人的所有已完成订单数
      const referredPhones = referrals.map(r => r.refereePhone);
      const referralOrderCount = 
        orders.filter(o => referredPhones.includes(o.phoneNumber) && o.status === "completed").length +
        usdtOrders.filter(o => referredPhones.includes(o.phoneNumber) && o.status === "completed").length;

      const resetTime = getMemberLastResetTime(member.memberCode);

      return {
        member,
        accumulatedNgn,
        accumulatedGhs,
        accumulatedUsdt,
        giftNgn,
        giftGhs,
        giftUsdt,
        remainingPoints,
        resetTime,
        referralCount,
        referralList,
        referralOrderCount,
        referralReward: {
          points: referralRewardPoints,
        },
        consumptionReward,
      };
    });
  }, [members, orders, usdtOrders, gifts, dateRange, pointsLedgerData]);

  // 排序功能
  const { sortedData: sortedActivityData, sortConfig, requestSort } = useSortableData(activityData);

  // Pagination
  const totalPages = Math.ceil(sortedActivityData.length / pageSize);
  const paginatedActivityData = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedActivityData.slice(start, start + pageSize);
  }, [sortedActivityData, currentPage, pageSize]);

  // Reset page on data change
  useEffect(() => {
    setCurrentPage(1);
  }, [timeRange, customStart, customEnd]);

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

  // 获取当前汇率
  const getCurrentExchangeRate = (currency: CurrencyCode): number => {
    const pointsSettings = getPointsSettings();
    switch (currency) {
      case "NGN":
        return pointsSettings.ngnToUsdRate || 1580;
      case "GHS":
        return pointsSettings.ghsToUsdRate || 15.5;
      case "USDT":
        return 1; // USDT = USD
      default:
        return 1;
    }
  };

  // 完整兑换逻辑
  const handleCompleteRedeem = async () => {
    if (!redeemingRow) return;
    
    if (!selectedPaymentProvider) {
      toast.error("请选择代付商家");
      return;
    }

    const member = redeemingRow.member;
    const remainingPoints = redeemingRow.remainingPoints;
    
    if (remainingPoints <= 0) {
      toast.error("剩余积分不足");
      return;
    }

    // 1. 判定会员需求币种
    const preferredCurrency = getMemberPreferredCurrency(member);
    
    // 2. 根据积分区间获取兑换金额
    const rewardAmount = getRewardAmountByPointsAndCurrency(remainingPoints, preferredCurrency);
    
    if (rewardAmount <= 0) {
      toast.error("当前积分不在任何兑换区间内");
      return;
    }

    // 3. 获取当前汇率
    const currentRate = getCurrentExchangeRate(preferredCurrency);
    
    // 4. 计算手续费
    const fee = calculateFee(preferredCurrency, rewardAmount);
    
    // 5. 计算赠送价值
    const giftValue = calculateGiftValue(preferredCurrency, rewardAmount, currentRate, fee);

    // 6. 生成活动赠送记录
    const giftData = {
      phone_number: member.phoneNumber,
      currency: preferredCurrency,
      amount: rewardAmount,
      rate: currentRate,
      fee: fee,
      gift_value: giftValue,
      payment_agent: selectedPaymentProvider,
      gift_type: "积分兑换",
      remark: redeemRemark,
      creator_id: employee?.id || null,  // 使用 creator_id 代替 creator_name
    };

    // 保存活动赠送记录到数据库
    const saveSuccess = await saveActivityGiftToDB(giftData);
    if (!saveSuccess) {
      toast.error("保存活动赠送记录失败");
      return;
    }

    // 7. 兑换积分（清零并更新重置时间）
    // 传入手机号以便账户不存在时自动创建
    // 传入本次可用积分，避免出现“页面显示有积分但兑换提示积分不足”
    const result = await redeemPoints(member.memberCode, member.phoneNumber, remainingPoints);
    
    if (result.success) {
      toast.success(`兑换成功！已兑换 ${result.redeemedPoints} 积分，获得 ${rewardAmount} ${preferredCurrency}`);
      setIsRedeemDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ['member-activity-page-data'] });
    } else {
      toast.error(result.message || "兑换失败");
    }
  };

  // 计算兑换预览信息
  const getRedeemPreview = () => {
    if (!redeemingRow) return null;
    
    const member = redeemingRow.member;
    const remainingPoints = redeemingRow.remainingPoints;
    const preferredCurrency = getMemberPreferredCurrency(member);
    const rewardAmount = getRewardAmountByPointsAndCurrency(remainingPoints, preferredCurrency);
    const currentRate = getCurrentExchangeRate(preferredCurrency);
    const fee = calculateFee(preferredCurrency, rewardAmount);
    const giftValue = calculateGiftValue(preferredCurrency, rewardAmount, currentRate, fee);
    
    return {
      currency: preferredCurrency,
      rewardAmount,
      currentRate,
      fee,
      giftValue,
    };
  };

  // 修改积分
  const handleAdjustPoints = () => {
    const adjustment = parseInt(pointsAdjustment);
    if (isNaN(adjustment) || adjustment === 0) {
      toast.error("请输入有效的积分数值");
      return;
    }
    
    const member = members.find(m => m.memberCode === editingMemberCode);
    if (!member) {
      toast.error("会员不存在");
      return;
    }
    
    if (adjustment > 0) {
      addPoints(editingMemberCode, member.phoneNumber, adjustment);
      toast.success(`已添加 ${adjustment} 积分`);
    } else {
      deductPoints(editingMemberCode, Math.abs(adjustment));
      toast.success(`已扣减 ${Math.abs(adjustment)} 积分`);
    }
    
    setIsPointsDialogOpen(false);
    queryClient.invalidateQueries({ queryKey: ['member-activity-page-data'] });
  };

  // 导出数据
  const handleExport = () => {
    const csvContent = [
      ["电话号码", "会员编号", "累积兑奈拉", "累积兑赛地", "累积兑USDT", "赠送奈拉", "赠送赛地", "赠送USDT", "剩余积分", "消费奖励", "推荐人数", "推荐人交易次数", "推荐奖励"].join(","),
      ...activityData.map(row => [
        row.member.phoneNumber,
        row.member.memberCode,
        safeToFixed(row.accumulatedNgn, 2),
        safeToFixed(row.accumulatedGhs, 2),
        safeToFixed(row.accumulatedUsdt, 2),
        safeToFixed(row.giftNgn, 2),
        safeToFixed(row.giftGhs, 2),
        safeToFixed(row.giftUsdt, 2),
        safeNumber(row.remainingPoints),
        safeNumber(row.consumptionReward),
        safeNumber(row.referralCount),
        safeNumber(row.referralOrderCount),
        `${safeNumber(row.referralReward.points)} 积分`,
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

  // 显示推荐人详情对话框
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
    navigate("/order-management");
    setIsReferralDialogOpen(false);
  };

  // 根据角色决定是否脱敏显示电话号码
  // 根据角色决定是否脱敏显示电话号码
  const displayPhone = (phone: string) => {
    if (isAdmin) {
      return phone; // 管理员不脱敏
    }
    return maskPhone(phone); // 主管和员工脱敏
  };

  const redeemPreview = getRedeemPreview();

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="py-3">
          {isMobile ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Activity className="h-4 w-4" />
                  {t("活动数据", "Activity Data")}
                </CardTitle>
                <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={handleRefresh}>
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <Select value={timeRange} onValueChange={(v) => setTimeRange(v as TimeRange)}>
                  <SelectTrigger className="flex-1 h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("全部", "All")}</SelectItem>
                    <SelectItem value="today">{t("今日", "Today")}</SelectItem>
                    <SelectItem value="yesterday">{t("昨日", "Yesterday")}</SelectItem>
                    <SelectItem value="thisMonth">{t("本月", "This Month")}</SelectItem>
                    <SelectItem value="lastMonth">{t("上月", "Last Month")}</SelectItem>
                    <SelectItem value="custom">{t("自定义", "Custom")}</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" size="sm" onClick={handleExport} className="shrink-0 h-8">
                  <Download className="h-4 w-4 mr-1" />
                  {t("导出", "Export")}
                </Button>
              </div>
              {timeRange === "custom" && (
                <div className="flex flex-col gap-2">
                  <Input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="h-8 text-xs" />
                  <Input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="h-8 text-xs" />
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  活动数据
                </CardTitle>
                <span className="text-xs text-muted-foreground">
                  📊 只读统计视图，按会员维度汇总订单兑换、活动赠送、积分及推荐数据
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleExport}>
                  <Download className="h-4 w-4 mr-1" />
                  导出
                </Button>
                <Select value={timeRange} onValueChange={(v) => setTimeRange(v as TimeRange)}>
                  <SelectTrigger className="w-24 h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部</SelectItem>
                    <SelectItem value="today">今日</SelectItem>
                    <SelectItem value="yesterday">昨日</SelectItem>
                    <SelectItem value="thisMonth">本月</SelectItem>
                    <SelectItem value="lastMonth">上月</SelectItem>
                    <SelectItem value="custom">自定义</SelectItem>
                  </SelectContent>
                </Select>
                {timeRange === "custom" && (
                  <>
                    <Input type="datetime-local" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="w-40 h-8" />
                    <span className="text-muted-foreground text-xs">至</span>
                    <Input type="datetime-local" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="w-40 h-8" />
                  </>
                )}
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={handleRefresh}>
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardHeader>
        <CardContent className="pt-0">
          {isMobile ? (
            <MobileCardList>
              {paginatedActivityData.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground text-sm">暂无会员数据</p>
              ) : paginatedActivityData.map((row) => (
                <MobileCard key={row.member.id}>
                  <MobileCardHeader>
                    <span className="font-mono text-sm">{displayPhone(row.member.phoneNumber)}</span>
                    <Badge variant="outline" className="font-mono text-xs">{row.member.memberCode}</Badge>
                  </MobileCardHeader>
                  <MobileCardRow label="剩余积分" value={<span className="font-bold text-primary">{row.remainingPoints}</span>} highlight />
                  {row.accumulatedNgn > 0 && <MobileCardRow label="累积兑奈拉" value={row.accumulatedNgn.toLocaleString("zh-CN", { minimumFractionDigits: 2 })} />}
                  {row.accumulatedGhs > 0 && <MobileCardRow label="累积兑赛地" value={row.accumulatedGhs.toLocaleString("zh-CN", { minimumFractionDigits: 2 })} />}
                  {row.accumulatedUsdt > 0 && <MobileCardRow label="累积兑USDT" value={row.accumulatedUsdt.toLocaleString("zh-CN", { minimumFractionDigits: 2 })} />}
                  <MobileCardCollapsible>
                    {row.giftNgn > 0 && <MobileCardRow label="赠送奈拉" value={`+${row.giftNgn.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}`} />}
                    {row.giftGhs > 0 && <MobileCardRow label="赠送赛地" value={`+${row.giftGhs.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}`} />}
                    {row.giftUsdt > 0 && <MobileCardRow label="赠送USDT" value={`+${row.giftUsdt.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}`} />}
                    <MobileCardRow label="消费奖励" value={row.consumptionReward > 0 ? `${row.consumptionReward} 积分` : "-"} />
                    <MobileCardRow label="推荐人数" value={row.referralCount > 0 ? row.referralCount : "0"} />
                    <MobileCardRow label="推荐交易次数" value={row.referralOrderCount > 0 ? row.referralOrderCount : "-"} />
                    <MobileCardRow label="推荐奖励" value={row.referralReward.points > 0 ? `${row.referralReward.points} 积分` : "-"} />
                    {row.resetTime && <MobileCardRow label="重置时间" value={new Date(row.resetTime).toLocaleString("zh-CN")} />}
                  </MobileCardCollapsible>
                  <MobileCardActions>
                    <Button size="sm" variant="outline" className="flex-1 h-8" onClick={() => { setEditingMemberCode(row.member.memberCode); setPointsAdjustment(""); setIsPointsDialogOpen(true); }}>
                      <Pencil className="h-3 w-3 mr-1" />修改
                    </Button>
                    {row.remainingPoints > 0 && (
                      <Button size="sm" variant="outline" className="flex-1 h-8" onClick={() => openRedeemDialog(row)}>
                        <Gift className="h-3 w-3 mr-1" />兑换
                      </Button>
                    )}
                  </MobileCardActions>
                </MobileCard>
              ))}
              <MobilePagination currentPage={currentPage} totalPages={totalPages || 1} totalItems={sortedActivityData.length} onPageChange={setCurrentPage} pageSize={pageSize} onPageSizeChange={(s) => { setPageSize(s); setCurrentPage(1); }} />
            </MobileCardList>
          ) : (
          <>
          <StickyScrollTableContainer>
            <Table className="text-sm">
              <TableHeader className="sticky top-0 z-10 bg-muted/80 backdrop-blur-sm">
                <TableRow className="bg-muted/50">
                  <TableHead className="text-center">电话号码</TableHead>
                  <TableHead className="text-center">会员编号</TableHead>
                  <SortableTableHead sortKey="accumulatedNgn" currentSort={sortConfig} onSort={requestSort} className="text-center">累积兑奈拉</SortableTableHead>
                  <SortableTableHead sortKey="accumulatedGhs" currentSort={sortConfig} onSort={requestSort} className="text-center">累积兑赛地</SortableTableHead>
                  <SortableTableHead sortKey="accumulatedUsdt" currentSort={sortConfig} onSort={requestSort} className="text-center">累积兑USDT</SortableTableHead>
                  <SortableTableHead sortKey="giftNgn" currentSort={sortConfig} onSort={requestSort} className="text-center">赠送奈拉</SortableTableHead>
                  <SortableTableHead sortKey="giftGhs" currentSort={sortConfig} onSort={requestSort} className="text-center">赠送赛地</SortableTableHead>
                  <SortableTableHead sortKey="giftUsdt" currentSort={sortConfig} onSort={requestSort} className="text-center">赠送USDT</SortableTableHead>
                  <SortableTableHead sortKey="resetTime" currentSort={sortConfig} onSort={requestSort} className="text-center">重置时间</SortableTableHead>
                  <SortableTableHead sortKey="consumptionReward" currentSort={sortConfig} onSort={requestSort} className="text-center">消费奖励</SortableTableHead>
                  <SortableTableHead sortKey="referralCount" currentSort={sortConfig} onSort={requestSort} className="text-center">推荐人数</SortableTableHead>
                  <SortableTableHead sortKey="referralOrderCount" currentSort={sortConfig} onSort={requestSort} className="text-center">推荐人交易次数</SortableTableHead>
                  <SortableTableHead sortKey="referralReward.points" currentSort={sortConfig} onSort={requestSort} className="text-center">推荐奖励</SortableTableHead>
                  <SortableTableHead sortKey="remainingPoints" currentSort={sortConfig} onSort={requestSort} className="text-center">剩余积分</SortableTableHead>
                  <TableHead className="text-center">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedActivityData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={15} className="text-center py-8 text-muted-foreground">
                      暂无会员数据
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedActivityData.map((row) => (
                    <TableRow key={row.member.id}>
                      <TableCell className="font-mono text-center">{displayPhone(row.member.phoneNumber)}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className="font-mono">
                          {row.member.memberCode}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center font-medium">
                        {row.accumulatedNgn > 0 ? row.accumulatedNgn.toLocaleString("zh-CN", { minimumFractionDigits: 2 }) : "-"}
                      </TableCell>
                      <TableCell className="text-center font-medium">
                        {row.accumulatedGhs > 0 ? row.accumulatedGhs.toLocaleString("zh-CN", { minimumFractionDigits: 2 }) : "-"}
                      </TableCell>
                      <TableCell className="text-center font-medium">
                        {row.accumulatedUsdt > 0 ? row.accumulatedUsdt.toLocaleString("zh-CN", { minimumFractionDigits: 2 }) : "-"}
                      </TableCell>
                      <TableCell className="text-center text-green-600">
                        {row.giftNgn > 0 ? `+${row.giftNgn.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}` : "-"}
                      </TableCell>
                      <TableCell className="text-center text-green-600">
                        {row.giftGhs > 0 ? `+${row.giftGhs.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}` : "-"}
                      </TableCell>
                      <TableCell className="text-center text-green-600">
                        {row.giftUsdt > 0 ? `+${row.giftUsdt.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}` : "-"}
                      </TableCell>
                      <TableCell className="text-center text-xs">
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
                      </TableCell>
                      <TableCell className="text-center">
                        {row.consumptionReward > 0 ? (
                          <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                            {row.consumptionReward} 积分
                          </Badge>
                        ) : "-"}
                      </TableCell>
                      <TableCell className="text-center">
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
                      </TableCell>
                      <TableCell className="text-center">
                        {row.referralOrderCount > 0 ? row.referralOrderCount : "-"}
                      </TableCell>
                      <TableCell className="text-center">
                        {row.referralReward.points > 0 ? (
                          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                            {row.referralReward.points} 积分
                          </Badge>
                        ) : "-"}
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="font-bold text-primary">{row.remainingPoints}</span>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() => {
                              setEditingMemberCode(row.member.memberCode);
                              setPointsAdjustment("");
                              setIsPointsDialogOpen(true);
                            }}
                          >
                            <Pencil className="h-3 w-3 mr-1" />
                            修改
                          </Button>
                          {row.remainingPoints > 0 && (
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="h-7 px-2 text-xs"
                              onClick={() => openRedeemDialog(row)}
                            >
                              <Gift className="h-3 w-3 mr-1" />
                              兑换
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </StickyScrollTableContainer>
          <TablePagination currentPage={currentPage} totalPages={totalPages} totalItems={sortedActivityData.length} onPageChange={setCurrentPage} pageSize={pageSize} onPageSizeChange={(s) => { setPageSize(s); setCurrentPage(1); }} />
          </>
          )}
        </CardContent>
      </Card>

      {/* 推荐人列表对话框 */}
      <Dialog open={isReferralDialogOpen} onOpenChange={setIsReferralDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>被推荐人列表</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {currentReferralList.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">暂无被推荐人</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>被推荐人电话</TableHead>
                    <TableHead>会员编号</TableHead>
                    <TableHead>推荐时间</TableHead>
                    <TableHead className="text-center">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {currentReferralList.map((ref, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-mono">{maskPhone(ref.phone)}</TableCell>
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
                          onClick={() => navigateToOrderWithSearch(ref.memberCode, ref.currency)}
                        >
                          <ExternalLink className="h-3 w-3" />
                          交易详情
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

      {/* 兑换对话框 */}
      <Dialog open={isRedeemDialogOpen} onOpenChange={setIsRedeemDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>积分兑换</DialogTitle>
          </DialogHeader>
          {redeemingRow && redeemPreview && (
            <div className="space-y-4 py-4">
              {/* 兑换信息预览 */}
              <div className="p-4 bg-muted/50 rounded-lg space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">会员编号</span>
                  <span className="font-medium">{redeemingRow.member.memberCode}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">电话号码</span>
                  <span className="font-mono">{displayPhone(redeemingRow.member.phoneNumber)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">当前剩余积分</span>
                  <span className="font-bold text-primary">{redeemingRow.remainingPoints}</span>
                </div>
                <div className="border-t pt-3 mt-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">判定币种</span>
                    <Badge variant="outline">{redeemPreview.currency}</Badge>
                  </div>
                  <div className="flex justify-between text-sm mt-2">
                    <span className="text-muted-foreground">当前汇率</span>
                    <span>{redeemPreview.currentRate}</span>
                  </div>
                  <div className="flex justify-between text-sm mt-2">
                    <span className="text-muted-foreground">可兑换金额</span>
                    <span className="font-bold text-green-600">
                      {redeemPreview.rewardAmount} {redeemPreview.currency}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm mt-2">
                    <span className="text-muted-foreground">手续费</span>
                    <span>{redeemPreview.fee}</span>
                  </div>
                  <div className="flex justify-between text-sm mt-2">
                    <span className="text-muted-foreground">赠送价值</span>
                    <span>{redeemPreview.giftValue.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* 代付商家选择 */}
              <div className="space-y-2">
                <Label>代付商家 <span className="text-destructive">*</span></Label>
                <Select value={selectedPaymentProvider} onValueChange={setSelectedPaymentProvider}>
                  <SelectTrigger>
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
                  <p className="text-xs text-destructive">暂无可用的代付商家，请先在商家管理中添加</p>
                )}
              </div>

              {/* 备注 */}
              <div className="space-y-2">
                <Label>备注（选填）</Label>
                <Textarea
                  value={redeemRemark}
                  onChange={(e) => setRedeemRemark(e.target.value)}
                  placeholder="请输入备注信息"
                  rows={2}
                />
              </div>

              {/* 提示信息 */}
              <div className="text-xs text-muted-foreground bg-amber-50 dark:bg-amber-950/20 p-3 rounded">
                ⚠️ 兑换后积分将清零，重置时间更新为当前时间，之后的积分从新周期开始累积。
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRedeemDialogOpen(false)}>
              取消
            </Button>
            <Button 
              onClick={handleCompleteRedeem}
              disabled={!selectedPaymentProvider || paymentProviders.length === 0}
            >
              确认兑换
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
