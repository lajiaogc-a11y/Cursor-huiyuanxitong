import type { ReactNode } from "react";
import { Navigate, Outlet, useLocation, useParams } from "react-router-dom";
import { AdminProtectedRoute } from "@/components/AdminProtectedRoute";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { MemberProtectedRoute } from "@/components/MemberProtectedRoute";
import { MemberLayout } from "@/components/member/MemberLayout";
import { ROUTES } from "@/routes/constants";

/** 旧「活动报表」路径统一跳到当前会员活动列表页 */
export function LegacyActivityReportsRedirect() {
  const location = useLocation();
  return <Navigate to={`${ROUTES.STAFF.MEMBERS}${location.search}`} replace />;
}

export function LegacyRedirect({ to }: { to: string }) {
  const location = useLocation();
  return <Navigate to={`${to}${location.search}${location.hash}`} replace />;
}

export function LegacyAdminSettingsTabRedirect() {
  const { tab } = useParams<{ tab: string }>();
  const location = useLocation();
  if (tab === 'invitation-codes') {
    return <Navigate to={`/staff/settings?tab=staff-invite${location.search}${location.hash}`} replace />;
  }
  const target = tab ? `${ROUTES.STAFF.ADMIN_SETTINGS}/${tab}` : ROUTES.STAFF.ADMIN_SETTINGS_DEFAULT;
  return <Navigate to={`${target}${location.search}${location.hash}`} replace />;
}

export function StaffLayoutRoute() {
  return (
    <AdminProtectedRoute>
      <ProtectedRoute>
        <Outlet />
      </ProtectedRoute>
    </AdminProtectedRoute>
  );
}

export function StaffPlatformLayoutRoute() {
  return (
    <AdminProtectedRoute>
      <ProtectedRoute requirePlatformSuperAdmin>
        <Outlet />
      </ProtectedRoute>
    </AdminProtectedRoute>
  );
}

/** @deprecated Use MemberLayoutRoute for persistent layout */
export function MemberRoute({ children }: { children: ReactNode }) {
  return (
    <MemberProtectedRoute>
      <MemberLayout>{children}</MemberLayout>
    </MemberProtectedRoute>
  );
}

/** Persistent member layout route — layout stays mounted across child route changes */
export function MemberLayoutRoute() {
  return (
    <MemberProtectedRoute>
      <MemberLayout>
        <Outlet />
      </MemberLayout>
    </MemberProtectedRoute>
  );
}
