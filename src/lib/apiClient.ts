/**
 * 统一 API 请求入口
 * - JWT token 自动注入 Authorization
 * - 统一返回结构 { success, data } | { success, code, message }
 * - 统一 error handler
 */

import {
  isPublicMemberOnboardingPath,
  isStaffOnlyAuthPath,
  isMemberScopedApiPath,
  isMemberTokenFirstApiPath,
  shouldPreferMemberToken,
} from '@/lib/memberTokenPathMatrix';
import { getApiBaseUrl } from '@/lib/apiBase';
import { getSpaPathname } from '@/lib/spaNavigation';

/** 员工端 JWT localStorage 键（与后端 Bearer 解析一致） */
export const API_ACCESS_TOKEN_KEY = 'api_access_token' as const;
/** 会员端 JWT（/api/member-auth/* 除 signin 外使用，避免带上员工 token 导致 401 触发全局登出） */
export const MEMBER_ACCESS_TOKEN_KEY = 'member_access_token' as const;

// ============ 类型定义 ============

export interface ApiSuccess<T> {
  success: true;
  data: T;
}

export interface ApiFailure {
  success: false;
  code: string;
  message: string;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public code: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// ============ Token 管理 ============

export function setAuthToken(token: string): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(API_ACCESS_TOKEN_KEY, token);
  }
}

export function clearAuthToken(): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(API_ACCESS_TOKEN_KEY);
  }
}

export function hasAuthToken(): boolean {
  if (typeof localStorage !== 'undefined') {
    return !!localStorage.getItem(API_ACCESS_TOKEN_KEY);
  }
  return false;
}

/** 直连 fetch（如 /api/data/*）时使用：优先员工 token，否则会员 token */
export function getBearerTokenStaffThenMember(): string {
  if (typeof localStorage === 'undefined') return '';
  return (
    localStorage.getItem(API_ACCESS_TOKEN_KEY) ||
    localStorage.getItem(MEMBER_ACCESS_TOKEN_KEY) ||
    ''
  );
}

export function setMemberAccessToken(token: string): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(MEMBER_ACCESS_TOKEN_KEY, token);
  }
}

export function clearMemberAccessToken(): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(MEMBER_ACCESS_TOKEN_KEY);
  }
}

/** 根据请求 path 与当前路由解析 Bearer（Supabase 代理与 apiClient 共用） */
export function resolveBearerTokenForPath(path: string): string | null {
  if (typeof localStorage === 'undefined') return null;
  /** 员工登录态接口：勿在会员端误带会员 JWT（会 401 并曾触发全局清会员态） */
  if (isStaffOnlyAuthPath(path)) {
    return localStorage.getItem(API_ACCESS_TOKEN_KEY);
  }
  const loc = typeof window !== 'undefined' ? getSpaPathname() : '';

  /** 公开 onboarding：只带会员 token，不带员工 token */
  if (isPublicMemberOnboardingPath(path)) {
    return localStorage.getItem(MEMBER_ACCESS_TOKEN_KEY);
  }

  if (shouldPreferMemberToken(path, loc)) {
    const m = localStorage.getItem(MEMBER_ACCESS_TOKEN_KEY);
    if (m) return m;
  }
  const staff = localStorage.getItem(API_ACCESS_TOKEN_KEY);
  if (staff) return staff;
  // Only fall back to member token for known member API paths, not arbitrary requests
  if (isMemberScopedApiPath(path) || isMemberTokenFirstApiPath(path)) {
    return localStorage.getItem(MEMBER_ACCESS_TOKEN_KEY);
  }
  return null;
}

async function getAuthHeaders(path: string): Promise<HeadersInit> {
  const token = resolveBearerTokenForPath(path);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

/** 仅员工 JWT（不受当前 pathname 会员域影响）。用于 user_data_store 等仅员工可访问的 table 代理。 */
async function getStaffOnlyAuthHeaders(): Promise<HeadersInit> {
  const token =
    typeof localStorage !== 'undefined' ? localStorage.getItem(API_ACCESS_TOKEN_KEY) : null;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

// ============ 全局错误回调 ============

let onUnauthorized: (() => void) | null = null;
/** 会员 JWT 因其它设备登录而失效（与「未登录」区分） */
let onMemberSessionReplaced: (() => void) | null = null;
let onForbidden: (() => void) | null = null;
let onServerError: ((message: string) => void) | null = null;

export function setOnUnauthorized(handler: () => void): void {
  onUnauthorized = handler;
}

export function setOnMemberSessionReplaced(handler: (() => void) | null): void {
  onMemberSessionReplaced = handler;
}

export function setOnForbidden(handler: () => void): void {
  onForbidden = handler;
}

export function setOnServerError(handler: (message: string) => void): void {
  onServerError = handler;
}

// ============ 响应解析 ============

function parseApiResponse<T>(body: unknown): ApiResponse<T> | null {
  const b = body as Record<string, unknown>;
  if (!b || typeof b !== 'object') return null;
  if (b.success === true && 'data' in b) {
    return { success: true, data: b.data as T };
  }
  if (b.success === false && 'code' in b && 'message' in b) {
    return { success: false, code: String(b.code), message: String(b.message) };
  }
  if (b.success === false || typeof b.error !== 'undefined') {
    const err = b.error;
    const code = (err && typeof err === 'object' && 'code' in err) ? String((err as { code: string }).code) : 'UNKNOWN';
    const message = typeof err === 'string' ? err : (err && typeof err === 'object' && 'message' in err) ? String((err as { message: string }).message) : '请求失败';
    return { success: false, code, message };
  }
  return null;
}

/** Nginx/反代在上游 Node 不可用时常返回 502/503/504，body 非 JSON，浏览器 statusText 为英文「Bad Gateway」等 */
const PROXY_GATEWAY_MESSAGES: Record<number, string> = {
  502:
    '服务暂时不可用（网关无法连接后端），常见于发布重启或进程异常，请稍后重试；若持续出现请检查服务器 PM2/Nginx。',
  503: '服务暂时过载或维护中，请稍后重试。',
  504: '网关等待上游超时，请稍后重试。',
};

function handleResponseError(res: Response, body: unknown, requestPath: string): never {
  const parsed = parseApiResponse<never>(body);
  const structuredFailure = !!(parsed && !parsed.success);
  let message = `请求失败 (HTTP ${res.status})`;
  let code = 'UNKNOWN';
  if (structuredFailure) {
    message = parsed!.message;
    code = parsed!.code;
  } else {
    const b = body as { error?: string | { code?: string; message?: string } };
    message = typeof b?.error === 'string' ? b.error : (b?.error && typeof b.error === 'object' && b.error.message) || res.statusText || message;
    code = (b?.error && typeof b.error === 'object' && b.error.code) || code;
  }
  if (!structuredFailure && (res.status === 502 || res.status === 503 || res.status === 504)) {
    const hint = PROXY_GATEWAY_MESSAGES[res.status];
    if (hint) message = hint;
  }
  if (res.status >= 500 && (!message || message === 'Internal Server Error' || message === '服务器错误')) {
    message = '服务器异常，请检查后端配置或联系管理员';
  }
  if (res.status === 401) {
    const loc = typeof window !== 'undefined' ? getSpaPathname() : '';
    const onMemberRealm =
      loc.startsWith('/member') || loc.startsWith('/invite/') || loc === '/invite' || loc === '/';
    const staffAuthPath = requestPath.startsWith('/api/auth/');
    /** 会员登录失败（错密等）返回 401 是预期结果，勿触发全局登出/跳转 */
    const isMemberSignInFailure = requestPath === '/api/member-auth/signin';
    /** 平台管理接口必须用员工 JWT；401 一律走登出/回登录（不受「当前在 / 会员根路径」误判影响） */
    const isPlatformStaffApi = requestPath.startsWith('/api/platform/');
    if (code === 'MEMBER_SESSION_REPLACED') {
      onMemberSessionReplaced?.();
    } else if (isPlatformStaffApi && !isMemberSignInFailure) {
      onUnauthorized?.();
    } else if (!isMemberSignInFailure && !(onMemberRealm && staffAuthPath)) {
      onUnauthorized?.();
    }
    throw new ApiError(message || '未登录', 401, code);
  }
  if (res.status === 403) {
    // 会员 JWT 禁止扫 /api/data/table/*（tableProxy blockMemberTableProxy），此处 403 为预期行为；
    // 若仍调全局 onForbidden，会导致会员端频繁误报「权限不足」（如 nameResolver 回退表代理）。
    const loc = typeof window !== 'undefined' ? getSpaPathname() : '';
    const memberRealm =
      loc.startsWith('/member') || loc.startsWith('/invite/') || loc === '/invite' || loc === '/';
    const bodyStr =
      body && typeof body === 'object' ? JSON.stringify(body) : '';
    const msgLower = String(message || '').toLowerCase();
    const suppressMemberTable403 =
      memberRealm &&
      (requestPath.startsWith('/api/data/table/') ||
        bodyStr.includes('MEMBER_TABLE_PROXY_FORBIDDEN') ||
        msgLower.includes('member jwt cannot access table proxy'));
    const suppressStaffLoginDevice403 =
      requestPath === '/api/auth/login' && code === 'DEVICE_NOT_AUTHORIZED';
    const suppressMemberForcedPassword403 =
      memberRealm && code === 'MEMBER_MUST_CHANGE_PASSWORD';
    if (suppressMemberForcedPassword403) {
      try {
        window.dispatchEvent(new CustomEvent('member:must-change-password'));
      } catch {
        /* ignore */
      }
    }
    if (!suppressMemberTable403 && !suppressStaffLoginDevice403 && !suppressMemberForcedPassword403) {
      onForbidden?.();
    }
    throw new ApiError(message || '权限不足', 403, code);
  }
  if (res.status >= 500) {
    onServerError?.(message);
    throw new ApiError(message || '服务器错误', res.status, code);
  }
  throw new ApiError(message, res.status, code);
}

// ============ Token 自动刷新 ============

let refreshPromise: Promise<boolean> | null = null;

/**
 * 尝试用当前 token 刷新。返回 true 表示刷新成功（token 已更新）。
 * 使用单例 promise 防止并发请求同时触发多次刷新。
 */
async function tryRefreshToken(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    try {
      const currentToken = typeof localStorage !== 'undefined'
        ? localStorage.getItem(API_ACCESS_TOKEN_KEY)
        : null;
      if (!currentToken) return false;

      const url = `${getApiBaseUrl()}/api/auth/refresh`.replace(/([^:])\/\/+/g, '$1/');
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: currentToken }),
      });
      if (!res.ok) return false;
      const data = await res.json().catch(() => null);
      if (data?.success && data.token) {
        setAuthToken(data.token);
        return true;
      }
      return false;
    } catch {
      return false;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

// ============ 核心请求方法 ============

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

const GET_RETRY_ON_UPSTREAM_MS = 900;

type RequestAuthMode = 'path' | 'staff-only';

/** Optional fields merged into fetch RequestInit (e.g. `cache: 'no-store'` for dynamic GETs). */
export type ApiFetchInit = Pick<RequestInit, 'cache'>;

async function request<T>(
  method: HttpMethod,
  path: string,
  body?: unknown,
  upstreamRetry = 0,
  _refreshRetried = false,
  authMode: RequestAuthMode = 'path',
  fetchInit?: ApiFetchInit,
): Promise<T> {
  const url = `${getApiBaseUrl()}${path}`.replace(/([^:])\/\/+/g, '$1/');
  const options: RequestInit = {
    method,
    headers:
      authMode === 'staff-only' ? await getStaffOnlyAuthHeaders() : await getAuthHeaders(path),
    ...fetchInit,
    /** 避免浏览器 HTTP 缓存把动态 API GET 当成静态资源，导致刷新/多标签数据陈旧 */
    cache: fetchInit?.cache ?? 'no-store',
  };
  if (body !== undefined && method !== 'GET') {
    options.body = JSON.stringify(body);
  }
  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // ── 自动刷新 token：401 且非 refresh 端点、未重试过 ──
    if (
      res.status === 401 &&
      !_refreshRetried &&
      !path.includes('/auth/refresh') &&
      typeof localStorage !== 'undefined' &&
      !!localStorage.getItem(API_ACCESS_TOKEN_KEY)
    ) {
      const refreshed = await tryRefreshToken();
      if (refreshed) {
        return request<T>(method, path, body, upstreamRetry, true, authMode, fetchInit);
      }
    }
    const retryUpstream =
      method === 'GET' &&
      upstreamRetry === 0 &&
      (res.status === 502 || res.status === 503);
    if (retryUpstream) {
      await new Promise((r) => setTimeout(r, GET_RETRY_ON_UPSTREAM_MS));
      return request<T>(method, path, body, 1, false, authMode, fetchInit);
    }
    handleResponseError(res, data, path);
  }
  // 成功时：优先返回 data 字段，兼容直接返回 body 的接口
  const parsed = parseApiResponse<T>(data);
  if (parsed?.success) {
    return parsed.data;
  }
  if (data && typeof data === 'object' && 'data' in data) {
    return data.data as T;
  }
  return data as T;
}

export const apiClient = {
  get: <T>(path: string, fetchInit?: ApiFetchInit) =>
    request<T>('GET', path, undefined, 0, false, 'path', fetchInit),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  delete: <T>(path: string, body?: unknown) => request<T>('DELETE', path, body),
  /** 始终带员工 JWT，避免在 /member 路由下误用会员 JWT 请求 table 代理 */
  getAsStaff: <T>(path: string, fetchInit?: ApiFetchInit) =>
    request<T>('GET', path, undefined, 0, false, 'staff-only', fetchInit),
  postAsStaff: <T>(path: string, body?: unknown) => request<T>('POST', path, body, 0, false, 'staff-only'),
  putAsStaff: <T>(path: string, body?: unknown) => request<T>('PUT', path, body, 0, false, 'staff-only'),
  patchAsStaff: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body, 0, false, 'staff-only'),
  deleteAsStaff: <T>(path: string) => request<T>('DELETE', path, undefined, 0, false, 'staff-only'),
};
