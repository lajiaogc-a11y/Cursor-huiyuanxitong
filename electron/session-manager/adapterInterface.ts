/**
 * WhatsApp Adapter 统一接口
 *
 * DemoAdapter 和 WhatsAppAdapter 均实现此接口，
 * routes.ts / index.ts 只依赖本接口，不依赖具体实现。
 */

export interface AdapterSession {
  id: string;
  accountId: string;
  name: string;
  phone: string;
  isConnected: boolean;
  state: string; // 'initializing' | 'qr_pending' | 'scanned' | 'connected' | 'disconnected' | 'error'
}

export interface AdapterConversation {
  id: string;
  phone: string;
  name: string;
  lastMessage: string;
  lastMessageAt: number;
  unreadCount: number;
  status: string;
}

export interface AdapterMessage {
  id: string;
  fromMe: boolean;
  body: string;
  timestamp: number;
  type: string;
  status?: string;
}

export interface AdapterStats {
  totalConversations: number;
  unreadCount: number;
  readNoReplyCount: number;
  followUpCount: number;
  priorityCount: number;
}

export interface AdapterSendPayload {
  accountId: string;
  phone: string;
  body: string;
  type?: string;
}

export interface IWhatsAppAdapter {
  /** 同步获取账号列表（内存缓存） */
  getSessions(): AdapterSession[];
  getConversations(accountId: string): Promise<AdapterConversation[]>;
  getMessages(accountId: string, phone: string): Promise<AdapterMessage[]>;
  sendMessage(payload: AdapterSendPayload): Promise<AdapterMessage>;
  markAsRead(accountId: string, phone: string): Promise<void>;
  updateStatus(accountId: string, phone: string, status: string): Promise<void>;
  getStats(accountId: string): Promise<AdapterStats>;

  /** 扫码登录相关 */
  addSession(displayName: string, proxyUrl?: string): Promise<{ sessionId: string }>;
  getSessionQr(sessionId: string): Promise<{ state: string; qrDataUrl: string | null } | null>;
  removeSession(sessionId: string): Promise<void>;

  /** 清理资源 */
  destroy(): Promise<void>;
}
