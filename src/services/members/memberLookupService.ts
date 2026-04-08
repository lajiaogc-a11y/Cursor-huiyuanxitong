/**
 * 会员按电话查询服务 - 通过后端 API 调用
 * 解决 profiles.employee_id 为空时计算页无法自动填充会员数据的问题
 */
import { apiGet } from '@/api/client';

/** 校验会员是否属于当前操作租户（多租户下防止错绑其它租户会员） */
export function isMemberInTenant(
  member: { tenant_id?: string | null } | null | undefined,
  expectedTenantId: string | null | undefined,
): boolean {
  const exp = String(expectedTenantId ?? "").trim();
  if (!exp) return true;
  if (!member) return false;
  const mt = member.tenant_id != null ? String(member.tenant_id).trim() : "";
  if (!mt) return false;
  return mt === exp;
}

export interface MemberByPhone {
  id: string;
  tenant_id?: string | null;
  phone_number: string;
  member_code: string;
  member_level: string | null;
  member_level_zh?: string | null;
  common_cards: string[] | null;
  currency_preferences: string[] | null;
  bank_card: string | null;
  customer_feature: string | null;
  source_id: string | null;
  source_name: string | null;
  remark: string | null;
  recorder_name: string | null;
  referrer_display: string | null;
  created_at: string | null;
  remaining_points: number | null;
  order_count: number;
  [key: string]: unknown;
}

interface CustomerDetailResponse {
  member: {
    id: string;
    phone_number: string;
    member_code: string;
    member_level: string | null;
    member_level_zh?: string | null;
    common_cards: string[];
    currency_preferences: string[];
    bank_card: string | null;
    customer_feature: string | null;
    source_id: string | null;
    source_name: string | null;
    remark: string | null;
    created_at: string;
    recorder_name: string | null;
    referrer_display: string | null;
  } | null;
  activity: {
    order_count: number;
    remaining_points: number | null;
    accumulated_profit: number | null;
    accumulated_profit_usdt: number | null;
    referral_count: number;
    consumption_count: number;
  } | null;
}

/** 按电话号码查询本租户会员（通过后端 API）。platform 进入租户视图时请传 tenantId，与库内号码格式不一致时由服务端模糊匹配。 */
export async function getMemberByPhoneForMyTenant(
  phone: string,
  tenantId?: string | null,
  options?: { syncCommonCards?: boolean }
): Promise<MemberByPhone | null> {
  const cleaned = String(phone || '').trim();
  if (!cleaned) return null;

  try {
    const qs = new URLSearchParams();
    if (tenantId && String(tenantId).trim()) {
      qs.set('tenant_id', String(tenantId).trim());
    }
    if (options?.syncCommonCards !== false) {
      qs.set('sync_common_cards', '1');
    }
    const q = qs.toString() ? `?${qs.toString()}` : '';
    const data = await apiGet<CustomerDetailResponse | null>(
      `/api/members/customer-detail/${encodeURIComponent(cleaned)}${q}`
    );
    if (!data?.member) return null;
    const m = data.member;
    const a = data.activity;
    return {
      id: m.id,
      tenant_id: m.tenant_id ?? null,
      phone_number: m.phone_number,
      member_code: m.member_code,
      member_level: m.member_level,
      member_level_zh: m.member_level_zh ?? null,
      common_cards: m.common_cards ?? [],
      currency_preferences: m.currency_preferences ?? [],
      bank_card: m.bank_card,
      customer_feature: m.customer_feature,
      source_id: m.source_id ?? null,
      source_name: m.source_name,
      remark: m.remark,
      recorder_name: m.recorder_name,
      referrer_display: m.referrer_display,
      created_at: m.created_at,
      remaining_points: a?.remaining_points ?? null,
      order_count: a?.order_count ?? 0,
    };
  } catch (e) {
    console.error('[MemberLookup] API failed:', e);
    return null;
  }
}
