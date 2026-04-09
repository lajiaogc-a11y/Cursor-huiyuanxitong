/**
 * Orders Service - 订单业务逻辑
 */
import {
  listOrdersRepository,
  getOrdersFullRepository,
  getUsdtOrdersFullRepository,
  getMeikaFiatOrdersFullRepository,
  getMeikaUsdtOrdersFullRepository,
  createOrderRepository,
  updateOrderPointsRepository,
  insertMeikaZoneOrderLinkRepository,
  getMemberOrdersForPortalRepository,
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

export async function getMeikaFiatOrdersFullService(token: string, tenantId?: string) {
  return getMeikaFiatOrdersFullRepository(token, tenantId);
}

export async function getMeikaUsdtOrdersFullService(token: string, tenantId?: string) {
  return getMeikaUsdtOrdersFullRepository(token, tenantId);
}

export async function createOrderService(record: Record<string, unknown>) {
  const meikaZone = record.meika_zone === true || record.meika_zone === 'true';
  const { meika_zone: _mz, ...rest } = record;
  const data = await createOrderRepository(rest);
  if (meikaZone && data && typeof data === 'object' && data.id) {
    try {
      const row = data as Record<string, unknown>;
      const cur = String(row.currency ?? '').trim();
      const kind = cur === 'USDT' ? 'usdt' : 'fiat';
      await insertMeikaZoneOrderLinkRepository({
        orderId: String(row.id),
        tenantId: row.tenant_id as string | null | undefined,
        kind,
      });
    } catch (e) {
      console.warn('[Orders] insertMeikaZoneOrderLink:', (e as Error).message);
    }
  }
  // C3: Only increment member_activity when the order is created as 'completed'.
  // Non-completed orders will trigger incrementMemberActivityForNewOrder later
  // when they transition to 'completed' via the table proxy PATCH handler.
  const orderRow = data as Record<string, unknown>;
  const orderStatus = String(orderRow.status ?? '').toLowerCase().trim();
  if (orderStatus === 'completed') {
    try {
      await incrementMemberActivityForNewOrder(orderRow);
    } catch (e) {
      console.warn('[Orders] incrementMemberActivityForNewOrder:', (e as Error).message);
    }
  }
  try {
    const memberId = orderRow.member_id != null ? String(orderRow.member_id).trim() : '';
    const tid = orderRow.tenant_id != null ? String(orderRow.tenant_id).trim() : '';
    const phone = orderRow.phone_number != null ? String(orderRow.phone_number).trim() : '';
    if (memberId && tid) {
      await syncMemberCommonCardsFromOrdersRepository(memberId, tid, phone);
    }
  } catch (e) {
    console.warn('[Orders] syncMemberCommonCardsFromOrders:', (e as Error).message);
  }
  try {
    const oid = orderRow.id != null ? String(orderRow.id).trim() : '';
    const memberId = orderRow.member_id != null ? String(orderRow.member_id).trim() : '';
    const tid = orderRow.tenant_id != null ? String(orderRow.tenant_id).trim() : '';
    if (orderStatus === 'completed' && oid && memberId && tid) {
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

export async function updateOrderPointsService(orderId: string, updates: { points_status?: string; order_points?: number }, tenantId?: string | null) {
  return updateOrderPointsRepository(orderId, updates, tenantId);
}

/**
 * Member-portal facing: paginated orders for a member (by member_id + phone).
 * DB 访问已委托给 repository 层。
 */
export async function getMemberOrdersForPortal(
  memberId: string,
  options?: { limit?: number; offset?: number },
): Promise<{ rows: unknown[]; total: number }> {
  return getMemberOrdersForPortalRepository(memberId, options);
}
