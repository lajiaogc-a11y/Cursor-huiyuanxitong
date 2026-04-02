/**
 * 积分兑换订单前端服务 — 冻结 → 审核 → 确认/拒绝
 *
 * 员工端走 REST /api/points/orders/*
 * 会员端走 RPC /api/data/rpc/member_create_point_order 等
 */
import { apiGet, apiPost } from '@/api/client';
import { hasAuthToken } from '@/lib/apiClient';
import { isMemberRealmPathname } from '@/lib/memberTokenPathMatrix';
import { getSpaPathname } from '@/lib/spaNavigation';

/**
 * 积分兑换订单（冻结 → 审核 → 成功/拒绝）。
 * 当前模型仅持久化积分扣减（`points_cost`），不含法币标价；商品文案里的「¥ / NGN」等仅来自运营配置，订单层无法单独展示可信现金价。
 * 若会员端要展示官方法币价，需后端扩展字段后再接 UI。
 */
export interface PointOrder {
  id: string;
  member_id: string;
  tenant_id: string | null;
  phone: string | null;
  nickname: string | null;
  product_name: string;
  product_id: string | null;
  quantity: number;
  points_cost: number;
  status: 'pending' | 'success' | 'rejected';
  client_request_id: string | null;
  reject_reason: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

function isMemberPortal(): boolean {
  if (typeof window === 'undefined') return false;
  return !hasAuthToken() || isMemberRealmPathname(getSpaPathname());
}

function generateClientRequestId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (let i = 0; i < 24; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

// ── 会员端 ──

export async function memberCreatePointOrder(params: {
  memberId: string;
  productName: string;
  productId?: string;
  quantity: number;
  pointsCost: number;
}): Promise<{ success: boolean; order?: PointOrder; error?: string }> {
  const clientRequestId = generateClientRequestId();
  if (isMemberPortal()) {
    const res = await apiPost<any>('/api/data/rpc/member_create_point_order', {
      p_member_id: params.memberId,
      p_product_name: params.productName,
      p_product_id: params.productId ?? null,
      p_quantity: params.quantity,
      p_points_cost: params.pointsCost,
      p_client_request_id: clientRequestId,
    });
    return res as { success: boolean; order?: PointOrder; error?: string };
  }
  const res = await apiPost<any>('/api/points/orders', {
    member_id: params.memberId,
    product_name: params.productName,
    product_id: params.productId ?? null,
    quantity: params.quantity,
    points_cost: params.pointsCost,
    client_request_id: clientRequestId,
  });
  return { success: true, order: res?.data ?? res };
}

export async function memberListPointOrders(memberId: string, limit = 50): Promise<PointOrder[]> {
  if (isMemberPortal()) {
    const res = await apiPost<any>('/api/data/rpc/member_list_point_orders', {
      p_member_id: memberId,
      p_limit: limit,
    });
    return (res as any)?.orders ?? [];
  }
  const res = await apiGet<any>(`/api/points/orders?member_id=${encodeURIComponent(memberId)}&limit=${limit}`);
  return res?.data ?? res ?? [];
}

// ── 员工端（审核用） ──

export async function staffListPointOrders(params?: {
  status?: string;
  memberId?: string;
  limit?: number;
}): Promise<PointOrder[]> {
  const qs = new URLSearchParams();
  if (params?.status) qs.set('status', params.status);
  if (params?.memberId) qs.set('member_id', params.memberId);
  if (params?.limit) qs.set('limit', String(params.limit));
  const res = await apiGet<any>(`/api/points/orders?${qs.toString()}`);
  return res?.data ?? res ?? [];
}

export async function staffApprovePointOrder(orderId: string): Promise<{ success: boolean; error?: string }> {
  try {
    await apiPost<any>(`/api/points/orders/${encodeURIComponent(orderId)}/approve`, {});
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message ?? String(e) };
  }
}

export async function staffRejectPointOrder(
  orderId: string,
  reason?: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    await apiPost<any>(`/api/points/orders/${encodeURIComponent(orderId)}/reject`, { reason });
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message ?? String(e) };
  }
}
