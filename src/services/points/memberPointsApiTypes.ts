export interface MemberPointsResult {
  success: boolean;
  points: number;
}

export interface MemberPointsBreakdownResult {
  success: boolean;
  balance?: number;
  consumption_points?: number;
  referral_points?: number;
  lottery_points?: number;
  total_points?: number;
  frozen_points?: number;
  pending_mall_points?: number;
  referral_count?: number;
}

export interface MemberSpinQuotaResult {
  success: boolean;
  remaining?: number;
  daily_free?: number;
  credits?: number;
  used_today?: number;
}
