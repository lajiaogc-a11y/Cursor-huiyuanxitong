import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useMemberAuth } from "@/contexts/MemberAuthContext";
import { useMaintenanceMode } from "@/hooks/useMaintenanceMode";
import { MaintenanceBlockedView } from "@/components/MaintenanceBlockedView";
import { ROUTES } from "@/routes/constants";

export function MemberProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, loading, signOut, member } = useMemberAuth();
  const location = useLocation();
  const { loading: maintenanceLoading, status: maintenanceStatus } = useMaintenanceMode(null);

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center" style={{ background: "#0A0E1A" }}>
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2" style={{ borderColor: "#4d8cff" }} />
      </div>
    );
  }
  if (!isAuthenticated) {
    return <Navigate to="/" state={{ from: location }} replace />;
  }

  const mustChange = !!member?.must_change_password;
  const path = location.pathname;
  if (mustChange && path !== ROUTES.MEMBER.FIRST_PASSWORD) {
    return <Navigate to={ROUTES.MEMBER.FIRST_PASSWORD} replace />;
  }
  if (!mustChange && path === ROUTES.MEMBER.FIRST_PASSWORD) {
    return <Navigate to={ROUTES.MEMBER.DASHBOARD} replace />;
  }
  if (maintenanceLoading) {
    return (
      <div className="min-h-dvh flex items-center justify-center" style={{ background: "#0A0E1A" }}>
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2" style={{ borderColor: "#4d8cff" }} />
      </div>
    );
  }
  if (maintenanceStatus.globalEnabled) {
    return (
      <MaintenanceBlockedView
        scope="global"
        message={maintenanceStatus.globalMessage}
        onLogout={() => signOut()}
      />
    );
  }
  // 已登录会员端时不再因「同时存在员工 session」强制跳 /staff，避免登录后立刻被踢走（闪退）
  return <>{children}</>;
}
