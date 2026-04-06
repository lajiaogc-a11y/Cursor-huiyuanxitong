import { Gift } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { DrawResult, LotteryPrize } from "@/services/memberPortal/memberLotteryPageService";
import { SpinWheel } from "@/components/member/SpinWheel";

export type MemberSpinLotteryProps = {
  /** 配额/奖品首包加载中 */
  loading: boolean;
  /** 为 true 时转盘区垂直居中，展示与原先「整页占位」一致的全屏块 */
  blocking: boolean;
  lotteryEnabled: boolean;
  loadError: boolean;
  prizes: LotteryPrize[];
  activeIndex: number;
  spinning: boolean;
  remaining: number;
  showResult: boolean;
  result: DrawResult["prize"] | null;
  onSpin: () => void;
  t: (zh: string, en: string) => string;
};

function LotteryWheelPlaceholder() {
  return (
    <div className="relative m-glass overflow-hidden rounded-2xl border border-pu-gold/15 p-4 shadow-sm" aria-hidden>
      <div className="pointer-events-none absolute inset-0 rounded-[inherit] bg-gradient-to-br from-pu-gold/[0.04] to-transparent" />
      <div className="aspect-square w-full animate-pulse rounded-xl bg-[hsl(var(--pu-m-surface)/0.32)] motion-reduce:animate-none" />
    </div>
  );
}

/**
 * 抽奖转盘区：始终在 DOM 中；loading 时用占位 + opacity，就绪后渐显真实内容。
 * 关闭活动/未配置/加载失败等状态在组件内分支渲染，页面层不再提前 return 整块替换。
 */
export function Lottery({
  loading,
  blocking,
  lotteryEnabled,
  loadError,
  prizes,
  activeIndex,
  spinning,
  remaining,
  showResult,
  result,
  onSpin,
  t,
}: MemberSpinLotteryProps) {
  const showWheel = lotteryEnabled && prizes.length > 0;
  const showDisabled = !loading && !lotteryEnabled;
  const showError = !loading && lotteryEnabled && prizes.length === 0 && loadError;
  const showEmpty = !loading && lotteryEnabled && prizes.length === 0 && !loadError;
  /** 转盘始终在 DOM 中；不可展示时叠在下方并透明，避免延迟挂载导致闪现 */
  const wheelLayerClass = cn(
    "transition-opacity duration-300 ease-out",
    !showWheel && "pointer-events-none absolute inset-x-0 top-0 opacity-0",
  );

  return (
    <div
      className={cn(
        "relative w-full max-w-md lg:max-w-lg",
        blocking && "flex min-h-[min(72dvh,520px)] flex-1 flex-col justify-center",
      )}
    >
      {/* 加载层：与内容层叠，opacity 切换 */}
      <div
        className={cn("transition-opacity duration-300 ease-out", !loading && "pointer-events-none absolute inset-x-0 top-0 z-[1] opacity-0")}
        style={{ opacity: loading ? 1 : 0 }}
        aria-hidden={!loading}
      >
        <LotteryWheelPlaceholder />
      </div>

      <div
        className={cn("relative z-0 transition-opacity duration-300 ease-out", loading && "pointer-events-none")}
        style={{ opacity: loading ? 0 : 1 }}
      >
        {showDisabled ? (
          <div className="relative overflow-hidden rounded-2xl border border-dashed border-pu-gold/22 bg-gradient-to-b from-pu-gold/[0.08] via-[hsl(var(--pu-m-surface)/0.22)] to-[hsl(var(--pu-m-surface)/0.28)] px-5 py-12 text-center">
            <div className="relative">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-pu-gold/20 bg-pu-gold/10 text-pu-gold-soft opacity-60">
                <Gift className="h-7 w-7" strokeWidth={1.75} aria-hidden />
              </div>
              <p className="m-0 text-sm font-semibold text-[hsl(var(--pu-m-text))]">
                {t("抽奖活动暂未开启", "Lottery is not open")}
              </p>
              <p className="mt-1.5 text-[11px] leading-relaxed text-[hsl(var(--pu-m-text-dim)/0.65)]">
                {t("活动开启后即可参与抽奖，请稍后再来。", "The lottery will be available once the event starts. Please check back later.")}
              </p>
            </div>
          </div>
        ) : null}

        {showError ? (
          <div className="relative overflow-hidden rounded-2xl border border-dashed border-pu-gold/22 bg-gradient-to-b from-pu-gold/[0.08] via-[hsl(var(--pu-m-surface)/0.22)] to-[hsl(var(--pu-m-surface)/0.28)] px-5 py-12 text-center">
            <div className="relative">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-pu-gold/20 bg-pu-gold/10 text-pu-gold-soft">
                <Gift className="h-7 w-7" strokeWidth={1.75} aria-hidden />
              </div>
              <p className="m-0 text-sm font-semibold text-[hsl(var(--pu-m-text))]">{t("抽奖加载失败", "Failed to load lottery")}</p>
              <p className="mt-1.5 text-[11px] leading-relaxed text-[hsl(var(--pu-m-text-dim)/0.65)]">
                {t("点击重试或稍后再打开本页。", "Tap retry or open this page again later.")}
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="mt-4 rounded-xl border-[hsl(var(--pu-m-surface-border)/0.35)] bg-[hsl(var(--pu-m-surface)/0.45)] text-[hsl(var(--pu-m-text))] hover:bg-[hsl(var(--pu-m-surface)/0.6)]"
                onClick={() => window.location.reload()}
              >
                {t("重试", "Retry")}
              </Button>
            </div>
          </div>
        ) : null}

        {showEmpty ? (
          <div className="relative overflow-hidden rounded-2xl border border-dashed border-pu-gold/22 bg-gradient-to-b from-pu-gold/[0.08] via-[hsl(var(--pu-m-surface)/0.22)] to-[hsl(var(--pu-m-surface)/0.28)] px-5 py-12 text-center">
            <div className="relative">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-pu-gold/20 bg-pu-gold/10 text-pu-gold-soft">
                <Gift className="h-7 w-7" strokeWidth={1.75} aria-hidden />
              </div>
              <p className="m-0 text-sm font-semibold text-[hsl(var(--pu-m-text))]">{t("尚未配置抽奖活动", "Lottery is not configured yet")}</p>
              <p className="mt-1.5 text-[11px] leading-relaxed text-[hsl(var(--pu-m-text-dim)/0.65)]">
                {t("开启活动并配置奖品后即可抽奖。", "Enable the activity and add prizes to spin.")}
              </p>
            </div>
          </div>
        ) : null}

        <div className={wheelLayerClass} aria-hidden={!showWheel}>
          <SpinWheel
            prizes={prizes}
            activeIndex={activeIndex}
            spinning={spinning}
            remaining={remaining}
            showResult={showResult}
            result={result}
            onSpin={onSpin}
            t={t}
          />
        </div>
      </div>
    </div>
  );
}
