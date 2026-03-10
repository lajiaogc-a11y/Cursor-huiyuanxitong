import { useTenantView } from "@/contexts/TenantViewContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";
import { EyeOff } from "lucide-react";

export function TenantViewBanner() {
  const { viewingTenantId, viewingTenantName, viewingTenantCode, exitTenant, isViewingTenant } = useTenantView() || {};
  const { t } = useLanguage();

  if (!isViewingTenant || !viewingTenantId) return null;

  return (
    <div className="bg-amber-500/15 border-b border-amber-500/30 px-4 py-2 flex items-center justify-between gap-2 text-amber-800 dark:text-amber-200">
      <span className="text-sm font-medium">
        {t("正在查看", "Viewing")}: {viewingTenantName || "-"} ({viewingTenantCode || "-"}) — {t("只读模式，租户不可知", "Read-only, tenant will not be notified")}
      </span>
      <Button variant="outline" size="sm" onClick={exitTenant} className="shrink-0 border-amber-600/50 hover:bg-amber-500/20">
        <EyeOff className="h-3.5 w-3.5 mr-1.5" />
        {t("退出查看", "Exit View")}
      </Button>
    </div>
  );
}
