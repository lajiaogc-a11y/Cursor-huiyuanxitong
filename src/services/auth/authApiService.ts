/**
 * Auth API Service - 通过 Backend API 进行认证
 * 替代 supabase.auth
 */
import { apiGet, apiPost } from '@/api/client';
import { setAuthToken, clearAuthToken } from '@/api/client';

export interface AuthUser {
  id: string;
  username: string;
  real_name: string;
  role: string;
  status: string;
  is_super_admin: boolean;
  is_platform_super_admin?: boolean;
  tenant_id?: string | null;
}

interface LoginResponse {
  success: boolean;
  token?: string;
  user?: AuthUser;
  error?: string;
}

interface MeResponse {
  success: boolean;
  user?: AuthUser;
  error?: string;
}

/** 登录 */
export async function loginApi(
  username: string,
  password: string
): Promise<{ success: boolean; user?: AuthUser; message?: string }> {
  try {
    const res = await apiPost<LoginResponse>('/api/auth/login', {
      username: username.trim(),
      password,
    });
    if (!res.success || !res.token || !res.user) {
      return { success: false, message: (res as { error?: string }).error || '登录失败' };
    }
    setAuthToken(res.token);
    return { success: true, user: res.user };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('ECONNREFUSED') || msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
      return { success: false, message: '无法连接后端服务，请检查网络或联系管理员确认后端已部署' };
    }
    if (msg === '请求失败' || msg.includes('404') || msg.includes('Not Found')) {
      return { success: false, message: '接口不存在，请确认后端服务已正确部署' };
    }
    return { success: false, message: msg || '登录失败' };
  }
}

/** 登出（清除本地 token，可选调用服务端） */
export async function logoutApi(): Promise<void> {
  try {
    await apiPost('/api/auth/logout', {});
  } catch {
    // 忽略服务端错误（如未登录时 401），本地清除即可
  }
  clearAuthToken();
}

/** 获取当前用户信息 */
export async function getCurrentUserApi(): Promise<AuthUser | null> {
  try {
    const res = await apiGet<MeResponse>('/api/auth/me');
    if (res.success && res.user) return res.user;
    return null;
  } catch {
    return null;
  }
}
