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
import { AnimatePresence } from "framer-motion";
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
import { isMemberBottomTabPath } from "@/lib/memberBottomTabPaths";
import { preloadMemberRouteChunk } from "@/lib/memberRouteChunkPreload";
import { MemberTabbedShell } from "@/components/member/MemberTabbedShell";
import "@/styles/member-portal.css";
import { applyMemberPortalFaviconFromLogoRaw } from "@/lib/memberPortalFavicon";
import { preloadMemberPortalLogo } from "@/lib/memberPortalLogoPreload";

/** 首进会员壳：最短品牌展示；最长避免弱网卡在启动页 */
const MEMBER_ENTRY_SPLASH_MIN_MS = 1200;
const MEMBER_ENTRY_SPLASH_MAX_MS = 3800;

let _chunksPreloaded = false;

const _scheduleIdle =
  typeof requestIdleCallback === "function"
    ? (fn: () => void) => requestIdleCallback(fn, { timeout: 4000 })
    : (fn: () => void) => setTimeout(fn, 80);

function preloadMemberChunks() {
  if (_chunksPreloaded) return;
  _chunksPreloaded = true;

  const swallow = (err: unknown) => { console.warn('[MemberLayout] chunk preload failed:', err); };

  import("@/pages/member/MemberDashboard").catch(swallow);
  import("@/pages/member/MemberPoints").catch(swallow);

  _scheduleIdle(() => {
    import("@/pages/member/MemberSpin").catch(swallow);
    import("@/pages/member/MemberInvite").catch(swallow);
    import("@/pages/member/MemberSettings").catch(swallow);
  });

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
  /** 进入过任一底部 Tab 后保持挂载 Tab 壳层，避免 Wallet 等子页返回时丢 keep-alive */
  const [tabShellMounted, setTabShellMounted] = useState(() => isBottomTab);
  const [shellActivePath, setShellActivePath] = useState<string>(() =>
    isBottomTab ? pathname : ROUTES.MEMBER.DASHBOARD,
  );

  useEffect(() => {
    if (isBottomTab) {
      setTabShellMounted(true);
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
    (!portalLoading && entryChunkReady && (!tenantLogoRaw || entryLogoDecoded));

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
            window.setTimeout(() => el?.focus({ preventScroll: true }), 100);
          }}
        >
          {t("跳到主要内容", "Skip to main content")}
        </a>
        <PullToRefresh themeColor={themeColor} scrollContainer>
          <div className="member-layout-scroll-inner member-premium-canvas pu-boost-skin">
            <main id="member-main" className="member-content-rail" tabIndex={-1}>
              {tabShellMounted ? (
                <div
                  ref={tabShellWrapperRef}
                  className={cn(!isBottomTab && "hidden")}
                  inert={!isBottomTab ? true : undefined}
                >
                  <MemberTabbedShell activePath={shellActivePath} />
                </div>
              ) : null}
              {!isBottomTab ? (
                <AnimatePresence mode="wait">
                  <PageTransition key={pathname}>
                    <Suspense fallback={suspenseFallback}>{children}</Suspense>
                  </PageTransition>
                </AnimatePresence>
              ) : null}
            </main>
          </div>
        </PullToRefresh>
        {pathname !== ROUTES.MEMBER.FIRST_PASSWORD ? <MemberBottomNav /> : null}
        {pathname === ROUTES.MEMBER.DASHBOARD && (
          <CustomerServiceWidget
            agents={settings.customer_service_agents || []}
            label={settings.customer_service_label}
          />
        )}
      </div>
    </ErrorBoundary>
  );
}
