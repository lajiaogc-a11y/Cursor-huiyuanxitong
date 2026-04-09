// Permission Version Comparison Component
import { useState, useMemo, cloneElement, isValidElement } from 'react';
import { GitCompare, Check, X, Minus, ArrowRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DrawerDetail } from '@/components/shell/DrawerDetail';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useLanguage } from '@/contexts/LanguageContext';
import { type PermissionVersion } from '@/hooks/staff/usePermissionVersions';
import { formatBeijingTime } from "@/lib/beijingTime";

interface PermissionSnapshot {
  module_name: string;
  field_name: string;
  can_view: boolean;
  can_edit: boolean;
  can_delete: boolean;
}

interface ComparisonResult {
  module_name: string;
  field_name: string;
  leftView: boolean;
  leftEdit: boolean;
  leftDelete: boolean;
  rightView: boolean;
  rightEdit: boolean;
  rightDelete: boolean;
  viewChanged: boolean;
  editChanged: boolean;
  deleteChanged: boolean;
  isNew: boolean;
  isRemoved: boolean;
}

interface PermissionVersionCompareProps {
  versions: PermissionVersion[];
  currentPermissions?: PermissionSnapshot[];
  selectedRole: string;
  trigger?: React.ReactNode;
}

const ROLE_LABELS = {
  staff: { zh: '员工', en: 'Staff' },
  manager: { zh: '主管', en: 'Manager' },
  admin: { zh: '管理员', en: 'Admin' },
};

export function PermissionVersionCompare({
  versions,
  currentPermissions,
  selectedRole,
  trigger,
}: PermissionVersionCompareProps) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [leftVersionId, setLeftVersionId] = useState<string>('');
  const [rightVersionId, setRightVersionId] = useState<string>('current');

  // Build version options (including "current")
  const versionOptions = useMemo(() => {
    const options: { id: string; label: string; sublabel?: string }[] = [];
    
    // Add "current" option
    if (currentPermissions) {
      options.push({
        id: 'current',
        label: t('当前配置', 'Current Config'),
        sublabel: t('未保存的最新状态', 'Latest unsaved state'),
      });
    }
    
    // Add saved versions
    versions.forEach((v) => {
      options.push({
        id: v.id,
        label: v.version_name,
        sublabel: formatBeijingTime(v.created_at),
      });
    });
    
    return options;
  }, [versions, currentPermissions, t]);

  // Get snapshot for a version ID
  const getSnapshot = (versionId: string): PermissionSnapshot[] => {
    if (versionId === 'current' && currentPermissions) {
      return currentPermissions;
    }
    const version = versions.find((v) => v.id === versionId);
    return version?.permissions_snapshot || [];
  };

  // Compare two snapshots
  const comparisonResults = useMemo((): ComparisonResult[] => {
    if (!leftVersionId || !rightVersionId) return [];

    const leftSnapshot = getSnapshot(leftVersionId);
    const rightSnapshot = getSnapshot(rightVersionId);

    const allKeys = new Set<string>();
    leftSnapshot.forEach((p) => allKeys.add(`${p.module_name}|${p.field_name}`));
    rightSnapshot.forEach((p) => allKeys.add(`${p.module_name}|${p.field_name}`));

    const results: ComparisonResult[] = [];

    allKeys.forEach((key) => {
      const [module_name, field_name] = key.split('|');
      const left = leftSnapshot.find(
        (p) => p.module_name === module_name && p.field_name === field_name
      );
      const right = rightSnapshot.find(
        (p) => p.module_name === module_name && p.field_name === field_name
      );

      const leftView = left?.can_view ?? false;
      const leftEdit = left?.can_edit ?? false;
      const leftDelete = left?.can_delete ?? false;
      const rightView = right?.can_view ?? false;
      const rightEdit = right?.can_edit ?? false;
      const rightDelete = right?.can_delete ?? false;

      const viewChanged = leftView !== rightView;
      const editChanged = leftEdit !== rightEdit;
      const deleteChanged = leftDelete !== rightDelete;

      // Only include if there's a difference
      if (viewChanged || editChanged || deleteChanged || !left || !right) {
        results.push({
          module_name,
          field_name,
          leftView,
          leftEdit,
          leftDelete,
          rightView,
          rightEdit,
          rightDelete,
          viewChanged,
          editChanged,
          deleteChanged,
          isNew: !left && !!right,
          isRemoved: !!left && !right,
        });
      }
    });

    // Sort by module then field
    return results.sort((a, b) => {
      if (a.module_name !== b.module_name) {
        return a.module_name.localeCompare(b.module_name);
      }
      return a.field_name.localeCompare(b.field_name);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leftVersionId, rightVersionId, versions, currentPermissions]);

  const roleLabel = ROLE_LABELS[selectedRole as keyof typeof ROLE_LABELS] || {
    zh: selectedRole,
    en: selectedRole,
  };

  const PermissionIcon = ({ value, changed }: { value: boolean; changed: boolean }) => {
    return (
      <span
        className={`inline-flex items-center justify-center w-5 h-5 rounded ${
          changed
            ? value
              ? 'bg-primary/20 text-primary'
              : 'bg-destructive/20 text-destructive'
            : value
            ? 'text-muted-foreground'
            : 'text-muted-foreground/40'
        }`}
      >
        {value ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
      </span>
    );
  };

  const defaultTrigger = (
    <Button variant="outline" size="sm" className="gap-2" type="button" onClick={() => setOpen(true)}>
      <GitCompare className="h-4 w-4" />
      {t('版本比较', 'Compare')}
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
            <GitCompare className="h-5 w-5 shrink-0" />
            {t('权限版本比较', 'Permission Version Comparison')}
          </span>
        }
        description={t(
          `对比 ${roleLabel.zh} 角色的不同权限版本之间的差异`,
          `Compare differences between permission versions for ${roleLabel.en} role`,
        )}
        sheetMaxWidth="3xl"
      >
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">{t('左侧版本', 'Left Version')}</label>
            <Select value={leftVersionId} onValueChange={setLeftVersionId}>
              <SelectTrigger>
                <SelectValue placeholder={t('选择版本...', 'Select version...')} />
              </SelectTrigger>
              <SelectContent>
                {versionOptions
                  .filter((v) => v.id !== rightVersionId)
                  .map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      <div className="flex flex-col">
                        <span>{v.label}</span>
                        {v.sublabel && (
                          <span className="text-xs text-muted-foreground">{v.sublabel}</span>
                        )}
                      </div>
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">{t('右侧版本', 'Right Version')}</label>
            <Select value={rightVersionId} onValueChange={setRightVersionId}>
              <SelectTrigger>
                <SelectValue placeholder={t('选择版本...', 'Select version...')} />
              </SelectTrigger>
              <SelectContent>
                {versionOptions
                  .filter((v) => v.id !== leftVersionId)
                  .map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      <div className="flex flex-col">
                        <span>{v.label}</span>
                        {v.sublabel && (
                          <span className="text-xs text-muted-foreground">{v.sublabel}</span>
                        )}
                      </div>
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Comparison Results */}
        <ScrollArea className="h-[400px] pr-4">
          {!leftVersionId || !rightVersionId ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <GitCompare className="h-12 w-12 mb-4 opacity-50" />
              <p>{t('请选择两个版本进行比较', 'Select two versions to compare')}</p>
            </div>
          ) : comparisonResults.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Check className="h-12 w-12 mb-4 text-primary" />
              <p>{t('两个版本完全相同', 'Both versions are identical')}</p>
            </div>
          ) : (
            <div className="space-y-1">
              {/* Header */}
              <div className="grid grid-cols-[1fr_100px_40px_100px] gap-2 py-2 px-3 bg-muted/50 rounded-t-md text-xs font-medium text-muted-foreground sticky top-0 z-10">
                <span>{t('权限项', 'Permission')}</span>
                <span className="text-center">{t('左侧', 'Left')}</span>
                <span className="text-center"></span>
                <span className="text-center">{t('右侧', 'Right')}</span>
              </div>

              {comparisonResults.map((result, idx) => (
                <div
                  key={`${result.module_name}-${result.field_name}`}
                  className={`grid grid-cols-[1fr_100px_40px_100px] gap-2 py-2 px-3 rounded-md text-sm ${
                    idx % 2 === 0 ? 'bg-muted/20' : ''
                  } ${
                    result.isNew
                      ? 'border-l-2 border-green-500'
                      : result.isRemoved
                      ? 'border-l-2 border-red-500'
                      : ''
                  }`}
                >
                  {/* Permission Name */}
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{result.module_name}</span>
                    <span className="text-muted-foreground">→</span>
                    <span>{result.field_name}</span>
                    {result.isNew && (
                      <Badge variant="secondary" className="text-[10px]">
                        {t('新增', 'New')}
                      </Badge>
                    )}
                    {result.isRemoved && (
                      <Badge variant="destructive" className="text-[10px]">
                        {t('移除', 'Removed')}
                      </Badge>
                    )}
                  </div>

                  {/* Left Side */}
                  <div className="flex items-center justify-center gap-1">
                    <PermissionIcon value={result.leftView} changed={result.viewChanged} />
                    <PermissionIcon value={result.leftEdit} changed={result.editChanged} />
                    <PermissionIcon value={result.leftDelete} changed={result.deleteChanged} />
                  </div>

                  {/* Arrow */}
                  <div className="flex items-center justify-center text-muted-foreground">
                    <ArrowRight className="h-4 w-4" />
                  </div>

                  {/* Right Side */}
                  <div className="flex items-center justify-center gap-1">
                    <PermissionIcon value={result.rightView} changed={result.viewChanged} />
                    <PermissionIcon value={result.rightEdit} changed={result.editChanged} />
                    <PermissionIcon value={result.rightDelete} changed={result.deleteChanged} />
                  </div>
                </div>
              ))}

              {/* Legend */}
              <div className="mt-4 pt-4 border-t flex flex-wrap gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <span className="w-4 h-4 rounded bg-muted flex items-center justify-center">
                    <Check className="h-2.5 w-2.5" />
                  </span>
                  {t('查看 (V)', 'View (V)')}
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-4 h-4 rounded bg-muted flex items-center justify-center">
                    <Check className="h-2.5 w-2.5" />
                  </span>
                  {t('编辑 (E)', 'Edit (E)')}
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-4 h-4 rounded bg-muted flex items-center justify-center">
                    <Check className="h-2.5 w-2.5" />
                  </span>
                  {t('删除 (D)', 'Delete (D)')}
                </span>
                <span className="flex items-center gap-2 ml-4">
                  <span className="w-2 h-2 rounded-full bg-primary" />
                  {t('已启用', 'Enabled')}
                </span>
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-destructive" />
                  {t('已禁用', 'Disabled')}
                </span>
              </div>
            </div>
          )}
        </ScrollArea>

        {/* Summary */}
        {leftVersionId && rightVersionId && comparisonResults.length > 0 && (
          <div className="pt-4 border-t text-sm text-muted-foreground">
            {t(
              `共发现 ${comparisonResults.length} 处差异`,
              `Found ${comparisonResults.length} difference(s)`
            )}
          </div>
        )}
      </DrawerDetail>
    </>
  );
}
