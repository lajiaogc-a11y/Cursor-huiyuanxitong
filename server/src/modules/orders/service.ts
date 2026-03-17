/**
 * Orders Service - 订单业务逻辑
 */
import {
  listOrdersRepository,
  getOrdersFullRepository,
  getUsdtOrdersFullRepository,
  createOrderRepository,
  updateOrderPointsRepository,
} from './repository.js';

export async function listOrdersService(tenantId?: string | null, limit?: number) {
  return listOrdersRepository(tenantId ?? undefined, limit);
}

export async function getOrdersFullService(token: string, tenantId?: string) {
  return getOrdersFullRepository(token, tenantId);
}

export async function getUsdtOrdersFullService(token: string, tenantId?: string) {
  return getUsdtOrdersFullRepository(token, tenantId);
}

export async function createOrderService(record: Record<string, unknown>) {
  return createOrderRepository(record);
}

export async function updateOrderPointsService(orderId: string, updates: { points_status?: string; order_points?: number }) {
  return updateOrderPointsRepository(orderId, updates);
}
