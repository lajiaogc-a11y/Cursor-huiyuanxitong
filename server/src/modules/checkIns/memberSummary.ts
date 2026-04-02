/**
 * 会员端签到展示数据（全部后端计算，前端只展示）
 */
import { queryOne } from '../../database/index.js';
import { parsePortalCheckInNumbers, rewardBreakdownForConsecutiveDay } from '../../lib/checkInRewards.js';

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
  const memberRow = await queryOne<{ tenant_id: string | null }>(
    'SELECT tenant_id FROM members WHERE id = ?',
    [memberId],
  );
  const tid = memberRow?.tenant_id ?? null;

  let settingsRow: {
    checkin_reward_base?: number | string | null;
    checkin_reward_streak_3?: number | string | null;
    checkin_reward_streak_7?: number | string | null;
  } | null = null;
  if (tid) {
    settingsRow = await queryOne(
      `SELECT checkin_reward_base, checkin_reward_streak_3, checkin_reward_streak_7
       FROM member_portal_settings WHERE tenant_id = ? LIMIT 1`,
      [tid],
    );
  }
  const { base, extra3, extra7 } = parsePortalCheckInNumbers(settingsRow);

  const todayRow = await queryOne<{ streak: number | null }>(
    'SELECT streak FROM check_ins WHERE member_id = ? AND check_in_date = CURDATE() LIMIT 1',
    [memberId],
  );
  const yesterdayRow = await queryOne<{ streak: number | null }>(
    'SELECT streak FROM check_ins WHERE member_id = ? AND check_in_date = DATE_SUB(CURDATE(), INTERVAL 1 DAY) LIMIT 1',
    [memberId],
  );

  const checkedInToday = todayRow != null;
  const yStreak =
    yesterdayRow?.streak != null && !Number.isNaN(Number(yesterdayRow.streak))
      ? Number(yesterdayRow.streak)
      : 0;
  const todayStreak =
    todayRow?.streak != null && !Number.isNaN(Number(todayRow.streak)) ? Number(todayRow.streak) : 0;

  /** 会员卡片「连续签到」：已签显示今日 streak；未签显示截至昨日的连续天数 */
  const current_streak_days = checkedInToday ? todayStreak : yStreak;

  /** 下一次点击签到时的连续天数（今日未签）或「明天再签」的连续天数（今日已签） */
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
