import { useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import FeeSettingsTab from "@/components/FeeSettingsTab";
import ExchangeRateSettingsTab from "@/components/ExchangeRateSettingsTab";
import PointsSettingsTab from "@/components/PointsSettingsTab";
import ActivitySettingsTab from "@/components/ActivitySettingsTab";
import CustomerSourceSettingsTab from "@/components/CustomerSourceSettingsTab";
import DataManagementTab from "@/components/DataManagementTab";
import ActivityTypeSettingsTab from "@/components/ActivityTypeSettingsTab";
import CopySettingsTab from "@/components/CopySettingsTab";
import CurrencySettingsTab from "@/components/CurrencySettingsTab";
import PermissionSettingsTab from "@/components/PermissionSettingsTab";
import GiftDistributionSettingsTab from "@/components/GiftDistributionSettingsTab";
import { ApiManagementTab } from "@/components/ApiManagementTab";

const SETTINGS_TAB_MAP: Record<string, string> = {
  fee: "fee", exchange: "exchange", currency: "currency", points: "points",
  activity: "activity", activityType: "activityType", giftDistribution: "giftDistribution",
  source: "source", data: "data", copy: "copy", permission: "permission", api: "api",
};

export default function SystemSettings() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { employee } = useAuth();
  const isAdmin = employee?.role === "admin";

  const tabFromUrl = SETTINGS_TAB_MAP[searchParams.get("tab") || ""] || "fee";
  const activeTab = !isAdmin && (tabFromUrl === "permission" || tabFromUrl === "api") ? "data" : tabFromUrl;

  // 非管理员误入权限/API 时重定向
  useEffect(() => {
    if (!isAdmin && (tabFromUrl === "permission" || tabFromUrl === "api")) {
      navigate("/staff/settings?tab=data", { replace: true });
    }
  }, [isAdmin, tabFromUrl, navigate]);

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
  };

  const tabContentMap: Record<string, React.ReactNode> = {
    fee: <FeeSettingsTab />,
    exchange: <ExchangeRateSettingsTab />,
    points: <PointsSettingsTab />,
    activity: <ActivitySettingsTab />,
    activityType: <ActivityTypeSettingsTab />,
    giftDistribution: <GiftDistributionSettingsTab />,
    source: <CustomerSourceSettingsTab />,
    data: <DataManagementTab />,
    copy: <CopySettingsTab />,
    currency: <CurrencySettingsTab />,
    ...(isAdmin ? { permission: <PermissionSettingsTab /> } : {}),
    ...(isAdmin ? { api: <ApiManagementTab /> } : {}),
  };

  const content = tabContentMap[activeTab];

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-card p-6 shadow-sm min-h-[400px]">
        {content}
      </div>
    </div>
  );
}
