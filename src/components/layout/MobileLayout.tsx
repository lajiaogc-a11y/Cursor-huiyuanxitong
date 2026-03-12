import { ReactNode, useState, useEffect } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { MobileNavbar } from "./MobileNavbar";
import { MobileMenu } from "./MobileMenu";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { PageTransition } from "@/components/PageTransition";
import { RouteProgressBar } from "@/components/RouteProgressBar";
import { Loader2, ChevronLeft } from "lucide-react";
import { GCLogo } from "@/components/GCLogo";
import { getUnreadMemoCount } from "@/stores/systemSettings";
import { useUnreadCount } from "@/hooks/useKnowledge";

interface MobileLayoutProps {
  children: ReactNode;
}

// Page title mapping
const pageTitles: Record<string, { zh: string; en: string }> = {
  "/": { zh: "数据统计", en: "Statistics" },
  "/exchange-rate": { zh: "汇率计算", en: "Exchange Rate" },
  "/orders": { zh: "订单管理", en: "Orders" },
  "/reports": { zh: "报表管理", en: "Reports" },
  "/activity-reports": { zh: "会员管理", en: "Members" },
  "/members": { zh: "会员列表", en: "Member List" },
  "/member-activity": { zh: "会员活动", en: "Activity" },
  "/employees": { zh: "员工管理", en: "Employees" },
  "/merchant-settlement": { zh: "商家结算", en: "Settlement" },
  "/merchants": { zh: "商家管理", en: "Merchants" },
  "/knowledge": { zh: "公司文档", en: "Company Docs" },
  "/company-management": { zh: "租户管理", en: "Tenant Management" },
  "/platform-tenant-view": { zh: "租户数据查看", en: "View Tenant Data" },
  "/platform-settings": { zh: "平台设置", en: "Platform Settings" },
  "/settings": { zh: "系统设置", en: "Settings" },
  "/audit-center": { zh: "审核中心", en: "Audit" },
  "/operation-logs": { zh: "操作日志", en: "Logs" },
  "/login-logs": { zh: "登录日志", en: "Login Logs" },
  "/tasks/dashboard": { zh: "任务看板", en: "Task Dashboard" },
  "/tasks/settings": { zh: "维护设置", en: "Maintenance Settings" },
  "/tasks/history": { zh: "维护历史", en: "Maintenance History" },
  "/tasks/posters": { zh: "发动态", en: "Posters" },
  "/tasks/phone-extract": { zh: "提取设置", en: "Extract Settings" },
  "/customer-query": { zh: "客户查询", en: "Customer Query" },
  "/pending-authorization": { zh: "待审批", en: "Pending" },
};

// 带 tab 的页面：根据 tab 显示子页面标题
const tabPageTitles: Record<string, Record<string, { zh: string; en: string }>> = {
  "/activity-reports": {
    members: { zh: "会员数据", en: "Member Data" },
    activity: { zh: "活动数据", en: "Activity Data" },
    gifts: { zh: "活动赠送", en: "Activity Gifts" },
    points: { zh: "积分明细", en: "Points Ledger" },
  },
  "/merchants": {
    cards: { zh: "卡片管理", en: "Cards" },
    vendors: { zh: "卡商管理", en: "Vendors" },
    "payment-providers": { zh: "代付商家", en: "Payment Providers" },
  },
  "/settings": {
    fee: { zh: "手续费设置", en: "Fee" },
    exchange: { zh: "汇率设置", en: "Exchange" },
    currency: { zh: "币种设置", en: "Currency" },
    points: { zh: "积分设置", en: "Points" },
    activity: { zh: "活动设置", en: "Activity" },
    activityType: { zh: "活动类型", en: "Activity Type" },
    giftDistribution: { zh: "活动分配", en: "Gift Distribution" },
    source: { zh: "客户来源", en: "Customer Source" },
    data: { zh: "数据管理", en: "Data" },
    copy: { zh: "复制设置", en: "Copy" },
    permission: { zh: "权限设置", en: "Permissions" },
    api: { zh: "API管理", en: "API" },
  },
};

// Primary pages (shown in bottom navbar) - no back button needed
const primaryPaths = new Set(["/", "/exchange-rate", "/orders", "/activity-reports", "/merchant-settlement"]);

export function MobileLayout({ children }: MobileLayoutProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [memoUnreadCount, setMemoUnreadCount] = useState(0);
  const { dataSynced } = useAuth();
  const { t } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();
  const { unreadCount: knowledgeUnreadCount } = useUnreadCount();

  useEffect(() => {
    setMemoUnreadCount(getUnreadMemoCount());
    const interval = setInterval(() => {
      setMemoUnreadCount(getUnreadMemoCount());
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  const [searchParams] = useSearchParams();
  const tab = searchParams.get("tab") || "";
  const defaultTab: Record<string, string> = {
    "/activity-reports": "members",
    "/merchants": "cards",
    "/settings": "fee",
  };
  const effectiveTab = tab || defaultTab[location.pathname] || "";
  const tabTitles = tabPageTitles[location.pathname];
  const pageTitle = (tabTitles && effectiveTab && tabTitles[effectiveTab])
    ? tabTitles[effectiveTab]
    : (pageTitles[location.pathname] || { zh: "GC会员系统", en: "GC Member System" });
  const showBackButton = !primaryPaths.has(location.pathname);

  return (
    <div className="flex flex-col h-dvh bg-background">
      <a href="#mobile-main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:p-3 focus:bg-primary focus:text-primary-foreground focus:top-0 focus:left-0">
        Skip to main content
      </a>
      <RouteProgressBar />
      <header className="h-12 flex items-center px-3 bg-card border-b border-border safe-area-pt shrink-0" role="banner">
        {showBackButton ? (
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors -ml-1 p-1 rounded-md active:bg-muted/50 shrink-0"
            aria-label={t("返回", "Go back")}
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        ) : (
          <GCLogo size={28} className="shrink-0" />
        )}
        <h1 className="font-semibold text-base text-foreground flex-1 text-center truncate">
          {t(pageTitle.zh, pageTitle.en)}
        </h1>
        {/* Spacer to balance the left icon for true centering */}
        <div className={showBackButton ? "w-7 shrink-0" : "w-7 shrink-0"} />
      </header>

      {/* Main Content */}
      <main id="mobile-main-content" role="main" aria-label={t("主内容区域", "Main content area")} className="flex-1 overflow-auto relative">
        <ErrorBoundary>
          <div className="p-3 pb-24 relative">
            <PageTransition>{children}</PageTransition>
          </div>
        </ErrorBoundary>
      </main>

      {/* Bottom Navigation - fixed positioning for iOS stability */}
      <nav className="fixed bottom-0 left-0 right-0 z-50" role="navigation" aria-label={t("主导航", "Main navigation")}>
        <MobileNavbar onMenuOpen={() => setMenuOpen(true)} memoUnreadCount={memoUnreadCount} knowledgeUnreadCount={knowledgeUnreadCount} />
      </nav>

      {/* Slide-out Menu */}
      <MobileMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
    </div>
  );
}
