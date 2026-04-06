import { cn } from "@/lib/utils";

/**
 * 懒加载路由占位：禁止大块灰色骨架；用轻量模糊 + 透明度，chunk 到位后由页面自身渐显。
 */
export function MemberRouteSuspenseFallback({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "member-route-suspense-fallback flex min-h-[45vh] w-full flex-col items-center justify-center px-6 py-12",
        className,
      )}
      aria-busy="true"
      aria-label="Loading"
    >
      <div
        className="flex w-full max-w-sm flex-col items-center gap-4 rounded-2xl border border-[hsl(var(--pu-m-surface-border)/0.12)] bg-[hsl(var(--pu-m-bg-2)/0.35)] px-8 py-10"
        style={{
          opacity: 0.72,
          filter: "blur(8px)",
          transition: "opacity 300ms cubic-bezier(0.22, 1, 0.36, 1), filter 300ms cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      >
        <div
          className="h-9 w-9 rounded-full border-2 border-[hsl(var(--pu-gold)/0.2)] border-t-[hsl(var(--pu-gold)/0.75)] motion-safe:animate-spin motion-reduce:animate-none"
          aria-hidden
        />
        <div className="h-1 w-12 rounded-full bg-[hsl(var(--pu-gold)/0.2)] motion-safe:animate-pulse motion-reduce:animate-none" />
      </div>
    </div>
  );
}
