import { useState, useRef, useCallback, useEffect } from "react";
import MemberBottomNav from "./MemberBottomNav";

/* ─── Pull-to-refresh hook ─── */
function usePullToRefresh(onRefresh: () => Promise<void>) {
  const [pulling, setPulling] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const startY = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const threshold = 70;

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const el = containerRef.current;
    if (el && el.scrollTop <= 0) {
      startY.current = e.touches[0].clientY;
      setPulling(true);
    }
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!pulling || refreshing) return;
    const el = containerRef.current;
    if (el && el.scrollTop > 0) {
      setPullDistance(0);
      return;
    }
    const diff = Math.max(0, e.touches[0].clientY - startY.current);
    // Dampened pull distance
    setPullDistance(Math.min(diff * 0.45, 120));
  }, [pulling, refreshing]);

  const handleTouchEnd = useCallback(async () => {
    if (!pulling) return;
    setPulling(false);
    if (pullDistance >= threshold && !refreshing) {
      setRefreshing(true);
      await onRefresh();
      setRefreshing(false);
    }
    setPullDistance(0);
  }, [pulling, pullDistance, refreshing, onRefresh]);

  return {
    containerRef,
    pullDistance,
    refreshing,
    isOverThreshold: pullDistance >= threshold,
    handlers: {
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd,
    },
  };
}

export default function MemberLayout({ children }: { children: React.ReactNode }) {
  const handleRefresh = useCallback(async () => {
    // Simulate refresh delay
    await new Promise((r) => setTimeout(r, 1000));
  }, []);

  const { containerRef, pullDistance, refreshing, isOverThreshold, handlers } = usePullToRefresh(handleRefresh);

  return (
    <div
      ref={containerRef}
      className="h-screen overflow-y-auto overscroll-none"
      {...handlers}
    >
      {/* Pull indicator */}
      <div
        className="flex items-center justify-center overflow-hidden transition-all duration-200 ease-out"
        style={{ height: pullDistance > 0 ? pullDistance : 0 }}
      >
        <div className="flex flex-col items-center gap-1">
          <svg
            className={`w-5 h-5 transition-transform duration-300 ${
              refreshing ? "animate-spin" : ""
            }`}
            style={{
              transform: refreshing
                ? undefined
                : `rotate(${Math.min(pullDistance / 70 * 180, 180)}deg)`,
              color: isOverThreshold
                ? "hsl(var(--gold))"
                : "hsl(var(--m-text-dim))",
            }}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
          <span
            className="text-[10px] font-bold transition-colors"
            style={{
              color: isOverThreshold
                ? "hsl(var(--gold-soft))"
                : "hsl(var(--m-text-dim))",
            }}
          >
            {refreshing ? "刷新中..." : isOverThreshold ? "松手刷新" : "下拉刷新"}
          </span>
        </div>
      </div>

      <main className="pb-20">
        {children}
      </main>
      <MemberBottomNav />
    </div>
  );
}