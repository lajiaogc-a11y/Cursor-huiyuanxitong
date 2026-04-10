/**
 * WhatsApp 工作台 Repository — 纯数据访问层
 *
 * Step 10: 新增多匹配检测、binding 查询、会员关键词搜索
 */
import { query, queryOne, execute } from '../../database/index.js';
import crypto from 'crypto';
import { toMySqlDatetime } from '../../lib/shanghaiTime.js';
import type { ConversationStatusRow, ConversationNoteRow, ConversationStatus, PhoneBindingRow } from './types.js';

function genId() { return crypto.randomUUID(); }

function buildTenantClause(tenantId?: string | null): { sql: string; args: unknown[] } {
  return tenantId ? { sql: 'AND (tenant_id IS NULL OR tenant_id = ?)', args: [tenantId] } : { sql: '', args: [] };
}

// ── 会话状态 CRUD ──

export async function getConversationStatus(
  accountId: string, phoneNormalized: string, tenantId?: string | null,
): Promise<ConversationStatusRow | null> {
  const { sql: t, args: tA } = buildTenantClause(tenantId);
  return queryOne<ConversationStatusRow>(
    `SELECT * FROM whatsapp_conversation_status WHERE account_id = ? AND phone_normalized = ? ${t} LIMIT 1`,
    [accountId, phoneNormalized, ...tA],
  );
}

export async function upsertConversationStatus(params: {
  tenantId: string | null;
  accountId: string;
  phoneRaw: string;
  phoneNormalized: string;
  memberId?: string | null;
  status: ConversationStatus;
  priorityLevel?: number;
  assignedTo?: string | null;
  note?: string | null;
}): Promise<ConversationStatusRow> {
  const now = toMySqlDatetime(new Date());
  const existing = await getConversationStatus(params.accountId, params.phoneNormalized, params.tenantId);

  if (existing) {
    const sets: string[] = ['status = ?', 'last_status_changed_at = ?', 'updated_at = ?'];
    const args: unknown[] = [params.status, now, now];
    if (params.priorityLevel !== undefined) { sets.push('priority_level = ?'); args.push(params.priorityLevel); }
    if (params.assignedTo !== undefined) { sets.push('assigned_to = ?'); args.push(params.assignedTo); }
    if (params.note !== undefined) { sets.push('last_status_note = ?'); args.push(params.note); }
    if (params.memberId !== undefined) { sets.push('member_id = ?'); args.push(params.memberId); }
    if (params.status === 'closed') { sets.push('is_closed = 1'); }
    else { sets.push('is_closed = 0'); }
    if (params.status === 'replied') { sets.push('last_replied_at = ?'); args.push(now); }
    if (params.status === 'read_no_reply') { sets.push('last_read_at = ?'); args.push(now); }
    args.push(existing.id);
    await execute(`UPDATE whatsapp_conversation_status SET ${sets.join(', ')} WHERE id = ?`, args);
    return { ...existing, status: params.status, updated_at: now } as ConversationStatusRow;
  }

  const id = genId();
  await execute(
    `INSERT INTO whatsapp_conversation_status
     (id, tenant_id, account_id, channel, phone_raw, phone_normalized, member_id, status,
      priority_level, assigned_to, last_status_changed_at, last_status_note, is_closed, created_at, updated_at)
     VALUES (?, ?, ?, 'whatsapp', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, params.tenantId, params.accountId,
      params.phoneRaw, params.phoneNormalized,
      params.memberId ?? null, params.status,
      params.priorityLevel ?? 0, params.assignedTo ?? null,
      now, params.note ?? null,
      params.status === 'closed' ? 1 : 0,
      now, now,
    ],
  );
  return (await queryOne<ConversationStatusRow>('SELECT * FROM whatsapp_conversation_status WHERE id = ?', [id]))!;
}

export async function listConversationStatuses(
  tenantId: string | null, accountId?: string, statusFilter?: ConversationStatus,
): Promise<ConversationStatusRow[]> {
  const conds = ['1=1'];
  const args: unknown[] = [];
  if (tenantId) { conds.push('(tenant_id IS NULL OR tenant_id = ?)'); args.push(tenantId); }
  if (accountId) { conds.push('account_id = ?'); args.push(accountId); }
  if (statusFilter) { conds.push('status = ?'); args.push(statusFilter); }
  return query<ConversationStatusRow>(
    `SELECT * FROM whatsapp_conversation_status WHERE ${conds.join(' AND ')} ORDER BY last_message_at DESC, updated_at DESC LIMIT 200`,
    args,
  );
}

export async function bindMemberToConversation(
  accountId: string, phoneNormalized: string, memberId: string, tenantId: string | null,
): Promise<void> {
  const now = toMySqlDatetime(new Date());
  await execute(
    `UPDATE whatsapp_conversation_status SET member_id = ?, updated_at = ? WHERE account_id = ? AND phone_normalized = ? ${tenantId ? 'AND (tenant_id IS NULL OR tenant_id = ?)' : ''}`,
    tenantId ? [memberId, now, accountId, phoneNormalized, tenantId] : [memberId, now, accountId, phoneNormalized],
  );
}

// ── 跟进备注 CRUD ──

export async function addNote(params: {
  tenantId: string | null;
  accountId: string;
  phoneNormalized: string;
  memberId?: string | null;
  note: string;
  createdBy: string | null;
  createdByName: string | null;
}): Promise<ConversationNoteRow> {
  const id = genId();
  const now = toMySqlDatetime(new Date());
  await execute(
    `INSERT INTO whatsapp_conversation_notes
     (id, tenant_id, account_id, phone_normalized, member_id, note, created_by, created_by_name, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, params.tenantId, params.accountId, params.phoneNormalized, params.memberId ?? null,
     params.note, params.createdBy, params.createdByName, now],
  );
  return (await queryOne<ConversationNoteRow>('SELECT * FROM whatsapp_conversation_notes WHERE id = ?', [id]))!;
}

export async function listNotes(
  accountId: string, phoneNormalized: string, tenantId: string | null, limit = 50,
): Promise<ConversationNoteRow[]> {
  const { sql: t, args: tA } = buildTenantClause(tenantId);
  return query<ConversationNoteRow>(
    `SELECT * FROM whatsapp_conversation_notes WHERE account_id = ? AND phone_normalized = ? ${t} ORDER BY created_at DESC LIMIT ?`,
    [accountId, phoneNormalized, ...tA, limit],
  );
}

// ══════════════════════════════════════
//  Step 10: 会员查询增强（多匹配 + 后缀 + 模糊）
// ══════════════════════════════════════

/**
 * 精确匹配：phone_number 完全等于 phone 或 digits
 */
export async function findMembersByPhoneExact(
  phone: string, tenantId: string | null, limit = 5,
): Promise<Record<string, unknown>[]> {
  const digits = phone.replace(/\D/g, '');
  const { sql: t, args: tA } = buildTenantClause(tenantId);
  return query<Record<string, unknown>>(
    `SELECT * FROM members WHERE (phone_number = ? OR phone_number = ?) ${t} LIMIT ?`,
    [phone, digits, ...tA, limit],
  );
}

/**
 * 后缀匹配：phone_number 尾 N 位与目标一致
 */
export async function findMembersByPhoneSuffix(
  suffix: string, tenantId: string | null, limit = 5,
): Promise<Record<string, unknown>[]> {
  if (suffix.length < 7) return [];
  const { sql: t, args: tA } = buildTenantClause(tenantId);
  return query<Record<string, unknown>>(
    `SELECT * FROM members WHERE phone_number LIKE ? ${t} LIMIT ?`,
    [`%${suffix}`, ...tA, limit],
  );
}

/** 兼容旧调用签名 */
export async function findMemberByPhone(phone: string, tenantId: string | null): Promise<Record<string, unknown> | null> {
  const exact = await findMembersByPhoneExact(phone, tenantId, 1);
  if (exact.length > 0) return exact[0];

  const digits = phone.replace(/\D/g, '');
  const suffix = digits.slice(-8);
  if (suffix.length < 7) return null;

  const fuzzy = await findMembersByPhoneSuffix(suffix, tenantId, 1);
  return fuzzy.length > 0 ? fuzzy[0] : null;
}

export async function findMemberActivity(memberId: string): Promise<Record<string, unknown> | null> {
  return queryOne<Record<string, unknown>>(
    'SELECT * FROM member_activity WHERE member_id = ? LIMIT 1', [memberId],
  );
}

export async function findRecentOrders(memberId: string, tenantId: string | null, limit = 10): Promise<Record<string, unknown>[]> {
  const { sql: t, args: tA } = buildTenantClause(tenantId);
  return query<Record<string, unknown>>(
    `SELECT id, order_number, order_type, amount, currency, status, created_at FROM orders WHERE member_id = ? ${t} ORDER BY created_at DESC LIMIT ?`,
    [memberId, ...tA, limit],
  );
}

export async function findMemberById(memberId: string): Promise<Record<string, unknown> | null> {
  return queryOne<Record<string, unknown>>('SELECT * FROM members WHERE id = ? LIMIT 1', [memberId]);
}

// ══════════════════════════════════════
//  Step 10: 手机号绑定表 CRUD
// ══════════════════════════════════════

export async function findPhoneBinding(
  phoneNormalized: string, tenantId: string | null,
): Promise<PhoneBindingRow | null> {
  const { sql: t, args: tA } = buildTenantClause(tenantId);
  return queryOne<PhoneBindingRow>(
    `SELECT * FROM whatsapp_phone_bindings WHERE phone_normalized = ? ${t} LIMIT 1`,
    [phoneNormalized, ...tA],
  );
}

export async function savePhoneBinding(params: {
  phoneNormalized: string;
  memberId: string;
  tenantId: string | null;
  boundBy: string | null;
  note?: string | null;
}): Promise<PhoneBindingRow> {
  const now = toMySqlDatetime(new Date());
  const existing = await findPhoneBinding(params.phoneNormalized, params.tenantId);

  if (existing) {
    await execute(
      `UPDATE whatsapp_phone_bindings SET member_id = ?, bound_by = ?, note = ?, updated_at = ? WHERE id = ?`,
      [params.memberId, params.boundBy, params.note ?? null, now, existing.id],
    );
    return { ...existing, member_id: params.memberId, updated_at: now } as PhoneBindingRow;
  }

  const id = genId();
  await execute(
    `INSERT INTO whatsapp_phone_bindings (id, tenant_id, phone_normalized, member_id, bound_by, note, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, params.tenantId, params.phoneNormalized, params.memberId, params.boundBy, params.note ?? null, now, now],
  );
  return (await queryOne<PhoneBindingRow>('SELECT * FROM whatsapp_phone_bindings WHERE id = ?', [id]))!;
}

export async function removePhoneBinding(
  phoneNormalized: string, tenantId: string | null,
): Promise<void> {
  const { sql: t, args: tA } = buildTenantClause(tenantId);
  await execute(
    `DELETE FROM whatsapp_phone_bindings WHERE phone_normalized = ? ${t}`,
    [phoneNormalized, ...tA],
  );
}

// ══════════════════════════════════════
//  Step 10: 会员关键词搜索（绑定 UI 使用）
// ══════════════════════════════════════

export async function searchMembers(
  keyword: string, tenantId: string | null, limit = 10,
): Promise<Record<string, unknown>[]> {
  const like = `%${keyword}%`;
  const { sql: t, args: tA } = buildTenantClause(tenantId);
  return query<Record<string, unknown>>(
    `SELECT * FROM members
     WHERE (phone_number LIKE ? OR name LIKE ? OR nickname LIKE ? OR member_code LIKE ?) ${t}
     ORDER BY updated_at DESC LIMIT ?`,
    [like, like, like, like, ...tA, limit],
  );
}
