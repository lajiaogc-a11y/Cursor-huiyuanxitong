import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { LayoutSkeleton } from "@/components/skeletons/LayoutSkeleton";
import { useMemberAuth } from "@/contexts/MemberAuthContext";

interface AdminProtectedRouteProps {
  children: React.ReactNode;
}

export function AdminProtectedRoute({ children }: AdminProtectedRouteProps) {
  const { session, loading, employee } = useAuth();
  const { isAuthenticated: isMemberAuthenticated, loading: memberLoading } = useMemberAuth();
  const location = useLocation();
  const [employeeLoadTimeout, setEmployeeLoadTimeout] = useState(false);

  useEffect(() => {
    if (!loading && !!session && !employee) {
      const timer = setTimeout(() => setEmployeeLoadTimeout(true), 12000);
      return () => clearTimeout(timer);
    }
    setEmployeeLoadTimeout(false);
  }, [loading, session, employee]);

  if (loading || memberLoading) {
    return <LayoutSkeleton />;
  }

  if (!session) {
    // 仅会员登录时禁止进入员工系统
    if (isMemberAuthenticated) {
      return <Navigate to="/member/dashboard" replace />;
    }
    return <Navigate to="/staff/login" state={{ from: location }} replace />;
  }

  if (!employee) {
    if (employeeLoadTimeout) {
      return <Navigate to="/staff/login" replace />;
    }
    return <LayoutSkeleton />;
  }

  if (employee.status === "pending") {
    return <Navigate to="/staff/pending" replace />;
  }

  if (employee.status !== "active") {
    return <Navigate to="/staff/login" replace />;
  }

  return <>{children}</>;
}
