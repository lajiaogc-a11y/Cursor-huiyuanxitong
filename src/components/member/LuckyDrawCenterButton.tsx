import { Loader2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export type LuckyDrawCenterButtonState = "idle" | "loading" | "success" | "disabled";

export type LuckyDrawCenterButtonProps = {
  disabled?: boolean;
  isLoading?: boolean;
  isSuccess?: boolean;
  /** 主文案；不传则使用 line1Primary 等内置双语（需传 t） */
  text?: string;
  /** 第二行，如剩余次数 */
  subtext?: string;
  onClick?: () => void;
  className?: string;
  /** 无障碍标签（建议传入与状态一致的 t(...) 文案） */
  ariaLabel?: string;
  /** 双语：与会员端其它组件一致 */
  t?: (zh: string, en: string) => string;
};

function resolveState(disabled: boolean | undefined, isLoading: boolean | undefined, isSuccess: boolean | undefined): LuckyDrawCenterButtonState {
  if (disabled) return "disabled";
  if (isLoading) return "loading";
  if (isSuccess) return "success";
  return "idle";
}

/**
 * 会员转盘中心主 CTA：深浅双主题、多状态、动画层常驻（仅用 data-state / class 切换表现）。
 * 不包含业务逻辑，仅 UI。
 */
export function LuckyDrawCenterButton({
  disabled = false,
  isLoading = false,
  isSuccess = false,
  text,
  subtext,
  onClick,
  className,
  ariaLabel,
  t,
}: LuckyDrawCenterButtonProps) {
  const state = resolveState(disabled, isLoading, isSuccess);

  const line1 =
    text ??
    (t
      ? state === "disabled"
        ? t("暂无机会", "No Chance")
        : state === "loading"
          ? t("抽奖中…", "Drawing...")
          : state === "success"
            ? t("再试一次", "Try Again")
            : t("立即抽奖", "Spin Now")
      : state === "disabled"
        ? "No Chance"
        : state === "loading"
          ? "Drawing..."
          : state === "success"
            ? "Try Again"
            : "Spin Now");

  const handleClick = () => {
    if (disabled || isLoading) return;
    onClick?.();
  };

  return (
    <div className={cn("lucky-draw-center-btn relative isolate h-full min-h-0 w-full min-w-0", className)} data-state={state}>
      {/* outer aura — dark: 柔光；light: 浅灰径向 + 弱阴影 */}
      <div className="lucky-draw-center-btn__aura pointer-events-none absolute inset-0 -m-[18%] rounded-full" aria-hidden />

      {/* pulse wave — loading 时可见；常驻 DOM */}
      <div className="lucky-draw-center-btn__pulse pointer-events-none absolute inset-0 -m-[8%] rounded-full" aria-hidden />

      {/* rotating rings — 常驻 */}
      <div className="lucky-draw-center-btn__ring lucky-draw-center-btn__ring--1 pointer-events-none absolute inset-0 rounded-[inherit]" aria-hidden />
      <div className="lucky-draw-center-btn__ring lucky-draw-center-btn__ring--2 pointer-events-none absolute inset-0 rounded-[inherit]" aria-hidden />

      <button
        type="button"
        disabled={disabled || isLoading}
        onClick={handleClick}
        aria-busy={isLoading}
        aria-disabled={disabled || isLoading}
        aria-label={ariaLabel ?? line1}
        className={cn(
          "lucky-draw-center-btn__main relative z-[1] flex h-full min-h-0 w-full min-w-0 touch-manipulation flex-col items-center justify-center gap-0.5 overflow-hidden rounded-xl px-1 py-0.5 outline-none",
          "transition-[transform,box-shadow,opacity] duration-150 ease-out",
          "focus-visible:ring-2 focus-visible:ring-[hsl(var(--pu-gold)/0.45)] focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--pu-m-surface))]",
          "motion-reduce:transition-none",
        )}
      >
        <div className="lucky-draw-center-btn__inner-shade pointer-events-none absolute inset-0 rounded-[inherit]" aria-hidden />
        <div className="lucky-draw-center-btn__gloss pointer-events-none absolute inset-0 rounded-[inherit]" aria-hidden />

        <div className="relative z-10 flex min-h-0 w-full max-w-full flex-col items-center justify-center gap-0.5 px-0.5">
          <span className="flex h-5 items-center justify-center shrink-0" aria-hidden>
            {isLoading ? (
              <Loader2 className="lucky-draw-center-btn__load-icon h-4 w-4 animate-spin motion-reduce:animate-none" strokeWidth={2.25} />
            ) : (
              <Sparkles className="lucky-draw-center-btn__spark-icon h-4 w-4" strokeWidth={2.25} />
            )}
          </span>
          <span
            className={cn(
              "lucky-draw-center-btn__line1 w-full min-w-0 max-w-full text-center text-[10px] font-bold leading-tight tracking-wide sm:text-[11px]",
              "[overflow-wrap:anywhere] line-clamp-2",
            )}
          >
            {line1}
          </span>
          {subtext ? (
            <span
              className={cn(
                "lucky-draw-center-btn__line2 w-full min-w-0 max-w-full text-center text-[9px] font-semibold leading-tight tracking-wide",
                "[overflow-wrap:anywhere] line-clamp-2",
              )}
            >
              {subtext}
            </span>
          ) : null}
        </div>
      </button>
    </div>
  );
}
