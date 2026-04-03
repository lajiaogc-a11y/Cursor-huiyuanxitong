// ============= Unified Name Resolver Hook =============
// React Hook 包装器 - 提供响应式的名称解析功能
// 替代原有的 useNameResolvers 和 useMerchantNameResolver

import { useState, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getActivityTypesApi } from '@/services/staff/dataApi';
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
} from '@/services/members/nameResolver';

// 导出类型
export type { EmployeeInfo, ActivityTypeInfo, MerchantInfo };

// ============= 主 Hook =============

export function useNameResolver() {
  const [ready, setReady] = useState(isReady());
  const [, forceUpdate] = useState({});

  useEffect(() => {
    if (!isReady()) {
      initNameResolver().then(() => {
        setReady(true);
      }).catch(console.error);
    }

    let pending = false;
    let rafId: number | undefined;
    const unsubscribe = subscribe(() => {
      setReady(isReady());
      if (!pending) {
        pending = true;
        rafId = requestAnimationFrame(() => {
          pending = false;
          forceUpdate({});
        });
      }
    });

    return () => {
      unsubscribe();
      if (rafId !== undefined) cancelAnimationFrame(rafId);
    };
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
 * 兼容原 useNameResolvers — activity-type map 改用 React Query 缓存，避免每次 mount 重新拉取
 */
export function useNameResolvers() {
  const resolver = useNameResolver();

  const { data: activityTypeMap = new Map<string, { value: string; label: string; isActive: boolean }>() } = useQuery({
    queryKey: ['name-resolver-activity-types'],
    queryFn: async () => {
      const data = await getActivityTypesApi();
      const map = new Map<string, { value: string; label: string; isActive: boolean }>();
      data.forEach(type => {
        map.set(type.value, {
          value: type.value,
          label: type.label,
          isActive: type.is_active ?? true,
        });
      });
      return map;
    },
  });

  return {
    loading: !resolver.ready,
    resolveEmployeeName: resolver.resolveEmployeeName,
    resolveActivityTypeLabel: resolver.resolveActivityTypeLabel,
    resolveVendorName,
    resolveCardName,
    resolvePaymentProviderName: resolveProviderName,
    refresh: resolver.refresh,
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
} from '@/services/members/nameResolver';

