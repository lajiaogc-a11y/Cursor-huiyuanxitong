/**
 * 平台设置 - 仅平台超级管理员可见
 * 子导航在左侧 AdminSidebar，此处仅展示右侧内容
 */
import { lazy, Suspense } from "react";
import { useParams, Navigate } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";

const SystemHealthMonitor = lazy(() => import("@/components/SystemHealthMonitor"));
const IpAccessControlTab = lazy(() => import("@/components/IpAccessControlTab"));
const DataArchiveTab = lazy(() => import("@/components/DataArchiveTab").then(m => ({ default: m.DataArchiveTab })));
const RiskDashboardTab = lazy(() => import("@/components/RiskDashboardTab").then(m => ({ default: m.RiskDashboardTab })));
const ResourceMonitorTab = lazy(() => import("@/components/ResourceMonitorTab").then(m => ({ default: m.ResourceMonitorTab })));
import DataRepairTab from "@/components/DataRepairTab";
import DataBackupTab from "@/components/DataBackupTab";
import InvitationCodeManagement from "@/components/InvitationCodeManagement";

const tabContentMap: Record<string, React.ReactNode> = {
  "ip-control": <Suspense fallback={null}><IpAccessControlTab /></Suspense>,
  "system-health": <Suspense fallback={null}><SystemHealthMonitor /></Suspense>,
  "resource-monitor": <Suspense fallback={null}><ResourceMonitorTab /></Suspense>,
  "risk-dashboard": <Suspense fallback={null}><RiskDashboardTab /></Suspense>,
  "data-archive": <Suspense fallback={null}><DataArchiveTab /></Suspense>,
  "data-backup": <DataBackupTab />,
  "data-repair": <DataRepairTab />,
  "invitation-codes": <InvitationCodeManagement />,
};

const VALID_TABS = new Set(Object.keys(tabContentMap));

export default function PlatformSettings() {
  const { t } = useLanguage();
  const { tab } = useParams<{ tab: string }>();

  if (!tab || !VALID_TABS.has(tab)) {
    return <Navigate to="/staff/admin/settings/ip-control" replace />;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-blue-200 bg-blue-50/50 dark:bg-blue-950/20 dark:border-blue-800 px-4 py-3 text-sm text-blue-800 dark:text-blue-200">
        {t("平台设置作用于整个网站，与租户无关。租户相关配置请在「系统设置」中操作。", "Platform settings apply to the entire site. For tenant-specific settings, use System Settings.")}
      </div>
      <div className="rounded-xl border bg-card p-6 shadow-sm min-h-[400px]">
        {tabContentMap[tab]}
      </div>
    </div>
  );
}
