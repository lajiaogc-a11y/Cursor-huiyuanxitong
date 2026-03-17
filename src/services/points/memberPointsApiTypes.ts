export interface MemberPointsResult {
  success: boolean;
  points: number;
}

export interface MemberPointsBreakdownResult {
  success: boolean;
  consumption_points?: number;
  referral_points?: number;
  total_points?: number;
}

export interface MemberSpinQuotaResult {
  success: boolean;
  remaining?: number;
}
