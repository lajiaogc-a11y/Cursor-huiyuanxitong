// ============= 通用表格分页组件 =============
// 可复用的分页控制器，支持每页条数选择和页码导航

import * as React from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/contexts/LanguageContext';

interface TablePaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  pageSizeOptions?: number[];
  className?: string;
  showItemCount?: boolean;
  compact?: boolean;
}

export const TablePagination = React.forwardRef<HTMLDivElement, TablePaginationProps>(
  function TablePaginationInner({
    currentPage,
    totalPages,
    totalItems,
    pageSize,
    onPageChange,
    onPageSizeChange,
    pageSizeOptions = [10, 20, 50, 100],
    className = '',
    showItemCount = true,
    compact = false,
  }, ref) {
    const { t } = useLanguage();
    const startItem = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
    const endItem = Math.min(currentPage * pageSize, totalItems);

    if (totalItems === 0) {
      return null;
    }

    return (
      <div
        ref={ref}
        className={cn(
          'flex items-center justify-between gap-2 sm:gap-4 py-3 px-1 flex-wrap',
          compact && 'py-2',
          className
        )}
      >
        {/* Left side: Page size selector */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          <span className="text-xs sm:text-sm text-muted-foreground whitespace-nowrap">
            {t('每页', 'Per page')}
          </span>
          <Select
            value={pageSize.toString()}
            onValueChange={(v) => {
              onPageSizeChange(parseInt(v));
              onPageChange(1);
            }}
          >
            <SelectTrigger className={cn("w-[60px] sm:w-[70px]", compact ? "h-7 text-xs" : "h-7 sm:h-8 text-xs sm:text-sm")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {pageSizeOptions.map((size) => (
                <SelectItem key={size} value={size.toString()}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          {showItemCount && (
            <span className="text-xs sm:text-sm text-muted-foreground hidden sm:inline">
              {t(
                `显示 ${startItem}-${endItem} / 共 ${totalItems} 条`,
                `Showing ${startItem}-${endItem} of ${totalItems}`
              )}
            </span>
          )}
          {showItemCount && (
            <span className="text-xs text-muted-foreground sm:hidden">
              {`${startItem}-${endItem}/${totalItems}`}
            </span>
          )}
        </div>

        {/* Right side: Navigation */}
        <div className="flex items-center gap-1">
          {!compact && totalPages > 2 && (
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7 sm:h-8 sm:w-8"
              onClick={() => onPageChange(1)}
              disabled={currentPage <= 1}
            >
              <ChevronsLeft className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </Button>
          )}
          
          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7 sm:h-8 sm:w-8"
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage <= 1}
          >
            <ChevronLeft className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          </Button>
          
          <span className={cn(
            "tabular-nums px-2 sm:px-3 whitespace-nowrap",
            compact ? "text-xs" : "text-xs sm:text-sm"
          )}>
            {currentPage} / {totalPages}
          </span>
          
          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7 sm:h-8 sm:w-8"
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage >= totalPages}
          >
            <ChevronRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          </Button>
          
          {!compact && totalPages > 2 && (
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7 sm:h-8 sm:w-8"
              onClick={() => onPageChange(totalPages)}
              disabled={currentPage >= totalPages}
            >
              <ChevronsRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </Button>
          )}
        </div>
      </div>
    );
  }
);

// Hook for pagination state management
export function usePagination(initialPageSize = 20) {
  const [currentPage, setCurrentPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(initialPageSize);

  const resetPage = React.useCallback(() => {
    setCurrentPage(1);
  }, []);

  const paginateData = React.useCallback(<T,>(data: T[]): { paginatedData: T[]; totalPages: number } => {
    const totalPages = Math.ceil(data.length / pageSize);
    const start = (currentPage - 1) * pageSize;
    const paginatedData = data.slice(start, start + pageSize);
    return { paginatedData, totalPages };
  }, [currentPage, pageSize]);

  return {
    currentPage,
    setCurrentPage,
    pageSize,
    setPageSize,
    resetPage,
    paginateData,
  };
}

export default TablePagination;
