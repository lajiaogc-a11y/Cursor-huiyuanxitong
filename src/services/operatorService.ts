// ============= Global Operator Service =============
// 提供全局操作员信息获取，避免依赖 localStorage
// 从 Supabase session 获取用户信息
// 使用统一的 CacheManager 进行缓存管理

import { supabase } from '@/integrations/supabase/client';
import { 
  getCache, 
  setCache, 
  clearCache, 
  CACHE_CONFIG, 
  CACHE_KEYS 
} from './cacheManager';

export interface OperatorInfo {
  id: string | null;
  account: string;
  role: string;
  realName?: string;
}

// 异步获取当前操作员信息
export async function fetchCurrentOperator(): Promise<OperatorInfo> {
  // 使用统一缓存
  const cached = getCache<OperatorInfo>(CACHE_KEYS.OPERATOR);
  if (cached) {
    return cached;
  }
  
  try {
    // 获取当前登录用户
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return { id: null, account: 'system', role: 'unknown' };
    }
    
    // 获取 profile 和 employee 信息
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('employee_id')
      .eq('id', user.id)
      .maybeSingle();
    
    if (profileError || !profile?.employee_id) {
      return { id: null, account: user.email || 'system', role: 'unknown' };
    }
    
    // 获取员工信息
    const { data: employee, error: empError } = await supabase
      .from('employees')
      .select('id, username, real_name, role')
      .eq('id', profile.employee_id)
      .single();
    
    if (empError || !employee) {
      return { id: null, account: user.email || 'system', role: 'unknown' };
    }
    
    const operatorInfo: OperatorInfo = {
      id: employee.id,
      account: employee.username,
      role: employee.role,
      realName: employee.real_name,
    };
    
    // 更新统一缓存
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
