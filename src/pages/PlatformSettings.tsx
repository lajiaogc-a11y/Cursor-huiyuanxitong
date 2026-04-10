/**
 * 平台设置 - 仅平台超级管理员可见
 * 子导航在左侧 AdminSidebar，此处仅展示右侧内容
 */
import { lazy, Suspense } from "react";
import { useParams, Navigate, NavLink } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";
import { useIsMobile } from "@/hooks/ui/use-mobile";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { SETTINGS_TABS } from "./platformSettingsTabConfig";
export { getPlatformSettingsSubTabTitle } from "./platformSettingsTabConfig";

const SystemHealthMonitor = lazy(() => import("@/components/SystemHealthMonitor"));
const IpAccessControlTab = lazy(() => import("@/components/IpAccessControlTab"));
const DataArchiveTab = lazy(() => import("@/components/DataArchiveTab").then(m => ({ default: m.DataArchiveTab })));
const RiskDashboardTab = lazy(() => import("@/components/RiskDashboardTab").then(m => ({ default: m.RiskDashboardTab })));
const ResourceMonitorTab = lazy(() => import("@/components/ResourceMonitorTab").then(m => ({ default: m.ResourceMonitorTab })));
import DataRepairTab from "@/components/DataRepairTab";
import DataBackupTab from "@/components/DataBackupTab";
import FeatureFlagsTab from "@/components/FeatureFlagsTab";
import MaintenanceModeTab from "@/components/MaintenanceModeTab";
import AnnouncementsTab from "@/components/AnnouncementsTab";
import Login2FATab from "@/components/Login2FATab";
import TenantQuotaTab from "@/components/TenantQuotaTab";
import DataMigrationToolsTab from "@/components/DataMigrationToolsTab";
const AdminDeviceWhitelistTab = lazy(() => import("@/components/AdminDeviceWhitelistTab"));
const ClientDownloadTab = lazy(() => import("@/components/ClientDownloadTab"));
const OpenApiManagementTabLazy = lazy(async () => {
  const { ApiManagementTab } = await import("@/components/ApiManagementTab");
  return {
    default: function PlatformOpenApiTab() {
      return <ApiManagementTab scope="platform" />;
    },
  };
});
const PlatformOperationLogsLazy = lazy(() => import("@/pages/OperationLogs"));
const PlatformLoginLogsLazy = lazy(() => import("@/pages/LoginLogs"));

function TabSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <Skeleton className="h-8 w-48" />
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" style={{ opacity: 1 - i * 0.15 }} />
        ))}
      </div>
    </div>
  );
}

const tabContentMap: Record<string, React.ReactNode> = {
  "ip-control": <Suspense fallback={<TabSkeleton />}><IpAccessControlTab /></Suspense>,
  "system-health": <Suspense fallback={<TabSkeleton />}><SystemHealthMonitor /></Suspense>,
  "resource-monitor": <Suspense fallback={<TabSkeleton />}><ResourceMonitorTab /></Suspense>,
  "risk-dashboard": <Suspense fallback={<TabSkeleton />}><RiskDashboardTab /></Suspense>,
  "data-archive": <Suspense fallback={<TabSkeleton />}><DataArchiveTab /></Suspense>,
  "data-backup": <DataBackupTab />,
  "data-repair": <DataRepairTab />,
  "operation-logs": (
    <Suspense fallback={<TabSkeleton />}>
      <PlatformOperationLogsLazy />
    </Suspense>
  ),
  "login-logs": (
    <Suspense fallback={<TabSkeleton />}>
      <PlatformLoginLogsLazy />
    </Suspense>
  ),
  "feature-flags": <FeatureFlagsTab />,
  "maintenance-mode": <MaintenanceModeTab />,
  "announcements": <AnnouncementsTab />,
  "login-2fa": <Login2FATab />,
  "tenant-quota": <TenantQuotaTab />,
  "data-migration-tools": <DataMigrationToolsTab />,
  "open-api": (
    <Suspense fallback={<TabSkeleton />}>
      <OpenApiManagementTabLazy />
    </Suspense>
  ),
  "device-whitelist": <Suspense fallback={<TabSkeleton />}><AdminDeviceWhitelistTab /></Suspense>,
  "client-download": <Suspense fallback={<TabSkeleton />}><ClientDownloadTab /></Suspense>,
};

const VALID_TABS = new Set(Object.keys(tabContentMap));

export default function PlatformSettings() {
  const { t } = useLanguage();
  const isMobile = useIsMobile();
  const { tab } = useParams<{ tab: string }>();

  if (tab === "invitation-codes") {
    return <Navigate to="/staff/settings?tab=staff-invite" replace />;
  }
  if (!tab || !VALID_TABS.has(tab)) {
    return <Navigate to="/staff/admin/settings/ip-control" replace />;
  }

  return (
    <div className="space-y-3 md:space-y-4">
      <div className="rounded-lg border border-blue-200 bg-blue-50/50 dark:bg-blue-950/20 dark:border-blue-800 px-3 py-2.5 md:px-4 md:py-3 text-xs md:text-sm leading-relaxed text-blue-800 dark:text-blue-200">
        {t("平台设置作用于整个网站，与租户无关。租户相关配置请在「系统设置」中操作。", "Platform settings apply to the entire site. For tenant-specific settings, use System Settings.")}
      </div>
      <div className="rounded-xl border bg-card p-2 md:p-3">
        {isMobile ? (
          <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-0.5 px-0.5 scrollbar-hide">
            {SETTINGS_TABS.map((item) => (
              <NavLink
                key={item.key}
                to={`/staff/admin/settings/${item.key}`}
                className={({ isActive }) =>
                  cn(
                    "px-3 py-2 rounded-full text-xs font-medium whitespace-nowrap shrink-0 border transition-colors min-h-[40px] inline-flex items-center",
                    isActive
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-muted/80 text-muted-foreground border-transparent active:bg-muted"
                  )
                }
              >
                {t(item.zh, item.en)}
              </NavLink>
            ))}
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {SETTINGS_TABS.map((item) => (
              <NavLink
                key={item.key}
                to={`/staff/admin/settings/${item.key}`}
                className={({ isActive }) =>
                  cn(
                    "px-3 py-1.5 rounded-md text-xs md:text-sm border transition-colors",
                    isActive
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground hover:text-foreground hover:bg-muted border-border"
                  )
                }
              >
                {t(item.zh, item.en)}
              </NavLink>
            ))}
          </div>
        )}
      </div>
      <div
        className={cn(
          "rounded-xl border bg-card shadow-sm",
          isMobile ? "p-3 min-h-[280px]" : "p-6 min-h-[400px]"
        )}
      >
        {tabContentMap[tab]}
      </div>
    </div>
  );
}
