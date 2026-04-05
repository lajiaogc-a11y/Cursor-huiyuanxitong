/**
 * Points Service - 积分业务逻辑
 */
import { getMemberPointsRepository } from './repository.js';
import { computeMemberPointsBreakdown } from './memberPointsBreakdown.js';
import { getQuota } from '../lottery/service.js';
import type { MemberPointsResult, MemberPointsBreakdownResult, MemberSpinQuotaResult } from './types.js';

export async function getMemberPointsService(memberId: string): Promise<MemberPointsResult> {
  const { balance, frozen_points } = await getMemberPointsRepository(memberId);
  return {
    success: true,
    points: balance,
    balance,
    frozen_points,
    total_points: balance + frozen_points,
  };
}

export async function getMemberPointsBreakdownService(memberId: string): Promise<MemberPointsBreakdownResult> {
  const b = await computeMemberPointsBreakdown(memberId);
  return {
    success: b.success,
    balance: b.balance,
    consumption_points: b.consumption_points,
    referral_points: b.referral_points,
    lottery_points: b.lottery_points,
    total_points: b.total_points,
    pending_mall_points: b.pending_mall_points,
    referral_count: b.referral_count,
  };
}

export async function getMemberSpinQuotaService(memberId: string): Promise<MemberSpinQuotaResult> {
  const q = await getQuota(memberId);
  return {
    success: true,
    remaining: q.remaining,
    daily_free: q.daily_free,
    credits: q.credits,
    used_today: q.used_today,
  };
}
