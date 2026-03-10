import { supabase } from '@/integrations/supabase/client';

export type AuthPasswordSyncResult = {
  success: boolean;
  message?: string;
};

/**
 * 同步“认证系统”的密码到当前输入密码（必要时创建账号）。
 * 仅在员工账号密码校验通过后使用（调用端保证）。
 */
export async function syncAuthPassword(username: string, password: string): Promise<AuthPasswordSyncResult> {
  try {
    const { data, error } = await supabase.functions.invoke('sync-auth-password', {
      body: { username, password },
    });

    if (error) {
      const msg = error.message || '调用认证同步服务失败';
      return { success: false, message: msg.includes('fetch') || msg.includes('Failed') ? '认证服务不可用，请联系平台管理员重置密码' : msg };
    }

    const result = (data || {}) as AuthPasswordSyncResult;
    if (result.success === false) {
      return { success: false, message: result.message || '认证同步失败，请联系平台管理员重置密码' };
    }
    return { success: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : '未知错误';
    return { success: false, message: msg.includes('fetch') || msg.includes('network') ? '认证服务不可用，请联系平台管理员重置密码' : msg };
  }
}
