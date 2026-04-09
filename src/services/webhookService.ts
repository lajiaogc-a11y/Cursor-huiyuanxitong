// ============= Webhook Service =============
// 入队到 MySQL webhook_event_queue，由服务端投递（见 server/src/modules/webhooks）

import { webhooksApi } from '@/api/webhooks';

// Webhook 事件类型
export type WebhookEventType =
  | 'order.created'
  | 'order.completed'
  | 'order.cancelled'
  | 'member.created'
  | 'member.updated'
  | 'points.issued'
  | 'points.redeemed'
  | 'gift.created';

interface OrderEventPayload {
  order_id: string;
  order_number: string;
  phone_number: string;
  member_code?: string;
  currency: string;
  amount: number;
  actual_payment: number;
  card_type?: string;
  status: string;
  created_at: string;
}

interface MemberEventPayload {
  member_id: string;
  member_code: string;
  phone_number: string;
  level?: string;
  created_at: string;
}

interface PointsEventPayload {
  member_id?: string;
  member_code: string;
  phone_number: string;
  points: number;
  transaction_type: string;
  currency?: string;
  created_at: string;
}

interface GiftEventPayload {
  gift_id: string;
  member_id?: string;
  phone_number: string;
  currency: string;
  amount: number;
  gift_value: number;
  gift_type?: string;
  created_at: string;
}

type EventPayload = OrderEventPayload | MemberEventPayload | PointsEventPayload | GiftEventPayload;

/**
 * 触发 Webhook 事件（异步，返回 Promise）
 * @param eventType 事件类型
 * @param payload 事件数据
 * @returns 是否成功入队
 */
export async function triggerWebhookEvent(
  eventType: WebhookEventType,
  payload: EventPayload
): Promise<boolean> {
  try {
    const eventData = {
      event: eventType,
      timestamp: new Date().toISOString(),
      data: payload,
    };

    const res = await webhooksApi.enqueue({
      event_type: eventType,
      payload: eventData,
    }) as { success?: boolean; error?: string };

    if (res && typeof res === 'object' && res.success === false) {
      console.warn('[WebhookService] Enqueue rejected:', res.error);
      return false;
    }
    return true;
  } catch (error) {
    console.error('[WebhookService] Error triggering webhook:', error);
    return false;
  }
}

/**
 * 🚀 Fire-and-Forget 版本：不阻塞调用方
 * 在后台触发 Webhook，错误只记录日志不抛出
 */
export function triggerWebhookEventAsync(
  eventType: WebhookEventType,
  payload: EventPayload
): void {
  // 使用 setTimeout 将任务推到下一个事件循环，完全不阻塞当前执行
  setTimeout(() => {
    triggerWebhookEvent(eventType, payload).catch(err => {
      console.error('[WebhookService] Async webhook trigger failed:', err);
    });
  }, 0);
}

// ============= 便捷方法 =============

/**
 * 触发订单创建事件
 */
export async function triggerOrderCreated(order: {
  id: string;
  orderNumber: string;
  phoneNumber: string;
  memberCode?: string;
  currency: string;
  amount: number;
  actualPaid: number;
  cardType?: string;
  createdAt: string;
}): Promise<boolean> {
  return triggerWebhookEvent('order.created', {
    order_id: order.id,
    order_number: order.orderNumber,
    phone_number: order.phoneNumber,
    member_code: order.memberCode,
    currency: order.currency,
    amount: order.amount,
    actual_payment: order.actualPaid,
    card_type: order.cardType,
    status: 'completed',
    created_at: order.createdAt,
  });
}

/** Fire-and-forget 版本 */
export function triggerOrderCreatedAsync(order: Parameters<typeof triggerOrderCreated>[0]): void {
  triggerWebhookEventAsync('order.created', {
    order_id: order.id,
    order_number: order.orderNumber,
    phone_number: order.phoneNumber,
    member_code: order.memberCode,
    currency: order.currency,
    amount: order.amount,
    actual_payment: order.actualPaid,
    card_type: order.cardType,
    status: 'completed',
    created_at: order.createdAt,
  });
}

/**
 * 触发订单完成事件
 */
export async function triggerOrderCompleted(order: {
  id: string;
  orderNumber: string;
  phoneNumber: string;
  memberCode?: string;
  currency: string;
  amount: number;
  actualPaid: number;
  cardType?: string;
  completedAt: string;
}): Promise<boolean> {
  return triggerWebhookEvent('order.completed', {
    order_id: order.id,
    order_number: order.orderNumber,
    phone_number: order.phoneNumber,
    member_code: order.memberCode,
    currency: order.currency,
    amount: order.amount,
    actual_payment: order.actualPaid,
    card_type: order.cardType,
    status: 'completed',
    created_at: order.completedAt,
  });
}

/**
 * 触发订单取消事件
 */
export async function triggerOrderCancelled(order: {
  id: string;
  orderNumber: string;
  phoneNumber: string;
  memberCode?: string;
  currency: string;
  amount: number;
  cancelledAt: string;
}): Promise<boolean> {
  return triggerWebhookEvent('order.cancelled', {
    order_id: order.id,
    order_number: order.orderNumber,
    phone_number: order.phoneNumber,
    member_code: order.memberCode,
    currency: order.currency,
    amount: order.amount,
    actual_payment: 0,
    status: 'cancelled',
    created_at: order.cancelledAt,
  });
}

/**
 * 触发会员创建事件
 */
export async function triggerMemberCreated(member: {
  id: string;
  memberCode: string;
  phoneNumber: string;
  level?: string;
  createdAt: string;
}): Promise<boolean> {
  return triggerWebhookEvent('member.created', {
    member_id: member.id,
    member_code: member.memberCode,
    phone_number: member.phoneNumber,
    level: member.level,
    created_at: member.createdAt,
  });
}

/**
 * 触发会员更新事件
 */
export async function triggerMemberUpdated(member: {
  id: string;
  memberCode: string;
  phoneNumber: string;
  level?: string;
  updatedAt: string;
}): Promise<boolean> {
  return triggerWebhookEvent('member.updated', {
    member_id: member.id,
    member_code: member.memberCode,
    phone_number: member.phoneNumber,
    level: member.level,
    created_at: member.updatedAt,
  });
}

/**
 * 触发积分发放事件
 */
export async function triggerPointsIssued(points: {
  memberId?: string;
  memberCode: string;
  phoneNumber: string;
  points: number;
  transactionType: string;
  currency?: string;
  createdAt: string;
}): Promise<boolean> {
  return triggerWebhookEvent('points.issued', {
    member_id: points.memberId,
    member_code: points.memberCode,
    phone_number: points.phoneNumber,
    points: points.points,
    transaction_type: points.transactionType,
    currency: points.currency,
    created_at: points.createdAt,
  });
}

/** Fire-and-forget 版本 */
export function triggerPointsIssuedAsync(points: Parameters<typeof triggerPointsIssued>[0]): void {
  triggerWebhookEventAsync('points.issued', {
    member_id: points.memberId,
    member_code: points.memberCode,
    phone_number: points.phoneNumber,
    points: points.points,
    transaction_type: points.transactionType,
    currency: points.currency,
    created_at: points.createdAt,
  });
}

/**
 * 触发积分兑换事件
 */
export async function triggerPointsRedeemed(points: {
  memberId?: string;
  memberCode: string;
  phoneNumber: string;
  points: number;
  createdAt: string;
}): Promise<boolean> {
  return triggerWebhookEvent('points.redeemed', {
    member_id: points.memberId,
    member_code: points.memberCode,
    phone_number: points.phoneNumber,
    points: points.points,
    transaction_type: 'redemption',
    created_at: points.createdAt,
  });
}

/**
 * 触发活动赠送事件
 */
export async function triggerGiftCreated(gift: {
  id: string;
  memberId?: string;
  phoneNumber: string;
  currency: string;
  amount: number;
  giftValue: number;
  giftType?: string;
  createdAt: string;
}): Promise<boolean> {
  return triggerWebhookEvent('gift.created', {
    gift_id: gift.id,
    member_id: gift.memberId,
    phone_number: gift.phoneNumber,
    currency: gift.currency,
    amount: gift.amount,
    gift_value: gift.giftValue,
    gift_type: gift.giftType,
    created_at: gift.createdAt,
  });
}

/** Fire-and-forget 版本 */
export function triggerGiftCreatedAsync(gift: Parameters<typeof triggerGiftCreated>[0]): void {
  triggerWebhookEventAsync('gift.created', {
    gift_id: gift.id,
    member_id: gift.memberId,
    phone_number: gift.phoneNumber,
    currency: gift.currency,
    amount: gift.amount,
    gift_value: gift.giftValue,
    gift_type: gift.giftType,
    created_at: gift.createdAt,
  });
}
