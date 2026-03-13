import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useMemberAuth } from "@/contexts/MemberAuthContext";
import { useAuth } from "@/contexts/AuthContext";

export function MemberProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, loading } = useMemberAuth();
  const { isAuthenticated: isEmployeeAuthenticated } = useAuth();
  const location = useLocation();

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
  if (isEmployeeAuthenticated) {
    return <Navigate to="/staff" replace />;
  }
  return <>{children}</>;
}
