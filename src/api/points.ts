/**
 * Points API Client — 纯 HTTP 请求层
 */
import { apiGet, apiPost } from './client';
import type { MemberPoints, MemberPointsBreakdown, MemberSpinQuota, PointOrder, CreatePointOrderPayload } from '@/types/points';

function postRpc(name: string, params: Record<string, unknown>) {
  return apiPost<unknown>(`/api/data/rpc/${name}`, params);
}

export const pointsApi = {
  getMemberPoints: (memberId: string) =>
    apiGet<MemberPoints>(`/api/points/member/${encodeURIComponent(memberId)}`),
  getMemberBreakdown: (memberId: string) =>
    apiGet<MemberPointsBreakdown>(`/api/points/member/${encodeURIComponent(memberId)}/breakdown`),
  getMemberSpinQuota: (memberId: string) =>
    apiGet<MemberSpinQuota>(`/api/points/member/${encodeURIComponent(memberId)}/spin-quota`),
  getMemberFrozen: (memberId: string) =>
    apiGet<{ frozen_points: number }>(`/api/points/member/${encodeURIComponent(memberId)}/frozen`),
  getMemberBalance: (memberCode: string, lastResetTime?: string) => {
    const q = lastResetTime ? `?last_reset_time=${encodeURIComponent(lastResetTime)}` : '';
    return apiGet<{ balance: number }>(`/api/points/member/${encodeURIComponent(memberCode)}/balance${q}`);
  },
  hasOrderEarned: (orderId: string) =>
    apiGet<{ hasEarned: boolean }>(`/api/points/order/${encodeURIComponent(orderId)}/has-earned`),
  getOrderEntries: (orderId: string) =>
    apiGet<unknown[]>(`/api/points/order/${encodeURIComponent(orderId)}/entries`),
  getMemberEntries: (memberCode: string) =>
    apiGet<unknown[]>(`/api/points/member/${encodeURIComponent(memberCode)}/breakdown`),
  postLedger: (data: Record<string, unknown>) =>
    apiPost<{ success: boolean }>('/api/points/ledger', data),
  addConsumption: (data: Record<string, unknown>) =>
    apiPost<{ success: boolean }>('/api/points/member-activity/add-consumption', data),
  addReferral: (data: Record<string, unknown>) =>
    apiPost<{ success: boolean }>('/api/points/member-activity/add-referral', data),
  reverseOnOrderCancel: (data: Record<string, unknown>) =>
    apiPost<{ success: boolean }>('/api/points/reverse-on-order-cancel', data),
  restoreOnOrderRestore: (data: Record<string, unknown>) =>
    apiPost<unknown>('/api/points/restore-on-order-restore', data),
  adjustOnOrderEdit: (data: Record<string, unknown>) =>
    apiPost<{ delta: number; success: boolean }>('/api/points/adjust-on-order-edit', data),

  orders: {
    create: (data: CreatePointOrderPayload | Record<string, unknown>) =>
      apiPost<PointOrder>('/api/points/orders', data),
    list: (params?: Record<string, string>) => {
      const q = params ? `?${new URLSearchParams(params).toString()}` : '';
      return apiGet<PointOrder[]>(`/api/points/orders${q}`);
    },
    getById: (id: string) =>
      apiGet<PointOrder>(`/api/points/orders/${encodeURIComponent(id)}`),
    approve: (id: string) =>
      apiPost<{ success: boolean }>(`/api/points/orders/${encodeURIComponent(id)}/approve`, {}),
    reject: (id: string, reason?: string) =>
      apiPost<{ success: boolean }>(`/api/points/orders/${encodeURIComponent(id)}/reject`, { reason }),
  },

  memberPortal: {
    getPoints(memberId: string) {
      return postRpc('member_get_points', { p_member_id: memberId });
    },
    getBreakdown(memberId: string) {
      return postRpc('member_get_points_breakdown', { p_member_id: memberId });
    },
    listLedger(memberId: string, category: string, limit: number, offset: number) {
      return postRpc('member_list_points_ledger', { p_member_id: memberId, p_category: category, p_limit: limit, p_offset: offset });
    },
    todayEarned(memberId: string) {
      return postRpc('member_sum_today_earned', { p_member_id: memberId }) as Promise<{ success?: boolean; earned?: number }>;
    },
    getSpinQuota(memberId: string) {
      return postRpc('member_get_spin_quota', { p_member_id: memberId });
    },
    createOrder(params: Record<string, unknown>) {
      return postRpc('member_create_point_order', params);
    },
    listOrders(memberId: string, limit: number) {
      return postRpc('member_list_point_orders', { p_member_id: memberId, p_limit: limit });
    },
  },

  redeemPointsAndRecord(params: Record<string, unknown>) {
    return postRpc('redeem_points_and_record', params);
  },
  redeemAllPoints(memberCode: string, phone: string) {
    return postRpc('redeem_all_points', { p_member_code: memberCode, p_phone: phone });
  },
};
