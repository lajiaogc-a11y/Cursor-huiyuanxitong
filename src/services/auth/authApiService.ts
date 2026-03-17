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

/** 使用 Supabase RPC 直接登录（后端和 Edge Function 都不可用时的最终备用） */
async function loginViaSupabaseRpc(
  username: string,
  password: string
): Promise<{ success: boolean; user?: AuthUser; message?: string }> {
  const { supabase } = await import('@/integrations/supabase/client');
  const { data, error } = await supabase.rpc('verify_employee_login_detailed', {
    p_username: username.trim(),
    p_password: password,
  });
  if (error) {
    const msg = (error.message || '').toLowerCase();
    if (msg.includes('permission') || msg.includes('denied')) {
      return { success: false, message: '数据库权限错误' };
    }
    return { success: false, message: error.message || '登录失败' };
  }
  const arr = Array.isArray(data) ? data : data ? [data] : [];
  const result = arr[0] as Record<string, unknown> | undefined;
  if (!result) return { success: false, message: '验证失败' };

  const errorCode = result.error_code as string | undefined;
  if (errorCode === 'USER_NOT_FOUND') return { success: false, message: '账号不存在' };
  if (errorCode === 'WRONG_PASSWORD') return { success: false, message: '密码错误' };
  if (errorCode === 'ACCOUNT_DISABLED') return { success: false, message: '账号已被禁用' };

  const emp = result as {
    employee_id: string; username: string; real_name: string;
    role: string; status: string; is_super_admin: boolean;
    is_platform_super_admin?: boolean; tenant_id?: string | null;
  };
  if (emp.status === 'pending') return { success: false, message: '账号正在等待审批' };
  if (emp.status !== 'active') return { success: false, message: '账号已被禁用' };

  const isPlatformSuperAdmin = emp.is_platform_super_admin ?? (emp.username === 'admin' && (emp.is_super_admin ?? false));
  const user: AuthUser = {
    id: emp.employee_id,
    username: emp.username,
    real_name: emp.real_name,
    role: emp.role,
    status: emp.status,
    is_super_admin: emp.is_super_admin ?? false,
    is_platform_super_admin: isPlatformSuperAdmin,
    tenant_id: isPlatformSuperAdmin ? null : (emp.tenant_id ?? null),
  };

  // 生成简易 token（base64 编码用户信息，非加密但足够前端使用）
  const payload = {
    sub: user.id, username: user.username, real_name: user.real_name,
    role: user.role, status: user.status, is_super_admin: user.is_super_admin,
    is_platform_super_admin: user.is_platform_super_admin,
    tenant_id: user.tenant_id, exp: Math.floor(Date.now() / 1000) + 7 * 86400,
  };
  const token = 'rpc.' + btoa(JSON.stringify(payload));
  setAuthToken(token);
  return { success: true, user };
}

/** 使用 Supabase Edge Function 登录（后端未部署时的备用） */
async function loginViaEdgeFunction(
  username: string,
  password: string
): Promise<{ success: boolean; user?: AuthUser; message?: string }> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return loginViaSupabaseRpc(username, password);
  }
  const url = `${SUPABASE_URL.replace(/\/$/, '')}/functions/v1/employee-login`;
  try {
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
      // Edge Function 不可用（404）或返回错误，回退到 RPC
      if (res.status === 404) return loginViaSupabaseRpc(username, password);
      return { success: false, message: data.error || '登录失败' };
    }
    setAuthToken(data.token);
    return { success: true, user: data.user };
  } catch {
    return loginViaSupabaseRpc(username, password);
  }
}

/**
 * 检测后端 API 是否可用（缓存结果）
 */
let _staffBackendAvailable: boolean | null = null;
async function isStaffBackendAvailable(): Promise<boolean> {
  if (_staffBackendAvailable !== null) return _staffBackendAvailable;
  try {
    const API_BASE = import.meta.env.VITE_API_BASE ?? '';
    const url = `${API_BASE}/api/auth/login`.replace(/([^:])\/\/+/g, '$1/');
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    const ct = res.headers.get('content-type') || '';
    _staffBackendAvailable = ct.includes('application/json');
  } catch {
    _staffBackendAvailable = false;
  }
  return _staffBackendAvailable;
}

/** 登录 */
export async function loginApi(
  username: string,
  password: string
): Promise<{ success: boolean; user?: AuthUser; message?: string }> {
  const backendOk = await isStaffBackendAvailable();

  if (backendOk) {
    try {
      const API_BASE = import.meta.env.VITE_API_BASE ?? '';
      const url = `${API_BASE}/api/auth/login`.replace(/([^:])\/\/+/g, '$1/');
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await response.json().catch(() => ({})) as LoginResponse & { error?: string };
      if (!response.ok || !data.success) {
        return { success: false, message: data.error || data.message || '登录失败' };
      }
      if (!data.token || !data.user) {
        return { success: false, message: '登录失败' };
      }
      setAuthToken(data.token);
      return { success: true, user: data.user };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, message: msg || '登录失败' };
    }
  }

  // 后端不可用，直接走 Edge Function
  try {
    return await loginViaEdgeFunction(username, password);
  } catch (e) {
    return { success: false, message: '登录失败，后端服务未部署，Edge Function 也不可用' };
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
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('api_access_token') : null;
  if (!token) return null;

  // 如果是 RPC 生成的 token，直接解析
  if (token.startsWith('rpc.')) {
    try {
      const payload = JSON.parse(atob(token.slice(4)));
      if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
      return {
        id: payload.sub, username: payload.username, real_name: payload.real_name,
        role: payload.role, status: payload.status,
        is_super_admin: payload.is_super_admin ?? false,
        is_platform_super_admin: payload.is_platform_super_admin ?? false,
        tenant_id: payload.tenant_id ?? null,
      };
    } catch { return null; }
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  try {
    const url = `${SUPABASE_URL.replace(/\/$/, '')}/functions/v1/employee-me`;
    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (res.status === 404) return null;
    const data = (await res.json().catch(() => ({}))) as MeResponse;
    return data.success && data.user ? data.user : null;
  } catch {
    return null;
  }
}

/** 获取当前用户信息 */
export async function getCurrentUserApi(): Promise<AuthUser | null> {
  const backendOk = await isStaffBackendAvailable();
  if (backendOk) {
    try {
      const res = await apiGet<MeResponse>('/api/auth/me');
      if (res.success && res.user) return res.user;
      return null;
    } catch {
      return null;
    }
  }
  return getMeViaEdgeFunction();
}
