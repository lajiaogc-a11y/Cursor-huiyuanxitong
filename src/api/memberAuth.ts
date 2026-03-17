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

/**
 * 检测后端 API 是否可用（缓存结果避免重复请求）
 */
let _backendAvailable: boolean | null = null;
async function isBackendAvailable(): Promise<boolean> {
  if (_backendAvailable !== null) return _backendAvailable;
  try {
    const base = import.meta.env.VITE_API_BASE ?? '';
    const url = `${base}/api/member-auth/signin`.replace(/([^:])\/\/+/g, '$1/');
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    const ct = res.headers.get('content-type') || '';
    // 后端应返回 JSON；如果返回 HTML 说明是 SPA 回退，后端不存在
    _backendAvailable = ct.includes('application/json');
  } catch {
    _backendAvailable = false;
  }
  return _backendAvailable;
}

function normalizeMember(member: MemberInfo): MemberInfo {
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

export async function memberSignIn(
  phone: string,
  password: string
): Promise<{ success: boolean; member?: MemberInfo; message: string }> {
  const backendOk = await isBackendAvailable();

  // 1. 后端可用时走 API
  if (backendOk) {
    try {
      const res = await apiClient.post<{ success?: boolean; data?: { member?: MemberInfo }; code?: string; message?: string }>(
        '/api/member-auth/signin',
        { phone: phone.trim(), password }
      );
      const r = res as { success?: boolean; data?: { member?: MemberInfo }; code?: string; message?: string };
      const member = r?.data?.member ?? (r as { member?: MemberInfo }).member;
      if (member) {
        return { success: true, member: normalizeMember(member), message: 'Welcome back!' };
      }
      return { success: false, message: r?.message ?? 'Login failed' };
    } catch (apiErr: unknown) {
      const msg = apiErr instanceof Error ? apiErr.message : String(apiErr);
      return { success: false, message: msg || 'Login failed' };
    }
  }

  // 2. 后端不可用，直接走 Supabase RPC
  try {
    const { supabase } = await import('@/integrations/supabase/client');
    const { data, error } = await supabase.rpc('verify_member_password', {
      p_phone: phone.trim(),
      p_password: password,
    });
    if (error) {
      return { success: false, message: error.message || 'Login failed' };
    }
    const result = data as { success?: boolean; error?: string; member?: MemberInfo };
    if (!result?.success || !result?.member) {
      const errMsg = result?.error === 'MEMBER_NOT_FOUND' ? '会员不存在'
        : result?.error === 'NO_PASSWORD_SET' ? '请联系管理员设置密码'
        : result?.error === 'WRONG_PASSWORD' ? '密码错误'
        : result?.error || 'Login failed';
      return { success: false, message: errMsg };
    }
    return { success: true, member: normalizeMember(result.member), message: 'Welcome back!' };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, message: msg || 'Login failed' };
  }
}

export async function memberSetPassword(
  memberId: string,
  oldPassword: string,
  newPassword: string
): Promise<{ success: boolean; message: string }> {
  const backendOk = await isBackendAvailable();
  if (backendOk) {
    try {
      const res = await apiClient.post<{ success?: boolean; message?: string; code?: string }>(
        '/api/member-auth/set-password',
        { member_id: memberId, old_password: oldPassword, new_password: newPassword }
      );
      const r = res as { success?: boolean; message?: string };
      if (r?.success) return { success: true, message: r?.message ?? 'Password updated' };
      return { success: false, message: (r as { message?: string }).message ?? 'Failed' };
    } catch (e: unknown) {
      return { success: false, message: e instanceof Error ? e.message : 'Failed' };
    }
  }
  try {
    const { supabase } = await import('@/integrations/supabase/client');
    const { data, error } = await supabase.rpc('set_member_password', {
      p_member_id: memberId, p_old_password: oldPassword, p_new_password: newPassword,
    });
    if (error) return { success: false, message: error.message };
    const r = data as { success?: boolean; error?: string };
    return { success: !!r?.success, message: r?.error || (r?.success ? 'Password updated' : 'Failed') };
  } catch (e: unknown) {
    return { success: false, message: e instanceof Error ? e.message : 'Failed' };
  }
}

export async function memberGetInfo(memberId: string): Promise<MemberInfo | null> {
  const backendOk = await isBackendAvailable();
  if (backendOk) {
    try {
      const res = await apiClient.get<{ success?: boolean; data?: { member?: MemberInfo } }>(
        `/api/member-auth/info?member_id=${encodeURIComponent(memberId)}`
      );
      const r = res as { success?: boolean; data?: { member?: MemberInfo } };
      const member = r?.data?.member;
      if (member) return normalizeMember(member);
      return null;
    } catch {
      return null;
    }
  }
  try {
    const { supabase } = await import('@/integrations/supabase/client');
    const { data, error } = await supabase.rpc('member_get_info', { p_member_id: memberId });
    if (error) return null;
    const r = data as { success?: boolean; member?: MemberInfo };
    if (!r?.success || !r?.member) return null;
    return normalizeMember(r.member);
  } catch {
    return null;
  }
}
