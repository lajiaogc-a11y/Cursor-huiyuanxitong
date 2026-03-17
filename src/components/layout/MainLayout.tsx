import { ReactNode, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { MobileLayout } from "./MobileLayout";
import { useAuth } from "@/contexts/AuthContext";
import { useLayout } from "@/contexts/LayoutContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useIsMobile, useIsTablet } from "@/hooks/use-mobile";
import { useTenantView } from "@/contexts/TenantViewContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { SubmissionErrorDialog } from "@/components/ui/submission-error-dialog";
import { KeyboardShortcutsHelp } from "@/components/KeyboardShortcutsHelp";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useSessionExpiration } from "@/hooks/useSessionExpiration";
import { useGlobalErrorReporter } from "@/hooks/useGlobalErrorReporter";
import { PageTransition } from "@/components/PageTransition";
import { RouteProgressBar } from "@/components/RouteProgressBar";
import { BackgroundUpdateIndicator } from "@/components/BackgroundUpdateIndicator";
import { TenantViewBanner } from "@/components/TenantViewBanner";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface MainLayoutProps {
  children: ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  const { dataSynced, employee } = useAuth();
  useTenantView();
  const location = useLocation();
  const navigate = useNavigate();

  // 平台总管理员：任何非 /staff/admin/* 路径都强制回平台后台（已进入租户查看时允许访问 /staff/*）
  const { isViewingTenant } = useTenantView() || {};
  const adminPaths = ["/staff/admin", "/staff/admin/tenants", "/staff/admin/tenant-view", "/staff/admin/settings"];
  useEffect(() => {
    if (
      employee?.is_platform_super_admin &&
      !adminPaths.some((p) => location.pathname.startsWith(p)) &&
      !isViewingTenant
    ) {
      navigate("/staff/admin/tenants", { replace: true });
    }
  }, [employee?.is_platform_super_admin, location.pathname, navigate, isViewingTenant]);
  const { layoutMode, forceDesktopLayout } = useLayout();
  const { t } = useLanguage();
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  
  // 全局快捷键和会话过期监听
  useKeyboardShortcuts();
  useSessionExpiration();
  useGlobalErrorReporter(employee?.id ?? null);
  
  // Use mobile layout for mobile devices（除非强制电脑端）
  if (isMobile && !forceDesktopLayout) {
    return (
      <>
        <TenantViewBanner />
        <MobileLayout>{children}</MobileLayout>
      </>
    );
  }

  // Tablet layout: no permanent sidebar, overlay sidebar triggered from header（除非强制电脑端）
  if (isTablet && !forceDesktopLayout) {
    return (
      <div className="flex flex-col h-screen overflow-hidden">
        <TenantViewBanner />
        <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:p-3 focus:bg-primary focus:text-primary-foreground focus:top-0 focus:left-0">
          {t("跳转到主内容", "Skip to main content")}
        </a>
        <Header />
        <Sidebar />
        <SubmissionErrorDialog />
        <main id="main-content" role="main" aria-label={t("主内容区域", "Main content area")} className="flex-1 overflow-auto flex flex-col min-h-0 p-4 relative">
          <div className="flex-1 min-h-0 relative">
            <ErrorBoundary>
              <PageTransition>{children}</PageTransition>
            </ErrorBoundary>
          </div>
        </main>
      </div>
    );
  }
  
  // Desktop layout
  return (
    <div className="flex flex-col h-screen overflow-hidden">
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
        <main id="main-content" role="main" aria-label={t("主内容区域", "Main content area")} className={cn(
          "flex-1 overflow-auto flex flex-col min-h-0 transition-all duration-300 p-4 relative",
          layoutMode === 'centered' && "bg-muted/20 dark:bg-muted/40"
        )}>
          <div className={cn(
            "flex-1 min-h-0 relative",
            layoutMode === 'centered' && "max-w-[1400px] w-full mx-auto"
          )}>
            <ErrorBoundary>
              <PageTransition>{children}</PageTransition>
            </ErrorBoundary>
          </div>
        </main>
      </div>
      </div>
    </div>
  );
}
