import { tableGet, tablePost } from './_tableHelpers';
import { memberActivityApi } from '@/api/memberActivity';

export interface MemberActivityRow {
  id: string;
  member_id: string;
  phone_number: string;
  accumulated_points: number;
  remaining_points: number;
  referral_count: number;
  referral_points: number;
  last_reset_time: string | null;
  total_accumulated_ngn: number;
  total_accumulated_ghs: number;
  total_accumulated_usdt: number;
  total_gift_ngn: number;
  total_gift_ghs: number;
  total_gift_usdt: number;
  accumulated_profit: number;
  accumulated_profit_usdt: number;
  order_count: number;
}

export function rpcMemberActivityApplyDeltas(params: Record<string, unknown>) {
  return memberActivityApi.applyDeltas(params);
}

export function getMemberActivityByMemberIdSingle(memberId: string) {
  return tableGet<MemberActivityRow | null>(
    'member_activity',
    `select=*&member_id=eq.${encodeURIComponent(memberId)}&single=true`,
  );
}

export function postMemberActivity(body: unknown) {
  return tablePost<unknown>('member_activity', body);
}

export function getMemberActivityByPhoneSingle(phoneNumber: string) {
  return tableGet<MemberActivityRow | null>(
    'member_activity',
    `select=*&phone_number=eq.${encodeURIComponent(phoneNumber)}&single=true`,
  );
}

export function getMemberActivityPermanentTotalsSingle(memberId: string) {
  return tableGet<Record<string, number | null | undefined> | null>(
    'member_activity',
    `select=total_accumulated_ngn,total_accumulated_ghs,total_accumulated_usdt,total_gift_ngn,total_gift_ghs,total_gift_usdt,accumulated_profit,accumulated_profit_usdt&member_id=eq.${encodeURIComponent(memberId)}&single=true`,
  );
}
