/**
 * Auth API Service - 通过 Backend API 进行认证
 * 替代 supabase.auth
 */
import { apiGet, apiPost } from '@/api/client';
import { ApiError } from '@/lib/apiClient';
import { setAuthToken, clearAuthToken, clearMemberAccessToken } from '@/api/client';

function _t(zh: string, en: string): string {
  return (typeof localStorage !== 'undefined' && localStorage.getItem('appLanguage') === 'en') ? en : zh;
}

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

/** 登录 */
export async function loginApi(
  username: string,
  password: string,
  deviceId?: string | null
): Promise<{ success: boolean; user?: AuthUser; message?: string }> {
  try {
    const body: Record<string, string> = {
      username: username.trim(),
      password,
    };
    if (deviceId?.trim()) body.device_id = deviceId.trim();
    const res = await apiPost<LoginResponse>('/api/auth/login', body);
    if (!res.success || !res.token || !res.user) {
      return { success: false, message: (res as { error?: string }).error || _t('登录失败', 'Login failed') };
    }
    clearMemberAccessToken();
    setAuthToken(res.token);
    return { success: true, user: res.user };
  } catch (err: unknown) {
    if (err instanceof ApiError && err.statusCode === 403 && err.code === 'DEVICE_NOT_AUTHORIZED') {
      return { success: false, message: `DEVICE_NOT_AUTHORIZED: ${err.message}` };
    }
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('ECONNREFUSED') || msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
      return { success: false, message: _t('无法连接后端服务，请先启动：cd server && npm run dev', 'Cannot connect to backend service. Please start it: cd server && npm run dev') };
    }
    return { success: false, message: msg || _t('登录失败', 'Login failed') };
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
  clearMemberAccessToken();
  localStorage.removeItem('supabase_access_token'); // 历史键，清理旧会话
  _cachedPlatformTenantId = null;
}

/** 从 /me 或兼容形态中解析用户，保证字段齐全，避免前端 undefined 崩溃 */
function parseMeResponsePayload(raw: unknown): AuthUser | null {
  if (raw == null || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (o.success === false) return null;
  const u = (o.user ?? (o as { data?: unknown }).data) as Record<string, unknown> | undefined;
  if (!u || typeof u !== 'object') return null;
  const id = String(u.id ?? '');
  if (!id) return null;
  return {
    id,
    username: String(u.username ?? ''),
    real_name: String(u.real_name ?? u.username ?? ''),
    role: String(u.role ?? 'staff'),
    status: String(u.status ?? 'active'),
    is_super_admin: !!u.is_super_admin,
    is_platform_super_admin: !!u.is_platform_super_admin,
    tenant_id:
      u.tenant_id === undefined || u.tenant_id === null || u.tenant_id === ''
        ? null
        : String(u.tenant_id),
  };
}

/** /me 返回的 platform_tenant_id 缓存（仅平台超管有此字段） */
let _cachedPlatformTenantId: string | null = null;

/** 获取后端下发的平台租户 ID（首次从 /me 获取后缓存） */
export function getPlatformTenantId(): string | null {
  return _cachedPlatformTenantId;
}

/** 获取当前用户信息 */
export async function getCurrentUserApi(): Promise<AuthUser | null> {
  try {
    const raw = await apiGet<unknown>('/api/auth/me');
    if (raw && typeof raw === 'object') {
      const ptid = (raw as Record<string, unknown>).platform_tenant_id;
      _cachedPlatformTenantId = (typeof ptid === 'string' && ptid) ? ptid : null;
    }
    return parseMeResponsePayload(raw);
  } catch {
    return null;
  }
}
