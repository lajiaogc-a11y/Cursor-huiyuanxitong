/**
 * WhatsApp 会话管理器类型定义（Phase 3 占位）
 *
 * 这些类型是 session-manager 和 local-api 之间的内部契约。
 * 前端 API Client (localWhatsappBridge.ts) 的 wire types 与此解耦，
 * local-api 层负责映射。
 */

// ── 会话实例状态 ──

export type SessionState =
  | 'initializing'   // 正在初始化客户端
  | 'qr_pending'     // 等待扫码
  | 'authenticated'  // 已认证，连接中
  | 'connected'      // 已连接，可收发消息
  | 'disconnected'   // 断开（可重连）
  | 'destroyed';     // 已销毁

export interface SessionInstance {
  id: string;
  accountId: string;
  displayName: string;
  phone: string;
  state: SessionState;
  lastConnectedAt: string | null;
  createdAt: string;
}

// ── 会话中的联系人/会话 ──

export interface LocalConversation {
  id: string;
  phone: string;
  pushName: string;
  isGroup: boolean;
  lastMessageBody: string;
  lastMessageTimestamp: number;
  unreadCount: number;
  archived: boolean;
}

// ── 消息 ──

export interface LocalMessage {
  id: string;
  fromMe: boolean;
  body: string;
  timestamp: number;
  type: 'text' | 'image' | 'document' | 'audio' | 'video' | 'sticker' | 'other';
  mediaUrl?: string;
  ack: number;  // 0=pending, 1=sent, 2=delivered, 3=read
  quotedMessageId?: string;
}

// ── 发送载荷 ──

export interface SendPayload {
  accountId: string;
  phone: string;
  body: string;
  type?: 'text' | 'image' | 'file';
  mediaPath?: string;
}

// ── Session Manager 接口 ──

export interface ISessionManager {
  /** 获取所有会话实例 */
  getSessions(): SessionInstance[];

  /** 获取指定账号的联系人会话列表 */
  getConversations(accountId: string): Promise<LocalConversation[]>;

  /** 获取指定联系人的消息 */
  getMessages(accountId: string, phone: string, limit?: number): Promise<LocalMessage[]>;

  /** 发送消息 */
  sendMessage(payload: SendPayload): Promise<LocalMessage>;

  /** 标记已读 */
  markAsRead(accountId: string, phone: string): Promise<void>;

  /** 添加新会话（扫码流程） */
  addSession(displayName: string): Promise<{ sessionId: string; qrDataUrl: string }>;

  /** 移除会话 */
  removeSession(sessionId: string): Promise<void>;

  /** 销毁所有会话并释放资源 */
  destroyAll(): Promise<void>;
}
