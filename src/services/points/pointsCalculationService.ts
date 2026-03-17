// ============= 积分计算共享服务 =============
// 提供统一的积分计算逻辑，供汇率计算器和活动数据页面共用
// ⚠️ 核心规则：
// - 原始发放：status='issued' + points_earned > 0
// - 订单删除回收：status='reversed' + points_earned < 0
// - 净积分 = 所有匹配记录的 points_earned 总和（正负自动抵消）

import { supabase } from '@/integrations/supabase/client';

export interface MemberPointsSummary {
  remainingPoints: number;
  consumptionReward: number;
  referralRewardPoints: number;
  lastResetTime: string | null;
  // 从 member_activity 获取的累积数据
  orderCount: number;
  totalAccumulatedNgn: number;
  totalAccumulatedGhs: number;
  totalAccumulatedUsdt: number;
}

/**
 * 从数据库实时计算会员积分摘要
 * ⚠️ 核心规则：
 * 1. 必须包含 issued 和 reversed 两种状态
 *    - issued + 正数 = 原始发放的积分
 *    - reversed + 负数 = 订单删除后回收的积分
 * 2. 净积分 = 所有匹配记录的 points_earned 总和
 * 3. 如果有 last_reset_time，只统计该时间之后的记录
 * 
 * @param memberCode 会员编号
 * @param phoneNumber 电话号码
 * @returns 积分摘要（剩余积分、消费奖励、推荐奖励）
 */
export async function getMemberPointsSummary(
  memberCode: string,
  phoneNumber: string
): Promise<MemberPointsSummary> {
  try {
    // 1. 获取 last_reset_time 和累积数据
    // ⚠️ 关键：只使用 points_accounts 的 last_reset_time，与 RPC calculate_member_points 保持一致
    // 并行获取 member_activity
    const activityRes = await supabase
      .from('member_activity')
      .select('order_count, total_accumulated_ngn, total_accumulated_ghs, total_accumulated_usdt')
      .eq('phone_number', phoneNumber)
      .maybeSingle();

    // 获取 last_reset_time：先按 member_code 查，找不到则按 phone 回退
    let accountsRes = await supabase
      .from('points_accounts')
      .select('last_reset_time')
      .eq('member_code', memberCode)
      .maybeSingle();

    if (!accountsRes.data && phoneNumber) {
      accountsRes = await supabase
        .from('points_accounts')
        .select('last_reset_time')
        .eq('phone', phoneNumber)
        .maybeSingle();
    }

    // 从 member_activity 获取累积数据
    const memberActivity = activityRes.data;
    const orderCount = memberActivity?.order_count || 0;
    const totalAccumulatedNgn = memberActivity?.total_accumulated_ngn || 0;
    const totalAccumulatedGhs = memberActivity?.total_accumulated_ghs || 0;
    const totalAccumulatedUsdt = memberActivity?.total_accumulated_usdt || 0;

    // ⚠️ 只使用 points_accounts 的重置时间，确保与 RPC 计算一致
    const lastResetTime = accountsRes.data?.last_reset_time || null;
    const resetDate = lastResetTime ? new Date(lastResetTime) : null;

    // 2. 获取积分明细 - 同时按 member_code 和 phone_number 查询
    // ⚠️ 推荐积分可能只关联 phone_number 而非 member_code
    const { data: pointsData, error } = await supabase
      .from('points_ledger')
      .select('*')
      .or(`member_code.eq.${memberCode},phone_number.eq.${phoneNumber}`)
      .in('status', ['issued', 'reversed']); // ⚠️ 包含两种状态

    if (error) {
      console.error('Failed to fetch points ledger:', error);
      return {
        remainingPoints: 0,
        consumptionReward: 0,
        referralRewardPoints: 0,
        lastResetTime,
        orderCount,
        totalAccumulatedNgn,
        totalAccumulatedGhs,
        totalAccumulatedUsdt,
      };
    }

    // 使用 > 而不是 >= 确保兑换记录不被包含在新周期
    const isAfterReset = (dateStr: string): boolean => {
      if (!resetDate) return true;
      return new Date(dateStr) > resetDate; // 使用 > 而不是 >=
    };

    // 消费奖励 - 按 member_code 或 phone_number 匹配，统计 reset 之后的消费积分
    // ⚠️ 修复：用户输入的 memberCode 可能与数据库实际 member_code 不同（如用户输入电话号码作为会员编号）
    // 因此需要同时匹配 member_code 和 phone_number，避免遗漏
    const consumptionReward = (pointsData || [])
      .filter(e => {
        const matchCodeOrPhone = e.member_code === memberCode || e.phone_number === phoneNumber;
        const matchType = e.transaction_type === 'consumption';
        const afterReset = isAfterReset(e.created_at);
        return matchCodeOrPhone && matchType && afterReset;
      })
      .reduce((sum, e) => sum + (e.points_earned || 0), 0);

    // 推荐奖励 - 按 member_code 或 phone_number 匹配
    // 因为推荐积分可能只关联到 phone_number
    const referralRewardPoints = (pointsData || [])
      .filter(e => {
        const matchCodeOrPhone = e.member_code === memberCode || e.phone_number === phoneNumber;
        const matchType = e.transaction_type === 'referral_1' || e.transaction_type === 'referral_2';
        const afterReset = isAfterReset(e.created_at);
        return matchCodeOrPhone && matchType && afterReset;
      })
      .reduce((sum, e) => sum + (e.points_earned || 0), 0);

    // 兑换扣减（负积分）- 只统计 reset 之后的兑换
    // 兑换记录始终是 issued 状态 + 负积分
    const redemptionDeduction = (pointsData || [])
      .filter(e => {
        const matchCodeOrPhone = e.member_code === memberCode || e.phone_number === phoneNumber;
        const isRedemption = e.transaction_type === 'redeem_activity_1' || 
                             e.transaction_type === 'redeem_activity_2' || 
                             e.transaction_type === 'redemption';
        const isIssued = e.status === 'issued';
        const afterReset = isAfterReset(e.created_at);
        return matchCodeOrPhone && isRedemption && isIssued && afterReset && e.points_earned < 0;
      })
      .reduce((sum, e) => sum + (e.points_earned || 0), 0); // 负数

    // 剩余积分 = 消费奖励 + 推荐奖励 + 兑换扣减（负数）
    // 允许负数显示（积分透支的情况，如兑换后订单被删除）
    const remainingPoints = consumptionReward + referralRewardPoints + redemptionDeduction;

    return {
      remainingPoints,
      consumptionReward,
      referralRewardPoints,
      lastResetTime,
      orderCount,
      totalAccumulatedNgn,
      totalAccumulatedGhs,
      totalAccumulatedUsdt,
    };
  } catch (error) {
    console.error('Failed to calculate member points summary:', error);
    return {
      remainingPoints: 0,
      consumptionReward: 0,
      referralRewardPoints: 0,
      lastResetTime: null,
      orderCount: 0,
      totalAccumulatedNgn: 0,
      totalAccumulatedGhs: 0,
      totalAccumulatedUsdt: 0,
    };
  }
}

/**
 * 同步版本：从已加载的积分明细数据计算会员积分
 * 用于已经有积分数据缓存的场景
 * 核心规则与异步版本一致
 */
export function calculateMemberPointsFromData(
  memberCode: string,
  pointsLedgerData: any[],
  lastResetTime: string | null
): MemberPointsSummary {
  const resetDate = lastResetTime ? new Date(lastResetTime) : null;

  // 使用 > 而不是 >= 确保兑换记录不被包含在新周期
  const isAfterReset = (dateStr: string): boolean => {
    if (!resetDate) return true;
    return new Date(dateStr) > resetDate; // 使用 > 而不是 >=
  };

  // ⚠️ 包含 issued 和 reversed 两种状态，净积分自动计算
  const validData = pointsLedgerData.filter(e => e.status === 'issued' || e.status === 'reversed');

  // 消费奖励（issued + reversed 净值）
  const consumptionReward = validData
    .filter(e => {
      const matchCode = e.member_code === memberCode;
      const matchType = e.transaction_type === 'consumption';
      const afterReset = isAfterReset(e.created_at);
      return matchCode && matchType && afterReset;
    })
    .reduce((sum, e) => sum + (e.points_earned || 0), 0);

  // 推荐奖励（issued + reversed 净值）
  const referralRewardPoints = validData
    .filter(e => {
      const matchCode = e.member_code === memberCode;
      const matchType = e.transaction_type === 'referral_1' || e.transaction_type === 'referral_2';
      const afterReset = isAfterReset(e.created_at);
      return matchCode && matchType && afterReset;
    })
    .reduce((sum, e) => sum + (e.points_earned || 0), 0);

  // 兑换扣减（始终是 issued + 负数）
  const redemptionDeduction = validData
    .filter(e => {
      const matchCode = e.member_code === memberCode;
      const isRedemption = e.transaction_type === 'redeem_activity_1' || 
                           e.transaction_type === 'redeem_activity_2' || 
                           e.transaction_type === 'redemption';
      const isIssued = e.status === 'issued';
      const afterReset = isAfterReset(e.created_at);
      return matchCode && isRedemption && isIssued && afterReset && e.points_earned < 0;
    })
    .reduce((sum, e) => sum + (e.points_earned || 0), 0);

  // 允许负数
  const remainingPoints = consumptionReward + referralRewardPoints + redemptionDeduction;

  return {
    remainingPoints,
    consumptionReward,
    referralRewardPoints,
    lastResetTime,
    orderCount: 0, // 同步版本暂不支持累积数据
    totalAccumulatedNgn: 0,
    totalAccumulatedGhs: 0,
    totalAccumulatedUsdt: 0,
  };
}
