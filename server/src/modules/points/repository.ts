/**
 * Points Repository - 唯一可操作 points 相关表的层
 */
import { supabaseAdmin } from '../../database/index.js';

export async function getMemberPointsRepository(memberId: string) {
  const { data, error } = await supabaseAdmin.rpc('member_get_points', {
    p_member_id: memberId,
  });
  if (error) throw error;
  return data;
}

export async function getMemberPointsBreakdownRepository(memberId: string) {
  const { data, error } = await supabaseAdmin.rpc('member_get_points_breakdown', {
    p_member_id: memberId,
  });
  if (error) throw error;
  return data;
}

export async function getMemberSpinQuotaRepository(memberId: string) {
  const { data, error } = await supabaseAdmin.rpc('member_get_spin_quota', {
    p_member_id: memberId,
  });
  if (error) throw error;
  return data;
}
