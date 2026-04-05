import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { notify } from "@/lib/notifyHub";
import { exportToCSV, formatDateTimeForExport } from "@/lib/exportUtils";
import type { TimeRangeType, DateRange } from "@/lib/dateFilter";
import { getTimeRangeDates } from "@/lib/dateFilter";
import {
  fetchAuditLogsPage,
  type AuditLogEntry,
  type ModuleType,
  type OperationType,
  getModuleName,
  getOperationName,
  isRestorableModule,
  normalizeOperationTypeKey,
} from "@/services/audit/auditLogService";
import { OPERATION_LOGS_PAGE_SIZE } from "./operationLogsHelpers";

type TFunc = (zh: string, en: string) => string;

export interface UseOperationLogsTableOptions {
  effectiveTenantId: string | null;
  enabled: boolean;
  userIsAdmin: boolean;
  language: string;
  t: TFunc;
  requestExport: (fn: () => void | Promise<void>) => void;
}

export interface OperationLogsTableKpiItem {
  label: string;
  value: string;
}

export function useOperationLogsTable({
  effectiveTenantId,
  enabled,
  userIsAdmin,
  language,
  t,
  requestExport,
}: UseOperationLogsTableOptions) {
  const queryClient = useQueryClient();
  const lang = language as "zh" | "en";

  const [searchTerm, setSearchTerm] = useState("");
  const [moduleFilter, setModuleFilter] = useState<string>("all");
  const [operationFilter, setOperationFilter] = useState<string>("all");
  const [operatorFilter, setOperatorFilter] = useState<string>("all");
  const [restoreStatusFilter, setRestoreStatusFilter] = useState<string>(
    "all",
  );

  const [selectedRange, setSelectedRange] = useState<TimeRangeType>("近7天");
  const [dateRange, setDateRange] = useState<DateRange>(() =>
    getTimeRangeDates("近7天"),
  );

  const PAGE_SIZE = OPERATION_LOGS_PAGE_SIZE;
  const [currentPage, setCurrentPage] = useState(1);

  const [selectedLogs, setSelectedLogs] = useState<Set<string>>(new Set());
  const [batchRestoreConfirm, setBatchRestoreConfirm] = useState(false);
  const [batchRestoring, setBatchRestoring] = useState(false);
  const [batchPreviewOpen, setBatchPreviewOpen] = useState(false);

  const [exporting, setExporting] = useState(false);

  const queryFilters = useMemo(
    () => ({
      module: moduleFilter,
      operationType: operationFilter,
      operatorAccount: operatorFilter,
      restoreStatus: restoreStatusFilter,
      searchTerm: searchTerm || undefined,
      tenantId: effectiveTenantId,
      dateRange:
        dateRange.start || dateRange.end
          ? { start: dateRange.start, end: dateRange.end }
          : undefined,
    }),
    [
      moduleFilter,
      operationFilter,
      operatorFilter,
      restoreStatusFilter,
      searchTerm,
      effectiveTenantId,
      dateRange,
    ],
  );

  const {
    data: auditLogsPage,
    isLoading: loading,
    isError: isErrorLogs,
  } = useQuery({
    queryKey: [
      "operation-logs",
      effectiveTenantId ?? "",
      currentPage,
      searchTerm,
      moduleFilter,
      operationFilter,
      operatorFilter,
      restoreStatusFilter,
      dateRange,
    ],
    queryFn: async () =>
      fetchAuditLogsPage(currentPage, PAGE_SIZE, queryFilters),
    refetchOnMount: "always",
    retry: 3,
    enabled,
  });

  const handleDateRangeChange = useCallback(
    (range: TimeRangeType, start?: Date, end?: Date) => {
      setSelectedRange(range);
      if (range === "自定义" && start && end) {
        setDateRange(getTimeRangeDates(range, start, end));
      } else {
        setDateRange(getTimeRangeDates(range));
      }
    },
    [],
  );

  const handleRefresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["operation-logs"] });
    notify.success(t("日志已刷新", "Logs refreshed"));
  }, [queryClient, t]);

  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      const allData = await fetchAuditLogsPage(
        1,
        10000,
        queryFilters,
        true,
      );
      exportToCSV(
        allData.logs,
        [
          {
            key: "timestamp",
            label: "时间",
            labelEn: "Time",
            formatter: (v) => formatDateTimeForExport(v),
          },
          { key: "operatorAccount", label: "操作员", labelEn: "Operator" },
          { key: "operatorRole", label: "角色", labelEn: "Role" },
          {
            key: "module",
            label: "模块",
            labelEn: "Module",
            formatter: (v) => getModuleName(v as ModuleType, lang),
          },
          {
            key: "operationType",
            label: "操作类型",
            labelEn: "Operation",
            formatter: (v) => getOperationName(v as OperationType, lang),
          },
          { key: "objectId", label: "对象ID", labelEn: "Object ID" },
          { key: "objectDescription", label: "描述", labelEn: "Description" },
          {
            key: "isRestored",
            label: "已恢复",
            labelEn: "Restored",
            formatter: (v) => (v ? t("是", "Yes") : t("否", "No")),
          },
        ],
        t("操作审计日志", "Audit Logs"),
        language === "en",
      );
      notify.success(
        t(
          `已导出 ${allData.logs.length} 条记录`,
          `Exported ${allData.logs.length} records`,
        ),
      );
    } catch {
      notify.error(t("导出失败", "Export failed"));
    } finally {
      setExporting(false);
    }
  }, [queryFilters, t, language, lang]);

  const requestExportWithConfirm = useCallback(() => {
    requestExport(handleExport);
  }, [requestExport, handleExport]);

  const filteredLogs = auditLogsPage?.logs ?? [];
  const totalCount = auditLogsPage?.totalCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const paginatedLogs = filteredLogs;

  useEffect(() => {
    setCurrentPage(1);
  }, [
    searchTerm,
    moduleFilter,
    operationFilter,
    operatorFilter,
    restoreStatusFilter,
    dateRange,
  ]);

  const canRestore = useCallback(
    (log: AuditLogEntry) => {
      const isUndoOperation = String(log.objectDescription ?? "").includes(
        "撤回",
      );
      return (
        userIsAdmin &&
        !!log.beforeData &&
        isRestorableModule(log.module) &&
        !log.isRestored &&
        normalizeOperationTypeKey(log.operationType) !== "restore" &&
        !isUndoOperation
      );
    },
    [userIsAdmin],
  );

  const restorableLogs = useMemo(() => {
    return filteredLogs.filter((log) => canRestore(log));
  }, [filteredLogs, canRestore]);

  const logKpiItems = useMemo(
    (): OperationLogsTableKpiItem[] => [
      { label: t("总记录数", "Total records"), value: String(totalCount) },
      { label: t("本页", "This page"), value: String(paginatedLogs.length) },
      {
        label: t("可恢复（本页）", "Restorable (page)"),
        value: String(restorableLogs.length),
      },
      { label: t("已选中", "Selected"), value: String(selectedLogs.size) },
    ],
    [totalCount, paginatedLogs.length, restorableLogs.length, selectedLogs.size, t],
  );

  const handleSelectAll = useCallback(() => {
    if (selectedLogs.size === restorableLogs.length) {
      setSelectedLogs(new Set());
    } else {
      setSelectedLogs(new Set(restorableLogs.map((log) => log.id)));
    }
  }, [selectedLogs.size, restorableLogs]);

  const handleSelectLog = useCallback((logId: string) => {
    setSelectedLogs((prev) => {
      const next = new Set(prev);
      if (next.has(logId)) next.delete(logId);
      else next.add(logId);
      return next;
    });
  }, []);

  const clearFilters = useCallback((opts?: { includeSearch?: boolean }) => {
    setModuleFilter("all");
    setOperationFilter("all");
    setOperatorFilter("all");
    setRestoreStatusFilter("all");
    if (opts?.includeSearch) setSearchTerm("");
  }, []);

  const finishBatchRestoreUi = useCallback(() => {
    setBatchRestoring(false);
    setBatchRestoreConfirm(false);
    setSelectedLogs(new Set());
  }, []);

  return {
    queryClient,
    PAGE_SIZE,
    searchTerm,
    setSearchTerm,
    moduleFilter,
    setModuleFilter,
    operationFilter,
    setOperationFilter,
    operatorFilter,
    setOperatorFilter,
    restoreStatusFilter,
    setRestoreStatusFilter,
    selectedRange,
    dateRange,
    handleDateRangeChange,
    currentPage,
    setCurrentPage,
    auditLogsPage,
    loading,
    isErrorLogs,
    filteredLogs,
    totalCount,
    totalPages,
    paginatedLogs,
    selectedLogs,
    setSelectedLogs,
    batchRestoreConfirm,
    setBatchRestoreConfirm,
    batchRestoring,
    setBatchRestoring,
    batchPreviewOpen,
    setBatchPreviewOpen,
    exporting,
    handleRefresh,
    handleExport,
    requestExportWithConfirm,
    restorableLogs,
    canRestore,
    logKpiItems,
    handleSelectAll,
    handleSelectLog,
    clearFilters,
    finishBatchRestoreUi,
  };
}

export type OperationLogsTableState = ReturnType<typeof useOperationLogsTable>;
