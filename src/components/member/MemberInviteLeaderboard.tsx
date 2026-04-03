import { useEffect, useState } from "react";
import { Loader2, Trophy, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { fetchInviteRankingTop5, type InviteRankingEntry } from "@/services/memberPortal/inviteRankingService";
import { useMemberSkeletonGate } from "@/hooks/useMemberSkeletonGate";
import { useMemberPullRefreshSignal } from "@/hooks/useMemberPullRefreshSignal";
import { MemberEmptyStateCta } from "@/components/member/MemberEmptyStateCta";

const MEDAL: Record<number, string> = {
  1: "🥇",
  2: "🥈",
  3: "🥉",
};

const ROW_CLASS: Record<number, string> = {
  1: "member-invite-rank__item--gold",
  2: "member-invite-rank__item--silver",
  3: "member-invite-rank__item--bronze",
};

/**
 * 邀请页排行榜（设计稿对齐：TrendingUp 标题行 + 奖牌 + 昵称 + 邀请人数 +「人」）
 * 数据：GET /api/invite/ranking，真实与系统假用户混排 TOP5
 */
export function MemberInviteLeaderboard({
  t,
}: {
  t: (zh: string, en: string) => string;
}) {
  const [rows, setRows] = useState<InviteRankingEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(false);
  const [retryTick, setRetryTick] = useState(0);
  const [pullTick, setPullTick] = useState(0);
  const showRankLoading = useMemberSkeletonGate(loading);

  useMemberPullRefreshSignal(() => {
    setPullTick((x) => x + 1);
  });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(false);
    const fetchData = () => {
      void fetchInviteRankingTop5()
        .then((r) => {
          if (!cancelled) setRows(r);
        })
        .catch(() => {
          if (!cancelled) setErr(true);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    };
    fetchData();
    const timer = window.setInterval(fetchData, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [retryTick, pullTick]);

  return (
    <section className="member-invite-rank mb-6" aria-labelledby="member-invite-rank-heading">
      <div className="mb-4 flex items-center gap-2">
        <TrendingUp className="h-4 w-4 shrink-0 text-pu-gold-soft" strokeWidth={2.25} aria-hidden />
        <h2 id="member-invite-rank-heading" className="m-0 text-base font-extrabold text-[hsl(var(--pu-m-text))]">
          {t("邀请排行", "Invite leaderboard")}
        </h2>
      </div>
      <p className="mb-4 text-[11px] font-medium leading-relaxed text-[hsl(var(--pu-m-text-dim)/0.88)]">
        {t("按邀请人数排名 · 展示前 5 名", "Top 5 by successful invites")}
      </p>

      <div className="member-invite-rank__panel m-glass relative overflow-hidden rounded-2xl p-4">
        <div className="pointer-events-none absolute inset-0 rounded-[inherit] bg-gradient-to-br from-pu-gold/[0.06] via-transparent to-pu-emerald/[0.04]" />
        <div className="relative">
          {showRankLoading ? (
            <div className="flex flex-col items-center justify-center gap-2 py-10 text-[hsl(var(--pu-m-text-dim)/0.55)]">
              <Loader2 className="h-6 w-6 animate-spin motion-reduce:animate-none" aria-hidden />
              <span className="text-xs font-medium">{t("加载排行榜…", "Loading…")}</span>
            </div>
          ) : err ? (
            <div className="space-y-4 py-8 text-center">
              <p className="text-xs text-rose-400">{t("排行榜加载失败", "Failed to load leaderboard")}</p>
              <button
                type="button"
                className="text-xs font-bold text-pu-gold-soft underline decoration-pu-gold/40 underline-offset-2"
                onClick={() => setRetryTick((x) => x + 1)}
              >
                {t("重试", "Retry")}
              </button>
            </div>
          ) : rows.length === 0 ? (
            <div className="space-y-1 py-8 text-center">
              <p className="text-xs text-[hsl(var(--pu-m-text-dim)/0.65)]">{t("暂无排行数据", "No ranking data yet")}</p>
              <MemberEmptyStateCta
                anchorPrimary={{
                  href: "#member-invite-link-anchor",
                  label: t("去分享邀请链接", "Share your invite link"),
                }}
              />
            </div>
          ) : (
            <ol className="m-0 list-none space-y-2 p-0">
              {rows.map((row, idx) => {
                const rank = idx + 1;
                const medal = MEDAL[rank];
                const accentClass = ROW_CLASS[rank] ?? "";
                return (
                  <li
                    key={`${row.name}-${rank}-${row.invite_count}-${row.is_fake ? "f" : "r"}`}
                    className={cn(
                      "member-invite-rank__item flex items-center gap-3 rounded-xl px-3.5 py-3",
                      accentClass,
                    )}
                  >
                    <span
                      className="flex w-8 shrink-0 justify-center text-base leading-none"
                      aria-label={t(`第 ${rank} 名`, `Rank ${rank}`)}
                    >
                      {medal ?? <span className="text-xs font-extrabold tabular-nums text-[hsl(var(--pu-m-text-dim))]">#{rank}</span>}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="m-0 truncate text-sm font-bold text-[hsl(var(--pu-m-text))]">{row.name}</p>
                    </div>
                    <span className="shrink-0 text-xs font-bold tabular-nums text-[hsl(var(--pu-m-text-dim))]">
                      <span className="text-base font-extrabold text-pu-emerald-soft">{row.invite_count}</span>{" "}
                      <span className="text-[10px] font-semibold">{t("人", "inv.")}</span>
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </div>

      <p className="mt-3 flex items-center justify-center gap-1.5 text-[10px] text-[hsl(var(--pu-m-text-dim)/0.5)]">
        <Trophy className="h-3 w-3 opacity-70" aria-hidden />
        {t("榜单含真实邀请与示例数据，以服务端合并排序为准", "Rankings mix real invites with sample data.")}
      </p>
    </section>
  );
}
