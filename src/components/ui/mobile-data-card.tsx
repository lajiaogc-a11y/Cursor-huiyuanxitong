import * as React from "react";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "./button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select";
import { useLanguage } from "@/contexts/LanguageContext";

// 卡片列表容器
interface MobileCardListProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export function MobileCardList({ children, className, ...props }: MobileCardListProps) {
  return (
    <div className={cn("flex flex-col gap-3", className)} {...props}>
      {children}
    </div>
  );
}

// 单个数据卡片
interface MobileCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  compact?: boolean;
}

export function MobileCard({ children, className, compact, ...props }: MobileCardProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border/50 bg-card shadow-[0_1px_3px_rgba(0,0,0,0.04)]",
        compact ? "p-3 space-y-1.5" : "p-4 space-y-2.5",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

// 紧凑型2列网格行
interface MobileCardGridProps {
  children: React.ReactNode;
  className?: string;
}

export function MobileCardGrid({ children, className }: MobileCardGridProps) {
  return (
    <div className={cn("grid grid-cols-2 gap-x-4 gap-y-1 text-xs", className)}>
      {children}
    </div>
  );
}

// 网格内的单个数据项
interface MobileCardGridItemProps {
  label: string;
  value: React.ReactNode;
  highlight?: boolean;
  className?: string;
}

export function MobileCardGridItem({ label, value, highlight, className }: MobileCardGridItemProps) {
  return (
    <div className={cn("flex items-center justify-between", className)}>
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className={cn("text-right truncate ml-1.5", highlight && "font-semibold text-primary")}>
        {value ?? "-"}
      </span>
    </div>
  );
}

// 卡片头部
interface MobileCardHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export function MobileCardHeader({ children, className, ...props }: MobileCardHeaderProps) {
  return (
    <div className={cn("flex items-center justify-between gap-2", className)} {...props}>
      {children}
    </div>
  );
}

// 卡片内的键值行
interface MobileCardRowProps {
  label: string;
  value: React.ReactNode;
  highlight?: boolean;
  className?: string;
}

export function MobileCardRow({ label, value, highlight, className }: MobileCardRowProps) {
  return (
    <div className={cn("flex items-center justify-between text-sm", className)}>
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className={cn(
        "text-right truncate ml-2",
        highlight && "font-semibold text-primary"
      )}>
        {value ?? "-"}
      </span>
    </div>
  );
}

// 可折叠的详细信息区
interface MobileCardCollapsibleProps {
  children: React.ReactNode;
  label?: string;
  className?: string;
}

export function MobileCardCollapsible({ children, label, className }: MobileCardCollapsibleProps) {
  const [open, setOpen] = React.useState(false);
  const { t } = useLanguage();

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors w-full justify-center py-1"
      >
        {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        <span>{label || (open ? t("收起", "Collapse") : t("展开详情", "Show Details"))}</span>
      </button>
      {open && (
        <div className="pt-2 space-y-1.5 border-t border-border/30 mt-1">
          {children}
        </div>
      )}
    </div>
  );
}

// 卡片底部操作区
interface MobileCardActionsProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export function MobileCardActions({ children, className, ...props }: MobileCardActionsProps) {
  return (
    <div className={cn("flex items-center gap-2 pt-2 border-t border-border/30", className)} {...props}>
      {children}
    </div>
  );
}

// 移动端简化分页
interface MobilePaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  pageSize?: number;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[];
}

export function MobilePagination({ currentPage, totalPages, totalItems, onPageChange, pageSize, onPageSizeChange, pageSizeOptions = [10, 20, 50, 100] }: MobilePaginationProps) {
  const { t } = useLanguage();
  
  if (totalPages <= 1 && !onPageSizeChange) return null;
  
  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * (pageSize || 1) + 1;
  const endItem = Math.min(currentPage * (pageSize || totalItems), totalItems);
  
  return (
    <div className="pt-3 space-y-2">
      {/* Row 1: Page size selector + item range */}
      {onPageSizeChange && pageSize && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Select value={pageSize.toString()} onValueChange={(v) => onPageSizeChange(parseInt(v))}>
              <SelectTrigger className="min-h-11 h-11 w-[80px] text-xs touch-manipulation">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {pageSizeOptions.map((size) => (
                  <SelectItem key={size} value={size.toString()} className="text-xs">{size}{t("条", "")}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-[11px] text-muted-foreground">{t("每页", "/page")}</span>
          </div>
          <span className="text-[11px] text-muted-foreground">
            {startItem}-{endItem} / {totalItems}
          </span>
        </div>
      )}
      {/* Row 2: Navigation */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          {!onPageSizeChange && (
            <span className="text-xs text-muted-foreground">
              {t(`共 ${totalItems} 条`, `${totalItems} total`)}
            </span>
          )}
          <div className={cn("flex items-center gap-2", onPageSizeChange && "w-full justify-center")}>
            <Button
              variant="outline"
              size="sm"
              className="min-h-11 h-11 text-xs px-4 touch-manipulation"
              disabled={currentPage <= 1}
              onClick={() => onPageChange(currentPage - 1)}
            >
              {t("上一页", "Prev")}
            </Button>
            <span className="text-xs font-medium min-w-[50px] text-center">
              {currentPage} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="min-h-11 h-11 text-xs px-4 touch-manipulation"
              disabled={currentPage >= totalPages}
              onClick={() => onPageChange(currentPage + 1)}
            >
              {t("下一页", "Next")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
