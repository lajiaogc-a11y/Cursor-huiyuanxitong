import { Skeleton } from "@/components/ui/skeleton";

/**
 * Full-page layout skeleton matching MainLayout structure.
 * Used during auth loading, Suspense fallback, etc.
 * Shows sidebar + header + content skeleton for instant visual feedback.
 */
export function LayoutSkeleton() {
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar skeleton */}
      <div className="hidden md:flex w-56 flex-col border-r border-border bg-card p-4 gap-3">
        <Skeleton className="h-8 w-32 mb-4" />
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-full" style={{ opacity: 1 - i * 0.08 }} />
        ))}
      </div>
      {/* Main area */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Header skeleton */}
        <div className="h-14 border-b border-border bg-card flex items-center px-4 gap-3 shrink-0">
          <Skeleton className="h-6 w-24" />
          <div className="flex-1" />
          <Skeleton className="h-8 w-8 rounded-full" />
          <Skeleton className="h-8 w-20" />
        </div>
        {/* Content skeleton */}
        <div className="flex-1 p-4 space-y-4">
          {/* Stats row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-lg border bg-card p-4 space-y-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-6 w-16" />
              </div>
            ))}
          </div>
          {/* Table skeleton */}
          <div className="rounded-lg border bg-card p-4 space-y-3">
            <Skeleton className="h-9 w-64" />
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" style={{ opacity: 1 - i * 0.1 }} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Mobile layout skeleton for loading states on mobile devices.
 */
export function MobileLayoutSkeleton() {
  return (
    <div className="flex flex-col h-dvh bg-background">
      {/* Header */}
      <div className="h-12 flex items-center px-3 bg-card border-b border-border">
        <Skeleton className="h-7 w-7 rounded-md" />
        <div className="flex-1 flex justify-center">
          <Skeleton className="h-5 w-24" />
        </div>
        <div className="w-7" />
      </div>
      {/* Content */}
      <div className="flex-1 p-3 space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg border bg-card p-4 space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-5 w-16" />
          </div>
        ))}
        <div className="rounded-lg border bg-card p-4 space-y-2">
          <Skeleton className="h-8 w-full" />
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" style={{ opacity: 1 - i * 0.12 }} />
          ))}
        </div>
      </div>
    </div>
  );
}
