/**
 * 会话上下文聚合 Service — Step 12 收尾修复
 *
 * 职责：
 *   - 聚合右侧会员信息侧栏需要的全部数据结构
 *   - 委派到 whatsappApi.getConversationContext
 *   - 传递 matchStatus / candidates 给 UI 层
 *   - 提供 persistNote 方法持久化备注到后端
 * 规则：
 *   - 本层编排 API Client 调用，页面只消费结果
 *   - API 返回数据为主数据源
 */

import { whatsappApi, type MemberData, type OrderData, type NoteData } from '@/api/whatsapp';
import { getStatusForPhone, listNotesForPhone, type ConversationNote } from './conversationStatusService';
import type { ConversationStatus } from './conversationStatusService';

// ── 类型 ──

export interface OrderSummary {
  id: string;
  orderNumber: string;
  amount: string;
  date: string;
}

export interface ConversationContext {
  memberSummary: MemberData | null;
  activitySummary: { remainingPoints: number; accumulatedProfit: number; referralCount: number; consumptionCount: number } | null;
  pointsSummary: { remaining: number; lifetime: number } | null;
  giftCardSummary: { activeCards: number } | null;
  recentOrders: OrderSummary[];
  recentNotes: ConversationNote[];
  status: ConversationStatus | null;
  matchStatus: 'matched' | 'not_found' | 'multiple_matches' | 'error' | 'loading';
  matchSource?: 'binding' | 'exact' | 'suffix';
  candidates?: MemberData[];
}

// ── 内部映射 ──

function mapOrder(o: OrderData): OrderSummary {
  const currencySymbol = o.currency === 'NGN' ? '₦' : o.currency === 'CNY' ? '¥' : o.currency ? `${o.currency} ` : '';
  const amountStr = typeof o.amount === 'number' ? o.amount.toLocaleString() : String(o.amount);
  return {
    id: o.id,
    orderNumber: o.orderNumber,
    amount: `${currencySymbol}${amountStr}`,
    date: o.createdAt ? o.createdAt.slice(0, 10) : '',
  };
}

function noteDataToLocal(n: NoteData): ConversationNote {
  return {
    id: n.id,
    note: n.note,
    createdBy: n.createdByName ?? n.createdBy ?? '',
    createdAt: n.createdAt,
  };
}

// ── 公开 API ──

/**
 * 加载指定联系人的完整上下文
 * API 返回数据为主，本地 statusSvc 仅做 optimistic update
 */
export async function loadConversationContext(
  phone: string,
  accountId?: string,
): Promise<ConversationContext> {
  const apiResult = await whatsappApi.getConversationContext(phone, accountId);

  if (!apiResult.success) {
    const recentNotes = accountId ? listNotesForPhone(accountId, phone) : [];
    const status = accountId ? getStatusForPhone(accountId, phone) : null;
    return {
      memberSummary: null,
      activitySummary: null,
      pointsSummary: null,
      giftCardSummary: null,
      recentOrders: [],
      recentNotes,
      status,
      matchStatus: 'error',
    };
  }

  const data = apiResult.data;
  const member = data.memberSummary;

  const recentOrders = (data.recentOrders ?? []).map(mapOrder);

  const apiNotes = (data.recentNotes ?? []).map(noteDataToLocal);
  const localNotes = accountId ? listNotesForPhone(accountId, phone) : [];
  const recentNotes = apiNotes.length > 0 ? apiNotes : localNotes;

  const apiStatus = (data.conversationStatus?.status as ConversationStatus) ?? null;
  const localStatus = accountId ? getStatusForPhone(accountId, phone) : null;
  const status = apiStatus ?? localStatus;

  const activitySummary = member ? {
    remainingPoints: data.pointsSummary?.remaining ?? member.points,
    accumulatedProfit: 0,
    referralCount: 0,
    consumptionCount: member.orderCount,
  } : null;

  const giftCardSummary = data.giftCardSummary
    ? { activeCards: data.giftCardSummary.activeCards }
    : null;

  return {
    memberSummary: member,
    activitySummary,
    pointsSummary: data.pointsSummary,
    giftCardSummary,
    recentOrders,
    recentNotes,
    status,
    matchStatus: data.matchStatus ?? (member ? 'matched' : 'not_found'),
    matchSource: data.matchSource,
    candidates: data.candidates,
  };
}

/**
 * 持久化备注到后端，返回本地格式的 ConversationNote
 */
export async function persistNote(
  accountId: string,
  phone: string,
  text: string,
): Promise<ConversationNote> {
  const result = await whatsappApi.addNote({ accountId, phone, note: text });
  if (result.success) {
    return noteDataToLocal(result.data);
  }
  throw new Error(result.error.message);
}
