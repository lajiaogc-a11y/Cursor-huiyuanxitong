/**
 * 新版本发布后弹窗提示用户更新，点击确认后强制刷新。
 * 检测策略：首次 5 秒后检测，之后每 3 分钟轮询 + focus/visibility 事件触发。
 * 开发环境与生产环境均生效；仅跳过 "dev-build" 占位值。
 */
import { useState, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { DrawerDetail } from "@/components/shell/DrawerDetail";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";
import { showMemberPortal } from "@/routes/siteMode";
import { DEV_BUILD_PLACEHOLDER, fetchRemoteFrontendBuildTime, hardReloadWebFrontend } from "@/lib/frontendVersion";
import { RefreshCw } from "lucide-react";

const VERSION_POLL_INTERVAL_MS = 3 * 60 * 1000;

function memberUpdateSurface(pathname: string) {
  return pathname.startsWith("/member") || pathname.startsWith("/invite") || (pathname === "/" && showMemberPortal);
}

export function UpdatePrompt() {
  const { t } = useLanguage();
  const { pathname } = useLocation();
  const memberSurface = memberUpdateSurface(pathname);
  const [needRefresh, setNeedRefresh] = useState(false);
  const [updateSW, setUpdateSW] = useState<(() => void) | null>(null);
  const [latestBuild, setLatestBuild] = useState<string>("");
  const detectedRef = useRef(false);

  useEffect(() => {
    if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
    if ((import.meta.env.VITE_BUILD_TARGET || "web") === "web") return;
    const pwaRegisterModule = "virtual:pwa-register";
    import(/* @vite-ignore */ pwaRegisterModule)
      .then(({ registerSW }) => {
        const doUpdate = registerSW({
          onNeedRefresh: () => setNeedRefresh(true),
          onOfflineReady: () => {},
        });
        setUpdateSW(() => doUpdate);
      })
      .catch(() => { /* PWA registration failure is non-fatal */ });
  }, []);

  useEffect(() => {
    let disposed = false;

    const checkVersion = async () => {
      if (disposed || detectedRef.current) return;
      try {
        const remoteBuild = await fetchRemoteFrontendBuildTime();
        if (remoteBuild === undefined) return;
        if (!remoteBuild || remoteBuild === DEV_BUILD_PLACEHOLDER) return;
        if (remoteBuild !== __BUILD_TIME__) {
          if (!disposed && !detectedRef.current) {
            detectedRef.current = true;
            setLatestBuild(remoteBuild);
            setNeedRefresh(true);
          }
        }
      } catch { /* network hiccup, retry next cycle */ }
    };

    const onFocus = () => { void checkVersion(); };
    const onVisible = () => {
      if (document.visibilityState === "visible") void checkVersion();
    };

    const initTimer = window.setTimeout(checkVersion, 5000);
    const pollTimer = window.setInterval(checkVersion, VERSION_POLL_INTERVAL_MS);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      disposed = true;
      window.clearTimeout(initTimer);
      window.clearInterval(pollTimer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const handleRefresh = async () => {
    if (updateSW) {
      updateSW();
      setNeedRefresh(false);
      return;
    }

    await hardReloadWebFrontend();
  };

  const handleCancel = () => {
    setNeedRefresh(false);
    setTimeout(() => { detectedRef.current = false; }, 10 * 60 * 1000);
  };

  return (
    <DrawerDetail
      open={needRefresh}
      onOpenChange={(open) => {
        if (!open) handleCancel();
      }}
      variant={memberSurface ? "member" : "staff"}
      title={
        <span className="flex items-center gap-3 pr-2">
          <span
            className={cn(
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
              memberSurface
                ? "bg-[hsl(var(--pu-gold)/0.18)] ring-1 ring-[hsl(var(--pu-gold)/0.35)]"
                : "bg-primary/10 ring-1 ring-primary/15",
            )}
          >
            <RefreshCw
              className={cn(
                "h-5 w-5",
                memberSurface ? "text-[hsl(var(--pu-gold-soft))]" : "text-primary",
              )}
              aria-hidden
            />
          </span>
          <span className="min-w-0 text-left leading-snug">
            {t("发现新版本", "New Version Available")}
          </span>
        </span>
      }
      description={t(
        "已发布新的前端构建，刷新即可加载最新功能与修复。",
        "A new frontend build is available. Refresh to load the latest fixes and features.",
      )}
      sheetMaxWidth="md"
      sheetContentProps={{ onPointerDownOutside: (e) => e.preventDefault() }}
    >
      <div className="flex flex-col gap-5">
        {latestBuild ? (
          <div
            className={cn(
              "rounded-xl border px-4 py-3.5",
              memberSurface
                ? "border-white/[0.12] bg-white/[0.04]"
                : "border-border/80 bg-muted/50 shadow-sm",
            )}
          >
            <p
              className={cn(
                "text-[11px] font-semibold uppercase tracking-wider",
                memberSurface ? "text-[#94A3B8]" : "text-muted-foreground",
              )}
            >
              {t("线上构建时间", "Published build")}
            </p>
            <p
              className={cn(
                "mt-1.5 font-mono text-sm font-medium tabular-nums tracking-tight",
                memberSurface ? "text-[#E2E8F0]" : "text-foreground",
              )}
            >
              {latestBuild}
            </p>
          </div>
        ) : null}

        <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:items-center sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={handleCancel}
            className={cn(
              "h-10 w-full shrink-0 sm:w-auto sm:min-w-[7.5rem]",
              memberSurface
                ? "border-white/25 bg-white/[0.06] text-[#E2E8F0] hover:bg-white/[0.12] hover:text-white"
                : "border-input bg-background text-foreground shadow-sm hover:bg-accent hover:text-accent-foreground",
            )}
          >
            {t("稍后", "Later")}
          </Button>
          <Button
            type="button"
            onClick={handleRefresh}
            className={cn(
              "h-10 w-full gap-2 sm:w-auto sm:min-w-[9.5rem]",
              memberSurface
                ? "border-0 bg-[linear-gradient(to_bottom_right,hsl(var(--pu-gold-soft)),hsl(var(--pu-gold)),hsl(var(--pu-gold-deep)))] font-semibold text-[hsl(var(--pu-primary-foreground))] shadow-[0_8px_24px_hsl(var(--pu-gold)/0.28)] hover:opacity-95"
                : "font-semibold shadow-md",
            )}
          >
            <RefreshCw className="h-4 w-4 shrink-0" />
            {t("立即更新", "Update Now")}
          </Button>
        </div>
      </div>
    </DrawerDetail>
  );
}
