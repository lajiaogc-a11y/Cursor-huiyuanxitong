import { Skeleton } from "@/components/ui/skeleton";

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
