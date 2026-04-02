/**
 * 客户详情服务 - 按电话通过后端 API 查询会员数据与活动数据
 */
import { getCustomerDetailByPhoneApi } from "@/services/members/membersApiService";

export interface CustomerDetailMember {
  id: string;
  phone_number: string;
  member_code: string;
  member_level: string | null;
  common_cards: string[];
  currency_preferences: string[];
  bank_card: string | null;
  customer_feature: string | null;
  source_name: string | null;
  remark: string | null;
  created_at: string;
  recorder_name: string | null;
  referrer_display: string | null; // 推荐人电话或会员编号
  invite_success_lifetime_count?: number;
  lifetime_reward_points_earned?: number;
}

export interface CustomerDetailActivity {
  order_count: number;
  remaining_points: number | null;
  accumulated_profit: number | null;
  accumulated_profit_usdt: number | null;
  total_accumulated_ngn: number | null;
  total_accumulated_ghs: number | null;
  total_accumulated_usdt: number | null;
  referral_count: number;
  consumption_count: number; // 下级次数
}

export interface CustomerDetail {
  member: CustomerDetailMember | null;
  activity: CustomerDetailActivity | null;
}

/** 按电话获取客户详情（会员数据 + 活动数据） */
export async function getCustomerDetailByPhone(phone: string, tenantId?: string | null): Promise<CustomerDetail> {
  const normalized = phone.trim();
  if (!normalized) return { member: null, activity: null };
  const data = await getCustomerDetailByPhoneApi(normalized, tenantId);
  return {
    member: data.member ?? null,
    activity: data.activity ?? null,
  };
}
