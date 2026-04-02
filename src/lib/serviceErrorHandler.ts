/**
 * Service 层统一错误处理工具
 *
 * - safeCall: 包装异步函数，捕获异常返回 fallback 值，同时打印日志
 * - safeActionCall: 包装返回 {success, error?} 形态的异步操作，网络异常时返回标准化失败
 */

const LOG_PREFIX = "[service]";

export async function safeCall<T>(
  fn: () => Promise<T>,
  fallback: T,
  label?: string,
): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    console.error(`${LOG_PREFIX}${label ? ` ${label}` : ""}`, e);
    return fallback;
  }
}

export async function safeActionCall<T extends { success: boolean; error?: string }>(
  fn: () => Promise<T>,
  label?: string,
): Promise<T> {
  try {
    return await fn();
  } catch (e: any) {
    console.error(`${LOG_PREFIX}${label ? ` ${label}` : ""}`, e);
    const msg =
      e?.statusCode === 429
        ? "RATE_LIMIT"
        : e?.message || "NETWORK_ERROR";
    return { success: false, error: msg } as T;
  }
}
