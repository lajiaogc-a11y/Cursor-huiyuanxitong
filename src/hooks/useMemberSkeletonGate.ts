import { useEffect, useRef, useState } from "react";
import { MEMBER_SKELETON_MIN_MS } from "@/lib/memberPortalUx";

/**
 * 当 `blocking` 从 true→false 过快时，仍保持 true 至少 `minMs`，避免骨架屏一闪而过。
 */
export function useMemberSkeletonGate(blocking: boolean, minMs: number = MEMBER_SKELETON_MIN_MS): boolean {
  const [show, setShow] = useState(blocking);
  const loadStartRef = useRef<number | null>(null);

  useEffect(() => {
    if (blocking) {
      loadStartRef.current = Date.now();
      setShow(true);
      return;
    }
    const started = loadStartRef.current;
    if (started == null) {
      setShow(false);
      return;
    }
    const elapsed = Date.now() - started;
    const remaining = Math.max(0, minMs - elapsed);
    if (remaining <= 0) {
      setShow(false);
      loadStartRef.current = null;
      return;
    }
    const id = window.setTimeout(() => {
      setShow(false);
      loadStartRef.current = null;
    }, remaining);
    return () => window.clearTimeout(id);
  }, [blocking, minMs]);

  return show;
}
