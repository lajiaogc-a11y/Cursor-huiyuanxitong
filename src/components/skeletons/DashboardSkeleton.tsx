import { Skeleton } from "@/components/ui/skeleton";

export function DashboardSkeleton() {
  return (
    <div className="space-y-5">
      {/* Date filter skeleton */}
      <div className="flex items-center gap-2">
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-8 w-20" />
        <div className="flex-1" />
        <Skeleton className="h-7 w-16" />
        <Skeleton className="h-7 w-7" />
      </div>

      {/* Summary skeleton */}
      <Skeleton className="h-12 w-full rounded-lg" />

      {/* Stats cards grid */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 lg:gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border/30 p-5 bg-card">
            <div className="flex items-start justify-between">
              <div className="space-y-2">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-8 w-20" />
              </div>
              <Skeleton className="h-10 w-10 rounded-lg" />
            </div>
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-xl border border-border/30 bg-card p-4">
          <Skeleton className="h-5 w-32 mb-4" />
          <Skeleton className="h-[220px] w-full rounded" />
        </div>
        <div className="rounded-xl border border-border/30 bg-card p-4">
          <Skeleton className="h-5 w-32 mb-4" />
          <Skeleton className="h-[220px] w-full rounded" />
        </div>
      </div>
    </div>
  );
}
