/**
 * 本地 WhatsApp 会话桥接 API — Phase 1 使用 mock 数据
 * 接口形状稳定，Phase 2/3 替换为真实 localhost adapter 或 Electron IPC
 */

export interface WaSession {
  id: string;
  accountId: string;
  phone: string;
  name: string;
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
  avatarUrl?: string;
}

export interface WaMessage {
  id: string;
  fromMe: boolean;
  body: string;
  timestamp: string;
  type: 'text' | 'image' | 'document' | 'audio' | 'video' | 'sticker';
  mediaUrl?: string;
  status?: 'sent' | 'delivered' | 'read';
}

const MOCK_SESSIONS: WaSession[] = [
  { id: 's1', accountId: 'acct_main', phone: '+8613800001111', name: '主号 (138)', isConnected: true },
  { id: 's2', accountId: 'acct_cs', phone: '+8613900002222', name: '客服号 (139)', isConnected: true },
];

const MOCK_CONVERSATIONS: Record<string, WaConversation[]> = {
  acct_main: [
    { id: 'c1', phone: '+2348012345678', name: 'John Doe', lastMessage: 'Hi, I want to check my points', lastMessageAt: new Date(Date.now() - 120_000).toISOString(), unreadCount: 2 },
    { id: 'c2', phone: '+233501234567', name: 'Ama Mensah', lastMessage: 'Order confirmed, thanks', lastMessageAt: new Date(Date.now() - 3_600_000).toISOString(), unreadCount: 0 },
    { id: 'c3', phone: '+8613700003333', name: '李明', lastMessage: '我想兑换积分', lastMessageAt: new Date(Date.now() - 7_200_000).toISOString(), unreadCount: 1 },
  ],
  acct_cs: [
    { id: 'c4', phone: '+2349087654321', name: 'Chidi Okafor', lastMessage: 'When will my card arrive?', lastMessageAt: new Date(Date.now() - 600_000).toISOString(), unreadCount: 3 },
    { id: 'c5', phone: '+8615900004444', name: '王芳', lastMessage: '充值已完成', lastMessageAt: new Date(Date.now() - 86_400_000).toISOString(), unreadCount: 0 },
  ],
};

function mockMessages(phone: string): WaMessage[] {
  const base = Date.now();
  return [
    { id: 'm1', fromMe: false, body: `Hi, this is ${phone}. I need help.`, timestamp: new Date(base - 300_000).toISOString(), type: 'text' },
    { id: 'm2', fromMe: true, body: 'Hello! How can I help you today?', timestamp: new Date(base - 240_000).toISOString(), type: 'text', status: 'read' },
    { id: 'm3', fromMe: false, body: 'I want to check my account balance and recent orders.', timestamp: new Date(base - 180_000).toISOString(), type: 'text' },
    { id: 'm4', fromMe: true, body: 'Sure, let me look that up for you. One moment please.', timestamp: new Date(base - 120_000).toISOString(), type: 'text', status: 'delivered' },
    { id: 'm5', fromMe: false, body: 'Thank you!', timestamp: new Date(base - 60_000).toISOString(), type: 'text' },
  ];
}

export const localWhatsappBridge = {
  getSessions: async (): Promise<WaSession[]> => {
    await delay(200);
    return MOCK_SESSIONS;
  },

  getConversations: async (accountId: string): Promise<WaConversation[]> => {
    await delay(300);
    return MOCK_CONVERSATIONS[accountId] ?? [];
  },

  getMessages: async (_accountId: string, phone: string): Promise<WaMessage[]> => {
    await delay(400);
    return mockMessages(phone);
  },

  sendMessage: async (payload: {
    accountId: string;
    phone: string;
    body: string;
    type?: 'text';
  }): Promise<WaMessage> => {
    await delay(500);
    return {
      id: `m_${Date.now()}`,
      fromMe: true,
      body: payload.body,
      timestamp: new Date().toISOString(),
      type: payload.type ?? 'text',
      status: 'sent',
    };
  },
};

function delay(ms: number) { return new Promise(r => setTimeout(r, ms)); }
