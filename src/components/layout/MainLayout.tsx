import { ReactNode, Suspense, useEffect } from "react";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { useAuth } from "@/contexts/AuthContext";
import { useLayout } from "@/contexts/LayoutContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useIsLgUp } from "@/hooks/use-mobile";
import { useTenantView } from "@/contexts/TenantViewContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { SubmissionErrorDialog } from "@/components/ui/submission-error-dialog";
import { KeyboardShortcutsHelp } from "@/components/KeyboardShortcutsHelp";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useGlobalHotkeys } from "@/hooks/useGlobalHotkeys";
import { useSessionExpiration } from "@/hooks/useSessionExpiration";
import { useGlobalErrorReporter } from "@/hooks/useGlobalErrorReporter";
import { PageTransition } from "@/components/PageTransition";
import { RouteProgressBar } from "@/components/RouteProgressBar";
import { BackgroundUpdateIndicator } from "@/components/BackgroundUpdateIndicator";
import { TenantViewBanner, TenantViewFloatingIndicator } from "@/components/TenantViewBanner";
import { MallRedemptionStaffNotifier } from "@/components/staff/MallRedemptionStaffNotifier";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

function ContentSkeleton() {
  /** 立即占位，避免 Suspense 首帧空白导致主区域高度塌陷与「闪跳」（原 600ms 延迟会放大该问题） */
  return (
    <div className="p-4 space-y-4 animate-pulse min-h-[min(60vh,520px)]">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg border bg-card p-4 space-y-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-6 w-16" />
          </div>
        ))}
      </div>
      <div className="rounded-lg border bg-card p-4 space-y-3">
        <Skeleton className="h-9 w-64" />
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" style={{ opacity: 1 - i * 0.12 }} />
          ))}
        </div>
      </div>
    </div>
  );
}

interface MainLayoutProps {
  children: ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  const { employee } = useAuth();
  useTenantView();
  /** 与 Tailwind `lg`（1024px）一致：<lg 使用抽屉侧栏 + 全宽主区，避免手机端底部 Tab 挤压内容宽度 */
  const isLgUp = useIsLgUp();

  // Prefetch common route chunks after idle so navigations don't trigger Suspense fallbacks
  useEffect(() => {
    void import("@/pages/Dashboard");
    void import("@/pages/ExchangeRate");
    void import("@/pages/OrderManagement");
    void import("@/pages/ActivityReports");
    void import("@/pages/MemberManagement");
    void import("@/pages/MerchantSettlement");
    void import("@/pages/ReportManagement");
    void import("@/pages/SystemSettings");
    void import("@/pages/EmployeeManagement");
    void import("@/pages/KnowledgeBase");
  }, []);

  const { isViewingTenant } = useTenantView() || {};
  const { layoutMode } = useLayout();
  const { t } = useLanguage();
  
  // 全局快捷键、会话过期监听（不在此做全路由 invalidate，避免侧栏切页时整站 Query 重拉）
  useKeyboardShortcuts();
  useGlobalHotkeys();
  useSessionExpiration();
  useGlobalErrorReporter(employee?.id ?? null);
  
  // 手机 / 小平板：<1024px 与桌面同一信息架构（顶栏 + 抽屉侧栏），主内容区占满屏宽，不再使用底部 Tab 窄栏
  if (!isLgUp) {
    return (
      <div className="flex flex-col h-dvh overflow-hidden">
        <TenantViewBanner />
        <RouteProgressBar />
        <BackgroundUpdateIndicator />
        <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:p-3 focus:bg-primary focus:text-primary-foreground focus:top-0 focus:left-0">
          {t("跳转到主内容", "Skip to main content")}
        </a>
        <Header />
        <Sidebar />
        <SubmissionErrorDialog />
        <KeyboardShortcutsHelp />
        <main
          id="main-content"
          role="main"
          aria-label={t("主内容区域", "Main content area")}
          className={cn(
            "flex-1 overflow-auto flex flex-col min-h-0 relative elite-staff-shell elite-staff-surface w-full min-w-0",
            "p-3 sm:p-5 md:p-6",
            layoutMode === "centered" && "bg-muted/20 dark:bg-muted/40 transition-colors duration-200",
          )}
        >
          <div
            className={cn(
              "flex-1 min-h-0 w-full min-w-0 relative",
              layoutMode === "centered" && "max-w-screen-xl mx-auto px-4",
            )}
          >
            <ErrorBoundary>
              <Suspense fallback={<ContentSkeleton />}>
                <PageTransition>{children}</PageTransition>
              </Suspense>
            </ErrorBoundary>
          </div>
        </main>
        <TenantViewFloatingIndicator />
        <MallRedemptionStaffNotifier />
      </div>
    );
  }
  
  // Desktop layout
  return (
    <div className="flex flex-col h-dvh overflow-hidden">
      <TenantViewBanner />
      <div className="flex flex-1 min-h-0 overflow-hidden flex">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:p-3 focus:bg-primary focus:text-primary-foreground focus:top-0 focus:left-0">
        {t("跳转到主内容", "Skip to main content")}
      </a>
      <RouteProgressBar />
      <BackgroundUpdateIndicator />
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <Header />
        <SubmissionErrorDialog />
        <KeyboardShortcutsHelp />
        {/* 主内容区不用 transition-all；居中模式仅过渡背景色，避免与 max-w 等布局变化牵连动画 */}
        <main id="main-content" role="main" aria-label={t("主内容区域", "Main content area")} className={cn(
          "flex-1 overflow-auto flex flex-col min-h-0 p-5 md:p-6 relative elite-staff-shell elite-staff-surface",
          layoutMode === 'centered' && "bg-muted/20 dark:bg-muted/40 transition-colors duration-200"
        )}>
          <div className={cn(
            "flex-1 min-h-0 w-full min-w-0 relative",
            layoutMode === 'centered' && "max-w-screen-xl mx-auto px-4"
          )}>
            <ErrorBoundary>
              <Suspense fallback={<ContentSkeleton />}>
                <PageTransition>{children}</PageTransition>
              </Suspense>
            </ErrorBoundary>
          </div>
        </main>
      </div>
      </div>
      <TenantViewFloatingIndicator />
      <MallRedemptionStaffNotifier />
    </div>
  );
}
