export interface Member {
  id: string;
  member_code: string;
  phone_number: string;
  tenant_id?: string;
  member_level?: string;
  currency_preferences?: string[];
  bank_card?: string;
  common_cards?: string[];
  customer_feature?: string;
  remark?: string;
  source_id?: string | null;
  recorder_id?: string | null;
  creator_id?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface ListMembersQuery {
  tenant_id?: string;
  page?: number;
  limit?: number;
}

export interface CreateMemberBody {
  phone_number: string;
  member_code?: string;
  member_level?: string;
  currency_preferences?: string[];
  bank_card?: string;
  common_cards?: string[];
  customer_feature?: string;
  remark?: string;
  source_id?: string | null;
  creator_id?: string | null;
  recorder_id?: string | null;
}

export interface UpdateMemberBody {
  member_code?: string;
  /** 手动调级时传规则 id（须与审核中心「允许手动改等级」同时开启） */
  current_level_id?: string | null;
  member_level?: string;
  currency_preferences?: string[];
  bank_card?: string;
  common_cards?: string[];
  customer_feature?: string;
  remark?: string;
  source_id?: string | null;
  /** 门户展示昵称；null 或空串可清空 */
  nickname?: string | null;
  /** 推荐人电话/编号（与 lookup 同源）；null 或空串表示清除。仅当请求体包含该字段时处理。 */
  referrer_phone?: string | null;
}

export interface ReferralRelation {
  referrer_phone: string;
  referrer_member_code: string;
  referee_phone: string;
}

export interface BulkCreateMemberItem {
  phone_number: string;
  member_code?: string;
  nickname?: string | null;
  member_level?: string;
  currency_preferences?: string[];
  bank_card?: string;
  common_cards?: string[];
  customer_feature?: string;
  remark?: string;
  source_id?: string | null;
  creator_id?: string | null;
  tenant_id?: string;
}
