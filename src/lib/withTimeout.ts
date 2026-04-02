/**
 * 为 Promise 或 PromiseLike 添加超时兜底
 * 如果 Promise 在指定时间内没有完成，则抛出超时错误
 */
export function withTimeout<T>(
  promiseLike: Promise<T> | PromiseLike<T>,
  ms: number,
  timeoutMessage = '请求超时'
): Promise<T> {
  // 确保转换为真正的 Promise
  const promise = Promise.resolve(promiseLike);
  
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(timeoutMessage)), ms)
    ),
  ]);
}

/**
 * 超时时间常量
 * 考虑到不同网络环境（跨境、移动网络等），适当增加超时时间
 */
export const TIMEOUT = {
  RPC: 20000,       // RPC 调用 20 秒（考虑跨境网络）
  AUTH: 25000,      // 认证操作 25 秒
  PROFILE: 15000,   // 资料操作 15 秒
  HEALTH: 8000,     // 健康检查 8 秒
} as const;

/**
 * 错误消息映射（双语）
 */
export const AUTH_ERROR_MESSAGES: Record<string, { zh: string; en: string }> = {
  'USER_NOT_FOUND': { 
    zh: '账号不存在，请检查用户名或去注册', 
    en: 'Account not found, please check your username or sign up' 
  },
  'WRONG_PASSWORD': { 
    zh: '密码错误，请重新输入', 
    en: 'Incorrect password, please try again' 
  },
  'ACCOUNT_DISABLED': { 
    zh: '账号已被禁用，请联系管理员', 
    en: 'Account is disabled, please contact an administrator' 
  },
  'USERNAME_EXISTS': { 
    zh: '用户名已存在，请使用其他用户名', 
    en: 'Username already exists, please use a different one' 
  },
  'NETWORK_ERROR': { 
    zh: '网络连接失败，请检查网络后重试', 
    en: 'Network connection failed, please check your connection and try again' 
  },
  'TIMEOUT': { 
    zh: '连接超时，请检查网络后重试', 
    en: 'Connection timeout, please check your network and try again' 
  },
  'UNKNOWN': { 
    zh: '操作失败，请稍后重试', 
    en: 'Operation failed, please try again later' 
  },
};

/**
 * 获取本地化认证错误消息
 */
export function getAuthErrorMessage(code: string, lang: 'zh' | 'en' = 'zh'): string {
  return AUTH_ERROR_MESSAGES[code]?.[lang] || AUTH_ERROR_MESSAGES['UNKNOWN'][lang];
}
