import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useMemberAuth } from "@/contexts/MemberAuthContext";
import { useMaintenanceMode } from "@/hooks/system/useMaintenanceMode";
import { MaintenanceBlockedView } from "@/components/MaintenanceBlockedView";
import { ROUTES } from "@/routes/constants";

/** 会员壳外短时校验：不依赖 html.member-html 变量，避免首屏闪白 */
function MemberAuthRouteLoader() {
  return (
    <div
      className="fixed inset-0 z-[100001] flex items-center justify-center motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200"
      style={{
        background: "linear-gradient(165deg, #0a0e1a 0%, #0d1219 50%, #0a0e1a 100%)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
      }}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <Loader2 className="h-9 w-9 shrink-0 animate-spin text-[#5b9dff] motion-reduce:animate-none" aria-hidden />
    </div>
  );
}

export function MemberProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, loading, signOut, member } = useMemberAuth();
  const location = useLocation();
  const { loading: maintenanceLoading, status: maintenanceStatus } = useMaintenanceMode(member?.tenant_id ?? null);

  const memberLoadingSpinner = <MemberAuthRouteLoader />;

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
