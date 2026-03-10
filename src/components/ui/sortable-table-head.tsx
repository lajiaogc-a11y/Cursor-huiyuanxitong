// ============= 可排序表头组件 =============
// 点击表头切换升序/降序排列

import * as React from "react";
import { TableHead } from "./table";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type SortDirection = "asc" | "desc" | null;

export interface SortConfig {
  key: string;
  direction: SortDirection;
}

interface SortableTableHeadProps extends React.ThHTMLAttributes<HTMLTableCellElement> {
  sortKey: string;
  currentSort: SortConfig | null;
  onSort: (key: string) => void;
  children: React.ReactNode;
}

export function SortableTableHead({
  sortKey,
  currentSort,
  onSort,
  children,
  className,
  ...props
}: SortableTableHeadProps) {
  const isActive = currentSort?.key === sortKey;
  const direction = isActive ? currentSort.direction : null;

  const handleClick = () => {
    onSort(sortKey);
  };

  return (
    <TableHead
      className={cn(
        "cursor-pointer select-none hover:bg-muted/50 transition-colors",
        isActive && "bg-muted/30",
        className
      )}
      onClick={handleClick}
      {...props}
    >
      <div className="flex items-center justify-center gap-1">
        <span>{children}</span>
        <span className="inline-flex flex-col h-4 w-4 items-center justify-center">
          {direction === "asc" ? (
            <ChevronUp className="h-4 w-4 text-primary" />
          ) : direction === "desc" ? (
            <ChevronDown className="h-4 w-4 text-primary" />
          ) : (
            <ChevronsUpDown className="h-3 w-3 text-muted-foreground" />
          )}
        </span>
      </div>
    </TableHead>
  );
}

// 排序辅助 hook
export function useSortableData<T>(
  data: T[],
  defaultSort?: SortConfig
): {
  sortedData: T[];
  sortConfig: SortConfig | null;
  requestSort: (key: string) => void;
  setSortConfig: React.Dispatch<React.SetStateAction<SortConfig | null>>;
} {
  const [sortConfig, setSortConfig] = React.useState<SortConfig | null>(defaultSort || null);

  const sortedData = React.useMemo(() => {
    if (!sortConfig || !sortConfig.direction) {
      return data;
    }

    return [...data].sort((a, b) => {
      const aValue = getNestedValue(a, sortConfig.key);
      const bValue = getNestedValue(b, sortConfig.key);

      // Handle null/undefined
      if (aValue === null || aValue === undefined) return 1;
      if (bValue === null || bValue === undefined) return -1;

      // Compare based on type
      if (typeof aValue === "number" && typeof bValue === "number") {
        return sortConfig.direction === "asc" ? aValue - bValue : bValue - aValue;
      }

      if (aValue instanceof Date && bValue instanceof Date) {
        return sortConfig.direction === "asc"
          ? aValue.getTime() - bValue.getTime()
          : bValue.getTime() - aValue.getTime();
      }

      // String comparison
      const aStr = String(aValue).toLowerCase();
      const bStr = String(bValue).toLowerCase();
      
      if (sortConfig.direction === "asc") {
        return aStr.localeCompare(bStr);
      } else {
        return bStr.localeCompare(aStr);
      }
    });
  }, [data, sortConfig]);

  const requestSort = React.useCallback((key: string) => {
    setSortConfig((current) => {
      if (current?.key !== key) {
        return { key, direction: "asc" };
      }
      if (current.direction === "asc") {
        return { key, direction: "desc" };
      }
      if (current.direction === "desc") {
        return null; // Reset sort
      }
      return { key, direction: "asc" };
    });
  }, []);

  return { sortedData, sortConfig, requestSort, setSortConfig };
}

// Helper to get nested object values using dot notation
function getNestedValue(obj: any, path: string): any {
  return path.split(".").reduce((acc, part) => acc && acc[part], obj);
}
