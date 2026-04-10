/**
 * WhatsApp 工作台 Service — 业务编排层
 *
 * Step 10: 多阶段会员匹配（binding → exact → suffix），searchMembers
 *
 * 职责：手机号标准化、会员匹配、会话上下文聚合、状态管理、绑定
 * 禁止：直接 SQL、HTTP 相关
 */
import * as repo from './repository.js';
import type {
  NormalizePhoneResult,
  ConversationStatus,
  ConversationStatusRow,
  ConversationNoteRow,
  MemberSummaryDto,
  MemberMatchResponse,
  OrderSummaryDto,
  ConversationContextResponse,
} from './types.js';

// ══════════════════════════════════════
//  手机号标准化
// ══════════════════════════════════════

export function normalizePhone(phone: string, countryCode?: string): NormalizePhoneResult {
  const original = phone.trim();
  let digits = original.replace(/[\s\-().（）\u200B\u00A0]/g, '');

  // WhatsApp JID
  digits = digits.replace(/@(s\.whatsapp\.net|c\.us|g\.us)$/i, '');

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

// ══════════════════════════════════════
//  DB Row → DTO 映射
// ══════════════════════════════════════

function toMemberDto(
  raw: Record<string, unknown>,
  activity: Record<string, unknown> | null,
): MemberSummaryDto {
  return {
    id:              String(raw.id ?? ''),
    name:            String(raw.nickname ?? raw.real_name ?? raw.name ?? ''),
    memberCode:      String(raw.member_code ?? ''),
    phone:           String(raw.phone_number ?? ''),
    level:           String(raw.member_level ?? raw.level ?? ''),
    status:          String(raw.status ?? ''),
    giftCardBalance: Number(activity?.remaining_gift_amount ?? activity?.gift_amount ?? 0),
    points:          Number(activity?.remaining_points ?? 0),
    orderCount:      Number(activity?.consumption_count ?? raw.order_count ?? 0),
  };
}

function toOrderDto(raw: Record<string, unknown>): OrderSummaryDto {
  return {
    id:          String(raw.id ?? ''),
    orderNumber: String(raw.order_number ?? ''),
    orderType:   String(raw.order_type ?? ''),
    amount:      Number(raw.amount ?? 0),
    currency:    raw.currency != null ? String(raw.currency) : null,
    status:      String(raw.status ?? ''),
    createdAt:   String(raw.created_at ?? ''),
  };
}

// ══════════════════════════════════════
//  Step 10: 多阶段会员匹配
//
//  优先级：
//    1. binding 表精确绑定
//    2. members 表精确匹配 (phone_number = ?)
//    3. members 表后缀匹配 (phone_number LIKE '%suffix')
//
//  如果匹配到 >1 条 → multiple_matches + candidates
// ══════════════════════════════════════

export async function matchMemberByPhone(
  phone: string,
  tenantId: string | null,
): Promise<MemberMatchResponse> {
  try {
    const { normalized } = normalizePhone(phone);
    const digits = normalized.replace(/\D/g, '');

    // Stage 1: 检查 binding 表
    const binding = await repo.findPhoneBinding(normalized, tenantId);
    if (binding) {
      const memberRow = await repo.findMemberById(binding.member_id);
      if (memberRow) {
        const activity = await repo.findMemberActivity(String(memberRow.id));
        return { matchStatus: 'matched', member: toMemberDto(memberRow, activity), matchSource: 'binding' };
      }
    }

    // Stage 2: 精确匹配
    const exactMatches = await repo.findMembersByPhoneExact(normalized, tenantId, 5);
    if (exactMatches.length === 1) {
      const activity = await repo.findMemberActivity(String(exactMatches[0].id));
      return { matchStatus: 'matched', member: toMemberDto(exactMatches[0], activity), matchSource: 'exact' };
    }
    if (exactMatches.length > 1) {
      const candidates = await enrichCandidates(exactMatches);
      return { matchStatus: 'multiple_matches', member: null, candidates, matchSource: 'exact' };
    }

    // Stage 3: 后缀匹配 (last 8 digits)
    const suffix = digits.slice(-8);
    if (suffix.length >= 7) {
      const suffixMatches = await repo.findMembersByPhoneSuffix(suffix, tenantId, 5);
      if (suffixMatches.length === 1) {
        const activity = await repo.findMemberActivity(String(suffixMatches[0].id));
        return { matchStatus: 'matched', member: toMemberDto(suffixMatches[0], activity), matchSource: 'suffix' };
      }
      if (suffixMatches.length > 1) {
        const candidates = await enrichCandidates(suffixMatches);
        return { matchStatus: 'multiple_matches', member: null, candidates, matchSource: 'suffix' };
      }
    }

    return { matchStatus: 'not_found', member: null };
  } catch (e) {
    console.error('[WhatsApp] matchMemberByPhone error:', e);
    return { matchStatus: 'error', member: null };
  }
}

async function enrichCandidates(rows: Record<string, unknown>[]): Promise<MemberSummaryDto[]> {
  const result: MemberSummaryDto[] = [];
  for (const row of rows.slice(0, 5)) {
    const activity = await repo.findMemberActivity(String(row.id));
    result.push(toMemberDto(row, activity));
  }
  return result;
}

// ══════════════════════════════════════
//  会话上下文聚合
// ══════════════════════════════════════

export async function getConversationContext(
  phone: string,
  tenantId: string | null,
  accountId?: string,
): Promise<ConversationContextResponse> {
  const { normalized } = normalizePhone(phone);
  const matchResult = await matchMemberByPhone(normalized, tenantId);

  let recentOrders: OrderSummaryDto[] = [];
  let recentNotes: ConversationNoteRow[] = [];
  let conversationStatus: ConversationStatusRow | null = null;

  const memberDto = matchResult.member;

  if (memberDto) {
    const rawOrders = await repo.findRecentOrders(memberDto.id, tenantId);
    recentOrders = rawOrders.map(toOrderDto);
  }

  if (accountId) {
    conversationStatus = await repo.getConversationStatus(accountId, normalized, tenantId);
    recentNotes = await repo.listNotes(accountId, normalized, tenantId);
  }

  const pointsSummary = memberDto
    ? { remaining: memberDto.points, lifetime: memberDto.points + memberDto.orderCount * 100 }
    : null;

  const giftCardSummary = memberDto
    ? { balance: memberDto.giftCardBalance, activeCards: memberDto.giftCardBalance > 0 ? 1 : 0 }
    : null;

  return {
    memberSummary: memberDto,
    giftCardSummary,
    pointsSummary,
    recentOrders,
    recentNotes,
    conversationStatus,
    matchStatus: matchResult.matchStatus,
    matchSource: matchResult.matchSource,
    candidates: matchResult.candidates,
  };
}

// ══════════════════════════════════════
//  会话状态管理
// ══════════════════════════════════════

export async function getStatus(
  accountId: string,
  phone: string,
  tenantId: string | null,
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
  tenantId: string | null,
  accountId?: string,
  statusFilter?: ConversationStatus,
): Promise<ConversationStatusRow[]> {
  return repo.listConversationStatuses(tenantId, accountId, statusFilter);
}

// ══════════════════════════════════════
//  Step 10: 会员绑定（增强版）
//
//  同时写入 binding 表和 conversation_status.member_id
// ══════════════════════════════════════

export async function bindMember(params: {
  accountId: string;
  phone: string;
  memberId: string;
  tenantId: string | null;
  operatorId?: string | null;
  note?: string | null;
}): Promise<{ bound: boolean; member: MemberSummaryDto | null }> {
  const { normalized } = normalizePhone(params.phone);

  await repo.savePhoneBinding({
    phoneNormalized: normalized,
    memberId: params.memberId,
    tenantId: params.tenantId,
    boundBy: params.operatorId ?? null,
    note: params.note,
  });

  await repo.bindMemberToConversation(params.accountId, normalized, params.memberId, params.tenantId);

  const memberRow = await repo.findMemberById(params.memberId);
  if (!memberRow) return { bound: true, member: null };

  const activity = await repo.findMemberActivity(params.memberId);
  return { bound: true, member: toMemberDto(memberRow, activity) };
}

export async function unbindMember(
  phone: string,
  tenantId: string | null,
): Promise<void> {
  const { normalized } = normalizePhone(phone);
  await repo.removePhoneBinding(normalized, tenantId);
}

// ══════════════════════════════════════
//  Step 10: 会员搜索（供绑定 UI 使用）
// ══════════════════════════════════════

export async function searchMembers(
  keyword: string,
  tenantId: string | null,
): Promise<MemberSummaryDto[]> {
  if (!keyword || keyword.trim().length < 2) return [];
  const rows = await repo.searchMembers(keyword.trim(), tenantId, 10);
  const result: MemberSummaryDto[] = [];
  for (const row of rows) {
    const activity = await repo.findMemberActivity(String(row.id));
    result.push(toMemberDto(row, activity));
  }
  return result;
}

// ══════════════════════════════════════
//  备注
// ══════════════════════════════════════

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
  accountId: string,
  phone: string,
  tenantId: string | null,
): Promise<ConversationNoteRow[]> {
  const { normalized } = normalizePhone(phone);
  return repo.listNotes(accountId, normalized, tenantId);
}
