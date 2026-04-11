/**
 * 本地 WhatsApp 会话桥接 API Client
 *
 * 职责：
 *   - 抽象本地 WhatsApp 会话数据源
 *   - 每次调用检测 localhost:3100 companion 是否在线
 *   - companion 在线 → 真实 HTTP 请求
 *   - companion 离线 → 返回明确 COMPANION_OFFLINE 错误，绝不回退 mock
 *   - 返回统一 BridgeResult<T> 结构
 *
 * P0 规则：
 *   - 不存在任何 mock 数据、demo 回退、内存假会话
 *   - companion 不在线 = 系统不可用，前端必须明确展示
 */
import type { ConversationStatus } from './whatsapp';

// ══════════════════════════════════════
//  统一返回结构
// ══════════════════════════════════════

export type BridgeResult<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string } };

// ══════════════════════════════════════
//  类型定义
// ══════════════════════════════════════

export interface WaSession {
  id: string;
  accountId: string;
  name: string;
  phone?: string;
  avatarUrl?: string;
  isConnected: boolean;
}

export interface WaConversation {
  id: string;
  phone: string;
  name: string;
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
  status: ConversationStatus;
  avatarUrl?: string;
}

export interface WaMessage {
  id: string;
  fromMe: boolean;
  body: string;
  timestamp: string;
  type?: 'text' | 'image' | 'document' | 'audio' | 'video' | 'sticker';
  mediaUrl?: string;
  status?: 'sent' | 'delivered' | 'read';
}

export interface SendPayload {
  accountId: string;
  phone: string;
  body: string;
  type?: 'text' | 'image' | 'file';
}

export interface AccountStats {
  totalConversations: number;
  unreadCount: number;
  readNoReplyCount: number;
  followUpCount: number;
  priorityCount: number;
}

// ══════════════════════════════════════
//  Companion 检测
//
//  每次 API 调用时探测 localhost:3100/health
//  结果缓存 30 秒，过期后重新检测
// ══════════════════════════════════════

const BRIDGE_BASE = 'http://localhost:3100';
const DETECT_TIMEOUT_MS = 2000;
const CACHE_TTL_MS = 30_000;

let companionOnline: boolean | null = null;
let lastDetectTime = 0;

/**
 * 可选 bridge token，用于 BRIDGE_TOKEN 环境变量启用时的认证。
 * 前端可通过 setBridgeToken() 设置。
 */
let bridgeToken = '';
export function setBridgeToken(token: string) { bridgeToken = token; }
export function getBridgeToken(): string { return bridgeToken; }

function authHeaders(): Record<string, string> {
  const h: Record<string, string> = {};
  if (bridgeToken) h['X-Bridge-Token'] = bridgeToken;
  return h;
}

async function detectCompanion(): Promise<boolean> {
  const now = Date.now();
  if (companionOnline !== null && (now - lastDetectTime) < CACHE_TTL_MS) {
    return companionOnline;
  }
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), DETECT_TIMEOUT_MS);
    const res = await fetch(`${BRIDGE_BASE}/health`, { signal: ctrl.signal });
    clearTimeout(timer);
    companionOnline = res.ok;
  } catch {
    companionOnline = false;
  }
  lastDetectTime = now;
  return companionOnline;
}

/** 重置检测缓存（companion 重启后调用） */
export function resetDetection() {
  companionOnline = null;
  lastDetectTime = 0;
}

/** 查询当前 companion 是否在线（不触发新检测） */
export function isCompanionOnline(): boolean {
  return companionOnline === true;
}

// ══════════════════════════════════════
//  内部工具
// ══════════════════════════════════════

function ok<T>(data: T): BridgeResult<T> {
  return { success: true, data };
}

function fail(code: string, message: string): BridgeResult<never> {
  return { success: false, error: { code, message } };
}

const OFFLINE_ERROR = () => fail('COMPANION_OFFLINE', '本地 WhatsApp Companion 未运行，请先启动 PC 客户端');

// ── 真实 HTTP 请求（携带可选 token） ──

async function bridgeGet<T>(path: string): Promise<T> {
  const res = await fetch(`${BRIDGE_BASE}${path}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`Bridge ${res.status}: ${res.statusText}`);
  const json = await res.json() as { success: boolean; data: T };
  if (json.success) return json.data;
  throw new Error('Bridge returned unsuccessful response');
}

async function bridgePost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BRIDGE_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Bridge ${res.status}: ${res.statusText}`);
  const json = await res.json() as { success: boolean; data: T };
  if (json.success) return json.data;
  throw new Error('Bridge returned unsuccessful response');
}

async function bridgeDelete(path: string): Promise<void> {
  const res = await fetch(`${BRIDGE_BASE}${path}`, { method: 'DELETE', headers: authHeaders() });
  if (!res.ok) throw new Error(`Bridge ${res.status}: ${res.statusText}`);
}

// ══════════════════════════════════════
//  导出 API — 所有方法 companion 离线时返回明确错误
// ══════════════════════════════════════

export const localWhatsappBridge = {

  /** 检查 companion 健康（供外部手动触发） */
  checkHealth: async (): Promise<boolean> => {
    resetDetection();
    return detectCompanion();
  },

  getSessions: async (): Promise<BridgeResult<WaSession[]>> => {
    const online = await detectCompanion();
    if (!online) return OFFLINE_ERROR();
    try {
      const data = await bridgeGet<WaSession[]>('/sessions');
      return ok(data);
    } catch (e: unknown) {
      return fail('BRIDGE_ERROR', e instanceof Error ? e.message : 'Failed to get sessions');
    }
  },

  getConversations: async (accountId: string): Promise<BridgeResult<WaConversation[]>> => {
    const online = await detectCompanion();
    if (!online) return OFFLINE_ERROR();
    try {
      const data = await bridgeGet<WaConversation[]>(`/conversations?accountId=${encodeURIComponent(accountId)}`);
      return ok(data);
    } catch (e: unknown) {
      return fail('BRIDGE_ERROR', e instanceof Error ? e.message : 'Failed to get conversations');
    }
  },

  getMessages: async (accountId: string, phone: string): Promise<BridgeResult<WaMessage[]>> => {
    const online = await detectCompanion();
    if (!online) return OFFLINE_ERROR();
    try {
      const data = await bridgeGet<WaMessage[]>(
        `/messages?accountId=${encodeURIComponent(accountId)}&phone=${encodeURIComponent(phone)}`,
      );
      return ok(data);
    } catch (e: unknown) {
      return fail('BRIDGE_ERROR', e instanceof Error ? e.message : 'Failed to get messages');
    }
  },

  sendMessage: async (payload: SendPayload): Promise<BridgeResult<WaMessage>> => {
    const online = await detectCompanion();
    if (!online) return OFFLINE_ERROR();
    try {
      const data = await bridgePost<WaMessage>('/send', payload);
      return ok(data);
    } catch (e: unknown) {
      return fail('BRIDGE_ERROR', e instanceof Error ? e.message : 'Failed to send message');
    }
  },

  markAsRead: async (accountId: string, phone: string): Promise<BridgeResult<void>> => {
    const online = await detectCompanion();
    if (!online) return OFFLINE_ERROR();
    try {
      await bridgePost<void>('/mark-read', { accountId, phone });
      return ok(undefined as void);
    } catch (e: unknown) {
      return fail('BRIDGE_ERROR', e instanceof Error ? e.message : 'Failed to mark as read');
    }
  },

  updateConversationStatus: async (accountId: string, phone: string, status: ConversationStatus): Promise<BridgeResult<void>> => {
    const online = await detectCompanion();
    if (!online) return OFFLINE_ERROR();
    try {
      await bridgePost<void>('/update-status', { accountId, phone, status });
      return ok(undefined as void);
    } catch (e: unknown) {
      return fail('BRIDGE_ERROR', e instanceof Error ? e.message : 'Failed to update status');
    }
  },

  addSession: async (displayName: string, proxyUrl?: string): Promise<BridgeResult<{ sessionId: string }>> => {
    const online = await detectCompanion();
    if (!online) return OFFLINE_ERROR();
    try {
      const body: Record<string, unknown> = { displayName };
      if (proxyUrl) body.proxyUrl = proxyUrl;
      const data = await bridgePost<{ sessionId: string }>('/sessions/add', body);
      return ok(data);
    } catch (e: unknown) {
      return fail('BRIDGE_ERROR', e instanceof Error ? e.message : 'Failed to add session');
    }
  },

  getSessionQr: async (sessionId: string): Promise<BridgeResult<{ state: string; qrDataUrl: string | null }>> => {
    const online = await detectCompanion();
    if (!online) return OFFLINE_ERROR();
    try {
      const data = await bridgeGet<{ sessionId: string; state: string; qrDataUrl: string | null }>(
        `/sessions/${encodeURIComponent(sessionId)}/qr`,
      );
      return ok({ state: data.state, qrDataUrl: data.qrDataUrl });
    } catch (e: unknown) {
      return fail('BRIDGE_ERROR', e instanceof Error ? e.message : 'Failed to get QR');
    }
  },

  getLoginStatus: async (sessionId: string): Promise<BridgeResult<{
    state: string;
    phone: string | null;
    displayName: string | null;
    errorMessage: string | null;
  }>> => {
    const online = await detectCompanion();
    if (!online) return OFFLINE_ERROR();
    try {
      const data = await bridgeGet<{
        sessionId: string;
        state: string;
        phone: string | null;
        displayName: string | null;
        errorMessage: string | null;
      }>(`/sessions/${encodeURIComponent(sessionId)}/status`);
      return ok({
        state: data.state,
        phone: data.phone,
        displayName: data.displayName,
        errorMessage: data.errorMessage,
      });
    } catch (e: unknown) {
      return fail('BRIDGE_ERROR', e instanceof Error ? e.message : 'Failed to get login status');
    }
  },

  deleteSession: async (sessionId: string): Promise<BridgeResult<void>> => {
    const online = await detectCompanion();
    if (!online) return OFFLINE_ERROR();
    try {
      await bridgeDelete(`/sessions/${encodeURIComponent(sessionId)}`);
      return ok(undefined as void);
    } catch (e: unknown) {
      return fail('BRIDGE_ERROR', e instanceof Error ? e.message : 'Failed to delete session');
    }
  },

  getAccountStats: async (accountId: string): Promise<BridgeResult<AccountStats>> => {
    const online = await detectCompanion();
    if (!online) return OFFLINE_ERROR();
    try {
      const data = await bridgeGet<AccountStats>(`/stats?accountId=${encodeURIComponent(accountId)}`);
      return ok(data);
    } catch (e: unknown) {
      return fail('BRIDGE_ERROR', e instanceof Error ? e.message : 'Failed to get stats');
    }
  },
};
