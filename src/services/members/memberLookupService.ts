/**
 * 会员按电话查询服务 - 使用 RPC 避免 RLS 拦截
 * 解决 profiles.employee_id 为空时计算页无法自动填充会员数据的问题
 */
import { supabase } from '@/integrations/supabase/client';

export interface MemberByPhone {
  id: string;
  phone_number: string;
  member_code: string;
  member_level: string | null;
  common_cards: string[] | null;
  currency_preferences: string[] | null;
  bank_card: string | null;
  customer_feature: string | null;
  source_id: string | null;
  remark: string | null;
  [key: string]: unknown;
}

/** 按电话号码查询本租户会员（RPC，含 tenant 兜底） */
export async function getMemberByPhoneForMyTenant(phone: string): Promise<MemberByPhone | null> {
  const cleaned = String(phone || '').trim();
  if (!cleaned) return null;

  const { data, error } = await supabase.rpc('get_member_by_phone_for_my_tenant', {
    p_phone: cleaned,
  });

  if (error) {
    console.error('[MemberLookup] RPC failed:', error);
    return null;
  }
  return data as MemberByPhone | null;
}
