// Permission Configuration Import/Export Component
import { useState, useCallback } from 'react';
import { Download, Upload, Check, AlertCircle, FileJson } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DrawerDetail } from '@/components/shell/DrawerDetail';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import { useLanguage } from '@/contexts/LanguageContext';
import { listRolePermissions, upsertRolePermissions } from '@/services/staff/rolePermissionsTableService';
import { usePermissionChangeLogs } from '@/hooks/usePermissionChangeLogs';
import { useAuth } from '@/contexts/AuthContext';
import { ExportConfirmDialog } from '@/components/ExportConfirmDialog';
import { useExportConfirm } from '@/hooks/useExportConfirm';

type AppRole = 'admin' | 'manager' | 'staff';

interface RolePermission {
  role: AppRole;
  module_name: string;
  field_name: string;
  can_view: boolean;
  can_edit: boolean;
  can_delete: boolean;
}

interface ExportConfig {
  version: string;
  exportedAt: string;
  exportedBy: string;
  permissions: RolePermission[];
}

interface PermissionImportExportProps {
  onImportComplete?: () => void;
}

export function PermissionImportExport({ onImportComplete }: PermissionImportExportProps) {
  const { t } = useLanguage();
  const { employee } = useAuth();
  const { createLog } = usePermissionChangeLogs();
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importData, setImportData] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const exportConfirm = useExportConfirm();

  // Export permissions for a specific role or all roles
  const handleExport = useCallback(async (role?: AppRole) => {
    try {
      const data = await listRolePermissions(role);

      const exportData: ExportConfig = {
        version: '1.0',
        exportedAt: new Date().toISOString(),
        exportedBy: employee?.real_name || 'Unknown',
        permissions: (data || []).map((p: any) => ({
          role: p.role as AppRole,
          module_name: p.module_name,
          field_name: p.field_name,
          can_view: p.can_view,
          can_edit: p.can_edit,
          can_delete: p.can_delete,
        })),
      };

      // Download as JSON file
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `permissions_${role || 'all'}_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success(t('权限配置已导出', 'Permission configuration exported'));
    } catch (error) {
      console.error('Export failed:', error);
      toast.error(t('导出失败', 'Export failed'));
    }
  }, [employee, t]);

  // Validate import data
  const validateImportData = useCallback((data: string): ExportConfig | null => {
    try {
      const parsed = JSON.parse(data);
      
      if (!parsed.version || !parsed.permissions || !Array.isArray(parsed.permissions)) {
        throw new Error('Invalid format');
      }

      // Validate each permission entry
      for (const perm of parsed.permissions) {
        if (!perm.role || !perm.module_name || !perm.field_name) {
          throw new Error('Missing required fields in permission entry');
        }
        if (!['admin', 'manager', 'staff'].includes(perm.role)) {
          throw new Error(`Invalid role: ${perm.role}`);
        }
      }

      return parsed as ExportConfig;
    } catch (error) {
      return null;
    }
  }, []);

  // Handle import
  const handleImport = useCallback(async () => {
    setImportError(null);
    
    const config = validateImportData(importData);
    if (!config) {
      setImportError(t('无效的配置文件格式', 'Invalid configuration file format'));
      return;
    }

    setImporting(true);
    try {
      const currentPerms = await listRolePermissions();

      const currentPermsMap = new Map<string, { can_view: boolean; can_edit: boolean; can_delete: boolean }>(
        (currentPerms || []).map((p: any) => [`${p.role}-${p.module_name}-${p.field_name}`, p])
      );

      // Calculate changes for logging
      const changesSummary: Array<{
        module: string;
        field: string;
        before: { can_view: boolean; can_edit: boolean; can_delete: boolean };
        after: { can_view: boolean; can_edit: boolean; can_delete: boolean };
      }> = [];

      for (const perm of config.permissions) {
        const key = `${perm.role}-${perm.module_name}-${perm.field_name}`;
        const current = currentPermsMap.get(key);
        
        if (!current || 
            current.can_view !== perm.can_view || 
            current.can_edit !== perm.can_edit || 
            current.can_delete !== perm.can_delete) {
          changesSummary.push({
            module: perm.module_name,
            field: perm.field_name,
            before: current ? {
              can_view: current.can_view,
              can_edit: current.can_edit,
              can_delete: current.can_delete,
            } : { can_view: false, can_edit: false, can_delete: false },
            after: {
              can_view: perm.can_view,
              can_edit: perm.can_edit,
              can_delete: perm.can_delete,
            },
          });
        }
      }

      // Upsert all permissions
      const upsertData = config.permissions.map(p => ({
        role: p.role,
        module_name: p.module_name,
        field_name: p.field_name,
        can_view: p.can_view,
        can_edit: p.can_edit,
        can_delete: p.can_delete,
      }));

      await upsertRolePermissions(upsertData);

      // Log the import
      const roles = [...new Set(config.permissions.map(p => p.role))];
      for (const role of roles) {
        const roleChanges = changesSummary.filter(c => 
          config.permissions.some(p => p.role === role && p.module_name === c.module && p.field_name === c.field)
        );
        
        if (roleChanges.length > 0) {
          await createLog({
            targetRole: role,
            actionType: 'import',
            changesSummary: roleChanges,
            afterData: config,
          });
        }
      }

      toast.success(t(
        `成功导入 ${config.permissions.length} 条权限配置`,
        `Successfully imported ${config.permissions.length} permission configurations`
      ));
      setShowImportDialog(false);
      setImportData('');
      onImportComplete?.();
    } catch (error) {
      console.error('Import failed:', error);
      setImportError(t('导入失败，请检查配置格式', 'Import failed, please check configuration format'));
    } finally {
      setImporting(false);
    }
  }, [importData, validateImportData, createLog, t, onImportComplete]);

  // Handle file selection
  const handleFileSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      setImportData(content);
      setImportError(null);
      
      // Auto-validate
      if (!validateImportData(content)) {
        setImportError(t('文件格式无效', 'Invalid file format'));
      }
    };
    reader.readAsText(file);
  }, [validateImportData, t]);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2">
            <FileJson className="h-4 w-4" />
            {t('导入/导出', 'Import/Export')}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onClick={() => exportConfirm.requestExport(() => void handleExport())}>
            <Download className="h-4 w-4 mr-2" />
            {t('导出全部角色', 'Export All Roles')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => exportConfirm.requestExport(() => void handleExport('staff'))}>
            <Download className="h-4 w-4 mr-2" />
            {t('仅导出员工权限', 'Export Staff Only')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => exportConfirm.requestExport(() => void handleExport('manager'))}>
            <Download className="h-4 w-4 mr-2" />
            {t('仅导出主管权限', 'Export Manager Only')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setShowImportDialog(true)}>
            <Upload className="h-4 w-4 mr-2" />
            {t('导入配置', 'Import Configuration')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DrawerDetail
        open={showImportDialog}
        onOpenChange={setShowImportDialog}
        title={
          <span className="flex items-center gap-2">
            <Upload className="h-5 w-5 shrink-0" />
            {t('导入权限配置', 'Import Permission Configuration')}
          </span>
        }
        description={t(
          '上传之前导出的JSON配置文件，将覆盖现有权限设置',
          'Upload a previously exported JSON configuration file. This will override existing permission settings.'
        )}
        sheetMaxWidth="xl"
      >
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('选择配置文件', 'Select Configuration File')}</Label>
              <input
                type="file"
                accept=".json"
                onChange={handleFileSelect}
                className="block w-full text-sm text-muted-foreground
                  file:mr-4 file:py-2 file:px-4
                  file:rounded-md file:border-0
                  file:text-sm file:font-medium
                  file:bg-primary file:text-primary-foreground
                  hover:file:bg-primary/90
                  cursor-pointer"
              />
            </div>

            <div className="space-y-2">
              <Label>{t('或粘贴JSON配置', 'Or Paste JSON Configuration')}</Label>
              <Textarea
                value={importData}
                onChange={(e) => {
                  setImportData(e.target.value);
                  setImportError(null);
                }}
                placeholder='{"version": "1.0", "permissions": [...]}'
                rows={8}
                className="font-mono text-xs"
              />
            </div>

            {importError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{importError}</AlertDescription>
              </Alert>
            )}

            {importData && !importError && validateImportData(importData) && (
              <Alert>
                <Check className="h-4 w-4" />
                <AlertDescription>
                  {t(
                    `配置有效，包含 ${validateImportData(importData)?.permissions.length || 0} 条权限设置`,
                    `Valid configuration with ${validateImportData(importData)?.permissions.length || 0} permission settings`
                  )}
                </AlertDescription>
              </Alert>
            )}
          </div>

          <div className="flex flex-wrap justify-end gap-2 pt-4 mt-4 border-t border-border">
            <Button variant="outline" onClick={() => setShowImportDialog(false)}>
              {t('取消', 'Cancel')}
            </Button>
            <Button 
              onClick={handleImport}
              disabled={!importData || !!importError || importing}
            >
              {importing ? t('导入中...', 'Importing...') : t('确认导入', 'Confirm Import')}
            </Button>
          </div>
      </DrawerDetail>

      <ExportConfirmDialog
        open={exportConfirm.open}
        onOpenChange={exportConfirm.handleOpenChange}
        onConfirm={exportConfirm.handleConfirm}
      />
    </>
  );
}
