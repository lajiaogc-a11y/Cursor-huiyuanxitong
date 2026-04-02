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
import { incrementMemberActivityForNewOrder } from '../members/memberActivityTotals.js';
import { syncMemberCommonCardsFromOrdersRepository } from '../members/memberCommonCardsFromOrders.js';
import { grantOrderCompletedSpinCredits } from '../lottery/repository.js';
import { notifyMemberOrderCompletedSpinReward } from '../memberInboxNotifications/repository.js';

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
  const data = await createOrderRepository(record);
  try {
    await incrementMemberActivityForNewOrder(data as Record<string, unknown>);
  } catch (e) {
    console.warn('[Orders] incrementMemberActivityForNewOrder:', (e as Error).message);
  }
  try {
    const row = data as Record<string, unknown>;
    const memberId = row.member_id != null ? String(row.member_id).trim() : '';
    const tid = row.tenant_id != null ? String(row.tenant_id).trim() : '';
    const phone = row.phone_number != null ? String(row.phone_number).trim() : '';
    if (memberId && tid) {
      await syncMemberCommonCardsFromOrdersRepository(memberId, tid, phone);
    }
  } catch (e) {
    console.warn('[Orders] syncMemberCommonCardsFromOrders:', (e as Error).message);
  }
  try {
    const row = data as Record<string, unknown>;
    const st = String(row.status ?? '').toLowerCase().trim();
    const oid = row.id != null ? String(row.id).trim() : '';
    const memberId = row.member_id != null ? String(row.member_id).trim() : '';
    const tid = row.tenant_id != null ? String(row.tenant_id).trim() : '';
    if (st === 'completed' && oid && memberId && tid) {
      const { granted, amount } = await grantOrderCompletedSpinCredits({
        orderId: oid,
        memberId,
        tenantId: tid,
      });
      if (granted && amount > 0) {
        await notifyMemberOrderCompletedSpinReward({
          tenantId: tid,
          memberId,
          orderId: oid,
          spins: amount,
        });
      }
    }
  } catch (e) {
    console.warn('[Orders] grantOrderCompletedSpinCredits:', (e as Error).message);
  }
  return data;
}

export async function updateOrderPointsService(orderId: string, updates: { points_status?: string; order_points?: number }) {
  return updateOrderPointsRepository(orderId, updates);
}
