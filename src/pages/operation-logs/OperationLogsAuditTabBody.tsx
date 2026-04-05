import { Card, CardContent, CardHeader } from "@/components/ui/card";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RefreshCw, Search, Eye, RotateCcw, Shield, Lock, Loader2, Download, CheckSquare } from "lucide-react";
import { ModuleCoverageDashboard } from "@/components/ModuleCoverageDashboard";
import { Checkbox } from "@/components/ui/checkbox";
import {
  MODULE_NAMES,
  OPERATION_NAMES,
  type AuditLogEntry,
  type ModuleType,
  type OperationType,
  getModuleName,
  getOperationName,
} from "@/services/audit/auditLogService";
import DateRangeFilter from "@/components/DateRangeFilter";
import {
  cleanDescription,
  formatLogFieldValue,
  getReadableObjectId,
  formatIpAddress,
} from "@/lib/fieldLabelMap";
import { PageHeader, KPIGrid } from "@/components/common";
import { formatBeijingTime } from "@/lib/beijingTime";
import {
  MobileCardList,
  MobileCard,
  MobileCardRow,
  MobileCardCollapsible,
  MobilePagination,
  MobileEmptyState,
} from "@/components/ui/mobile-data-card";
import { MobileFilterBar } from "@/components/ui/mobile-filter-bar";
import { OperationTypeBadge } from "./OperationTypeBadge";
import { getLogAccent } from "./operationLogsHelpers";
import type { OperationLogsTableState } from "./useOperationLogsTable";

export interface OperationLogsAuditTabBodyProps {
  t: (zh: string, en: string) => string;
  language: string;
  useCompactLayout: boolean;
  userIsAdmin: boolean;
  table: OperationLogsTableState;
  setViewingLog: (log: AuditLogEntry | null) => void;
  setRestoreConfirm: (log: AuditLogEntry | null) => void;
  setRestorePreview: (log: AuditLogEntry | null) => void;
  setBatchPreviewOpen: (open: boolean) => void;
  setBatchRestoreConfirm: (open: boolean) => void;
}

export function OperationLogsAuditTabBody({
  t,
  language,
  useCompactLayout,
  userIsAdmin,
  table,
  setViewingLog,
  setRestoreConfirm,
  setRestorePreview,
  setBatchPreviewOpen,
  setBatchRestoreConfirm,
}: OperationLogsAuditTabBodyProps) {
  const lang = language as "zh" | "en";
  const {
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
    filteredLogs,
    totalCount,
    totalPages,
    paginatedLogs,
    selectedLogs,
    restorableLogs,
    canRestore,
    logKpiItems,
    handleSelectAll,
    handleSelectLog,
    clearFilters,
    handleRefresh,
    exporting,
    requestExportWithConfirm,
  } = table;

  return (
    <>
      <div className="shrink-0 space-y-3">
        <PageHeader
          description={t(
            "员工后台操作审计（operation_logs）：按时间与模块筛选，可导出；管理员可查看详情并恢复部分变更。",
            "Staff audit trail (operation_logs): filter by time and module, export; admins can open details and restore some changes.",
          )}
        />
        <KPIGrid items={logKpiItems} />
      </div>
      {useCompactLayout ? (
        <>
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <div className="flex-1 min-w-0 overflow-x-auto mobile-tabs-scroll">
                <DateRangeFilter
                  value={selectedRange}
                  onChange={handleDateRangeChange}
                  dateRange={dateRange}
                />
              </div>
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9 shrink-0 rounded-lg touch-manipulation"
                aria-label="Refresh"
                onClick={handleRefresh}
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9 shrink-0 rounded-lg touch-manipulation"
                aria-label="Export"
                disabled={exporting}
                onClick={requestExportWithConfirm}
              >
                {exporting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
              </Button>
            </div>

            <MobileFilterBar
              searchValue={searchTerm}
              onSearchChange={setSearchTerm}
              placeholder={t("搜索操作人、描述...", "Search operator, desc...")}
              activeFilterCount={
                [
                  moduleFilter !== "all",
                  operationFilter !== "all",
                  operatorFilter !== "all",
                  restoreStatusFilter !== "all",
                ].filter(Boolean).length
              }
              filterContent={
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <Select value={moduleFilter} onValueChange={setModuleFilter}>
                      <SelectTrigger className="h-10 text-xs touch-manipulation">
                        <SelectValue placeholder={t("模块", "Module")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">
                          {t("全部模块", "All Modules")}
                        </SelectItem>
                        {Object.keys(MODULE_NAMES).map((key) => (
                          <SelectItem key={key} value={key}>
                            {getModuleName(key as ModuleType, lang)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={operationFilter}
                      onValueChange={setOperationFilter}
                    >
                      <SelectTrigger className="h-10 text-xs touch-manipulation">
                        <SelectValue placeholder={t("操作", "Operation")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">
                          {t("全部操作", "All Operations")}
                        </SelectItem>
                        {Object.keys(OPERATION_NAMES).map((key) => (
                          <SelectItem key={key} value={key}>
                            {getOperationName(key as OperationType, lang)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={operatorFilter}
                      onValueChange={setOperatorFilter}
                    >
                      <SelectTrigger className="h-10 text-xs touch-manipulation">
                        <SelectValue placeholder={t("操作人", "Operator")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">
                          {t("全部操作人", "All Operators")}
                        </SelectItem>
                        {Array.from(
                          new Set(
                            filteredLogs.map((log) => log.operatorAccount),
                          ),
                        ).map((account) => (
                          <SelectItem
                            key={String(account ?? "")}
                            value={String(account ?? "")}
                          >
                            {String(account ?? "")}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={restoreStatusFilter}
                      onValueChange={setRestoreStatusFilter}
                    >
                      <SelectTrigger className="h-10 text-xs touch-manipulation">
                        <SelectValue placeholder={t("恢复状态", "Restore")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">
                          {t("全部状态", "All Status")}
                        </SelectItem>
                        <SelectItem value="restored">
                          {t("已恢复", "Restored")}
                        </SelectItem>
                        <SelectItem value="not_restored">
                          {t("未恢复", "Not Restored")}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {(moduleFilter !== "all" ||
                    operationFilter !== "all" ||
                    operatorFilter !== "all" ||
                    restoreStatusFilter !== "all") && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-10 w-full text-muted-foreground touch-manipulation"
                      onClick={() => clearFilters()}
                    >
                      {t("清除筛选", "Clear")}
                    </Button>
                  )}
                </>
              }
            />
          </div>

          <div className="flex items-center justify-between px-0.5">
            <div className="flex items-center gap-1.5">
              <Shield className="h-4 w-4 text-primary" />
              <span className="text-xs font-medium text-foreground">
                {t("操作日志", "Logs")}
              </span>
              <span className="text-[11px] text-muted-foreground tabular-nums">
                ({totalCount})
              </span>
            </div>
            {userIsAdmin && selectedLogs.size > 0 && (
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setBatchPreviewOpen(true)}
                  className="h-8 text-xs text-blue-600 border-blue-300 touch-manipulation"
                >
                  <Eye className="h-3 w-3 mr-0.5" />
                  {t("预览", "Preview")} ({selectedLogs.size})
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setBatchRestoreConfirm(true)}
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
              <MobileEmptyState
                message={t("暂无审计日志记录", "No audit logs found")}
              />
            ) : (
              paginatedLogs.map((log) => (
                <MobileCard
                  key={log.id}
                  accent={getLogAccent(log.operationType)}
                  className={log.isRestored ? "opacity-50" : ""}
                >
                  <div className="flex items-start gap-2.5">
                    {userIsAdmin && canRestore(log) && (
                      <Checkbox
                        checked={selectedLogs.has(log.id)}
                        onCheckedChange={() => handleSelectLog(log.id)}
                        className="mt-0.5 h-5 w-5 touch-manipulation shrink-0"
                        aria-label={t("选择此记录", "Select")}
                      />
                    )}
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <span className="font-medium text-[13px] block truncate">
                            {log.operatorAccount}
                          </span>
                          <span className="text-[11px] text-muted-foreground tabular-nums">
                            {formatBeijingTime(log.timestamp)}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <OperationTypeBadge
                            type={log.operationType}
                            language={lang}
                          />
                          {log.isRestored && (
                            <Badge
                              variant="outline"
                              className="text-[10px] px-1"
                            >
                              {t("已恢复", "Done")}
                            </Badge>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 text-xs">
                        <Badge
                          variant="secondary"
                          className="text-[10px] px-1.5 py-0 shrink-0"
                        >
                          {getModuleName(log.module, lang)}
                        </Badge>
                        <span
                          className="text-muted-foreground truncate min-w-0"
                          title={String(
                            log.objectDescription || log.objectId || "",
                          )}
                        >
                          {log.objectDescription
                            ? cleanDescription(
                                String(log.objectDescription),
                              ).slice(0, 30)
                            : getReadableObjectId(log)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <MobileCardCollapsible>
                    <MobileCardRow
                      label={t("对象ID", "Object")}
                      value={getReadableObjectId(log)}
                      mono
                    />
                    <MobileCardRow
                      label={t("角色", "Role")}
                      value={formatLogFieldValue(
                        "role",
                        log.operatorRole,
                        lang,
                      )}
                    />
                    <MobileCardRow
                      label="IP"
                      value={formatIpAddress(
                        log.ipAddress != null
                          ? String(log.ipAddress)
                          : undefined,
                        lang,
                      )}
                      mono
                    />
                    {log.objectDescription && (
                      <MobileCardRow
                        label={t("描述", "Desc")}
                        value={cleanDescription(String(log.objectDescription))}
                      />
                    )}
                  </MobileCardCollapsible>

                  <div className="flex items-center gap-2 pt-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 h-9 text-xs touch-manipulation"
                      onClick={() => setViewingLog(log)}
                    >
                      <Eye className="h-3.5 w-3.5 mr-1" />
                      {t("详情", "Details")}
                    </Button>
                    {canRestore(log) && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 h-9 text-xs touch-manipulation text-amber-600 border-amber-200 dark:border-amber-800"
                        onClick={() => setRestoreConfirm(log)}
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
              onPageChange={setCurrentPage}
              pageSize={PAGE_SIZE}
            />
          </MobileCardList>
        </>
      ) : (
        <>
          <Card className="p-3 sm:p-4 shrink-0">
            <div className="space-y-3">
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <DateRangeFilter
                    value={selectedRange}
                    onChange={handleDateRangeChange}
                    dateRange={dateRange}
                  />
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Button variant="outline" size="sm" onClick={handleRefresh}>
                    <RefreshCw className="h-4 w-4" />
                    <span className="ml-1">{t("刷新", "Refresh")}</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={exporting}
                    onClick={requestExportWithConfirm}
                  >
                    {exporting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4" />
                    )}
                    <span className="ml-1">
                      {exporting
                        ? t("导出中…", "Exporting…")
                        : t("导出", "Export")}
                    </span>
                  </Button>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-1 min-w-[200px] max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder={t(
                      "搜索操作人、对象ID、描述...",
                      "Search operator, object, desc...",
                    )}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9 h-9"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Select value={moduleFilter} onValueChange={setModuleFilter}>
                    <SelectTrigger className="w-28 h-9">
                      <SelectValue placeholder={t("模块", "Module")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">
                        {t("全部模块", "All Modules")}
                      </SelectItem>
                      {Object.keys(MODULE_NAMES).map((key) => (
                        <SelectItem key={key} value={key}>
                          {getModuleName(key as ModuleType, lang)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={operationFilter}
                    onValueChange={setOperationFilter}
                  >
                    <SelectTrigger className="w-24 h-9">
                      <SelectValue placeholder={t("操作", "Operation")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">
                        {t("全部操作", "All Operations")}
                      </SelectItem>
                      {Object.keys(OPERATION_NAMES).map((key) => (
                        <SelectItem key={key} value={key}>
                          {getOperationName(key as OperationType, lang)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={operatorFilter}
                    onValueChange={setOperatorFilter}
                  >
                    <SelectTrigger className="w-28 h-9">
                      <SelectValue placeholder={t("操作人", "Operator")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">
                        {t("全部操作人", "All Operators")}
                      </SelectItem>
                      {(auditLogsPage?.distinctOperators ?? []).map(
                        (account) => (
                          <SelectItem key={account} value={account}>
                            {account}
                          </SelectItem>
                        ),
                      )}
                    </SelectContent>
                  </Select>
                  <Select
                    value={restoreStatusFilter}
                    onValueChange={setRestoreStatusFilter}
                  >
                    <SelectTrigger className="w-28 h-9">
                      <SelectValue placeholder={t("恢复状态", "Restore")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">
                        {t("全部状态", "All Status")}
                      </SelectItem>
                      <SelectItem value="restored">
                        {t("已恢复", "Restored")}
                      </SelectItem>
                      <SelectItem value="not_restored">
                        {t("未恢复", "Not Restored")}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {(moduleFilter !== "all" ||
                  operationFilter !== "all" ||
                  operatorFilter !== "all" ||
                  restoreStatusFilter !== "all" ||
                  searchTerm) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-9 text-muted-foreground"
                    onClick={() => clearFilters({ includeSearch: true })}
                  >
                    {t("清除筛选", "Clear")}
                  </Button>
                )}
              </div>
            </div>
          </Card>

          <ModuleCoverageDashboard
            logs={filteredLogs}
            serverModuleCounts={auditLogsPage?.moduleCounts}
            totalCount={totalCount}
          />

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
                  {userIsAdmin && selectedLogs.size > 0 && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setBatchPreviewOpen(true)}
                        className="text-blue-600 hover:text-blue-700 border-blue-300"
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        {t("预览选中", "Preview")} ({selectedLogs.size})
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setBatchRestoreConfirm(true)}
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
                      {userIsAdmin && (
                        <TableHead className="w-[40px]">
                          <Checkbox
                            checked={
                              restorableLogs.length > 0 &&
                              selectedLogs.size === restorableLogs.length
                            }
                            onCheckedChange={handleSelectAll}
                            aria-label="全选可恢复的记录"
                          />
                        </TableHead>
                      )}
                      <TableHead className="whitespace-nowrap px-1.5">
                        {t("操作时间", "Time")}
                      </TableHead>
                      <TableHead className="whitespace-nowrap px-1.5">
                        {t("操作人", "Operator")}
                      </TableHead>
                      <TableHead className="whitespace-nowrap px-1.5">
                        {t("角色", "Role")}
                      </TableHead>
                      <TableHead className="whitespace-nowrap px-1.5">
                        {t("操作模块", "Module")}
                      </TableHead>
                      <TableHead className="whitespace-nowrap px-1.5">
                        {t("操作对象ID", "Object ID")}
                      </TableHead>
                      <TableHead className="whitespace-nowrap px-1.5">
                        {t("操作类型", "Type")}
                      </TableHead>
                      <TableHead className="whitespace-nowrap px-1.5">
                        IP
                      </TableHead>
                      <TableHead className="whitespace-nowrap px-1.5 text-center sticky right-0 z-20 bg-muted shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.15)]">
                        {t("操作", "Actions")}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedLogs.map((log) => (
                      <TableRow
                        key={log.id}
                        className={log.isRestored ? "opacity-50" : ""}
                      >
                        {userIsAdmin && (
                          <TableCell>
                            {canRestore(log) ? (
                              <Checkbox
                                checked={selectedLogs.has(log.id)}
                                onCheckedChange={() => handleSelectLog(log.id)}
                                aria-label="选择此记录"
                              />
                            ) : (
                              <span className="w-4 h-4 block" />
                            )}
                          </TableCell>
                        )}
                        <TableCell className="font-mono whitespace-nowrap px-1.5">
                          {formatBeijingTime(log.timestamp)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap px-1.5">
                          {log.operatorAccount}
                        </TableCell>
                        <TableCell className="text-muted-foreground whitespace-nowrap px-1.5">
                          {formatLogFieldValue(
                            "role",
                            log.operatorRole,
                            lang,
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap px-1.5">
                          {getModuleName(log.module, lang)}
                        </TableCell>
                        <TableCell
                          className="max-w-[160px] truncate px-1.5"
                          title={String(
                            log.objectDescription || log.objectId || "",
                          )}
                        >
                          {getReadableObjectId(log)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap px-1.5">
                          <OperationTypeBadge
                            type={log.operationType}
                            language={lang}
                          />
                          {log.isRestored && (
                            <Badge variant="outline" className="ml-1 text-xs">
                              {t("已恢复", "Restored")}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground whitespace-nowrap px-1.5">
                          {formatIpAddress(
                            log.ipAddress != null
                              ? String(log.ipAddress)
                              : undefined,
                            lang,
                          )}
                        </TableCell>
                        <TableCell className="text-center whitespace-nowrap px-1.5 sticky right-0 z-10 bg-background shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.08)]">
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2"
                              onClick={() => setViewingLog(log)}
                            >
                              <Eye className="h-3 w-3 mr-1" />
                              {t("详情", "Details")}
                            </Button>
                            {canRestore(log) && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-blue-600 hover:text-blue-700"
                                  onClick={() => setRestorePreview(log)}
                                >
                                  <Eye className="h-3 w-3 mr-1" />
                                  {t("预览", "Preview")}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-amber-600 hover:text-amber-700"
                                  onClick={() => setRestoreConfirm(log)}
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
                        <TableCell
                          colSpan={userIsAdmin ? 9 : 8}
                          className="text-center text-muted-foreground py-8"
                        >
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
                pageSize={PAGE_SIZE}
                onPageChange={setCurrentPage}
                onPageSizeChange={() => {}}
                pageSizeOptions={[50]}
              />
            </CardContent>
          </Card>
        </>
      )}
    </>
  );
}
