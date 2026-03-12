import { lazy, Suspense } from "react";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Routes, Route, Navigate } from "react-router-dom";
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

// 礼品卡系统页面 - 大 chunk 页面使用 lazyWithRetry 防止 ChunkLoadError
const Login = lazy(() => import("./pages/Login"));
const Signup = lazy(() => import("./pages/Signup"));
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
const NotFound = lazy(() => import("./pages/NotFound"));
const MemberLogin = lazy(() => import("./pages/member/MemberLogin"));
const MemberDashboard = lazy(() => import("./pages/member/MemberDashboard"));
const MemberSpin = lazy(() => import("./pages/member/MemberSpin"));
const MemberPoints = lazy(() => import("./pages/member/MemberPoints"));
const MemberInvite = lazy(() => import("./pages/member/MemberInvite"));
const MemberSettings = lazy(() => import("./pages/member/MemberSettings"));
const InviteLanding = lazy(() => import("./pages/member/InviteLanding"));
const MemberLayout = lazy(() => import("./components/member/MemberLayout").then((m) => ({ default: m.MemberLayout })));

/** 懒加载时显示顶部细进度条，替代页面中心大 loading */

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
                  <Suspense fallback={<TopProgressBar />}>
                    <Routes>
                      {/* 会员端路由 */}
                      <Route path="/member/login" element={<MemberLogin />} />
                      <Route path="/member" element={<Navigate to="/member/dashboard" replace />} />
                      <Route path="/member/dashboard" element={<MemberProtectedRoute><MemberLayout><MemberDashboard /></MemberLayout></MemberProtectedRoute>} />
                      <Route path="/member/spin" element={<MemberProtectedRoute><MemberLayout><MemberSpin /></MemberLayout></MemberProtectedRoute>} />
                      <Route path="/member/points" element={<MemberProtectedRoute><MemberLayout><MemberPoints /></MemberLayout></MemberProtectedRoute>} />
                      <Route path="/member/invite" element={<MemberProtectedRoute><MemberLayout><MemberInvite /></MemberLayout></MemberProtectedRoute>} />
                      <Route path="/member/settings" element={<MemberProtectedRoute><MemberLayout><MemberSettings /></MemberLayout></MemberProtectedRoute>} />
                      <Route path="/invite/:code" element={<InviteLanding />} />
                      
                      {/* 公开路由 */}
                      <Route path="/login" element={<Login />} />
                  <Route path="/signup" element={<Signup />} />
                  <Route path="/public-rates" element={<PublicRates />} />
                  
                  {/* 受保护的路由 */}
                  <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
                  <Route path="/members" element={<ProtectedRoute><MemberManagement /></ProtectedRoute>} />
                  <Route path="/orders" element={<ProtectedRoute><OrderManagement /></ProtectedRoute>} />
                  <Route path="/employees" element={<ProtectedRoute><EmployeeManagement /></ProtectedRoute>} />
                  <Route path="/exchange-rate" element={<ProtectedRoute><ExchangeRate /></ProtectedRoute>} />
                  <Route path="/settings" element={<ProtectedRoute><SystemSettings /></ProtectedRoute>} />
                  <Route path="/customer-query" element={<ProtectedRoute><CustomerQuery /></ProtectedRoute>} />
                  <Route path="/merchants" element={<ProtectedRoute><MerchantManagement /></ProtectedRoute>} />
                  <Route path="/merchant-settlement" element={<ProtectedRoute><MerchantSettlement /></ProtectedRoute>} />
                  <Route path="/activity-reports" element={<ProtectedRoute><ActivityReports /></ProtectedRoute>} />
                  <Route path="/member-activity" element={<ProtectedRoute><MemberActivityData /></ProtectedRoute>} />
                  <Route path="/reports" element={<ProtectedRoute><ReportManagement /></ProtectedRoute>} />
                  <Route path="/operation-logs" element={<ProtectedRoute><OperationLogs /></ProtectedRoute>} />
                  <Route path="/login-logs" element={<ProtectedRoute><LoginLogs /></ProtectedRoute>} />
                  <Route path="/audit-center" element={<ProtectedRoute><AuditCenter /></ProtectedRoute>} />
                  <Route path="/pending-authorization" element={<ProtectedRoute><PendingAuthorization /></ProtectedRoute>} />
                  <Route path="/knowledge" element={<ProtectedRoute><KnowledgeBase /></ProtectedRoute>} />
                  {/* 平台管理后台 - 独立路由，使用 AdminLayout */}
                  <Route path="/admin" element={<Navigate to="/admin/tenants" replace />} />
                  <Route path="/admin/tenants" element={<AdminProtectedRoute><CompanyManagement /></AdminProtectedRoute>} />
                  <Route path="/admin/tenant-view" element={<AdminProtectedRoute><PlatformTenantView /></AdminProtectedRoute>} />
                  <Route path="/admin/settings" element={<Navigate to="/admin/settings/ip-control" replace />} />
                  <Route path="/admin/settings/:tab" element={<AdminProtectedRoute><PlatformSettingsPage /></AdminProtectedRoute>} />
                  {/* 旧路径重定向到新后台 */}
                  <Route path="/company-management" element={<Navigate to="/admin/tenants" replace />} />
                  <Route path="/platform-tenant-view" element={<Navigate to="/admin/tenant-view" replace />} />
                  <Route path="/platform-settings" element={<Navigate to="/admin/settings" replace />} />
                  <Route path="/tasks/dashboard" element={<ProtectedRoute><Navigate to="/exchange-rate" replace /></ProtectedRoute>} />
                  <Route path="/tasks/settings" element={<ProtectedRoute><TasksSettings /></ProtectedRoute>} />
                  <Route path="/tasks/history" element={<ProtectedRoute><TasksHistory /></ProtectedRoute>} />
                  <Route path="/tasks/posters" element={<ProtectedRoute><TasksPosters /></ProtectedRoute>} />
                  <Route path="/tasks/phone-extract" element={<ProtectedRoute><TasksPhoneExtract /></ProtectedRoute>} />
                  
                  {/* 404 */}
                  <Route path="/404" element={<NotFound />} />
                  <Route path="*" element={<Navigate to="/404" replace />} />
                    </Routes>
                  </Suspense>
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
