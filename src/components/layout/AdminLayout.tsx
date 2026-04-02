/**
 * 平台管理后台 - 独立布局
 * 与租户端 MainLayout 完全分离，不共享侧边栏
 */
import { ReactNode } from "react";
import { AdminSidebar } from "./AdminSidebar";
import { AdminHeader } from "./AdminHeader";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { PageTransition } from "@/components/PageTransition";
import { useLanguage } from "@/contexts/LanguageContext";

interface AdminLayoutProps {
  children: ReactNode;
}

export function AdminLayout({ children }: AdminLayoutProps) {
  const { t } = useLanguage();

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      <a
        href="#admin-main"
        className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:p-3 focus:bg-primary focus:text-primary-foreground focus:top-0 focus:left-0"
      >
        {t("跳转到主内容", "Skip to main content")}
      </a>
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <AdminSidebar />
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          <AdminHeader />
          <main
            id="admin-main"
            role="main"
            aria-label={t("平台管理主内容", "Platform admin main content")}
            className="flex-1 overflow-auto flex flex-col min-h-0 p-4 md:p-6"
          >
            <ErrorBoundary>
              <PageTransition>{children}</PageTransition>
            </ErrorBoundary>
          </main>
        </div>
      </div>
    </div>
  );
}
