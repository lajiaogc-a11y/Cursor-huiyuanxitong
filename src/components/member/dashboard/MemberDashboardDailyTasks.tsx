import { Link, useNavigate } from "react-router-dom";
import { CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LoadingButton } from "@/components/ui/LoadingButton";
import { ROUTES } from "@/routes/constants";
import { stashPointsHashBeforeInviteNavigation } from "@/lib/memberPortalInviteReturn";
import type { MemberDailyStatus } from "@/services/memberPortal/memberActivityService";

export interface MemberDashboardDailyTasksProps {
  t: (zh: string, en: string) => string;
  showCheckIn: boolean;
  showShare: boolean;
  showInvite: boolean;
  dailyTaskRowsDone: number;
  dailyTaskRowsTotal: number;
  checkedInToday: boolean;
  checkingIn: boolean;
  checkInSummary: MemberDailyStatus | null;
  showCheckInSublineSkeleton: boolean;
  handleCheckIn: () => void | Promise<void>;
  shareCapReached: boolean;
  shareCreditsToday: number;
  dailyShareCap: number;
  shareRewardSpins: number;
  sharing: boolean;
  claimingShare: boolean;
  pendingShareNonce: boolean;
  handleShare: () => void | Promise<void>;
  handleClaimShareReward: () => void | Promise<void>;
  inviteRewardSpins: number;
  dailyInviteRewardLimit: number;
  inviteSuccessLifetimeCount: number;
}

const taskRowBase =
  "rounded-xl p-4 flex items-center justify-between member-transition-surface member-motion-fast gap-3";
const taskRowDone = "bg-pu-emerald/[0.07] border border-pu-emerald/10 ring-1 ring-inset ring-pu-emerald/10";
const taskRowTodo = "bg-[hsl(var(--pu-m-surface)/0.4)] border border-[hsl(var(--pu-m-surface-border)/0.3)]";

export function MemberDashboardDailyTasks({
  t,
  showCheckIn,
  showShare,
  showInvite,
  dailyTaskRowsDone,
  dailyTaskRowsTotal,
  checkedInToday,
  checkingIn,
  checkInSummary,
  showCheckInSublineSkeleton,
  handleCheckIn,
  shareCapReached,
  shareCreditsToday,
  dailyShareCap,
  shareRewardSpins,
  sharing,
  claimingShare,
  pendingShareNonce,
  handleShare,
  handleClaimShareReward,
  inviteRewardSpins,
  dailyInviteRewardLimit,
  inviteSuccessLifetimeCount,
}: MemberDashboardDailyTasksProps) {
  const navigate = useNavigate();

  return (
    <div className="w-full">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-base font-extrabold text-[hsl(var(--pu-m-text))]">{t("每日任务", "Daily tasks")}</h3>
        <span className="text-[11px] font-bold text-[hsl(var(--pu-m-text-dim))]">
          {dailyTaskRowsDone}/{dailyTaskRowsTotal} {t("已完成", "done")}
        </span>
      </div>
      <div className="space-y-2.5">
        {showCheckIn ? (
          <div className={`${taskRowBase} ${checkedInToday ? taskRowDone : taskRowTodo}`}>
            <div className="flex min-w-0 items-center gap-3">
              <span className="text-lg shrink-0" aria-hidden>
                ✅
              </span>
              <div className="min-w-0">
                <div
                  className={`text-sm font-bold ${checkedInToday ? "text-pu-emerald-soft" : "text-[hsl(var(--pu-m-text))]"}`}
                >
                  {t("每日签到", "Daily check-in")}
                </div>
                <div className="text-[11px] font-medium text-[hsl(var(--pu-m-text-dim))]">
                  {showCheckInSublineSkeleton ? (
                    <span className="inline-flex items-center gap-2" role="status" aria-label={t("加载中…", "Loading…")}>
                      <span className="sr-only">{t("加载中…", "Loading…")}</span>
                      <span
                        className="inline-block h-3 w-[8.5rem] max-w-[70vw] animate-pulse rounded-md bg-[hsl(var(--pu-m-surface)/0.38)] motion-reduce:animate-none"
                        aria-hidden
                      />
                    </span>
                  ) : checkedInToday ? (
                    t(
                      `已连续 ${checkInSummary?.current_streak_days ?? 0} 天 · 明日 +${checkInSummary?.next_credits ?? 0} 次转盘`,
                      `${checkInSummary?.current_streak_days ?? 0} day streak · tomorrow +${checkInSummary?.next_credits ?? 0} spins`,
                    )
                  ) : (
                    t(
                      `第 ${checkInSummary?.next_sign_in_streak_day ?? 1} 天 · ${checkInSummary?.next_credits ?? 0} 次转盘`,
                      `Day ${checkInSummary?.next_sign_in_streak_day ?? 1} · ${checkInSummary?.next_credits ?? 0} spins`,
                    )
                  )}
                </div>
              </div>
            </div>
            {checkedInToday ? (
              <CheckCircle className="h-5 w-5 shrink-0 text-pu-emerald" aria-hidden />
            ) : (
              <LoadingButton
                type="button"
                loading={checkingIn}
                className="btn-mint shrink-0 rounded-xl border-0 px-4 py-1.5 text-xs active:scale-95"
                onClick={() => void handleCheckIn()}
              >
                {t("去完成", "Go")}
              </LoadingButton>
            )}
          </div>
        ) : null}

        {showShare ? (
          <div className={`${taskRowBase} ${shareCapReached ? taskRowDone : taskRowTodo}`}>
            <div className="flex min-w-0 items-center gap-3">
              <span className="text-lg shrink-0" aria-hidden>
                📤
              </span>
              <div className="min-w-0">
                <div
                  className={`text-sm font-bold ${shareCapReached ? "text-pu-emerald-soft" : "text-[hsl(var(--pu-m-text))]"}`}
                >
                  {t("分享好友", "Share with friends")}
                </div>
                <div className="text-[11px] font-medium text-[hsl(var(--pu-m-text-dim))]">
                  +{shareRewardSpins} {t("次转盘", "spins")}
                  {dailyShareCap > 0 ? (
                    <>
                      {" "}
                      ·{" "}
                      <span className={shareCapReached ? "text-pu-emerald-soft" : ""}>
                        {t("已分享", "Shared")} {shareCreditsToday}/{dailyShareCap}
                      </span>
                    </>
                  ) : shareCreditsToday > 0 ? (
                    <>
                      {" "}
                      · {t("今日已分享", "Shared today")} {shareCreditsToday}
                    </>
                  ) : null}
                </div>
              </div>
            </div>
            {shareCapReached ? (
              <CheckCircle className="h-5 w-5 shrink-0 text-pu-emerald" aria-hidden />
            ) : pendingShareNonce ? (
              <LoadingButton
                type="button"
                loading={claimingShare}
                className="shrink-0 rounded-xl border-0 bg-[hsl(var(--pu-amber,45_90%_55%))] px-4 py-1.5 text-xs font-bold text-[hsl(var(--pu-m-bg-1))] shadow-[0_4px_14px_-4px_hsl(var(--pu-amber,45_90%_55%)/0.45)] member-transition-surface member-motion-fast hover:opacity-90 active:scale-95 disabled:opacity-60"
                onClick={() => void handleClaimShareReward()}
              >
                {t("领取奖励", "Claim reward")}
              </LoadingButton>
            ) : (
              <LoadingButton
                type="button"
                loading={sharing}
                className="shrink-0 rounded-xl border-0 bg-[hsl(var(--pu-emerald))] px-4 py-1.5 text-xs font-bold text-[hsl(var(--pu-m-bg-1))] shadow-[0_4px_14px_-4px_hsl(var(--pu-emerald)/0.45)] member-transition-surface member-motion-fast hover:bg-[hsl(var(--pu-emerald-soft))] hover:shadow-[0_6px_18px_-4px_hsl(var(--pu-emerald)/0.4)] active:scale-95 disabled:opacity-60"
                onClick={() => void handleShare()}
              >
                {t("去分享", "Share")}
              </LoadingButton>
            )}
          </div>
        ) : null}

        {showInvite ? (
          <div className={`${taskRowBase} ${taskRowTodo}`}>
            <div className="flex min-w-0 items-center gap-3">
              <span className="text-lg shrink-0" aria-hidden>
                👥
              </span>
              <div className="min-w-0">
                <div className="text-sm font-bold text-[hsl(var(--pu-m-text))]">{t("邀请好友", "Invite friends")}</div>
                <div className="text-[11px] font-medium text-[hsl(var(--pu-m-text-dim))]">
                  {t("双方各得", "Both earn")} +{inviteRewardSpins} {t("次转盘", "spins")}
                  {dailyInviteRewardLimit > 0 ? ` · ${t("每日上限", "daily cap")} ${dailyInviteRewardLimit}` : ""}
                  {inviteSuccessLifetimeCount > 0 && (
                    <>
                      {" "}
                      · <span className="text-pu-emerald-soft">{t("已邀请", "Invited")} +{inviteSuccessLifetimeCount}</span>
                    </>
                  )}
                </div>
              </div>
            </div>
            <Button
              asChild
              className="h-auto shrink-0 rounded-xl border border-[hsl(var(--pu-m-surface-border)/0.38)] bg-[hsl(var(--pu-m-surface)/0.55)] px-4 py-1.5 text-xs font-semibold text-[hsl(var(--pu-m-text))] shadow-none member-transition-surface member-motion-fast hover:bg-[hsl(var(--pu-m-surface)/0.72)] active:scale-95"
            >
              <Link
                to={ROUTES.MEMBER.INVITE}
                onClick={() => stashPointsHashBeforeInviteNavigation(window.location.pathname, window.location.hash)}
              >
                {t("去完成", "Go")}
              </Link>
            </Button>
          </div>
        ) : null}

        <div className={`${taskRowBase} ${taskRowTodo}`}>
          <div className="flex min-w-0 items-center gap-3">
            <span className="text-lg shrink-0" aria-hidden>
              🛒
            </span>
            <div className="min-w-0">
              <div className="text-sm font-bold text-[hsl(var(--pu-m-text))]">{t("完成一笔订单", "Complete an order")}</div>
              <div className="text-[11px] font-medium text-[hsl(var(--pu-m-text-dim))]">
                {t("联系客服完成首笔交易", "Contact support to complete your first trade")}
              </div>
            </div>
          </div>
          <button
            type="button"
            className="btn-glow shrink-0 rounded-xl px-4 py-1.5 text-xs member-transition-surface member-motion-fast active:scale-95"
            style={{
              background: "linear-gradient(135deg, hsl(var(--pu-gold)), hsl(var(--pu-gold-soft)))",
            }}
            onClick={() => navigate(ROUTES.MEMBER.TRADE_CONTACT)}
          >
            {t("去完成", "Go")}
          </button>
        </div>
      </div>
    </div>
  );
}
