/**
 * Member Admin API Client — 员工端会员管理 + 诊断 RPC 请求层
 */
import { apiPost } from './client';

export const memberAdminApi = {
  setInitialPassword: (memberId: string, newPassword: string) =>
    apiPost<unknown>('/api/data/rpc/admin_set_member_initial_password', {
      p_member_id: memberId,
      p_new_password: newPassword,
    }),
  getReferrals: (memberId: string) =>
    apiPost<unknown>('/api/data/rpc/admin_get_member_referrals', { p_member_id: memberId }),

  listSpins: (params: Record<string, unknown>) =>
    apiPost<unknown>('/api/data/rpc/admin_list_spins', params),
  listMemberOperationLogs: (params: Record<string, unknown>) =>
    apiPost<unknown>('/api/data/rpc/admin_list_member_operation_logs', params),
  listMemberLoginLogs: (params: Record<string, unknown>) =>
    apiPost<unknown>('/api/data/rpc/admin_list_member_login_logs', params),
};
