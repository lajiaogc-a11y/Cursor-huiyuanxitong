import { useTenantView } from "@/contexts/TenantViewContext";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";
import { EyeOff } from "lucide-react";

export function TenantViewBanner() {
  const { viewingTenantId, viewingTenantName, viewingTenantCode, exitTenant, isViewingTenant } = useTenantView() || {};
  const { employee } = useAuth() || {};
  const { t } = useLanguage();

  if (!isViewingTenant || !viewingTenantId) return null;
  // 本租户员工查看自己数据时不显示「正在查看」横幅（避免误导）
  if (employee?.tenant_id === viewingTenantId) return null;
  const isPlatformAdmin = !!employee?.is_platform_super_admin;

  return (
    <div className="bg-amber-500/15 border-b border-amber-500/30 px-4 py-2 flex items-center justify-between gap-2 text-amber-800 dark:text-amber-200">
      <span className="text-sm font-medium">
        {t("正在查看", "Viewing")}: {viewingTenantName || "-"} ({viewingTenantCode || "-"}) —{" "}
        {isPlatformAdmin
          ? t("平台总管理员查看模式（只读），租户不会收到任何通知", "Platform admin tenant-view mode (read-only), tenant will not be notified")
          : t("租户不会收到任何通知", "Tenant will not be notified")}
      </span>
      <Button variant="outline" size="sm" onClick={exitTenant} className="shrink-0 border-amber-600/50 hover:bg-amber-500/20">
        <EyeOff className="h-3.5 w-3.5 mr-1.5" />
        {t("退出查看", "Exit View")}
      </Button>
    </div>
  );
}
