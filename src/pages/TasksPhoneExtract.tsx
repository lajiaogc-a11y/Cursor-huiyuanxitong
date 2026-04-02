/**
 * 工作任务 - 提取设置
 * 号码提取器：批量导入、参数配置、清空池
 */
import { PhoneExtractSettingsSection } from "@/components/PhoneExtractSettingsSection";
import { useLanguage } from "@/contexts/LanguageContext";
import { Link } from "react-router-dom";
import { ExternalLink } from "lucide-react";
import { useTenantFeatureFlag } from "@/hooks/useTenantFeatureFlag";
import { FEATURE_FLAGS } from "@/services/featureFlagService";

export default function TasksPhoneExtract() {
  const { t } = useLanguage();
  const { enabled: phoneExtractEnabled, loading: phoneExtractFlagLoading } = useTenantFeatureFlag(
    FEATURE_FLAGS.PHONE_EXTRACT,
    true
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="max-w-3xl">
          <p className="text-sm leading-6 text-muted-foreground">
            {t("批量导入号码、配置提取参数。提取功能请在汇率计算页面右侧使用。", "Bulk import numbers, configure settings. Use extraction on Exchange Rate page.")}
          </p>
        </div>
        <Link
          to="/exchange-rate"
          className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
        >
          <ExternalLink className="h-4 w-4" />
          {t("去汇率页提取", "Go to Exchange Rate")}
        </Link>
      </div>

      {phoneExtractFlagLoading ? (
        <div className="rounded-lg border p-4 text-sm text-muted-foreground">
          {t("正在加载功能开关...", "Loading feature flags...")}
        </div>
      ) : phoneExtractEnabled ? (
        <PhoneExtractSettingsSection />
      ) : (
        <div className="rounded-lg border p-4 text-sm text-muted-foreground">
          {t("该租户已关闭号码提取功能。请联系平台管理员在「平台设置 > 功能开关」中开启。", "Phone extract is disabled for this tenant. Contact platform admin to enable it in Platform Settings > Feature Flags.")}
        </div>
      )}
    </div>
  );
}
