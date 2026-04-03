// Unified date range filter component with i18n support

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { enUS, zhCN } from "date-fns/locale";
import {
  TIME_RANGES,
  TimeRangeType,
  DateRange,
  getTimeRangeDates,
  formatDateRangeForDisplay,
} from "@/lib/dateFilter";
import { useLanguage } from "@/contexts/LanguageContext";
import { useIsMobile } from "@/hooks/use-mobile";

interface DateRangeFilterProps {
  value: TimeRangeType;
  onChange: (range: TimeRangeType, customStart?: Date, customEnd?: Date) => void;
  dateRange: DateRange;
  className?: string;
  showCustomPicker?: boolean;
  /** Show only the custom date pickers without range buttons */
  customPickerOnly?: boolean;
}

// Translation map for time ranges
const TIME_RANGE_LABELS: Record<TimeRangeType, { zh: string; en: string }> = {
  "全部": { zh: "全部", en: "All" },
  "今日": { zh: "今日", en: "Today" },
  "昨日": { zh: "昨日", en: "Yesterday" },
  "近7天": { zh: "近7天", en: "Last 7 Days" },
  "近30天": { zh: "近30天", en: "Last 30 Days" },
  "本月": { zh: "本月", en: "This Month" },
  "上月": { zh: "上月", en: "Last Month" },
  "自定义": { zh: "自定义", en: "Custom" },
};

const DateRangeFilter = React.forwardRef<HTMLDivElement, DateRangeFilterProps>(
  function DateRangeFilter(
    { value, onChange, dateRange, className, showCustomPicker = true, customPickerOnly = false },
    ref
  ) {
  const { t, language } = useLanguage();
  const isMobile = useIsMobile();
  const [customStartDate, setCustomStartDate] = useState<Date | undefined>();
  const [customEndDate, setCustomEndDate] = useState<Date | undefined>();
  const [isStartOpen, setIsStartOpen] = useState(false);
  const [isEndOpen, setIsEndOpen] = useState(false);

  const calendarLocale = language === "en" ? enUS : zhCN;

  const getLabel = (range: TimeRangeType) =>
    language === "en" ? TIME_RANGE_LABELS[range].en : TIME_RANGE_LABELS[range].zh;

  // When custom time range is selected, apply custom dates
  useEffect(() => {
    if (value === "自定义" && customStartDate && customEndDate) {
      onChange("自定义", customStartDate, customEndDate);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customStartDate, customEndDate]);

  const handleRangeClick = (range: TimeRangeType) => {
    if (range === "自定义") {
      // If no custom dates selected yet, default to last 7 days
      if (!customStartDate || !customEndDate) {
        const { start, end } = getTimeRangeDates("近7天");
        setCustomStartDate(start || undefined);
        setCustomEndDate(end || undefined);
      }
    }
    onChange(range, customStartDate, customEndDate);
  };

  // Format date range for display
  const formatRangeDisplay = (range: DateRange): string => {
    if (!range.start || !range.end) return t('全部时间', 'All Time');
    const formatStr = 'yyyy/MM/dd';
    return `${format(range.start, formatStr)} - ${format(range.end, formatStr)}`;
  };

  const availableRanges = TIME_RANGES;

  // customPickerOnly mode: only render the date pickers
  if (customPickerOnly) {
    return (
      <div ref={ref} className={cn("flex flex-wrap items-center gap-2", className)}>
        <div className={cn("flex items-center gap-2", isMobile && "w-full")}>
          <Popover open={isStartOpen} onOpenChange={setIsStartOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  "h-8 text-xs justify-start font-normal",
                  isMobile ? "flex-1 min-w-0" : "min-w-[110px]",
                  !customStartDate && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-1.5 h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{customStartDate ? format(customStartDate, "yyyy-MM-dd") : t("开始日期", "Start")}</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 z-50" align="start">
              <Calendar
                mode="single"
                selected={customStartDate}
                onSelect={(date) => {
                  setCustomStartDate(date);
                  setIsStartOpen(false);
                }}
                initialFocus
                className="pointer-events-auto"
                locale={calendarLocale}
              />
            </PopoverContent>
          </Popover>
          <span className="text-muted-foreground text-sm shrink-0">{t('至', 'to')}</span>
          <Popover open={isEndOpen} onOpenChange={setIsEndOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  "h-8 text-xs justify-start font-normal",
                  isMobile ? "flex-1 min-w-0" : "min-w-[110px]",
                  !customEndDate && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-1.5 h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{customEndDate ? format(customEndDate, "yyyy-MM-dd") : t("结束日期", "End")}</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 z-50" align="end">
              <Calendar
                mode="single"
                selected={customEndDate}
                onSelect={(date) => {
                  setCustomEndDate(date);
                  setIsEndOpen(false);
                }}
                initialFocus
                className="pointer-events-auto"
                locale={calendarLocale}
              />
            </PopoverContent>
          </Popover>
        </div>
        {dateRange.start && dateRange.end && (
          <span className={cn(
            "text-xs text-muted-foreground bg-muted/50 px-2 py-1 rounded-md",
            isMobile ? "w-full text-center" : "ml-1"
          )}>
            {formatRangeDisplay(dateRange)}
          </span>
        )}
      </div>
    );
  }

  return (
    <div ref={ref} className={cn("flex flex-wrap items-center gap-2 sm:gap-3", className)}>
      {/* Label - hidden on mobile */}
      {!isMobile && (
        <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">
          {t('日期筛选：', 'Date Filter:')}
        </span>
      )}

      {/* Mobile: Select dropdown / Desktop: Button group */}
      {isMobile ? (
        <Select value={value} onValueChange={(v) => handleRangeClick(v as TimeRangeType)}>
          <SelectTrigger className="h-8 text-xs w-auto min-w-[100px]">
            <SelectValue>{getLabel(value)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {availableRanges.map((range) => (
              <SelectItem key={range} value={range}>
                {getLabel(range)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {availableRanges.map((range) => (
            <Button
              key={range}
              variant={value === range ? "default" : "outline"}
              size="sm"
              className={cn(
                "h-8 text-xs px-3 transition-all",
                value === range && "shadow-sm"
              )}
              onClick={() => handleRangeClick(range)}
            >
              {getLabel(range)}
            </Button>
          ))}
        </div>
      )}
      
      {value === "自定义" && showCustomPicker && (
        <div className={cn(
          "flex items-center gap-2",
          isMobile ? "flex-col items-stretch w-full mt-2" : "ml-1"
        )}>
          <div className={cn("flex items-center gap-2", isMobile && "w-full")}>
            <Popover open={isStartOpen} onOpenChange={setIsStartOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className={cn(
                    "h-8 text-xs justify-start font-normal",
                    isMobile ? "flex-1 min-w-0" : "min-w-[110px]",
                    !customStartDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-1.5 h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{customStartDate ? format(customStartDate, "yyyy-MM-dd") : t("开始日期", "Start")}</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 z-50" align="start">
                <Calendar
                  mode="single"
                  selected={customStartDate}
                  onSelect={(date) => {
                    setCustomStartDate(date);
                    setIsStartOpen(false);
                  }}
                  initialFocus
                  className="pointer-events-auto"
                  locale={calendarLocale}
                />
              </PopoverContent>
            </Popover>
            <span className="text-muted-foreground text-sm shrink-0">{t('至', 'to')}</span>
            <Popover open={isEndOpen} onOpenChange={setIsEndOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className={cn(
                    "h-8 text-xs justify-start font-normal",
                    isMobile ? "flex-1 min-w-0" : "min-w-[110px]",
                    !customEndDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-1.5 h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{customEndDate ? format(customEndDate, "yyyy-MM-dd") : t("结束日期", "End")}</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 z-50" align="end">
                <Calendar
                  mode="single"
                  selected={customEndDate}
                  onSelect={(date) => {
                    setCustomEndDate(date);
                    setIsEndOpen(false);
                  }}
                  initialFocus
                  className="pointer-events-auto"
                  locale={calendarLocale}
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>
      )}
      
      {/* Display current filter range - hidden on mobile unless custom */}
      {dateRange.start && dateRange.end && (!isMobile || value === "自定义") && (
        <span className={cn(
          "text-xs text-muted-foreground bg-muted/50 px-2 py-1 rounded-md",
          isMobile ? "w-full text-center" : "ml-1"
        )}>
          {formatRangeDisplay(dateRange)}
        </span>
      )}
    </div>
  );
});

export default DateRangeFilter;
