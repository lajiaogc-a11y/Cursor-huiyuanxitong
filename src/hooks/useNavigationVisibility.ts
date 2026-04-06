import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getRolePermissions } from '@/services/staff/dataApi';
import {
  resolvePermissionRole,
  DEFAULT_NAV_FALLBACK_KEYS,
} from '@/lib/permissionModels';

/** 路径前缀 → 侧栏 navKey（越长越优先匹配） */
const PATH_NAV_PREFIXES: { prefix: string; navKey: string }[] = [
  { prefix: '/staff/admin/tenants', navKey: 'platform_tenant_management' },
  { prefix: '/staff/admin/tenant-view', navKey: 'platform_tenant_view' },
  { prefix: '/staff/admin/settings', navKey: 'platform_settings' },
  { prefix: '/staff/member-promotion', navKey: 'member_promotion' },
  { prefix: '/staff/member-portal', navKey: 'member_portal_settings' },
  { prefix: '/staff/merchant-settlement', navKey: 'merchant_settlement' },
  { prefix: '/staff/merchant-settlement/', navKey: 'merchant_settlement' },
  { prefix: '/staff/exchange-rate', navKey: 'exchange_rate' },
  { prefix: '/staff/orders', navKey: 'orders' },
  { prefix: '/staff/members', navKey: 'members' },
  { prefix: '/staff/activity-reports', navKey: 'activity_reports' },
  { prefix: '/staff/reports', navKey: 'reports' },
  { prefix: '/staff/knowledge', navKey: 'knowledge_base' },
  { prefix: '/staff/tasks', navKey: 'work_tasks' },
  { prefix: '/staff/merchants', navKey: 'merchant_management' },
  { prefix: '/staff/audit-center', navKey: 'audit_center' },
  { prefix: '/staff/customer-query', navKey: 'customer_query' },
  { prefix: '/staff/employees', navKey: 'employees' },
  { prefix: '/staff/operation-logs', navKey: 'operation_logs' },
  { prefix: '/staff/login-logs', navKey: 'login_logs' },
  { prefix: '/staff/data-management', navKey: 'data_management' },
  { prefix: '/staff/settings', navKey: 'system_settings' },
];

export function pathToNavKey(path: string): string | null {
  const raw = path.split('?')[0] || path;
  const p = raw.replace(/\/+$/, '') || '/';
  if (p === '/staff') return 'dashboard';
  const sorted = [...PATH_NAV_PREFIXES].sort((a, b) => b.prefix.length - a.prefix.length);
  for (const { prefix, navKey } of sorted) {
    if (p === prefix || p.startsWith(`${prefix}/`)) return navKey;
  }
  return null;
}

export function useNavigationVisibility() {
  const { employee } = useAuth();
  const [navRows, setNavRows] = useState<{ field_name: string; can_view: boolean }[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!employee?.id) {
        setLoaded(true);
        return;
      }
      try {
        const all = await getRolePermissions();
        if (cancelled) return;
        const eff = resolvePermissionRole(employee);
        const rows = (all || [])
          .filter((p) => p.role === eff && p.module_name === 'navigation')
          .map((p) => ({ field_name: p.field_name || '', can_view: !!p.can_view }));
        setNavRows(rows);
      } catch {
        setNavRows([]);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employee?.id, employee?.role, employee?.is_super_admin]);

  const isNavKeyVisible = useCallback(
    (navKey: string) => {
      // 客户查询独立页已从导航移除（路由可保留供直达，菜单不展示）
      if (navKey === 'customer_query') {
        return false;
      }

      if (employee?.is_platform_super_admin) return true;
      const platformOnly = ['platform_tenant_management', 'platform_tenant_view', 'platform_settings'];
      if (!employee?.is_platform_super_admin && platformOnly.includes(navKey)) return false;

      if (!loaded) return false;

      const eff = resolvePermissionRole(employee);
      if ((eff === 'admin' || eff === 'super_admin') && navRows.length === 0) return true;

      const p = navRows.find(
        (r) =>
          r.field_name === navKey ||
          (navKey === 'exchange_rate' && r.field_name === 'exchangeRate'),
      );
      if (!p) return DEFAULT_NAV_FALLBACK_KEYS.has(navKey);
      return p.can_view;
    },
    [employee, loaded, navRows],
  );

  const isPathVisible = useCallback(
    (path: string) => {
      const key = pathToNavKey(path);
      if (!key) return true;
      return isNavKeyVisible(key);
    },
    [isNavKeyVisible],
  );

  return { isNavKeyVisible, isPathVisible, loaded };
}
