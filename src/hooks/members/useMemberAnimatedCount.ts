import { useEffect, useRef, useState } from "react";

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/**
 * premium-ui-boost MemberPoints `useAnimatedCount`：目标数字缓动过渡；加载中请在外层用 `enabled: false` 不触发动画。
 */
export function useMemberAnimatedCount(
  target: number,
  options?: { durationMs?: number; enabled?: boolean },
): number {
  const durationMs = options?.durationMs ?? 800;
  const enabled = options?.enabled ?? true;
  /** 与 premium-ui-boost 一致：首帧从 0 起播，避免静态跳变 */
  const [display, setDisplay] = useState(0);
  const fromRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled || prefersReducedMotion()) {
      setDisplay(target);
      fromRef.current = target;
      return;
    }
    const from = fromRef.current ?? 0;
    fromRef.current = target;
    let cancelled = false;
    const start = performance.now();
    const tick = (now: number) => {
      if (cancelled) return;
      const t = Math.min((now - start) / durationMs, 1);
      const ease = 1 - (1 - t) ** 3;
      setDisplay(from + (target - from) * ease);
      if (t < 1) requestAnimationFrame(tick);
      else setDisplay(target);
    };
    const id = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(id);
    };
  }, [target, durationMs, enabled]);

  return display;
}
