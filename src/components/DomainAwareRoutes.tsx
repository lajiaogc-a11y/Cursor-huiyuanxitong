/**
 * 域名感知路由 - 主域名展示会员端，员工后台子域名展示管理端
 */
import { Suspense, useEffect } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { getAdminBaseUrl, isAdminDomain } from "@/config/domains";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { TopProgressBar } from "@/components/TopProgressBar";
import { lazyWithRetry } from "@/lib/lazyWithRetry";

const Dashboard = lazyWithRetry(() => import("@/pages/Dashboard"));

/** 根路径 /：主域名 → 会员登录，员工域名 → 员工仪表盘 */
export function RootRoute() {
  if (isAdminDomain()) {
    return (
      <ProtectedRoute>
        <Suspense fallback={<TopProgressBar />}>
          <Dashboard />
        </Suspense>
      </ProtectedRoute>
    );
  }
  return <Navigate to="/member/login" replace />;
}

/** 员工后台路由包装：主域名访问时跳转到员工子域名 */
export function EmployeeRouteRedirect({ children }: { children: React.ReactNode }) {
  const location = useLocation();

  useEffect(() => {
    if (!isAdminDomain()) {
      const target = `${getAdminBaseUrl()}${location.pathname}${location.search}`;
      window.location.replace(target);
    }
  }, [location.pathname, location.search]);

  if (isAdminDomain()) {
    return <>{children}</>;
  }
  return null;
}
