import {
  type CSSProperties,
  type ReactNode,
  Suspense,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useLocation } from "react-router-dom";
import { ROUTES } from "@/routes/constants";
import { MemberBottomNav } from "./MemberBottomNav";
import { CustomerServiceWidget } from "./CustomerServiceWidget";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useMemberAuth } from "@/contexts/MemberAuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useMemberPortalSettings } from "@/hooks/useMemberPortalSettings";
import { PullToRefresh } from "@/components/member/PullToRefresh";
import PageTransition from "@/components/member/PageTransition";
import SplashScreen from "@/components/member/SplashScreen";
import { MemberGlobalLoader } from "@/components/member/GlobalLoader";
import { MemberRouteSuspenseFallback } from "@/components/member/MemberRouteSuspenseFallback";
import {
  MEMBER_POST_LOGIN_VEIL_MS,
  peekMemberPostLoginShellTransition,
  clearMemberPostLoginShellTransition,
} from "@/lib/memberPostLoginTransition";
import { memberPortalGoldCssVarsFromHex } from "@/utils/memberPortalGoldCssVars";
import { cn } from "@/lib/utils";
import { queryClient } from "@/lib/queryClient";
import { MEMBER_GLOBAL_REFRESH_REQUEST_EVENT } from "@/lib/memberPullRefreshEvent";
import { safeMemberGlobalRefresh } from "@/lib/memberSafeRefresh";
import { isMemberBottomTabPath } from "@/lib/memberBottomTabPaths";
import { preloadMemberRouteChunk } from "@/lib/memberRouteChunkPreload";
import { MemberTabbedShell } from "@/components/member/MemberTabbedShell";
import { MemberAppShellPageSlot, MemberAppShellTabbarSlot } from "@/components/member/MemberAppShell";
import "@/styles/member-portal.css";
import { applyMemberPortalFaviconFromLogoRaw } from "@/lib/memberPortalFavicon";
import { preloadMemberPortalLogo } from "@/lib/memberPortalLogoPreload";

/** 首进会员壳：最短品牌展示；最长避免弱网卡在启动页 */
const MEMBER_ENTRY_SPLASH_MIN_MS = 1200;
const MEMBER_ENTRY_SPLASH_MAX_MS = 3800;

let _chunksPreloaded = false;
let _shellTabsPreloadPromise: Promise<void> | null = null;

const _scheduleIdle =
  typeof requestIdleCallback === "function"
    ? (fn: () => void) => requestIdleCallback(fn, { timeout: 4000 })
    : (fn: () => void) => setTimeout(fn, 80);

function preloadMemberShellTabs() {
  if (_shellTabsPreloadPromise) return _shellTabsPreloadPromise;

  const swallow = (err: unknown) => {
    console.warn("[MemberLayout] shell tab preload failed:", err);
  };

  _shellTabsPreloadPromise = Promise.allSettled([
    import("@/pages/member/MemberDashboard").catch(swallow),
    import("@/pages/member/MemberPoints").catch(swallow),
    import("@/pages/member/MemberSpin").catch(swallow),
    import("@/pages/member/MemberInvite").catch(swallow),
    import("@/pages/member/MemberSettings").catch(swallow),
  ]).then(() => undefined);

  return _shellTabsPreloadPromise;
}

function preloadMemberChunks() {
  if (_chunksPreloaded) return;
  _chunksPreloaded = true;

  const swallow = (err: unknown) => {
    console.warn("[MemberLayout] chunk preload failed:", err);
  };

  void preloadMemberShellTabs();

  _scheduleIdle(() => {
    import("@/pages/member/MemberWallet").catch(swallow);
    import("@/pages/member/MemberNotifications").catch(swallow);
    import("@/pages/member/MemberOrders").catch(swallow);
    import("@/pages/member/MemberTradeContact").catch(swallow);
  });
}

export function MemberLayout({ children }: { children: ReactNode }) {
  const { member } = useMemberAuth();
  const { t } = useLanguage();
  const { settings, loading: portalLoading } = useMemberPortalSettings(member?.id);
  const tenantLogoRaw = String(settings.logo_url ?? "").trim();
  /** 有关闭启动页前尽量完成 Logo 解码，避免仅看到色块或闪一下不完整图 */
  const [entryLogoDecoded, setEntryLogoDecoded] = useState(() => !member?.id || !tenantLogoRaw);
  const themeColor = useMemo(() => {
    const c = String(settings.theme_primary_color || "").trim();
    return /^#[0-9A-Fa-f]{6}$/i.test(c) ? c : "#4d8cff";
  }, [settings.theme_primary_color]);
  const portalGoldVars = useMemo(
    () => ({ "--m-theme": themeColor, ...memberPortalGoldCssVarsFromHex(themeColor) }),
    [themeColor],
  );
  const { pathname } = useLocation();
  const isBottomTab = isMemberBottomTabPath(pathname);
  /** 底部五 Tab 子树始终挂载（keep-alive）；非 Tab 路由时整层 hidden，子页返回不重建 */
  const [shellActivePath, setShellActivePath] = useState<string>(() =>
    isBottomTab ? pathname : ROUTES.MEMBER.DASHBOARD,
  );

  useEffect(() => {
    if (isBottomTab) {
      setShellActivePath(pathname);
    }
  }, [isBottomTab, pathname]);

  const tabShellWrapperRef = useRef<HTMLDivElement | null>(null);

  /**
   * 离开底部 Tab 子树（如进入 trade-contact）时，若焦点仍在已隐藏的 Tab 内（如首页 btn-glow），
   * Chrome 会拒绝祖先 aria-hidden 并反复协调，导致控制台警告与滚动闪烁。先 blur，且外层仅用 hidden + inert。
   */
  useLayoutEffect(() => {
    if (isBottomTab) return;
    const wrap = tabShellWrapperRef.current;
    const ae = document.activeElement;
    if (wrap && ae instanceof HTMLElement && wrap.contains(ae)) {
      ae.blur();
      const main = document.getElementById("member-main");
      if (main instanceof HTMLElement) {
        main.focus({ preventScroll: true });
      }
    }
  }, [isBottomTab, pathname]);

  const suspenseFallback = <MemberRouteSuspenseFallback />;
  const [postLoginVeil, setPostLoginVeil] = useState(false);
  const [splashDone, setSplashDone] = useState(() => {
    try { return sessionStorage.getItem("member_splash_shown") === "1"; } catch { return false; }
  });
  const [entryChunkReady, setEntryChunkReady] = useState(() => !member?.id);
  const [shellTabsReady, setShellTabsReady] = useState(() => !member?.id);

  useLayoutEffect(() => {
    document.documentElement.classList.add("member-html");
    return () => {
      document.documentElement.classList.remove("member-html");
    };
  }, []);

  useEffect(() => {
    preloadMemberChunks();
  }, []);

  useEffect(() => {
    if (!member?.id) {
      setShellTabsReady(true);
      return;
    }
    let cancelled = false;
    setShellTabsReady(false);
    void preloadMemberShellTabs().finally(() => {
      if (!cancelled) setShellTabsReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [member?.id]);

  /** 从后台回到前台 / 浏览器恢复 bfcache：强刷会员域 Query + 触发与下拉刷新相同的业务回调 */
  useEffect(() => {
    if (!member?.id) return;

    let hidden = document.visibilityState === "hidden";

    const runForegroundSync = () => {
      void safeMemberGlobalRefresh(queryClient);
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hidden = true;
        return;
      }
      if (hidden && document.visibilityState === "visible") {
        hidden = false;
        runForegroundSync();
      }
    };

    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) runForegroundSync();
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pageshow", onPageShow as EventListener);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pageshow", onPageShow as EventListener);
    };
  }, [member?.id]);

  /** 手动全局刷新请求（与前台恢复 / PTR 同一节流策略） */
  useEffect(() => {
    if (!member?.id) return;
    const onRequest = () => {
      void safeMemberGlobalRefresh(queryClient);
    };
    window.addEventListener(MEMBER_GLOBAL_REFRESH_REQUEST_EVENT, onRequest);
    return () => window.removeEventListener(MEMBER_GLOBAL_REFRESH_REQUEST_EVENT, onRequest);
  }, [member?.id]);

  useEffect(() => {
    applyMemberPortalFaviconFromLogoRaw(settings.logo_url);
  }, [settings.logo_url]);

  useEffect(() => {
    if (!member?.id) {
      setEntryLogoDecoded(true);
      return;
    }
    if (!tenantLogoRaw) {
      setEntryLogoDecoded(true);
      return;
    }
    let cancelled = false;
    setEntryLogoDecoded(false);
    void preloadMemberPortalLogo(tenantLogoRaw).finally(() => {
      if (!cancelled) setEntryLogoDecoded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [member?.id, tenantLogoRaw]);

  useEffect(() => {
    if (!member?.id) {
      setEntryChunkReady(true);
      return;
    }
    let cancelled = false;
    setEntryChunkReady(false);
    void preloadMemberRouteChunk(pathname).finally(() => {
      if (!cancelled) setEntryChunkReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [member?.id, pathname]);

  const handleSplashComplete = () => {
    setSplashDone(true);
    try { sessionStorage.setItem("member_splash_shown", "1"); } catch { /* quota */ }
  };

  const splashDismissReady =
    !member?.id ||
    (!portalLoading && shellTabsReady && entryChunkReady && (!tenantLogoRaw || entryLogoDecoded));

  useEffect(() => {
    if (!member?.id || !splashDone) return;
    if (!peekMemberPostLoginShellTransition()) return;
    setPostLoginVeil(true);
    const timer = window.setTimeout(() => {
      clearMemberPostLoginShellTransition();
      setPostLoginVeil(false);
    }, MEMBER_POST_LOGIN_VEIL_MS);
    return () => window.clearTimeout(timer);
  }, [member?.id, splashDone]);

  return (
    <ErrorBoundary surface="member">
      {postLoginVeil ? <MemberGlobalLoader accentColor={themeColor} /> : null}
      {!splashDone && (
        <SplashScreen
          minDurationMs={MEMBER_ENTRY_SPLASH_MIN_MS}
          maxDurationMs={MEMBER_ENTRY_SPLASH_MAX_MS}
          dismissWhenReady={splashDismissReady}
          duration={2200}
          onComplete={handleSplashComplete}
          accentColor={themeColor}
          brandName={String(settings.company_name || "").trim() || "FastGC"}
          logoUrl={settings.logo_url}
          pendingBrand={
            Boolean(member?.id) && portalLoading && !String(settings.logo_url ?? "").trim()
          }
          showSkip={false}
        />
      )}
      <div
        className={cn(
          "member-portal-wrap member-app-shell elite-member-shell",
          !splashDone && "pointer-events-none select-none",
        )}
        style={portalGoldVars as CSSProperties}
        translate="yes"
        aria-hidden={!splashDone}
      >
        <a
          href="#member-main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-[max(12px,env(safe-area-inset-top))] focus:z-[10001] focus:rounded-xl focus:bg-[hsl(var(--pu-m-surface)/0.95)] focus:px-4 focus:py-2.5 focus:text-sm focus:font-bold focus:text-[hsl(var(--pu-m-text))] focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-[hsl(var(--pu-gold)/0.45)]"
          onClick={(e) => {
            e.preventDefault();
            const el = document.getElementById("member-main");
            el?.scrollIntoView({ behavior: "smooth", block: "start" });
            window.requestAnimationFrame(() => {
              el?.focus({ preventScroll: true });
            });
          }}
        >
          {t("跳到主要内容", "Skip to main content")}
        </a>
        <PullToRefresh themeColor={themeColor} scrollContainer>
          <div className="member-layout-scroll-inner member-premium-canvas pu-boost-skin">
            <MemberAppShellPageSlot>
              <main id="member-main" className="member-content-rail" tabIndex={-1}>
                <div
                  ref={tabShellWrapperRef}
                  className={cn(!isBottomTab && "hidden")}
                  inert={!isBottomTab ? true : undefined}
                  data-member-tab-stack="1"
                >
                  <MemberTabbedShell activePath={shellActivePath} />
                </div>
                <div
                  className={cn(isBottomTab && "hidden")}
                  inert={isBottomTab ? true : undefined}
                  data-member-sub-route-outlet="1"
                >
                  <PageTransition key={pathname}>
                    <Suspense fallback={suspenseFallback}>{children}</Suspense>
                  </PageTransition>
                </div>
              </main>
            </MemberAppShellPageSlot>
          </div>
        </PullToRefresh>
        <MemberAppShellTabbarSlot hidden={pathname === ROUTES.MEMBER.FIRST_PASSWORD}>
          <MemberBottomNav />
        </MemberAppShellTabbarSlot>
        <div
          className={cn(pathname !== ROUTES.MEMBER.DASHBOARD && "hidden")}
          aria-hidden={pathname !== ROUTES.MEMBER.DASHBOARD}
        >
          <CustomerServiceWidget
            agents={settings.customer_service_agents || []}
            label={settings.customer_service_label}
          />
        </div>
      </div>
    </ErrorBoundary>
  );
}
