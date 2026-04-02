import { useState, useCallback } from "react";
import { RefreshCw, Loader2 } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  DEV_BUILD_PLACEHOLDER,
  fetchRemoteFrontendBuildTime,
  hardReloadWebFrontend,
} from "@/lib/frontendVersion";

/** PC 端系统设置：版本与更新（顶栏已有「系统设置」标题，此处为功能区块） */
export function SystemSettingsVersionCard() {
  const { t } = useLanguage();
  const [checking, setChecking] = useState(false);
  const buildTarget = import.meta.env.VITE_BUILD_TARGET || "web";
  const isPackagedDesktop = buildTarget === "electron" || buildTarget === "capacitor";
  const versionLabel = `v${__APP_VERSION__}`;

  const onCheckUpdate = useCallback(async () => {
    setChecking(true);
    try {
      const remoteBuild = await fetchRemoteFrontendBuildTime();
      if (remoteBuild === undefined) {
        toast.error(t("检查更新失败，请稍后重试。", "Update check failed. Try again later."));
        return;
      }
      if (!remoteBuild) {
        toast.error(t("无法读取线上版本信息。", "Could not read the online version."));
        return;
      }
      if (remoteBuild === DEV_BUILD_PLACEHOLDER) {
        toast.message(
          t("当前为开发环境，线上未发布正式构建时间。", "Dev placeholder: no published build time to compare."),
        );
        return;
      }
      if (remoteBuild !== __BUILD_TIME__) {
        toast(t("发现新版本", "New version available"), {
          description: t(
            "线上构建时间与当前页面不一致，建议刷新以加载最新前端。",
            "The published build differs from this page. Refresh to load the latest app.",
          ),
          action: {
            label: t("立即更新", "Update now"),
            onClick: () => {
              void hardReloadWebFrontend();
            },
          },
        });
        return;
      }
      toast.success(t("当前已是最新版本。", "You're already on the latest version."));
    } finally {
      setChecking(false);
    }
  }, [t]);

  const footerZh = isPackagedDesktop
    ? "桌面端启动时会自动检查更新，发现新版本后会弹窗提示下载。"
    : "打开后台后会自动检查是否有新版本，发现更新后会提示刷新。";
  const footerEn = isPackagedDesktop
    ? "The desktop app checks for updates on startup and prompts when a new build is available."
    : "The staff console checks for updates after load and prompts you to refresh when a new build is published.";

  return (
    <Card
      className={cn(
        "overflow-hidden border shadow-sm",
        "bg-card border-border",
        "dark:border-[#30363D] dark:bg-[#1a1d23]",
      )}
    >
      <CardHeader className="space-y-0 pb-3 pt-4 px-5">
        <CardTitle className="flex items-center gap-2.5 text-base font-semibold text-foreground dark:text-white">
          <span
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
              "bg-primary/10 text-primary",
              "dark:bg-white/10 dark:text-[#e6edf3]",
            )}
          >
            <RefreshCw className="h-4 w-4" />
          </span>
          {t("版本与更新", "Version & updates")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 px-5 pb-4 pt-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground dark:text-[#8b949e]">
            {t("当前版本", "Current version")}:{" "}
            <span className="font-medium tabular-nums text-foreground dark:text-white">{versionLabel}</span>
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn(
              "h-8 shrink-0 gap-2",
              "dark:border-[#30363d] dark:bg-transparent dark:text-[#e6edf3] dark:hover:bg-white/[0.06]",
            )}
            disabled={checking}
            onClick={() => void onCheckUpdate()}
          >
            {checking ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            {t("检查更新", "Check for updates")}
          </Button>
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground dark:text-[#8b949e]">{t(footerZh, footerEn)}</p>
      </CardContent>
    </Card>
  );
}
