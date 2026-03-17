/**
 * 平台设置 - 仅平台超级管理员可见
 * 子导航在左侧 AdminSidebar，此处仅展示右侧内容
 */
import { lazy, Suspense } from "react";
import { useParams, Navigate, NavLink } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";

const SystemHealthMonitor = lazy(() => import("@/components/SystemHealthMonitor"));
const IpAccessControlTab = lazy(() => import("@/components/IpAccessControlTab"));
const DataArchiveTab = lazy(() => import("@/components/DataArchiveTab").then(m => ({ default: m.DataArchiveTab })));
const RiskDashboardTab = lazy(() => import("@/components/RiskDashboardTab").then(m => ({ default: m.RiskDashboardTab })));
const ResourceMonitorTab = lazy(() => import("@/components/ResourceMonitorTab").then(m => ({ default: m.ResourceMonitorTab })));
import DataRepairTab from "@/components/DataRepairTab";
import DataBackupTab from "@/components/DataBackupTab";
import InvitationCodeManagement from "@/components/InvitationCodeManagement";
import FeatureFlagsTab from "@/components/FeatureFlagsTab";
import MaintenanceModeTab from "@/components/MaintenanceModeTab";
import AnnouncementsTab from "@/components/AnnouncementsTab";
import Login2FATab from "@/components/Login2FATab";
import TenantQuotaTab from "@/components/TenantQuotaTab";
import DataMigrationToolsTab from "@/components/DataMigrationToolsTab";

const tabContentMap: Record<string, React.ReactNode> = {
  "ip-control": <Suspense fallback={null}><IpAccessControlTab /></Suspense>,
  "system-health": <Suspense fallback={null}><SystemHealthMonitor /></Suspense>,
  "resource-monitor": <Suspense fallback={null}><ResourceMonitorTab /></Suspense>,
  "risk-dashboard": <Suspense fallback={null}><RiskDashboardTab /></Suspense>,
  "data-archive": <Suspense fallback={null}><DataArchiveTab /></Suspense>,
  "data-backup": <DataBackupTab />,
  "data-repair": <DataRepairTab />,
  "invitation-codes": <InvitationCodeManagement />,
  "feature-flags": <FeatureFlagsTab />,
  "maintenance-mode": <MaintenanceModeTab />,
  "announcements": <AnnouncementsTab />,
  "login-2fa": <Login2FATab />,
  "tenant-quota": <TenantQuotaTab />,
  "data-migration-tools": <DataMigrationToolsTab />,
};

const VALID_TABS = new Set(Object.keys(tabContentMap));
const SETTINGS_TABS = [
  { key: "ip-control", zh: "IP访问控制", en: "IP Access Control" },
  { key: "system-health", zh: "系统健康", en: "System Health" },
  { key: "resource-monitor", zh: "资源监控", en: "Resource Monitor" },
  { key: "risk-dashboard", zh: "风险评分", en: "Risk Scoring" },
  { key: "data-archive", zh: "数据归档", en: "Data Archive" },
  { key: "data-backup", zh: "数据备份", en: "Data Backup" },
  { key: "data-repair", zh: "数据修复", en: "Data Repair" },
  { key: "invitation-codes", zh: "邀请码", en: "Invitation Codes" },
  { key: "feature-flags", zh: "功能开关", en: "Feature Flags" },
  { key: "maintenance-mode", zh: "维护模式", en: "Maintenance Mode" },
  { key: "announcements", zh: "公告/站内信", en: "Announcements" },
  { key: "login-2fa", zh: "登录2FA", en: "Login 2FA" },
  { key: "tenant-quota", zh: "租户配额", en: "Tenant Quota" },
  { key: "data-migration-tools", zh: "数据迁移工具", en: "Data Migration Tools" },
] as const;

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
      <div className="rounded-xl border bg-card p-3">
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
      </div>
      <div className="rounded-xl border bg-card p-6 shadow-sm min-h-[400px]">
        {tabContentMap[tab]}
      </div>
    </div>
  );
}
