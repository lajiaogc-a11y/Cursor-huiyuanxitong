export interface MemberPointsResult {
  success: boolean;
  points: number;
}

export interface MemberPointsBreakdownResult {
  success: boolean;
  /** 与 points_accounts.balance 一致 */
  balance?: number;
  consumption_points?: number;
  referral_points?: number;
  lottery_points?: number;
  total_points?: number;
  /** 积分商城待审核兑换合计积分 */
  pending_mall_points?: number;
  /** 活动数据推荐人数 */
  referral_count?: number;
}

export interface MemberSpinQuotaResult {
  success: boolean;
  remaining?: number;
  /** 与 /api/lottery/quota 一致（便于排障） */
  daily_free?: number;
  credits?: number;
  used_today?: number;
}
