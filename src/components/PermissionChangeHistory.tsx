// Permission Change History Component
import { useState, useEffect, cloneElement, isValidElement } from 'react';
import { History, User, ChevronDown, ChevronRight, FileDown, FileUp, Wand2, RefreshCw } from 'lucide-react';
import { formatBeijingTime } from "@/lib/beijingTime";
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DrawerDetail } from '@/components/shell/DrawerDetail';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useLanguage } from '@/contexts/LanguageContext';
import { usePermissionChangeLogs, type PermissionChangeLog } from '@/hooks/audit/usePermissionChangeLogs';

const ACTION_TYPE_LABELS = {
  update: { zh: '手动更新', en: 'Manual Update', color: 'default' as const },
  import: { zh: '导入配置', en: 'Import', color: 'secondary' as const },
  apply_template: { zh: '应用模板', en: 'Apply Template', color: 'outline' as const },
};

const ROLE_LABELS = {
  staff: { zh: '员工', en: 'Staff' },
  manager: { zh: '主管', en: 'Manager' },
  admin: { zh: '管理员', en: 'Admin' },
};

interface PermissionChangeHistoryProps {
  trigger?: React.ReactNode;
}

export function PermissionChangeHistory({ trigger }: PermissionChangeHistoryProps) {
  const { t } = useLanguage();
  const { logs, loading, fetchLogs } = usePermissionChangeLogs();
  const [open, setOpen] = useState(false);
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (open) {
      fetchLogs();
    }
  }, [open, fetchLogs]);

  const toggleExpand = (logId: string) => {
    setExpandedLogs(prev => {
      const newSet = new Set(prev);
      if (newSet.has(logId)) {
        newSet.delete(logId);
      } else {
        newSet.add(logId);
      }
      return newSet;
    });
  };

  const getActionIcon = (actionType: string) => {
    switch (actionType) {
      case 'import':
        return <FileUp className="h-4 w-4" />;
      case 'apply_template':
        return <Wand2 className="h-4 w-4" />;
      default:
        return <User className="h-4 w-4" />;
    }
  };

  const renderChangeDetails = (log: PermissionChangeLog) => {
    const changes = log.changes_summary || [];
    if (changes.length === 0) {
      return (
        <div className="text-sm text-muted-foreground py-2">
          {t('无详细变更记录', 'No detailed change records')}
        </div>
      );
    }

    return (
      <div className="space-y-2 py-2">
        {changes.slice(0, 10).map((change, idx) => (
          <div key={idx} className="text-sm p-2 bg-muted/50 rounded">
            <div className="font-medium mb-1">
              {change.module} → {change.field}
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-muted-foreground">{t('修改前:', 'Before:')}</span>
                <div className="flex gap-1 mt-1">
                  {change.before.can_view && <Badge variant="outline" className="text-[10px]">{t('可查看', 'View')}</Badge>}
                  {change.before.can_edit && <Badge variant="outline" className="text-[10px]">{t('可编辑', 'Edit')}</Badge>}
                  {change.before.can_delete && <Badge variant="outline" className="text-[10px]">{t('可删除', 'Delete')}</Badge>}
                  {!change.before.can_view && !change.before.can_edit && !change.before.can_delete && (
                    <Badge variant="secondary" className="text-[10px]">{t('无权限', 'No Access')}</Badge>
                  )}
                </div>
              </div>
              <div>
                <span className="text-muted-foreground">{t('修改后:', 'After:')}</span>
                <div className="flex gap-1 mt-1">
                  {change.after.can_view && <Badge variant="default" className="text-[10px]">{t('可查看', 'View')}</Badge>}
                  {change.after.can_edit && <Badge variant="default" className="text-[10px]">{t('可编辑', 'Edit')}</Badge>}
                  {change.after.can_delete && <Badge variant="default" className="text-[10px]">{t('可删除', 'Delete')}</Badge>}
                  {!change.after.can_view && !change.after.can_edit && !change.after.can_delete && (
                    <Badge variant="secondary" className="text-[10px]">{t('无权限', 'No Access')}</Badge>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
        {changes.length > 10 && (
          <div className="text-xs text-muted-foreground text-center py-1">
            {t(`还有 ${changes.length - 10} 条变更...`, `${changes.length - 10} more changes...`)}
          </div>
        )}
      </div>
    );
  };

  const defaultTrigger = (
    <Button variant="outline" size="sm" className="gap-2" type="button" onClick={() => setOpen(true)}>
      <History className="h-4 w-4" />
      {t('变更历史', 'Change History')}
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
            <History className="h-5 w-5 shrink-0" />
            {t('权限变更历史', 'Permission Change History')}
          </span>
        }
        description={t('查看谁在什么时候修改了哪些权限', 'View who changed which permissions and when')}
        sheetMaxWidth="2xl"
      >
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={() => fetchLogs()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            {t('刷新', 'Refresh')}
          </Button>
        </div>

        <ScrollArea className="h-[min(400px,55vh)] pr-4">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              {t('加载中...', 'Loading...')}
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <History className="h-12 w-12 mb-4 opacity-50" />
              <p>{t('暂无变更记录', 'No change records yet')}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {logs.map((log) => {
                const actionLabel = ACTION_TYPE_LABELS[log.action_type] || ACTION_TYPE_LABELS.update;
                const roleLabel = ROLE_LABELS[log.target_role as keyof typeof ROLE_LABELS] || { zh: log.target_role, en: log.target_role };
                const isExpanded = expandedLogs.has(log.id);
                const changesCount = (log.changes_summary || []).length;

                return (
                  <Collapsible key={log.id} open={isExpanded} onOpenChange={() => toggleExpand(log.id)}>
                    <div className="border rounded-lg overflow-hidden">
                      <CollapsibleTrigger className="w-full p-3 flex items-center gap-3 hover:bg-muted/50 transition-colors">
                        <div className="flex-shrink-0">
                          {getActionIcon(log.action_type)}
                        </div>
                        <div className="flex-1 text-left">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium">{log.changed_by_name}</span>
                            <Badge variant={actionLabel.color}>
                              {t(actionLabel.zh, actionLabel.en)}
                            </Badge>
                            <Badge variant="secondary">
                              {t(roleLabel.zh, roleLabel.en)}
                            </Badge>
                            {log.template_name && (
                              <Badge variant="outline" className="gap-1">
                                <Wand2 className="h-3 w-3" />
                                {log.template_name}
                              </Badge>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
                            <span>{formatBeijingTime(log.changed_at)}</span>
                            <span>•</span>
                            <span>{t(`${changesCount} 项变更`, `${changesCount} changes`)}</span>
                          </div>
                        </div>
                        <div className="flex-shrink-0">
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          )}
                        </div>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="border-t px-3 pb-3">
                          {renderChangeDetails(log)}
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
    </>
  );
}
