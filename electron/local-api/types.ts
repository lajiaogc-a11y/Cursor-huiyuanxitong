/**
 * 本地 API HTTP 契约 DTO
 *
 * 这些类型是 local-api 与前端 localWhatsappBridge.ts 之间的 wire 合约。
 * 适配器内部类型（adapterInterface.ts）由 routes.ts 映射到这里。
 */

// ── 会话 ──

export interface SessionDto {
  id: string;
  accountId: string;
  name: string;
  phone: string;
  isConnected: boolean;
  state: string; // 'initializing' | 'qr_pending' | 'connected' | 'disconnected' | ...
}

// ── 扫码登录 ──

export interface AddSessionResultDto {
  sessionId: string;
}

export interface QrStatusDto {
  sessionId: string;
  state: string;
  qrDataUrl: string | null;
}

// ── 会话列表 ──

export interface ConversationDto {
  id: string;
  phone: string;
  name: string;
  lastMessage: string;
  lastMessageAt: string; // ISO 8601
  unreadCount: number;
  status: string;
}

// ── 消息 ──

export interface MessageDto {
  id: string;
  fromMe: boolean;
  body: string;
  timestamp: string; // ISO 8601
  type: 'text' | 'image' | 'document' | 'audio' | 'video' | 'sticker' | 'other';
  status: 'sent' | 'delivered' | 'read';
}

// ── 统计 ──

export interface AccountStatsDto {
  totalConversations: number;
  unreadCount: number;
  readNoReplyCount: number;
  followUpCount: number;
  priorityCount: number;
}

// ── 统一响应包裹 ──

export interface ApiResponse<T> {
  success: true;
  data: T;
}

export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
  };
}
