/**
 * WhatsApp 工作台 API Client — 后端请求封装
 *
 * 所有方法直接请求后端 /api/whatsapp/* 接口，无 mock 数据。
 * 后端字段 snake_case → 前端 camelCase 映射在本文件完成。
 */
import { apiGet, apiPost } from './client';

// ══════════════════════════════════════
//  统一返回结构
// ══════════════════════════════════════

export type ApiResult<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string } };

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
//  导出 API
// ══════════════════════════════════════

export const whatsappApi = {

  normalizePhone: async (
    phone: string,
    countryCode?: string,
  ): Promise<ApiResult<NormalizePhoneData>> => {
    return safeApi(() => apiPost<NormalizePhoneData>('/api/whatsapp/normalize-phone', { phone, countryCode }));
  },

  getMemberByPhone: async (phone: string): Promise<ApiResult<MemberMatchData>> => {
    return safeApi(() => apiGet<MemberMatchData>(`/api/whatsapp/member-by-phone${qs({ phone })}`));
  },

  getConversationContext: async (
    phone: string,
    accountId?: string,
  ): Promise<ApiResult<ConversationContextData>> => {
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
    const result = await safeApi(() =>
      apiGet<Record<string, unknown> | null>(`/api/whatsapp/conversation-status${qs({ accountId, phone })}`),
    );
    if (!result.success) return result as ApiResult<never>;
    return ok(result.data ? mapStatusRow(result.data) : null);
  },

  updateConversationStatus: async (
    payload: UpdateStatusPayload,
  ): Promise<ApiResult<StatusRecordData>> => {
    const result = await safeApi(() =>
      apiPost<Record<string, unknown>>('/api/whatsapp/conversation-status', payload),
    );
    if (!result.success) return result as ApiResult<never>;
    return ok(mapStatusRow(result.data));
  },

  bindMemberPhone: async (
    payload: BindMemberPhonePayload,
  ): Promise<ApiResult<BindResult>> => {
    return safeApi(() => apiPost<BindResult>('/api/whatsapp/bind-member-phone', payload));
  },

  unbindMemberPhone: async (
    payload: UnbindPayload,
  ): Promise<ApiResult<{ unbound: boolean }>> => {
    return safeApi(() => apiPost<{ unbound: boolean }>('/api/whatsapp/unbind-member-phone', payload));
  },

  searchMembers: async (
    keyword: string,
  ): Promise<ApiResult<MemberData[]>> => {
    return safeApi(() => apiGet<MemberData[]>(`/api/whatsapp/search-members${qs({ keyword })}`));
  },

  addNote: async (payload: AddNotePayload): Promise<ApiResult<NoteData>> => {
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
    const result = await safeApi(() =>
      apiGet<Record<string, unknown>[]>(`/api/whatsapp/notes${qs({ accountId, phone })}`),
    );
    if (!result.success) return result as ApiResult<never>;
    return ok(result.data.map(mapNoteRow));
  },
};
