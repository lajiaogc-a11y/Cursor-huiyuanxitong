/**
 * 会员匹配 Service — 根据手机号查找会员资料
 */
import { whatsappApi, type MemberMatchResult } from '@/api/whatsapp';
import { normalizePhoneLocal } from './phoneNormalizeService';

export type { MemberMatchResult };

export type MatchStatus = MemberMatchResult['status'];

const MATCH_CACHE = new Map<string, { result: MemberMatchResult; ts: number }>();
const CACHE_TTL = 30_000;

export async function matchMemberByPhone(phone: string): Promise<MemberMatchResult> {
  const normalized = normalizePhoneLocal(phone);
  if (!normalized) return { status: 'error', member: null, activity: null };

  const cached = MATCH_CACHE.get(normalized);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.result;

  try {
    const result = await whatsappApi.getMemberByPhone(normalized);
    MATCH_CACHE.set(normalized, { result, ts: Date.now() });
    return result;
  } catch (e) {
    console.error('[MemberMatch] API error:', e);
    return { status: 'error', member: null, activity: null };
  }
}

export function invalidateMatchCache(phone?: string) {
  if (phone) MATCH_CACHE.delete(normalizePhoneLocal(phone));
  else MATCH_CACHE.clear();
}
