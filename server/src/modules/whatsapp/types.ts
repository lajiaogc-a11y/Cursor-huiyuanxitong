/**
 * WhatsApp 工作台 — 共享类型
 *
 * Step 10: 新增 PhoneBindingRow, MemberMatchResponse.candidates
 */

// ── 会话状态枚举 ──

export type ConversationStatus =
  | 'unread'
  | 'read_no_reply'
  | 'replied'
  | 'follow_up_required'
  | 'priority'
  | 'closed';

// ── 数据库行类型 ──

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

export interface PhoneBindingRow {
  id: string;
  tenant_id: string | null;
  phone_normalized: string;
  member_id: string;
  bound_by: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

// ── 内部类型 ──

export interface NormalizePhoneResult {
  original: string;
  normalized: string;
  valid: boolean;
}

// ── 响应 DTO（匹配前端 API Client 规范） ──

export interface MemberSummaryDto {
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

export interface MemberMatchResponse {
  matchStatus: 'matched' | 'not_found' | 'multiple_matches' | 'error';
  member: MemberSummaryDto | null;
  candidates?: MemberSummaryDto[];
  matchSource?: 'binding' | 'exact' | 'suffix';
}

export interface OrderSummaryDto {
  id: string;
  orderNumber: string;
  orderType: string;
  amount: number;
  currency: string | null;
  status: string;
  createdAt: string;
}

export interface ConversationContextResponse {
  memberSummary: MemberSummaryDto | null;
  giftCardSummary: { balance: number; activeCards: number } | null;
  pointsSummary: { remaining: number; lifetime: number } | null;
  recentOrders: OrderSummaryDto[];
  recentNotes: ConversationNoteRow[];
  conversationStatus: ConversationStatusRow | null;
  matchStatus?: 'matched' | 'not_found' | 'multiple_matches' | 'error';
  matchSource?: 'binding' | 'exact' | 'suffix';
  candidates?: MemberSummaryDto[];
}
