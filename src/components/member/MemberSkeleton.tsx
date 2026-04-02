/**
 * MemberSkeleton — Premium skeleton loading states for member pages (premium-ui-boost structure).
 * Pure UI component, no business logic.
 */

import { Skeleton } from "@/components/ui/skeleton";

/** Used as route Suspense fallback — includes page background when not inside a page shell. */
/** 非首页会员路由的 Suspense 占位（与 `.member-page-skeleton` 样式配套）。 */
export function MemberPageSkeleton() {
  return (
    <div className="m-page-bg min-h-[70vh] motion-reduce:animate-none animate-fade-in">
      <div className="member-page-skeleton">
        <div className="member-page-skeleton__hero member-skeleton--dark" aria-hidden />
        <div className="member-page-skeleton__body">
          <div className="member-page-skeleton__bar member-page-skeleton__bar--short member-skeleton" aria-hidden />
          <div className="member-page-skeleton__tiles">
            <div className="member-page-skeleton__tile member-skeleton" aria-hidden />
            <div className="member-page-skeleton__tile member-skeleton" aria-hidden />
            <div className="member-page-skeleton__tile member-skeleton" aria-hidden />
          </div>
          <div className="member-page-skeleton__bar member-page-skeleton__bar--mid member-skeleton" aria-hidden />
          <div className="member-page-skeleton__row member-skeleton" aria-hidden />
          <div className="member-page-skeleton__row member-skeleton" aria-hidden />
          <div className="member-page-skeleton__row member-skeleton" aria-hidden />
        </div>
      </div>
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="m-page-bg min-h-[70vh] motion-reduce:animate-none animate-fade-in">
      <div className="px-5 pb-8 pt-7">
        <div className="mb-7 flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <Skeleton className="h-[52px] w-[52px] rounded-2xl bg-[hsl(var(--pu-m-surface)_/_0.4)]" />
            <div className="space-y-2">
              <Skeleton className="h-5 w-28 rounded-lg bg-[hsl(var(--pu-m-surface)_/_0.4)]" />
              <Skeleton className="h-4 w-16 rounded-full bg-[hsl(var(--pu-m-surface)_/_0.3)]" />
            </div>
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-10 w-10 rounded-xl bg-[hsl(var(--pu-m-surface)_/_0.3)]" />
            <Skeleton className="h-10 w-10 rounded-xl bg-[hsl(var(--pu-m-surface)_/_0.3)]" />
          </div>
        </div>
        <Skeleton className="mb-5 h-[120px] rounded-2xl bg-[hsl(var(--pu-m-surface)_/_0.3)]" />
        <Skeleton className="mb-4 h-[200px] rounded-2xl bg-[hsl(var(--pu-m-surface)_/_0.25)]" />
      </div>
      <div className="mb-7 px-5">
        <div className="grid grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl bg-[hsl(var(--pu-m-surface)_/_0.25)]" />
          ))}
        </div>
      </div>
      <div className="space-y-2.5 px-5">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-xl bg-[hsl(var(--pu-m-surface)_/_0.2)]" />
        ))}
      </div>
    </div>
  );
}

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="motion-reduce:animate-none animate-fade-in">
      <div className="px-5 pb-4 pt-8">
        <div className="mb-4 flex items-center gap-2">
          <Skeleton className="h-8 w-8 rounded-lg bg-[hsl(var(--pu-m-surface)_/_0.4)]" />
          <Skeleton className="h-6 w-32 rounded-lg bg-[hsl(var(--pu-m-surface)_/_0.4)]" />
        </div>
        <Skeleton className="h-4 w-48 rounded bg-[hsl(var(--pu-m-surface)_/_0.25)]" />
      </div>
      <div className="mb-5 flex gap-2 px-5">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-8 w-16 rounded-full bg-[hsl(var(--pu-m-surface)_/_0.25)]" />
        ))}
      </div>
      <div className="space-y-2.5 px-5">
        {[...Array(rows)].map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-2xl bg-[hsl(var(--pu-m-surface)_/_0.2)]" />
        ))}
      </div>
    </div>
  );
}

export function ProfileSkeleton() {
  return (
    <div className="motion-reduce:animate-none animate-fade-in">
      <div className="px-5 pb-6 pt-8">
        <Skeleton className="mb-6 h-4 w-20 rounded bg-[hsl(var(--pu-m-surface)_/_0.3)]" />
        <div className="rounded-2xl border border-[hsl(var(--pu-m-surface-border)_/_0.15)] p-6">
          <div className="flex flex-col items-center">
            <Skeleton className="mb-4 h-20 w-20 rounded-2xl bg-[hsl(var(--pu-m-surface)_/_0.4)]" />
            <Skeleton className="mb-2 h-5 w-24 rounded-lg bg-[hsl(var(--pu-m-surface)_/_0.35)]" />
            <Skeleton className="mb-4 h-6 w-20 rounded-full bg-[hsl(var(--pu-m-surface)_/_0.3)]" />
            <div className="flex w-full gap-3">
              <Skeleton className="h-14 flex-1 rounded-xl bg-[hsl(var(--pu-m-surface)_/_0.2)]" />
              <Skeleton className="h-14 flex-1 rounded-xl bg-[hsl(var(--pu-m-surface)_/_0.2)]" />
            </div>
          </div>
        </div>
      </div>
      <div className="space-y-2.5 px-5">
        {[...Array(6)].map((_, i) => (
          <Skeleton key={i} className="h-14 rounded-xl bg-[hsl(var(--pu-m-surface)_/_0.15)]" />
        ))}
      </div>
    </div>
  );
}

function SkeletonBlock({ className = "" }: { className?: string }) {
  return <div className={`m-skeleton ${className}`} />;
}

export function SettingsSkeleton() {
  return (
    <div className="space-y-4 p-4 motion-reduce:animate-none animate-pulse">
      <div className="flex items-center gap-4">
        <SkeletonBlock className="h-16 w-16 rounded-full" />
        <div className="flex-1 space-y-2">
          <SkeletonBlock className="h-5 w-32 rounded-lg" />
          <SkeletonBlock className="h-4 w-24 rounded-lg" />
        </div>
      </div>
      {[...Array(4)].map((_, i) => (
        <SkeletonBlock key={i} className="h-24 w-full rounded-2xl" />
      ))}
    </div>
  );
}
