/**
 * Auth API Service - 通过 Backend API 进行认证
 * 替代 supabase.auth
 * 当后端未部署时，自动回退到 Supabase Edge Function
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

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '';

/** 使用 Supabase Edge Function 登录（后端未部署时的备用） */
async function loginViaEdgeFunction(
  username: string,
  password: string
): Promise<{ success: boolean; user?: AuthUser; message?: string }> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return { success: false, message: '未配置 Supabase' };
  }
  const url = `${SUPABASE_URL.replace(/\/$/, '')}/functions/v1/employee-login`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ username: username.trim(), password }),
  });
  const data = (await res.json().catch(() => ({}))) as LoginResponse;
  if (!data.success || !data.token || !data.user) {
    return { success: false, message: data.error || '登录失败' };
  }
  setAuthToken(data.token);
  return { success: true, user: data.user };
}

/** 登录 */
export async function loginApi(
  username: string,
  password: string
): Promise<{ success: boolean; user?: AuthUser; message?: string }> {
  try {
    // 登录接口直接用 fetch，不走 apiPost（避免 401 触发全局 onUnauthorized 回调）
    const API_BASE = import.meta.env.VITE_API_BASE ?? '';
    const url = `${API_BASE}/api/auth/login`.replace(/([^:])\/\/+/g, '$1/');
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username.trim(), password }),
    });
    const data = await response.json().catch(() => ({})) as LoginResponse & { error?: string };
    if (!response.ok || !data.success) {
      const errorMsg = data.error || data.message || '登录失败';
      // 404 说明后端未部署，回退到 Edge Function
      if (response.status === 404) {
        try { return await loginViaEdgeFunction(username, password); } catch (_) {}
      }
      return { success: false, message: errorMsg };
    }
    if (!data.token || !data.user) {
      return { success: false, message: '登录失败' };
    }
    setAuthToken(data.token);
    return { success: true, user: data.user };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const isBackendUnavailable =
      msg.includes('ECONNREFUSED') ||
      msg.includes('Failed to fetch') ||
      msg.includes('NetworkError') ||
      msg.includes('接口不存在');
    if (isBackendUnavailable) {
      try {
        return await loginViaEdgeFunction(username, password);
      } catch (edgeErr) {
        return {
          success: false,
          message: '登录失败，请检查网络或联系管理员',
        };
      }
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

/** 使用 Supabase Edge Function 获取当前用户（后端未部署时的备用） */
async function getMeViaEdgeFunction(): Promise<AuthUser | null> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('api_access_token') : null;
  if (!token) return null;
  const url = `${SUPABASE_URL.replace(/\/$/, '')}/functions/v1/employee-me`;
  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  const data = (await res.json().catch(() => ({}))) as MeResponse;
  return data.success && data.user ? data.user : null;
}

/** 获取当前用户信息 */
export async function getCurrentUserApi(): Promise<AuthUser | null> {
  try {
    const res = await apiGet<MeResponse>('/api/auth/me');
    if (res.success && res.user) return res.user;
    return null;
  } catch {
    return getMeViaEdgeFunction();
  }
}
