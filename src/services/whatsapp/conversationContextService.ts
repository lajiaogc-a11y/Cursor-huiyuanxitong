/**
 * 会话上下文聚合 Service
 * 聚合会员概览、积分、礼品卡、最近订单、备注等
 */
import { whatsappApi, type ConversationContext } from '@/api/whatsapp';

export type { ConversationContext };

export async function loadConversationContext(phone: string, accountId?: string): Promise<ConversationContext> {
  try {
    return await whatsappApi.getConversationContext(phone, accountId);
  } catch (e) {
    console.error('[ConversationContext] load failed:', e);
    return { member: null, activity: null, recentOrders: [], recentNotes: [], conversationStatus: null };
  }
}
