/**
 * WhatsApp 工作台 Service — 业务编排层
 *
 * 职责：手机号标准化、会员匹配、会话上下文聚合、状态管理
 * 禁止：直接 SQL、HTTP 相关
 */
import * as repo from './repository.js';
import type {
  NormalizePhoneResult,
  MemberMatchResult,
  ConversationContext,
  ConversationStatus,
  ConversationStatusRow,
  ConversationNoteRow,
} from './types.js';

// ── 手机号标准化 ──

export function normalizePhone(phone: string, countryCode?: string): NormalizePhoneResult {
  const original = phone.trim();
  let digits = original.replace(/[\s\-().]/g, '');

  if (digits.startsWith('+')) {
    // already has country code
  } else if (digits.startsWith('00')) {
    digits = '+' + digits.slice(2);
  } else if (countryCode) {
    const cc = countryCode.replace(/\D/g, '');
    if (!digits.startsWith(cc)) digits = '+' + cc + digits;
    else digits = '+' + digits;
  }

  const normalized = digits.replace(/[^\d+]/g, '');
  const valid = /^\+?\d{7,15}$/.test(normalized);
  return { original, normalized, valid };
}

// ── 会员匹配 ──

export async function matchMemberByPhone(phone: string, tenantId: string | null): Promise<MemberMatchResult> {
  try {
    const { normalized } = normalizePhone(phone);
    const member = await repo.findMemberByPhone(normalized, tenantId);
    if (!member) return { status: 'not_found', member: null, activity: null };

    const activity = await repo.findMemberActivity(String(member.id));
    return { status: 'matched', member, activity };
  } catch (e) {
    console.error('[WhatsApp] matchMemberByPhone error:', e);
    return { status: 'error', member: null, activity: null };
  }
}

// ── 会话上下文聚合 ──

export async function getConversationContext(
  phone: string, tenantId: string | null, accountId?: string,
): Promise<ConversationContext> {
  const { normalized } = normalizePhone(phone);
  const matchResult = await matchMemberByPhone(normalized, tenantId);

  let recentOrders: Record<string, unknown>[] = [];
  let recentNotes: ConversationNoteRow[] = [];
  let conversationStatus: ConversationStatusRow | null = null;

  if (matchResult.member) {
    const memberId = String(matchResult.member.id);
    recentOrders = await repo.findRecentOrders(memberId, tenantId);
  }

  if (accountId) {
    conversationStatus = await repo.getConversationStatus(accountId, normalized, tenantId);
    recentNotes = await repo.listNotes(accountId, normalized, tenantId);
  }

  return {
    member: matchResult.member,
    activity: matchResult.activity,
    recentOrders,
    recentNotes,
    conversationStatus,
  };
}

// ── 会话状态管理 ──

export async function getStatus(
  accountId: string, phone: string, tenantId: string | null,
): Promise<ConversationStatusRow | null> {
  const { normalized } = normalizePhone(phone);
  return repo.getConversationStatus(accountId, normalized, tenantId);
}

export async function updateStatus(params: {
  accountId: string;
  phone: string;
  status: ConversationStatus;
  tenantId: string | null;
  priorityLevel?: number;
  assignedTo?: string | null;
  note?: string | null;
}): Promise<ConversationStatusRow> {
  const { normalized, original } = normalizePhone(params.phone);
  return repo.upsertConversationStatus({
    tenantId: params.tenantId,
    accountId: params.accountId,
    phoneRaw: original,
    phoneNormalized: normalized,
    status: params.status,
    priorityLevel: params.priorityLevel,
    assignedTo: params.assignedTo,
    note: params.note,
  });
}

export async function listStatuses(
  tenantId: string | null, accountId?: string, statusFilter?: ConversationStatus,
): Promise<ConversationStatusRow[]> {
  return repo.listConversationStatuses(tenantId, accountId, statusFilter);
}

// ── 会员绑定 ──

export async function bindMember(
  accountId: string, phone: string, memberId: string, tenantId: string | null,
): Promise<void> {
  const { normalized } = normalizePhone(phone);
  await repo.bindMemberToConversation(accountId, normalized, memberId, tenantId);
}

// ── 备注 ──

export async function addNote(params: {
  accountId: string;
  phone: string;
  note: string;
  tenantId: string | null;
  operatorId: string | null;
  operatorName: string | null;
  memberId?: string | null;
}): Promise<ConversationNoteRow> {
  const { normalized } = normalizePhone(params.phone);
  return repo.addNote({
    tenantId: params.tenantId,
    accountId: params.accountId,
    phoneNormalized: normalized,
    memberId: params.memberId,
    note: params.note,
    createdBy: params.operatorId,
    createdByName: params.operatorName,
  });
}

export async function listNotes(
  accountId: string, phone: string, tenantId: string | null,
): Promise<ConversationNoteRow[]> {
  const { normalized } = normalizePhone(phone);
  return repo.listNotes(accountId, normalized, tenantId);
}
