import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { Settings, Globe, Star, Gift, UserPlus, Database, Activity, Copy, DollarSign, Shield, Key, PieChart, ChevronRight } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { useIsMobile, useIsTablet } from "@/hooks/use-mobile";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
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

// 分组配置（桌面端侧边栏）- 仅租户相关设置，所有项仅作用于当前租户
// 平台级功能已移至「平台设置」页面（/platform-settings），仅平台总账号可见
const getDesktopSections = (isAdmin: boolean) => [
  { titleZh: "基础设置", titleEn: "Basic", items: ["fee", "exchange", "currency"] },
  { titleZh: "会员相关", titleEn: "Member", items: ["points", "activity", "activityType", "giftDistribution", "source"] },
  { titleZh: "系统管理", titleEn: "System", items: ["data", "copy", ...(isAdmin ? ["permission"] : [])] },
  ...(isAdmin ? [{ titleZh: "开发者", titleEn: "Developer", items: ["api"] }] : []),
];

export default function SystemSettings() {
  const { tr, t } = useLanguage();
  const { employee } = useAuth();
  const [activeTab, setActiveTab] = useState("fee");
  const [mobileDialogOpen, setMobileDialogOpen] = useState(false);
  const [mobileDialogTab, setMobileDialogTab] = useState("");
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  const useCompactLayout = isMobile || isTablet;

  const isAdmin = employee?.role === 'admin';

  // 非管理员若误入权限设置 Tab，自动跳转到数据管理
  useEffect(() => {
    if (!isAdmin && activeTab === "permission") {
      setActiveTab("data");
    }
  }, [isAdmin, activeTab]);

  const tabItems = [
    { value: "fee", icon: Settings, label: tr("settings.feeSettings") },
    { value: "exchange", icon: Globe, label: tr("settings.exchangeRate") },
    { value: "points", icon: Star, label: tr("settings.pointsSettings") },
    { value: "activity", icon: Gift, label: tr("settings.activitySettings") },
    { value: "activityType", icon: Activity, label: tr("settings.activityType") },
    { value: "giftDistribution", icon: PieChart, label: tr("settings.giftDistribution") },
    { value: "source", icon: UserPlus, label: tr("settings.customerSource") },
    { value: "data", icon: Database, label: tr("settings.dataManagement") },
    { value: "copy", icon: Copy, label: tr("settings.copySettings") },
    { value: "currency", icon: DollarSign, label: tr("settings.currencySettings") },
    ...(isAdmin ? [{ value: "permission", icon: Shield, label: tr("settings.permissions") }] : []),
    ...(isAdmin ? [{ value: "api", icon: Key, label: t("API管理", "API Management") }] : []),
  ];

  const mobileSettingSections = [
    { title: t("基础设置", "Basic Settings"), items: tabItems.filter(i => ["fee", "exchange", "currency"].includes(i.value)) },
    { title: t("会员相关", "Member"), items: tabItems.filter(i => ["points", "activity", "activityType", "giftDistribution", "source"].includes(i.value)) },
    { title: t("系统管理", "System"), items: tabItems.filter(i => ["data", "copy", ...(isAdmin ? ["permission"] : [])].includes(i.value)) },
    ...(isAdmin ? [{ title: t("开发者", "Developer"), items: tabItems.filter(i => ["api"].includes(i.value)) }] : []),
  ].filter(s => s.items.length > 0);

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

  const getDialogLabel = (value: string) => tabItems.find(i => i.value === value)?.label || '';
  const handleMobileItemClick = (value: string) => {
    setMobileDialogTab(value);
    setMobileDialogOpen(true);
  };

  const getItemByValue = (v: string) => tabItems.find(i => i.value === v);

  // 移动端
  if (useCompactLayout) {
    return (
      <div className="space-y-2">
        <div className="rounded-xl border bg-card overflow-hidden shadow-sm">
          {mobileSettingSections.map((section, sIdx) => (
            <div key={section.title}>
              {sIdx > 0 && <div className="h-px bg-border" />}
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3 bg-muted/30">
                {section.title}
              </div>
              <div>
                {section.items.map(({ value, icon: Icon, label }, idx) => (
                  <button
                    key={value}
                    onClick={() => handleMobileItemClick(value)}
                    className={cn(
                      "flex items-center gap-3 w-full px-4 py-3.5 text-left transition-colors active:bg-muted/50 hover:bg-muted/30",
                      idx < section.items.length - 1 && "border-b border-border/40"
                    )}
                  >
                    <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-primary/10 shrink-0">
                      <Icon className="h-4 w-4 text-primary" />
                    </div>
                    <span className="text-[15px] font-medium text-foreground flex-1">{label}</span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <Dialog open={mobileDialogOpen} onOpenChange={setMobileDialogOpen}>
          <DialogContent className="w-[calc(100vw-32px)] max-w-lg h-[85vh] flex flex-col p-0 gap-0 rounded-xl">
            <DialogHeader className="px-5 py-4 border-b shrink-0 bg-muted/20">
              <DialogTitle className="text-base font-semibold">{getDialogLabel(mobileDialogTab)}</DialogTitle>
              <DialogDescription className="sr-only">{getDialogLabel(mobileDialogTab)}</DialogDescription>
            </DialogHeader>
            <ScrollArea className="flex-1">
              <div className="p-4">{mobileDialogTab && tabContentMap[mobileDialogTab]}</div>
            </ScrollArea>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // 桌面端：侧边栏 + 内容区
  return (
    <div className="flex gap-6 -m-4 p-4 min-h-0">
      <aside className="w-56 shrink-0 flex flex-col">
        <div className="rounded-xl border bg-card overflow-hidden shadow-sm sticky top-4">
          <ScrollArea className="h-[calc(100vh-8rem)]">
            <nav className="p-2">
              {getDesktopSections(!!isAdmin).map((section) => {
                const items = section.items
                  .map((v) => getItemByValue(v))
                  .filter(Boolean) as typeof tabItems;
                if (items.length === 0) return null;
                return (
                  <div key={section.titleZh} className="mb-4 last:mb-0">
                    <div className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      {t(section.titleZh, section.titleEn)}
                    </div>
                    <div className="space-y-0.5">
                      {items.map(({ value, icon: Icon, label }) => (
                        <button
                          key={value}
                          onClick={() => setActiveTab(value)}
                          className={cn(
                            "flex items-center gap-2.5 w-full px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                            activeTab === value
                              ? "bg-primary text-primary-foreground shadow-sm"
                              : "text-foreground/80 hover:bg-muted hover:text-foreground"
                          )}
                        >
                          <Icon className="h-4 w-4 shrink-0" />
                          <span className="truncate">{label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </nav>
          </ScrollArea>
        </div>
      </aside>
      <main className="flex-1 min-w-0">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full">
          <TabsList className="sr-only">
            {tabItems.map(({ value }) => (
              <TabsTrigger key={value} value={value} />
            ))}
          </TabsList>
          {Object.entries(tabContentMap).map(([value, content]) => (
            <TabsContent key={value} value={value} className="mt-0 focus-visible:outline-none">
              <div className="rounded-xl border bg-card p-6 shadow-sm min-h-[400px]">
                {content}
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </main>
    </div>
  );
}
