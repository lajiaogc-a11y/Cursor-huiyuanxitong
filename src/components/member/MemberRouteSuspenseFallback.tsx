import { cn } from "@/lib/utils";

/**
 * 路由 / Tab 懒加载时的轻量占位：避免整页灰色骨架块，保留品牌感与轻微动效。
 * 与 DashboardSkeleton / MemberPageSkeleton 相比面积更小、对比度更低。
 */
export function MemberRouteSuspenseFallback({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "member-route-suspense-fallback flex min-h-[40vh] flex-col items-center justify-center gap-5 px-6 py-10",
        className,
      )}
      aria-busy="true"
      aria-label="Loading"
    >
      <div className="flex w-full max-w-[min(100%,20rem)] flex-col items-center gap-3">
        <div className="h-1.5 w-16 rounded-full bg-[hsl(var(--pu-gold)/0.35)] motion-safe:animate-pulse" />
        <div
          className="h-28 w-full rounded-2xl border border-[hsl(var(--pu-m-surface-border)/0.2)] bg-[hsl(var(--pu-m-surface)/0.22)] motion-safe:animate-pulse"
          style={{
            background:
              "linear-gradient(135deg, hsl(var(--pu-m-surface) / 0.28) 0%, hsl(var(--pu-m-bg-3) / 0.15) 100%)",
          }}
        />
        <div className="flex w-full gap-2">
          <div className="h-2 flex-1 rounded-md bg-[hsl(var(--pu-m-surface-border)/0.18)] motion-safe:animate-pulse" />
          <div className="h-2 w-1/3 rounded-md bg-[hsl(var(--pu-m-surface-border)/0.12)] motion-safe:animate-pulse" />
        </div>
      </div>
    </div>
  );
}
