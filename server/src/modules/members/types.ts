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
  member_level?: string;
  currency_preferences?: string[];
  bank_card?: string;
  common_cards?: string[];
  customer_feature?: string;
  remark?: string;
  source_id?: string | null;
}

export interface ReferralRelation {
  referrer_phone: string;
  referrer_member_code: string;
  referee_phone: string;
}

export interface BulkCreateMemberItem {
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
  tenant_id?: string;
}
