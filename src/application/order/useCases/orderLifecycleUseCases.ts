import {
  getOrderDeleteState,
  insertOrderRecord,
  patchOrderRecord,
  updateOrderRecord,
  type OrderInsertPayload,
} from '@/infrastructure/db/repositories/orderRepository';

export async function createOrderUseCase(payload: OrderInsertPayload) {
  return insertOrderRecord(payload);
}

export async function updateOrderUseCase(orderId: string, updates: Record<string, unknown>) {
  return updateOrderRecord(orderId, updates);
}

export async function cancelOrderUseCase(orderId: string) {
  await patchOrderRecord(orderId, { status: 'cancelled' });
}

export async function restoreOrderUseCase(orderId: string) {
  await patchOrderRecord(orderId, { status: 'completed' });
}

export async function softDeleteOrderUseCase(orderId: string) {
  await patchOrderRecord(orderId, {
    status: 'cancelled',
    is_deleted: true,
    deleted_at: new Date().toISOString(),
  });
}

export async function updateOrderPointsStatusUseCase(orderId: string, status: 'reversed' | 'added') {
  await patchOrderRecord(orderId, { points_status: status });
}

export async function getOrderDeleteStateUseCase(orderId: string) {
  return getOrderDeleteState(orderId);
}

