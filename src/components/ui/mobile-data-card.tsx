import * as React from "react";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronUp, Inbox } from "lucide-react";
import { Button } from "./button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select";
import { useLanguage } from "@/contexts/LanguageContext";

interface MobileCardListProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export function MobileCardList({ children, className, ...props }: MobileCardListProps) {
  return (
    <div className={cn("flex flex-col gap-2.5", className)} {...props}>
      {children}
    </div>
  );
}

type CardAccent = "default" | "success" | "danger" | "warning" | "info" | "muted";

interface MobileCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  compact?: boolean;
  /** 保留以兼容旧调用；移动端卡片统一为四边同色边框，不再绘制左侧彩色竖条。 */
  accent?: CardAccent;
}

export function MobileCard({ children, className, compact, accent: _accent, ...props }: MobileCardProps) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-card transition-colors",
        "shadow-[0_1px_2px_rgba(0,0,0,0.04)] dark:shadow-none",
        compact ? "px-2.5 py-2.5 space-y-2 sm:px-3" : "px-2.5 py-3 space-y-2.5 sm:px-3.5",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

interface MobileCardGridProps {
  children: React.ReactNode;
  className?: string;
  cols?: 2 | 3;
}

export function MobileCardGrid({ children, className, cols = 2 }: MobileCardGridProps) {
  return (
    <div
      className={cn(
        "gap-x-3 gap-y-1.5 text-xs",
        cols === 3 ? "grid grid-cols-3" : "grid grid-cols-2",
        className
      )}
    >
      {children}
    </div>
  );
}

interface MobileCardGridItemProps {
  label: string;
  value: React.ReactNode;
  highlight?: boolean;
  className?: string;
}

export function MobileCardGridItem({ label, value, highlight, className }: MobileCardGridItemProps) {
  return (
    <div className={cn("flex items-baseline justify-between min-w-0 gap-1 py-0.5", className)}>
      <span className="text-muted-foreground truncate min-w-0 text-[11px]">{label}</span>
      <span
        className={cn(
          "text-right shrink-0 tabular-nums",
          highlight ? "font-semibold text-primary" : "text-foreground"
        )}
      >
        {value ?? "-"}
      </span>
    </div>
  );
}

interface MobileCardHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export function MobileCardHeader({ children, className, ...props }: MobileCardHeaderProps) {
  return (
    <div className={cn("flex items-center justify-between gap-2 min-h-[28px]", className)} {...props}>
      {children}
    </div>
  );
}

interface MobileCardRowProps {
  label: React.ReactNode;
  value: React.ReactNode;
  highlight?: boolean;
  className?: string;
  mono?: boolean;
  /** Merged onto the value cell (e.g. accent color for balance rows) */
  valueClassName?: string;
}

export function MobileCardRow({ label, value, highlight, className, mono, valueClassName }: MobileCardRowProps) {
  return (
    <div className={cn("flex items-center justify-between text-[13px] min-w-0 gap-3 py-[1px]", className)}>
      <span className="text-muted-foreground min-w-0 text-xs shrink-0 flex items-center gap-0.5">{label}</span>
      <span
        className={cn(
          "text-right truncate",
          mono && "font-mono text-xs",
          highlight ? "font-semibold text-primary" : "text-foreground",
          valueClassName
        )}
      >
        {value ?? "-"}
      </span>
    </div>
  );
}

interface MobileCardCollapsibleProps {
  children: React.ReactNode;
  label?: string;
  className?: string;
  defaultOpen?: boolean;
}

export function MobileCardCollapsible({ children, label, className, defaultOpen = false }: MobileCardCollapsibleProps) {
  const [open, setOpen] = React.useState(defaultOpen);
  const contentRef = React.useRef<HTMLDivElement>(null);
  const { t } = useLanguage();

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          "flex items-center gap-1 text-[11px] w-full justify-center py-1.5 rounded-md transition-colors touch-manipulation",
          "text-muted-foreground hover:text-foreground hover:bg-muted/50 active:bg-muted/70"
        )}
      >
        <span>{label || (open ? t("收起", "Collapse") : t("展开详情", "Details"))}</span>
        <ChevronDown
          className={cn(
            "h-3 w-3 transition-transform duration-200",
            open && "rotate-180"
          )}
        />
      </button>
      <div
        className="grid transition-[grid-template-rows] duration-200 ease-out"
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      >
        <div ref={contentRef} className="overflow-hidden">
          <div className="pt-2 pb-0.5 space-y-1 border-t border-border/30 mt-1">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

interface MobileCardActionsProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export function MobileCardActions({ children, className, ...props }: MobileCardActionsProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 pt-2 border-t border-border/30",
        "[&>button]:min-h-[36px] [&>button]:touch-manipulation",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

interface MobileCardDividerProps {
  className?: string;
}

export function MobileCardDivider({ className }: MobileCardDividerProps) {
  return <div className={cn("border-t border-border/20 -mx-1", className)} />;
}

interface MobileEmptyStateProps {
  message?: string;
  className?: string;
}

export function MobileEmptyState({ message, className }: MobileEmptyStateProps) {
  const { t } = useLanguage();
  return (
    <div className={cn("flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground", className)}>
      <div className="h-12 w-12 rounded-full bg-muted/60 flex items-center justify-center">
        <Inbox className="h-6 w-6" />
      </div>
      <p className="text-sm">{message || t("暂无数据", "No data")}</p>
    </div>
  );
}

interface MobileSectionHeaderProps {
  title: string;
  count?: number;
  action?: React.ReactNode;
  className?: string;
}

export function MobileSectionHeader({ title, count, action, className }: MobileSectionHeaderProps) {
  return (
    <div className={cn("flex items-center justify-between py-1.5", className)}>
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {count !== undefined && (
          <span className="text-[11px] text-muted-foreground tabular-nums">({count})</span>
        )}
      </div>
      {action}
    </div>
  );
}

interface MobilePaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  pageSize?: number;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[];
}

export function MobilePagination({
  currentPage,
  totalPages,
  totalItems,
  onPageChange,
  pageSize,
  onPageSizeChange,
  pageSizeOptions = [10, 20, 50, 100],
}: MobilePaginationProps) {
  const { t } = useLanguage();

  if (totalPages <= 1 && !onPageSizeChange) return null;

  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * (pageSize || 1) + 1;
  const endItem = Math.min(currentPage * (pageSize || totalItems), totalItems);

  return (
    <div className="pt-3 pb-1 space-y-2.5">
      <div className="flex items-center justify-between">
        {onPageSizeChange && pageSize ? (
          <div className="flex items-center gap-1.5">
            <Select
              value={pageSize.toString()}
              onValueChange={(v) => onPageSizeChange(parseInt(v))}
            >
              <SelectTrigger className="min-h-[40px] h-10 w-[72px] text-xs touch-manipulation rounded-lg">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {pageSizeOptions.map((size) => (
                  <SelectItem key={size} value={size.toString()} className="text-xs">
                    {size}
                    {t("条", " items")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-[11px] text-muted-foreground">{t("每页", "Per page")}</span>
          </div>
        ) : (
          <span className="text-[11px] text-muted-foreground tabular-nums">
            {t(`共 ${totalItems} 条`, `${totalItems} total`)}
          </span>
        )}
        <span className="text-[11px] text-muted-foreground tabular-nums">
          {startItem}-{endItem} / {totalItems}
        </span>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <Button
            variant="outline"
            size="sm"
            className="min-h-[40px] h-10 text-xs px-5 rounded-lg touch-manipulation"
            disabled={currentPage <= 1}
            onClick={() => onPageChange(currentPage - 1)}
          >
            {t("上一页", "Prev")}
          </Button>
          <span className="text-xs font-medium min-w-[48px] text-center tabular-nums text-muted-foreground">
            {currentPage} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="min-h-[40px] h-10 text-xs px-5 rounded-lg touch-manipulation"
            disabled={currentPage >= totalPages}
            onClick={() => onPageChange(currentPage + 1)}
          >
            {t("下一页", "Next")}
          </Button>
        </div>
      )}
    </div>
  );
}
