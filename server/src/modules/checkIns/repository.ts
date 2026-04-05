/**
 * Check-ins — data access for member portal snapshot.
 */
import { queryOne } from '../../database/index.js';

export async function getMemberTenantId(memberId: string): Promise<string | null> {
  const memberRow = await queryOne<{ tenant_id: string | null }>(
    'SELECT tenant_id FROM members WHERE id = ?',
    [memberId],
  );
  return memberRow?.tenant_id ?? null;
}

export type PortalCheckInRewardColumns = {
  checkin_reward_base?: number | string | null;
  checkin_reward_streak_3?: number | string | null;
  checkin_reward_streak_7?: number | string | null;
} | null;

export async function getPortalCheckInRewardSettings(tenantId: string): Promise<PortalCheckInRewardColumns> {
  return queryOne(
    `SELECT checkin_reward_base, checkin_reward_streak_3, checkin_reward_streak_7
     FROM member_portal_settings WHERE tenant_id = ? LIMIT 1`,
    [tenantId],
  );
}

export async function getTodayCheckInStreakRow(memberId: string): Promise<{ streak: number | null } | null> {
  return queryOne<{ streak: number | null }>(
    'SELECT streak FROM check_ins WHERE member_id = ? AND check_in_date = CURDATE() LIMIT 1',
    [memberId],
  );
}

export async function getYesterdayCheckInStreakRow(memberId: string): Promise<{ streak: number | null } | null> {
  return queryOne<{ streak: number | null }>(
    'SELECT streak FROM check_ins WHERE member_id = ? AND check_in_date = DATE_SUB(CURDATE(), INTERVAL 1 DAY) LIMIT 1',
    [memberId],
  );
}
