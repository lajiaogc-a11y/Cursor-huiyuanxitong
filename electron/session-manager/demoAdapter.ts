/**
 * Demo Adapter — 有状态的内存演示数据源
 *
 * 现在同时实现 IWhatsAppAdapter（异步统一接口），
 * 并支持演示用 QR 扫码流程（addSession 生成真实 QR 图片，15秒后自动模拟"连接成功"）。
 *
 * 用途：companion 无法加载 whatsapp-web.js 时的 fallback，以及开发/测试。
 */

import { randomUUID } from 'node:crypto';
import type {
  IWhatsAppAdapter,
  AdapterSession,
  AdapterConversation,
  AdapterMessage,
  AdapterStats,
  AdapterSendPayload,
} from './adapterInterface.js';

// ── 演示账号快照 ──
const DEMO_SESSIONS_SEED: AdapterSession[] = [
  { id: 's1', accountId: 'acct_main',  name: '主号 (138)',   phone: '+8613800001111', isConnected: true,  state: 'connected' },
  { id: 's2', accountId: 'acct_cs',    name: '客服号 (139)', phone: '+8613900002222', isConnected: true,  state: 'connected' },
  { id: 's3', accountId: 'acct_spare', name: '备用 (151)',   phone: '+8615100005555', isConnected: false, state: 'disconnected' },
];

const DEMO_CONVERSATIONS_SEED: Record<string, AdapterConversation[]> = {
  acct_main: [
    { id: 'c1', phone: '+2348012345678', name: 'John Doe',     lastMessage: 'Hi, I want to check my points',    lastMessageAt: Date.now() - 120_000,    unreadCount: 2, status: 'unread' },
    { id: 'c2', phone: '+233501234567',  name: 'Ama Mensah',   lastMessage: 'Order confirmed, thanks',           lastMessageAt: Date.now() - 3_600_000,  unreadCount: 0, status: 'replied' },
    { id: 'c3', phone: '+8613700003333', name: '李明',          lastMessage: '我想兑换积分',                       lastMessageAt: Date.now() - 7_200_000,  unreadCount: 1, status: 'read_no_reply' },
    { id: 'c4', phone: '+2349011112222', name: 'Blessing Eze', lastMessage: 'Please follow up on my withdrawal', lastMessageAt: Date.now() - 14_400_000, unreadCount: 0, status: 'follow_up_required' },
  ],
  acct_cs: [
    { id: 'c5', phone: '+2349087654321', name: 'Chidi Okafor', lastMessage: 'When will my card arrive?', lastMessageAt: Date.now() - 600_000,    unreadCount: 3, status: 'priority' },
    { id: 'c6', phone: '+8615900004444', name: '王芳',          lastMessage: '充值已完成',                lastMessageAt: Date.now() - 86_400_000, unreadCount: 0, status: 'closed' },
  ],
  acct_spare: [],
};

function seedMessages(phone: string): AdapterMessage[] {
  const base = Date.now();
  return [
    { id: `m1_${phone}`, fromMe: false, body: `Hi, this is ${phone}. I need help with my account.`,    timestamp: base - 300_000, type: 'text' },
    { id: `m2_${phone}`, fromMe: true,  body: 'Hello! How can I help you today?',                      timestamp: base - 240_000, type: 'text', status: 'read' },
    { id: `m3_${phone}`, fromMe: false, body: 'I want to check my account balance and recent orders.',  timestamp: base - 180_000, type: 'text' },
    { id: `m4_${phone}`, fromMe: true,  body: 'Sure, let me look that up for you. One moment please.', timestamp: base - 120_000, type: 'text', status: 'delivered' },
    { id: `m5_${phone}`, fromMe: false, body: 'Thank you, I really appreciate it!',                    timestamp: base - 60_000,  type: 'text' },
  ];
}

// ── QR 演示占位（1x1 像素透明 PNG，真实场景由 whatsappAdapter 生成） ──
const DEMO_QR_PLACEHOLDER =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

interface PendingSession {
  sessionId: string;
  displayName: string;
  state: 'initializing' | 'qr_pending' | 'connected' | 'disconnected';
  qrDataUrl: string | null;
  qrTimestamp: number;
}

export function createDemoAdapter(): IWhatsAppAdapter {
  // Deep-copy seed data so mutations don't affect module-level constants
  const sessions: AdapterSession[] = DEMO_SESSIONS_SEED.map(s => ({ ...s }));
  const conversations: Record<string, AdapterConversation[]> = Object.fromEntries(
    Object.entries(DEMO_CONVERSATIONS_SEED).map(([k, v]) => [k, v.map(c => ({ ...c }))]),
  );
  const messageStore: Record<string, AdapterMessage[]> = {};
  const pendingSessions = new Map<string, PendingSession>();

  function convKey(accountId: string, phone: string) { return `${accountId}|${phone}`; }

  function findConv(accountId: string, phone: string): AdapterConversation | undefined {
    return (conversations[accountId] ?? []).find(c => c.phone === phone);
  }

  async function generateDemoQr(sessionId: string): Promise<string> {
    try {
      // Dynamically try to use qrcode library if installed
      const QRCode = await import('qrcode').catch(() => null);
      if (QRCode) {
        return await QRCode.default.toDataURL(`DEMO-WHATSAPP-SESSION:${sessionId}`, {
          width: 256,
          margin: 2,
          color: { dark: '#000000', light: '#FFFFFF' },
        });
      }
    } catch { /* ignore */ }
    return DEMO_QR_PLACEHOLDER;
  }

  return {
    getSessions() {
      const allSessions: AdapterSession[] = [...sessions];
      for (const ps of pendingSessions.values()) {
        allSessions.push({
          id: ps.sessionId,
          accountId: ps.sessionId,
          name: ps.displayName,
          phone: '',
          isConnected: ps.state === 'connected',
          state: ps.state,
        });
      }
      return allSessions;
    },

    async getConversations(accountId) {
      return [...(conversations[accountId] ?? [])];
    },

    async getMessages(accountId, phone) {
      const k = convKey(accountId, phone);
      if (!messageStore[k]) messageStore[k] = seedMessages(phone);
      return [...messageStore[k]];
    },

    async sendMessage(payload: AdapterSendPayload) {
      const msg: AdapterMessage = {
        id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        fromMe: true,
        body: payload.body,
        timestamp: Date.now(),
        type: payload.type ?? 'text',
        status: 'sent',
      };
      const k = convKey(payload.accountId, payload.phone);
      if (!messageStore[k]) messageStore[k] = [];
      messageStore[k].push(msg);
      const conv = findConv(payload.accountId, payload.phone);
      if (conv) {
        conv.lastMessage = payload.body;
        conv.lastMessageAt = msg.timestamp;
        if (conv.status !== 'priority' && conv.status !== 'follow_up_required') conv.status = 'replied';
      }
      return msg;
    },

    async markAsRead(accountId, phone) {
      const conv = findConv(accountId, phone);
      if (!conv) return;
      conv.unreadCount = 0;
      if (conv.status === 'unread') conv.status = 'read_no_reply';
    },

    async updateStatus(accountId, phone, status) {
      const conv = findConv(accountId, phone);
      if (!conv) return;
      conv.status = status;
      if (status === 'closed') conv.unreadCount = 0;
    },

    async getStats(accountId): Promise<AdapterStats> {
      const list = conversations[accountId] ?? [];
      let unreadCount = 0, readNoReplyCount = 0, followUpCount = 0, priorityCount = 0;
      for (const c of list) {
        if (c.status === 'unread')             unreadCount += c.unreadCount || 1;
        if (c.status === 'read_no_reply')      readNoReplyCount++;
        if (c.status === 'follow_up_required') followUpCount++;
        if (c.status === 'priority')           priorityCount++;
      }
      return { totalConversations: list.length, unreadCount, readNoReplyCount, followUpCount, priorityCount };
    },

    async addSession(displayName, _proxyUrl?) {
      const sessionId = randomUUID();
      const ps: PendingSession = {
        sessionId,
        displayName,
        state: 'initializing',
        qrDataUrl: null,
        qrTimestamp: 0,
      };
      pendingSessions.set(sessionId, ps);

      // Simulate QR generation after 1 second
      setTimeout(async () => {
        ps.qrDataUrl = await generateDemoQr(sessionId);
        ps.qrTimestamp = Date.now();
        ps.state = 'qr_pending';

        // Auto "connect" after 30s for demo (shows flow without real WhatsApp)
        setTimeout(() => {
          if (ps.state === 'qr_pending') {
            ps.state = 'connected';
            // Add to main session list
            sessions.push({
              id: sessionId,
              accountId: sessionId,
              name: displayName,
              phone: '+86' + Math.floor(13000000000 + Math.random() * 2000000000),
              isConnected: true,
              state: 'connected',
            });
            conversations[sessionId] = [];
            pendingSessions.delete(sessionId);
          }
        }, 30_000);
      }, 1_000);

      return { sessionId };
    },

    async getSessionQr(sessionId) {
      const ps = pendingSessions.get(sessionId);
      if (!ps) {
        const existing = sessions.find(s => s.id === sessionId);
        if (existing) return { state: existing.state, qrDataUrl: null };
        return null;
      }
      const QR_TTL = 60_000;
      const qrValid = ps.qrDataUrl && (Date.now() - ps.qrTimestamp) < QR_TTL;
      return { state: ps.state, qrDataUrl: qrValid ? ps.qrDataUrl : null };
    },

    async removeSession(sessionId) {
      pendingSessions.delete(sessionId);
      const idx = sessions.findIndex(s => s.id === sessionId);
      if (idx !== -1) sessions.splice(idx, 1);
      delete conversations[sessionId];
    },

    async destroy() {
      pendingSessions.clear();
    },
  };
}

// ── 旧版类型（保留以防直接引用） ──
export type { IWhatsAppAdapter as IDemoAdapter };
export type DemoSession = AdapterSession;
export type DemoConversation = AdapterConversation;
export type DemoMessage = AdapterMessage;
export type DemoStats = AdapterStats;
