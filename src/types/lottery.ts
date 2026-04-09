/**
 * Lottery / Spin-wheel shared types
 */

export interface LotteryPrize {
  id: string;
  name: string;
  type: 'points' | 'custom' | 'none';
  value: number;
  description?: string;
  probability?: number;
}

export interface DrawResult {
  success: boolean;
  prize?: LotteryPrize;
  remaining?: number;
  error?: string;
  reward_status?: string;
  fail_reason?: string;
  reward_points?: number;
  balance_after?: number;
  budget_warning?: boolean;
  risk_downgraded?: boolean;
  idempotent_replay?: boolean;
}

export interface LotteryLog {
  id: string;
  member_id: string;
  prize_id: string | null;
  prize_name: string;
  prize_type: string;
  prize_value: number;
  reward_status: string;
  created_at: string;
  tenant_id?: string | null;
}

export interface LotterySettings {
  daily_free_spins: number;
  daily_reward_budget: number;
  target_rtp: number;
  [key: string]: unknown;
}

export interface OperationalStats {
  today: {
    draws: number;
    cost: number;
    points_cost: number;
    composite_prize_cost: number;
    points_awarded: number;
  };
  budget: {
    daily_cap: number;
    daily_used: number;
  };
  rtp: { target: number; actual: number };
}
