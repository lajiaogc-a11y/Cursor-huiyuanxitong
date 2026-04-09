/**
 * Points shared types
 */

export interface MemberPoints {
  success: boolean;
  points: number;
  balance: number;
  frozen_points: number;
  total_points: number;
}

export interface MemberPointsBreakdown {
  success: boolean;
  balance?: number;
  consumption_points?: number;
  referral_points?: number;
  lottery_points?: number;
  total_points?: number;
  pending_mall_points?: number;
  referral_count?: number;
}

export interface MemberSpinQuota {
  success: boolean;
  remaining?: number;
  daily_free?: number;
  credits?: number;
  used_today?: number;
}

export interface PointOrder {
  id: string;
  member_id: string;
  member_phone?: string;
  product_name: string;
  points_cost: number;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  updated_at?: string;
  tenant_id?: string | null;
}

export interface CreatePointOrderPayload {
  member_id: string;
  product_name: string;
  points_cost: number;
}
