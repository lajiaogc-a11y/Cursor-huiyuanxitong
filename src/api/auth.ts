/**
 * 认证 API - hooks 仅通过此层调用
 */
import { apiClient, setAuthToken, clearAuthToken } from '@/lib/apiClient';

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

export async function login(
  username: string,
  password: string
): Promise<{ success: boolean; user?: AuthUser; message?: string }> {
  try {
    const res = await apiClient.post<{ success?: boolean; token?: string; user?: AuthUser; error?: string }>(
      '/api/auth/login',
      { username: username.trim(), password }
    );
    const r = res as { success?: boolean; token?: string; user?: AuthUser; error?: string };
    if (!r.success || !r.token || !r.user) {
      return { success: false, message: r.error || '登录失败' };
    }
    setAuthToken(r.token);
    return { success: true, user: r.user };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('ECONNREFUSED') || msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
      return { success: false, message: '无法连接后端服务，请先启动：cd server && npm run dev' };
    }
    return { success: false, message: msg || '登录失败' };
  }
}

export async function logout(): Promise<void> {
  try {
    await apiClient.post('/api/auth/logout', {});
  } catch {
    /* 忽略 */
  }
  clearAuthToken();
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  try {
    const res = await apiClient.get<{ success?: boolean; user?: AuthUser }>('/api/auth/me');
    const r = res as { success?: boolean; user?: AuthUser };
    if (r.success && r.user) return r.user;
    return null;
  } catch {
    return null;
  }
}
