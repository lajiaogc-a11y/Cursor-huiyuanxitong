import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useMemberAuth } from "@/contexts/MemberAuthContext";
import { useAuth } from "@/contexts/AuthContext";
import { useMaintenanceMode } from "@/hooks/useMaintenanceMode";
import { MaintenanceBlockedView } from "@/components/MaintenanceBlockedView";

export function MemberProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, loading, signOut } = useMemberAuth();
  const { isAuthenticated: isEmployeeAuthenticated } = useAuth();
  const location = useLocation();
  const { loading: maintenanceLoading, status: maintenanceStatus } = useMaintenanceMode(null);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-amber-50">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-amber-600" />
      </div>
    );
  }
  if (!isAuthenticated) {
    return <Navigate to="/" state={{ from: location }} replace />;
  }
  if (maintenanceLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-amber-50">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-amber-600" />
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
  if (isEmployeeAuthenticated) {
    return <Navigate to="/staff" replace />;
  }
  return <>{children}</>;
}
