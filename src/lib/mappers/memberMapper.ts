/**
 * 共享 Member 映射工具
 * 统一 snake_case (DB/API) ↔ camelCase (前端 Member) 的转换逻辑
 */
import type { Member } from '@/hooks/members/useMembers';

// ─── 工具函数 ───────────────────────────────────────────────
function parseJsonArray<T>(val: unknown, fallback: T[] = []): T[] {
  if (Array.isArray(val)) return val as T[];
  if (typeof val === 'string') {
    try {
      const p = JSON.parse(val);
      return Array.isArray(p) ? p : fallback;
    } catch {
      return fallback;
    }
  }
  return fallback;
}

// ─── DB/API 行类型 ──────────────────────────────────────────
/** members 表原始字段（snake_case），兼容 API 返回 */
export interface DbMemberRow {
  id: string;
  phone_number: string;
  member_code: string;
  nickname?: string | null;
  member_level?: string;
  currency_preferences?: string[] | string | null;
  remark?: string;
  customer_feature?: string;
  source_id?: string | null;
  creator_id?: string | null;
  recorder_id?: string | null;
  recorder_name?: string | null;
  created_at?: string;
  common_cards?: string[] | string | null;
  bank_card?: string | null;
  initial_password?: string;
  /** 累计邀请注册成功人次（会员端邀请页同源） */
  invite_success_lifetime_count?: number | string | null;
  /** 累计获得奖励积分（流水正向累计，展示用） */
  lifetime_reward_points_earned?: number | string | null;
  total_points?: number | string | null;
  current_level_id?: string | null;
}

export interface ReferralInfo {
  referrer_phone: string;
  referrer_member_code: string;
}

// ─── DB → Member ────────────────────────────────────────────
export interface MapOptions {
  /** 转介绍信息 */
  referral?: ReferralInfo | null;
  /** 录入人名称（由调用方通过 getEmployeeNameSync 等解析后传入） */
  recorderName?: string;
}

export function mapDbMemberToMember(row: DbMemberRow, opts?: MapOptions): Member {
  const { referral, recorderName } = opts || {};
  return {
    id: row.id,
    phoneNumber: row.phone_number,
    memberCode: row.member_code,
    nickname: row.nickname != null && String(row.nickname).trim() !== '' ? String(row.nickname).trim() : null,
    level: row.member_level || 'Starter',
    currentLevelId: row.current_level_id ? String(row.current_level_id) : null,
    totalPoints: Math.max(0, Number(row.total_points) || 0),
    preferredCurrency: parseJsonArray<string>(row.currency_preferences),
    remark: row.remark || '',
    tradeFeature: row.customer_feature || '',
    sourceChannel: '',
    sourceId: row.source_id || '',
    recorder: recorderName ?? row.recorder_name ?? '',
    recorderId: row.recorder_id || row.creator_id || '',
    createdAt: row.created_at || '',
    commonCards: parseJsonArray<string>(row.common_cards),
    customerFeature: row.customer_feature || '',
    bankCard: row.bank_card || '',
    currencyCode: '',
    referrerPhone: referral?.referrer_phone || '',
    referrerMemberCode: referral?.referrer_member_code || '',
    initialPassword: row.initial_password || '',
    inviteSuccessLifetimeCount: Math.max(0, Math.floor(Number(row.invite_success_lifetime_count) || 0)),
    lifetimeRewardPointsEarned: Math.max(0, Number(row.lifetime_reward_points_earned) || 0),
  };
}

// ─── Member → DB ────────────────────────────────────────────
export function mapMemberToDb(member: Partial<Member>): Record<string, unknown> {
  return {
    phone_number: member.phoneNumber,
    member_code: member.memberCode,
    member_level: member.level,
    currency_preferences: member.preferredCurrency || [],
    remark: member.remark,
    customer_feature: member.customerFeature || member.tradeFeature,
    source_id: member.sourceId || null,
    creator_id: member.recorderId || null,
    common_cards: member.commonCards || [],
    bank_card: member.bankCard,
  };
}
