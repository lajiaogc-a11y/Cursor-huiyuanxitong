/**
 * 会话状态管理 Service
 * 管理 unread / read_no_reply / replied / follow_up_required / priority / closed
 */
import {
  whatsappApi,
  type ConversationStatus,
  type ConversationStatusRow,
  type ConversationNoteRow,
} from '@/api/whatsapp';

export type { ConversationStatus, ConversationStatusRow, ConversationNoteRow };

export const STATUS_LABELS: Record<ConversationStatus, { zh: string; en: string; color: string }> = {
  unread:             { zh: '未读',   en: 'Unread',          color: 'bg-blue-500' },
  read_no_reply:      { zh: '已读未回', en: 'Read No Reply',  color: 'bg-orange-500' },
  replied:            { zh: '已回复', en: 'Replied',          color: 'bg-green-500' },
  follow_up_required: { zh: '待跟进', en: 'Follow Up',        color: 'bg-yellow-500' },
  priority:           { zh: '优先',   en: 'Priority',         color: 'bg-red-500' },
  closed:             { zh: '已关闭', en: 'Closed',           color: 'bg-gray-400' },
};

export const ALL_STATUSES: ConversationStatus[] = [
  'unread', 'read_no_reply', 'replied', 'follow_up_required', 'priority', 'closed',
];

export async function getConversationStatus(accountId: string, phone: string): Promise<ConversationStatusRow | null> {
  try {
    return await whatsappApi.getConversationStatus(accountId, phone);
  } catch (e) {
    console.error('[ConversationStatus] get error:', e);
    return null;
  }
}

export async function updateConversationStatus(params: {
  accountId: string;
  phone: string;
  status: ConversationStatus;
  priorityLevel?: number;
  note?: string;
  assignedTo?: string | null;
}): Promise<ConversationStatusRow | null> {
  try {
    return await whatsappApi.updateConversationStatus(params);
  } catch (e) {
    console.error('[ConversationStatus] update error:', e);
    return null;
  }
}

export async function listConversationStatuses(accountId?: string, statusFilter?: ConversationStatus): Promise<ConversationStatusRow[]> {
  try {
    return await whatsappApi.listConversationStatuses(accountId, statusFilter);
  } catch (e) {
    console.error('[ConversationStatus] list error:', e);
    return [];
  }
}

export async function addNote(accountId: string, phone: string, note: string): Promise<ConversationNoteRow | null> {
  try {
    return await whatsappApi.addNote({ accountId, phone, note });
  } catch (e) {
    console.error('[ConversationStatus] addNote error:', e);
    return null;
  }
}

export async function listNotes(accountId: string, phone: string): Promise<ConversationNoteRow[]> {
  try {
    return await whatsappApi.listNotes(accountId, phone);
  } catch (e) {
    console.error('[ConversationStatus] listNotes error:', e);
    return [];
  }
}
