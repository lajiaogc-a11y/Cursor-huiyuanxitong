import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLanguage } from "@/contexts/LanguageContext";

export interface ReportTabsListProps {
  activeTab: string;
  onTabChange: (value: string) => void;
  isMobile: boolean;
}

export function ReportTabsList({
  activeTab,
  onTabChange,
  isMobile,
}: ReportTabsListProps) {
  const { t } = useLanguage();

  return (
    <Tabs value={activeTab} onValueChange={onTabChange}>
      <TabsList className={isMobile ? "grid grid-cols-4 gap-1 h-auto p-1 w-full" : "grid w-full grid-cols-8 h-8"}>
        <TabsTrigger value="employee" className={isMobile ? "text-xs px-2 py-1.5" : "text-xs"}>
          {isMobile ? t("员工", "Staff") : t("员工利润报表", "Employee Profit")}
        </TabsTrigger>
        <TabsTrigger value="card" className={isMobile ? "text-xs px-2 py-1.5" : "text-xs"}>
          {isMobile ? t("卡片", "Card") : t("卡片报表", "Card Report")}
        </TabsTrigger>
        <TabsTrigger value="vendor" className={isMobile ? "text-xs px-2 py-1.5" : "text-xs"}>
          {isMobile ? t("卡商", "Vendor") : t("卡商报表", "Vendor Report")}
        </TabsTrigger>
        <TabsTrigger value="provider" className={isMobile ? "text-xs px-2 py-1.5" : "text-xs"}>
          {isMobile ? t("代付", "Pay") : t("代付报表", "Provider Report")}
        </TabsTrigger>
        <TabsTrigger value="daily" className={isMobile ? "text-xs px-2 py-1.5" : "text-xs"}>
          {isMobile ? t("每日", "Daily") : t("每日报表", "Daily Report")}
        </TabsTrigger>
        <TabsTrigger value="monthly" className={isMobile ? "text-xs px-2 py-1.5" : "text-xs"}>
          {isMobile ? t("每月", "Month") : t("每月报表", "Monthly Report")}
        </TabsTrigger>
        <TabsTrigger value="activity" className={isMobile ? "text-xs px-2 py-1.5" : "text-xs"}>
          {isMobile ? t("活动", "Act") : t("活动报表", "Activity Report")}
        </TabsTrigger>
        <TabsTrigger value="compare" className={isMobile ? "text-xs px-2 py-1.5" : "text-xs"}>
          {isMobile ? t("对比", "Compare") : t("利润对比", "Profit Compare")}
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
