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

export function UpdatePrompt() {
  const { t } = useLanguage();
  const [needRefresh, setNeedRefresh] = useState(false);
  const [updateSW, setUpdateSW] = useState<(() => void) | null>(null);

  useEffect(() => {
    if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
    import("virtual:pwa-register")
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

  const handleRefresh = () => {
    updateSW?.();
    setNeedRefresh(false);
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
              "系统已发布新版本，请点击下方按钮刷新页面以获取最新功能。",
              "A new version has been released. Please click the button below to refresh and get the latest features."
            )}
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
