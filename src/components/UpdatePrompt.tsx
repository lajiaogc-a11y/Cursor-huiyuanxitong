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
import { RefreshCw } from "lucide-react";

const VERSION_POLL_INTERVAL_MS = 3 * 60 * 1000;
const DEV_BUILD_PLACEHOLDER = "dev-build";

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
        const res = await fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { buildTime?: string };
        const remoteBuild = String(data.buildTime || "").trim();
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

    try {
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } catch {
      // ignore
    }

    const url = new URL(window.location.href);
    url.searchParams.set("__v", Date.now().toString());
    window.location.replace(url.toString());
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
        <span className="flex items-center gap-2">
          <RefreshCw
            className={cn(
              "h-5 w-5 shrink-0",
              memberSurface ? "text-[hsl(var(--pu-gold-soft))]" : "text-primary",
            )}
          />
          {t("发现新版本", "New Version Available")}
        </span>
      }
      description={t(
        "系统已发布新版本，请点击下方按钮自动刷新到最新版本。",
        "A new version has been released. Click the button below to refresh to the latest version.",
      )}
      sheetMaxWidth="xl"
      sheetContentProps={{ onPointerDownOutside: (e) => e.preventDefault() }}
    >
      {latestBuild ? (
        <p
          className={cn(
            "mb-4 text-xs",
            memberSurface ? "text-[#94A3B8]" : "text-muted-foreground",
          )}
        >
          {t("最新构建时间", "Latest build")}: {latestBuild}
        </p>
      ) : null}
      <div
        className={cn(
          "mt-auto flex flex-wrap gap-2 border-t pt-4",
          memberSurface ? "border-white/[0.08]" : "border-border",
        )}
      >
        <Button
          variant="outline"
          onClick={handleCancel}
          className={
            memberSurface
              ? "border-white/15 bg-white/[0.05] text-[#E2E8F0] hover:bg-white/[0.09] hover:text-white"
              : undefined
          }
        >
          {t("稍后", "Later")}
        </Button>
        <Button
          onClick={handleRefresh}
          className={
            memberSurface
              ? "border-0 bg-[linear-gradient(to_bottom_right,hsl(var(--pu-gold-soft)),hsl(var(--pu-gold)),hsl(var(--pu-gold-deep)))] font-semibold text-[hsl(var(--pu-primary-foreground))] shadow-[0_8px_24px_hsl(var(--pu-gold)/0.28)] hover:opacity-95"
              : undefined
          }
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          {t("立即更新", "Update Now")}
        </Button>
      </div>
    </DrawerDetail>
  );
}
