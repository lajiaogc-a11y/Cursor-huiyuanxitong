export type MemberLevelRuleRow = {
  id: string;
  tenant_id: string;
  level_name: string;
  /** 中文展示名；空则界面中文下回退为 level_name */
  level_name_zh: string;
  required_points: number;
  level_order: number;
  rate_bonus: number | null;
  priority_level: number | null;
  created_at: Date | string | null;
  updated_at: Date | string | null;
};

export type MemberLevelRuleInput = {
  level_name: string;
  level_name_zh?: string;
  required_points: number;
  level_order: number;
  rate_bonus?: number | null;
  priority_level?: number | null;
};
