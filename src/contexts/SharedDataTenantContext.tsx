/**
 * 共享数据租户上下文 - 为 sharedDataService 提供当前有效的 tenant_id
 * 平台查看租户时使用 viewingTenantId，否则使用员工所属 tenant_id
 */
import { useEffect, useRef, type ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useTenantView } from '@/contexts/TenantViewContext';
import { setSharedDataTenantId, clearSharedDataCacheForTenantSwitch } from '@/services/finance/sharedDataService';

export function SharedDataTenantProvider({ children }: { children: ReactNode }) {
  const { employee } = useAuth();
  const { viewingTenantId } = useTenantView() || {};
  const effectiveTenantId = viewingTenantId || employee?.tenant_id || null;
  const prevRef = useRef<string | null>(undefined as unknown as string | null);

  // 同步设置 tenant，确保子组件（含 data sync）能立即使用
  if (prevRef.current !== effectiveTenantId) {
    const wasSwitching = prevRef.current !== undefined;
    prevRef.current = effectiveTenantId;
    setSharedDataTenantId(effectiveTenantId);
    if (wasSwitching) clearSharedDataCacheForTenantSwitch();
  }

  return <>{children}</>;
}
