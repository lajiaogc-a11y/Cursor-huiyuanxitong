/**
 * Members Repository - 唯一可操作 members 表的层
 * 优先使用 pg 直连（绕过 RLS），无 DATABASE_PASSWORD 时回退 Supabase
 */
import { supabaseAdmin } from '../../database/index.js';
import { getPgPool, queryPg } from '../../database/pg.js';
import type { ListMembersQuery, CreateMemberBody, UpdateMemberBody, BulkCreateMemberItem } from './types.js';

export async function listMembersRepository(tenantId: string | undefined, query: ListMembersQuery) {
  const effectiveTenantId = query.tenant_id ?? tenantId;
  const page = query.page ?? 1;
  const limit = Math.min(query.limit ?? 50, 10000);
  const offset = (page - 1) * limit;

  if (getPgPool()) {
    if (effectiveTenantId) {
      const rows = await queryPg(
        `SELECT * FROM members WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
        [effectiveTenantId, limit, offset]
      );
      return rows;
    }
    const rows = await queryPg(
      `SELECT * FROM members ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    return rows;
  }

  let q = supabaseAdmin
    .from('members')
    .select('*')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (effectiveTenantId) {
    q = q.eq('tenant_id', effectiveTenantId);
  }
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function getMemberByIdRepository(id: string, tenantId: string | undefined) {
  if (getPgPool()) {
    const rows = tenantId
      ? await queryPg(`SELECT * FROM members WHERE id = $1 AND tenant_id = $2`, [id, tenantId])
      : await queryPg(`SELECT * FROM members WHERE id = $1`, [id]);
    if (rows.length === 0) throw Object.assign(new Error('Not found'), { code: 'PGRST116' });
    return rows[0];
  }
  let q = supabaseAdmin.from('members').select('*').eq('id', id);
  if (tenantId) q = q.eq('tenant_id', tenantId);
  const { data, error } = await q.single();
  if (error) throw error;
  return data;
}

export async function createMemberRepository(tenantId: string, body: CreateMemberBody) {
  const { data, error } = await supabaseAdmin
    .from('members')
    .insert({
      tenant_id: tenantId,
      phone_number: body.phone_number,
      member_code: body.member_code ?? generateMemberCode(),
      member_level: body.member_level ?? '普通会员',
      currency_preferences: body.currency_preferences ?? [],
      bank_card: body.bank_card ?? null,
      common_cards: body.common_cards ?? [],
      customer_feature: body.customer_feature ?? null,
      remark: body.remark ?? null,
      source_id: body.source_id ?? null,
      creator_id: body.creator_id ?? body.recorder_id ?? null,
      recorder_id: body.recorder_id ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateMemberRepository(id: string, tenantId: string, body: UpdateMemberBody) {
  const updates: Record<string, unknown> = {};
  if (body.member_level !== undefined) updates.member_level = body.member_level;
  if (body.currency_preferences !== undefined) updates.currency_preferences = body.currency_preferences;
  if (body.bank_card !== undefined) updates.bank_card = body.bank_card;
  if (body.common_cards !== undefined) updates.common_cards = body.common_cards;
  if (body.customer_feature !== undefined) updates.customer_feature = body.customer_feature;
  if (body.remark !== undefined) updates.remark = body.remark;
  if (body.source_id !== undefined) updates.source_id = body.source_id;

  if (Object.keys(updates).length === 0) {
    const { data } = await supabaseAdmin.from('members').select('*').eq('id', id).eq('tenant_id', tenantId).single();
    return data;
  }

  const { data, error } = await supabaseAdmin
    .from('members')
    .update(updates)
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateMemberByPhoneRepository(phone: string, tenantId: string, body: UpdateMemberBody) {
  const updates: Record<string, unknown> = {};
  if (body.member_level !== undefined) updates.member_level = body.member_level;
  if (body.currency_preferences !== undefined) updates.currency_preferences = body.currency_preferences;
  if (body.bank_card !== undefined) updates.bank_card = body.bank_card;
  if (body.common_cards !== undefined) updates.common_cards = body.common_cards;
  if (body.customer_feature !== undefined) updates.customer_feature = body.customer_feature;
  if (body.remark !== undefined) updates.remark = body.remark;
  if (body.source_id !== undefined) updates.source_id = body.source_id;

  if (Object.keys(updates).length === 0) {
    const { data } = await supabaseAdmin.from('members').select('*').eq('phone_number', phone).eq('tenant_id', tenantId).single();
    return data;
  }

  const { data, error } = await supabaseAdmin
    .from('members')
    .update(updates)
    .eq('phone_number', phone)
    .eq('tenant_id', tenantId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteMemberRepository(id: string, tenantId: string): Promise<void> {
  await supabaseAdmin.from('orders').update({ member_id: null }).eq('member_id', id);
  await supabaseAdmin.from('points_ledger').update({ member_id: null }).eq('member_id', id);
  await supabaseAdmin.from('activity_gifts').update({ member_id: null }).eq('member_id', id);
  await supabaseAdmin.from('member_activity').delete().eq('member_id', id);
  const { error } = await supabaseAdmin.from('members').delete().eq('id', id).eq('tenant_id', tenantId);
  if (error) throw error;
}

export async function bulkCreateMembersRepository(tenantId: string, items: BulkCreateMemberItem[]) {
  const rows = items.map((item) => ({
    tenant_id: tenantId,
    phone_number: item.phone_number,
    member_code: item.member_code ?? generateMemberCode(),
    member_level: item.member_level ?? '普通会员',
    currency_preferences: item.currency_preferences ?? [],
    bank_card: item.bank_card ?? null,
    common_cards: item.common_cards ?? [],
    customer_feature: item.customer_feature ?? null,
    remark: item.remark ?? null,
    source_id: item.source_id ?? null,
    creator_id: item.creator_id ?? null,
  }));
  const { data, error } = await supabaseAdmin.from('members').insert(rows).select('id');
  if (error) throw error;
  return data ?? [];
}

export async function listReferralsRepository(tenantId?: string | null) {
  if (getPgPool()) {
    if (tenantId) {
      return queryPg(
        `SELECT rr.referrer_phone, rr.referrer_member_code, rr.referee_phone
         FROM referral_relations rr
         INNER JOIN members m ON m.phone_number = rr.referee_phone
         WHERE m.tenant_id = $1`,
        [tenantId]
      );
    }
    return queryPg(`SELECT referrer_phone, referrer_member_code, referee_phone FROM referral_relations`);
  }
  let q = supabaseAdmin
    .from('referral_relations')
    .select('referrer_phone, referrer_member_code, referee_phone');
  if (tenantId) {
    const { data: memberPhones } = await supabaseAdmin
      .from('members')
      .select('phone_number')
      .eq('tenant_id', tenantId);
    const phones = (memberPhones ?? []).map((row: { phone_number: string }) => row.phone_number).filter(Boolean);
    if (phones.length === 0) return [];
    q = q.in('referee_phone', phones);
  }
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function getCustomerDetailByPhoneRepository(phone: string, tenantId?: string | null): Promise<{
  member: {
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
    referrer_display: string | null;
  } | null;
  activity: {
    order_count: number;
    remaining_points: number | null;
    accumulated_profit: number | null;
    accumulated_profit_usdt: number | null;
    total_accumulated_ngn: number | null;
    total_accumulated_ghs: number | null;
    total_accumulated_usdt: number | null;
    referral_count: number;
    consumption_count: number;
  } | null;
}> {
  const normalized = phone.trim();
  if (!normalized) return { member: null, activity: null };

  let memberQuery = supabaseAdmin
    .from('members')
    .select('id, phone_number, member_code, member_level, common_cards, currency_preferences, bank_card, customer_feature, source_id, remark, created_at, creator_id')
    .eq('phone_number', normalized);
  if (tenantId) memberQuery = memberQuery.eq('tenant_id', tenantId);
  const memberRes = await memberQuery.maybeSingle();
  const member = memberRes.data;
  if (!member) return { member: null, activity: null };

  const [referralRes, activityByPhoneRes, activityByMemberRes, referralsAsReferrerRes, sourceRes, recorderRes] = await Promise.all([
    supabaseAdmin.from('referral_relations').select('referrer_phone, referrer_member_code').eq('referee_phone', normalized).limit(1),
    supabaseAdmin
      .from('member_activity')
      .select('order_count, remaining_points, accumulated_profit, accumulated_profit_usdt, total_accumulated_ngn, total_accumulated_ghs, total_accumulated_usdt, referral_count')
      .eq('phone_number', normalized)
      .maybeSingle(),
    supabaseAdmin
      .from('member_activity')
      .select('order_count, remaining_points, accumulated_profit, accumulated_profit_usdt, total_accumulated_ngn, total_accumulated_ghs, total_accumulated_usdt, referral_count')
      .eq('member_id', member.id)
      .maybeSingle(),
    supabaseAdmin.from('referral_relations').select('referee_phone').eq('referrer_phone', normalized),
    member.source_id
      ? supabaseAdmin.from('customer_sources').select('name').eq('id', member.source_id).maybeSingle()
      : Promise.resolve({ data: null }),
    member.creator_id
      ? supabaseAdmin.from('employees').select('real_name').eq('id', member.creator_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const referrerRow = (referralRes.data || [])[0];
  const activity = activityByPhoneRes.data || activityByMemberRes.data;
  const referralsAsReferrer = referralsAsReferrerRes.data || [];
  const referredPhones = [...new Set(referralsAsReferrer.map((r: any) => r.referee_phone).filter(Boolean))];

  let consumptionCount = 0;
  if (referredPhones.length > 0) {
    let ordersQuery = supabaseAdmin
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .in('phone_number', referredPhones)
      .in('status', ['completed', 'pending']);
    if (tenantId) ordersQuery = ordersQuery.eq('tenant_id', tenantId);
    const { count } = await ordersQuery;
    consumptionCount = count ?? 0;
  }

  return {
    member: {
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
    },
    activity: activity
      ? {
          order_count: activity.order_count ?? 0,
          remaining_points: activity.remaining_points ?? null,
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
          remaining_points: null,
          accumulated_profit: null,
          accumulated_profit_usdt: null,
          total_accumulated_ngn: null,
          total_accumulated_ghs: null,
          total_accumulated_usdt: null,
          referral_count: referralsAsReferrer.length,
          consumption_count: consumptionCount,
        },
  };
}

function generateMemberCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 7; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
