/**
 * 本地 WhatsApp 会话桥接 API Client
 *
 * 职责：
 *   - 抽象本地 WhatsApp 会话数据源
 *   - 首次调用时自动检测 localhost:3100 companion 是否在线
 *   - companion 在线 → 真实 HTTP 请求
 *   - companion 离线 → 会话/消息类使用 mock fallback；登录类返回明确错误
 *   - 返回统一 BridgeResult<T> 结构
 * 规则：
 *   - 只负责数据获取/发送，不处理 UI / DOM / 业务展示逻辑
 *   - Service 层通过本文件获取本地会话数据
 *   - 登录相关接口（addSession / getSessionQr）不生成假数据
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
//  Companion 懒检测
//
//  首次 API 调用时自动探测 localhost:3100/health
//  结果缓存到 companionOnline，后续调用直接复用
//  可通过 resetDetection() 重新检测（如 companion 重启后）
// ══════════════════════════════════════

const BRIDGE_BASE = 'http://localhost:3100';
const DETECT_TIMEOUT_MS = 2000;

let companionOnline: boolean | null = null;

async function detectCompanion(): Promise<boolean> {
  if (companionOnline !== null) return companionOnline;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), DETECT_TIMEOUT_MS);
    const res = await fetch(`${BRIDGE_BASE}/health`, { signal: ctrl.signal });
    clearTimeout(timer);
    companionOnline = res.ok;
  } catch {
    companionOnline = false;
  }
  if (companionOnline) {
    console.log('[WA Bridge] Companion detected at', BRIDGE_BASE);
  } else {
    console.log('[WA Bridge] Companion not available, using mock fallback');
  }
  return companionOnline;
}

/** 重置检测缓存（companion 重启后调用） */
export function resetDetection() {
  companionOnline = null;
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

function delay(ms: number) { return new Promise(r => setTimeout(r, ms)); }
function ts(offset: number) { return new Date(Date.now() + offset).toISOString(); }

// ── 真实 HTTP 请求 ──

async function bridgeGet<T>(path: string): Promise<T> {
  const res = await fetch(`${BRIDGE_BASE}${path}`);
  if (!res.ok) throw new Error(`Bridge ${res.status}: ${res.statusText}`);
  const json = await res.json() as { success: boolean; data: T };
  if (json.success) return json.data;
  throw new Error('Bridge returned unsuccessful response');
}

async function bridgePost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BRIDGE_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Bridge ${res.status}: ${res.statusText}`);
  const json = await res.json() as { success: boolean; data: T };
  if (json.success) return json.data;
  throw new Error('Bridge returned unsuccessful response');
}

async function bridgeDelete(path: string): Promise<void> {
  const res = await fetch(`${BRIDGE_BASE}${path}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`Bridge ${res.status}: ${res.statusText}`);
}

// ══════════════════════════════════════
//  Mock 可变数据（fallback）
// ══════════════════════════════════════

const MOCK_SESSIONS: WaSession[] = [
  { id: 's1', accountId: 'acct_main',  name: '主号 (138)', phone: '+8613800001111', isConnected: true },
  { id: 's2', accountId: 'acct_cs',    name: '客服号 (139)', phone: '+8613900002222', isConnected: true },
  { id: 's3', accountId: 'acct_spare', name: '备用 (151)', phone: '+8615100005555', isConnected: false },
];

const MOCK_CONVERSATIONS: Record<string, WaConversation[]> = {
  acct_main: [
    { id: 'c1', phone: '+2348012345678', name: 'John Doe',      lastMessage: 'Hi, I want to check my points',           lastMessageAt: ts(-120_000),  unreadCount: 2, status: 'unread' },
    { id: 'c2', phone: '+233501234567',  name: 'Ama Mensah',    lastMessage: 'Order confirmed, thanks',                 lastMessageAt: ts(-3_600_000), unreadCount: 0, status: 'replied' },
    { id: 'c3', phone: '+8613700003333', name: '李明',           lastMessage: '我想兑换积分',                              lastMessageAt: ts(-7_200_000), unreadCount: 1, status: 'read_no_reply' },
    { id: 'c4', phone: '+2349011112222', name: 'Blessing Eze',  lastMessage: 'Please follow up on my withdrawal',       lastMessageAt: ts(-14_400_000), unreadCount: 0, status: 'follow_up_required' },
  ],
  acct_cs: [
    { id: 'c5', phone: '+2349087654321', name: 'Chidi Okafor', lastMessage: 'When will my card arrive?', lastMessageAt: ts(-600_000),    unreadCount: 3, status: 'priority' },
    { id: 'c6', phone: '+8615900004444', name: '王芳',          lastMessage: '充值已完成',                  lastMessageAt: ts(-86_400_000), unreadCount: 0, status: 'closed' },
  ],
  acct_spare: [],
};

const MOCK_MESSAGES = new Map<string, WaMessage[]>();

function mockKey(accountId: string, phone: string) { return `${accountId}|${phone}`; }

function seedMockMessages(phone: string): WaMessage[] {
  const base = Date.now();
  return [
    { id: 'm1', fromMe: false, body: `Hi, this is ${phone}. I need help with my account.`,     timestamp: new Date(base - 300_000).toISOString(), type: 'text' },
    { id: 'm2', fromMe: true,  body: 'Hello! How can I help you today?',                       timestamp: new Date(base - 240_000).toISOString(), type: 'text', status: 'read' },
    { id: 'm3', fromMe: false, body: 'I want to check my account balance and recent orders.',   timestamp: new Date(base - 180_000).toISOString(), type: 'text' },
    { id: 'm4', fromMe: true,  body: 'Sure, let me look that up for you. One moment please.',   timestamp: new Date(base - 120_000).toISOString(), type: 'text', status: 'delivered' },
    { id: 'm5', fromMe: false, body: 'Thank you, I really appreciate it!',                      timestamp: new Date(base - 60_000).toISOString(),  type: 'text' },
  ];
}

function findMockConv(accountId: string, phone: string): WaConversation | undefined {
  return (MOCK_CONVERSATIONS[accountId] ?? []).find(c => c.phone === phone);
}

// ══════════════════════════════════════
//  导出 API
// ══════════════════════════════════════

export const localWhatsappBridge = {

  /** 检查 companion 健康（供外部手动触发） */
  checkHealth: async (): Promise<boolean> => {
    companionOnline = null;
    return detectCompanion();
  },

  getSessions: async (): Promise<BridgeResult<WaSession[]>> => {
    const online = await detectCompanion();
    if (!online) {
      await delay(80);
      return ok([...MOCK_SESSIONS]);
    }
    try {
      const data = await bridgeGet<WaSession[]>('/sessions');
      return ok(data);
    } catch (e: unknown) {
      return fail('BRIDGE_ERROR', e instanceof Error ? e.message : 'Failed to get sessions');
    }
  },

  getConversations: async (accountId: string): Promise<BridgeResult<WaConversation[]>> => {
    const online = await detectCompanion();
    if (!online) {
      await delay(80);
      return ok([...(MOCK_CONVERSATIONS[accountId] ?? [])]);
    }
    try {
      const data = await bridgeGet<WaConversation[]>(`/conversations?accountId=${encodeURIComponent(accountId)}`);
      return ok(data);
    } catch (e: unknown) {
      return fail('BRIDGE_ERROR', e instanceof Error ? e.message : 'Failed to get conversations');
    }
  },

  getMessages: async (accountId: string, phone: string): Promise<BridgeResult<WaMessage[]>> => {
    const online = await detectCompanion();
    if (!online) {
      await delay(60);
      const k = mockKey(accountId, phone);
      if (!MOCK_MESSAGES.has(k)) MOCK_MESSAGES.set(k, seedMockMessages(phone));
      return ok([...MOCK_MESSAGES.get(k)!]);
    }
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
    if (!online) {
      await delay(50);
      const msg: WaMessage = {
        id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        fromMe: true,
        body: payload.body,
        timestamp: new Date().toISOString(),
        type: (payload.type as WaMessage['type']) ?? 'text',
        status: 'sent',
      };
      const k = mockKey(payload.accountId, payload.phone);
      const msgs = MOCK_MESSAGES.get(k) ?? [];
      MOCK_MESSAGES.set(k, [...msgs, msg]);

      const conv = findMockConv(payload.accountId, payload.phone);
      if (conv) {
        conv.lastMessage = payload.body;
        conv.lastMessageAt = msg.timestamp;
        if (conv.status !== 'priority' && conv.status !== 'follow_up_required') {
          conv.status = 'replied';
        }
      }
      return ok(msg);
    }
    try {
      const data = await bridgePost<WaMessage>('/send', payload);
      return ok(data);
    } catch (e: unknown) {
      return fail('BRIDGE_ERROR', e instanceof Error ? e.message : 'Failed to send message');
    }
  },

  markAsRead: async (accountId: string, phone: string): Promise<BridgeResult<void>> => {
    const online = await detectCompanion();
    if (!online) {
      await delay(20);
      const conv = findMockConv(accountId, phone);
      if (conv) {
        conv.unreadCount = 0;
        if (conv.status === 'unread') conv.status = 'read_no_reply';
      }
      return ok(undefined as void);
    }
    try {
      await bridgePost<void>('/mark-read', { accountId, phone });
      return ok(undefined as void);
    } catch (e: unknown) {
      return fail('BRIDGE_ERROR', e instanceof Error ? e.message : 'Failed to mark as read');
    }
  },

  updateConversationStatus: async (accountId: string, phone: string, status: ConversationStatus): Promise<BridgeResult<void>> => {
    const online = await detectCompanion();
    if (!online) {
      await delay(20);
      const conv = findMockConv(accountId, phone);
      if (conv) {
        conv.status = status;
        if (status === 'closed') conv.unreadCount = 0;
      }
      return ok(undefined as void);
    }
    try {
      await bridgePost<void>('/update-status', { accountId, phone, status });
      return ok(undefined as void);
    } catch (e: unknown) {
      return fail('BRIDGE_ERROR', e instanceof Error ? e.message : 'Failed to update status');
    }
  },

  /**
   * 创建登录会话（开始扫码流程）
   * companion 离线时返回明确错误，不生成假数据
   */
  addSession: async (displayName: string, proxyUrl?: string): Promise<BridgeResult<{ sessionId: string }>> => {
    const online = await detectCompanion();
    if (!online) {
      return fail('COMPANION_OFFLINE', '本地 PC 客户端未运行，请先启动 WhatsApp Companion');
    }
    try {
      const body: Record<string, unknown> = { displayName };
      if (proxyUrl) body.proxyUrl = proxyUrl;
      const data = await bridgePost<{ sessionId: string }>('/sessions/add', body);
      return ok(data);
    } catch (e: unknown) {
      return fail('BRIDGE_ERROR', e instanceof Error ? e.message : 'Failed to add session');
    }
  },

  /**
   * 查询 QR 码状态（轮询）
   * state: 'initializing' | 'qr_pending' | 'scanned' | 'authenticated' | 'connected' | 'disconnected' | 'error'
   * qrDataUrl: base64 PNG data URL（state=qr_pending 时有值）
   * companion 离线时返回明确错误，不生成假二维码
   */
  getSessionQr: async (sessionId: string): Promise<BridgeResult<{ state: string; qrDataUrl: string | null }>> => {
    const online = await detectCompanion();
    if (!online) {
      return fail('COMPANION_OFFLINE', '本地 PC 客户端未运行');
    }
    try {
      const data = await bridgeGet<{ sessionId: string; state: string; qrDataUrl: string | null }>(
        `/sessions/${encodeURIComponent(sessionId)}/qr`,
      );
      return ok({ state: data.state, qrDataUrl: data.qrDataUrl });
    } catch (e: unknown) {
      return fail('BRIDGE_ERROR', e instanceof Error ? e.message : 'Failed to get QR');
    }
  },

  /**
   * 删除账号（断开并移除）
   */
  deleteSession: async (sessionId: string): Promise<BridgeResult<void>> => {
    const online = await detectCompanion();
    if (!online) return fail('COMPANION_OFFLINE', '请先启动本地 WhatsApp Companion');
    try {
      await bridgeDelete(`/sessions/${encodeURIComponent(sessionId)}`);
      return ok(undefined as void);
    } catch (e: unknown) {
      return fail('BRIDGE_ERROR', e instanceof Error ? e.message : 'Failed to delete session');
    }
  },

  getAccountStats: async (accountId: string): Promise<BridgeResult<AccountStats>> => {
    const online = await detectCompanion();
    if (!online) {
      const list = MOCK_CONVERSATIONS[accountId] ?? [];
      let unreadCount = 0;
      let readNoReplyCount = 0;
      let followUpCount = 0;
      let priorityCount = 0;
      for (const c of list) {
        if (c.status === 'unread')             unreadCount += c.unreadCount || 1;
        if (c.status === 'read_no_reply')      readNoReplyCount++;
        if (c.status === 'follow_up_required') followUpCount++;
        if (c.status === 'priority')           priorityCount++;
      }
      return ok({ totalConversations: list.length, unreadCount, readNoReplyCount, followUpCount, priorityCount });
    }
    try {
      const data = await bridgeGet<AccountStats>(`/stats?accountId=${encodeURIComponent(accountId)}`);
      return ok(data);
    } catch (e: unknown) {
      return fail('BRIDGE_ERROR', e instanceof Error ? e.message : 'Failed to get stats');
    }
  },
};
