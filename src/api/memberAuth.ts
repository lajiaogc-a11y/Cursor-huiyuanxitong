/**
 * 会员端认证 API - hooks 仅通过此层调用
 */
import { apiClient } from '@/lib/apiClient';

export interface MemberInfo {
  id: string;
  member_code: string;
  phone_number: string;
  nickname: string | null;
  member_level: string | null;
  wallet_balance: number;
  tenant_id?: string | null;
}

export async function memberSignIn(
  phone: string,
  password: string
): Promise<{ success: boolean; member?: MemberInfo; message: string }> {
  try {
    const res = await apiClient.post<{ success?: boolean; data?: { member?: MemberInfo }; code?: string; message?: string }>(
      '/api/member-auth/signin',
      { phone: phone.trim(), password }
    );
    const r = res as { success?: boolean; data?: { member?: MemberInfo }; code?: string; message?: string };
    const member = r?.data?.member ?? (r as { member?: MemberInfo }).member;
    if (r?.success && member) {
      return {
        success: true,
        member: {
          id: member.id,
          member_code: member.member_code,
          phone_number: member.phone_number,
          nickname: member.nickname ?? null,
          member_level: member.member_level ?? null,
          wallet_balance: Number(member.wallet_balance) || 0,
          tenant_id: (member as { tenant_id?: string | null }).tenant_id ?? null,
        },
        message: 'Welcome back!',
      };
    }
    return { success: false, message: r?.message ?? 'Login failed' };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, message: msg || 'Network error' };
  }
}

export async function memberSetPassword(
  memberId: string,
  oldPassword: string,
  newPassword: string
): Promise<{ success: boolean; message: string }> {
  try {
    const res = await apiClient.post<{ success?: boolean; message?: string; code?: string }>(
      '/api/member-auth/set-password',
      { member_id: memberId, old_password: oldPassword, new_password: newPassword }
    );
    const r = res as { success?: boolean; message?: string };
    if (r?.success) return { success: true, message: r?.message ?? 'Password updated' };
    return { success: false, message: (r as { message?: string }).message ?? 'Failed' };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, message: msg || 'Network error' };
  }
}

export async function memberGetInfo(memberId: string): Promise<MemberInfo | null> {
  try {
    const res = await apiClient.get<{ success?: boolean; data?: { member?: MemberInfo } }>(
      `/api/member-auth/info?member_id=${encodeURIComponent(memberId)}`
    );
    const r = res as { success?: boolean; data?: { member?: MemberInfo } };
    const member = r?.data?.member;
    if (r?.success && member) {
      return {
        id: member.id,
        member_code: member.member_code,
        phone_number: member.phone_number,
        nickname: member.nickname ?? null,
        member_level: member.member_level ?? null,
        wallet_balance: Number(member.wallet_balance) || 0,
        tenant_id: (member as { tenant_id?: string | null }).tenant_id ?? null,
      };
    }
    return null;
  } catch {
    return null;
  }
}
