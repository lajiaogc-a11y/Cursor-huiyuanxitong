/**
 * WhatsApp 工作台 API Client — 仅负责请求，不含业务逻辑
 */
import { apiGet, apiPost } from './client';

export interface NormalizePhoneResult {
  original: string;
  normalized: string;
  valid: boolean;
}

export type ConversationStatus =
  | 'unread' | 'read_no_reply' | 'replied'
  | 'follow_up_required' | 'priority' | 'closed';

export interface ConversationStatusRow {
  id: string;
  tenant_id: string | null;
  account_id: string;
  channel: string;
  phone_raw: string;
  phone_normalized: string;
  member_id: string | null;
  status: ConversationStatus;
  priority_level: number;
  assigned_to: string | null;
  last_message_at: string | null;
  last_read_at: string | null;
  last_replied_at: string | null;
  last_status_changed_at: string | null;
  last_status_note: string | null;
  is_closed: number;
  created_at: string;
  updated_at: string;
}

export interface ConversationNoteRow {
  id: string;
  account_id: string;
  phone_normalized: string;
  member_id: string | null;
  note: string;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
}

export interface MemberMatchResult {
  status: 'matched' | 'not_found' | 'multiple_matches' | 'error';
  member: Record<string, unknown> | null;
  activity: Record<string, unknown> | null;
  matches?: number;
}

export interface ConversationContext {
  member: Record<string, unknown> | null;
  activity: Record<string, unknown> | null;
  recentOrders: Record<string, unknown>[];
  recentNotes: ConversationNoteRow[];
  conversationStatus: ConversationStatusRow | null;
}

function qs(params: Record<string, string | undefined>): string {
  const entries = Object.entries(params).filter(([, v]) => v != null) as [string, string][];
  if (!entries.length) return '';
  return '?' + new URLSearchParams(entries).toString();
}

export const whatsappApi = {
  normalizePhone: (phone: string, countryCode?: string) =>
    apiPost<NormalizePhoneResult>('/api/whatsapp/normalize-phone', { phone, countryCode }),

  getMemberByPhone: (phone: string) =>
    apiGet<MemberMatchResult>(`/api/whatsapp/member-by-phone${qs({ phone })}`),

  getConversationContext: (phone: string, accountId?: string) =>
    apiGet<ConversationContext>(`/api/whatsapp/conversation-context${qs({ phone, accountId })}`),

  getConversationStatus: (accountId: string, phone: string) =>
    apiGet<ConversationStatusRow | null>(`/api/whatsapp/conversation-status${qs({ accountId, phone })}`),

  listConversationStatuses: (accountId?: string, status?: ConversationStatus) =>
    apiGet<ConversationStatusRow[]>(`/api/whatsapp/conversation-statuses${qs({ accountId, status })}`),

  updateConversationStatus: (payload: {
    accountId: string;
    phone: string;
    status: ConversationStatus;
    priorityLevel?: number;
    note?: string;
    assignedTo?: string | null;
  }) => apiPost<ConversationStatusRow>('/api/whatsapp/conversation-status', payload),

  bindMemberPhone: (payload: { accountId: string; phone: string; memberId: string }) =>
    apiPost<{ bound: boolean }>('/api/whatsapp/bind-member-phone', payload),

  addNote: (payload: { accountId: string; phone: string; note: string }) =>
    apiPost<ConversationNoteRow>('/api/whatsapp/notes', payload),

  listNotes: (accountId: string, phone: string) =>
    apiGet<ConversationNoteRow[]>(`/api/whatsapp/notes${qs({ accountId, phone })}`),
};
