/**
 * 统一 API 请求入口
 * - JWT token 自动注入 Authorization
 * - 统一返回结构 { success, data } | { success, code, message }
 * - 统一 error handler
 */

const API_BASE = import.meta.env.VITE_API_BASE ?? '';
const AUTH_TOKEN_KEY = 'api_access_token';

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
    localStorage.setItem(AUTH_TOKEN_KEY, token);
  }
}

export function clearAuthToken(): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(AUTH_TOKEN_KEY);
  }
}

export function hasAuthToken(): boolean {
  if (typeof localStorage !== 'undefined') {
    return !!localStorage.getItem(AUTH_TOKEN_KEY);
  }
  return false;
}

async function getAuthHeaders(): Promise<HeadersInit> {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem(AUTH_TOKEN_KEY) : null;
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
let onForbidden: (() => void) | null = null;
let onServerError: ((message: string) => void) | null = null;

export function setOnUnauthorized(handler: () => void): void {
  onUnauthorized = handler;
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
  // 兼容旧格式 { success: false, error: "xxx" } 或 { error: { code, message } }
  if (b.success === false || typeof b.error !== 'undefined') {
    const err = b.error;
    const code = (err && typeof err === 'object' && 'code' in err) ? String((err as { code: string }).code) : 'UNKNOWN';
    const message = typeof err === 'string' ? err : (err && typeof err === 'object' && 'message' in err) ? String((err as { message: string }).message) : '请求失败';
    return { success: false, code, message };
  }
  return null;
}

function handleResponseError(res: Response, body: unknown): never {
  const parsed = parseApiResponse<never>(body);
  let message = res.status === 404 ? '接口不存在，请确认后端服务已正确部署' : '请求失败';
  let code = 'UNKNOWN';
  if (parsed && !parsed.success) {
    message = parsed.message;
    code = parsed.code;
  } else {
    const b = body as { error?: string | { code?: string; message?: string } };
    message = typeof b?.error === 'string' ? b.error : (b?.error && typeof b.error === 'object' && b.error.message) || res.statusText || message;
    code = (b?.error && typeof b.error === 'object' && b.error.code) || code;
  }
  if (res.status >= 500 && (!message || message === 'Internal Server Error' || message === '服务器错误')) {
    message = '服务器异常，请检查后端配置或联系管理员';
  }
  if (res.status === 401) {
    onUnauthorized?.();
    throw new ApiError(message || '未登录', 401, code);
  }
  if (res.status === 403) {
    onForbidden?.();
    throw new ApiError(message || '权限不足', 403, code);
  }
  if (res.status >= 500) {
    onServerError?.(message);
    throw new ApiError(message || '服务器错误', res.status, code);
  }
  throw new ApiError(message, res.status, code);
}

// ============ 核心请求方法 ============

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

async function request<T>(method: HttpMethod, path: string, body?: unknown): Promise<T> {
  const url = `${API_BASE}${path}`.replace(/([^:])\/\/+/g, '$1/');
  const options: RequestInit = {
    method,
    headers: await getAuthHeaders(),
  };
  if (body !== undefined && method !== 'GET') {
    options.body = JSON.stringify(body);
  }
  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    handleResponseError(res, data);
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
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  delete: <T>(path: string, body?: unknown) => request<T>('DELETE', path, body),
};
