import { Link } from "react-router-dom";
import { Info } from "lucide-react";
import { ROUTES } from "@/routes/constants";
import { MemberPointsValueSkeleton } from "@/components/member/MemberPageLoadingShell";

export interface MemberDashboardPointsStatGridProps {
  t: (zh: string, en: string) => string;
  fmtPts: (n: number) => string;
  showPointsSkeleton: boolean;
  showTodayEarnedSkeleton: boolean;
  pointsError: unknown;
  animDashTotal: number;
  animDashAvail: number;
  animDashFrozen: number;
  animDashToday: number;
  onOpenPointsInfo: () => void;
}

export function MemberDashboardPointsStatGrid({
  t,
  fmtPts,
  showPointsSkeleton,
  showTodayEarnedSkeleton,
  pointsError,
  animDashTotal,
  animDashAvail,
  animDashFrozen,
  animDashToday,
  onOpenPointsInfo,
}: MemberDashboardPointsStatGridProps) {
  return (
    <div className="mb-4 grid grid-cols-2 gap-2.5">
      <Link to={ROUTES.MEMBER.POINTS} className="m-glass relative block overflow-hidden p-4 text-center no-underline">
        <div className="pointer-events-none absolute inset-0 rounded-[inherit] bg-gradient-to-br from-pu-gold/[0.06] to-pu-gold/[0.02]" />
        <div className="relative">
          <div className="mb-2 text-[11px] font-bold tracking-wide text-[hsl(var(--pu-m-text-dim))]">
            {t("总积分", "Total points")}
          </div>
          <div className="flex min-h-[2rem] items-center justify-center text-2xl font-extrabold tabular-nums text-[hsl(var(--pu-m-text))]">
            {showPointsSkeleton ? <MemberPointsValueSkeleton /> : pointsError ? "—" : fmtPts(animDashTotal)}
          </div>
        </div>
      </Link>
      <button type="button" onClick={onOpenPointsInfo} className="m-glass relative overflow-hidden p-4 text-center">
        <div className="pointer-events-none absolute inset-0 rounded-[inherit] bg-gradient-to-br from-pu-emerald/[0.06] to-pu-emerald/[0.02]" />
        <div className="relative">
          <div className="mb-2 flex items-center justify-center gap-1 text-[11px] font-bold tracking-wide text-[hsl(var(--pu-m-text-dim))]">
            <span>{t("可用积分", "Available points")}</span>
            <Info className="h-3 w-3 opacity-50" strokeWidth={2.25} aria-hidden />
          </div>
          <div className="flex min-h-[2rem] items-center justify-center text-2xl font-extrabold tabular-nums text-pu-gold">
            {showPointsSkeleton ? <MemberPointsValueSkeleton /> : pointsError ? "—" : fmtPts(animDashAvail)}
          </div>
        </div>
      </button>
      <div className="m-glass relative overflow-hidden p-4 text-center">
        <div className="pointer-events-none absolute inset-0 rounded-[inherit] bg-gradient-to-br from-pu-rose/[0.06] to-pu-rose/[0.02]" />
        <div className="relative">
          <div className="mb-2 text-[11px] font-bold tracking-wide text-[hsl(var(--pu-m-text-dim))]">
            {t("冻结积分", "Frozen points")}
          </div>
          <div className="flex min-h-[2rem] items-center justify-center text-2xl font-extrabold tabular-nums text-pu-rose-soft">
            {showPointsSkeleton ? <MemberPointsValueSkeleton /> : pointsError ? "—" : fmtPts(animDashFrozen)}
          </div>
        </div>
      </div>
      <div className="m-glass relative overflow-hidden p-4 text-center">
        <div className="pointer-events-none absolute inset-0 rounded-[inherit] bg-gradient-to-br from-pu-emerald/[0.06] to-pu-emerald/[0.02]" />
        <div className="relative">
          <div className="mb-2 text-[11px] font-bold tracking-wide text-[hsl(var(--pu-m-text-dim))]">
            {t("今日获得", "Earned today")}
          </div>
          <div className="flex min-h-[2rem] items-center justify-center text-2xl font-extrabold tabular-nums text-pu-emerald">
            {showTodayEarnedSkeleton ? <MemberPointsValueSkeleton /> : fmtPts(animDashToday)}
          </div>
        </div>
      </div>
    </div>
  );
}
