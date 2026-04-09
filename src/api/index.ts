/**
 * API 封装层 - 统一入口
 * 所有 hooks / services 仅通过此层或具体模块文件调用后端
 */

// ── 原有模块 ──
export * from './auth';
export * from './data';
export * from './members';
export * from './memberAuth';
export * from './phonePool';

// ── 新增 API Client 模块 ──
export { ordersApi } from './orders';
export { financeApi } from './finance';
export { lotteryApi } from './lottery';
export { pointsApi } from './points';
export { tenantsApi } from './tenants';
export { reportsApi } from './reports';
export { giftcardsApi } from './giftcards';
export { adminApi } from './admin';
export { knowledgeApi } from './knowledge';
export { memberLevelsApi } from './memberLevels';
export { tasksApi } from './tasks';
export { taskPostersApi } from './taskPosters';
export { riskApi } from './risk';
export { logsApi } from './logs';
export { memberAnalyticsApi } from './memberAnalytics';
export { tenantQuotaApi } from './tenantQuota';
export { uploadApi } from './upload';
export { webhooksApi } from './webhooks';
export { adminDeviceWhitelistApi } from './adminDeviceWhitelist';

export {
  apiClient,
  setAuthToken,
  clearAuthToken,
  hasAuthToken,
  ApiError,
  setOnUnauthorized,
  setOnMemberSessionReplaced,
  setOnForbidden,
  setOnServerError,
} from '@/lib/apiClient';
