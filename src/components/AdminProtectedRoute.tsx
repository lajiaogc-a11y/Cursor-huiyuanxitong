/**
 * 平台管理后台 - 路由保护
 * 仅平台总管理员可访问，使用独立的 AdminLayout
 */
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { LayoutSkeleton } from "@/components/skeletons/LayoutSkeleton";
import { AdminLayout } from "@/components/layout/AdminLayout";

interface AdminProtectedRouteProps {
  children: React.ReactNode;
}

export function AdminProtectedRoute({ children }: AdminProtectedRouteProps) {
  const { isAuthenticated, loading, employee } = useAuth();
  const location = useLocation();

  if (loading) {
    return <LayoutSkeleton />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!employee) {
    return <LayoutSkeleton />;
  }

  if (employee.status === "pending") {
    return <Navigate to="/pending" replace />;
  }

  if (employee.status !== "active") {
    return <Navigate to="/login" replace />;
  }

  if (!employee.is_platform_super_admin) {
    return <Navigate to="/" replace />;
  }

  return <AdminLayout>{children}</AdminLayout>;
}
