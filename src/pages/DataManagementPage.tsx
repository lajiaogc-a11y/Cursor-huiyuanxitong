import { lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";
import { PageHeader } from "@/components/common";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigationVisibility } from "@/hooks/staff/useNavigationVisibility";
import { useIsMobile } from "@/hooks/ui/use-mobile";
import { cn } from "@/lib/utils";

const DataManagementTab = lazy(() => import("@/components/DataManagementTab"));

function TabFallback() {
  return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

export default function DataManagementPage() {
  const { t } = useLanguage();
  const { employee } = useAuth();
  const { isNavKeyVisible, loaded } = useNavigationVisibility();
  const isMobile = useIsMobile();

  if (!loaded) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!employee?.is_platform_super_admin && !isNavKeyVisible("data_management")) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-2 p-6 text-center">
        <p className="text-lg font-semibold text-destructive">{t("权限不足", "Access denied")}</p>
        <p className="text-sm text-muted-foreground">
          {t(
            "无数据管理模块访问权限（请在权限设置中开启侧栏「数据管理」可见）",
            'No access to Data Management. Enable the "Data Management" sidebar item in permission settings.',
          )}
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <PageHeader
        description={t(
          "数据导入导出、归档与删除、会员门户与活动相关清理能力集中于此，便于统一治理与审计。",
          "Import/export, archival, deletion, and member portal–related cleanup tools are centralized here for governance and audit.",
        )}
      />
      <div className={cn("rounded-xl border bg-card shadow-sm min-h-[400px]", isMobile ? "p-3" : "p-6")}>
        <Suspense fallback={<TabFallback />}>
          <DataManagementTab />
        </Suspense>
      </div>
    </div>
  );
}
