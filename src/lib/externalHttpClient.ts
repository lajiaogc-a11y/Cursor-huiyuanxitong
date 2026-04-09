/**
 * 外部 HTTP 请求封装 — 专用于访问第三方 API（非本系统后端）
 * 内部系统接口请继续使用 @/lib/apiClient
 */

export interface ExternalFetchOptions {
  signal?: AbortSignal;
  headers?: Record<string, string>;
  method?: 'GET' | 'POST';
  body?: string;
  cache?: RequestCache;
  timeoutMs?: number;
}

export class ExternalHttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ExternalHttpError';
  }
}

/**
 * 向第三方 API 发起 GET 请求，返回解析后的 JSON
 * @throws ExternalHttpError 当 HTTP 状态非 2xx 时
 */
export async function externalGet<T = unknown>(
  url: string,
  options: ExternalFetchOptions = {},
): Promise<T> {
  const { signal, headers, timeoutMs, cache } = options;
  const resolvedSignal = signal ?? (timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined);
  const res = await fetch(url, {
    method: 'GET',
    headers,
    signal: resolvedSignal,
    cache: cache ?? 'no-store',
  });
  if (!res.ok) throw new ExternalHttpError(res.status, `HTTP ${res.status} from ${url}`);
  return res.json() as Promise<T>;
}

/**
 * 向第三方 API 发起 POST 请求，返回解析后的 JSON
 */
export async function externalPost<T = unknown>(
  url: string,
  body: unknown,
  options: ExternalFetchOptions = {},
): Promise<T> {
  const { signal, timeoutMs, cache } = options;
  const resolvedSignal = signal ?? (timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(options.headers ?? {}) },
    body: JSON.stringify(body),
    signal: resolvedSignal,
    cache: cache ?? 'no-store',
  });
  if (!res.ok) throw new ExternalHttpError(res.status, `HTTP ${res.status} from ${url}`);
  return res.json() as Promise<T>;
}

/**
 * 带鉴权头的内部 API 请求（用于需要 Bearer token 但不走 apiClient 的场景）
 */
export async function internalAuthGet<T = unknown>(
  url: string,
  token: string | null,
  options: ExternalFetchOptions = {},
): Promise<T> {
  const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  return externalGet<T>(url, { ...options, headers: { ...headers, ...(options.headers ?? {}) } });
}
