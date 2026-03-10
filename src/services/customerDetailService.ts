/**
 * 客户详情服务 - 按电话查询会员数据与活动数据
 */
import { supabase } from "@/integrations/supabase/client";

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
}

export interface CustomerDetailActivity {
  order_count: number;
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
export async function getCustomerDetailByPhone(phone: string): Promise<CustomerDetail> {
  const normalized = phone.trim();
  if (!normalized) {
    return { member: null, activity: null };
  }

  const memberRes = await supabase
    .from("members")
    .select("id, phone_number, member_code, member_level, common_cards, currency_preferences, bank_card, customer_feature, source_id, remark, created_at, creator_id")
    .eq("phone_number", normalized)
    .maybeSingle();
  const member = memberRes.data;

  if (!member) {
    return { member: null, activity: null };
  }

  const [referralRes, activityByPhoneRes, activityByMemberRes, referralsAsReferrerRes, sourceRes, recorderRes] = await Promise.all([
    supabase.from("referral_relations").select("referrer_phone, referrer_member_code").eq("referee_phone", normalized).limit(1),
    supabase
      .from("member_activity")
      .select("order_count, accumulated_profit, accumulated_profit_usdt, total_accumulated_ngn, total_accumulated_ghs, total_accumulated_usdt, referral_count")
      .eq("phone_number", normalized)
      .maybeSingle(),
    supabase
      .from("member_activity")
      .select("order_count, accumulated_profit, accumulated_profit_usdt, total_accumulated_ngn, total_accumulated_ghs, total_accumulated_usdt, referral_count")
      .eq("member_id", member.id)
      .maybeSingle(),
    supabase.from("referral_relations").select("referee_phone").eq("referrer_phone", normalized),
    member.source_id
      ? supabase.from("customer_sources").select("name").eq("id", member.source_id).maybeSingle()
      : Promise.resolve({ data: null }),
    member.creator_id
      ? supabase.from("employees").select("real_name").eq("id", member.creator_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const referrerRow = (referralRes.data || [])[0];
  const activity = activityByPhoneRes.data || activityByMemberRes.data;
  const referralsAsReferrer = referralsAsReferrerRes.data || [];
  const referredPhones = [...new Set(referralsAsReferrer.map((r: any) => r.referee_phone).filter(Boolean))];

  let consumptionCount = 0;
  if (referredPhones.length > 0) {
    const { count } = await supabase
      .from("orders")
      .select("*", { count: "exact", head: true })
      .in("phone_number", referredPhones)
      .in("status", ["completed", "pending"]);
    consumptionCount = count ?? 0;
  }

  const memberDetail: CustomerDetailMember = {
    id: member.id,
    phone_number: member.phone_number,
    member_code: member.member_code,
    member_level: member.member_level || null,
    common_cards: member.common_cards || [],
    currency_preferences: member.currency_preferences || [],
    bank_card: member.bank_card || null,
    customer_feature: member.customer_feature || null,
    source_name: sourceRes.data?.name || null,
    remark: member.remark || null,
    created_at: member.created_at,
    recorder_name: recorderRes.data?.real_name || null,
    referrer_display: referrerRow
      ? (referrerRow.referrer_member_code ? `${referrerRow.referrer_member_code} (${referrerRow.referrer_phone})` : referrerRow.referrer_phone)
      : null,
  };

  const activityDetail: CustomerDetailActivity = activity
    ? {
        order_count: activity.order_count ?? 0,
        accumulated_profit: activity.accumulated_profit ?? null,
        accumulated_profit_usdt: activity.accumulated_profit_usdt ?? null,
        total_accumulated_ngn: activity.total_accumulated_ngn ?? null,
        total_accumulated_ghs: activity.total_accumulated_ghs ?? null,
        total_accumulated_usdt: activity.total_accumulated_usdt ?? null,
        referral_count: activity.referral_count ?? referralsAsReferrer.length,
        consumption_count: consumptionCount,
      }
    : {
        order_count: 0,
        accumulated_profit: null,
        accumulated_profit_usdt: null,
        total_accumulated_ngn: null,
        total_accumulated_ghs: null,
        total_accumulated_usdt: null,
        referral_count: referralsAsReferrer.length,
        consumption_count: consumptionCount,
      };

  return {
    member: memberDetail,
    activity: activityDetail,
  };
}
