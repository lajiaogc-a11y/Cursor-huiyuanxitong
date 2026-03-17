/**
 * 新版本发布后弹窗提示用户更新，点击确认后强制刷新
 */
import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import { RefreshCw } from "lucide-react";
import { subscribeMemberPortalLiveUpdate } from "@/services/members/memberPortalLiveUpdateService";

export function UpdatePrompt() {
  const { t } = useLanguage();
  const [needRefresh, setNeedRefresh] = useState(false);
  const [updateSW, setUpdateSW] = useState<(() => void) | null>(null);
  const [latestBuild, setLatestBuild] = useState<string>("");

  useEffect(() => {
    if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
    if ((import.meta.env.VITE_BUILD_TARGET || "web") === "web") return;
    const pwaRegisterModule = "virtual:pwa-register";
    import(/* @vite-ignore */ pwaRegisterModule)
      .then(({ registerSW }) => {
        const doUpdate = registerSW({
          onNeedRefresh: () => setNeedRefresh(true),
          onOfflineReady: () => {
            // 离线就绪，可选提示
          },
        });
        setUpdateSW(() => doUpdate);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!import.meta.env.PROD) return;
    let disposed = false;

    const checkVersion = async () => {
      try {
        const res = await fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { buildTime?: string };
        const remoteBuild = String(data.buildTime || "").trim();
        if (!remoteBuild) return;
        if (remoteBuild !== __BUILD_TIME__) {
          if (!disposed) {
            setLatestBuild(remoteBuild);
            setNeedRefresh(true);
          }
        }
      } catch {
        // ignore
      }
    };

    const timer = window.setInterval(checkVersion, 30000);
    const onFocus = () => { void checkVersion(); };
    const onVisible = () => {
      if (document.visibilityState === "visible") void checkVersion();
    };
    void checkVersion();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      disposed = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  useEffect(() => {
    return subscribeMemberPortalLiveUpdate((payload) => {
      if (payload.type !== "force_refresh") return;
      if (payload.buildTime) setLatestBuild(payload.buildTime);
      setNeedRefresh(true);
    });
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
  };

  return (
    <Dialog open={needRefresh} onOpenChange={(open) => !open && handleCancel()}>
      <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5 text-primary" />
            {t("发现新版本", "New Version Available")}
          </DialogTitle>
          <DialogDescription>
            {t(
              "系统已发布新版本，请点击下方按钮自动刷新到最新版本。",
              "A new version has been released. Click the button below to refresh to the latest version."
            )}
            {latestBuild ? (
              <span className="block mt-2 text-xs text-muted-foreground">
                {t("最新构建时间", "Latest build")}: {latestBuild}
              </span>
            ) : null}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleCancel}>
            {t("稍后", "Later")}
          </Button>
          <Button onClick={handleRefresh}>
            <RefreshCw className="mr-2 h-4 w-4" />
            {t("立即更新", "Update Now")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
