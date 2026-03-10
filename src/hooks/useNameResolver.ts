// ============= Unified Name Resolver Hook =============
// React Hook 包装器 - 提供响应式的名称解析功能
// 替代原有的 useNameResolvers 和 useMerchantNameResolver

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  initNameResolver,
  isReady,
  subscribe,
  refreshAll,
  refreshMerchants,
  // 解析函数
  getEmployeeNameById,
  getEmployeeById,
  getActivityTypeLabelByValue,
  resolveCardName,
  resolveVendorName,
  resolveProviderName,
  // ID 获取函数
  getCardIdByName,
  getVendorId,
  getProviderId,
  // 类型
  EmployeeInfo,
  ActivityTypeInfo,
  MerchantInfo,
} from '@/services/nameResolver';

// 导出类型
export type { EmployeeInfo, ActivityTypeInfo, MerchantInfo };

// ============= 主 Hook =============

export function useNameResolver() {
  const [ready, setReady] = useState(isReady());
  const [, forceUpdate] = useState({});

  useEffect(() => {
    // 初始化
    if (!isReady()) {
      initNameResolver().then(() => {
        setReady(true);
      }).catch(console.error);
    }

    // 订阅数据变更
    const unsubscribe = subscribe(() => {
      setReady(isReady());
      forceUpdate({});
    });

    return unsubscribe;
  }, []);

  // 使用 useCallback 包装解析函数以保持引用稳定
  const resolveEmployeeName = useCallback((id: string | null | undefined) => 
    getEmployeeNameById(id), []);
  
  const resolveActivityTypeLabel = useCallback((value: string | null | undefined) => 
    getActivityTypeLabelByValue(value), []);

  return {
    ready,
    loading: !ready,
    // 解析函数
    resolveEmployeeName,
    resolveActivityTypeLabel,
    resolveCardName,
    resolveVendorName,
    resolveProviderName,
    // ID 获取函数
    getCardIdByName,
    getCardId: getCardIdByName,
    getVendorId,
    getProviderId,
    // 员工信息获取
    getEmployeeById,
    getEmployeeNameById,
    // 刷新函数
    refresh: refreshAll,
    refreshMerchants,
  };
}

// ============= 兼容性 Hooks =============

/**
 * 兼容原 useMerchantNameResolver
 */
export function useMerchantNameResolver() {
  const resolver = useNameResolver();
  
  return {
    ready: resolver.ready,
    resolveCardName,
    resolveVendorName,
    resolveProviderName,
    getCardId: getCardIdByName,
    getCardIdByName,
    getVendorId,
    getProviderId,
    refresh: resolver.refreshMerchants,
  };
}

/**
 * 兼容原 useNameResolvers
 */
export function useNameResolvers() {
  const resolver = useNameResolver();
  
  // 获取活动类型Map - 从服务层导入
  const [activityTypeMap, setActivityTypeMap] = useState<Map<string, { value: string; label: string; isActive: boolean }>>(new Map());
  
  useEffect(() => {
    const loadActivityTypes = async () => {
      const { data, error } = await supabase
        .from('activity_types')
        .select('id, value, label, is_active')
        .order('sort_order', { ascending: true });
      
      if (!error && data) {
        const map = new Map<string, { value: string; label: string; isActive: boolean }>();
        data.forEach(type => {
          map.set(type.value, {
            value: type.value,
            label: type.label,
            isActive: type.is_active ?? true,
          });
        });
        setActivityTypeMap(map);
      }
    };
    
    loadActivityTypes();
    
    // 订阅活动类型变更
    const channel = supabase
      .channel('activity-types-resolver')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'activity_types' }, () => {
        loadActivityTypes();
      })
      .subscribe();
    
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);
  
  return {
    loading: !resolver.ready,
    resolveEmployeeName: resolver.resolveEmployeeName,
    resolveActivityTypeLabel: resolver.resolveActivityTypeLabel,
    resolveVendorName,
    resolveCardName,
    resolvePaymentProviderName: resolveProviderName,
    refresh: resolver.refresh,
    // 暴露 Map 以便直接访问
    employeeMap: new Map(),
    activityTypeMap,
    vendorMap: new Map(),
    cardMap: new Map(),
    providerMap: new Map(),
  };
}

// ============= 导出服务层函数（方便直接使用）=============

export {
  initNameResolver,
  getEmployeeNameById,
  getEmployeeById,
  getActivityTypeLabelByValue,
  resolveCardName,
  resolveVendorName,
  resolveProviderName,
  getCardIdByName,
  getVendorId,
  getProviderId,
  refreshAll as refreshNameResolvers,
} from '@/services/nameResolver';

// 兼容性别名
export { 
  initNameResolver as initMerchantNameResolver,
  initNameResolver as initializeAllNameResolvers,
  resolveProviderName as getPaymentProviderNameById,
} from '@/services/nameResolver';
