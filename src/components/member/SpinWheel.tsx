import { Gift, Sparkles, Star } from "lucide-react";
import { LoadingButton } from "@/components/ui/LoadingButton";
import { cn } from "@/lib/utils";
import type { DrawResult, LotteryPrize } from "@/services/memberPortal/memberLotteryPageService";
import {
  GRID_ORDER,
  SPIN_PRIZE_CELL_FRAME,
  prizeDisplayTier,
  prizeTierBadgeBg,
  prizeTierIconColor,
  spinWheelPrizeMainText,
} from "@/components/member/spinWheelDisplay";

export type SpinWheelPrize = NonNullable<DrawResult["prize"]>;

export type SpinWheelProps = {
  prizes: LotteryPrize[];
  activeIndex: number;
  spinning: boolean;
  remaining: number;
  showResult: boolean;
  result: SpinWheelPrize | null;
  onSpin: () => void;
  t: (zh: string, en: string) => string;
};

export function SpinWheel({
  prizes,
  activeIndex,
  spinning,
  remaining,
  showResult,
  result,
  onSpin,
  t,
}: SpinWheelProps) {
  const prizeCount = prizes.length;

  return (
    <div id="member-spin-wheel" className="scroll-mt-24">
      <div className="relative m-glass overflow-hidden rounded-2xl border border-pu-gold/15 p-4 shadow-sm">
        <div className="pointer-events-none absolute inset-0 rounded-[inherit] bg-gradient-to-br from-pu-gold/[0.04] to-transparent" />
        <div
          className="relative grid aspect-square w-full grid-cols-3 grid-rows-3 gap-2.5"
          role="group"
          aria-label={t("转盘九宫格", "Spin wheel grid")}
        >
          {Array.from({ length: 9 }).map((_, cellIdx) => {
            if (cellIdx === 4) {
              return (
                <LoadingButton
                  key="go-btn"
                  type="button"
                  variant="ghost"
                  loading={spinning}
                  disabled={spinning || remaining <= 0}
                  className={cn(
                    "btn-spin relative !flex !h-full !min-h-0 !w-full !min-w-0 flex-col touch-manipulation items-center justify-center gap-0.5 overflow-hidden rounded-xl border-0 bg-transparent px-1 py-0.5 text-inherit shadow-none outline-none transition-opacity member-motion-fast hover:bg-transparent focus-visible:ring-2 focus-visible:ring-[hsl(var(--pu-gold))] focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--pu-m-surface))] [&_svg]:shrink-0 [&_svg]:text-white",
                    spinning ? "cursor-wait opacity-80" : remaining <= 0 ? "cursor-not-allowed opacity-50" : "cursor-pointer",
                    "motion-reduce:transition-none",
                  )}
                  onClick={() => void onSpin()}
                  aria-busy={spinning}
                  aria-disabled={remaining <= 0}
                  aria-label={
                    spinning
                      ? t("抽奖进行中…", "Spinning…")
                      : remaining <= 0
                        ? t("次数不足", "No draws left")
                        : t("抽奖", "Draw")
                  }
                >
                  {!spinning && (
                    <span className="pointer-events-none absolute inset-0 rounded-[inherit] spin-ring" />
                  )}
                  {!spinning && (
                    <Sparkles size={20} className="shrink-0 text-white drop-shadow-[0_1px_2px_rgb(0_0_0_/_0.25)]" aria-hidden />
                  )}
                  <span className="w-full min-w-0 max-w-full text-center text-[10px] font-extrabold leading-tight text-white [text-shadow:0_1px_2px_rgb(0_0_0_/_0.2)] [overflow-wrap:anywhere] line-clamp-2 sm:text-xs">
                    {spinning ? t("抽奖中", "Spinning") : t("抽奖", "Draw")}
                  </span>
                  <span className="w-full min-w-0 max-w-full text-center text-[9px] font-bold leading-tight text-[hsl(0_0%_100%_/_0.78)] [overflow-wrap:anywhere] line-clamp-2">
                    {t(`剩余 ${remaining} 次`, `${remaining} left`)}
                  </span>
                </LoadingButton>
              );
            }

            const row = Math.floor(cellIdx / 3);
            const col = cellIdx % 3;
            const prizeIdx = GRID_ORDER.findIndex((g) => g.row === row && g.col === col);
            if (prizeIdx < 0 || prizeIdx >= prizeCount) {
              return (
                <div
                  key={cellIdx}
                  className={cn(SPIN_PRIZE_CELL_FRAME, "items-center justify-center rounded-xl")}
                >
                  <Star className="relative z-10 h-4 w-4 text-[hsl(var(--pu-m-text-dim)/0.15)]" aria-hidden />
                </div>
              );
            }
            const prize = prizes[prizeIdx];
            const isActive = activeIndex === prizeIdx;
            const isWinner = showResult && result?.id === prize.id && !spinning;
            const wheelMain = spinWheelPrizeMainText(t, prize);
            const tier = prizeDisplayTier(prize);

            const highlightClass = isActive
              ? "ring-2 ring-pu-gold scale-[1.03] shadow-pu-glow-gold"
              : isWinner
                ? "ring-2 ring-pu-gold scale-[1.05] shadow-pu-glow-gold"
                : "motion-safe:hover:scale-[1.01]";

            return (
              <div
                key={cellIdx}
                className={cn(
                  SPIN_PRIZE_CELL_FRAME,
                  "flex flex-col items-center justify-center gap-0.5 rounded-xl p-1.5 member-transition-surface member-motion-fast motion-reduce:transition-none",
                  highlightClass,
                )}
              >
                <div className="pointer-events-none absolute inset-0 rounded-[inherit] bg-gradient-to-br from-pu-gold/[0.04] to-transparent" />
                {isActive && (
                  <div className="pointer-events-none absolute inset-0 rounded-[inherit] bg-gradient-to-br from-pu-gold/[0.12] to-transparent" />
                )}
                {isWinner && (
                  <div className="pointer-events-none absolute inset-0 animate-pulse rounded-[inherit] bg-gradient-to-br from-pu-gold/[0.15] to-pu-rose/[0.05] motion-reduce:animate-none" />
                )}
                <div
                  className={cn(
                    "relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset",
                    prizeTierBadgeBg(tier),
                  )}
                >
                  {prize.type === "points" ? (
                    <Star className={cn("h-3 w-3", prizeTierIconColor(tier))} strokeWidth={2} aria-hidden />
                  ) : prize.type === "none" ? (
                    <Sparkles className={cn("h-3 w-3", prizeTierIconColor(tier))} strokeWidth={2} aria-hidden />
                  ) : (
                    <Gift className={cn("h-3 w-3", prizeTierIconColor(tier))} strokeWidth={2} aria-hidden />
                  )}
                </div>
                <span
                  className={cn(
                    "relative z-10 line-clamp-2 w-full max-w-full px-0.5 text-center text-[10px] font-bold leading-tight tabular-nums",
                    isActive ? "text-pu-gold-soft" : "text-[hsl(var(--pu-m-text)/0.85)]",
                  )}
                >
                  {wheelMain}
                </span>
              </div>
            );
          })}
        </div>

        {remaining > 0 && !spinning && (
          <p className="relative mt-2.5 text-center text-[11px] leading-relaxed text-[hsl(var(--pu-m-text-dim)/0.65)]">
            {t("再试一次，更大惊喜等你！", "Try again for a bigger reward!")}
          </p>
        )}
        {remaining <= 0 && !spinning && (
          <p className="relative mt-2.5 text-center text-[11px] leading-relaxed text-[hsl(var(--pu-m-text-dim)/0.5)]">
            {t("签到、邀请或分享可获取更多次数", "Check in, invite friends or share to earn more spins")}
          </p>
        )}
      </div>
    </div>
  );
}
