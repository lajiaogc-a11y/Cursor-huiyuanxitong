import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Eye, RotateCcw, Loader2, AlertTriangle } from "lucide-react";
import {
  type AuditLogEntry,
  getModuleName,
  getObjectDiff,
} from "@/services/audit/auditLogService";
import {
  translateFieldName,
  formatDisplayValue,
  formatLogFieldValue,
  getReadableObjectId,
  cleanDescription,
  HIDDEN_LOG_FIELDS,
  formatIpAddress,
} from "@/lib/fieldLabelMap";
import { summarizeOperationLogPayloadIssues } from "@/lib/operationLogPayload";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { DrawerDetail } from "@/components/shell/DrawerDetail";
import { formatBeijingTime } from "@/lib/beijingTime";
import { OperationTypeBadge } from "./OperationTypeBadge";
import { filterHiddenFields } from "./operationLogsHelpers";

export interface OperationLogsDrawersProps {
  t: (zh: string, en: string) => string;
  language: string;
  isMobile: boolean;
  viewingLog: AuditLogEntry | null;
  setViewingLog: (log: AuditLogEntry | null) => void;
  restoreConfirm: AuditLogEntry | null;
  setRestoreConfirm: (log: AuditLogEntry | null) => void;
  restorePreview: AuditLogEntry | null;
  setRestorePreview: (log: AuditLogEntry | null) => void;
  batchPreviewOpen: boolean;
  setBatchPreviewOpen: (open: boolean) => void;
  batchRestoreConfirm: boolean;
  setBatchRestoreConfirm: (open: boolean) => void;
  selectedLogs: Set<string>;
  filteredLogs: AuditLogEntry[];
  batchRestoring: boolean;
  isRestoring: boolean;
  handleBatchRestore: () => void | Promise<void>;
  handleRestore: (log: AuditLogEntry, skipBusyGuard?: boolean) => Promise<boolean>;
}

export function OperationLogsDrawers({
  t,
  language,
  isMobile,
  viewingLog,
  setViewingLog,
  restoreConfirm,
  setRestoreConfirm,
  restorePreview,
  setRestorePreview,
  batchPreviewOpen,
  setBatchPreviewOpen,
  batchRestoreConfirm,
  setBatchRestoreConfirm,
  selectedLogs,
  filteredLogs,
  batchRestoring,
  isRestoring,
  handleBatchRestore,
  handleRestore,
}: OperationLogsDrawersProps) {
  const lang = language as "zh" | "en";

  const formatValue = (value: unknown, fieldKey?: string): string => {
    if (fieldKey)
      return formatLogFieldValue(fieldKey, value, lang);
    return formatDisplayValue(value, lang);
  };

  const getDiffDisplay = (log: AuditLogEntry) => {
    return getObjectDiff(log.beforeData, log.afterData);
  };

  const viewingLogPayloadNotes = useMemo(() => {
    if (!viewingLog) return [];
    return summarizeOperationLogPayloadIssues(
      language === "en" ? "en" : "zh",
      viewingLog.beforeData,
      viewingLog.afterData,
    );
  }, [viewingLog, language]);

  return (
    <>
      <DrawerDetail
        open={!!viewingLog}
        onOpenChange={(open) => {
          if (!open) setViewingLog(null);
        }}
        title={
          <span className="flex items-center gap-2">
            <Eye className="h-5 w-5 shrink-0" />
            {t("操作详情", "Operation Details")}
          </span>
        }
        sheetMaxWidth="4xl"
      >
        {viewingLog && (
          <div className={cn("space-y-5", isMobile ? "pr-1" : "pr-1")}>
            <div className={isMobile ? "space-y-2" : "grid grid-cols-4 gap-4"}>
              <div className={isMobile ? "flex items-center justify-between" : ""}>
                <Label className="text-xs text-muted-foreground">
                  {t("操作时间", "Time")}
                </Label>
                <p className="font-mono text-sm">
                  {formatBeijingTime(viewingLog.timestamp)}
                </p>
              </div>
              <div className={isMobile ? "flex items-center justify-between" : ""}>
                <Label className="text-xs text-muted-foreground">
                  {t("操作人账号", "Operator")}
                </Label>
                <p className="text-sm">{viewingLog.operatorAccount}</p>
              </div>
              <div className={isMobile ? "flex items-center justify-between" : ""}>
                <Label className="text-xs text-muted-foreground">
                  {t("操作人角色", "Role")}
                </Label>
                <p className="text-sm">
                  {formatLogFieldValue(
                    "role",
                    viewingLog.operatorRole,
                    lang,
                  )}
                </p>
              </div>
              <div className={isMobile ? "flex items-center justify-between" : ""}>
                <Label className="text-xs text-muted-foreground">
                  {t("操作IP", "IP Address")}
                </Label>
                <p
                  className="font-mono text-sm"
                  title={viewingLog.ipAddress || undefined}
                >
                  {formatIpAddress(
                    viewingLog.ipAddress != null
                      ? String(viewingLog.ipAddress)
                      : undefined,
                    lang,
                  )}
                </p>
              </div>
              <div className={isMobile ? "flex items-center justify-between" : ""}>
                <Label className="text-xs text-muted-foreground">
                  {t("操作模块", "Module")}
                </Label>
                <p className="text-sm">
                  {getModuleName(viewingLog.module, lang)}
                </p>
              </div>
              <div className={isMobile ? "flex items-center justify-between" : ""}>
                <Label className="text-xs text-muted-foreground">
                  {t("操作类型", "Type")}
                </Label>
                <div>
                  <OperationTypeBadge
                    type={viewingLog.operationType}
                    language={lang}
                  />
                </div>
              </div>
              <div className={isMobile ? "" : "col-span-2"}>
                <Label className="text-xs text-muted-foreground">
                  {t("操作对象", "Object")}
                </Label>
                <p className="break-all text-sm">
                  {getReadableObjectId(viewingLog)}
                </p>
              </div>
            </div>

            {viewingLog.objectDescription && (
              <div>
                <Label className="text-muted-foreground">
                  {t("操作描述", "Description")}
                </Label>
                <p>{cleanDescription(String(viewingLog.objectDescription))}</p>
              </div>
            )}

            {viewingLogPayloadNotes.length > 0 && (
              <Alert className="border-amber-200 bg-amber-50/90 dark:border-amber-800 dark:bg-amber-950/25">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <AlertTitle className="text-amber-900 dark:text-amber-100">
                  {t("数据快照说明", "About this snapshot")}
                </AlertTitle>
                <AlertDescription className="space-y-2 text-xs text-amber-900/95 dark:text-amber-50/90">
                  {viewingLogPayloadNotes.map((msg, i) => (
                    <p key={i} className="leading-relaxed">
                      {msg}
                    </p>
                  ))}
                </AlertDescription>
              </Alert>
            )}

            {(viewingLog.beforeData || viewingLog.afterData) && (
              <div className="space-y-4">
                <Label className="text-lg font-semibold">
                  {t("数据变更对比", "Data Change Comparison")}
                </Label>
                {getDiffDisplay(viewingLog).length > 0 && (
                  <div className="rounded-lg border bg-muted/30 p-4">
                    <Label className="mb-2 block text-sm text-muted-foreground">
                      {t("变更字段高亮", "Changed Fields")}
                    </Label>
                    <div className="space-y-2">
                      {getDiffDisplay(viewingLog)
                        .filter(
                          (diff) =>
                            !HIDDEN_LOG_FIELDS.has(diff.key) &&
                            !String(diff.key).startsWith("__"),
                        )
                        .map((diff, index) => (
                          <div
                            key={index}
                            className={cn(
                              "text-sm",
                              isMobile ? "space-y-1" : "flex items-start gap-4",
                            )}
                          >
                            <span
                              className={cn(
                                "font-medium text-foreground",
                                isMobile ? "block text-xs" : "min-w-[140px]",
                              )}
                            >
                              {translateFieldName(diff.key, lang)}:
                            </span>
                            <div
                              className={cn(
                                "flex-1",
                                isMobile
                                  ? "grid grid-cols-2 gap-1.5"
                                  : "flex gap-4",
                              )}
                            >
                              <div className="min-w-0 flex-1">
                                <span className="block text-[10px] text-muted-foreground">
                                  {t("修改前", "Before")}
                                </span>
                                <span className="mt-0.5 block break-all rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-700 dark:bg-red-900/30 dark:text-red-300">
                                  {formatValue(diff.before, diff.key)}
                                </span>
                              </div>
                              <div className="min-w-0 flex-1">
                                <span className="block text-[10px] text-muted-foreground">
                                  {t("修改后", "After")}
                                </span>
                                <span className="mt-0.5 block break-all rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-700 dark:bg-green-900/30 dark:text-green-300">
                                  {formatValue(diff.after, diff.key)}
                                </span>
                              </div>
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
                {getDiffDisplay(viewingLog).length === 0 &&
                  viewingLogPayloadNotes.length > 0 && (
                    <p className="text-sm text-muted-foreground">
                      {t(
                        "无法展示字段级对比，请阅读上方「数据快照说明」。",
                        "Field-level comparison is unavailable — see the snapshot notice above.",
                      )}
                    </p>
                  )}
                {getDiffDisplay(viewingLog).length === 0 &&
                  viewingLogPayloadNotes.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      {t(
                        "未发现字段级差异（修改前后快照一致，或仅有非 JSON 的单一值）。",
                        "No field-level differences (snapshots are identical, or only a non-object value was logged).",
                      )}
                    </p>
                  )}
              </div>
            )}
            <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
              <Button onClick={() => setViewingLog(null)}>
                {t("关闭", "Close")}
              </Button>
            </div>
          </div>
        )}
      </DrawerDetail>

      <DrawerDetail
        open={!!restoreConfirm}
        onOpenChange={(open) => {
          if (!open) setRestoreConfirm(null);
        }}
        title={
          <span className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5 shrink-0 text-amber-600" />
            {t("确认恢复数据", "Confirm Data Restore")}
          </span>
        }
        sheetMaxWidth="2xl"
      >
        {restoreConfirm && (
          <div className="space-y-4">
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-900/20">
              <p className="text-sm text-amber-800 dark:text-amber-200">
                {t(
                  "此操作将把数据恢复到修改前的状态。恢复操作本身也会被记录在审计日志中。",
                  "This will restore data to its previous state. The restore action will also be logged.",
                )}
              </p>
            </div>

            <div className={cn("gap-3 text-sm", isMobile ? "space-y-2" : "grid grid-cols-3")}>
              <div className={isMobile ? "flex items-center justify-between" : ""}>
                <Label className="text-xs text-muted-foreground">
                  {t("操作模块", "Module")}
                </Label>
                <p className="text-sm font-medium">
                  {getModuleName(restoreConfirm.module, lang)}
                </p>
              </div>
              <div className={isMobile ? "flex items-center justify-between" : ""}>
                <Label className="text-xs text-muted-foreground">
                  {t("操作类型", "Type")}
                </Label>
                <div>
                  <OperationTypeBadge
                    type={restoreConfirm.operationType}
                    language={lang}
                  />
                </div>
              </div>
              <div className={isMobile ? "flex items-center justify-between" : ""}>
                <Label className="text-xs text-muted-foreground">
                  {t("对象", "Object")}
                </Label>
                <p
                  className="max-w-[60%] truncate text-xs"
                  title={String(restoreConfirm.objectId ?? "")}
                >
                  {getReadableObjectId(restoreConfirm)}
                </p>
              </div>
            </div>

            {restoreConfirm.objectDescription && (
              <div>
                <Label className="text-xs text-muted-foreground">
                  {t("描述", "Description")}
                </Label>
                <p className="text-sm">
                  {cleanDescription(String(restoreConfirm.objectDescription))}
                </p>
              </div>
            )}

            {restoreConfirm.beforeData && (
              <div>
                <Label className="mb-2 block text-sm font-medium text-green-700 dark:text-green-400">
                  {t(
                    "将要恢复的数据 (恢复前状态)",
                    "Data to Restore (Previous State)",
                  )}
                </Label>
                <div className="rounded-lg border bg-green-50/50 p-3 dark:bg-green-900/20">
                  <div className="space-y-2">
                    {filterHiddenFields(restoreConfirm.beforeData)
                      .slice(0, isMobile ? 8 : 15)
                      .map(([key, value]) => (
                        <div
                          key={key}
                          className={cn(
                            "text-xs",
                            isMobile ? "flex flex-col gap-0.5" : "flex gap-2",
                          )}
                        >
                          <span
                            className={cn(
                              "text-muted-foreground",
                              isMobile ? "" : "min-w-[140px]",
                            )}
                          >
                            {translateFieldName(key, lang)}:
                          </span>
                          <span className="break-all text-foreground">
                            {formatValue(value, key)}
                          </span>
                        </div>
                      ))}
                    {filterHiddenFields(restoreConfirm.beforeData).length >
                      15 && (
                      <p className="text-xs italic text-muted-foreground">
                        ...{" "}
                        {t(
                          `还有 ${filterHiddenFields(restoreConfirm.beforeData).length - 15} 个字段`,
                          `${filterHiddenFields(restoreConfirm.beforeData).length - 15} more fields`,
                        )}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
              <Button
                variant="outline"
                onClick={() => setRestoreConfirm(null)}
                disabled={isRestoring}
              >
                {t("取消", "Cancel")}
              </Button>
              <Button
                onClick={() => restoreConfirm && handleRestore(restoreConfirm)}
                className="bg-amber-600 text-white hover:bg-amber-700"
                disabled={isRestoring}
              >
                {isRestoring ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <RotateCcw className="mr-1 h-4 w-4" />
                )}
                {isRestoring
                  ? t("恢复中...", "Restoring...")
                  : t("确认恢复", "Confirm Restore")}
              </Button>
            </div>
          </div>
        )}
      </DrawerDetail>

      <DrawerDetail
        open={!!restorePreview}
        onOpenChange={(open) => {
          if (!open) setRestorePreview(null);
        }}
        title={
          <span className="flex items-center gap-2">
            <Eye className="h-5 w-5 shrink-0" />
            {t("恢复数据预览", "Restore Data Preview")}
          </span>
        }
        sheetMaxWidth="3xl"
      >
        {restorePreview && (
          <div className="space-y-4">
            <div className={cn("gap-3 text-sm", isMobile ? "space-y-1.5" : "grid grid-cols-3")}>
              <div className={isMobile ? "flex items-center justify-between" : ""}>
                <Label className="text-xs text-muted-foreground">
                  {t("操作模块", "Module")}
                </Label>
                <p className="text-sm font-medium">
                  {getModuleName(restorePreview.module, lang)}
                </p>
              </div>
              <div className={isMobile ? "flex items-center justify-between" : ""}>
                <Label className="text-xs text-muted-foreground">
                  {t("操作类型", "Type")}
                </Label>
                <div>
                  <OperationTypeBadge
                    type={restorePreview.operationType}
                    language={lang}
                  />
                </div>
              </div>
              <div className={isMobile ? "flex items-center justify-between" : ""}>
                <Label className="text-xs text-muted-foreground">
                  {t("操作时间", "Time")}
                </Label>
                <p className="font-mono text-xs">
                  {formatBeijingTime(restorePreview.timestamp)}
                </p>
              </div>
            </div>

            <div className={isMobile ? "space-y-4" : "grid grid-cols-2 gap-4"}>
              {restorePreview.beforeData && (
                <div>
                  <Label className="mb-2 block text-sm font-medium text-green-700 dark:text-green-400">
                    {t("恢复后数据 (原始状态)", "Restored Data (Original State)")}
                  </Label>
                  <div className="max-h-[300px] overflow-y-auto rounded-lg border bg-green-50/50 p-3 dark:bg-green-900/20">
                    <div className="space-y-1">
                      {filterHiddenFields(restorePreview.beforeData).map(
                        ([key, value]) => (
                          <div
                            key={key}
                            className={cn(
                              "text-xs",
                              isMobile
                                ? "flex flex-col gap-0.5"
                                : "flex gap-2",
                            )}
                          >
                            <span
                              className={cn(
                                "shrink-0 text-muted-foreground",
                                !isMobile && "min-w-[120px]",
                              )}
                            >
                              {translateFieldName(key, lang)}:
                            </span>
                            <span className="break-all text-foreground">
                              {formatValue(value, key)}
                            </span>
                          </div>
                        ),
                      )}
                    </div>
                  </div>
                </div>
              )}
              {restorePreview.afterData && (
                <div>
                  <Label className="mb-2 block text-sm font-medium text-red-700 dark:text-red-400">
                    {t(
                      "当前状态 (将被覆盖)",
                      "Current State (Will Be Overwritten)",
                    )}
                  </Label>
                  <div className="max-h-[300px] overflow-y-auto rounded-lg border bg-red-50/50 p-3 dark:bg-red-900/20">
                    <div className="space-y-1">
                      {filterHiddenFields(restorePreview.afterData).map(
                        ([key, value]) => (
                          <div
                            key={key}
                            className={cn(
                              "text-xs",
                              isMobile
                                ? "flex flex-col gap-0.5"
                                : "flex gap-2",
                            )}
                          >
                            <span
                              className={cn(
                                "shrink-0 text-muted-foreground",
                                !isMobile && "min-w-[120px]",
                              )}
                            >
                              {translateFieldName(key, lang)}:
                            </span>
                            <span className="break-all text-foreground">
                              {formatValue(value, key)}
                            </span>
                          </div>
                        ),
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
              <Button variant="outline" onClick={() => setRestorePreview(null)}>
                {t("关闭", "Close")}
              </Button>
              <Button
                onClick={() => {
                  const next = restorePreview;
                  setRestorePreview(null);
                  setRestoreConfirm(next);
                }}
                className="bg-amber-600 text-white hover:bg-amber-700"
              >
                <RotateCcw className="mr-1 h-4 w-4" />
                {t("继续恢复", "Continue Restore")}
              </Button>
            </div>
          </div>
        )}
      </DrawerDetail>

      <DrawerDetail
        open={batchPreviewOpen}
        onOpenChange={setBatchPreviewOpen}
        title={
          <span className="flex items-center gap-2">
            <Eye className="h-5 w-5 shrink-0" />
            {t(
              `批量恢复预览 (${selectedLogs.size} 条记录)`,
              `Batch Restore Preview (${selectedLogs.size} items)`,
            )}
          </span>
        }
        sheetMaxWidth="4xl"
      >
        <div className="space-y-4">
          <div className="space-y-3">
            {Array.from(selectedLogs).map((logId) => {
              const log = filteredLogs.find((l) => l.id === logId);
              if (!log) return null;
              return (
                <div key={logId} className="rounded-lg border bg-muted/30 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">
                        {getModuleName(log.module, lang)}
                      </Badge>
                      <OperationTypeBadge
                        type={log.operationType}
                        language={lang}
                      />
                    </div>
                    <span className="font-mono text-xs text-muted-foreground">
                      {formatBeijingTime(log.timestamp)}
                    </span>
                  </div>
                  {log.objectDescription && (
                    <p className="mb-2 text-sm text-foreground">
                      {cleanDescription(String(log.objectDescription))}
                    </p>
                  )}
                  {log.beforeData && (
                    <div className="text-xs text-muted-foreground">
                      <span className="font-medium">
                        {t("恢复数据预览：", "Restore preview: ")}
                      </span>
                      <span className="ml-1 font-mono">
                        {filterHiddenFields(log.beforeData)
                          .slice(0, 3)
                          .map(
                            ([k, v]) =>
                              `${translateFieldName(k, lang)}: ${formatValue(v, k)}`,
                          )
                          .join(" | ")}
                        {filterHiddenFields(log.beforeData).length > 3 && " ..."}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
            <Button variant="outline" onClick={() => setBatchPreviewOpen(false)}>
              {t("关闭", "Close")}
            </Button>
            <Button
              onClick={() => {
                setBatchPreviewOpen(false);
                setBatchRestoreConfirm(true);
              }}
              className="bg-amber-600 text-white hover:bg-amber-700"
            >
              <RotateCcw className="mr-1 h-4 w-4" />
              {t("继续批量恢复", "Continue Batch Restore")}
            </Button>
          </div>
        </div>
      </DrawerDetail>

      <AlertDialog
        open={batchRestoreConfirm}
        onOpenChange={setBatchRestoreConfirm}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("确认批量恢复？", "Confirm Batch Restore?")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                `您已选择 ${selectedLogs.size} 条记录进行批量恢复。此操作将把这些数据恢复到修改前的状态。每条恢复操作都会被记录在审计日志中。`,
                `You have selected ${selectedLogs.size} records for batch restore. This will restore data to previous states. Each restore will be logged.`,
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={batchRestoring}>
              {t("取消", "Cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBatchRestore}
              disabled={batchRestoring}
            >
              {batchRestoring ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  {t("恢复中...", "Restoring...")}
                </>
              ) : (
                t(
                  `确认恢复 ${selectedLogs.size} 条`,
                  `Confirm Restore ${selectedLogs.size} items`,
                )
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
