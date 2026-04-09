/**
 * WhatsApp 工作台 — 共享类型
 */

export type ConversationStatus =
  | 'unread'
  | 'read_no_reply'
  | 'replied'
  | 'follow_up_required'
  | 'priority'
  | 'closed';

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
  tenant_id: string | null;
  account_id: string;
  phone_normalized: string;
  member_id: string | null;
  note: string;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
}

export interface NormalizePhoneResult {
  original: string;
  normalized: string;
  valid: boolean;
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
