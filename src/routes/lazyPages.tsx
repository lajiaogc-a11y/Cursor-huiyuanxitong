/**
 * 全站页面懒加载入口（配合 lazyWithRetry 降低 ChunkLoadError）。
 */
import { lazyWithRetry } from "@/lib/lazyWithRetry";

export const Login = lazyWithRetry(() => import("@/pages/Login"));
export const Signup = lazyWithRetry(() => import("@/pages/Signup"));
export const Dashboard = lazyWithRetry(() => import("@/pages/Dashboard"));
export const MemberManagement = lazyWithRetry(() => import("@/pages/MemberManagement"));
export const OrderManagement = lazyWithRetry(() => import("@/pages/OrderManagement"));
export const EmployeeManagement = lazyWithRetry(() => import("@/pages/EmployeeManagement"));
export const ExchangeRate = lazyWithRetry(() => import("@/pages/ExchangeRate"));
export const PublicRates = lazyWithRetry(() => import("@/pages/PublicRates"));
export const SystemSettings = lazyWithRetry(() => import("@/pages/SystemSettings"));
export const DataManagementPage = lazyWithRetry(() => import("@/pages/DataManagementPage"));
export const CustomerQuery = lazyWithRetry(() => import("@/pages/CustomerQuery"));
export const MerchantManagement = lazyWithRetry(() => import("@/pages/MerchantManagement"));
export const MerchantSettlement = lazyWithRetry(() => import("@/pages/MerchantSettlement"));
export const ActivityReports = lazyWithRetry(() => import("@/pages/ActivityReports"));
export const ReportManagement = lazyWithRetry(() => import("@/pages/ReportManagement"));
export const OperationLogs = lazyWithRetry(() => import("@/pages/OperationLogs"));
export const LoginLogs = lazyWithRetry(() => import("@/pages/LoginLogs"));
export const AuditCenter = lazyWithRetry(() => import("@/pages/AuditCenter"));
export const PendingAuthorization = lazyWithRetry(() => import("@/pages/PendingAuthorization"));
export const KnowledgeBase = lazyWithRetry(() => import("@/pages/KnowledgeBase"));
export const CompanyManagement = lazyWithRetry(() => import("@/pages/CompanyManagement"));
export const PlatformTenantView = lazyWithRetry(() => import("@/pages/PlatformTenantView"));
export const PlatformSettingsPage = lazyWithRetry(() => import("@/pages/PlatformSettingsPage"));
export const TasksSettings = lazyWithRetry(() => import("@/pages/TasksSettings"));
export const TasksHistory = lazyWithRetry(() => import("@/pages/TasksHistory"));
export const TasksPosters = lazyWithRetry(() => import("@/pages/TasksPosters"));
export const TasksPhoneExtract = lazyWithRetry(() => import("@/pages/TasksPhoneExtract"));
export const MemberPortalSettingsPage = lazyWithRetry(() => import("@/pages/MemberPortalSettings"));
export const WhatsAppWorkbench = lazyWithRetry(() => import("@/pages/whatsapp/WhatsAppWorkbench"));
export const NotFound = lazyWithRetry(() => import("@/pages/NotFound"));
export const MemberLogin = lazyWithRetry(() => import("@/pages/member/MemberLogin"));
export const InviteLanding = lazyWithRetry(() => import("@/pages/member/InviteLanding"));
export const MemberRegisterRedirect = lazyWithRetry(() => import("@/pages/member/MemberRegisterRedirect"));
export const MemberDashboard = lazyWithRetry(() => import("@/pages/member/MemberDashboard"));
export const MemberSpin = lazyWithRetry(() => import("@/pages/member/MemberSpin"));
export const MemberPoints = lazyWithRetry(() => import("@/pages/member/MemberPoints"));
export const MemberInvite = lazyWithRetry(() => import("@/pages/member/MemberInvite"));
export const MemberSettings = lazyWithRetry(() => import("@/pages/member/MemberSettings"));
export const MemberFirstPassword = lazyWithRetry(() => import("@/pages/member/MemberFirstPassword"));
export const MemberWallet = lazyWithRetry(() => import("@/pages/member/MemberWallet"));
export const MemberOrders = lazyWithRetry(() => import("@/pages/member/MemberOrders"));
export const MemberTradeContact = lazyWithRetry(() => import("@/pages/member/MemberTradeContact"));
export const MemberNotifications = lazyWithRetry(() => import("@/pages/member/MemberNotifications"));
export const MemberOnboarding = lazyWithRetry(() => import("@/pages/member/MemberOnboarding"));
