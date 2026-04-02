/**
 * 签到奖励：基础次数 + 连续满 3 天 / 满 7 天额外次数（与后台「任务与奖励」配置一致）
 * 满 7 天时只加 7 日档额外，不与 3 日档叠加。
 * 实发次数 credits = ceil(base + extra)，与 member_check_in / buildMemberCheckInDailySnapshot 同源。
 */

export type CheckInRewardBreakdown = {
  base: number;
  extra: number;
  total: number;
  credits: number;
};

export function parsePortalCheckInNumbers(row: {
  checkin_reward_base?: number | string | null;
  checkin_reward_streak_3?: number | string | null;
  checkin_reward_streak_7?: number | string | null;
} | null): { base: number; extra3: number; extra7: number } {
  const n = (v: unknown, d: number) => {
    if (v == null || v === '') return d;
    const x = Number(v);
    return Number.isFinite(x) ? x : d;
  };
  return {
    base: n(row?.checkin_reward_base, 1),
    extra3: n(row?.checkin_reward_streak_3, 1.5),
    extra7: n(row?.checkin_reward_streak_7, 2),
  };
}

/** consecutive = 签到「当天」所处的连续第几天（含当天），>=7 只加 extra7，否则 >=3 加 extra3 */
export function rewardBreakdownForConsecutiveDay(
  consecutive: number,
  base: number,
  extra3: number,
  extra7: number,
): CheckInRewardBreakdown {
  const c = Math.max(1, Math.floor(consecutive));
  let extra = 0;
  if (c >= 7) extra = extra7;
  else if (c >= 3) extra = extra3;
  const total = base + extra;
  const credits = Math.max(0, Math.ceil(Number(total)));
  return { base, extra, total, credits };
}
