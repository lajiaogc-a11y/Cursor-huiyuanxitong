/**
 * Member check-in snapshot for portal (computed server-side).
 */
import { parsePortalCheckInNumbers, rewardBreakdownForConsecutiveDay } from '../../lib/checkInRewards.js';
import {
  getMemberTenantId,
  getPortalCheckInRewardSettings,
  getTodayCheckInStreakRow,
  getYesterdayCheckInStreakRow,
} from './repository.js';

export type MemberCheckInDailySnapshot = {
  checked_in_today: boolean;
  current_streak_days: number;
  reward_base: number;
  reward_extra_streak_3: number;
  reward_extra_streak_7: number;
  /** 下一次可签到（今日未签=今日；已签=明日）将处于的第几天 */
  next_sign_in_streak_day: number;
  /** 对应下一次签到的奖励拆分 */
  next_reward_base: number;
  next_reward_extra: number;
  next_reward_total: number;
  next_credits: number;
};

export async function buildMemberCheckInDailySnapshot(memberId: string): Promise<MemberCheckInDailySnapshot> {
  const tid = await getMemberTenantId(memberId);

  let settingsRow = null;
  if (tid) {
    settingsRow = await getPortalCheckInRewardSettings(tid);
  }
  const { base, extra3, extra7 } = parsePortalCheckInNumbers(settingsRow);

  const todayRow = await getTodayCheckInStreakRow(memberId);
  const yesterdayRow = await getYesterdayCheckInStreakRow(memberId);

  const checkedInToday = todayRow != null;
  const yStreak =
    yesterdayRow?.streak != null && !Number.isNaN(Number(yesterdayRow.streak))
      ? Number(yesterdayRow.streak)
      : 0;
  const todayStreak =
    todayRow?.streak != null && !Number.isNaN(Number(todayRow.streak)) ? Number(todayRow.streak) : 0;

  const current_streak_days = checkedInToday ? todayStreak : yStreak;
  const next_sign_in_streak_day = checkedInToday ? todayStreak + 1 : yStreak + 1;

  const br = rewardBreakdownForConsecutiveDay(next_sign_in_streak_day, base, extra3, extra7);

  return {
    checked_in_today: checkedInToday,
    current_streak_days,
    reward_base: base,
    reward_extra_streak_3: extra3,
    reward_extra_streak_7: extra7,
    next_sign_in_streak_day,
    next_reward_base: br.base,
    next_reward_extra: br.extra,
    next_reward_total: br.total,
    next_credits: br.credits,
  };
}
