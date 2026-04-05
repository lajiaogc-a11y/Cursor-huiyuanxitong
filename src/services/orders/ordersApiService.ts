/**
 * Orders API Service - 通过 Backend API 操作订单（替代旧版 RPC / 表直连）
 */
import { apiGet, apiPost, apiPatch, unwrapApiData } from '@/api/client';
import type { OrderListSummary } from '@/types/orderListSummary';

/** 后端 full / usdt-full 返回行：摘要字段 + 动态列 */
export type ApiOrder = OrderListSummary & Record<string, unknown>;

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
}

/** 获取非 USDT 订单完整列表 */
export async function getOrdersFullApi(tenantId?: string): Promise<ApiOrder[]> {
  const q = tenantId ? `?tenant_id=${encodeURIComponent(tenantId)}` : '';
  const res = await apiGet<ApiOrder[] | ApiResponse<ApiOrder[]>>(`/api/orders/full${q}`);
  const data = unwrapApiData<ApiOrder[]>(res);
  return Array.isArray(data) ? data : [];
}

/** 获取 USDT 订单完整列表 */
export async function getUsdtOrdersFullApi(tenantId?: string): Promise<ApiOrder[]> {
  const q = tenantId ? `?tenant_id=${encodeURIComponent(tenantId)}` : '';
  const res = await apiGet<ApiOrder[] | ApiResponse<ApiOrder[]>>(`/api/orders/usdt-full${q}`);
  const data = unwrapApiData<ApiOrder[]>(res);
  return Array.isArray(data) ? data : [];
}

/** 美卡专区 · 赛地/奈拉（仅汇率计算「美卡专区」台位提交的订单） */
export async function getMeikaFiatOrdersFullApi(tenantId?: string): Promise<ApiOrder[]> {
  const q = tenantId ? `?tenant_id=${encodeURIComponent(tenantId)}` : '';
  const res = await apiGet<ApiOrder[] | ApiResponse<ApiOrder[]>>(`/api/orders/meika-fiat-full${q}`);
  const data = unwrapApiData<ApiOrder[]>(res);
  return Array.isArray(data) ? data : [];
}

/** 美卡专区 · USDT */
export async function getMeikaUsdtOrdersFullApi(tenantId?: string): Promise<ApiOrder[]> {
  const q = tenantId ? `?tenant_id=${encodeURIComponent(tenantId)}` : '';
  const res = await apiGet<ApiOrder[] | ApiResponse<ApiOrder[]>>(`/api/orders/meika-usdt-full${q}`);
  const data = unwrapApiData<ApiOrder[]>(res);
  return Array.isArray(data) ? data : [];
}

/** 创建订单 */
export async function createOrderApi(record: Record<string, unknown>): Promise<{ id: string; phone_number?: string; currency?: string; actual_payment?: number } | null> {
  const res = await apiPost<{ id: string; phone_number?: string; currency?: string; actual_payment?: number } | ApiResponse<{ id: string; phone_number?: string; currency?: string; actual_payment?: number }>>('/api/orders', record);
  const data = unwrapApiData<{ id: string; phone_number?: string; currency?: string; actual_payment?: number }>(res);
  return data ?? null;
}

/** 更新订单积分状态 */
export async function updateOrderPointsApi(orderId: string, updates: { points_status?: string; order_points?: number }): Promise<boolean> {
  const res = await apiPatch<unknown>(`/api/orders/${encodeURIComponent(orderId)}/points`, updates);
  return res !== null && typeof res === 'object' && (res as { success?: boolean }).success !== false;
}
