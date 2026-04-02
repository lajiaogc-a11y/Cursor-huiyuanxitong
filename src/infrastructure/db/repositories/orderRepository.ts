import { apiGet, apiPatch } from '@/api/client';
import { createOrderApi } from '@/services/orders/ordersApiService';

export type OrderInsertPayload = Record<string, unknown>;

/** 创建订单：走 Node MySQL API，与订单列表 /api/orders/full 数据源一致（禁止 Supabase 直连） */
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
  const data = await apiPatch<Record<string, unknown> | Record<string, unknown>[]>(
    `/api/data/table/orders?id=eq.${encodeURIComponent(orderId)}`,
    { data: updates }
  );
  if (data == null || (Array.isArray(data) && data.length === 0)) {
    throw notFoundError();
  }
  return Array.isArray(data) ? data[0] : data;
}

export async function patchOrderRecord(orderId: string, updates: Record<string, unknown>) {
  await apiPatch(
    `/api/data/table/orders?id=eq.${encodeURIComponent(orderId)}`,
    { data: updates }
  );
}

export async function getOrderDeleteState(orderId: string) {
  const row = await apiGet<{ is_deleted?: unknown } | null>(
    `/api/data/table/orders?select=is_deleted&id=eq.${encodeURIComponent(orderId)}&single=true`
  );
  if (!row) throw notFoundError();
  return row;
}
