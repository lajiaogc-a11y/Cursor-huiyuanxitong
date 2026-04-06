import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronDown, ChevronRight, Loader2, Save, Database } from 'lucide-react';
import { notify } from "@/lib/notifyHub";
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { listRolePermissionsByModuleOrder } from '@/services/staff/rolePermissionsTableService';
import { saveRolePermissions } from '@/services/staff/dataApi/permissionsAndSettings';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { useIsMobile, useIsTablet } from '@/hooks/use-mobile';
import { DATA_FIELD_MODULES, type FieldMeta } from '@/lib/dataFieldPermissionModules';
import type { PermissionRole } from '@/lib/permissionModels';

/** 数据字段 / 完整操作行 / 仅批量删 / 仅批量处理 */
function fieldColumnMode(f: FieldMeta): 'data' | 'action_full' | 'delete_only' | 'edit_only' {
  if (f.permissionColumns === 'delete_only') return 'delete_only';
  if (f.permissionColumns === 'edit_only') return 'edit_only';
  if (f.isAction) return 'action_full';
  return 'data';
}

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

/**
 * 审核中心内：配置各业务模块字段的查看/编辑/删除（写入 role_permissions，与左侧导航无关）
 */
export default function DataFieldPermissionsPanel() {
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
  const [expandedModules, setExpandedModules] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    Object.keys(DATA_FIELD_MODULES).forEach((k) => {
      init[k] = false;
    });
    init.orders = true;
    return init;
  });

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
      notify.error(t('加载数据权限失败', 'Failed to load data permissions'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void fetchPermissions();
  }, [fetchPermissions]);

  const getOrDefault = useCallback(
    (module: string, field: string): { can_view: boolean; can_edit: boolean; can_delete: boolean } => {
      const p = getPermission(permissions, selectedRole, module, field);
      if (p) return { can_view: p.can_view, can_edit: p.can_edit, can_delete: p.can_delete };
      const isIsolatedBatch =
        (module === 'orders' && (field === 'batch_delete' || field === 'batch_process')) ||
        (module === 'data_management' && (field === 'batch_delete' || field === 'batch_action')) ||
        (module === 'error_reports' && field === 'batch_clear');
      if (isIsolatedBatch) {
        return { can_view: false, can_edit: false, can_delete: false };
      }
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

      for (const [moduleKey, moduleConfig] of Object.entries(DATA_FIELD_MODULES)) {
        for (const fieldKey of Object.keys(moduleConfig.fields)) {
          const existing = rolePerms.find((p) => p.module_name === moduleKey && p.field_name === fieldKey);
          if (existing) {
            allItems.push({
              module_name: moduleKey,
              field_name: fieldKey,
              can_view: existing.can_view,
              can_edit: existing.can_edit,
              can_delete: existing.can_delete,
            });
          } else {
            allItems.push({
              module_name: moduleKey,
              field_name: fieldKey,
              ...getOrDefault(moduleKey, fieldKey),
            });
          }
        }
      }

      await saveRolePermissions(selectedRole, allItems);
      notify.success(t('数据权限已保存', 'Data permissions saved'));
      setHasChanges(false);
      await fetchPermissions();
      await refreshPermissions();
      window.dispatchEvent(new Event('userDataSynced'));
    } catch (error: unknown) {
      console.error('Failed to save data permissions:', error);
      const msg = error instanceof Error ? error.message : '';
      notify.error(t(`保存失败：${msg || '请重试'}`, `Save failed: ${msg || 'retry'}`));
    } finally {
      setSaving(false);
    }
  };

  const roleLabel = (r: PermissionRole) =>
    r === 'admin'
      ? t('管理员', 'Admin')
      : r === 'manager'
        ? t('主管', 'Manager')
        : r === 'super_admin'
          ? t('总管理员', 'Super Admin')
          : t('员工', 'Staff');

  const hasEditableFields = (moduleKey: string) => {
    const m = DATA_FIELD_MODULES[moduleKey];
    return Object.values(m.fields).some((f) => {
      const mode = fieldColumnMode(f);
      if (mode === 'edit_only') return true;
      if (mode === 'delete_only') return false;
      return !f.readonly;
    });
  };
  const hasActionFields = (moduleKey: string) => {
    const m = DATA_FIELD_MODULES[moduleKey];
    return Object.values(m.fields).some((f) => {
      const mode = fieldColumnMode(f);
      return mode === 'action_full' || mode === 'delete_only' || mode === 'edit_only';
    });
  };

  const toggleModuleAllFields = useCallback(
    (moduleKey: string, key: 'can_view' | 'can_edit' | 'can_delete', value: boolean) => {
      const moduleConfig = DATA_FIELD_MODULES[moduleKey];
      if (!moduleConfig) return;
      setPermissions((prev) => {
        let updated = [...prev];
        for (const [fieldKey, fieldConfig] of Object.entries(moduleConfig.fields)) {
          const mode = fieldColumnMode(fieldConfig);
          if (key === 'can_view' && (mode === 'delete_only' || mode === 'edit_only')) continue;
          if (key === 'can_edit' && (fieldConfig.readonly || mode === 'delete_only')) continue;
          if (key === 'can_delete' && (mode === 'data' || mode === 'edit_only')) continue;
          const existing = updated.find(
            (p) => p.role === selectedRole && p.module_name === moduleKey && p.field_name === fieldKey,
          );
          if (existing) {
            updated = updated.map((p) => (p.id === existing.id ? { ...p, [key]: value } : p));
          } else {
            const defaults = getOrDefault(moduleKey, fieldKey);
            updated.push({
              id: `temp-${Date.now()}-${moduleKey}-${fieldKey}`,
              role: selectedRole,
              module_name: moduleKey,
              field_name: fieldKey,
              ...defaults,
              [key]: value,
            });
          }
        }
        return updated;
      });
      setHasChanges(true);
    },
    [selectedRole, getOrDefault],
  );

  const isModuleAllChecked = useCallback(
    (moduleKey: string, key: 'can_view' | 'can_edit' | 'can_delete') => {
      const moduleConfig = DATA_FIELD_MODULES[moduleKey];
      if (!moduleConfig) return false;
      const fields = Object.entries(moduleConfig.fields);
      const relevantFields = fields.filter(([, fc]) => {
        const mode = fieldColumnMode(fc);
        if (key === 'can_view' && (mode === 'delete_only' || mode === 'edit_only')) return false;
        if (key === 'can_edit' && (fc.readonly || mode === 'delete_only')) return false;
        if (key === 'can_delete' && (mode === 'data' || mode === 'edit_only')) return false;
        return true;
      });
      if (relevantFields.length === 0) return false;
      return relevantFields.every(([fk]) => {
        const v = getOrDefault(moduleKey, fk);
        return v[key];
      });
    },
    [getOrDefault],
  );

  const canEditDataPerms = !!employee?.is_super_admin || !!employee?.is_platform_super_admin;

  if (!employee) return null;

  if (!canEditDataPerms) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          <Database className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="font-medium">{t('权限不足', 'Access Denied')}</p>
          <p className="text-xs mt-1">{t('仅总管理员可修改数据编辑权限', 'Only super admin can modify data edit permissions')}</p>
        </CardContent>
      </Card>
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
            <Database className="h-5 w-5" />
            {t('后台数据编辑权限', 'Backend data edit permissions')}
          </CardTitle>
          <div className={useCompactLayout ? 'flex flex-wrap gap-2' : 'flex items-center gap-3'}>
            {useCompactLayout ? (
              <Select value={selectedRole} onValueChange={(v) => setSelectedRole(v as PermissionRole)}>
                <SelectTrigger className="w-28 h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="staff">{t('员工', 'Staff')}</SelectItem>
                  <SelectItem value="manager">{t('主管', 'Manager')}</SelectItem>
                  <SelectItem value="admin">{t('管理员', 'Admin')}</SelectItem>
                  <SelectItem value="super_admin">{t('总管理员', 'Super Admin')}</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <div className="flex flex-wrap items-center gap-1 bg-muted rounded-lg p-1">
                {(['staff', 'manager', 'admin', 'super_admin'] as PermissionRole[]).map((r) => (
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
            <Button onClick={() => void handleSave()} disabled={saving || !hasChanges} size="sm" className="gap-1.5 h-8">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              {hasChanges ? t('保存', 'Save') : t('已保存', 'Saved')}
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          {t(
            '数据级权限（module + field）：控制各业务模块字段与操作（含单条/批量删除等）。与「权限设置」中的导航权限（左侧菜单可见性）相互独立。总管理员可编辑本页；总管理员行对应 is_super_admin 账号。与「审核规则」配合：无编辑权且需审核的改动会进入待审核队列。',
            'Data-level permissions (module + field): controls fields and actions including single/batch deletes. Independent from Navigation permissions in Permission settings (sidebar visibility). Super admins edit this page; Super Admin role rows apply to is_super_admin accounts. With audit rules: edits without permission may go to the approval queue.',
          )}
        </p>
      </CardHeader>
      <CardContent className="space-y-2 pt-0">
        {Object.entries(DATA_FIELD_MODULES).map(([moduleKey, moduleConfig]) => {
          const fieldEntries = Object.entries(moduleConfig.fields);
          const showEdit = hasEditableFields(moduleKey);
          const showDelete = hasActionFields(moduleKey);
          return (
            <Collapsible
              key={moduleKey}
              open={expandedModules[moduleKey]}
              onOpenChange={() =>
                setExpandedModules((prev) => ({ ...prev, [moduleKey]: !prev[moduleKey] }))
              }
            >
              <CollapsibleTrigger className="flex items-center justify-between w-full px-3 py-2.5 bg-muted/50 rounded-lg hover:bg-muted transition-colors">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{t(moduleConfig.label_zh, moduleConfig.label_en)}</span>
                  <Badge variant="secondary" className="text-[10px] h-5">
                    {fieldEntries.length}
                  </Badge>
                </div>
                <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    className={`text-[10px] px-1.5 py-0.5 rounded ${
                      isModuleAllChecked(moduleKey, 'can_view') ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                    }`}
                    onClick={() =>
                      toggleModuleAllFields(moduleKey, 'can_view', !isModuleAllChecked(moduleKey, 'can_view'))
                    }
                  >
                    {t('全选查看', 'All view')}
                  </button>
                  {showEdit && (
                    <button
                      type="button"
                      className={`text-[10px] px-1.5 py-0.5 rounded ${
                        isModuleAllChecked(moduleKey, 'can_edit')
                          ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30'
                          : 'bg-muted text-muted-foreground'
                      }`}
                      onClick={() =>
                        toggleModuleAllFields(moduleKey, 'can_edit', !isModuleAllChecked(moduleKey, 'can_edit'))
                      }
                    >
                      {t('全选编辑', 'All edit')}
                    </button>
                  )}
                  {showDelete && (
                    <button
                      type="button"
                      className={`text-[10px] px-1.5 py-0.5 rounded ${
                        isModuleAllChecked(moduleKey, 'can_delete')
                          ? 'bg-destructive/10 text-destructive'
                          : 'bg-muted text-muted-foreground'
                      }`}
                      onClick={() =>
                        toggleModuleAllFields(moduleKey, 'can_delete', !isModuleAllChecked(moduleKey, 'can_delete'))
                      }
                    >
                      {t('全选删除', 'All del')}
                    </button>
                  )}
                  <div className="pointer-events-none">
                    {expandedModules[moduleKey] ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </div>
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent className="border rounded-lg mt-1 overflow-hidden">
                {fieldEntries.map(([fieldKey, fieldConfig]) => {
                  const perm = getOrDefault(moduleKey, fieldKey);
                  const mode = fieldColumnMode(fieldConfig);
                  const showView = mode === 'data' || mode === 'action_full';
                  const showEdit = (mode === 'data' || mode === 'action_full' || mode === 'edit_only') && !fieldConfig.readonly;
                  const showDel = mode === 'action_full' || mode === 'delete_only';
                  return (
                    <div
                      key={`${moduleKey}-${fieldKey}`}
                      className={
                        useCompactLayout
                          ? 'py-2 px-3 border-b last:border-b-0 space-y-1.5'
                          : 'flex items-center justify-between py-2 px-3 border-b last:border-b-0'
                      }
                    >
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <span className="text-sm">{t(fieldConfig.label_zh, fieldConfig.label_en)}</span>
                        {fieldConfig.readonly && (
                          <Badge variant="secondary" className="text-[10px] h-4">
                            {t('只读', 'R/O')}
                          </Badge>
                        )}
                        {fieldConfig.isAction && (
                          <Badge variant="outline" className="text-[10px] h-4">
                            {t('操作', 'Actions')}
                          </Badge>
                        )}
                      </div>
                      <div className={useCompactLayout ? 'flex flex-wrap gap-3 pl-1' : 'flex items-center gap-4'}>
                        {showView && (
                        <div className="flex items-center gap-1.5">
                          <Label className="text-xs text-muted-foreground w-7">{t('查看', 'View')}</Label>
                          <Switch
                            checked={perm.can_view}
                            onCheckedChange={(v) => handleChange(moduleKey, fieldKey, 'can_view', v)}
                          />
                        </div>
                        )}
                        {showEdit && (
                          <div className="flex items-center gap-1.5">
                            <Label className="text-xs text-muted-foreground w-7">{t('编辑', 'Edit')}</Label>
                            <Switch
                              checked={perm.can_edit}
                              onCheckedChange={(v) => handleChange(moduleKey, fieldKey, 'can_edit', v)}
                            />
                          </div>
                        )}
                        {showDel && (
                          <div className="flex items-center gap-1.5">
                            <Label className="text-xs text-muted-foreground w-7">{t('删除', 'Del')}</Label>
                            <Switch
                              checked={perm.can_delete}
                              onCheckedChange={(v) => handleChange(moduleKey, fieldKey, 'can_delete', v)}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </CollapsibleContent>
            </Collapsible>
          );
        })}
      </CardContent>
    </Card>
  );
}
