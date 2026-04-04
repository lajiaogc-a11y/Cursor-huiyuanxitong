/**
 * 邀请页 — premium-ui-boost：双列 m-glass 统计条
 * 「已奖励」列改为显示邀请获得的抽奖次数（而非积分）。
 */
import { Sparkles, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMemberAnimatedCount } from "@/hooks/useMemberAnimatedCount";

export interface MemberInviteHeroProps {
  /** 成功邀请注册人数（后端持久累计） */
  invitedSuccessCount: number;
  /** 累计获得抽奖次数（来自 spin_credits 历史记录，不受当前设置变动影响） */
  lifetimeRewardSpins: number;
  statsLoading: boolean;
  t: (zh: string, en: string) => string;
}

export function MemberInviteHero({
  invitedSuccessCount,
  lifetimeRewardSpins,
  statsLoading,
  t,
}: MemberInviteHeroProps) {
  const animInvited = useMemberAnimatedCount(invitedSuccessCount, { enabled: !statsLoading, durationMs: 880 });
  const animSpins = useMemberAnimatedCount(lifetimeRewardSpins, { enabled: !statsLoading, durationMs: 820 });

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
      label: t("已获抽奖", "Spins Earned"),
      value: statsLoading ? "···" : `${Math.round(animSpins).toLocaleString()} ${t("次", "")}`,
      icon: Sparkles,
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
    </section>
  );
}
