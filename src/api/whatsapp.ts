/**
 * WhatsApp 工作台 API Client — 后端请求封装
 *
 * Step 8: 对齐后端实际响应字段：
 *   - normalizePhone → { rawPhone, normalizedPhone }
 *   - member-by-phone → { matchStatus, member }（不再有 activity）
 *   - conversation-context → { memberSummary, giftCardSummary, pointsSummary, ... }
 *   - MemberSummaryDto.name（非 nickname）
 *   - OrderSummaryDto.amount 为 number、createdAt（非 date）
 *   - StatusRecord / NoteRow 使用 snake_case → 前端 mapper 转 camelCase
 */
import { apiGet, apiPost } from './client';

// ══════════════════════════════════════
//  统一返回结构
// ══════════════════════════════════════

export type ApiResult<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string } };

// ══════════════════════════════════════
//  Mock 开关（Phase 4 后端就绪后切为 false）
// ══════════════════════════════════════

const USE_MOCK = false;

// ══════════════════════════════════════
//  Wire Types（与后端 DTO 严格对齐）
// ══════════════════════════════════════

export type ConversationStatus =
  | 'unread'
  | 'read_no_reply'
  | 'replied'
  | 'follow_up_required'
  | 'priority'
  | 'closed';

export interface NormalizePhoneData {
  rawPhone: string;
  normalizedPhone: string;
}

export interface MemberData {
  id: string;
  name: string;
  memberCode: string;
  phone: string;
  level: string;
  status: string;
  giftCardBalance: number;
  points: number;
  orderCount: number;
}

export interface MemberMatchData {
  matchStatus: 'matched' | 'not_found' | 'multiple_matches' | 'error';
  member: MemberData | null;
  candidates?: MemberData[];
  matchSource?: 'binding' | 'exact' | 'suffix';
}

export interface OrderData {
  id: string;
  orderNumber: string;
  orderType: string;
  amount: number;
  currency: string | null;
  status: string;
  createdAt: string;
}

export interface StatusRecordData {
  id: string;
  accountId: string;
  phone: string;
  status: ConversationStatus;
  priorityLevel: number;
  assignedTo: string | null;
  updatedAt: string;
}

export interface NoteData {
  id: string;
  accountId: string;
  phone: string;
  note: string;
  createdBy: string | null;
  createdByName: string | null;
  createdAt: string;
}

export interface ConversationContextData {
  memberSummary: MemberData | null;
  giftCardSummary: { balance: number; activeCards: number } | null;
  pointsSummary: { remaining: number; lifetime: number } | null;
  recentOrders: OrderData[];
  recentNotes: NoteData[];
  conversationStatus: StatusRecordData | null;
  matchStatus?: 'matched' | 'not_found' | 'multiple_matches' | 'error';
  matchSource?: 'binding' | 'exact' | 'suffix';
  candidates?: MemberData[];
}

export interface UpdateStatusPayload {
  accountId: string;
  phone: string;
  status: ConversationStatus;
  priorityLevel?: number;
  note?: string;
  assignedTo?: string | null;
}

export interface BindMemberPhonePayload {
  accountId: string;
  phone: string;
  memberId: string;
  note?: string;
}

export interface BindResult {
  bound: boolean;
  member: MemberData | null;
}

export interface UnbindPayload {
  phone: string;
}

export interface AddNotePayload {
  accountId: string;
  phone: string;
  note: string;
}

// ══════════════════════════════════════
//  后端 snake_case → 前端 camelCase 映射
// ══════════════════════════════════════

function mapStatusRow(raw: Record<string, unknown>): StatusRecordData {
  return {
    id:            String(raw.id ?? ''),
    accountId:     String(raw.account_id ?? raw.accountId ?? ''),
    phone:         String(raw.phone_normalized ?? raw.phone ?? ''),
    status:        (raw.status as ConversationStatus) ?? 'unread',
    priorityLevel: Number(raw.priority_level ?? raw.priorityLevel ?? 0),
    assignedTo:    raw.assigned_to != null ? String(raw.assigned_to) : (raw.assignedTo as string | null) ?? null,
    updatedAt:     String(raw.updated_at ?? raw.updatedAt ?? ''),
  };
}

function mapNoteRow(raw: Record<string, unknown>): NoteData {
  return {
    id:            String(raw.id ?? ''),
    accountId:     String(raw.account_id ?? raw.accountId ?? ''),
    phone:         String(raw.phone_normalized ?? raw.phone ?? ''),
    note:          String(raw.note ?? ''),
    createdBy:     raw.created_by != null ? String(raw.created_by) : (raw.createdBy as string | null) ?? null,
    createdByName: raw.created_by_name != null ? String(raw.created_by_name) : (raw.createdByName as string | null) ?? null,
    createdAt:     String(raw.created_at ?? raw.createdAt ?? ''),
  };
}

// ══════════════════════════════════════
//  内部工具
// ══════════════════════════════════════

function qs(params: Record<string, string | undefined>): string {
  const entries = Object.entries(params).filter(([, v]) => v != null) as [string, string][];
  if (!entries.length) return '';
  return '?' + new URLSearchParams(entries).toString();
}

function ok<T>(data: T): ApiResult<T> { return { success: true, data }; }
function fail(code: string, message: string): ApiResult<never> { return { success: false, error: { code, message } }; }

async function safeApi<T>(fn: () => Promise<T>): Promise<ApiResult<T>> {
  try {
    return ok(await fn());
  } catch (e: unknown) {
    return fail('API_ERROR', e instanceof Error ? e.message : 'Unknown API error');
  }
}

// ══════════════════════════════════════
//  Mock 数据
// ══════════════════════════════════════

const MOCK_MEMBERS: MemberData[] = [
  { id: 'mem_001', name: 'John Doe',     memberCode: '22222222', phone: '+2348012345678', level: 'VIP Gold', status: 'active', giftCardBalance: 5000, points: 3580, orderCount: 12 },
  { id: 'mem_002', name: '李明',          memberCode: '33333333', phone: '+8613700003333', level: 'Silver',   status: 'active', giftCardBalance: 0,    points: 920,  orderCount: 5 },
  { id: 'mem_003', name: 'Chidi Okafor', memberCode: '44444444', phone: '+2349087654321', level: 'Bronze',   status: 'active', giftCardBalance: 1200, points: 150,  orderCount: 2 },
];

const MOCK_ORDERS: Record<string, OrderData[]> = {
  mem_001: [
    { id: 'o1', orderNumber: 'ORD-20260408-001', orderType: 'purchase', amount: 150000, currency: 'NGN', status: 'completed', createdAt: '2026-04-08T10:00:00Z' },
    { id: 'o2', orderNumber: 'ORD-20260405-003', orderType: 'purchase', amount: 80000,  currency: 'NGN', status: 'completed', createdAt: '2026-04-05T14:30:00Z' },
    { id: 'o3', orderNumber: 'ORD-20260401-012', orderType: 'exchange', amount: 200,    currency: 'USDT',status: 'completed', createdAt: '2026-04-01T09:00:00Z' },
  ],
  mem_002: [
    { id: 'o4', orderNumber: 'ORD-20260407-008', orderType: 'purchase', amount: 12000,  currency: 'CNY', status: 'completed', createdAt: '2026-04-07T16:00:00Z' },
  ],
  mem_003: [
    { id: 'o5', orderNumber: 'ORD-20260406-022', orderType: 'purchase', amount: 35000,  currency: 'NGN', status: 'completed', createdAt: '2026-04-06T11:00:00Z' },
    { id: 'o6', orderNumber: 'ORD-20260402-005', orderType: 'purchase', amount: 22000,  currency: 'NGN', status: 'completed', createdAt: '2026-04-02T08:00:00Z' },
  ],
};

const mockStatusStore = new Map<string, StatusRecordData>();
const mockNoteStore = new Map<string, NoteData[]>();

function mockKey(accountId: string, phone: string) { return `${accountId}|${phone}`; }

function mockPhoneSuffix(phone: string, len = 8): string {
  return phone.replace(/\D/g, '').slice(-len);
}

function mockFindMember(phone: string): MemberData | null {
  const suffix = mockPhoneSuffix(phone);
  return MOCK_MEMBERS.find(m => mockPhoneSuffix(m.phone) === suffix) ?? null;
}

// ══════════════════════════════════════
//  导出 API
// ══════════════════════════════════════

export const whatsappApi = {

  normalizePhone: async (
    phone: string,
    countryCode?: string,
  ): Promise<ApiResult<NormalizePhoneData>> => {
    if (USE_MOCK) {
      const clean = phone.trim().replace(/[\s\-().（）]/g, '');
      const normalized = (clean.startsWith('00') ? '+' + clean.slice(2) : clean).replace(/[^\d+]/g, '');
      return ok({ rawPhone: phone, normalizedPhone: normalized });
    }
    return safeApi(() => apiPost<NormalizePhoneData>('/api/whatsapp/normalize-phone', { phone, countryCode }));
  },

  getMemberByPhone: async (phone: string): Promise<ApiResult<MemberMatchData>> => {
    if (USE_MOCK) {
      const suffix = mockPhoneSuffix(phone);
      const matches = MOCK_MEMBERS.filter(m => mockPhoneSuffix(m.phone) === suffix);
      if (matches.length === 1) return ok({ matchStatus: 'matched', member: matches[0], matchSource: 'exact' as const });
      if (matches.length > 1) return ok({ matchStatus: 'multiple_matches', member: null, candidates: matches });
      return ok({ matchStatus: 'not_found', member: null });
    }
    return safeApi(() => apiGet<MemberMatchData>(`/api/whatsapp/member-by-phone${qs({ phone })}`));
  },

  getConversationContext: async (
    phone: string,
    accountId?: string,
  ): Promise<ApiResult<ConversationContextData>> => {
    if (USE_MOCK) {
      const suffix = mockPhoneSuffix(phone);
      const matches = MOCK_MEMBERS.filter(m => mockPhoneSuffix(m.phone) === suffix);
      const member = matches.length === 1 ? matches[0] : null;
      const matchStatus = matches.length === 1 ? 'matched' as const
        : matches.length > 1 ? 'multiple_matches' as const : 'not_found' as const;
      const candidates = matches.length > 1 ? matches : undefined;
      const recentOrders = member ? (MOCK_ORDERS[member.id] ?? []) : [];
      const k = accountId ? mockKey(accountId, phone) : '';
      const recentNotes = k ? (mockNoteStore.get(k) ?? []) : [];
      const conversationStatus = k ? (mockStatusStore.get(k) ?? null) : null;
      const pointsSummary = member ? { remaining: member.points, lifetime: member.points + 500 } : null;
      const giftCardSummary = member ? { balance: member.giftCardBalance, activeCards: member.giftCardBalance > 0 ? 1 : 0 } : null;
      return ok({ memberSummary: member, giftCardSummary, pointsSummary, recentOrders, recentNotes, conversationStatus, matchStatus, candidates });
    }
    const result = await safeApi(() =>
      apiGet<Record<string, unknown>>(`/api/whatsapp/conversation-context${qs({ phone, accountId })}`),
    );
    if (!result.success) return result as ApiResult<never>;
    const d = result.data;
    return ok({
      memberSummary: d.memberSummary as MemberData | null,
      giftCardSummary: d.giftCardSummary as ConversationContextData['giftCardSummary'],
      pointsSummary: d.pointsSummary as ConversationContextData['pointsSummary'],
      recentOrders: (d.recentOrders as Record<string, unknown>[])?.map(o => ({
        id: String(o.id ?? ''), orderNumber: String(o.orderNumber ?? o.order_number ?? ''),
        orderType: String(o.orderType ?? o.order_type ?? ''), amount: Number(o.amount ?? 0),
        currency: o.currency != null ? String(o.currency) : null,
        status: String(o.status ?? ''), createdAt: String(o.createdAt ?? o.created_at ?? ''),
      })) ?? [],
      recentNotes: (d.recentNotes as Record<string, unknown>[])?.map(mapNoteRow) ?? [],
      conversationStatus: d.conversationStatus ? mapStatusRow(d.conversationStatus as Record<string, unknown>) : null,
      matchStatus: d.matchStatus as ConversationContextData['matchStatus'],
      matchSource: d.matchSource as ConversationContextData['matchSource'],
      candidates: d.candidates as MemberData[] | undefined,
    });
  },

  getConversationStatus: async (
    accountId: string,
    phone: string,
  ): Promise<ApiResult<StatusRecordData | null>> => {
    if (USE_MOCK) {
      return ok(mockStatusStore.get(mockKey(accountId, phone)) ?? null);
    }
    const result = await safeApi(() =>
      apiGet<Record<string, unknown> | null>(`/api/whatsapp/conversation-status${qs({ accountId, phone })}`),
    );
    if (!result.success) return result as ApiResult<never>;
    return ok(result.data ? mapStatusRow(result.data) : null);
  },

  updateConversationStatus: async (
    payload: UpdateStatusPayload,
  ): Promise<ApiResult<StatusRecordData>> => {
    if (USE_MOCK) {
      const record: StatusRecordData = {
        id: `sr_${Date.now()}`,
        accountId: payload.accountId,
        phone: payload.phone,
        status: payload.status,
        priorityLevel: payload.priorityLevel ?? (payload.status === 'priority' ? 1 : 0),
        assignedTo: payload.assignedTo ?? null,
        updatedAt: new Date().toISOString(),
      };
      mockStatusStore.set(mockKey(payload.accountId, payload.phone), record);
      return ok(record);
    }
    const result = await safeApi(() =>
      apiPost<Record<string, unknown>>('/api/whatsapp/conversation-status', payload),
    );
    if (!result.success) return result as ApiResult<never>;
    return ok(mapStatusRow(result.data));
  },

  bindMemberPhone: async (
    payload: BindMemberPhonePayload,
  ): Promise<ApiResult<BindResult>> => {
    if (USE_MOCK) {
      const member = mockFindMember(payload.phone);
      return ok({ bound: true, member });
    }
    return safeApi(() => apiPost<BindResult>('/api/whatsapp/bind-member-phone', payload));
  },

  unbindMemberPhone: async (
    payload: UnbindPayload,
  ): Promise<ApiResult<{ unbound: boolean }>> => {
    if (USE_MOCK) return ok({ unbound: true });
    return safeApi(() => apiPost<{ unbound: boolean }>('/api/whatsapp/unbind-member-phone', payload));
  },

  searchMembers: async (
    keyword: string,
  ): Promise<ApiResult<MemberData[]>> => {
    if (USE_MOCK) {
      const lower = keyword.toLowerCase();
      const results = MOCK_MEMBERS.filter(m =>
        m.name.toLowerCase().includes(lower) ||
        m.memberCode.includes(keyword) ||
        m.phone.includes(keyword),
      );
      return ok(results);
    }
    return safeApi(() => apiGet<MemberData[]>(`/api/whatsapp/search-members${qs({ keyword })}`));
  },

  addNote: async (payload: AddNotePayload): Promise<ApiResult<NoteData>> => {
    if (USE_MOCK) {
      const note: NoteData = {
        id: `note_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        accountId: payload.accountId,
        phone: payload.phone,
        note: payload.note,
        createdBy: '当前操作员',
        createdByName: '当前操作员',
        createdAt: new Date().toISOString(),
      };
      const k = mockKey(payload.accountId, payload.phone);
      const existing = mockNoteStore.get(k) ?? [];
      mockNoteStore.set(k, [note, ...existing]);
      return ok(note);
    }
    const result = await safeApi(() =>
      apiPost<Record<string, unknown>>('/api/whatsapp/notes', payload),
    );
    if (!result.success) return result as ApiResult<never>;
    return ok(mapNoteRow(result.data));
  },

  listNotes: async (
    accountId: string,
    phone: string,
  ): Promise<ApiResult<NoteData[]>> => {
    if (USE_MOCK) {
      return ok(mockNoteStore.get(mockKey(accountId, phone)) ?? []);
    }
    const result = await safeApi(() =>
      apiGet<Record<string, unknown>[]>(`/api/whatsapp/notes${qs({ accountId, phone })}`),
    );
    if (!result.success) return result as ApiResult<never>;
    return ok(result.data.map(mapNoteRow));
  },
};
