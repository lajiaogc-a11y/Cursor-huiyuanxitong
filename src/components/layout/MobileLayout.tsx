import { ReactNode, useState, useEffect, Suspense } from "react";
import { useLocation, useNavigate, useSearchParams, Link } from "react-router-dom";
import { MobileNavbar } from "./MobileNavbar";
import { MobileMenu } from "./MobileMenu";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { PageTransition } from "@/components/PageTransition";
import { RouteProgressBar } from "@/components/RouteProgressBar";
import { BookOpen, ChevronLeft } from "lucide-react";
import { GCLogo } from "@/components/GCLogo";
import { getUnreadMemoCount } from "@/stores/systemSettings";
import { useUnreadCount } from "@/hooks/useKnowledge";
import { usePendingAuditCount } from "@/hooks/usePendingAuditCount";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

function MobileContentSkeleton() {
  return (
    <div className="p-3 space-y-2.5 animate-in fade-in duration-200 min-h-[min(50vh,420px)]">
      <div className="flex gap-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="flex-1 rounded-lg border bg-card p-3.5 space-y-2">
            <Skeleton className="h-3 w-12" />
            <Skeleton className="h-5 w-16" />
          </div>
        ))}
      </div>

      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="rounded-lg border bg-card p-3.5 space-y-2.5 border-l-[3px] border-l-transparent"
          style={{ opacity: 1 - i * 0.12 }}
        >
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-5 w-14 rounded-full" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex justify-between">
              <Skeleton className="h-3 w-10" />
              <Skeleton className="h-3 w-14" />
            </div>
            <div className="flex justify-between">
              <Skeleton className="h-3 w-10" />
              <Skeleton className="h-3 w-14" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

interface MobileLayoutProps {
  children: ReactNode;
}

const pageTitles: Record<string, { zh: string; en: string }> = {
  "/staff": { zh: "数据统计", en: "Statistics" },
  "/staff/exchange-rate": { zh: "汇率计算", en: "Exchange Rate" },
  "/staff/orders": { zh: "订单管理", en: "Orders" },
  "/staff/reports": { zh: "报表管理", en: "Reports" },
  "/staff/members": { zh: "会员管理", en: "Members" },
  "/staff/member-management": { zh: "会员列表", en: "Member List" },
  "/staff/member-activity": { zh: "会员活动", en: "Activity" },
  "/staff/employees": { zh: "员工管理", en: "Employees" },
  "/staff/merchant-settlement": { zh: "商家结算", en: "Settlement" },
  "/staff/merchants": { zh: "商家管理", en: "Merchants" },
  "/staff/knowledge": { zh: "公司文档", en: "Company Docs" },
  "/staff/admin/tenants": { zh: "租户管理", en: "Tenant Management" },
  "/staff/admin/tenant-view": { zh: "租户数据查看", en: "View Tenant Data" },
  "/staff/admin/settings": { zh: "平台设置", en: "Platform Settings" },
  "/staff/settings": { zh: "系统设置", en: "Settings" },
  "/staff/audit-center": { zh: "审核中心", en: "Audit" },
  "/staff/pending": { zh: "待审批", en: "Pending" },
  "/staff/operation-logs": { zh: "操作日志", en: "Logs" },
  "/staff/login-logs": { zh: "登录日志", en: "Login Logs" },
  "/staff/tasks/dashboard": { zh: "任务看板", en: "Task Dashboard" },
  "/staff/tasks/settings": { zh: "维护设置", en: "Maintenance" },
  "/staff/tasks/history": { zh: "维护历史", en: "History" },
  "/staff/tasks/posters": { zh: "发动态", en: "Posters" },
  "/staff/tasks/phone-extract": { zh: "提取设置", en: "Extract" },
  "/staff/member-portal": { zh: "会员系统", en: "Member Portal" },
  "/staff/customer-query": { zh: "客户查询", en: "Customer Query" },
  "/staff/activity-reports": { zh: "活动报表", en: "Activity Reports" },
};

const tabPageTitles: Record<string, Record<string, { zh: string; en: string }>> = {
  "/staff/members": {
    members: { zh: "会员数据", en: "Member Data" },
    activity: { zh: "活动数据", en: "Activity Data" },
    gifts: { zh: "活动赠送", en: "Activity Gifts" },
    points: { zh: "积分明细", en: "Points Ledger" },
  },
  "/staff/merchants": {
    cards: { zh: "卡片管理", en: "Cards" },
    vendors: { zh: "卡商管理", en: "Vendors" },
    "payment-providers": { zh: "代付商家", en: "Payment Providers" },
  },
  "/staff/settings": {
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
    overview: { zh: "设置总览", en: "Overview" },
    "staff-invite": { zh: "员工邀请码", en: "Staff invitation codes" },
    "member-levels": { zh: "会员等级", en: "Member levels" },
    "staff-devices": { zh: "后台登录设备", en: "Staff login devices" },
    "staff-login-ip": { zh: "登录IP限制", en: "Login IP allowlist" },
  },
};

const primaryPaths = new Set([
  "/staff",
  "/staff/exchange-rate",
  "/staff/orders",
  "/staff/members",
]);

export function MobileLayout({ children }: MobileLayoutProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [memoUnreadCount, setMemoUnreadCount] = useState(0);
  const { dataSynced } = useAuth();
  const { t } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();
  const { unreadCount: knowledgeUnreadCount } = useUnreadCount();
  const { pendingCount: pendingAuditCount } = usePendingAuditCount();
  useEffect(() => {
    void import("@/pages/Dashboard");
    void import("@/pages/ExchangeRate");
    void import("@/pages/OrderManagement");
    void import("@/pages/ActivityReports");
    void import("@/pages/KnowledgeBase");
    void import("@/pages/MerchantSettlement");
  }, []);

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
    "/staff/members": "members",
    "/staff/merchants": "cards",
    "/staff/settings": "fee",
  };
  const effectiveTab = tab || defaultTab[location.pathname] || "";
  const tabTitles = tabPageTitles[location.pathname];
  const pageTitle = (tabTitles && effectiveTab && tabTitles[effectiveTab])
    ? tabTitles[effectiveTab]
    : (pageTitles[location.pathname] || { zh: "GC会员系统", en: "GC Member System" });
  const isPrimary = primaryPaths.has(location.pathname);

  return (
    <div className="flex flex-col h-dvh elite-staff-shell elite-staff-surface">
      <a href="#mobile-main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:p-3 focus:bg-primary focus:text-primary-foreground focus:top-0 focus:left-0">
        Skip to main content
      </a>
      <RouteProgressBar />

      {/*
        顶栏固定三列栅格：左 36px / 中间标题 / 右 36px。
        主导航：Logo + 右侧文档入口；其它页：返回 + 右侧等宽占位，标题始终居中，避免横向闪跳。
      */}
      <header
        className="h-11 grid grid-cols-[36px_minmax(0,1fr)_36px] items-center gap-1 px-2 bg-card/95 backdrop-blur-md border-b border-border/50 safe-area-pt shrink-0"
        role="banner"
      >
        <div className="flex w-9 justify-center shrink-0">
          {isPrimary ? (
            <span className="flex h-9 w-9 items-center justify-center shrink-0" aria-hidden>
              <GCLogo size={28} className="rounded-lg shadow-md shadow-blue-500/20" />
            </span>
          ) : (
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground active:bg-muted/60 touch-manipulation"
              aria-label={t("返回", "Go back")}
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          )}
        </div>
        <h1 className="font-semibold text-[15px] text-foreground text-center truncate min-w-0 px-0.5">
          {t(pageTitle.zh, pageTitle.en)}
        </h1>
        <div className="flex w-9 justify-center shrink-0">
          {isPrimary ? (
            <Link
              to="/staff/knowledge"
              className={cn(
                "relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-muted/40 hover:bg-muted touch-manipulation",
                location.pathname.startsWith("/staff/knowledge") && "ring-1 ring-primary/40 bg-primary/10",
              )}
              aria-label={
                knowledgeUnreadCount > 0
                  ? t("公司文档未读", "Unread company docs")
                  : t("公司文档", "Company Docs")
              }
            >
              <BookOpen className="h-4 w-4 text-primary" />
              {knowledgeUnreadCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-0.5 flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold leading-none">
                  {knowledgeUnreadCount > 99 ? "99+" : knowledgeUnreadCount}
                </span>
              )}
            </Link>
          ) : (
            <span className="inline-block h-9 w-9 shrink-0" aria-hidden />
          )}
        </div>
      </header>

      <main
        id="mobile-main-content"
        role="main"
        aria-label={t("主内容区域", "Main content area")}
        className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-y-contain native-scroll-y"
      >
        <ErrorBoundary>
          <div className="px-2 pt-2 pb-[calc(4rem+env(safe-area-inset-bottom,0px))] sm:px-3">
            <Suspense fallback={<MobileContentSkeleton />}>
              <PageTransition>{children}</PageTransition>
            </Suspense>
          </div>
        </ErrorBoundary>
      </main>

      <nav className="fixed bottom-0 left-0 right-0 z-[1000]" role="navigation" aria-label={t("主导航", "Main navigation")}>
        <MobileNavbar
          onMenuOpen={() => setMenuOpen(true)}
          memoUnreadCount={memoUnreadCount}
          knowledgeUnreadCount={knowledgeUnreadCount}
          pendingAuditCount={pendingAuditCount}
        />
      </nav>

      <MobileMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
    </div>
  );
}
