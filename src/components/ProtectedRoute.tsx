// ============= Protected Route Component =============
// 路由保护组件 - 检查认证状态和权限
// 权限数据由 AuthContext 统一加载，无需额外超时逻辑

import { useState, useEffect } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { AlertCircle, RefreshCw, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LayoutSkeleton } from '@/components/skeletons/LayoutSkeleton';
import { Loader2 } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAdmin?: boolean;
  requireManager?: boolean;
  /** 仅平台总管理员可访问（如公司管理），租户直接 404 */
  requirePlatformSuperAdmin?: boolean;
}

// 员工信息加载超时时间（毫秒）
const EMPLOYEE_LOAD_TIMEOUT = 15000;

export function ProtectedRoute({ children, requireAdmin, requireManager, requirePlatformSuperAdmin }: ProtectedRouteProps) {
  const { isAuthenticated, isAdmin, isManager, loading, employee, permissionsLoaded, refreshEmployee, signOut } = useAuth();
  const { t } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();
  const [employeeLoadTimeout, setEmployeeLoadTimeout] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);

  // 员工信息加载超时检测
  useEffect(() => {
    if (!loading && isAuthenticated && !employee) {
      const timer = setTimeout(() => {
        setEmployeeLoadTimeout(true);
      }, EMPLOYEE_LOAD_TIMEOUT);
      
      return () => clearTimeout(timer);
    } else {
      setEmployeeLoadTimeout(false);
    }
  }, [loading, isAuthenticated, employee]);

  // 重试加载员工信息（不刷新页面）
  const handleRetry = async () => {
    setIsRetrying(true);
    setEmployeeLoadTimeout(false);
    try {
      await refreshEmployee();
    } finally {
      setIsRetrying(false);
    }
  };

  // 退出登录
  const handleLogout = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  // 初始加载状态 - 显示完整的布局骨架屏，而不是白屏
  if (loading) {
    return <LayoutSkeleton />;
  }

  // 用户未登录
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // 用户已登录但员工信息加载超时
  if (!employee && employeeLoadTimeout) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4 text-center max-w-md mx-4">
          <AlertCircle className="h-12 w-12 text-destructive" />
          <h1 className="text-xl font-bold text-foreground">{t('加载失败', 'Loading Failed')}</h1>
          <p className="text-muted-foreground">
            {t(
              '无法加载您的用户信息。这可能是因为您的账号尚未关联员工信息，或网络连接问题。',
              'Unable to load your user information. This could be because your account is not linked to an employee profile, or a network issue.'
            )}
          </p>
          <div className="flex gap-3">
            <Button onClick={handleRetry} variant="default" disabled={isRetrying}>
              {isRetrying ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              {isRetrying ? t('重试中...', 'Retrying...') : t('重试', 'Retry')}
            </Button>
            <Button onClick={handleLogout} variant="outline">
              <LogOut className="h-4 w-4 mr-2" />
              {t('重新登录', 'Login Again')}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // 用户已登录但员工信息还在加载中 - 显示布局骨架屏
  if (!employee) {
    return <LayoutSkeleton />;
  }

  // 检查用户状态是否为 pending（等待审批）
  if (employee.status === 'pending') {
    return <Navigate to="/pending" replace />;
  }

  // 检查用户状态是否为非活跃
  if (employee.status !== 'active') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4 text-center max-w-md mx-4">
          <AlertCircle className="h-12 w-12 text-destructive" />
          <h1 className="text-xl font-bold text-foreground">{t('账号已禁用', 'Account Disabled')}</h1>
          <p className="text-muted-foreground">
            {t('您的账号已被禁用，请联系管理员。', 'Your account has been disabled. Please contact an administrator.')}
          </p>
          <Button onClick={handleLogout} variant="outline">
            <LogOut className="h-4 w-4 mr-2" />
            {t('返回登录', 'Back to Login')}
          </Button>
        </div>
      </div>
    );
  }

  // 平台总管理员专属页面：非平台总管理员重定向到首页，避免出现 404
  if (requirePlatformSuperAdmin && !employee?.is_platform_super_admin) {
    return <Navigate to="/" replace />;
  }

  // 权限检查
  if (requireAdmin && !isAdmin) {
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

  if (requireManager && !isManager) {
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
