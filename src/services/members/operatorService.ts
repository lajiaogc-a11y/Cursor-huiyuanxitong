// ============= Global Operator Service =============
// 提供全局操作员信息获取，避免依赖 localStorage
// 从后端 /me（JWT）获取用户信息
// 使用统一的 CacheManager 进行缓存管理

import { 
  getCache, 
  setCache, 
  clearCache, 
  CACHE_CONFIG, 
  CACHE_KEYS 
} from '@/services/cacheManager';
import { getCurrentUserApi } from '@/services/auth/authApiService';

export interface OperatorInfo {
  id: string | null;
  account: string;
  role: string;
  realName?: string;
}

// 异步获取当前操作员信息（通过 API）
export async function fetchCurrentOperator(): Promise<OperatorInfo> {
  const cached = getCache<OperatorInfo>(CACHE_KEYS.OPERATOR);
  if (cached) {
    return cached;
  }
  try {
    const authUser = await getCurrentUserApi();
    if (!authUser) {
      return { id: null, account: 'system', role: 'unknown' };
    }
    const operatorInfo: OperatorInfo = {
      id: authUser.id,
      account: authUser.username,
      role: authUser.role,
      realName: authUser.real_name,
    };
    setCache(CACHE_KEYS.OPERATOR, operatorInfo, CACHE_CONFIG.OPERATOR_TTL);
    return operatorInfo;
  } catch (error) {
    console.error('[OperatorService] Failed to fetch operator:', error);
    return { id: null, account: 'system', role: 'unknown' };
  }
}

// 同步获取（使用缓存，没有缓存则返回默认值）
export function getCurrentOperatorSync(): OperatorInfo {
  const cached = getCache<OperatorInfo>(CACHE_KEYS.OPERATOR);
  
  if (cached) {
    // 异步刷新缓存
    fetchCurrentOperator().catch(console.error);
    return cached;
  }
  
  // 触发异步获取
  fetchCurrentOperator().catch(console.error);
  
  return { id: null, account: 'system', role: 'unknown' };
}

// 设置操作员缓存（登录时调用）
export function setOperatorCache(operator: OperatorInfo): void {
  setCache(CACHE_KEYS.OPERATOR, operator, CACHE_CONFIG.OPERATOR_TTL);
}

// 清除操作员缓存（登出时调用）
export function clearOperatorCache(): void {
  clearCache(CACHE_KEYS.OPERATOR);
}
