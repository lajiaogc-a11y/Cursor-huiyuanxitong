import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * 懒加载路由占位：禁止大块灰色骨架；用轻量模糊 + 透明度，chunk 到位后由页面自身渐显。
 */
export function MemberRouteSuspenseFallback({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "member-route-suspense-fallback pointer-events-none flex min-h-[18vh] w-full flex-col items-center justify-start px-5 pb-6 pt-6",
        className,
      )}
      aria-busy="true"
      aria-label="Loading"
    >
      <div
        className="flex w-full max-w-xs items-center justify-center gap-3 rounded-full border border-[hsl(var(--pu-m-surface-border)/0.1)] bg-[hsl(var(--pu-m-surface)/0.42)] px-4 py-3 shadow-[0_10px_30px_hsl(var(--pu-m-bg)/0.12)] backdrop-blur-md member-transition-surface member-motion-fast"
        style={{
          opacity: 0.9,
        }}
      >
        <div
          className="h-5 w-5 rounded-full border-2 border-[hsl(var(--pu-gold)/0.18)] border-t-[hsl(var(--pu-gold)/0.78)] motion-safe:animate-spin motion-reduce:animate-none"
          aria-hidden
        />
        <div className="h-1.5 w-20 rounded-full bg-[hsl(var(--pu-gold)/0.16)] motion-safe:animate-pulse motion-reduce:animate-none" />
      </div>
    </div>
  );
}

export function MemberDeferredRouteSuspenseFallback({
  delayMs = 120,
  className,
}: {
  delayMs?: number;
  className?: string;
}) {
  const [visible, setVisible] = useState(delayMs <= 0);

  useEffect(() => {
    if (delayMs <= 0) {
      setVisible(true);
      return;
    }
    setVisible(false);
    const timer = window.setTimeout(() => setVisible(true), delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs]);

  if (!visible) {
    return (
      <div
        className={cn("pointer-events-none min-h-[18vh] w-full", className)}
        aria-hidden="true"
      />
    );
  }

  return <MemberRouteSuspenseFallback className={cn("member-route-suspense-fade-in", className)} />;
}
