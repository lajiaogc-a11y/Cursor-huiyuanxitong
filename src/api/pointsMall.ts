/**
 * Points Mall API Client — 积分商城 RPC 请求层
 */
import { apiPost } from './client';

export const pointsMallApi = {
  listMyItems: (tenantId?: string | null) =>
    apiPost<unknown>('/api/data/rpc/list_my_member_points_mall_items', {
      ...(tenantId ? { p_tenant_id: tenantId } : {}),
    }),

  upsertMyItems: (payload: Record<string, unknown>[], tenantId?: string | null) =>
    apiPost<unknown>('/api/data/rpc/upsert_my_member_points_mall_items', {
      p_items: payload,
      ...(tenantId ? { p_tenant_id: tenantId } : {}),
    }),

  listMemberItems: (memberId: string) =>
    apiPost<unknown>('/api/data/rpc/member_list_points_mall_items', { p_member_id: memberId }),

  listMemberCategories: (memberId: string) =>
    apiPost<unknown>('/api/data/rpc/member_list_points_mall_categories', { p_member_id: memberId }),

  listMyCategories: (tenantId?: string | null) =>
    apiPost<unknown>('/api/data/rpc/list_my_member_points_mall_categories', {
      ...(tenantId ? { p_tenant_id: tenantId } : {}),
    }),

  saveMyCategories: (categories: Record<string, unknown>[], tenantId?: string | null) =>
    apiPost<unknown>('/api/data/rpc/save_my_member_points_mall_categories', {
      p_categories: categories,
      ...(tenantId ? { p_tenant_id: tenantId } : {}),
    }),

  listMemberRedemptions: (memberId: string, limit: number) =>
    apiPost<unknown>('/api/data/rpc/member_list_points_mall_redemptions', {
      p_member_id: memberId,
      p_limit: limit,
    }),

  redeemItem: (params: Record<string, unknown>) =>
    apiPost<unknown>('/api/data/rpc/member_redeem_points_mall_item', params),

  listMyRedemptionOrders: (status: string | null, limit: number, tenantId?: string | null) =>
    apiPost<unknown>('/api/data/rpc/list_my_member_points_mall_redemptions', {
      p_status: status,
      p_limit: limit,
      ...(tenantId ? { p_tenant_id: tenantId } : {}),
    }),

  processRedemptionOrder: (orderId: string, action: string, note: string | null) =>
    apiPost<unknown>('/api/data/rpc/process_my_member_points_mall_redemption', {
      p_redemption_id: orderId,
      p_action: action,
      p_note: note,
    }),
};
