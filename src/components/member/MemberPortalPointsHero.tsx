import { Lock } from "lucide-react";
import { useMemberAnimatedCount } from "@/hooks/useMemberAnimatedCount";
import { MemberPointsValueSkeleton } from "@/components/member/MemberPageLoadingShell";
import { cn } from "@/lib/utils";

export interface MemberPortalPointsHeroProps {
  points: number;
  frozenPoints: number;
  loading: boolean;
  todayEarned: number;
  todayEarnedLoading: boolean;
  t: (zh: string, en: string) => string;
}

/**
 * premium-ui-boost MemberPoints — 四格 m-glass 积分卡 + 主操作
 */
export function MemberPortalPointsHero({
  points,
  frozenPoints,
  loading,
  todayEarned,
  todayEarnedLoading,
  t,
}: MemberPortalPointsHeroProps) {
  const hasFrozen = frozenPoints > 0;
  const totalPts = points + frozenPoints;

  const tilesAnimOn = !loading;
  const animTotal = useMemberAnimatedCount(totalPts, { enabled: tilesAnimOn, durationMs: 780 });
  const animAvail = useMemberAnimatedCount(points, { enabled: tilesAnimOn, durationMs: 880 });
  const animFrozen = useMemberAnimatedCount(frozenPoints, { enabled: tilesAnimOn, durationMs: 980 });
  const animToday = useMemberAnimatedCount(todayEarned, { enabled: !todayEarnedLoading, durationMs: 820 });
  const fmtBlock = (n: number) =>
    Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });

  const blocks = [
    {
      label: t("总积分", "Total"),
      showSkeleton: loading,
      value: fmtBlock(animTotal),
      color: "text-[hsl(var(--pu-m-text))]",
      accent: "from-pu-gold/[0.06] to-pu-gold/[0.02]",
    },
    {
      label: t("可用积分", "Available"),
      showSkeleton: loading,
      value: fmtBlock(animAvail),
      color: "text-pu-gold",
      accent: "from-pu-emerald/[0.06] to-pu-emerald/[0.02]",
    },
    {
      label: t("冻结积分", "Frozen"),
      showSkeleton: loading,
      value: fmtBlock(animFrozen),
      color: "text-pu-rose-soft",
      accent: "from-pu-rose/[0.06] to-pu-rose/[0.02]",
    },
    {
      label: t("今日获得", "Today"),
      showSkeleton: todayEarnedLoading,
      value: `+${fmtBlock(animToday)}`,
      color: "text-pu-emerald",
      accent: "from-pu-emerald/[0.06] to-pu-emerald/[0.02]",
    },
  ];

  return (
    <div className="px-5 pb-2">
      <div className="mb-4">
        <div className="grid grid-cols-2 gap-2.5">
          {blocks.map((item) => (
            <div key={item.label} className="m-glass relative overflow-hidden p-4 text-center">
              <div
                className={`pointer-events-none absolute inset-0 rounded-[inherit] bg-gradient-to-br ${item.accent}`}
              />
              <div className="relative">
                <div className="mb-2 text-[11px] font-bold tracking-wide text-[hsl(var(--pu-m-text-dim))]">
                  {item.label}
                </div>
                <div
                  className={cn(
                    "flex min-h-[2rem] items-center justify-center text-2xl font-extrabold tabular-nums",
                    item.color,
                  )}
                >
                  {item.showSkeleton ? <MemberPointsValueSkeleton /> : item.value}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {hasFrozen ? (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-pu-rose/25 bg-pu-rose/10 px-3 py-2.5">
          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-pu-rose-soft" aria-hidden />
          <p className="m-0 text-[11px] font-semibold leading-relaxed text-[hsl(var(--pu-m-text)/0.92)]">
            {t(
              `冻结 ${frozenPoints.toLocaleString()} 积分审核中；含冻结共 ${totalPts.toLocaleString()} 分。审核完成前无法兑换。`,
              `${frozenPoints.toLocaleString()} pts frozen pending review; ${totalPts.toLocaleString()} total including frozen. Redemption unavailable until review completes.`,
            )}
          </p>
        </div>
      ) : null}
    </div>
  );
}
