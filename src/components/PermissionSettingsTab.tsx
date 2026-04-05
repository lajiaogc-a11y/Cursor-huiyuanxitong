import { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Shield, Save, ChevronDown, ChevronRight, Wand2, Loader2 } from 'lucide-react';
import { useIsMobile, useIsTablet } from '@/hooks/use-mobile';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { notify } from "@/lib/notifyHub";
import { useLanguage } from '@/contexts/LanguageContext';
import { listRolePermissionsByModuleOrder } from '@/services/staff/rolePermissionsTableService';
import { saveRolePermissions } from '@/services/staff/dataApi/permissionsAndSettings';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { NAVIGATION_FIELD_DEFS, type PermissionRole } from '@/lib/permissionModels';

interface RolePermission {
  id: string;
  role: PermissionRole;
  module_name: string;
  field_name: string;
  can_view: boolean;
  can_edit: boolean;
  can_delete: boolean;
}

function permBool(v: unknown): boolean {
  if (typeof v === 'boolean') return v;
  if (v === 1 || v === '1') return true;
  return false;
}

function getPermission(
  permissions: RolePermission[],
  role: PermissionRole,
  module: string,
  field: string,
): RolePermission | undefined {
  return permissions.find((p) => p.role === role && p.module_name === module && p.field_name === field);
}

const QUICK_TEMPLATES = [
  {
    label_zh: '全部可见',
    label_en: 'Show all',
    settings: { nav: true, dashOwn: true },
  },
  {
    label_zh: '业务常用',
    label_en: 'Business default',
    settings: { nav: 'business' as const, dashOwn: true },
  },
  {
    label_zh: '仅统计+订单',
    label_en: 'Stats + orders only',
    settings: { nav: 'minimal' as const, dashOwn: true },
  },
];

export default function PermissionSettingsTab() {
  const { t } = useLanguage();
  const { employee, refreshPermissions } = useAuth();

  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  const useCompactLayout = isMobile || isTablet;
  const [permissions, setPermissions] = useState<RolePermission[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [selectedRole, setSelectedRole] = useState<PermissionRole>('staff');
  const [expanded, setExpanded] = useState({ nav: true, dash: true });

  const fetchPermissions = useCallback(async () => {
    try {
      const data = await listRolePermissionsByModuleOrder();
      const typedData = (Array.isArray(data) ? data : []).map((r: Record<string, unknown>) => ({
        ...(r as RolePermission),
        role: String(r.role || '') as PermissionRole,
        can_view: permBool(r.can_view),
        can_edit: permBool(r.can_edit),
        can_delete: permBool(r.can_delete),
      })) as RolePermission[];
      setPermissions(typedData);
    } catch (error) {
      console.error('Failed to fetch permissions:', error);
      notify.error(t('加载权限设置失败', 'Failed to load permissions'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const canAccessPermissionSettings =
    employee?.role === 'admin' ||
    employee?.role === 'manager' ||
    !!employee?.is_super_admin ||
    !!employee?.is_platform_super_admin;

  const editableRoles = useMemo<PermissionRole[]>(() => {
    if (employee?.is_super_admin || employee?.is_platform_super_admin) {
      return ['staff', 'manager', 'admin', 'super_admin'];
    }
    if (employee?.role === 'admin') return ['staff', 'manager'];
    if (employee?.role === 'manager') return ['staff'];
    return [];
  }, [employee?.role, employee?.is_super_admin, employee?.is_platform_super_admin]);

  useEffect(() => {
    if (!canAccessPermissionSettings) return;
    void fetchPermissions();
  }, [fetchPermissions, canAccessPermissionSettings]);

  useEffect(() => {
    if (editableRoles.length > 0 && !editableRoles.includes(selectedRole)) {
      setSelectedRole(editableRoles[0]);
    }
  }, [editableRoles, selectedRole]);

  const getOrDefault = useCallback(
    (module: string, field: string): { can_view: boolean; can_edit: boolean; can_delete: boolean } => {
      const p = getPermission(permissions, selectedRole, module, field);
      if (p) return { can_view: p.can_view, can_edit: p.can_edit, can_delete: p.can_delete };
      if (selectedRole === 'admin' || selectedRole === 'super_admin') {
        return { can_view: true, can_edit: true, can_delete: true };
      }
      if (selectedRole === 'manager') return { can_view: true, can_edit: true, can_delete: false };
      return { can_view: true, can_edit: false, can_delete: false };
    },
    [permissions, selectedRole],
  );

  const handleChange = useCallback(
    (module: string, field: string, key: 'can_view' | 'can_edit' | 'can_delete', value: boolean) => {
      const existing = getPermission(permissions, selectedRole, module, field);
      if (existing) {
        setPermissions((prev) => prev.map((p) => (p.id === existing.id ? { ...p, [key]: value } : p)));
      } else {
        const defaults = getOrDefault(module, field);
        setPermissions((prev) => [
          ...prev,
          {
            id: `temp-${Date.now()}-${module}-${field}`,
            role: selectedRole,
            module_name: module,
            field_name: field,
            ...defaults,
            [key]: value,
          },
        ]);
      }
      setHasChanges(true);
    },
    [permissions, selectedRole, getOrDefault],
  );

  const handleSave = async () => {
    setSaving(true);
    try {
      const rolePerms = permissions.filter((p) => p.role === selectedRole);
      const allItems: {
        module_name: string;
        field_name: string;
        can_view: boolean;
        can_edit: boolean;
        can_delete: boolean;
      }[] = [];

      for (const navKey of Object.keys(NAVIGATION_FIELD_DEFS)) {
        const existing = rolePerms.find((p) => p.module_name === 'navigation' && p.field_name === navKey);
        const v = existing
          ? existing.can_view
          : getOrDefault('navigation', navKey).can_view;
        allItems.push({
          module_name: 'navigation',
          field_name: navKey,
          can_view: v,
          can_edit: false,
          can_delete: false,
        });
      }
      {
        const existing = rolePerms.find((p) => p.module_name === 'dashboard' && p.field_name === 'own_data_only');
        const v = existing
          ? existing.can_view
          : getOrDefault('dashboard', 'own_data_only').can_view;
        allItems.push({
          module_name: 'dashboard',
          field_name: 'own_data_only',
          can_view: v,
          can_edit: false,
          can_delete: false,
        });
      }

      await saveRolePermissions(selectedRole, allItems);
      notify.success(t('导航权限已保存', 'Navigation permissions saved'));
      setHasChanges(false);
      await fetchPermissions();
      await refreshPermissions();
      window.dispatchEvent(new Event('userDataSynced'));
    } catch (error: unknown) {
      console.error('Failed to save permissions:', error);
      const msg = error instanceof Error ? error.message : '';
      notify.error(t(`保存失败：${msg || '请重试'}`, `Save failed: ${msg || 'retry'}`));
    } finally {
      setSaving(false);
    }
  };

  const applyTemplate = (settings: {
    nav: boolean | 'business' | 'minimal';
    dashOwn: boolean;
  }) => {
    const navKeys = Object.keys(NAVIGATION_FIELD_DEFS);
    const businessKeys = new Set([
      'dashboard',
      'exchange_rate',
      'orders',
      'members',
      'reports',
      'activity_reports',
      'merchant_settlement',
      'knowledge_base',
      'work_tasks',
      'audit_center',
      'employees',
      'merchant_management',
      'operation_logs',
      'login_logs',
      'system_settings',
      'member_portal_settings',
    ]);
    const minimalKeys = new Set(['dashboard', 'orders', 'members']);

    setPermissions((prev) => {
      const other = prev.filter((p) => p.role !== selectedRole);
      const next: RolePermission[] = [...other];
      for (const navKey of navKeys) {
        let visible = false;
        if (settings.nav === true) visible = true;
        else if (settings.nav === 'business') visible = businessKeys.has(navKey);
        else if (settings.nav === 'minimal') visible = minimalKeys.has(navKey);
        const old = prev.find(
          (p) => p.role === selectedRole && p.module_name === 'navigation' && p.field_name === navKey,
        );
        next.push({
          id: old?.id || `temp-${Date.now()}-nav-${navKey}`,
          role: selectedRole,
          module_name: 'navigation',
          field_name: navKey,
          can_view: visible,
          can_edit: false,
          can_delete: false,
        });
      }
      const oldD = prev.find(
        (p) => p.role === selectedRole && p.module_name === 'dashboard' && p.field_name === 'own_data_only',
      );
      next.push({
        id: oldD?.id || `temp-dash-${Date.now()}`,
        role: selectedRole,
        module_name: 'dashboard',
        field_name: 'own_data_only',
        can_view: settings.dashOwn,
        can_edit: false,
        can_delete: false,
      });
      return next;
    });
    setHasChanges(true);
    notify.success(t('已应用模板，请点击保存', 'Template applied, click Save'));
  };

  const roleLabel = (r: PermissionRole) =>
    r === 'admin'
      ? t('管理员', 'Admin')
      : r === 'manager'
        ? t('主管', 'Manager')
        : r === 'super_admin'
          ? t('总管理员', 'Super Admin')
          : t('员工', 'Staff');

  if (!canAccessPermissionSettings) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <Shield className="h-12 w-12 mb-4 opacity-50" />
        <p className="text-lg font-medium">{t('权限不足', 'Access Denied')}</p>
        <p className="text-sm mt-1">
          {t('仅管理员或主管可访问权限设置', 'Only administrators or managers can access this page')}
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
          {t('加载中...', 'Loading...')}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className={useCompactLayout ? 'space-y-3' : 'flex items-center justify-between'}>
          <CardTitle className="text-lg flex items-center gap-2">
            <Shield className="h-5 w-5" />
            {t('权限设置 · 导航与入口', 'Permissions · Navigation')}
          </CardTitle>
          <div className={useCompactLayout ? 'flex flex-wrap items-center gap-2' : 'flex items-center gap-3'}>
            {useCompactLayout ? (
              <Select value={selectedRole} onValueChange={(v) => setSelectedRole(v as PermissionRole)}>
                <SelectTrigger className="w-28 h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {editableRoles.map((r) => (
                    <SelectItem key={r} value={r}>{roleLabel(r)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="flex flex-wrap items-center gap-1 bg-muted rounded-lg p-1">
                {editableRoles.map((r) => (
                  <Button
                    key={r}
                    variant={selectedRole === r ? 'default' : 'ghost'}
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => setSelectedRole(r)}
                  >
                    {roleLabel(r)}
                  </Button>
                ))}
              </div>
            )}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5 h-8">
                  <Wand2 className="h-3.5 w-3.5" />
                  {t('快速模板', 'Templates')}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                {QUICK_TEMPLATES.map((tpl, i) => (
                  <DropdownMenuItem
                    key={i}
                    onClick={() => applyTemplate(tpl.settings as { nav: boolean | 'business' | 'minimal'; dashOwn: boolean })}
                    className="cursor-pointer"
                  >
                    <span className="font-medium text-sm">{t(tpl.label_zh, tpl.label_en)}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <Button onClick={() => void handleSave()} disabled={saving || !hasChanges} size="sm" className="gap-1.5 h-8">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              {hasChanges ? t('保存', 'Save') : t('已保存', 'Saved')}
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          {t(
            '为「员工 / 主管 / 管理员 / 总管理员」四档分别配置左侧菜单与入口是否可见。下方「数据统计」仅控制数据页是否只看本人数据。数据表字段能否编辑、是否需审核，请在「审核中心 → 审核设置」中配置（总管理员可改「数据编辑权限」页签；主管可改「审核规则」页签）。',
            'Configure sidebar visibility per role (Staff / Manager / Admin / Super Admin). “Statistics” below limits dashboard to own data only. Field-level edit and audit rules: Audit Center → Audit Settings (super admin: Data permissions tab; manager: Audit rules tab).',
          )}
        </p>
      </CardHeader>

      <CardContent className="space-y-3 pt-0">
        <Collapsible open={expanded.nav} onOpenChange={(o) => setExpanded((e) => ({ ...e, nav: o }))}>
          <CollapsibleTrigger className="flex items-center justify-between w-full px-3 py-2 bg-muted/50 rounded-lg">
            <span className="font-medium text-sm">{t('页面可见性', 'Page visibility')}</span>
            {expanded.nav ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </CollapsibleTrigger>
          <CollapsibleContent className="border rounded-lg mt-1 divide-y">
            {Object.entries(NAVIGATION_FIELD_DEFS).map(([fieldKey, labels]) => {
              const perm = getOrDefault('navigation', fieldKey);
              return (
                <div key={fieldKey} className="flex items-center justify-between py-2.5 px-3 hover:bg-muted/30">
                  <span className="text-sm">{t(labels.label_zh, labels.label_en)}</span>
                  <div className="flex items-center gap-2">
                    <Label className="text-xs text-muted-foreground">{t('可见', 'visible')}</Label>
                    <Switch
                      checked={perm.can_view}
                      onCheckedChange={(v) => handleChange('navigation', fieldKey, 'can_view', v)}
                    />
                  </div>
                </div>
              );
            })}
          </CollapsibleContent>
        </Collapsible>

        <Collapsible open={expanded.dash} onOpenChange={(o) => setExpanded((e) => ({ ...e, dash: o }))}>
          <CollapsibleTrigger className="flex items-center justify-between w-full px-3 py-2 bg-muted/50 rounded-lg">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm">{t('数据统计 · 可见范围', 'Statistics · visibility scope')}</span>
              <Badge variant="secondary" className="text-[10px]">
                1
              </Badge>
            </div>
            {expanded.dash ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </CollapsibleTrigger>
          <CollapsibleContent className="border rounded-lg mt-1">
            <div className="flex items-center justify-between py-2.5 px-3 hover:bg-muted/30">
              <div>
                <span className="text-sm">{t('数据可见范围限制', 'Data visibility restriction')}</span>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {getOrDefault('dashboard', 'own_data_only').can_view
                    ? t('开启：仅看自己录入/经手的数据', 'ON: only own data')
                    : t('关闭：可看全部员工数据', 'OFF: see all data')}
                </p>
              </div>
              <Switch
                checked={getOrDefault('dashboard', 'own_data_only').can_view}
                onCheckedChange={(v) => handleChange('dashboard', 'own_data_only', 'can_view', v)}
              />
            </div>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}
