/**
 * Orders API Service - 通过 Backend API 操作订单
 * HTTP 请求委托给 @/api/orders，本层负责响应解包与类型适配。
 */
import { ordersApi } from '@/api/orders';
import { unwrapApiData } from '@/api/client';
import type { OrderListSummary } from '@/types/orderListSummary';

export type ApiOrder = OrderListSummary & Record<string, unknown>;

export async function getOrdersFullApi(tenantId?: string): Promise<ApiOrder[]> {
  const params = tenantId ? { tenant_id: tenantId } : undefined;
  const res = await ordersApi.getFull(params);
  const data = unwrapApiData<ApiOrder[]>(res);
  return Array.isArray(data) ? data : [];
}

export async function getUsdtOrdersFullApi(tenantId?: string): Promise<ApiOrder[]> {
  const params = tenantId ? { tenant_id: tenantId } : undefined;
  const res = await ordersApi.getUsdtFull(params);
  const data = unwrapApiData<ApiOrder[]>(res);
  return Array.isArray(data) ? data : [];
}

export async function getMeikaFiatOrdersFullApi(tenantId?: string): Promise<ApiOrder[]> {
  const params = tenantId ? { tenant_id: tenantId } : undefined;
  const res = await ordersApi.getMeikaFiatFull(params);
  const data = unwrapApiData<ApiOrder[]>(res);
  return Array.isArray(data) ? data : [];
}

export async function getMeikaUsdtOrdersFullApi(tenantId?: string): Promise<ApiOrder[]> {
  const params = tenantId ? { tenant_id: tenantId } : undefined;
  const res = await ordersApi.getMeikaUsdtFull(params);
  const data = unwrapApiData<ApiOrder[]>(res);
  return Array.isArray(data) ? data : [];
}

export async function createOrderApi(record: Record<string, unknown>): Promise<{ id: string; phone_number?: string; currency?: string; actual_payment?: number } | null> {
  const res = await ordersApi.create(record);
  const data = unwrapApiData<{ id: string; phone_number?: string; currency?: string; actual_payment?: number }>(res);
  return data ?? null;
}

export async function updateOrderPointsApi(orderId: string, updates: { points_status?: string; order_points?: number }): Promise<boolean> {
  const res = await ordersApi.updatePoints(orderId, updates);
  return res !== null && typeof res === 'object' && (res as { success?: boolean }).success !== false;
}
