import { Skeleton } from "@/components/ui/skeleton";

/** Unified skeleton screen for member pages */
export function DashboardSkeleton() {
  return (
    <div className="m-page-bg animate-fade-in">
      <div className="px-5 pt-7 pb-8">
        {/* User row */}
        <div className="flex items-center justify-between mb-7">
          <div className="flex items-center gap-3.5">
            <Skeleton className="w-[52px] h-[52px] rounded-2xl bg-[hsl(var(--m-surface)_/_0.4)]" />
            <div className="space-y-2">
              <Skeleton className="h-5 w-28 rounded-lg bg-[hsl(var(--m-surface)_/_0.4)]" />
              <Skeleton className="h-4 w-16 rounded-full bg-[hsl(var(--m-surface)_/_0.3)]" />
            </div>
          </div>
          <div className="flex gap-2">
            <Skeleton className="w-10 h-10 rounded-xl bg-[hsl(var(--m-surface)_/_0.3)]" />
            <Skeleton className="w-10 h-10 rounded-xl bg-[hsl(var(--m-surface)_/_0.3)]" />
          </div>
        </div>
        {/* Banner */}
        <Skeleton className="h-[120px] rounded-2xl mb-5 bg-[hsl(var(--m-surface)_/_0.3)]" />
        {/* Points card */}
        <Skeleton className="h-[200px] rounded-2xl mb-4 bg-[hsl(var(--m-surface)_/_0.25)]" />
      </div>
      {/* Quick actions */}
      <div className="px-5 mb-7">
        <div className="grid grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl bg-[hsl(var(--m-surface)_/_0.25)]" />
          ))}
        </div>
      </div>
      {/* Tasks */}
      <div className="px-5 space-y-2.5">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-xl bg-[hsl(var(--m-surface)_/_0.2)]" />
        ))}
      </div>
    </div>
  );
}

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="m-page-bg animate-fade-in">
      <div className="px-5 pt-8 pb-4">
        <div className="flex items-center gap-2 mb-4">
          <Skeleton className="w-8 h-8 rounded-lg bg-[hsl(var(--m-surface)_/_0.4)]" />
          <Skeleton className="h-6 w-32 rounded-lg bg-[hsl(var(--m-surface)_/_0.4)]" />
        </div>
        <Skeleton className="h-4 w-48 rounded bg-[hsl(var(--m-surface)_/_0.25)]" />
      </div>
      {/* Filters */}
      <div className="px-5 mb-5 flex gap-2">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-8 w-16 rounded-full bg-[hsl(var(--m-surface)_/_0.25)]" />
        ))}
      </div>
      {/* Rows */}
      <div className="px-5 space-y-2.5">
        {[...Array(rows)].map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-2xl bg-[hsl(var(--m-surface)_/_0.2)]" />
        ))}
      </div>
    </div>
  );
}

export function ProfileSkeleton() {
  return (
    <div className="m-page-bg animate-fade-in">
      <div className="px-5 pt-8 pb-6">
        <Skeleton className="h-4 w-20 rounded mb-6 bg-[hsl(var(--m-surface)_/_0.3)]" />
        <div className="rounded-2xl p-6 border border-[hsl(var(--m-surface-border)_/_0.15)]">
          <div className="flex flex-col items-center">
            <Skeleton className="w-20 h-20 rounded-2xl mb-4 bg-[hsl(var(--m-surface)_/_0.4)]" />
            <Skeleton className="h-5 w-24 rounded-lg mb-2 bg-[hsl(var(--m-surface)_/_0.35)]" />
            <Skeleton className="h-6 w-20 rounded-full mb-4 bg-[hsl(var(--m-surface)_/_0.3)]" />
            <div className="flex gap-3 w-full">
              <Skeleton className="flex-1 h-14 rounded-xl bg-[hsl(var(--m-surface)_/_0.2)]" />
              <Skeleton className="flex-1 h-14 rounded-xl bg-[hsl(var(--m-surface)_/_0.2)]" />
            </div>
          </div>
        </div>
      </div>
      <div className="px-5 space-y-2.5">
        {[...Array(6)].map((_, i) => (
          <Skeleton key={i} className="h-14 rounded-xl bg-[hsl(var(--m-surface)_/_0.15)]" />
        ))}
      </div>
    </div>
  );
}

export function CardGridSkeleton() {
  return (
    <div className="m-page-bg animate-fade-in">
      <div className="px-5 pt-8 pb-4">
        <div className="flex items-center gap-2 mb-4">
          <Skeleton className="w-8 h-8 rounded-lg bg-[hsl(var(--m-surface)_/_0.4)]" />
          <Skeleton className="h-6 w-28 rounded-lg bg-[hsl(var(--m-surface)_/_0.4)]" />
        </div>
      </div>
      {/* Balance card */}
      <div className="px-5 mb-6">
        <Skeleton className="h-[180px] rounded-2xl bg-[hsl(var(--m-surface)_/_0.25)]" />
      </div>
      {/* Grid */}
      <div className="px-5">
        <div className="grid grid-cols-2 gap-3">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-2xl bg-[hsl(var(--m-surface)_/_0.2)]" />
          ))}
        </div>
      </div>
    </div>
  );
}
