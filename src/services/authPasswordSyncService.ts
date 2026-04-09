// TODO: unused-candidate — verify callers / product intent before removal
import { authApi } from '@/api/auth';
import { ApiError } from '@/lib/apiClient';
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
    const res = (await authApi.syncPassword({
      username,
      password,
    })) as { success?: boolean; message?: string };
    if (res && typeof res === 'object' && res.success === false) {
      return { success: false, message: res.message || '认证同步失败，请联系平台管理员重置密码' };
    }
    return { success: true };
  } catch (e) {
    if (e instanceof ApiError) {
      const msg = e.message || '认证同步失败';
      return {
        success: false,
        message: msg.includes('fetch') || msg.includes('Failed') ? '认证服务不可用，请联系平台管理员重置密码' : msg,
      };
    }
    const msg = e instanceof Error ? e.message : '未知错误';
    return {
      success: false,
      message: msg.includes('fetch') || msg.includes('network') ? '认证服务不可用，请联系平台管理员重置密码' : msg,
    };
  }
}
