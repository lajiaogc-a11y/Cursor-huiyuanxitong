/**
 * 会员抽奖页 — 数据加载与抽奖动作（UI 动画、音效留在页面）
 */
import {
  lotteryDraw,
  getLotteryQuota,
  getMyLotteryLogs,
  getMemberLotteryPrizes,
  type LotteryPrize,
  type DrawResult,
  type LotteryLog,
} from "@/services/lottery/lotteryService";

export type { LotteryPrize, DrawResult, LotteryLog };

/** 并行加载奖品与剩余次数（与原先 MemberSpin 一致：单项失败不拖垮另一项） */
export async function loadMemberSpinPrizesAndQuota(memberId: string): Promise<{
  prizes: LotteryPrize[];
  quotaRemaining: number;
  /** 与 remaining 同次接口返回，用于「剩余/今日合计」展示 */
  quotaUsedToday: number;
  probability_notice: string | null;
}> {
  const [prizesRes, quotaRes] = await Promise.allSettled([
    getMemberLotteryPrizes(memberId),
    getLotteryQuota(memberId),
  ]);
  const pack =
    prizesRes.status === "fulfilled"
      ? prizesRes.value
      : {
          prizes: [] as LotteryPrize[],
          probability_notice: null as string | null,
          order_completed_spin_enabled: false,
          order_completed_spin_amount: 0,
        };
  const quota =
    quotaRes.status === "fulfilled" ? quotaRes.value : null;
  const quotaRemaining = quota?.remaining ?? 0;
  const quotaUsedToday = quota?.used_today ?? 0;
  return {
    prizes: pack.prizes,
    quotaRemaining,
    quotaUsedToday,
    probability_notice: pack.probability_notice ?? null,
  };
}

/** 抽奖记录（可由页面在 requestIdleCallback 中调用，保持原懒加载行为） */
const MEMBER_SPIN_LOG_PAGE = 100;

export async function loadMemberSpinLogs(
  memberId: string,
  opts?: { limit?: number; offset?: number },
): Promise<{ logs: LotteryLog[]; total: number }> {
  const limit = opts?.limit ?? MEMBER_SPIN_LOG_PAGE;
  const offset = opts?.offset ?? 0;
  return getMyLotteryLogs(memberId, limit, offset);
}

/**
 * 与 MemberSpin 九宫格一致：展示后台已启用的前 8 个奖品（含真实概率为 0 的项，仅展示；实际中奖仍由服务端按全量启用奖品权重抽取）。
 */
export function pickGridPrizesForSpinPage(raw: LotteryPrize[]): LotteryPrize[] {
  const rows = raw.filter((x) => x.enabled !== false);
  if (rows.length === 0) return [];
  return rows.slice(0, 8);
}

/** 执行抽奖（等同 lotteryDraw） */
export async function executeMemberLotteryDraw(memberId: string): Promise<DrawResult> {
  return lotteryDraw(memberId);
}

export { getLotteryQuota, getMyLotteryLogs, getMemberLotteryPrizes };
