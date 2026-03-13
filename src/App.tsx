import { lazy, Suspense, type ReactNode } from "react";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Routes, Route, Navigate, useLocation, useParams } from "react-router-dom";
import { AppRouter } from "@/components/AppRouter";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { MemberAuthProvider } from "@/contexts/MemberAuthContext";
import { MemberProtectedRoute } from "@/components/MemberProtectedRoute";
import { TenantViewProvider } from "@/contexts/TenantViewContext";
import { SharedDataTenantProvider } from "@/contexts/SharedDataTenantContext";
import { RealtimeProvider } from "@/contexts/RealtimeContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { LayoutProvider } from "@/contexts/LayoutContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AdminProtectedRoute } from "@/components/AdminProtectedRoute";
import { lazyWithRetry } from "@/lib/lazyWithRetry";
import { UpdatePrompt } from "@/components/UpdatePrompt";
import { TopProgressBar } from "@/components/TopProgressBar";
import { LocalizedErrorBoundary } from "@/components/ErrorBoundary";

// 礼品卡系统页面 - 大 chunk 页面使用 lazyWithRetry 防止 ChunkLoadError
const Login = lazyWithRetry(() => import("./pages/Login"));
const Signup = lazyWithRetry(() => import("./pages/Signup"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const MemberManagement = lazy(() => import("./pages/MemberManagement"));
const OrderManagement = lazy(() => import("./pages/OrderManagement"));
const EmployeeManagement = lazy(() => import("./pages/EmployeeManagement"));
const ExchangeRate = lazyWithRetry(() => import("./pages/ExchangeRate"));
const PublicRates = lazy(() => import("./pages/PublicRates"));
const SystemSettings = lazy(() => import("./pages/SystemSettings"));
const CustomerQuery = lazy(() => import("./pages/CustomerQuery"));
const MerchantManagement = lazy(() => import("./pages/MerchantManagement"));
const MerchantSettlement = lazy(() => import("./pages/MerchantSettlement"));
const ActivityReports = lazy(() => import("./pages/ActivityReports"));
const MemberActivityData = lazy(() => import("./pages/MemberActivityData"));
const ReportManagement = lazyWithRetry(() => import("./pages/ReportManagement"));
const OperationLogs = lazy(() => import("./pages/OperationLogs"));
const LoginLogs = lazy(() => import("./pages/LoginLogs"));
const AuditCenter = lazy(() => import("./pages/AuditCenter"));
const PendingAuthorization = lazy(() => import("./pages/PendingAuthorization"));
const KnowledgeBase = lazy(() => import("./pages/KnowledgeBase"));
const CompanyManagement = lazy(() => import("./pages/CompanyManagement"));
const PlatformTenantView = lazy(() => import("./pages/PlatformTenantView"));
const PlatformSettingsPage = lazy(() => import("./pages/PlatformSettingsPage"));
const TasksSettings = lazy(() => import("./pages/TasksSettings"));
const TasksHistory = lazy(() => import("./pages/TasksHistory"));
const TasksPosters = lazy(() => import("./pages/TasksPosters"));
const TasksPhoneExtract = lazy(() => import("./pages/TasksPhoneExtract"));
const MemberPortalSettingsPage = lazy(() => import("./pages/MemberPortalSettings"));
const NotFound = lazyWithRetry(() => import("./pages/NotFound"));
const MemberLogin = lazyWithRetry(() => import("./pages/member/MemberLogin"));
const MemberDashboard = lazy(() => import("./pages/member/MemberDashboard"));
const MemberSpin = lazy(() => import("./pages/member/MemberSpin"));
const MemberPoints = lazy(() => import("./pages/member/MemberPoints"));
const MemberInvite = lazyWithRetry(() => import("./pages/member/MemberInvite"));
const MemberSettings = lazy(() => import("./pages/member/MemberSettings"));
const InviteLanding = lazy(() => import("./pages/member/InviteLanding"));
const MemberLayout = lazy(() => import("./components/member/MemberLayout").then((m) => ({ default: m.MemberLayout })));

const ROUTES = {
  MEMBER: {
    ROOT: "/",
    LOGIN_LEGACY: "/member/login",
    HOME: "/member",
    DASHBOARD: "/member/dashboard",
    SPIN: "/member/spin",
    POINTS: "/member/points",
    INVITE: "/member/invite",
    SETTINGS: "/member/settings",
    INVITE_LANDING: "/invite/:code",
  },
  STAFF: {
    LOGIN: "/staff/login",
    SIGNUP: "/staff/signup",
    ROOT: "/staff",
    ORDERS: "/staff/orders",
    MEMBERS: "/staff/members",
    EMPLOYEES: "/staff/employees",
    REPORTS: "/staff/reports",
    SETTINGS: "/staff/settings",
    MEMBER_MANAGEMENT: "/staff/member-management",
    EXCHANGE_RATE: "/staff/exchange-rate",
    CUSTOMER_QUERY: "/staff/customer-query",
    MERCHANTS: "/staff/merchants",
    MERCHANT_SETTLEMENT: "/staff/merchant-settlement",
    ACTIVITY_REPORTS: "/staff/activity-reports",
    MEMBER_ACTIVITY: "/staff/member-activity",
    OPERATION_LOGS: "/staff/operation-logs",
    LOGIN_LOGS: "/staff/login-logs",
    AUDIT_CENTER: "/staff/audit-center",
    PENDING: "/staff/pending",
    KNOWLEDGE: "/staff/knowledge",
    TASKS_DASHBOARD: "/staff/tasks/dashboard",
    TASKS_SETTINGS: "/staff/tasks/settings",
    TASKS_HISTORY: "/staff/tasks/history",
    TASKS_POSTERS: "/staff/tasks/posters",
    TASKS_PHONE_EXTRACT: "/staff/tasks/phone-extract",
    MEMBER_PORTAL: "/staff/member-portal",
    ADMIN_ROOT: "/staff/admin",
    ADMIN_TENANTS: "/staff/admin/tenants",
    ADMIN_TENANT_VIEW: "/staff/admin/tenant-view",
    ADMIN_SETTINGS: "/staff/admin/settings",
    ADMIN_SETTINGS_TAB: "/staff/admin/settings/:tab",
    ADMIN_SETTINGS_DEFAULT: "/staff/admin/settings/ip-control",
  },
  PUBLIC_RATES: "/public-rates",
  NOT_FOUND: "/404",
} as const;

/** 懒加载时显示顶部细进度条，替代页面中心大 loading */
function LegacyActivityReportsRedirect() {
  const location = useLocation();
  return <Navigate to={`${ROUTES.STAFF.MEMBERS}${location.search}`} replace />;
}

function LegacyRedirect({ to }: { to: string }) {
  const location = useLocation();
  return <Navigate to={`${to}${location.search}${location.hash}`} replace />;
}

function LegacyAdminSettingsTabRedirect() {
  const { tab } = useParams<{ tab: string }>();
  const location = useLocation();
  const target = tab ? `${ROUTES.STAFF.ADMIN_SETTINGS}/${tab}` : ROUTES.STAFF.ADMIN_SETTINGS_DEFAULT;
  return <Navigate to={`${target}${location.search}${location.hash}`} replace />;
}

function StaffRoute({ children }: { children: ReactNode }) {
  return (
    <AdminProtectedRoute>
      <ProtectedRoute>{children}</ProtectedRoute>
    </AdminProtectedRoute>
  );
}

function StaffPlatformRoute({ children }: { children: ReactNode }) {
  return (
    <AdminProtectedRoute>
      <ProtectedRoute requirePlatformSuperAdmin>{children}</ProtectedRoute>
    </AdminProtectedRoute>
  );
}

function MemberRoute({ children }: { children: ReactNode }) {
  return (
    <MemberProtectedRoute>
      <MemberLayout>{children}</MemberLayout>
    </MemberProtectedRoute>
  );
}

const memberProtectedRoutes: Array<{ path: string; element: ReactNode }> = [
  { path: ROUTES.MEMBER.DASHBOARD, element: <MemberDashboard /> },
  { path: ROUTES.MEMBER.SPIN, element: <MemberSpin /> },
  { path: ROUTES.MEMBER.POINTS, element: <MemberPoints /> },
  { path: ROUTES.MEMBER.INVITE, element: <MemberInvite /> },
  { path: ROUTES.MEMBER.SETTINGS, element: <MemberSettings /> },
];

const memberPublicRoutes: Array<{ path: string; element: ReactNode }> = [
  { path: ROUTES.MEMBER.ROOT, element: <MemberLogin /> },
  { path: ROUTES.MEMBER.LOGIN_LEGACY, element: <Navigate to={ROUTES.MEMBER.ROOT} replace /> },
  { path: ROUTES.MEMBER.HOME, element: <Navigate to={ROUTES.MEMBER.DASHBOARD} replace /> },
  { path: ROUTES.MEMBER.INVITE_LANDING, element: <InviteLanding /> },
];

const staffPublicRoutes: Array<{ path: string; element: ReactNode }> = [
  { path: ROUTES.STAFF.LOGIN, element: <Login /> },
  { path: ROUTES.STAFF.SIGNUP, element: <Signup /> },
];

const commonPublicRoutes: Array<{ path: string; element: ReactNode }> = [
  { path: ROUTES.PUBLIC_RATES, element: <PublicRates /> },
];

const staffCoreRoutes: Array<{ path: string; element: ReactNode }> = [
  { path: ROUTES.STAFF.ROOT, element: <Dashboard /> },
  { path: ROUTES.STAFF.ORDERS, element: <OrderManagement /> },
  { path: ROUTES.STAFF.MEMBERS, element: <ActivityReports /> },
  { path: ROUTES.STAFF.EMPLOYEES, element: <EmployeeManagement /> },
  { path: ROUTES.STAFF.REPORTS, element: <ReportManagement /> },
  { path: ROUTES.STAFF.SETTINGS, element: <SystemSettings /> },
];

const staffExtendedRoutes: Array<{ path: string; element: ReactNode }> = [
  { path: ROUTES.STAFF.MEMBER_MANAGEMENT, element: <MemberManagement /> },
  { path: ROUTES.STAFF.EXCHANGE_RATE, element: <ExchangeRate /> },
  { path: ROUTES.STAFF.CUSTOMER_QUERY, element: <CustomerQuery /> },
  { path: ROUTES.STAFF.MERCHANTS, element: <MerchantManagement /> },
  { path: ROUTES.STAFF.MERCHANT_SETTLEMENT, element: <MerchantSettlement /> },
  { path: ROUTES.STAFF.ACTIVITY_REPORTS, element: <LegacyActivityReportsRedirect /> },
  { path: ROUTES.STAFF.MEMBER_ACTIVITY, element: <MemberActivityData /> },
  { path: ROUTES.STAFF.OPERATION_LOGS, element: <OperationLogs /> },
  { path: ROUTES.STAFF.LOGIN_LOGS, element: <LoginLogs /> },
  { path: ROUTES.STAFF.AUDIT_CENTER, element: <AuditCenter /> },
  { path: ROUTES.STAFF.PENDING, element: <PendingAuthorization /> },
  { path: ROUTES.STAFF.KNOWLEDGE, element: <KnowledgeBase /> },
  { path: ROUTES.STAFF.TASKS_DASHBOARD, element: <Navigate to={ROUTES.STAFF.EXCHANGE_RATE} replace /> },
  { path: ROUTES.STAFF.TASKS_SETTINGS, element: <TasksSettings /> },
  { path: ROUTES.STAFF.TASKS_HISTORY, element: <TasksHistory /> },
  { path: ROUTES.STAFF.TASKS_POSTERS, element: <TasksPosters /> },
  { path: ROUTES.STAFF.TASKS_PHONE_EXTRACT, element: <TasksPhoneExtract /> },
  { path: ROUTES.STAFF.MEMBER_PORTAL, element: <MemberPortalSettingsPage /> },
];

const legacyEmployeeRedirects: Array<{ from: string; to: string }> = [
  { from: "/login", to: ROUTES.STAFF.LOGIN },
  { from: "/signup", to: ROUTES.STAFF.SIGNUP },
  { from: "/orders", to: ROUTES.STAFF.ORDERS },
  { from: "/members", to: ROUTES.STAFF.MEMBERS },
  { from: "/employees", to: ROUTES.STAFF.EMPLOYEES },
  { from: "/reports", to: ROUTES.STAFF.REPORTS },
  { from: "/settings", to: ROUTES.STAFF.SETTINGS },
  { from: "/exchange-rate", to: ROUTES.STAFF.EXCHANGE_RATE },
  { from: "/customer-query", to: ROUTES.STAFF.CUSTOMER_QUERY },
  { from: "/merchants", to: ROUTES.STAFF.MERCHANTS },
  { from: "/merchant-settlement", to: ROUTES.STAFF.MERCHANT_SETTLEMENT },
  { from: "/activity-reports", to: ROUTES.STAFF.ACTIVITY_REPORTS },
  { from: "/member-activity", to: ROUTES.STAFF.MEMBER_ACTIVITY },
  { from: "/operation-logs", to: ROUTES.STAFF.OPERATION_LOGS },
  { from: "/login-logs", to: ROUTES.STAFF.LOGIN_LOGS },
  { from: "/audit-center", to: ROUTES.STAFF.AUDIT_CENTER },
  { from: "/pending-authorization", to: ROUTES.STAFF.PENDING },
  { from: "/knowledge", to: ROUTES.STAFF.KNOWLEDGE },
  { from: "/company-management", to: ROUTES.STAFF.ADMIN_TENANTS },
  { from: "/platform-tenant-view", to: ROUTES.STAFF.ADMIN_TENANT_VIEW },
  { from: "/platform-settings", to: ROUTES.STAFF.ADMIN_SETTINGS },
  { from: "/tasks/dashboard", to: ROUTES.STAFF.TASKS_DASHBOARD },
  { from: "/tasks/settings", to: ROUTES.STAFF.TASKS_SETTINGS },
  { from: "/tasks/history", to: ROUTES.STAFF.TASKS_HISTORY },
  { from: "/tasks/posters", to: ROUTES.STAFF.TASKS_POSTERS },
  { from: "/tasks/phone-extract", to: ROUTES.STAFF.TASKS_PHONE_EXTRACT },
  { from: "/admin", to: ROUTES.STAFF.ADMIN_ROOT },
  { from: "/admin/tenants", to: ROUTES.STAFF.ADMIN_TENANTS },
  { from: "/admin/tenant-view", to: ROUTES.STAFF.ADMIN_TENANT_VIEW },
  { from: "/admin/settings", to: ROUTES.STAFF.ADMIN_SETTINGS },
];

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <LanguageProvider>
        <LayoutProvider>
          <AuthProvider>
            <MemberAuthProvider>
            <Sonner />
            <UpdatePrompt />
            <RealtimeProvider>
            <AppRouter>
              <TenantViewProvider>
                <SharedDataTenantProvider>
                  <LocalizedErrorBoundary>
                    <Suspense fallback={<TopProgressBar />}>
                      <Routes>
                      {/* 会员公开路由 */}
                      {memberPublicRoutes.map((item) => (
                        <Route key={item.path} path={item.path} element={item.element} />
                      ))}

                      {/* 会员受保护路由 */}
                      {memberProtectedRoutes.map((item) => (
                        <Route key={item.path} path={item.path} element={<MemberRoute>{item.element}</MemberRoute>} />
                      ))}

                      {/* 员工公开路由 */}
                      {staffPublicRoutes.map((item) => (
                        <Route key={item.path} path={item.path} element={item.element} />
                      ))}

                      {/* 通用公开路由 */}
                      {commonPublicRoutes.map((item) => (
                        <Route key={item.path} path={item.path} element={item.element} />
                      ))}

                      {/* 员工核心/扩展路由 */}
                      {staffCoreRoutes.map((item) => (
                        <Route key={item.path} path={item.path} element={<StaffRoute>{item.element}</StaffRoute>} />
                      ))}
                      {staffExtendedRoutes.map((item) => (
                        <Route key={item.path} path={item.path} element={<StaffRoute>{item.element}</StaffRoute>} />
                      ))}

                      {/* 平台管理路由迁移到 /staff/admin */}
                      <Route path={ROUTES.STAFF.ADMIN_ROOT} element={<Navigate to={ROUTES.STAFF.ADMIN_TENANTS} replace />} />
                      <Route path={ROUTES.STAFF.ADMIN_TENANTS} element={<StaffPlatformRoute><CompanyManagement /></StaffPlatformRoute>} />
                      <Route path={ROUTES.STAFF.ADMIN_TENANT_VIEW} element={<StaffPlatformRoute><PlatformTenantView /></StaffPlatformRoute>} />
                      <Route path={ROUTES.STAFF.ADMIN_SETTINGS} element={<Navigate to={ROUTES.STAFF.ADMIN_SETTINGS_DEFAULT} replace />} />
                      <Route path={ROUTES.STAFF.ADMIN_SETTINGS_TAB} element={<StaffPlatformRoute><PlatformSettingsPage /></StaffPlatformRoute>} />

                      {/* 兼容旧员工路径 */}
                      {legacyEmployeeRedirects.map((item) => (
                        <Route
                          key={item.from}
                          path={item.from}
                          element={<LegacyRedirect to={item.to} />}
                        />
                      ))}
                      <Route path="/admin/settings/:tab" element={<LegacyAdminSettingsTabRedirect />} />
                  
                  {/* 404 */}
                  <Route path={ROUTES.NOT_FOUND} element={<NotFound />} />
                  <Route path="*" element={<Navigate to={ROUTES.NOT_FOUND} replace />} />
                      </Routes>
                    </Suspense>
                  </LocalizedErrorBoundary>
                </SharedDataTenantProvider>
              </TenantViewProvider>
            </AppRouter>
            </RealtimeProvider>
            </MemberAuthProvider>
          </AuthProvider>
        </LayoutProvider>
      </LanguageProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
