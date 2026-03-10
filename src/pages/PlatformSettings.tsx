/**
 * 平台设置 - 仅平台超级管理员可见
 * 针对全网站的设置与系统监控，作用于整个平台，不影响单个租户
 */
import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  Shield,
  Activity,
  Gauge,
  ShieldAlert,
  Archive,
  HardDrive,
  Wrench,
  Ticket,
  ChevronRight,
} from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useIsMobile, useIsTablet } from "@/hooks/use-mobile";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { lazy, Suspense } from "react";

const SystemHealthMonitor = lazy(() => import("@/components/SystemHealthMonitor"));
const IpAccessControlTab = lazy(() => import("@/components/IpAccessControlTab"));
const DataArchiveTab = lazy(() => import("@/components/DataArchiveTab").then(m => ({ default: m.DataArchiveTab })));
const RiskDashboardTab = lazy(() => import("@/components/RiskDashboardTab").then(m => ({ default: m.RiskDashboardTab })));
const ResourceMonitorTab = lazy(() => import("@/components/ResourceMonitorTab").then(m => ({ default: m.ResourceMonitorTab })));
import DataRepairTab from "@/components/DataRepairTab";
import DataBackupTab from "@/components/DataBackupTab";
import InvitationCodeManagement from "@/components/InvitationCodeManagement";

const platformSections = [
  {
    titleZh: "平台安全",
    titleEn: "Platform Security",
    items: [
      { value: "ip-control", icon: Shield, labelZh: "IP访问控制", labelEn: "IP Access Control" },
    ],
  },
  {
    titleZh: "系统监控",
    titleEn: "System Monitoring",
    items: [
      { value: "system-health", icon: Activity, labelZh: "系统健康", labelEn: "System Health" },
      { value: "resource-monitor", icon: Gauge, labelZh: "资源监控", labelEn: "Resource Monitor" },
      { value: "risk-dashboard", icon: ShieldAlert, labelZh: "风险评分", labelEn: "Risk Scoring" },
    ],
  },
  {
    titleZh: "平台数据",
    titleEn: "Platform Data",
    items: [
      { value: "data-archive", icon: Archive, labelZh: "数据归档", labelEn: "Data Archive" },
      { value: "data-backup", icon: HardDrive, labelZh: "数据备份", labelEn: "Data Backup" },
      { value: "data-repair", icon: Wrench, labelZh: "数据修复", labelEn: "Data Repair" },
    ],
  },
  {
    titleZh: "租户管理",
    titleEn: "Tenant",
    items: [
      { value: "invitation-codes", icon: Ticket, labelZh: "邀请码", labelEn: "Invitation Codes" },
    ],
  },
];

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

export default function PlatformSettings() {
  const { t } = useLanguage();
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  const useCompactLayout = isMobile || isTablet;
  const [activeTab, setActiveTab] = useState("ip-control");
  const [mobileDialogOpen, setMobileDialogOpen] = useState(false);
  const [mobileDialogTab, setMobileDialogTab] = useState("");

  const allTabItems = platformSections.flatMap(s => s.items);
  const getDialogLabel = (value: string) => {
    const item = allTabItems.find(i => i.value === value);
    return item ? t(item.labelZh, item.labelEn) : "";
  };

  if (useCompactLayout) {
    return (
      <div className="space-y-2">
        <div className="rounded-lg border border-blue-200 bg-blue-50/50 dark:bg-blue-950/20 dark:border-blue-800 px-4 py-3 text-sm text-blue-800 dark:text-blue-200">
          {t("平台设置作用于整个网站，与租户无关。租户相关配置请在「系统设置」中操作。", "Platform settings apply to the entire site. For tenant-specific settings, use System Settings.")}
        </div>
        <div className="rounded-xl border bg-card overflow-hidden shadow-sm">
          {platformSections.map((section, sIdx) => (
            <div key={section.titleZh}>
              {sIdx > 0 && <div className="h-px bg-border" />}
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3 bg-muted/30">
                {t(section.titleZh, section.titleEn)}
              </div>
              <div>
                {section.items.map(({ value, icon: Icon, labelZh, labelEn }, idx) => (
                  <button
                    key={value}
                    onClick={() => {
                      setMobileDialogTab(value);
                      setMobileDialogOpen(true);
                    }}
                    className={cn(
                      "flex items-center gap-3 w-full px-4 py-3.5 text-left transition-colors active:bg-muted/50 hover:bg-muted/30",
                      idx < section.items.length - 1 && "border-b border-border/40"
                    )}
                  >
                    <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-primary/10 shrink-0">
                      <Icon className="h-4 w-4 text-primary" />
                    </div>
                    <span className="text-[15px] font-medium text-foreground flex-1">{t(labelZh, labelEn)}</span>
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

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-blue-200 bg-blue-50/50 dark:bg-blue-950/20 dark:border-blue-800 px-4 py-3 text-sm text-blue-800 dark:text-blue-200">
        {t("平台设置作用于整个网站，与租户无关。租户相关配置请在「系统设置」中操作。", "Platform settings apply to the entire site. For tenant-specific settings, use System Settings.")}
      </div>
    <div className="flex gap-6 -m-4 p-4 min-h-0">
      <aside className="w-56 shrink-0 flex flex-col">
        <div className="rounded-xl border bg-card overflow-hidden shadow-sm sticky top-4">
          <ScrollArea className="h-[calc(100vh-8rem)]">
            <nav className="p-2">
              {platformSections.map((section) => (
                <div key={section.titleZh} className="mb-4 last:mb-0">
                  <div className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {t(section.titleZh, section.titleEn)}
                  </div>
                  <div className="space-y-0.5">
                    {section.items.map(({ value, icon: Icon, labelZh, labelEn }) => (
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
                        <span className="truncate">{t(labelZh, labelEn)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </nav>
          </ScrollArea>
        </div>
      </aside>
      <main className="flex-1 min-w-0">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full">
          <TabsList className="sr-only">
            {allTabItems.map(({ value }) => (
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
    </div>
  );
}
