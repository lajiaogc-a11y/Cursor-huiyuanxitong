/**
 * 本地会话桥接 Service
 * 抽象未来 Electron / Companion 会话层
 * Phase 1 使用 mock adapter；Phase 2+ 替换为真实实现
 */
import {
  localWhatsappBridge,
  type WaSession,
  type WaConversation,
  type WaMessage,
} from '@/api/localWhatsappBridge';

export type { WaSession, WaConversation, WaMessage };

export async function getSessions(): Promise<WaSession[]> {
  return localWhatsappBridge.getSessions();
}

export async function getConversations(accountId: string): Promise<WaConversation[]> {
  return localWhatsappBridge.getConversations(accountId);
}

export async function getMessages(accountId: string, phone: string): Promise<WaMessage[]> {
  return localWhatsappBridge.getMessages(accountId, phone);
}

export async function sendMessage(accountId: string, phone: string, body: string): Promise<WaMessage> {
  return localWhatsappBridge.sendMessage({ accountId, phone, body, type: 'text' });
}
