import {
  type MutableRefObject,
  type ReactNode,
  type RefObject,
  useRef,
  useState,
  useCallback,
  useEffect,
  useLayoutEffect,
} from "react";
import { useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { queryClient } from "@/lib/queryClient";
import { memberQueryKeys } from "@/lib/memberQueryKeys";
import { isMemberBottomTabPath } from "@/lib/memberBottomTabPaths";
import { useLanguage } from "@/contexts/LanguageContext";

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

const THRESHOLD = 80;
const MAX_PULL = 130;
const RESISTANCE = 0.42;
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

export const MEMBER_PULL_REFRESH_EVENT = "member:pull-refresh";

interface Props {
  children: ReactNode;
  themeColor?: string;
  scrollContainer?: boolean;
  className?: string;
  scrollElRef?: MutableRefObject<HTMLDivElement | null> | RefObject<HTMLDivElement | null>;
}

export function PullToRefresh({ children, themeColor = "#4d8cff", scrollContainer = false, className, scrollElRef }: Props) {
  const { t } = useLanguage();
  const [pulling, setPulling] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [settling, setSettling] = useState(false);
  const startYRef = useRef(0);
  const pullActiveRef = useRef(false);
  const scrolledAwayRef = useRef(false);
  const internalScrollRef = useRef<HTMLDivElement>(null);
  const scrollRef = scrollElRef ?? internalScrollRef;
  const location = useLocation();
  const prefersReducedMotion = usePrefersReducedMotion();
  const memberTabScrollMemoryRef = useRef<Record<string, number>>({});
  const memberScrollPrevPathRef = useRef<string | null>(null);

  const stateRef = useRef({ pulling: false, refreshing: false, pullDistance: 0 });

  const getScrollTop = useCallback((): number => {
    if (scrollContainer) {
      const el = (scrollRef as RefObject<HTMLDivElement>).current;
      return el ? el.scrollTop : 0;
    }
    return window.scrollY || document.documentElement.scrollTop || 0;
  }, [scrollContainer, scrollRef]);

  const isAtTop = useCallback((): boolean => {
    return Math.round(getScrollTop()) <= 0;
  }, [getScrollTop]);

  const doRefresh = useCallback(() => {
    setRefreshing(true);
    stateRef.current.refreshing = true;
    if (navigator.vibrate && !prefersReducedMotion) {
      try { navigator.vibrate(12); } catch { /* noop */ }
    }
    queryClient
      .invalidateQueries({
        queryKey: memberQueryKeys.all,
        refetchType: "active",
        type: "active",
      })
      .then(() => {
        window.dispatchEvent(new CustomEvent(MEMBER_PULL_REFRESH_EVENT));
        setTimeout(() => {
          setSettling(true);
          setPullDistance(0);
          stateRef.current.pullDistance = 0;
          setTimeout(() => {
            setRefreshing(false);
            setPulling(false);
            setSettling(false);
            stateRef.current.refreshing = false;
            stateRef.current.pulling = false;
          }, SETTLE_MS);
        }, 300);
      })
      .catch(() => {
        setSettling(true);
        setPullDistance(0);
        stateRef.current.pullDistance = 0;
        setTimeout(() => {
          setRefreshing(false);
          setPulling(false);
          setSettling(false);
          stateRef.current.refreshing = false;
          stateRef.current.pulling = false;
        }, SETTLE_MS);
      });
  }, [prefersReducedMotion]);

  useEffect(() => {
    const el = scrollContainer
      ? (scrollRef as RefObject<HTMLDivElement>).current
      : null;
    const target = el || document.body;
    if (!target) return;

    const handleTouchStart = (e: TouchEvent) => {
      if (stateRef.current.refreshing) return;
      if (touchTargetDefersPull(e.target)) return;
      scrolledAwayRef.current = false;
      pullActiveRef.current = false;

      if (!isAtTop()) return;

      startYRef.current = e.touches[0].clientY;
      pullActiveRef.current = true;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!pullActiveRef.current || stateRef.current.refreshing) return;
      if (scrolledAwayRef.current) return;

      const dy = e.touches[0].clientY - startYRef.current;

      if (dy < 0) {
        scrolledAwayRef.current = true;
        pullActiveRef.current = false;
        if (stateRef.current.pulling) {
          setPulling(false);
          setPullDistance(0);
          stateRef.current.pulling = false;
          stateRef.current.pullDistance = 0;
        }
        return;
      }

      if (!isAtTop()) {
        scrolledAwayRef.current = true;
        pullActiveRef.current = false;
        if (stateRef.current.pulling) {
          setPulling(false);
          setPullDistance(0);
          stateRef.current.pulling = false;
          stateRef.current.pullDistance = 0;
        }
        return;
      }

      if (dy > 8) {
        e.preventDefault();
      }

      const distance = Math.min(dy * RESISTANCE, MAX_PULL);
      if (!stateRef.current.pulling) {
        setPulling(true);
        stateRef.current.pulling = true;
      }
      setPullDistance(distance);
      stateRef.current.pullDistance = distance;
    };

    const handleTouchEnd = () => {
      scrolledAwayRef.current = false;
      if (!pullActiveRef.current) return;
      pullActiveRef.current = false;
      if (stateRef.current.pullDistance >= THRESHOLD) {
        setPullDistance(THRESHOLD);
        stateRef.current.pullDistance = THRESHOLD;
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
    };
  }, [scrollContainer, scrollRef, isAtTop, doRefresh]);

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
    const el = (scrollRef as MutableRefObject<HTMLDivElement | null>).current;
    if (!el) return;
    const pathname = location.pathname;
    const prev = memberScrollPrevPathRef.current;

    if (prev != null && isMemberBottomTabPath(prev)) {
      memberTabScrollMemoryRef.current[prev] = el.scrollTop;
    }
    if (isMemberBottomTabPath(pathname)) {
      el.scrollTop = memberTabScrollMemoryRef.current[pathname] ?? 0;
    } else {
      el.scrollTop = 0;
      el.scrollLeft = 0;
    }
    memberScrollPrevPathRef.current = pathname;
  }, [location.pathname, scrollContainer, scrollRef]);

  const progress = Math.min(pullDistance / THRESHOLD, 1);
  const rotation = prefersReducedMotion ? 0 : pullDistance * 3.6;
  const indicatorScale = prefersReducedMotion ? 1 : 0.5 + progress * 0.5;

  const showIndicator = pulling || refreshing || settling;
  const animateCollapse = settling || (!pulling && !refreshing);

  const indicator = (
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
          ref={scrollRef as MutableRefObject<HTMLDivElement | null>}
          data-spa-scroll-root="member"
          className="native-scroll-y min-h-0 flex-1 overflow-x-hidden overflow-y-auto [overscroll-behavior-y:contain] [overscroll-behavior-x:contain]"
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
