import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, RefreshCw, Download, Printer } from "lucide-react";
import DateRangeFilter from "@/components/DateRangeFilter";
import type { TimeRangeType, DateRange } from "@/lib/dateFilter";
import { useLanguage } from "@/contexts/LanguageContext";

export interface ReportFiltersProps {
  activeTab: string;
  selectedRange: TimeRangeType;
  dateRange: DateRange;
  onDateRangeChange: (range: TimeRangeType, start?: Date, end?: Date) => void;
  searchTerm: string;
  onSearchChange: (value: string) => void;
  onRefresh: () => void;
  onExport: () => void;
  onPrint: () => void;
  isMobile: boolean;
}

export function ReportFilters({
  activeTab,
  selectedRange,
  dateRange,
  onDateRangeChange,
  searchTerm,
  onSearchChange,
  onRefresh,
  onExport,
  onPrint,
  isMobile,
}: ReportFiltersProps) {
  const { t } = useLanguage();

  return (
    <Card className="p-2 shrink-0">
      <div className={isMobile ? "space-y-2" : "flex items-center justify-between"}>
        {activeTab !== "compare" && activeTab !== "monthly" && (
          <DateRangeFilter
            value={selectedRange}
            onChange={onDateRangeChange}
            dateRange={dateRange}
          />
        )}
        <div className="flex items-center gap-2">
          <div className={isMobile ? "relative flex-1" : "relative"}>
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t("搜索...", "Search...")}
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
              className={isMobile ? "pl-8 h-8 w-full" : "pl-8 w-48 h-8"}
            />
          </div>
          <Button variant="outline" size="sm" className="h-8 shrink-0" onClick={onRefresh}>
            <RefreshCw className="h-4 w-4" />
            {!isMobile && <span className="ml-1">{t("刷新", "Refresh")}</span>}
          </Button>
          <Button variant="outline" size="sm" className="h-8 shrink-0" onClick={onExport}>
            <Download className="h-4 w-4" />
            {!isMobile && <span className="ml-1">{t("导出", "Export")}</span>}
          </Button>
          {!isMobile && (
            <Button variant="outline" size="sm" className="h-8" onClick={onPrint}>
              <Printer className="h-4 w-4 mr-1" />
              {t("打印", "Print")}
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
