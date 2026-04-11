import { useState, useCallback, useEffect } from "react";
import { RefreshCw, Loader2, Download, CheckCircle, AlertCircle, Monitor } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { notify } from "@/lib/notifyHub";
import { cn } from "@/lib/utils";
import {
  DEV_BUILD_PLACEHOLDER,
  fetchRemoteFrontendBuildTime,
  hardReloadWebFrontend,
} from "@/lib/frontendVersion";

interface SystemSettingsVersionCardProps {
  embedded?: boolean;
}

/** 系统设置「版本更新」：Web 前端 + Electron 桌面端统一检查更新 */
export function SystemSettingsVersionCard({ embedded = false }: SystemSettingsVersionCardProps) {
  const { t } = useLanguage();
  const [checking, setChecking] = useState(false);
  const buildTarget = import.meta.env.VITE_BUILD_TARGET || "web";
  const isElectronApp = !!window.electronAPI?.isElectron;
  const isPackagedDesktop = isElectronApp || buildTarget === "electron" || buildTarget === "capacitor";

  const [desktopVersion, setDesktopVersion] = useState<string | null>(null);
  const [updateState, setUpdateState] = useState<
    | null
    | { state: "checking" }
    | { state: "available"; version: string }
    | { state: "not-available"; version: string }
    | { state: "downloading"; percent: number }
    | { state: "downloaded"; version: string }
    | { state: "error"; message: string }
  >(null);

  useEffect(() => {
    if (!isElectronApp) return;
    window.electronAPI!.getVersion().then((v) => setDesktopVersion(v)).catch(() => {});
    const unsub = window.electronAPI!.onUpdateStatus((status) => {
      setUpdateState(status as typeof updateState);
      if (status.state === "not-available") {
        setChecking(false);
      } else if (status.state === "error") {
        setChecking(false);
      } else if (status.state === "downloaded") {
        setChecking(false);
      }
    });
    return unsub;
  }, [isElectronApp]);

  const versionLabel = isElectronApp && desktopVersion
    ? `v${desktopVersion}`
    : `v${__APP_VERSION__}`;

  // Web 端：比较 buildTime
  const onCheckUpdateWeb = useCallback(async () => {
    setChecking(true);
    try {
      const remoteBuild = await fetchRemoteFrontendBuildTime();
      if (remoteBuild === undefined) {
        notify.error(t("检查更新失败，请稍后重试。", "Update check failed. Try again later."));
        return;
      }
      if (!remoteBuild) {
        notify.error(t("无法读取线上版本信息。", "Could not read the online version."));
        return;
      }
      if (remoteBuild === DEV_BUILD_PLACEHOLDER) {
        notify.message(
          t("当前为开发环境，线上未发布正式构建时间。", "Dev placeholder: no published build time to compare."),
        );
        return;
      }
      if (remoteBuild !== __BUILD_TIME__) {
        notify.banner(t("发现新版本", "New version available"), {
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
      notify.success(t("当前已是最新版本。", "You're already on the latest version."));
    } finally {
      setChecking(false);
    }
  }, [t]);

  // 桌面端：IPC 触发 electron-updater
  const onCheckUpdateDesktop = useCallback(() => {
    setChecking(true);
    setUpdateState({ state: "checking" });
    window.electronAPI!.checkForUpdate();
  }, []);

  const onCheckUpdate = isElectronApp ? onCheckUpdateDesktop : onCheckUpdateWeb;

  const footerZh = isPackagedDesktop
    ? "桌面端启动后自动检查更新，也可点击上方按钮手动检测。发现新版本后自动下载，下载完成后提示安装。"
    : "打开后台后会自动检查是否有新版本，发现更新后会提示刷新。";
  const footerEn = isPackagedDesktop
    ? "The desktop app auto-checks for updates on launch. Click above to check manually. New versions download automatically and prompt to install."
    : "The staff console checks for updates after load and prompts you to refresh when a new build is published.";

  const renderUpdateStatus = () => {
    if (!isElectronApp || !updateState) return null;
    switch (updateState.state) {
      case "checking":
        return (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("正在检测更新…", "Checking for updates…")}
          </div>
        );
      case "available":
        return (
          <div className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400">
            <Download className="h-4 w-4" />
            {t(`发现新版本 v${updateState.version}，正在下载…`, `New version v${updateState.version} found, downloading…`)}
          </div>
        );
      case "not-available":
        return (
          <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
            <CheckCircle className="h-4 w-4" />
            {t("当前已是最新版本", "You're on the latest version")}
          </div>
        );
      case "downloading":
        return (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400">
              <Download className="h-4 w-4" />
              {t("正在下载更新…", "Downloading update…")}
              <span className="tabular-nums font-medium">{updateState.percent}%</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all duration-300"
                style={{ width: `${updateState.percent}%` }}
              />
            </div>
          </div>
        );
      case "downloaded":
        return (
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
              <CheckCircle className="h-4 w-4" />
              {t(`v${updateState.version} 已下载完成`, `v${updateState.version} downloaded`)}
            </div>
            <Button
              size="sm"
              className="h-7 gap-1.5"
              onClick={() => window.electronAPI!.installUpdate()}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              {t("立即重启更新", "Restart & Update")}
            </Button>
          </div>
        );
      case "error":
        return (
          <div className="flex items-center gap-2 text-sm text-red-500">
            <AlertCircle className="h-4 w-4" />
            {t("检测更新失败", "Update check failed")}
            <span className="text-xs text-muted-foreground truncate max-w-[200px]">{updateState.message}</span>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <Card
      className={cn(
        "overflow-hidden",
        embedded
          ? "border-0 shadow-none bg-transparent dark:bg-transparent"
          : "border shadow-sm bg-card border-border dark:border-[#30363D] dark:bg-[#1a1d23]",
      )}
    >
      <CardHeader className={cn("space-y-0 pb-3 px-5", embedded ? "pt-0" : "pt-4")}>
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
          {t("版本更新", "Version update")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 px-5 pb-4 pt-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <p className="text-sm text-muted-foreground dark:text-[#8b949e]">
              {t("当前版本", "Current version")}:{" "}
              <span className="font-medium tabular-nums text-foreground dark:text-white">{versionLabel}</span>
            </p>
            {isElectronApp && (
              <Badge variant="outline" className="h-5 text-[10px] gap-1">
                <Monitor className="h-3 w-3" />
                {t("桌面端", "Desktop")}
              </Badge>
            )}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn(
              "h-8 shrink-0 gap-2",
              "dark:border-[#30363d] dark:bg-transparent dark:text-[#e6edf3] dark:hover:bg-white/[0.06]",
            )}
            disabled={checking || updateState?.state === "downloading"}
            onClick={() => void onCheckUpdate()}
          >
            {checking && updateState?.state !== "downloading" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            {t("检查更新", "Check for updates")}
          </Button>
        </div>
        {renderUpdateStatus()}
        <p className="text-xs leading-relaxed text-muted-foreground dark:text-[#8b949e]">{t(footerZh, footerEn)}</p>
      </CardContent>
    </Card>
  );
}
