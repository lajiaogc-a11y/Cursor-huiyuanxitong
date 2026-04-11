/**
 * 会话状态管理 Service
 *
 * 职责：
 *   - 统一管理会话状态的类型、标签、颜色映射
 *   - 已读未回 (read_no_reply) 等复杂判断集中在此，不允许散落在组件
 *   - 本地内存 optimistic store（短暂缓存），后端为最终事实源
 * 规则：
 *   - 不发请求，不操作 DOM
 */

// ── 类型 ──

export type ConversationStatus =
  | 'unread'
  | 'read_no_reply'
  | 'replied'
  | 'follow_up_required'
  | 'priority'
  | 'closed';

export interface StatusMeta {
  zh: string;
  en: string;
  color: string;
  dotColor: string;
}

export interface ConversationNote {
  id: string;
  note: string;
  createdBy: string;
  createdAt: string;
}

export interface ConversationStatusRecord {
  accountId: string;
  phone: string;
  status: ConversationStatus;
  priorityLevel: number;
  assignedTo: string | null;
  updatedAt: string;
}

// ── 常量映射 ──

export const STATUS_META: Record<ConversationStatus, StatusMeta> = {
  unread:             { zh: '未读',     en: 'Unread',       color: 'bg-blue-500',   dotColor: 'bg-blue-400' },
  read_no_reply:      { zh: '已读未回', en: 'Read No Reply', color: 'bg-orange-500', dotColor: 'bg-orange-400' },
  replied:            { zh: '已回复',   en: 'Replied',       color: 'bg-green-500',  dotColor: 'bg-green-400' },
  follow_up_required: { zh: '待跟进',   en: 'Follow Up',     color: 'bg-yellow-500', dotColor: 'bg-yellow-400' },
  priority:           { zh: '优先',     en: 'Priority',      color: 'bg-red-500',    dotColor: 'bg-red-400' },
  closed:             { zh: '已关闭',   en: 'Closed',        color: 'bg-gray-400',   dotColor: 'bg-gray-300' },
};

export const ALL_STATUSES: ConversationStatus[] = [
  'unread', 'read_no_reply', 'replied', 'follow_up_required', 'priority', 'closed',
];

// ── 本地内存 optimistic store ──

const statusStore = new Map<string, ConversationStatusRecord>();
const noteStore = new Map<string, ConversationNote[]>();

function key(accountId: string, phone: string) { return `${accountId}|${phone}`; }

// ── 读取 ──

export function getStatusForPhone(accountId: string, phone: string): ConversationStatus | null {
  return statusStore.get(key(accountId, phone))?.status ?? null;
}

export function getStatusRecord(accountId: string, phone: string): ConversationStatusRecord | null {
  return statusStore.get(key(accountId, phone)) ?? null;
}

export function listNotesForPhone(accountId: string, phone: string): ConversationNote[] {
  return noteStore.get(key(accountId, phone)) ?? [];
}

// ── 写入 ──

export function updateStatus(
  accountId: string,
  phone: string,
  status: ConversationStatus,
  extra?: { priorityLevel?: number; assignedTo?: string | null },
): ConversationStatusRecord {
  const record: ConversationStatusRecord = {
    accountId,
    phone,
    status,
    priorityLevel: extra?.priorityLevel ?? (status === 'priority' ? 1 : 0),
    assignedTo: extra?.assignedTo ?? null,
    updatedAt: new Date().toISOString(),
  };
  statusStore.set(key(accountId, phone), record);
  return record;
}

export function addNote(
  accountId: string,
  phone: string,
  noteText: string,
  createdBy = '当前操作员',
): ConversationNote {
  const k = key(accountId, phone);
  const note: ConversationNote = {
    id: `note_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    note: noteText,
    createdBy,
    createdAt: new Date().toISOString(),
  };
  const existing = noteStore.get(k) ?? [];
  noteStore.set(k, [note, ...existing]);
  return note;
}

// ── 业务判断 ──

/**
 * 判断对方发了消息、我方已读但未回复的状态
 * 集中在此 service，组件不允许自行判断
 */
export function isReadNoReply(status: ConversationStatus | null): boolean {
  return status === 'read_no_reply';
}

/**
 * 当我方回复后自动推进状态
 * closed 状态下回复视为重新打开 → replied
 */
export function deriveStatusAfterReply(current: ConversationStatus | null): ConversationStatus {
  if (!current) return 'replied';
  return 'replied';
}

/**
 * 当收到对方新消息后推进状态
 */
export function deriveStatusAfterIncoming(current: ConversationStatus | null): ConversationStatus {
  if (current === 'priority') return 'priority';
  if (current === 'follow_up_required') return 'follow_up_required';
  return 'unread';
}

/**
 * 当消息被标记为已读但未回复时推进状态
 */
export function deriveStatusAfterRead(current: ConversationStatus | null): ConversationStatus {
  if (current === 'unread') return 'read_no_reply';
  return current ?? 'read_no_reply';
}

/**
 * 获取状态的排序权重（越小越靠前）
 */
export function statusSortWeight(status: ConversationStatus): number {
  const WEIGHTS: Record<ConversationStatus, number> = {
    priority: 0,
    unread: 1,
    follow_up_required: 2,
    read_no_reply: 3,
    replied: 4,
    closed: 5,
  };
  return WEIGHTS[status];
}
