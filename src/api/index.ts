/**
 * API 封装层 - 统一入口
 * 所有 hooks 仅通过此层调用，禁止直接访问 Supabase
 */

export * from './auth';
export * from './data';
export * from './members';
export * from './memberAuth';
export * from './phonePool';

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
