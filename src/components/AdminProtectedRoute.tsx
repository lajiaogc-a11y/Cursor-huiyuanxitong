import { useEffect, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { LayoutSkeleton } from "@/components/skeletons/LayoutSkeleton";
import { Button } from "@/components/ui/button";
import { AlertCircle, Loader2, LogOut, RefreshCw } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useMaintenanceMode } from "@/hooks/system/useMaintenanceMode";
import { MaintenanceBlockedView } from "@/components/MaintenanceBlockedView";
import { ROUTES } from "@/routes/constants";

interface AdminProtectedRouteProps {
  children: React.ReactNode;
}

export function AdminProtectedRoute({ children }: AdminProtectedRouteProps) {
  const { session, loading, employee, refreshEmployee, signOut } = useAuth();
  const { t } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();
  const [employeeLoadTimeout, setEmployeeLoadTimeout] = useState(false);
  const [authLoadTimeout, setAuthLoadTimeout] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [autoRecovering, setAutoRecovering] = useState(false);
  const [autoRecoveredOnce, setAutoRecoveredOnce] = useState(false);
  const { loading: maintenanceLoading, status: maintenanceStatus } = useMaintenanceMode(employee?.tenant_id ?? null);

  const handleRetry = async () => {
    setIsRetrying(true);
    setEmployeeLoadTimeout(false);
    try {
      await refreshEmployee();
    } finally {
      setIsRetrying(false);
    }
  };

  const handleLogout = async () => {
    await signOut();
    navigate("/staff/login", { replace: true });
  };

  useEffect(() => {
    if (!loading && !!session && !employee) {
      const timer = setTimeout(() => setEmployeeLoadTimeout(true), 12000);
      return () => clearTimeout(timer);
    }
    setEmployeeLoadTimeout(false);
  }, [loading, session, employee]);

  useEffect(() => {
    if (loading) {
      const timer = setTimeout(() => setAuthLoadTimeout(true), 12000);
      return () => clearTimeout(timer);
    }
    setAuthLoadTimeout(false);
  }, [loading]);

  useEffect(() => {
    if (!employeeLoadTimeout || !session || employee || autoRecovering) return;
    let active = true;
    setAutoRecovering(true);
    (async () => {
      if (!autoRecoveredOnce) {
        try {
          await refreshEmployee();
          setAutoRecoveredOnce(true);
          return;
        } catch {
          // ignore
        }
      }
      if (active) {
        await signOut();
        navigate("/staff/login", { replace: true });
      }
    })().finally(() => {
      if (active) setAutoRecovering(false);
    });
    return () => {
      active = false;
    };
  }, [employeeLoadTimeout, session, employee, autoRecovering, autoRecoveredOnce, refreshEmployee, signOut, navigate]);

  if (loading && employee) {
    return <>{children}</>;
  }

  if ((loading) && !employeeLoadTimeout && !authLoadTimeout) {
    return <LayoutSkeleton />;
  }

  if (loading && authLoadTimeout) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4 text-center max-w-md mx-4">
          <AlertCircle className="h-12 w-12 text-destructive" />
          <h1 className="text-xl font-bold text-foreground">{t("登录状态加载超时", "Authentication Loading Timeout")}</h1>
          <p className="text-muted-foreground">
            {t(
              "认证状态长时间未完成，请点击重试，或重新登录。",
              "Authentication did not finish in time. Please retry or login again."
            )}
          </p>
          <div className="flex gap-3">
            <Button onClick={handleRetry} variant="default" disabled={isRetrying}>
              {isRetrying ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              {isRetrying ? t("重试中...", "Retrying...") : t("重试", "Retry")}
            </Button>
            <Button onClick={handleLogout} variant="outline">
              <LogOut className="h-4 w-4 mr-2" />
              {t("重新登录", "Login Again")}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!session && employee) {
    // 有缓存员工信息但 session 尚未从 API 恢复，乐观渲染避免闪烁到登录页
  } else if (!session) {
    return <Navigate to="/staff/login" state={{ from: location }} replace />;
  }

  if (!employee) {
    if (!employeeLoadTimeout) return <LayoutSkeleton />;
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4 text-center max-w-md mx-4">
          <Loader2 className="h-12 w-12 text-primary animate-spin" />
          <h1 className="text-xl font-bold text-foreground">{t("正在恢复登录状态", "Recovering login state")}</h1>
          <p className="text-muted-foreground">
            {t(
              "系统正在自动重试，若仍失败将自动返回登录页。",
              "System is retrying automatically and will return to login if still failing."
            )}
          </p>
        </div>
      </div>
    );
  }

  // 待审批账号：仅允许渲染 /staff/pending，否则无法匹配子路由
  if (employee.status === "pending") {
    if (location.pathname === ROUTES.STAFF.PENDING) {
      return <>{children}</>;
    }
    return <Navigate to={ROUTES.STAFF.PENDING} replace />;
  }

  if (employee.status !== "active") {
    return <Navigate to="/staff/login" replace />;
  }

  // 维护模式拦截（平台总管理员不受限制；后台异步检测，不阻塞渲染）
  if (!employee.is_platform_super_admin) {
    if (maintenanceStatus.effectiveEnabled) {
      const message =
        maintenanceStatus.scope === "global"
          ? maintenanceStatus.globalMessage
          : maintenanceStatus.tenantMessage;
      return (
        <MaintenanceBlockedView
          scope={maintenanceStatus.scope === "global" ? "global" : "tenant"}
          message={message}
          onLogout={handleLogout}
        />
      );
    }
  }

  return <>{children}</>;
}
