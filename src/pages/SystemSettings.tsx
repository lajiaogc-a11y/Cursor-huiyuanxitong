import { useEffect, useCallback, lazy, Suspense, useMemo } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { useNavigationVisibility } from "@/hooks/useNavigationVisibility";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import { PageHeader } from "@/components/common";
import { SystemSettingsVersionCard } from "@/components/SystemSettingsVersionCard";

const FeeSettingsTab = lazy(() => import("@/components/FeeSettingsTab"));
const ExchangeRateSettingsTab = lazy(() => import("@/components/ExchangeRateSettingsTab"));
const PointsSettingsTab = lazy(() => import("@/components/PointsSettingsTab"));
const ActivitySettingsTab = lazy(() => import("@/components/ActivitySettingsTab"));
const CustomerSourceSettingsTab = lazy(() => import("@/components/CustomerSourceSettingsTab"));
const DataManagementTab = lazy(() => import("@/components/DataManagementTab"));
const ActivityTypeSettingsTab = lazy(() => import("@/components/ActivityTypeSettingsTab"));
const CopySettingsTab = lazy(() => import("@/components/CopySettingsTab"));
const CurrencySettingsTab = lazy(() => import("@/components/CurrencySettingsTab"));
const PermissionSettingsTab = lazy(() => import("@/components/PermissionSettingsTab"));
const GiftDistributionSettingsTab = lazy(() => import("@/components/GiftDistributionSettingsTab"));
const ApiManagementTabLazy = lazy(async () => {
  const { ApiManagementTab } = await import("@/components/ApiManagementTab");
  return {
    default: function TenantApiManagementTab() {
      return <ApiManagementTab scope="tenant" />;
    },
  };
});
const TenantSettingsOverview = lazy(() => import("@/components/TenantSettingsOverview"));
const InvitationCodeManagement = lazy(() => import("@/components/InvitationCodeManagement"));
const TenantStaffLoginIpTab = lazy(() => import("@/components/TenantStaffLoginIpTab"));
const StaffDeviceBindTab = lazy(() => import("@/components/StaffDeviceBindTab"));
const MemberPromotionSettingsTab = lazy(() => import("@/pages/MemberPromotionSettings"));

const SETTINGS_TAB_MAP: Record<string, string> = {
  fee: "fee", exchange: "exchange", currency: "currency", points: "points",
  "member-levels": "member-levels",
  activity: "activity", activityType: "activityType", giftDistribution: "giftDistribution",
  source: "source", data: "data", copy: "copy", permission: "permission", api: "api",
  overview: "overview", "staff-invite": "staff-invite", "staff-login-ip": "staff-login-ip",
  "staff-devices": "staff-devices",
  "version-update": "version-update",
};

const TAB_ORDER_BASE = [
  "fee", "exchange", "currency", "points", "member-levels", "activity",
  "activityType", "giftDistribution", "source", "data", "copy", "staff-devices",
  "version-update",
];
const ADMIN_TABS = ["permission", "api", "overview", "staff-invite", "staff-login-ip"];

const TAB_COMPONENTS: Record<string, React.LazyExoticComponent<React.ComponentType>> = {
  fee: FeeSettingsTab,
  exchange: ExchangeRateSettingsTab,
  points: PointsSettingsTab,
  activity: ActivitySettingsTab,
  activityType: ActivityTypeSettingsTab,
  giftDistribution: GiftDistributionSettingsTab,
  source: CustomerSourceSettingsTab,
  data: DataManagementTab,
  copy: CopySettingsTab,
  currency: CurrencySettingsTab,
  permission: PermissionSettingsTab,
  api: ApiManagementTabLazy,
  overview: TenantSettingsOverview,
  "staff-invite": InvitationCodeManagement,
  "staff-login-ip": TenantStaffLoginIpTab,
  "staff-devices": StaffDeviceBindTab,
};

function TabFallback() {
  return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

export default function SystemSettings() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { employee } = useAuth();
  const isMobile = useIsMobile();
  const { isNavKeyVisible, loaded: navPermLoaded } = useNavigationVisibility();
  const isAdmin = employee?.role === "admin" || !!employee?.is_super_admin || !!employee?.is_platform_super_admin;
  const isManager = employee?.role === "manager";

  const canSeeMemberLevels =
    !!employee?.is_platform_super_admin || !navPermLoaded || isNavKeyVisible("member_promotion");

  const tabOrder = useMemo(
    () => TAB_ORDER_BASE.filter((k) => k !== "member-levels" || canSeeMemberLevels),
    [canSeeMemberLevels],
  );

  const canAccessTab = useCallback(
    (tab: string) => {
      if (!ADMIN_TABS.includes(tab)) return true;
      if (isAdmin) return true;
      if (isManager && tab === "permission") return true;
      return false;
    },
    [isAdmin, isManager],
  );

  const tabFromUrl = SETTINGS_TAB_MAP[searchParams.get("tab") || ""] || "fee";
  let activeTab = !canAccessTab(tabFromUrl) ? "data" : tabFromUrl;
  if (activeTab === "member-levels" && !canSeeMemberLevels) {
    activeTab = "fee";
  }

  useEffect(() => {
    if (!canAccessTab(tabFromUrl)) {
      navigate("/staff/settings?tab=data", { replace: true });
    }
  }, [canAccessTab, tabFromUrl, navigate]);

  useEffect(() => {
    if (!navPermLoaded) return;
    const raw = SETTINGS_TAB_MAP[searchParams.get("tab") || ""] || "";
    if (raw === "member-levels" && !canSeeMemberLevels) {
      navigate("/staff/settings?tab=fee", { replace: true });
    }
  }, [navPermLoaded, searchParams, canSeeMemberLevels, navigate]);

  const tabLabels: Record<string, string> = {
    fee: t("settings.feeSettings"),
    exchange: t("settings.exchangeRate"),
    currency: t("settings.currencySettings"),
    points: t("settings.pointsSettings"),
    activity: t("settings.activitySettings"),
    activityType: t("settings.activityType"),
    giftDistribution: t("settings.giftDistribution"),
    source: t("settings.customerSource"),
    data: t("settings.dataManagement"),
    copy: t("settings.copySettings"),
    permission: t("settings.permissions"),
    api: t("API管理", "API Management"),
    overview: t("设置总览", "Overview"),
    "staff-invite": t("员工邀请码", "Staff invitation codes"),
    "staff-login-ip": t("登录IP限制", "Login IP allowlist"),
    "staff-devices": t("后台登录设备", "Staff login devices"),
    "member-levels": t("会员等级", "User levels"),
    "version-update": t("版本更新", "Version update"),
  };

  const visibleTabs = useMemo(
    () => [...tabOrder, ...ADMIN_TABS.filter((tab) => canAccessTab(tab))],
    [tabOrder, canAccessTab],
  );

  const ActiveComp = TAB_COMPONENTS[activeTab];

  return (
    <div className="flex h-full flex-col gap-4">
      <PageHeader
        description={t(
          "租户级业务参数与数据配置：费率、汇率、币种、积分、活动、客户来源、数据管理与权限等；移动端可用下方标签切换。",
          "Tenant-level business and data settings—fees, FX, currencies, points, activities, sources, data management, and permissions; use the tabs below on mobile.",
        )}
      />
      {isMobile && (
        <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
          {visibleTabs.map((key) => (
            <button
              key={key}
              onClick={() => setSearchParams({ tab: key })}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors shrink-0",
                activeTab === key
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground active:bg-muted/80"
              )}
            >
              {tabLabels[key] || key}
            </button>
          ))}
        </div>
      )}
      <div className={cn("rounded-xl border bg-card shadow-sm min-h-[400px]", isMobile ? "p-3" : "p-6")}>
        {(activeTab === "member-levels" || activeTab === "version-update" || ActiveComp) && (
          <Suspense fallback={<TabFallback />}>
            {activeTab === "member-levels" ? (
              <MemberPromotionSettingsTab key={activeTab} embedded />
            ) : activeTab === "version-update" ? (
              <SystemSettingsVersionCard embedded />
            ) : (
              ActiveComp && <ActiveComp key={activeTab} />
            )}
          </Suspense>
        )}
      </div>
    </div>
  );
}
