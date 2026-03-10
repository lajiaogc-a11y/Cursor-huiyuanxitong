import * as React from "react";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronLeft, ChevronRight } from "lucide-react";

// 统一表格布局组件 - 支持固定右侧操作列和底部分页

interface FixedTableProps {
  children: React.ReactNode;
  className?: string;
  minWidth?: string;
}

// 表格容器 - 禁止页面整体滚动，仅数据区滚动
const FixedTableContainer = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("flex flex-col h-full overflow-hidden", className)}
      {...props}
    >
      {children}
    </div>
  )
);
FixedTableContainer.displayName = "FixedTableContainer";

// 表格滚动区域 - 支持横向和纵向滚动
const FixedTableScrollArea = React.forwardRef<HTMLDivElement, FixedTableProps>(
  ({ className, children, minWidth = "1200px", ...props }, ref) => (
    <div
      ref={ref}
      className={cn("flex-1 overflow-auto border rounded-lg", className)}
      {...props}
    >
      <div style={{ minWidth }}>
        {children}
      </div>
    </div>
  )
);
FixedTableScrollArea.displayName = "FixedTableScrollArea";

// 表格
const FixedTable = React.forwardRef<HTMLTableElement, React.HTMLAttributes<HTMLTableElement>>(
  ({ className, ...props }, ref) => (
    <table
      ref={ref}
      className={cn("w-full caption-bottom text-sm", className)}
      {...props}
    />
  )
);
FixedTable.displayName = "FixedTable";

// 表头
const FixedTableHeader = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <thead ref={ref} className={cn("bg-muted/40 sticky top-0 z-10 backdrop-blur-sm", className)} {...props} />
  )
);
FixedTableHeader.displayName = "FixedTableHeader";

// 表体
const FixedTableBody = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <tbody ref={ref} className={cn("[&_tr:last-child]:border-0", className)} {...props} />
  )
);
FixedTableBody.displayName = "FixedTableBody";

// 表行
const FixedTableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => (
    <tr
      ref={ref}
      className={cn("border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted", className)}
      {...props}
    />
  )
);
FixedTableRow.displayName = "FixedTableRow";

// 表头单元格
const FixedTableHead = React.forwardRef<HTMLTableCellElement, React.ThHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <th
      ref={ref}
      className={cn(
        "h-11 px-3 text-center align-middle font-medium text-muted-foreground text-xs uppercase tracking-wide whitespace-nowrap",
        className
      )}
      {...props}
    />
  )
);
FixedTableHead.displayName = "FixedTableHead";

// 固定右侧操作列表头
const FixedTableHeadAction = React.forwardRef<HTMLTableCellElement, React.ThHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <th
      ref={ref}
      className={cn(
        "h-11 px-3 text-center align-middle font-medium text-muted-foreground text-xs uppercase tracking-wide whitespace-nowrap",
        "sticky right-0 bg-muted/60 backdrop-blur-sm shadow-[-2px_0_8px_-4px_rgba(0,0,0,0.08)] z-20",
        className
      )}
      {...props}
    />
  )
);
FixedTableHeadAction.displayName = "FixedTableHeadAction";

// 表格单元格
const FixedTableCell = React.forwardRef<HTMLTableCellElement, React.TdHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <td
      ref={ref}
      className={cn("p-3 align-middle text-center whitespace-nowrap", className)}
      {...props}
    />
  )
);
FixedTableCell.displayName = "FixedTableCell";

// 固定右侧操作列单元格
const FixedTableCellAction = React.forwardRef<HTMLTableCellElement, React.TdHTMLAttributes<HTMLTableCellElement> & { rowBg?: string }>(
  ({ className, rowBg, ...props }, ref) => (
    <td
      ref={ref}
      className={cn(
        "p-3 align-middle text-center whitespace-nowrap",
        "sticky right-0 shadow-[-2px_0_8px_-4px_rgba(0,0,0,0.06)]",
        rowBg || "bg-background",
        className
      )}
      {...props}
    />
  )
);
FixedTableCellAction.displayName = "FixedTableCellAction";

// 分页组件 - 固定在表格底部
interface FixedTablePaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  pageSizeOptions?: number[];
}

const FixedTablePagination = ({
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 20, 50, 100],
}: FixedTablePaginationProps) => {
  const [jumpToPage, setJumpToPage] = React.useState("");

  const handleJump = () => {
    const page = parseInt(jumpToPage);
    if (!isNaN(page) && page >= 1 && page <= totalPages) {
      onPageChange(page);
      setJumpToPage("");
    }
  };

  return (
    <div className="flex items-center justify-between py-3 px-3 border-t bg-card/80 backdrop-blur-sm shrink-0">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className="tabular-nums">共 {totalItems} 条</span>
        <Select
          value={pageSize.toString()}
          onValueChange={(value) => onPageSizeChange(parseInt(value))}
        >
          <SelectTrigger className="w-20 h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {pageSizeOptions.map((size) => (
              <SelectItem key={size} value={size.toString()}>
                {size} 条
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span>/ 页</span>
      </div>
      
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          className="h-8 px-2.5 gap-1"
        >
          <ChevronLeft className="h-4 w-4" />
          <span className="hidden sm:inline">上一页</span>
        </Button>
        
        <span className="text-sm px-3 tabular-nums font-medium">
          {currentPage} / {totalPages || 1}
        </span>
        
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          className="h-8 px-2.5 gap-1"
        >
          <span className="hidden sm:inline">下一页</span>
          <ChevronRight className="h-4 w-4" />
        </Button>
        
        <div className="hidden sm:flex items-center gap-1.5 ml-2">
          <span className="text-sm text-muted-foreground">跳至</span>
          <Input
            value={jumpToPage}
            onChange={(e) => setJumpToPage(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleJump()}
            className="w-14 h-8 text-center text-sm"
            placeholder=""
          />
          <span className="text-sm text-muted-foreground">页</span>
          <Button variant="outline" size="sm" onClick={handleJump} className="h-8 px-3">
            确定
          </Button>
        </div>
      </div>
    </div>
  );
};

export {
  FixedTableContainer,
  FixedTableScrollArea,
  FixedTable,
  FixedTableHeader,
  FixedTableBody,
  FixedTableRow,
  FixedTableHead,
  FixedTableHeadAction,
  FixedTableCell,
  FixedTableCellAction,
  FixedTablePagination,
};
