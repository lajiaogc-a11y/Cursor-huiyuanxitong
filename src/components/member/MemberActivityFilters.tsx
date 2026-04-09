import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import ColumnVisibilityDropdown from "@/components/ColumnVisibilityDropdown";
import type { ColumnConfig } from "@/hooks/ui/useColumnVisibility";

export type TimeRange = "all" | "today" | "yesterday" | "thisMonth" | "lastMonth" | "custom";

export interface MemberActivityFiltersProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  searchError: string;
  onSearchErrorClear: () => void;
  onSearchPaste?: (value: string) => void;
  timeRange: TimeRange;
  onTimeRangeChange: (value: TimeRange) => void;
  customStart: string;
  customEnd: string;
  onCustomStartChange: (value: string) => void;
  onCustomEndChange: (value: string) => void;
  columns: ColumnConfig[];
  visibleColumns: Set<string>;
  onToggleColumn: (key: string) => void;
  onResetColumns: () => void;
  isMobile: boolean;
}

export function MemberActivityFilters({
  searchTerm,
  onSearchChange,
  searchError,
  onSearchErrorClear,
  onSearchPaste,
  timeRange,
  onTimeRangeChange,
  customStart,
  customEnd,
  onCustomStartChange,
  onCustomEndChange,
  columns,
  visibleColumns,
  onToggleColumn,
  onResetColumns,
  isMobile,
}: MemberActivityFiltersProps) {
  const { t } = useLanguage();

  return (
    <div className={isMobile ? "space-y-2" : "flex items-center justify-between"}>
      {/* 搜索框 */}
      <div className={isMobile ? "relative w-full" : "relative"}>
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={t("搜索电话/会员编号...", "Search phone/member code...")}
          value={searchTerm}
          onChange={(e) => {
            onSearchChange(e.target.value);
            onSearchErrorClear();
          }}
          onPaste={
            onSearchPaste
              ? (e) => {
                  e.preventDefault();
                  const pasted = e.clipboardData.getData("text").replace(/[^a-zA-Z0-9]/g, "");
                  onSearchPaste(pasted);
                  onSearchErrorClear();
                }
              : undefined
          }
          className={`pl-9 ${isMobile ? "w-full" : "w-64"} h-8 ${searchError ? "border-red-500" : ""}`}
        />
        {searchError && (
          <div className="absolute left-0 top-full mt-1 text-xs text-red-500">{searchError}</div>
        )}
      </div>

      {/* 筛选器 */}
      <div className={isMobile ? "flex items-center gap-2 flex-wrap" : "flex items-center gap-2"}>
        {!isMobile && (
          <ColumnVisibilityDropdown
            columns={columns}
            visibleColumns={visibleColumns}
            onToggleColumn={onToggleColumn}
            onReset={onResetColumns}
          />
        )}

        {/* 时间范围筛选 */}
        <Select value={timeRange} onValueChange={(v) => onTimeRangeChange(v as TimeRange)}>
          <SelectTrigger className={isMobile ? "w-20 h-8 text-xs" : "w-24 h-8"}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("全部", "All")}</SelectItem>
            <SelectItem value="today">{t("今日", "Today")}</SelectItem>
            <SelectItem value="yesterday">{t("昨日", "Yesterday")}</SelectItem>
            <SelectItem value="thisMonth">{t("本月", "This Month")}</SelectItem>
            <SelectItem value="lastMonth">{t("上月", "Last Month")}</SelectItem>
            <SelectItem value="custom">{t("自定义", "Custom")}</SelectItem>
          </SelectContent>
        </Select>

        {timeRange === "custom" && (
          <div className={isMobile ? "flex items-center gap-1 w-full" : "flex items-center gap-2"}>
            <Input
              type="date"
              value={customStart}
              onChange={(e) => onCustomStartChange(e.target.value)}
              className={isMobile ? "flex-1 h-8 text-xs" : "w-40 h-8"}
            />
            <span className="text-muted-foreground text-xs">{t("至", "to")}</span>
            <Input
              type="date"
              value={customEnd}
              onChange={(e) => onCustomEndChange(e.target.value)}
              className={isMobile ? "flex-1 h-8 text-xs" : "w-40 h-8"}
            />
          </div>
        )}
      </div>
    </div>
  );
}
