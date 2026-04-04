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

/** 触摸起始于输入/可编辑区时不激活下拉刷新，避免与划选文字、光标拖动冲突 */
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

/** Custom event dispatched after a pull-to-refresh so pages can react to data-level refresh */
export const MEMBER_PULL_REFRESH_EVENT = "member:pull-refresh";

interface Props {
  children: ReactNode;
  themeColor?: string;
  /** 根节点作为唯一纵向滚动区（会员布局：避免 document 与内部双滚动、回弹异常） */
  scrollContainer?: boolean;
  className?: string;
  /** External ref to the scroll element (for scroll restoration in parent) */
  scrollElRef?: MutableRefObject<HTMLDivElement | null> | RefObject<HTMLDivElement | null>;
}

export function PullToRefresh({ children, themeColor = "#4d8cff", scrollContainer = false, className, scrollElRef }: Props) {
  const { t } = useLanguage();
  const [pulling, setPulling] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startYRef = useRef(0);
  const pullActiveRef = useRef(false);
  const internalScrollRef = useRef<HTMLDivElement>(null);
  const scrollRef = scrollElRef ?? internalScrollRef;
  const location = useLocation();
  const prefersReducedMotion = usePrefersReducedMotion();
  const memberTabScrollMemoryRef = useRef<Record<string, number>>({});
  const memberScrollPrevPathRef = useRef<string | null>(null);

  const canPull = useCallback(() => {
    if (scrollContainer) {
      const el = (scrollRef as RefObject<HTMLDivElement>).current;
      if (!el) return false;
      return Math.round(el.scrollTop) <= 0;
    }
    return Math.round(window.scrollY) <= 0 && Math.round(document.documentElement.scrollTop) <= 0;
  }, [scrollContainer, scrollRef]);

  /** Track whether the gesture clearly committed to scrolling (not pulling) */
  const scrolledAwayRef = useRef(false);

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (refreshing) return;
      if (touchTargetDefersPull(e.target)) return;
      scrolledAwayRef.current = false;
      if (!canPull()) {
        pullActiveRef.current = false;
        return;
      }
      startYRef.current = e.touches[0].clientY;
      pullActiveRef.current = true;
    },
    [refreshing, canPull]
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!pullActiveRef.current || refreshing) return;
      if (scrolledAwayRef.current) return;

      const dy = e.touches[0].clientY - startYRef.current;

      if (dy < 0) {
        scrolledAwayRef.current = true;
        pullActiveRef.current = false;
        setPulling(false);
        setPullDistance(0);
        return;
      }

      if (!canPull()) {
        scrolledAwayRef.current = true;
        pullActiveRef.current = false;
        setPulling(false);
        setPullDistance(0);
        return;
      }

      const distance = Math.min(dy * RESISTANCE, MAX_PULL);
      setPulling(true);
      setPullDistance(distance);
    },
    [refreshing, canPull]
  );

  const doRefresh = useCallback(() => {
    setRefreshing(true);
    if (navigator.vibrate && !prefersReducedMotion) {
      try {
        navigator.vibrate(12);
      } catch {
        /* noop */
      }
    }
    const resetPull = () => {
      setRefreshing(false);
      setPulling(false);
      setPullDistance(0);
    };
    queryClient
      .invalidateQueries({
        queryKey: memberQueryKeys.all,
        refetchType: "active",
        type: "active",
      })
      .then(() => {
        window.dispatchEvent(new CustomEvent(MEMBER_PULL_REFRESH_EVENT));
        setTimeout(resetPull, 400);
      })
      .catch(resetPull);
  }, [prefersReducedMotion]);

  const onTouchEnd = useCallback(() => {
    scrolledAwayRef.current = false;
    if (!pullActiveRef.current) return;
    pullActiveRef.current = false;
    if (pullDistance >= THRESHOLD) {
      setPullDistance(THRESHOLD);
      doRefresh();
    } else {
      setPulling(false);
      setPullDistance(0);
    }
  }, [pullDistance, doRefresh]);

  useEffect(() => {
    setPulling(false);
    setPullDistance(0);
    setRefreshing(false);
    pullActiveRef.current = false;
  }, [location.pathname]);

  /**
   * 底部 Tab 互切：记住各 Tab 的 scrollTop（keep-alive 与滚动区合一）。
   * 非 Tab 或与 Tab 之间切换：仍置顶，避免长页残留导致短页「闪跳」。
   */
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

  const indicator = (
    <div
      className="member-ptr-indicator shrink-0"
      style={{
        height: pulling || refreshing ? pullDistance : 0,
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition:
          pulling || prefersReducedMotion ? "none" : "height 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)",
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          opacity: progress,
          transform: `scale(${indicatorScale})`,
          transition: pulling || prefersReducedMotion ? "none" : "all 0.3s ease",
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
        transform: pulling && !refreshing ? `translateY(0)` : undefined,
        transition:
          pulling || prefersReducedMotion ? "none" : "transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)",
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
          className="native-scroll-y min-h-0 flex-1 overflow-x-hidden overflow-y-auto [overscroll-behavior:contain]"
          role="region"
          aria-busy={refreshing}
          aria-label={t("会员中心滚动区域", "Member portal scroll area")}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onTouchCancel={onTouchEnd}
        >
          {contentInner}
        </div>
      </div>
    );
  }

  return (
    <div
      className={className}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
    >
      {indicator}
      {contentInner}
    </div>
  );
}
