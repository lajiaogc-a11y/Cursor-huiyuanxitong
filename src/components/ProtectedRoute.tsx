// ============= Protected Route Component =============
// 路由保护组件 - 检查认证状态和权限
// 超时/重试/自愈逻辑由 useAuthGuard 统一提供

import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { AlertCircle, RefreshCw, LogOut, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LayoutSkeleton } from '@/components/skeletons/LayoutSkeleton';
import { MainLayout } from '@/components/layout/MainLayout';
import { useMaintenanceMode } from '@/hooks/useMaintenanceMode';
import { MaintenanceBlockedView } from '@/components/MaintenanceBlockedView';
import { ROUTES } from '@/routes/constants';
import { useAuthGuard } from '@/hooks/useAuthGuard';
import { hasAuthToken } from '@/services/auth/authApiService';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAdmin?: boolean;
  requireManager?: boolean;
  /** 仅平台总管理员可访问（如公司管理），租户直接 404 */
  requirePlatformSuperAdmin?: boolean;
}

export function ProtectedRoute({ children, requireAdmin, requireManager, requirePlatformSuperAdmin }: ProtectedRouteProps) {
  const { session, isAdmin, isManager, loading, employee } = useAuth();
  const { t } = useLanguage();
  const location = useLocation();
  const { employeeLoadTimeout, authLoadTimeout, isRetrying, handleRetry, handleLogout } = useAuthGuard();
  const { loading: maintenanceLoading, status: maintenanceStatus } = useMaintenanceMode(employee?.tenant_id ?? null);

  // 认证 loading 超时兜底
  if (authLoadTimeout && loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4 max-w-md mx-auto p-6">
          <AlertCircle className="h-12 w-12 text-amber-500 mx-auto" />
          <h2 className="text-lg font-semibold">{t("认证加载超时", "Authentication loading timeout")}</h2>
          <p className="text-sm text-muted-foreground">{t("认证状态加载时间过长，请尝试刷新页面或重新登录。", "Authentication is taking too long. Please refresh or re-login.")}</p>
          <div className="flex gap-3 justify-center">
            <Button variant="outline" onClick={() => window.location.reload()}>
              <RefreshCw className="h-4 w-4 mr-2" />{t("刷新页面", "Refresh")}
            </Button>
            <Button variant="destructive" onClick={handleLogout}>
              <LogOut className="h-4 w-4 mr-2" />{t("重新登录", "Re-login")}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // 正常 loading
  if (loading) return <LayoutSkeleton />;

  // JWT 仍在本地但 session 尚未从 /me 写入（与 AdminProtectedRoute 一致，避免超时兜底误跳登录）
  if (!session && employee && hasAuthToken()) {
    return <LayoutSkeleton />;
  }

  // 未登录
  if (!session) {
    return <Navigate to={ROUTES.STAFF.LOGIN} state={{ from: location }} replace />;
  }

  // 有 session 但 employee 还没加载
  if (!employee) {
    if (employeeLoadTimeout) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="text-center space-y-4 max-w-md mx-auto p-6">
            <AlertCircle className="h-12 w-12 text-amber-500 mx-auto" />
            <h2 className="text-lg font-semibold">{t("员工信息加载超时", "Employee info loading timeout")}</h2>
            <p className="text-sm text-muted-foreground">{t("无法获取员工信息，请重试或联系管理员。", "Unable to load employee info. Please retry or contact admin.")}</p>
            <div className="flex gap-3 justify-center">
              <Button variant="outline" onClick={handleRetry} disabled={isRetrying}>
                {isRetrying ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                {t("重试", "Retry")}
              </Button>
              <Button variant="destructive" onClick={handleLogout}>
                <LogOut className="h-4 w-4 mr-2" />{t("重新登录", "Re-login")}
              </Button>
            </div>
          </div>
        </div>
      );
    }
    return <LayoutSkeleton />;
  }

  // 维护模式
  if (maintenanceLoading) return <LayoutSkeleton />;
  if (maintenanceStatus && !employee.is_platform_super_admin) {
    if (maintenanceStatus.effectiveEnabled) {
      const message =
        maintenanceStatus.scope === 'global'
          ? maintenanceStatus.globalMessage
          : maintenanceStatus.tenantMessage;
      return (
        <MaintenanceBlockedView
          scope={maintenanceStatus.scope === 'global' ? 'global' : 'tenant'}
          message={message}
          onLogout={handleLogout}
        />
      );
    }
  }

  // 平台超管权限
  if (requirePlatformSuperAdmin && !employee.is_platform_super_admin) {
    return <Navigate to={ROUTES.NOT_FOUND} replace />;
  }

  // 管理员权限
  if (requireAdmin && !isAdmin && !employee.is_platform_super_admin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-destructive">{t('权限不足', 'Access Denied')}</h1>
          <p className="text-muted-foreground mt-2">
            {t('需要管理员权限才能访问此页面', 'Admin privileges are required to access this page')}
          </p>
        </div>
      </div>
    );
  }

  // 主管权限
  if (requireManager && !isManager && !isAdmin && !employee.is_platform_super_admin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-destructive">{t('权限不足', 'Access Denied')}</h1>
          <p className="text-muted-foreground mt-2">
            {t('需要主管或管理员权限才能访问此页面', 'Manager or Admin privileges are required to access this page')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <MainLayout>
      {children}
    </MainLayout>
  );
}
