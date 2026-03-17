/**
 * Member Auth Repository - 会员认证 RPC
 */
import { supabaseAdmin } from '../../database/index.js';

export interface MemberInfo {
  id: string;
  member_code: string;
  phone_number: string;
  nickname: string | null;
  member_level: string | null;
  wallet_balance: number;
  tenant_id?: string | null;
}

export async function verifyMemberPasswordRepository(
  phone: string,
  password: string
): Promise<{ success: boolean; error?: string; member?: MemberInfo }> {
  const { data, error } = await supabaseAdmin.rpc('verify_member_password', {
    p_phone: phone.trim(),
    p_password: password,
  });
  if (error) {
    return { success: false, error: error.message };
  }
  const result = data as { success?: boolean; error?: string; member?: MemberInfo & { tenant_id?: string | null } };
  let m = result?.member;
  if (m && m.id) {
    const { data: row } = await supabaseAdmin.from('members').select('tenant_id').eq('id', m.id).single();
    m = { ...m, tenant_id: (row as { tenant_id?: string | null })?.tenant_id ?? null };
  }
  return {
    success: !!result?.success,
    error: result?.error,
    member: m,
  };
}

export async function setMemberPasswordRepository(
  memberId: string,
  oldPassword: string | null,
  newPassword: string
): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await supabaseAdmin.rpc('set_member_password', {
    p_member_id: memberId,
    p_old_password: oldPassword,
    p_new_password: newPassword,
  });
  if (error) {
    return { success: false, error: error.message };
  }
  const result = data as { success?: boolean; error?: string };
  return {
    success: !!result?.success,
    error: result?.error,
  };
}

export async function getMemberInfoRepository(memberId: string): Promise<{ success: boolean; member?: MemberInfo }> {
  const { data, error } = await supabaseAdmin.rpc('member_get_info', {
    p_member_id: memberId,
  });
  if (error) {
    return { success: false };
  }
  const result = data as { success?: boolean; member?: MemberInfo };
  return {
    success: !!result?.success,
    member: result?.member,
  };
}
