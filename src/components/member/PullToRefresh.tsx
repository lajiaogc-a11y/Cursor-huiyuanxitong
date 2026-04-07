import {
  type MutableRefObject,
  type ReactNode,
  type RefObject,
  useRef,
  useState,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
} from "react";
import { useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { queryClient } from "@/lib/queryClient";
import { MEMBER_GLOBAL_REFRESH_REQUEST_EVENT, MEMBER_PULL_REFRESH_EVENT } from "@/lib/memberPullRefreshEvent";
import { safeMemberGlobalRefresh } from "@/lib/memberSafeRefresh";
import { isMemberBottomTabPath } from "@/lib/memberBottomTabPaths";
import { useLanguage } from "@/contexts/LanguageContext";

declare global {
  interface Window {
    AndroidBridge?: {
      reportScrollTop?: (atTop: boolean) => void;
      onRefreshComplete?: () => void;
      saveBase64ImageToGallery?: (base64: string, filename: string) => void;
    };
  }
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduced(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

/** Detect if running inside the FastGC Android WebView. */
function detectAndroidWebView(): boolean {
  if (typeof navigator === "undefined") return false;
  return /FastGC-Android/i.test(navigator.userAgent);
}

function detectIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iP(hone|od|ad)/i.test(navigator.userAgent);
}

const DEFAULT_PULL_CONFIG = {
  threshold: 80,
  resistance: 0.42,
  maxPull: 130,
};
const IOS_PULL_CONFIG = {
  threshold: 70,
  resistance: 0.38,
  maxPull: 140,
};
const ANDROID_PULL_CONFIG = {
  threshold: 90,
  resistance: 0.46,
  maxPull: 120,
};
const SETTLE_MS = 320;

function touchTargetDefersPull(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest('input:not([type="button"]):not([type="submit"]):not([type="reset"]), textarea, select, [contenteditable="true"]')) {
    return true;
  }
  const lab = target.closest("label");
  const ctl = lab && "control" in lab ? (lab as HTMLLabelElement).control : null;
  return Boolean(
    ctl &&
      (ctl instanceof HTMLInputElement ||
        ctl instanceof HTMLTextAreaElement ||
        ctl instanceof HTMLSelectElement),
  );
}

export { MEMBER_GLOBAL_REFRESH_REQUEST_EVENT, MEMBER_PULL_REFRESH_EVENT };

interface Props {
  children: ReactNode;
  themeColor?: string;
  scrollContainer?: boolean;
  className?: string;
  scrollElRef?: MutableRefObject<HTMLDivElement | null> | RefObject<HTMLDivElement | null>;
}

export function PullToRefresh({ children, themeColor = "#4d8cff", scrollContainer = false, className, scrollElRef }: Props) {
  const { t } = useLanguage();
  const androidMode = useMemo(detectAndroidWebView, []);
  const iosMode = useMemo(detectIos, []);
  const pullConfig = useMemo(() => {
    if (androidMode) return ANDROID_PULL_CONFIG;
    if (iosMode) return IOS_PULL_CONFIG;
    return DEFAULT_PULL_CONFIG;
  }, [androidMode, iosMode]);
  const [pulling, setPulling] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [settling, setSettling] = useState(false);
  const startYRef = useRef(0);
  const startScrollTopRef = useRef(0);
  const pullActiveRef = useRef(false);
  const internalScrollRef = useRef<HTMLDivElement>(null);
  const scrollRef = scrollElRef ?? internalScrollRef;
  const location = useLocation();
  const prefersReducedMotion = usePrefersReducedMotion();
  const memberTabScrollMemoryRef = useRef<Record<string, number>>({});
  const memberScrollPrevPathRef = useRef<string | null>(null);
  const scrollRestoreFrameRef = useRef<number | null>(null);
  const moveRafRef = useRef<number | null>(null);
  const pendingDistanceRef = useRef(0);

  const [scrollNode, setScrollNode] = useState<HTMLDivElement | null>(null);
  const scrollRefCallback = useCallback((node: HTMLDivElement | null) => {
    setScrollNode(node);
    if (scrollRef && "current" in scrollRef) {
      (scrollRef as MutableRefObject<HTMLDivElement | null>).current = node;
    }
  }, [scrollRef]);

  const stateRef = useRef({ pulling: false, refreshing: false, pullDistance: 0 });

  // ═══════════════════════════════════════════════════════════════════════
  //  Android WebView: report scroll position to native bridge
  // ═══════════════════════════════════════════════════════════════════════
  useEffect(() => {
    if (!androidMode || !scrollNode) return;

    let lastReported: boolean | null = null;
    const report = () => {
      const atTop = Math.round(scrollNode.scrollTop) <= 0;
      if (atTop !== lastReported) {
        lastReported = atTop;
        try { window.AndroidBridge?.reportScrollTop?.(atTop); } catch { /* noop */ }
      }
    };

    scrollNode.addEventListener("scroll", report, { passive: true });
    report();

    return () => scrollNode.removeEventListener("scroll", report);
  }, [androidMode, scrollNode]);

  // ═══════════════════════════════════════════════════════════════════════
  //  Android WebView: listen for native:refresh event from the native PTR
  // ═══════════════════════════════════════════════════════════════════════
  useEffect(() => {
    if (!androidMode) return;

    const handleNativeRefresh = () => {
      void safeMemberGlobalRefresh(queryClient).finally(() => {
        try { window.AndroidBridge?.onRefreshComplete?.(); } catch { /* noop */ }
      });
    };

    window.addEventListener("native:refresh", handleNativeRefresh);
    return () => window.removeEventListener("native:refresh", handleNativeRefresh);
  }, [androidMode]);

  // ═══════════════════════════════════════════════════════════════════════
  //  Web PTR: doRefresh (only used in non-Android mode)
  // ═══════════════════════════════════════════════════════════════════════
  const unmountedRef = useRef(false);
  useEffect(() => () => { unmountedRef.current = true; }, []);

  const doRefresh = useCallback(() => {
    setRefreshing(true);
    stateRef.current.refreshing = true;
    if (navigator.vibrate && !prefersReducedMotion) {
      try { navigator.vibrate(12); } catch { /* noop */ }
    }

    const settle = () => {
      if (unmountedRef.current) return;
      setSettling(true);
      setPullDistance(0);
      stateRef.current.pullDistance = 0;
      setTimeout(() => {
        if (unmountedRef.current) return;
        setRefreshing(false);
        setPulling(false);
        setSettling(false);
        stateRef.current.refreshing = false;
        stateRef.current.pulling = false;
      }, SETTLE_MS);
    };

    void safeMemberGlobalRefresh(queryClient).then((didRun) => {
      if (didRun) {
        setTimeout(() => {
          if (!unmountedRef.current) settle();
        }, 300);
      } else {
        settle();
      }
    });
  }, [prefersReducedMotion]);

  // ═══════════════════════════════════════════════════════════════════════
  //  Web PTR: touch event handlers (skipped in Android mode)
  // ═══════════════════════════════════════════════════════════════════════
  useEffect(() => {
    if (androidMode) return;

    const el = scrollContainer ? scrollNode : null;
    const target = el || document.body;
    if (!target) return;

    const handleTouchStart = (e: TouchEvent) => {
      if (stateRef.current.refreshing) return;
      if (touchTargetDefersPull(e.target)) return;

      pullActiveRef.current = false;

      const currentScrollTop = scrollContainer
        ? (el?.scrollTop ?? 0)
        : (window.scrollY || document.documentElement.scrollTop || 0);

      startScrollTopRef.current = currentScrollTop;

      if (Math.round(currentScrollTop) > 0) return;

      startYRef.current = e.touches[0].clientY;
      pullActiveRef.current = true;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!pullActiveRef.current || stateRef.current.refreshing) return;

      if (startScrollTopRef.current > 0) {
        pullActiveRef.current = false;
        return;
      }

      const currentScrollTop = scrollContainer
        ? (el?.scrollTop ?? 0)
        : (window.scrollY || document.documentElement.scrollTop || 0);

      const dy = e.touches[0].clientY - startYRef.current;

      if (dy < 0) {
        pullActiveRef.current = false;
        if (stateRef.current.pulling) {
          setPulling(false);
          setPullDistance(0);
          stateRef.current.pulling = false;
          stateRef.current.pullDistance = 0;
        }
        return;
      }

      if (Math.round(currentScrollTop) > 0) {
        pullActiveRef.current = false;
        if (stateRef.current.pulling) {
          setPulling(false);
          setPullDistance(0);
          stateRef.current.pulling = false;
          stateRef.current.pullDistance = 0;
        }
        return;
      }

      if (dy > 4) {
        e.preventDefault();
      }

      const distance = Math.min(dy * pullConfig.resistance, pullConfig.maxPull);
      if (!stateRef.current.pulling) {
        setPulling(true);
        stateRef.current.pulling = true;
      }
      pendingDistanceRef.current = distance;
      if (moveRafRef.current == null) {
        moveRafRef.current = window.requestAnimationFrame(() => {
          moveRafRef.current = null;
          const next = pendingDistanceRef.current;
          setPullDistance(next);
          stateRef.current.pullDistance = next;
        });
      }
    };

    const handleTouchEnd = () => {
      if (!pullActiveRef.current) return;
      pullActiveRef.current = false;
      if (moveRafRef.current != null) {
        window.cancelAnimationFrame(moveRafRef.current);
        moveRafRef.current = null;
      }
      const finalDistance = pendingDistanceRef.current || stateRef.current.pullDistance;
      stateRef.current.pullDistance = finalDistance;
      if (stateRef.current.pullDistance >= pullConfig.threshold) {
        setPullDistance(pullConfig.threshold);
        stateRef.current.pullDistance = pullConfig.threshold;
        doRefresh();
      } else {
        setPulling(false);
        setPullDistance(0);
        stateRef.current.pulling = false;
        stateRef.current.pullDistance = 0;
      }
    };

    target.addEventListener("touchstart", handleTouchStart, { passive: true });
    target.addEventListener("touchmove", handleTouchMove, { passive: false });
    target.addEventListener("touchend", handleTouchEnd, { passive: true });
    target.addEventListener("touchcancel", handleTouchEnd, { passive: true });

    return () => {
      target.removeEventListener("touchstart", handleTouchStart);
      target.removeEventListener("touchmove", handleTouchMove);
      target.removeEventListener("touchend", handleTouchEnd);
      target.removeEventListener("touchcancel", handleTouchEnd);
      if (moveRafRef.current != null) {
        window.cancelAnimationFrame(moveRafRef.current);
        moveRafRef.current = null;
      }
    };
  }, [androidMode, scrollContainer, scrollNode, doRefresh]);

  useEffect(() => {
    setPulling(false);
    setPullDistance(0);
    setRefreshing(false);
    setSettling(false);
    pullActiveRef.current = false;
    stateRef.current = { pulling: false, refreshing: false, pullDistance: 0 };
  }, [location.pathname]);

  useLayoutEffect(() => {
    if (!scrollContainer) return;
    const el = scrollNode;
    if (!el) return;
    const pathname = location.pathname;
    const prev = memberScrollPrevPathRef.current;

    if (prev != null && isMemberBottomTabPath(prev)) {
      memberTabScrollMemoryRef.current[prev] = el.scrollTop;
    }

    if (scrollRestoreFrameRef.current != null) {
      window.cancelAnimationFrame(scrollRestoreFrameRef.current);
      scrollRestoreFrameRef.current = null;
    }

    if (isMemberBottomTabPath(pathname)) {
      const nextTop = memberTabScrollMemoryRef.current[pathname] ?? 0;
      if (Math.abs(el.scrollTop - nextTop) > 1) {
        el.scrollTop = nextTop;
      }
      el.scrollLeft = 0;
    } else {
      const enteredSubRouteFromTab = prev != null && isMemberBottomTabPath(prev);
      if (enteredSubRouteFromTab && Math.abs(el.scrollTop) > 1) {
        el.scrollTop = 0;
      }
    }
    memberScrollPrevPathRef.current = pathname;

    return () => {
      if (scrollRestoreFrameRef.current != null) {
        window.cancelAnimationFrame(scrollRestoreFrameRef.current);
        scrollRestoreFrameRef.current = null;
      }
    };
  }, [location.pathname, scrollContainer, scrollNode]);

  // ═══════════════════════════════════════════════════════════════════════
  //  Render
  // ═══════════════════════════════════════════════════════════════════════
  const progress = Math.min(pullDistance / pullConfig.threshold, 1);
  const rotation = prefersReducedMotion ? 0 : pullDistance * 3.6;
  const indicatorScale = prefersReducedMotion ? 1 : 0.5 + progress * 0.5;

  const showIndicator = pulling || refreshing || settling;
  const animateCollapse = settling || (!pulling && !refreshing);

  const indicator = androidMode ? null : (
    <div
      className="member-ptr-indicator shrink-0"
      style={{
        height: showIndicator ? pullDistance : 0,
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: animateCollapse && !prefersReducedMotion
          ? `height ${SETTLE_MS}ms cubic-bezier(0.2, 0.8, 0.2, 1)`
          : pulling
            ? "none"
            : `height ${SETTLE_MS}ms cubic-bezier(0.2, 0.8, 0.2, 1)`,
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          opacity: settling ? 0 : progress,
          transform: `scale(${indicatorScale})`,
          transition: settling
            ? `opacity ${SETTLE_MS * 0.6}ms ease`
            : pulling || prefersReducedMotion
              ? "none"
              : `all ${SETTLE_MS}ms ease`,
        }}
      >
        {refreshing ? (
          <>
            <span className="sr-only" role="status">
              {t("正在刷新内容…", "Refreshing…")}
            </span>
            <svg width="24" height="24" viewBox="0 0 24 24" className="member-ptr-spinner" aria-hidden>
              <circle cx="12" cy="12" r="10" fill="none" stroke={themeColor} strokeWidth="2.5" strokeDasharray="48 16" strokeLinecap="round" />
            </svg>
          </>
        ) : (
          <svg width="24" height="24" viewBox="0 0 24 24" style={{ transform: `rotate(${rotation}deg)` }}>
            <path
              d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 .34-.03.67-.09 1h2.02c.05-.33.07-.66.07-1 0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-.34.03-.67.09-1H4.07c-.05.33-.07.66-.07 1 0 4.42 3.58 8 8 8v3l4-4-4-4v3z"
              fill={themeColor}
              opacity={progress}
            />
          </svg>
        )}
      </div>
    </div>
  );

  const contentInner = (
    <div
      style={{
        transition: prefersReducedMotion ? "none" : `transform ${SETTLE_MS}ms cubic-bezier(0.2, 0.8, 0.2, 1)`,
      }}
    >
      {children}
    </div>
  );

  if (scrollContainer) {
    return (
      <div className={cn("flex min-h-0 flex-1 flex-col overflow-hidden", className)}>
        {indicator}
        <div
          ref={scrollRefCallback}
          data-spa-scroll-root="member"
          className="native-scroll-y min-h-0 flex-1 overflow-x-hidden overflow-y-auto"
          style={{
            overscrollBehaviorY: "contain",
            overscrollBehaviorX: "contain",
            touchAction: androidMode ? "pan-y" : pulling ? "none" : "pan-y",
          }}
          role="region"
          aria-busy={refreshing}
          aria-label={t("会员中心滚动区域", "Member portal scroll area")}
        >
          {contentInner}
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      {indicator}
      {contentInner}
    </div>
  );
}
