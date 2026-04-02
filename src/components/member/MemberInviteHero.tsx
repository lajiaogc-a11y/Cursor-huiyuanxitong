/**
 * 邀请页 — premium-ui-boost：双列 m-glass 统计条（礼遇商城 / 赚积分 CTA 已按产品要求移除）
 */
import { Gift, Lock, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMemberAnimatedCount } from "@/hooks/useMemberAnimatedCount";

export interface MemberInviteHeroProps {
  /** 可用积分（仅用于冻结提示里的「含冻结共」合计） */
  availablePoints: number;
  frozenPoints: number;
  /** 成功邀请注册人数（后端持久累计） */
  invitedSuccessCount: number;
  /** 累计获得积分奖励（后端持久累计） */
  lifetimeRewardPoints: number;
  statsLoading: boolean;
  t: (zh: string, en: string) => string;
}

export function MemberInviteHero({
  availablePoints,
  frozenPoints,
  invitedSuccessCount,
  lifetimeRewardPoints,
  statsLoading,
  t,
}: MemberInviteHeroProps) {
  const hasFrozen = frozenPoints > 0;
  const totalPts = availablePoints + frozenPoints;

  const animInvited = useMemberAnimatedCount(invitedSuccessCount, { enabled: !statsLoading, durationMs: 880 });
  const animRewarded = useMemberAnimatedCount(lifetimeRewardPoints, { enabled: !statsLoading, durationMs: 820 });
  const fmtPts = (n: number) =>
    Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });

  const stats: {
    label: string;
    value: string;
    icon: typeof Users;
    accent: "gold" | "emerald";
  }[] = [
    {
      label: t("已邀请", "Invited"),
      value: statsLoading ? "···" : Math.round(animInvited).toLocaleString(),
      icon: Users,
      accent: "gold",
    },
    {
      label: t("已奖励", "Rewarded"),
      value: statsLoading ? "···" : fmtPts(animRewarded),
      icon: Gift,
      accent: "emerald",
    },
  ];

  return (
    <section className="relative z-[1] px-4 pb-2 sm:px-5" aria-label={t("邀请中心", "Invite hub")}>
      <div className="grid grid-cols-2 gap-2.5">
        {stats.map((s) => (
          <div
            key={s.label}
            className="m-glass relative overflow-hidden rounded-2xl p-3.5 text-center"
          >
            <div
              className={cn(
                "pointer-events-none absolute inset-0 rounded-[inherit]",
                s.accent === "gold" && "bg-gradient-to-br from-pu-gold/[0.08] to-transparent",
                s.accent === "emerald" && "bg-gradient-to-br from-pu-emerald/[0.08] to-transparent",
              )}
            />
            <div className="relative">
              <s.icon
                className={cn(
                  "mx-auto mb-2 h-4 w-4",
                  s.accent === "gold" && "text-pu-gold-soft",
                  s.accent === "emerald" && "text-pu-emerald-soft",
                )}
                aria-hidden
              />
              <div className="mb-0.5 text-xl font-extrabold tabular-nums text-[hsl(var(--pu-m-text))]">
                {s.value}
              </div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-[hsl(var(--pu-m-text-dim))]">
                {s.label}
              </div>
            </div>
          </div>
        ))}
      </div>

      {hasFrozen ? (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-pu-rose/25 bg-pu-rose/10 px-3 py-2.5">
          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-pu-rose-soft" aria-hidden />
          <p className="m-0 text-[11px] font-semibold leading-relaxed text-[hsl(var(--pu-m-text)/0.92)]">
            {t(
              `冻结 ${frozenPoints.toLocaleString()} 积分审核中；含冻结共 ${totalPts.toLocaleString()} 分。`,
              `${frozenPoints.toLocaleString()} pts frozen pending review; ${totalPts.toLocaleString()} total including frozen.`,
            )}
          </p>
        </div>
      ) : null}
    </section>
  );
}
