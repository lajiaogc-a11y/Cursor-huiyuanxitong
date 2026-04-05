import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StickyScrollTableContainer } from "@/components/ui/sticky-scroll-table";
import { TablePagination } from "@/components/ui/table-pagination";
import {
  MobileCardList,
  MobileCard,
  MobileCardRow,
  MobileCardCollapsible,
  MobilePagination,
  MobileEmptyState,
} from "@/components/ui/mobile-data-card";
import { ModuleCoverageDashboard } from "@/components/ModuleCoverageDashboard";
import { Eye, RotateCcw, Shield, Lock, CheckSquare } from "lucide-react";
import { AuditLogEntry, getModuleName } from "@/services/audit/auditLogService";
import {
  cleanDescription,
  formatIpAddress,
  formatLogFieldValue,
  getReadableObjectId,
} from "@/lib/fieldLabelMap";
import { formatBeijingTime } from "@/lib/beijingTime";
import { OperationLogOperationBadge } from "./OperationLogOperationBadge";
import { getLogAccent } from "./operationLogsHelpers";

type Lang = "zh" | "en";

export function OperationLogsLogsSection(props: {
  useCompactLayout: boolean;
  t: (zh: string, en: string) => string;
  language: Lang;
  isAdmin: () => boolean;
  filteredLogs: AuditLogEntry[];
  serverModuleCounts: Record<string, number> | undefined;
  totalCount: number;
  paginatedLogs: AuditLogEntry[];
  totalPages: number;
  currentPage: number;
  onPageChange: (p: number) => void;
  pageSize: number;
  canRestore: (log: AuditLogEntry) => boolean;
  selectedLogs: Set<string>;
  onSelectLog: (id: string) => void;
  onSelectAll: () => void;
  restorableLogs: AuditLogEntry[];
  onViewDetail: (log: AuditLogEntry) => void;
  onRestoreConfirm: (log: AuditLogEntry) => void;
  onRestorePreview: (log: AuditLogEntry) => void;
  onBatchPreviewOpen: () => void;
  onBatchRestoreConfirmOpen: () => void;
}) {
  const {
    useCompactLayout,
    t,
    language,
    isAdmin,
    filteredLogs,
    serverModuleCounts,
    totalCount,
    paginatedLogs,
    totalPages,
    currentPage,
    onPageChange,
    pageSize,
    canRestore,
    selectedLogs,
    onSelectLog,
    onSelectAll,
    restorableLogs,
    onViewDetail,
    onRestoreConfirm,
    onRestorePreview,
    onBatchPreviewOpen,
    onBatchRestoreConfirmOpen,
  } = props;

  if (useCompactLayout) {
    return (
      <>
        <div className="flex items-center justify-between px-0.5">
          <div className="flex items-center gap-1.5">
            <Shield className="h-4 w-4 text-primary" />
            <span className="text-xs font-medium text-foreground">{t("操作日志", "Logs")}</span>
            <span className="text-[11px] text-muted-foreground tabular-nums">({totalCount})</span>
          </div>
          {isAdmin() && selectedLogs.size > 0 && (
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                onClick={onBatchPreviewOpen}
                className="h-8 text-xs text-blue-600 border-blue-300 touch-manipulation"
              >
                <Eye className="h-3 w-3 mr-0.5" />
                {t("预览", "Preview")} ({selectedLogs.size})
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={onBatchRestoreConfirmOpen}
                className="h-8 text-xs text-amber-600 border-amber-300 touch-manipulation"
              >
                <RotateCcw className="h-3 w-3 mr-0.5" />
                {t("批量恢复", "Batch")} ({selectedLogs.size})
              </Button>
            </div>
          )}
        </div>

        <MobileCardList>
          {paginatedLogs.length === 0 ? (
            <MobileEmptyState message={t("暂无审计日志记录", "No audit logs found")} />
          ) : (
            paginatedLogs.map((log) => (
              <MobileCard key={log.id} accent={getLogAccent(log.operationType)} className={log.isRestored ? "opacity-50" : ""}>
                <div className="flex items-start gap-2.5">
                  {isAdmin() && canRestore(log) && (
                    <Checkbox
                      checked={selectedLogs.has(log.id)}
                      onCheckedChange={() => onSelectLog(log.id)}
                      className="mt-0.5 h-5 w-5 touch-manipulation shrink-0"
                      aria-label={t("选择此记录", "Select")}
                    />
                  )}
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <span className="font-medium text-[13px] block truncate">{log.operatorAccount}</span>
                        <span className="text-[11px] text-muted-foreground tabular-nums">{formatBeijingTime(log.timestamp)}</span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <OperationLogOperationBadge type={log.operationType} language={language} />
                        {log.isRestored && (
                          <Badge variant="outline" className="text-[10px] px-1">
                            {t("已恢复", "Done")}
                          </Badge>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-xs">
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">
                        {getModuleName(log.module, language)}
                      </Badge>
                      <span className="text-muted-foreground truncate min-w-0" title={String(log.objectDescription || log.objectId || "")}>
                        {log.objectDescription ? cleanDescription(String(log.objectDescription)).slice(0, 30) : getReadableObjectId(log)}
                      </span>
                    </div>
                  </div>
                </div>

                <MobileCardCollapsible>
                  <MobileCardRow label={t("对象ID", "Object")} value={getReadableObjectId(log)} mono />
                  <MobileCardRow
                    label={t("角色", "Role")}
                    value={formatLogFieldValue("role", log.operatorRole, language)}
                  />
                  <MobileCardRow
                    label="IP"
                    value={formatIpAddress(log.ipAddress != null ? String(log.ipAddress) : undefined, language)}
                    mono
                  />
                  {log.objectDescription && (
                    <MobileCardRow label={t("描述", "Desc")} value={cleanDescription(String(log.objectDescription))} />
                  )}
                </MobileCardCollapsible>

                <div className="flex items-center gap-2 pt-1.5">
                  <Button size="sm" variant="outline" className="flex-1 h-9 text-xs touch-manipulation" onClick={() => onViewDetail(log)}>
                    <Eye className="h-3.5 w-3.5 mr-1" />
                    {t("详情", "Details")}
                  </Button>
                  {canRestore(log) && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 h-9 text-xs touch-manipulation text-amber-600 border-amber-200 dark:border-amber-800"
                      onClick={() => onRestoreConfirm(log)}
                    >
                      <RotateCcw className="h-3.5 w-3.5 mr-1" />
                      {t("恢复", "Restore")}
                    </Button>
                  )}
                </div>
              </MobileCard>
            ))
          )}
          <MobilePagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalCount}
            onPageChange={onPageChange}
            pageSize={pageSize}
          />
        </MobileCardList>
      </>
    );
  }

  return (
    <>
      <ModuleCoverageDashboard logs={filteredLogs} serverModuleCounts={serverModuleCounts} totalCount={totalCount} />

      <Card>
        <CardHeader className="py-3 px-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 flex-wrap">
              <Shield className="h-5 w-5 text-primary" />
              <Badge variant="outline" className="text-xs gap-1">
                <Lock className="h-3 w-3" />
                {t("只读", "Read-only")}
              </Badge>
              <span className="text-sm text-muted-foreground">
                ({totalCount}
                {t("条", " items")})
              </span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {isAdmin() && selectedLogs.size > 0 && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onBatchPreviewOpen}
                    className="text-blue-600 hover:text-blue-700 border-blue-300"
                  >
                    <Eye className="h-4 w-4 mr-1" />
                    {t("预览选中", "Preview")} ({selectedLogs.size})
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onBatchRestoreConfirmOpen}
                    className="text-amber-600 hover:text-amber-700 border-amber-300"
                  >
                    <CheckSquare className="h-4 w-4 mr-1" />
                    {t("批量恢复", "Batch Restore")} ({selectedLogs.size})
                  </Button>
                </>
              )}
              <span className="text-sm font-normal text-muted-foreground">
                {t(
                  "日志仅追加不可删改；管理员可将数据恢复到修改前状态，恢复操作本身也会被记录",
                  "Logs are append-only; admins can restore data to a prior state — each restore is also logged",
                )}
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <StickyScrollTableContainer minWidth="1200px">
            <Table className="text-xs">
              <TableHeader className="sticky top-0 z-10 bg-muted/80 backdrop-blur-sm">
                <TableRow className="bg-muted/50">
                  {isAdmin() && (
                    <TableHead className="w-[40px]">
                      <Checkbox
                        checked={restorableLogs.length > 0 && selectedLogs.size === restorableLogs.length}
                        onCheckedChange={onSelectAll}
                        aria-label="全选可恢复的记录"
                      />
                    </TableHead>
                  )}
                  <TableHead className="whitespace-nowrap px-1.5">{t("操作时间", "Time")}</TableHead>
                  <TableHead className="whitespace-nowrap px-1.5">{t("操作人", "Operator")}</TableHead>
                  <TableHead className="whitespace-nowrap px-1.5">{t("角色", "Role")}</TableHead>
                  <TableHead className="whitespace-nowrap px-1.5">{t("操作模块", "Module")}</TableHead>
                  <TableHead className="whitespace-nowrap px-1.5">{t("操作对象ID", "Object ID")}</TableHead>
                  <TableHead className="whitespace-nowrap px-1.5">{t("操作类型", "Type")}</TableHead>
                  <TableHead className="whitespace-nowrap px-1.5">IP</TableHead>
                  <TableHead className="whitespace-nowrap px-1.5 text-center sticky right-0 z-20 bg-muted shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.15)]">
                    {t("操作", "Actions")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedLogs.map((log) => (
                  <TableRow key={log.id} className={log.isRestored ? "opacity-50" : ""}>
                    {isAdmin() && (
                      <TableCell>
                        {canRestore(log) ? (
                          <Checkbox
                            checked={selectedLogs.has(log.id)}
                            onCheckedChange={() => onSelectLog(log.id)}
                            aria-label="选择此记录"
                          />
                        ) : (
                          <span className="w-4 h-4 block" />
                        )}
                      </TableCell>
                    )}
                    <TableCell className="font-mono whitespace-nowrap px-1.5">{formatBeijingTime(log.timestamp)}</TableCell>
                    <TableCell className="whitespace-nowrap px-1.5">{log.operatorAccount}</TableCell>
                    <TableCell className="text-muted-foreground whitespace-nowrap px-1.5">
                      {formatLogFieldValue("role", log.operatorRole, language)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap px-1.5">{getModuleName(log.module, language)}</TableCell>
                    <TableCell className="max-w-[160px] truncate px-1.5" title={String(log.objectDescription || log.objectId || "")}>
                      {getReadableObjectId(log)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap px-1.5">
                      <OperationLogOperationBadge type={log.operationType} language={language} />
                      {log.isRestored && (
                        <Badge variant="outline" className="ml-1 text-xs">
                          {t("已恢复", "Restored")}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground whitespace-nowrap px-1.5">
                      {formatIpAddress(log.ipAddress != null ? String(log.ipAddress) : undefined, language)}
                    </TableCell>
                    <TableCell className="text-center whitespace-nowrap px-1.5 sticky right-0 z-10 bg-background shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.08)]">
                      <div className="flex items-center justify-center gap-1">
                        <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => onViewDetail(log)}>
                          <Eye className="h-3 w-3 mr-1" />
                          {t("详情", "Details")}
                        </Button>
                        {canRestore(log) && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-blue-600 hover:text-blue-700"
                              onClick={() => onRestorePreview(log)}
                            >
                              <Eye className="h-3 w-3 mr-1" />
                              {t("预览", "Preview")}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-amber-600 hover:text-amber-700"
                              onClick={() => onRestoreConfirm(log)}
                            >
                              <RotateCcw className="h-3 w-3 mr-1" />
                              {t("恢复", "Restore")}
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {paginatedLogs.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={isAdmin() ? 9 : 8} className="text-center text-muted-foreground py-8">
                      {t("暂无审计日志记录", "No audit logs found")}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </StickyScrollTableContainer>

          <TablePagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalCount}
            pageSize={pageSize}
            onPageChange={onPageChange}
            onPageSizeChange={() => {}}
            pageSizeOptions={[50]}
          />
        </CardContent>
      </Card>
    </>
  );
}
