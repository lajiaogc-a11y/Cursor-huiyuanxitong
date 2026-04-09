import { ordersApi } from '@/api/orders';
import { createOrderApi } from '@/services/orders/ordersApiService';

export type OrderInsertPayload = Record<string, unknown>;

/** 创建订单：走 Node MySQL API，与订单列表 /api/orders/full 数据源一致 */
export async function insertOrderRecord(payload: OrderInsertPayload) {
  const data = await createOrderApi(payload as Record<string, unknown>);
  if (!data || typeof data !== 'object' || !('id' in data)) {
    throw new Error('CREATE_ORDER_FAILED');
  }
  return data as Record<string, unknown> & { id: string; order_number?: string; created_at?: string };
}

function notFoundError() {
  return Object.assign(new Error('ORDER_NOT_FOUND'), { code: 'ORDER_NOT_FOUND' });
}

export async function updateOrderRecord(orderId: string, updates: Record<string, unknown>) {
  const data = await ordersApi.patchById(orderId, updates);
  if (data == null || (Array.isArray(data) && data.length === 0)) {
    throw notFoundError();
  }
  return Array.isArray(data) ? data[0] : data;
}

export async function patchOrderRecord(orderId: string, updates: Record<string, unknown>) {
  await ordersApi.patchById(orderId, updates);
}

export async function getOrderDeleteState(orderId: string) {
  const row = await ordersApi.getDeleteState(orderId);
  if (!row) throw notFoundError();
  return row;
}
