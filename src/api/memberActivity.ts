/**
 * Member Activity API Client — 会员门户活动 RPC 请求层
 */
import { apiPost } from './client';

export const memberActivityApi = {
  checkInToday: (memberId: string) =>
    apiPost<unknown>('/api/data/rpc/member_check_in_today', { p_member_id: memberId }),

  checkIn: (memberId: string) =>
    apiPost<unknown>('/api/data/rpc/member_check_in', { p_member_id: memberId }),

  requestShareNonce: (memberId: string) =>
    apiPost<{ success: boolean; nonce?: string; error?: string }>('/api/data/rpc/member_request_share_nonce', { p_member_id: memberId }),

  claimShareReward: (memberId: string, shareNonce: string) =>
    apiPost<unknown>('/api/data/rpc/member_grant_spin_for_share', { p_member_id: memberId, p_share_nonce: shareNonce }),

  getInviteToken: (memberId: string) =>
    apiPost<{ success?: boolean; invite_token?: string }>('/api/data/rpc/member_get_invite_token', { p_member_id: memberId }),

  getOrders: (memberId: string, limit: number, offset: number) =>
    apiPost<unknown>('/api/data/rpc/member_get_orders', { p_member_id: memberId, p_limit: limit, p_offset: offset }),

  updateNickname: (memberId: string, nickname: string) =>
    apiPost<unknown>('/api/data/rpc/member_update_nickname', { p_member_id: memberId, p_nickname: nickname }),

  updateAvatar: (memberId: string, avatarUrl: string | null) =>
    apiPost<unknown>('/api/data/rpc/member_update_avatar', { p_member_id: memberId, p_avatar_url: avatarUrl }),

  applyDeltas: (params: Record<string, unknown>) =>
    apiPost<{ success?: boolean }>('/api/data/rpc/member_activity_apply_deltas', params),
};
