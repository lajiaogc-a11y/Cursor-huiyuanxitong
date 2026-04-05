/**
 * Auth API Service - 通过 Backend API 进行认证（JWT）
 */
import { apiGet, apiPost } from '@/api/client';
import { ApiError } from '@/lib/apiClient';
import { setAuthToken, clearAuthToken, clearMemberAccessToken } from '@/api/client';
import { pickBilingual } from '@/lib/appLocale';

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
      return { success: false, message: (res as { error?: string }).error || pickBilingual('登录失败', 'Login failed') };
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
      return { success: false, message: pickBilingual('无法连接后端服务，请先启动：cd server && npm run dev', 'Cannot connect to backend service. Please start it: cd server && npm run dev') };
    }
    return { success: false, message: msg || pickBilingual('登录失败', 'Login failed') };
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

/** 校验当前登录员工的密码（/api/auth/verify-password，与 /api/admin/verify-password 不同） */
export async function verifyAuthPasswordApi(password: string): Promise<{ success?: boolean; valid?: boolean }> {
  return apiPost<{ success?: boolean; valid?: boolean }>('/api/auth/verify-password', { password });
}

export interface RegisterStaffPayload {
  username: string;
  password: string;
  realName: string;
  invitationCode?: string;
}

export interface RegisterStaffResponse {
  success: boolean;
  error_code?: string;
  assigned_status?: string;
  message?: string;
}

/** 员工注册（公开页，可无 JWT） */
export async function registerStaffApi(payload: RegisterStaffPayload): Promise<RegisterStaffResponse> {
  return apiPost<RegisterStaffResponse>('/api/auth/register', {
    username: payload.username,
    password: payload.password,
    realName: payload.realName,
    invitationCode: payload.invitationCode,
  });
}

/** 任意已登录员工可调用，校验当前 JWT 对应账号密码（非 /api/admin/verify-password） */
export async function verifyCurrentUserPasswordApi(password: string): Promise<boolean> {
  const res = await apiPost<{ success?: boolean; valid?: boolean }>('/api/auth/verify-password', { password });
  return (res as { valid?: boolean })?.valid === true;
}

export type VerifyEmployeeLoginDetailedRow = { verified?: boolean; error_code?: string };

/** RPC：校验员工登录（详细错误码），用于敏感操作前二次确认 */
export async function verifyEmployeeLoginDetailedApi(
  username: string,
  password: string,
): Promise<VerifyEmployeeLoginDetailedRow | null> {
  const data = await apiPost<
    VerifyEmployeeLoginDetailedRow[] | VerifyEmployeeLoginDetailedRow
  >('/api/data/rpc/verify_employee_login_detailed', {
    p_username: username,
    p_password: password,
  });
  const row = Array.isArray(data) ? data[0] : data;
  return row && typeof row === 'object' ? row : null;
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
