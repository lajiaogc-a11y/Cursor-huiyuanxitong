import * as React from "react";
import { cn } from "@/lib/utils";
import { Search, SlidersHorizontal, X, RefreshCw } from "lucide-react";
import { Input } from "./input";
import { Button } from "./button";
import { Badge } from "./badge";
import { useLanguage } from "@/contexts/LanguageContext";

interface MobileFilterBarProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  placeholder?: string;
  onRefresh?: () => void;
  refreshing?: boolean;
  filterContent?: React.ReactNode;
  activeFilterCount?: number;
  className?: string;
  actions?: React.ReactNode;
}

export function MobileFilterBar({
  searchValue,
  onSearchChange,
  placeholder,
  onRefresh,
  refreshing,
  filterContent,
  activeFilterCount = 0,
  className,
  actions,
}: MobileFilterBarProps) {
  const [showFilters, setShowFilters] = React.useState(false);
  const { t } = useLanguage();

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={placeholder || t("搜索...", "Search...")}
            className="pl-8 pr-8 h-10 text-sm rounded-lg bg-muted/40 border-border/50 focus:bg-background"
          />
          {searchValue && (
            <button
              onClick={() => onSearchChange("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 h-5 w-5 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/60 touch-manipulation"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {filterContent && (
          <Button
            variant="outline"
            size="icon"
            className={cn(
              "h-10 w-10 shrink-0 rounded-lg relative touch-manipulation",
              showFilters && "bg-primary/10 border-primary/40 text-primary"
            )}
            onClick={() => setShowFilters(!showFilters)}
          >
            <SlidersHorizontal className="h-4 w-4" />
            {activeFilterCount > 0 && (
              <span className="absolute -top-1 -right-1 h-4 min-w-4 px-0.5 flex items-center justify-center rounded-full bg-primary text-primary-foreground text-[9px] font-bold">
                {activeFilterCount}
              </span>
            )}
          </Button>
        )}

        {onRefresh && (
          <Button
            variant="outline"
            size="icon"
            className="h-10 w-10 shrink-0 rounded-lg touch-manipulation"
            onClick={onRefresh}
            disabled={refreshing}
          >
            <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
          </Button>
        )}

        {actions}
      </div>

      {filterContent && showFilters && (
        <div className="rounded-lg border bg-card p-3 space-y-3 animate-in slide-in-from-top-2 duration-200">
          {filterContent}
        </div>
      )}
    </div>
  );
}

interface MobileFilterChipsProps {
  children: React.ReactNode;
  className?: string;
}

export function MobileFilterChips({ children, className }: MobileFilterChipsProps) {
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {children}
    </div>
  );
}

interface MobileFilterChipProps {
  label: string;
  active?: boolean;
  onClick: () => void;
  className?: string;
}

export function MobileFilterChip({ label, active, onClick, className }: MobileFilterChipProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "h-8 px-3 text-xs rounded-full border transition-colors touch-manipulation",
        active
          ? "bg-primary/10 border-primary/40 text-primary font-medium"
          : "bg-muted/40 border-border/50 text-muted-foreground hover:text-foreground",
        className
      )}
    >
      {label}
    </button>
  );
}

interface MobileStatsBarProps {
  items: Array<{ label: string; value: React.ReactNode; highlight?: boolean }>;
  className?: string;
}

export function MobileStatsBar({ items, className }: MobileStatsBarProps) {
  return (
    <div className={cn("flex gap-2 overflow-x-auto scrollbar-hide -mx-0.5 px-0.5", className)}>
      {items.map((item, i) => (
        <div
          key={i}
          className="flex-1 min-w-0 rounded-lg bg-muted/40 border border-border/30 px-3 py-2"
        >
          <p className="text-[10px] text-muted-foreground truncate">{item.label}</p>
          <p
            className={cn(
              "text-sm font-semibold tabular-nums truncate mt-0.5",
              item.highlight ? "text-primary" : "text-foreground"
            )}
          >
            {item.value}
          </p>
        </div>
      ))}
    </div>
  );
}
