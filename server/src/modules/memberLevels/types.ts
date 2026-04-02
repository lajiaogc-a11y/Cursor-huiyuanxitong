export type MemberLevelRuleRow = {
  id: string;
  tenant_id: string;
  level_name: string;
  required_points: number;
  level_order: number;
  rate_bonus: number | null;
  priority_level: number | null;
  created_at: Date | string | null;
  updated_at: Date | string | null;
};

export type MemberLevelRuleInput = {
  level_name: string;
  required_points: number;
  level_order: number;
  rate_bonus?: number | null;
  priority_level?: number | null;
};
