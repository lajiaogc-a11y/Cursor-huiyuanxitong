// ============= 积分计算共享服务 =============
// 提供统一的积分计算逻辑，供汇率计算器和活动数据页面共用
// ⚠️ 核心规则：
// - 原始发放：status='issued' + points_earned > 0
// - 订单删除回收：status='reversed' + points_earned < 0
// - 净积分 = 所有匹配记录的 points_earned 总和（正负自动抵消）

import { apiGet } from '@/api/client';



function asRowArray<T>(v: T[] | T | null | undefined): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

export interface PointsLedgerRow {
  member_code: string;
  phone_number: string;
  transaction_type: string;
  /** MySQL 流水 type 列（抽奖等可能只写 type） */
  type?: string | null;
  created_at: string;
  points_earned: number;
  amount?: number | string | null;
  status: string;
}

/** 与流水行上的 transaction_type / type 对齐（抽奖、兑换等） */
function ledgerTxn(e: PointsLedgerRow): string {
  return String(e.transaction_type || e.type || '').trim();
}

function ledgerAmt(e: PointsLedgerRow): number {
  const n = Number(e.points_earned ?? e.amount ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function isRedemptionTxn(tt: string): boolean {
  const t = String(tt ?? '').toLowerCase();
  return (
    t === 'redeem_activity_1' ||
    t === 'redeem_activity_2' ||
    t === 'redemption' ||
    t === 'redeem' ||
    t === 'mall_redemption' ||
    t === 'gift_delete_restore'
  );
}

export interface MemberPointsSummary {
  remainingPoints: number;
  consumptionReward: number;
  referralRewardPoints: number;
  /** 抽奖获得的积分（重置后、issued 净值） */
  lotteryPoints: number;
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
 * 4. 剩余积分与「会员管理 → 活动数据」一致：优先取 points_accounts.balance（账务为准），无法读取时再回退为流水汇总
 *
 * @param memberCode 会员编号
 * @param phoneNumber 电话号码
 * @param tenantId 预留（与数据表租户过滤扩展一致）
 * @param memberId 若已知会员主键，优先按 member_id 读 member_activity，与「会员管理 → 活动数据」累积次数（permanentOrderCount）同源
 * @returns 积分摘要（剩余积分、消费奖励、推荐奖励）
 */
export async function getMemberPointsSummary(
  memberCode: string,
  phoneNumber: string,
  _tenantId?: string | null,
  memberId?: string | null,
): Promise<MemberPointsSummary> {
  try {
    const orClause = `member_code.eq.${memberCode},phone_number.eq.${phoneNumber}`;
    const ledgerQuery = `select=*&or=${encodeURIComponent(orClause)}&status=${encodeURIComponent('in.(issued,reversed)')}`;

    const phoneQ = String(phoneNumber || '').trim();
    const mid = String(memberId ?? '').trim();
    let accountsQuery: string;
    if (mid) {
      accountsQuery = `select=balance,last_reset_time&member_id=eq.${encodeURIComponent(mid)}&limit=1`;
    } else if (phoneQ.length > 0) {
      accountsQuery = `select=balance,last_reset_time&or=${encodeURIComponent(
        `member_code.eq.${memberCode},phone.eq.${phoneQ}`,
      )}&limit=1`;
    } else {
      accountsQuery = `select=balance,last_reset_time&member_code=eq.${encodeURIComponent(memberCode)}&limit=1`;
    }

    const activitySelect =
      'order_count,total_accumulated_ngn,total_accumulated_ghs,total_accumulated_usdt';
    const loadMemberActivity = async (): Promise<Record<string, unknown>[]> => {
      if (mid) {
        const byId = await apiGet<Record<string, unknown> | Record<string, unknown>[]>(
          `/api/data/table/member_activity?select=${activitySelect}&member_id=eq.${encodeURIComponent(mid)}&limit=1`,
        )
          .then(asRowArray)
          .catch(() => [] as Record<string, unknown>[]);
        if (byId.length > 0) return byId;
      }
      if (phoneQ.length > 0) {
        return apiGet<Record<string, unknown> | Record<string, unknown>[]>(
          `/api/data/table/member_activity?select=${activitySelect}&phone_number=eq.${encodeURIComponent(phoneQ)}&limit=1`,
        )
          .then(asRowArray)
          .catch(() => [] as Record<string, unknown>[]);
      }
      return [];
    };

    const [activityRows, accountRows, pointsData] = await Promise.all([
      loadMemberActivity(),
      apiGet<
          | { balance?: number | string | null; last_reset_time?: string | null }
          | { balance?: number | string | null; last_reset_time?: string | null }[]
        >(`/api/data/table/points_accounts?${accountsQuery}`)
        .then(asRowArray)
        .catch(() => [] as { balance?: number | string | null; last_reset_time?: string | null }[]),
      apiGet<PointsLedgerRow | PointsLedgerRow[]>(`/api/data/table/points_ledger?${ledgerQuery}`)
        .then(asRowArray)
        .catch(() => [] as PointsLedgerRow[]),
    ]);

    const memberActivity = activityRows[0];
    const accountsRow = accountRows[0] ?? null;

    const orderCount = Number(memberActivity?.order_count) || 0;
    const totalAccumulatedNgn = Number(memberActivity?.total_accumulated_ngn) || 0;
    const totalAccumulatedGhs = Number(memberActivity?.total_accumulated_ghs) || 0;
    const totalAccumulatedUsdt = Number(memberActivity?.total_accumulated_usdt) || 0;

    const lastResetTime = accountsRow?.last_reset_time ?? null;
    const resetDate = lastResetTime ? new Date(lastResetTime) : null;

    // 使用 > 而不是 >= 确保兑换记录不被包含在新周期
    const isAfterReset = (dateStr: string): boolean => {
      if (!resetDate) return true;
      return new Date(dateStr) > resetDate; // 使用 > 而不是 >=
    };

    // 消费奖励 - 按 member_code 或 phone_number 匹配，统计 reset 之后的消费积分
    // ⚠️ 修复：用户输入的 memberCode 可能与数据库实际 member_code 不同（如用户输入电话号码作为会员编号）
    // 因此需要同时匹配 member_code 和 phone_number，避免遗漏
    const consumptionReward = (pointsData as PointsLedgerRow[])
      .filter((e: PointsLedgerRow) => {
        const matchCodeOrPhone = e.member_code === memberCode || e.phone_number === phoneNumber;
        const matchType = ledgerTxn(e) === 'consumption';
        const afterReset = isAfterReset(e.created_at);
        return matchCodeOrPhone && matchType && afterReset;
      })
      .reduce((sum: number, e: PointsLedgerRow) => sum + ledgerAmt(e), 0);

    // 推荐奖励 - 按 member_code 或 phone_number 匹配
    // 因为推荐积分可能只关联到 phone_number
    const referralRewardPoints = (pointsData as PointsLedgerRow[])
      .filter((e: PointsLedgerRow) => {
        const matchCodeOrPhone = e.member_code === memberCode || e.phone_number === phoneNumber;
        const tt = ledgerTxn(e);
        const matchType = tt === 'referral_1' || tt === 'referral_2';
        const afterReset = isAfterReset(e.created_at);
        return matchCodeOrPhone && matchType && afterReset;
      })
      .reduce((sum: number, e: PointsLedgerRow) => sum + ledgerAmt(e), 0);

    // 抽奖积分（重置后；issued 流水）
    const lotteryPoints = (pointsData as PointsLedgerRow[])
      .filter((e: PointsLedgerRow) => {
        const matchCodeOrPhone = e.member_code === memberCode || e.phone_number === phoneNumber;
        const isLottery = ledgerTxn(e).toLowerCase() === 'lottery';
        const isIssued = e.status === 'issued';
        const afterReset = isAfterReset(e.created_at);
        return matchCodeOrPhone && isLottery && isIssued && afterReset;
      })
      .reduce((sum: number, e: PointsLedgerRow) => sum + ledgerAmt(e), 0);

    // 兑换类流水净值：同一 transaction_type 下负数为扣减、正数为回退（含删除赠送回退），合并抵消
    const redemptionNet = (pointsData as PointsLedgerRow[])
      .filter((e: PointsLedgerRow) => {
        const matchCodeOrPhone = e.member_code === memberCode || e.phone_number === phoneNumber;
        const tt = ledgerTxn(e);
        const red = isRedemptionTxn(tt);
        const issuedLike =
          e.status === 'issued' || (red && (e.status == null || String(e.status).trim() === ''));
        const afterReset = isAfterReset(e.created_at);
        return matchCodeOrPhone && red && issuedLike && afterReset;
      })
      .reduce((sum: number, e: PointsLedgerRow) => sum + ledgerAmt(e), 0);

    // H6/H7: The authoritative balance is points_accounts.balance from the server.
    // Ledger-based calculation is a LAST RESORT fallback only.
    const balRaw = accountsRow != null ? Number(accountsRow.balance) : NaN;
    const remainingPoints = Number.isFinite(balRaw) ? balRaw
      : consumptionReward + referralRewardPoints + lotteryPoints + redemptionNet;

    return {
      remainingPoints,
      consumptionReward,
      referralRewardPoints,
      lotteryPoints,
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
      lotteryPoints: 0,
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
  pointsLedgerData: PointsLedgerRow[],
  lastResetTime: string | null
): MemberPointsSummary {
  const resetDate = lastResetTime ? new Date(lastResetTime) : null;

  // 使用 > 而不是 >= 确保兑换记录不被包含在新周期
  const isAfterReset = (dateStr: string): boolean => {
    if (!resetDate) return true;
    return new Date(dateStr) > resetDate; // 使用 > 而不是 >=
  };

  // ⚠️ 包含 issued 和 reversed 两种状态，净积分自动计算
  const validData = pointsLedgerData.filter((e: PointsLedgerRow) => e.status === 'issued' || e.status === 'reversed');

  // 消费奖励（issued + reversed 净值）
  const consumptionReward = validData
    .filter((e: PointsLedgerRow) => {
      const matchCode = e.member_code === memberCode;
      const matchType = ledgerTxn(e) === 'consumption';
      const afterReset = isAfterReset(e.created_at);
      return matchCode && matchType && afterReset;
    })
    .reduce((sum: number, e: PointsLedgerRow) => sum + ledgerAmt(e), 0);

  // 推荐奖励（issued + reversed 净值）
  const referralRewardPoints = validData
    .filter((e: PointsLedgerRow) => {
      const matchCode = e.member_code === memberCode;
      const tt = ledgerTxn(e);
      const matchType = tt === 'referral_1' || tt === 'referral_2';
      const afterReset = isAfterReset(e.created_at);
      return matchCode && matchType && afterReset;
    })
    .reduce((sum: number, e: PointsLedgerRow) => sum + ledgerAmt(e), 0);

  const lotteryPoints = validData
    .filter((e: PointsLedgerRow) => {
      const matchCode = e.member_code === memberCode;
      const isLottery = ledgerTxn(e).toLowerCase() === 'lottery';
      const isIssued = e.status === 'issued';
      const afterReset = isAfterReset(e.created_at);
      return matchCode && isLottery && isIssued && afterReset;
    })
    .reduce((sum: number, e: PointsLedgerRow) => sum + ledgerAmt(e), 0);

  const redemptionNet = validData
    .filter((e: PointsLedgerRow) => {
      const matchCode = e.member_code === memberCode;
      const tt = ledgerTxn(e);
      const red = isRedemptionTxn(tt);
      const issuedLike =
        e.status === 'issued' || (red && (e.status == null || String(e.status).trim() === ''));
      const afterReset = isAfterReset(e.created_at);
      return matchCode && red && issuedLike && afterReset;
    })
    .reduce((sum: number, e: PointsLedgerRow) => sum + ledgerAmt(e), 0);

  const remainingPoints = consumptionReward + referralRewardPoints + lotteryPoints + redemptionNet;

  return {
    remainingPoints,
    consumptionReward,
    referralRewardPoints,
    lotteryPoints,
    lastResetTime,
    orderCount: 0, // 同步版本暂不支持累积数据
    totalAccumulatedNgn: 0,
    totalAccumulatedGhs: 0,
    totalAccumulatedUsdt: 0,
  };
}
