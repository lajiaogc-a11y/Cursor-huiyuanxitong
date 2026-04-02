import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** 嵌入现有 Card 内的表格式脉冲占位（员工端日志类 Tab） */
export function CompactTableSkeleton({
  columns = 6,
  rows = 6,
  className,
}: {
  columns?: number;
  rows?: number;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)} aria-hidden>
      <div className="flex gap-2 border-b border-border/50 pb-2">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={`h-${i}`} className="h-3 min-w-[2.5rem] flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={`r-${r}`} className="flex gap-2 py-1.5">
          {Array.from({ length: columns }).map((_, c) => (
            <Skeleton key={`c-${r}-${c}`} className="h-3 min-w-[2.5rem] flex-1" style={{ opacity: Math.max(0.35, 1 - r * 0.09) }} />
          ))}
        </div>
      ))}
    </div>
  );
}

interface TablePageSkeletonProps {
  columns?: number;
  rows?: number;
  showTitle?: boolean;
}

export function TablePageSkeleton({ columns = 8, rows = 8, showTitle = true }: TablePageSkeletonProps) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-card">
        {/* Header */}
        <div className="p-4 pb-3 flex items-center justify-between">
          {showTitle && <Skeleton className="h-6 w-32" />}
          <div className="flex items-center gap-3">
            <Skeleton className="h-9 w-64" />
            <Skeleton className="h-9 w-9" />
          </div>
        </div>
        {/* Table */}
        <div className="px-4 pb-4">
          {/* Header row */}
          <div className="flex gap-3 mb-3 pb-2 border-b border-border/40">
            {Array.from({ length: columns }).map((_, i) => (
              <Skeleton key={i} className="h-4 flex-1" />
            ))}
          </div>
          {/* Body rows */}
          {Array.from({ length: rows }).map((_, rowIdx) => (
            <div key={rowIdx} className="flex gap-3 py-2.5">
              {Array.from({ length: columns }).map((_, colIdx) => (
                <Skeleton key={colIdx} className="h-4 flex-1" style={{ opacity: 1 - rowIdx * 0.08 }} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
