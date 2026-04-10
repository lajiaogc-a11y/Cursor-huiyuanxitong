/**
 * 会员匹配 Service — Step 10 增强版
 *
 * 职责：
 *   - 根据手机号触发会员匹配（委派到 whatsappApi）
 *   - 支持 multiple_matches + candidates
 *   - 提供 searchMembers / bindMember / unbindMember
 *   - 匹配缓存（绑定后自动失效）
 * 规则：
 *   - 页面组件只消费结果，不做匹配逻辑
 */

import { normalizePhone } from './phoneNormalizeService';
import { whatsappApi, type MemberData } from '@/api/whatsapp';

// ── 类型 ──

export type MatchStatus = 'loading' | 'matched' | 'not_found' | 'multiple_matches' | 'error';

export type MemberSummary = MemberData;

export interface ActivitySummary {
  remainingPoints: number;
  accumulatedProfit: number;
  referralCount: number;
  consumptionCount: number;
}

export interface MemberMatchResult {
  status: MatchStatus;
  member: MemberSummary | null;
  activity: ActivitySummary | null;
  candidates?: MemberSummary[];
  matchSource?: 'binding' | 'exact' | 'suffix';
}

// ── 缓存 ──

const cache = new Map<string, { result: MemberMatchResult; ts: number }>();
const CACHE_TTL = 30_000;

// ── 公开 API ──

/**
 * 根据手机号匹配会员
 * 委派到 whatsappApi.getMemberByPhone
 */
export async function matchMemberByPhone(rawPhone: string): Promise<MemberMatchResult> {
  const { normalized, valid } = normalizePhone(rawPhone);
  if (!valid) return { status: 'error', member: null, activity: null };

  const cached = cache.get(normalized);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.result;

  const apiResult = await whatsappApi.getMemberByPhone(normalized);
  if (!apiResult.success) {
    return { status: 'error', member: null, activity: null };
  }

  const data = apiResult.data;
  let result: MemberMatchResult;

  if (data.matchStatus === 'matched' && data.member) {
    const activity: ActivitySummary = {
      remainingPoints: data.member.points,
      accumulatedProfit: 0,
      referralCount: 0,
      consumptionCount: data.member.orderCount,
    };
    result = {
      status: 'matched',
      member: data.member,
      activity,
      matchSource: data.matchSource,
    };
  } else if (data.matchStatus === 'multiple_matches') {
    result = {
      status: 'multiple_matches',
      member: null,
      activity: null,
      candidates: data.candidates,
    };
  } else if (data.matchStatus === 'error') {
    result = { status: 'error', member: null, activity: null };
  } else {
    result = { status: 'not_found', member: null, activity: null };
  }

  cache.set(normalized, { result, ts: Date.now() });
  return result;
}

/**
 * 搜索会员（供绑定 UI 使用）
 */
export async function searchMembers(keyword: string): Promise<MemberSummary[]> {
  if (!keyword || keyword.trim().length < 2) return [];
  const result = await whatsappApi.searchMembers(keyword.trim());
  return result.success ? result.data : [];
}

/**
 * 绑定会员到手机号
 */
export async function bindMemberToPhone(
  accountId: string,
  phone: string,
  memberId: string,
  note?: string,
): Promise<{ bound: boolean; member: MemberSummary | null }> {
  const { normalized } = normalizePhone(phone);
  const result = await whatsappApi.bindMemberPhone({ accountId, phone: normalized, memberId, note });
  if (result.success) {
    invalidateMatchCache(phone);
    return result.data;
  }
  return { bound: false, member: null };
}

/**
 * 解绑会员
 */
export async function unbindMember(phone: string): Promise<boolean> {
  const { normalized } = normalizePhone(phone);
  const result = await whatsappApi.unbindMemberPhone({ phone: normalized });
  if (result.success) {
    invalidateMatchCache(phone);
    return true;
  }
  return false;
}

/**
 * 清除匹配缓存
 */
export function invalidateMatchCache(phone?: string) {
  if (phone) {
    cache.delete(normalizePhone(phone).normalized);
  } else {
    cache.clear();
  }
}
