import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useMemberAuth } from "@/contexts/MemberAuthContext";
import { useMaintenanceMode } from "@/hooks/useMaintenanceMode";
import { MaintenanceBlockedView } from "@/components/MaintenanceBlockedView";
import { ROUTES } from "@/routes/constants";

export function MemberProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, loading, signOut, member } = useMemberAuth();
  const location = useLocation();
  const { loading: maintenanceLoading, status: maintenanceStatus } = useMaintenanceMode(member?.tenant_id ?? null);

  const memberLoadingSpinner = (
    <div className="min-h-dvh flex items-center justify-center" style={{ background: "#0A0E1A" }}>
      <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2" style={{ borderColor: "#4d8cff" }} />
    </div>
  );

  if (loading) return memberLoadingSpinner;
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
  if (maintenanceLoading) return memberLoadingSpinner;
  if (maintenanceStatus.effectiveEnabled) {
    const message =
      maintenanceStatus.scope === "global"
        ? maintenanceStatus.globalMessage
        : maintenanceStatus.tenantMessage;
    return (
      <MaintenanceBlockedView
        scope={maintenanceStatus.scope === "global" ? "global" : "tenant"}
        message={message}
        onLogout={() => signOut()}
      />
    );
  }
  return <>{children}</>;
}
