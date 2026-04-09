import type { ReactNode } from "react";
import { Suspense } from "react";
import { Navigate } from "react-router-dom";
import { ROUTES } from "@/routes/constants";
import { MemberLoginSuspenseFallback } from "@/components/member/MemberLoginSuspenseFallback";
import {
  ActivityReports,
  AuditCenter,
  CustomerQuery,
  Dashboard,
  DataManagementPage,
  EmployeeManagement,
  ExchangeRate,
  InviteLanding,
  MemberRegisterRedirect,
  KnowledgeBase,
  Login,
  LoginLogs,
  MemberFirstPassword,
  MemberLogin,
  MemberManagement,
  MemberPortalSettingsPage,
  MemberWallet,
  MemberOrders,
  MemberTradeContact,
  MemberNotifications,
  MemberOnboarding,
  MerchantManagement,
  MerchantSettlement,
  OperationLogs,
  OrderManagement,
  PendingAuthorization,
  PublicRates,
  ReportManagement,
  Signup,
  SystemSettings,
  TasksHistory,
  TasksPhoneExtract,
  TasksPosters,
  TasksSettings,
  WhatsAppWorkbench,
} from "@/routes/lazyPages";
import { LegacyActivityReportsRedirect } from "@/routes/RedirectRoutes";

export const memberProtectedRoutes: Array<{ path: string; element: ReactNode }> = [
  { path: ROUTES.MEMBER.FIRST_PASSWORD, element: <MemberFirstPassword /> },
  /** 底部五 Tab 由 MemberLayout 内 MemberTabbedShell 统一挂载（keep-alive）；此处 element 占位满足路由匹配 */
  { path: ROUTES.MEMBER.DASHBOARD, element: null },
  { path: ROUTES.MEMBER.SPIN, element: null },
  { path: ROUTES.MEMBER.POINTS, element: null },
  { path: ROUTES.MEMBER.INVITE, element: null },
  { path: ROUTES.MEMBER.SETTINGS, element: null },
  { path: ROUTES.MEMBER.WALLET, element: <MemberWallet /> },
  { path: ROUTES.MEMBER.ORDERS, element: <MemberOrders /> },
  { path: ROUTES.MEMBER.TRADE_CONTACT, element: <MemberTradeContact /> },
  { path: ROUTES.MEMBER.PROFILE, element: <Navigate to={ROUTES.MEMBER.SETTINGS} replace /> },
  { path: ROUTES.MEMBER.NOTIFICATIONS, element: <MemberNotifications /> },
  { path: ROUTES.MEMBER.ONBOARDING, element: <MemberOnboarding /> },
];

export const memberPublicRoutes: Array<{ path: string; element: ReactNode }> = [
  {
    path: ROUTES.MEMBER.ROOT,
    element: (
      <Suspense fallback={<MemberLoginSuspenseFallback />}>
        <MemberLogin />
      </Suspense>
    ),
  },
  { path: ROUTES.MEMBER.LOGIN_LEGACY, element: <Navigate to={ROUTES.MEMBER.ROOT} replace /> },
  { path: ROUTES.MEMBER.HOME, element: <Navigate to={ROUTES.MEMBER.DASHBOARD} replace /> },
  {
    path: ROUTES.MEMBER.INVITE_LANDING,
    element: (
      <Suspense fallback={<MemberLoginSuspenseFallback />}>
        <InviteLanding />
      </Suspense>
    ),
  },
  {
    path: ROUTES.MEMBER.REGISTER,
    element: (
      <Suspense fallback={<MemberLoginSuspenseFallback />}>
        <MemberRegisterRedirect />
      </Suspense>
    ),
  },
];

export const staffPublicRoutes: Array<{ path: string; element: ReactNode }> = [
  { path: ROUTES.STAFF.LOGIN, element: <Login /> },
  { path: ROUTES.STAFF.SIGNUP, element: <Signup /> },
];

export const commonPublicRoutes: Array<{ path: string; element: ReactNode }> = [
  { path: ROUTES.PUBLIC_RATES, element: <PublicRates /> },
];

export const staffCoreRoutes: Array<{ path: string; element: ReactNode }> = [
  { path: ROUTES.STAFF.ROOT, element: <Dashboard /> },
  { path: ROUTES.STAFF.ORDERS, element: <OrderManagement /> },
  { path: ROUTES.STAFF.MEMBERS, element: <ActivityReports /> },
  { path: ROUTES.STAFF.EMPLOYEES, element: <EmployeeManagement /> },
  { path: ROUTES.STAFF.REPORTS, element: <ReportManagement /> },
  { path: ROUTES.STAFF.SETTINGS, element: <SystemSettings /> },
];

export const staffExtendedRoutes: Array<{ path: string; element: ReactNode }> = [
  { path: ROUTES.STAFF.DATA_MANAGEMENT, element: <DataManagementPage /> },
  { path: ROUTES.STAFF.MEMBER_MANAGEMENT, element: <MemberManagement /> },
  { path: ROUTES.STAFF.EXCHANGE_RATE, element: <ExchangeRate /> },
  { path: ROUTES.STAFF.CUSTOMER_QUERY, element: <CustomerQuery /> },
  { path: ROUTES.STAFF.MERCHANTS, element: <MerchantManagement /> },
  { path: ROUTES.STAFF.MERCHANT_SETTLEMENT, element: <MerchantSettlement /> },
  { path: ROUTES.STAFF.ACTIVITY_REPORTS, element: <LegacyActivityReportsRedirect /> },
  { path: ROUTES.STAFF.MEMBER_ACTIVITY, element: <LegacyActivityReportsRedirect /> },
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
  { path: ROUTES.STAFF.MEMBER_PORTAL, element: <Navigate to={`${ROUTES.STAFF.MEMBER_PORTAL}/login`} replace /> },
  { path: ROUTES.STAFF.MEMBER_PORTAL_SECTION, element: <MemberPortalSettingsPage /> },
  {
    path: ROUTES.STAFF.MEMBER_PROMOTION,
    element: <Navigate to={`${ROUTES.STAFF.SETTINGS}?tab=member-levels`} replace />,
  },
  { path: ROUTES.STAFF.WHATSAPP, element: <WhatsAppWorkbench /> },
];
