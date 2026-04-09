import DateRangeFilter from "@/components/DateRangeFilter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { MobileFilterBar } from "@/components/ui/mobile-filter-bar";
import { RefreshCw, Search, Loader2, Download } from "lucide-react";
import {
  MODULE_NAMES,
  OPERATION_NAMES,
  ModuleType,
  OperationType,
  getModuleName,
  getOperationName,
} from "@/services/audit/auditLogService";
import { TimeRangeType, DateRange } from "@/lib/dateFilter";
import type { AuditLogEntry } from "@/services/audit/auditLogService";
import { useExportConfirm } from "@/hooks/ui/useExportConfirm";

type Lang = "zh" | "en";
type ExportConfirm = ReturnType<typeof useExportConfirm>;

export function OperationLogsFilterPanel(props: {
  useCompactLayout: boolean;
  t: (zh: string, en: string) => string;
  language: Lang;
  selectedRange: TimeRangeType;
  dateRange: DateRange;
  onDateRangeChange: (range: TimeRangeType, start?: Date, end?: Date) => void;
  onRefresh: () => void;
  exporting: boolean;
  exportConfirm: ExportConfirm;
  onExport: () => void | Promise<void>;
  searchTerm: string;
  onSearchTermChange: (v: string) => void;
  moduleFilter: string;
  onModuleFilterChange: (v: string) => void;
  operationFilter: string;
  onOperationFilterChange: (v: string) => void;
  operatorFilter: string;
  onOperatorFilterChange: (v: string) => void;
  restoreStatusFilter: string;
  onRestoreStatusFilterChange: (v: string) => void;
  filteredLogs: AuditLogEntry[];
  distinctOperators: string[] | undefined;
  onClearFilters: (includeSearch: boolean) => void;
}) {
  const {
    useCompactLayout,
    t,
    language,
    selectedRange,
    dateRange,
    onDateRangeChange,
    onRefresh,
    exporting,
    exportConfirm,
    onExport,
    searchTerm,
    onSearchTermChange,
    moduleFilter,
    onModuleFilterChange,
    operationFilter,
    onOperationFilterChange,
    operatorFilter,
    onOperatorFilterChange,
    restoreStatusFilter,
    onRestoreStatusFilterChange,
    filteredLogs,
    distinctOperators,
    onClearFilters,
  } = props;

  if (useCompactLayout) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-1.5">
          <div className="flex-1 min-w-0 overflow-x-auto mobile-tabs-scroll">
            <DateRangeFilter value={selectedRange} onChange={onDateRangeChange} dateRange={dateRange} />
          </div>
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9 shrink-0 rounded-lg touch-manipulation"
            aria-label="Refresh"
            onClick={onRefresh}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9 shrink-0 rounded-lg touch-manipulation"
            aria-label="Export"
            disabled={exporting}
            onClick={() => exportConfirm.requestExport(onExport)}
          >
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          </Button>
        </div>

        <MobileFilterBar
          searchValue={searchTerm}
          onSearchChange={onSearchTermChange}
          placeholder={t("搜索操作人、描述...", "Search operator, desc...")}
          activeFilterCount={
            [moduleFilter !== "all", operationFilter !== "all", operatorFilter !== "all", restoreStatusFilter !== "all"].filter(
              Boolean,
            ).length
          }
          filterContent={
            <>
              <div className="grid grid-cols-2 gap-2">
                <Select value={moduleFilter} onValueChange={onModuleFilterChange}>
                  <SelectTrigger className="h-10 text-xs touch-manipulation">
                    <SelectValue placeholder={t("模块", "Module")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("全部模块", "All Modules")}</SelectItem>
                    {Object.keys(MODULE_NAMES).map((key) => (
                      <SelectItem key={key} value={key}>
                        {getModuleName(key as ModuleType, language)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={operationFilter} onValueChange={onOperationFilterChange}>
                  <SelectTrigger className="h-10 text-xs touch-manipulation">
                    <SelectValue placeholder={t("操作", "Operation")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("全部操作", "All Operations")}</SelectItem>
                    {Object.keys(OPERATION_NAMES).map((key) => (
                      <SelectItem key={key} value={key}>
                        {getOperationName(key as OperationType, language)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={operatorFilter} onValueChange={onOperatorFilterChange}>
                  <SelectTrigger className="h-10 text-xs touch-manipulation">
                    <SelectValue placeholder={t("操作人", "Operator")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("全部操作人", "All Operators")}</SelectItem>
                    {Array.from(new Set(filteredLogs.map((log) => log.operatorAccount))).map((account) => (
                      <SelectItem key={String(account ?? "")} value={String(account ?? "")}>
                        {String(account ?? "")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={restoreStatusFilter} onValueChange={onRestoreStatusFilterChange}>
                  <SelectTrigger className="h-10 text-xs touch-manipulation">
                    <SelectValue placeholder={t("恢复状态", "Restore")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("全部状态", "All Status")}</SelectItem>
                    <SelectItem value="restored">{t("已恢复", "Restored")}</SelectItem>
                    <SelectItem value="not_restored">{t("未恢复", "Not Restored")}</SelectItem>
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
                  onClick={() => onClearFilters(false)}
                >
                  {t("清除筛选", "Clear")}
                </Button>
              )}
            </>
          }
        />
      </div>
    );
  }

  return (
    <Card className="p-3 sm:p-4 shrink-0">
      <div className="space-y-3">
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <DateRangeFilter value={selectedRange} onChange={onDateRangeChange} dateRange={dateRange} />
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Button variant="outline" size="sm" onClick={onRefresh}>
              <RefreshCw className="h-4 w-4" />
              <span className="ml-1">{t("刷新", "Refresh")}</span>
            </Button>
            <Button variant="outline" size="sm" disabled={exporting} onClick={() => exportConfirm.requestExport(onExport)}>
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              <span className="ml-1">{exporting ? t("导出中…", "Exporting…") : t("导出", "Export")}</span>
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t("搜索操作人、对象ID、描述...", "Search operator, object, desc...")}
              value={searchTerm}
              onChange={(e) => onSearchTermChange(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={moduleFilter} onValueChange={onModuleFilterChange}>
              <SelectTrigger className="w-28 h-9">
                <SelectValue placeholder={t("模块", "Module")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("全部模块", "All Modules")}</SelectItem>
                {Object.keys(MODULE_NAMES).map((key) => (
                  <SelectItem key={key} value={key}>
                    {getModuleName(key as ModuleType, language)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={operationFilter} onValueChange={onOperationFilterChange}>
              <SelectTrigger className="w-24 h-9">
                <SelectValue placeholder={t("操作", "Operation")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("全部操作", "All Operations")}</SelectItem>
                {Object.keys(OPERATION_NAMES).map((key) => (
                  <SelectItem key={key} value={key}>
                    {getOperationName(key as OperationType, language)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={operatorFilter} onValueChange={onOperatorFilterChange}>
              <SelectTrigger className="w-28 h-9">
                <SelectValue placeholder={t("操作人", "Operator")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("全部操作人", "All Operators")}</SelectItem>
                {(distinctOperators ?? []).map((account) => (
                  <SelectItem key={account} value={account}>
                    {account}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={restoreStatusFilter} onValueChange={onRestoreStatusFilterChange}>
              <SelectTrigger className="w-28 h-9">
                <SelectValue placeholder={t("恢复状态", "Restore")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("全部状态", "All Status")}</SelectItem>
                <SelectItem value="restored">{t("已恢复", "Restored")}</SelectItem>
                <SelectItem value="not_restored">{t("未恢复", "Not Restored")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {(moduleFilter !== "all" ||
            operationFilter !== "all" ||
            operatorFilter !== "all" ||
            restoreStatusFilter !== "all" ||
            searchTerm) && (
            <Button variant="ghost" size="sm" className="h-9 text-muted-foreground" onClick={() => onClearFilters(true)}>
              {t("清除筛选", "Clear")}
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
