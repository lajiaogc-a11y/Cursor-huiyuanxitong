/**
 * Points Service - 积分业务逻辑
 */
import {
  getMemberPointsRepository,
  getMemberPointsBreakdownRepository,
  getMemberSpinQuotaRepository,
} from './repository.js';
import type { MemberPointsResult, MemberPointsBreakdownResult, MemberSpinQuotaResult } from './types.js';

export async function getMemberPointsService(memberId: string): Promise<MemberPointsResult> {
  const data = await getMemberPointsRepository(memberId);
  const r = data as { success?: boolean; points?: number };
  return {
    success: !!r?.success,
    points: r?.success ? Number(r.points ?? 0) : 0,
  };
}

export async function getMemberPointsBreakdownService(memberId: string): Promise<MemberPointsBreakdownResult> {
  const data = await getMemberPointsBreakdownRepository(memberId);
  const r = data as MemberPointsBreakdownResult;
  if (!r?.success) {
    return { success: false, consumption_points: 0, referral_points: 0, total_points: 0 };
  }
  return {
    success: true,
    consumption_points: Number(r.consumption_points ?? 0),
    referral_points: Number(r.referral_points ?? 0),
    total_points: Number(r.total_points ?? 0),
  };
}

export async function getMemberSpinQuotaService(memberId: string): Promise<MemberSpinQuotaResult> {
  const data = await getMemberSpinQuotaRepository(memberId);
  const r = data as { success?: boolean; remaining?: number };
  return {
    success: !!r?.success,
    remaining: r?.success ? Number(r.remaining ?? 0) : 0,
  };
}
