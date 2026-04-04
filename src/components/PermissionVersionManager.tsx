// Permission Version Management Component
import { useState, useEffect, useCallback, cloneElement, isValidElement } from 'react';
import { formatBeijingTime } from "@/lib/beijingTime";
import { 
  Archive, 
  Save, 
  RotateCcw, 
  Trash2, 
  ChevronDown, 
  ChevronRight, 
  RefreshCw,
  History,
  Clock,
  User
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { DrawerDetail } from '@/components/shell/DrawerDetail';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { ScrollArea } from '@/components/ui/scroll-area';
import { notify } from "@/lib/notifyHub";
import { useLanguage } from '@/contexts/LanguageContext';
import { usePermissionVersions, type PermissionVersion } from '@/hooks/usePermissionVersions';
import { usePermissionChangeLogs } from '@/hooks/usePermissionChangeLogs';
import { upsertRolePermissions } from '@/services/staff/rolePermissionsTableService';

const ROLE_LABELS: Record<string, { zh: string; en: string }> = {
  staff: { zh: '员工', en: 'Staff' },
  manager: { zh: '主管', en: 'Manager' },
  admin: { zh: '管理员', en: 'Admin' },
  super_admin: { zh: '总管理员', en: 'Super Admin' },
};

interface PermissionVersionManagerProps {
  selectedRole: string;
  currentPermissions: Array<{
    role: string;
    module_name: string;
    field_name: string;
    can_view: boolean;
    can_edit: boolean;
    can_delete: boolean;
  }>;
  onRestore: (permissions: Array<{
    module_name: string;
    field_name: string;
    can_view: boolean;
    can_edit: boolean;
    can_delete: boolean;
  }>) => void;
  trigger?: React.ReactNode;
}

export function PermissionVersionManager({ 
  selectedRole, 
  currentPermissions,
  onRestore,
  trigger 
}: PermissionVersionManagerProps) {
  const { t } = useLanguage();
  const { versions, loading, fetchVersions, createVersion, deleteVersion, getVersionById } = usePermissionVersions();
  const { createLog } = usePermissionChangeLogs();
  
  const [open, setOpen] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [expandedVersions, setExpandedVersions] = useState<Set<string>>(new Set());
  const [deleteVersionId, setDeleteVersionId] = useState<string | null>(null);
  const [restoreVersionId, setRestoreVersionId] = useState<string | null>(null);
  const [versionForm, setVersionForm] = useState({
    name: '',
    description: '',
  });
  const [saving, setSaving] = useState(false);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    if (open) {
      fetchVersions(selectedRole);
    }
  }, [open, selectedRole, fetchVersions]);

  const toggleExpand = (versionId: string) => {
    setExpandedVersions(prev => {
      const newSet = new Set(prev);
      if (newSet.has(versionId)) {
        newSet.delete(versionId);
      } else {
        newSet.add(versionId);
      }
      return newSet;
    });
  };

  const handleSaveVersion = useCallback(async () => {
    if (!versionForm.name.trim()) {
      notify.error(t('请输入版本名称', 'Please enter version name'));
      return;
    }

    setSaving(true);
    try {
      // Get current permissions for the selected role
      const rolePermissions = currentPermissions
        .filter(p => p.role === selectedRole)
        .map(p => ({
          module_name: p.module_name,
          field_name: p.field_name,
          can_view: p.can_view,
          can_edit: p.can_edit,
          can_delete: p.can_delete,
        }));

      const version = await createVersion({
        versionName: versionForm.name.trim(),
        versionDescription: versionForm.description.trim() || undefined,
        targetRole: selectedRole,
        permissionsSnapshot: rolePermissions,
      });

      if (version) {
        notify.success(t('版本保存成功', 'Version saved successfully'));
        setShowSaveDialog(false);
        setVersionForm({ name: '', description: '' });
        fetchVersions(selectedRole);
      }
    } catch (error) {
      console.error('Failed to save version:', error);
      notify.error(t('保存版本失败', 'Failed to save version'));
    } finally {
      setSaving(false);
    }
  }, [versionForm, selectedRole, currentPermissions, createVersion, fetchVersions, t]);

  const handleRestore = useCallback(async () => {
    if (!restoreVersionId) return;

    setRestoring(true);
    try {
      const version = await getVersionById(restoreVersionId);
      if (!version) {
        notify.error(t('找不到版本', 'Version not found'));
        return;
      }

      // Calculate changes for logging
      const currentRolePerms = currentPermissions.filter(p => p.role === selectedRole);
      const changesSummary: Array<{
        module: string;
        field: string;
        before: { can_view: boolean; can_edit: boolean; can_delete: boolean };
        after: { can_view: boolean; can_edit: boolean; can_delete: boolean };
      }> = [];

      for (const newPerm of version.permissions_snapshot) {
        const current = currentRolePerms.find(
          p => p.module_name === newPerm.module_name && p.field_name === newPerm.field_name
        );

        if (!current ||
            current.can_view !== newPerm.can_view ||
            current.can_edit !== newPerm.can_edit ||
            current.can_delete !== newPerm.can_delete) {
          changesSummary.push({
            module: newPerm.module_name,
            field: newPerm.field_name,
            before: current ? {
              can_view: current.can_view,
              can_edit: current.can_edit,
              can_delete: current.can_delete,
            } : { can_view: false, can_edit: false, can_delete: false },
            after: {
              can_view: newPerm.can_view,
              can_edit: newPerm.can_edit,
              can_delete: newPerm.can_delete,
            },
          });
        }
      }

      // Apply permissions to database
      const upsertData = version.permissions_snapshot.map(p => ({
        role: selectedRole as 'admin' | 'manager' | 'staff',
        module_name: p.module_name,
        field_name: p.field_name,
        can_view: p.can_view,
        can_edit: p.can_edit,
        can_delete: p.can_delete,
      }));

      await upsertRolePermissions(upsertData);

      // Log the rollback
      await createLog({
        targetRole: selectedRole,
        actionType: 'update', // Use 'update' since 'rollback' may not be supported in the type
        templateName: `回滚到: ${version.version_name}`,
        changesSummary,
      });

      // Notify parent to update UI
      onRestore(version.permissions_snapshot);

      notify.success(t(
        `已恢复到版本 "${version.version_name}"`,
        `Restored to version "${version.version_name}"`
      ));
      setRestoreVersionId(null);
    } catch (error) {
      console.error('Failed to restore version:', error);
      notify.error(t('恢复版本失败', 'Failed to restore version'));
    } finally {
      setRestoring(false);
    }
  }, [restoreVersionId, selectedRole, currentPermissions, getVersionById, createLog, onRestore, t]);

  const handleDeleteVersion = useCallback(async () => {
    if (!deleteVersionId) return;

    const success = await deleteVersion(deleteVersionId);
    if (success) {
      notify.success(t('版本已删除', 'Version deleted'));
      setDeleteVersionId(null);
    } else {
      notify.error(t('删除版本失败', 'Failed to delete version'));
    }
  }, [deleteVersionId, deleteVersion, t]);

  const roleLabel = ROLE_LABELS[selectedRole as keyof typeof ROLE_LABELS] || { zh: selectedRole, en: selectedRole };

  const defaultTrigger = (
    <Button variant="outline" size="sm" className="gap-2" type="button" onClick={() => setOpen(true)}>
      <Archive className="h-4 w-4" />
      {t('版本管理', 'Versions')}
    </Button>
  );

  const triggerNode =
    trigger != null && isValidElement(trigger)
      ? cloneElement(trigger as React.ReactElement<{ onClick?: (e: React.MouseEvent) => void }>, {
          onClick: (e: React.MouseEvent) => {
            (trigger as React.ReactElement<{ onClick?: (e: React.MouseEvent) => void }>).props.onClick?.(e);
            setOpen(true);
          },
        })
      : defaultTrigger;

  return (
    <>
      {triggerNode}

      <DrawerDetail
        open={open}
        onOpenChange={setOpen}
        title={
          <span className="flex items-center gap-2">
            <Archive className="h-5 w-5 shrink-0" />
            {t('权限版本管理', 'Permission Versions')}
          </span>
        }
        description={t(
          `管理 ${roleLabel.zh} 角色的权限配置版本，可保存当前配置或恢复到历史版本`,
          `Manage permission versions for ${roleLabel.en} role. Save current config or restore to a previous version.`
        )}
        sheetMaxWidth="2xl"
      >
          <div className="flex justify-between items-center">
            <Button 
              variant="default" 
              size="sm" 
              onClick={() => setShowSaveDialog(true)}
              className="gap-2"
            >
              <Save className="h-4 w-4" />
              {t('保存当前版本', 'Save Current Version')}
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => fetchVersions(selectedRole)}
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              {t('刷新', 'Refresh')}
            </Button>
          </div>

          <ScrollArea className="h-[350px] pr-4">
            {loading ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                {t('加载中...', 'Loading...')}
              </div>
            ) : versions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <Archive className="h-12 w-12 mb-4 opacity-50" />
                <p>{t('暂无保存的版本', 'No saved versions yet')}</p>
                <p className="text-xs mt-2">{t('点击"保存当前版本"创建第一个版本', 'Click "Save Current Version" to create your first version')}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {versions.map((version) => {
                  const isExpanded = expandedVersions.has(version.id);
                  const permCount = version.permissions_snapshot?.length || 0;

                  return (
                    <Collapsible key={version.id} open={isExpanded} onOpenChange={() => toggleExpand(version.id)}>
                      <div className="border rounded-lg overflow-hidden">
                        <div className="flex items-center justify-between p-3 hover:bg-muted/50 transition-colors">
                          <CollapsibleTrigger className="flex-1 flex items-center gap-3 text-left">
                            <div className="flex-shrink-0">
                              {isExpanded ? (
                                <ChevronDown className="h-4 w-4 text-muted-foreground" />
                              ) : (
                                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                              )}
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium">{version.version_name}</span>
                                {version.is_auto_backup && (
                                  <Badge variant="secondary" className="text-xs">
                                    {t('自动备份', 'Auto')}
                                  </Badge>
                                )}
                              </div>
                              <div className="text-xs text-muted-foreground mt-1 flex items-center gap-3">
                                <span className="flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  {formatBeijingTime(version.created_at)}
                                </span>
                                <span className="flex items-center gap-1">
                                  <User className="h-3 w-3" />
                                  {version.created_by_name}
                                </span>
                                <span>{t(`${permCount} 条权限`, `${permCount} permissions`)}</span>
                              </div>
                            </div>
                          </CollapsibleTrigger>
                          <div className="flex items-center gap-1 ml-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setRestoreVersionId(version.id)}
                              className="gap-1 text-primary hover:text-primary"
                            >
                              <RotateCcw className="h-4 w-4" />
                              {t('恢复', 'Restore')}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setDeleteVersionId(version.id)}
                              className="h-8 w-8 text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                        <CollapsibleContent>
                          <div className="border-t px-3 py-3">
                            {version.version_description && (
                              <p className="text-sm text-muted-foreground mb-3">
                                {version.version_description}
                              </p>
                            )}
                            <div className="text-xs space-y-1 max-h-32 overflow-y-auto">
                              {version.permissions_snapshot?.slice(0, 8).map((perm, idx) => (
                                <div key={idx} className="flex items-center justify-between py-1 px-2 bg-muted/30 rounded">
                                  <span>{perm.module_name} → {perm.field_name}</span>
                                  <div className="flex gap-1">
                                    {perm.can_view && <Badge variant="outline" className="text-[10px] px-1">V</Badge>}
                                    {perm.can_edit && <Badge variant="outline" className="text-[10px] px-1">E</Badge>}
                                    {perm.can_delete && <Badge variant="outline" className="text-[10px] px-1">D</Badge>}
                                  </div>
                                </div>
                              ))}
                              {(version.permissions_snapshot?.length || 0) > 8 && (
                                <p className="text-center text-muted-foreground py-1">
                                  {t(`还有 ${(version.permissions_snapshot?.length || 0) - 8} 条...`, 
                                     `${(version.permissions_snapshot?.length || 0) - 8} more...`)}
                                </p>
                              )}
                            </div>
                          </div>
                        </CollapsibleContent>
                      </div>
                    </Collapsible>
                  );
                })}
              </div>
            )}
          </ScrollArea>
      </DrawerDetail>

      {/* Save version — same shell as main list (drawer / bottom sheet) */}
      <DrawerDetail
        open={showSaveDialog}
        onOpenChange={setShowSaveDialog}
        title={
          <span className="flex items-center gap-2">
            <Save className="h-5 w-5 shrink-0" />
            {t('保存权限版本', 'Save Permission Version')}
          </span>
        }
        description={t(
          `为 ${roleLabel.zh} 角色的当前权限配置创建一个可恢复的版本`,
          `Create a restorable version of current permissions for ${roleLabel.en} role`
        )}
        sheetMaxWidth="xl"
      >
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>{t('版本名称', 'Version Name')} *</Label>
            <Input
              value={versionForm.name}
              onChange={(e) => setVersionForm(prev => ({ ...prev, name: e.target.value }))}
              placeholder={t('例如: 2024-01 基础配置', 'e.g., 2024-01 Base Config')}
            />
          </div>
          <div className="space-y-2">
            <Label>{t('版本说明', 'Version Description')}</Label>
            <Textarea
              value={versionForm.description}
              onChange={(e) => setVersionForm(prev => ({ ...prev, description: e.target.value }))}
              placeholder={t('可选：描述此版本的用途或变更内容', 'Optional: Describe the purpose or changes')}
              rows={3}
            />
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-2 pt-4 mt-4 border-t border-border">
          <Button variant="outline" onClick={() => setShowSaveDialog(false)}>
            {t('取消', 'Cancel')}
          </Button>
          <Button onClick={handleSaveVersion} disabled={saving}>
            {saving ? t('保存中...', 'Saving...') : t('保存版本', 'Save Version')}
          </Button>
        </div>
      </DrawerDetail>

      {/* Restore Confirmation Dialog */}
      <AlertDialog open={!!restoreVersionId} onOpenChange={() => setRestoreVersionId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <RotateCcw className="h-5 w-5" />
              {t('确认恢复版本', 'Confirm Restore')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                '此操作将覆盖当前的权限配置。建议在恢复前先保存当前版本。确定要继续吗？',
                'This will overwrite current permission settings. It is recommended to save the current version before restoring. Continue?'
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('取消', 'Cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleRestore} disabled={restoring}>
              {restoring ? t('恢复中...', 'Restoring...') : t('确认恢复', 'Confirm Restore')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteVersionId} onOpenChange={() => setDeleteVersionId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('确认删除', 'Confirm Delete')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                '此操作不可撤销，确定要删除这个版本吗？',
                'This action cannot be undone. Are you sure you want to delete this version?'
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('取消', 'Cancel')}</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteVersion}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('删除', 'Delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
