import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

const btnBase =
  "inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl px-4 text-center text-xs font-bold transition motion-reduce:transition-none active:scale-[0.98] motion-reduce:active:scale-100 sm:flex-initial sm:min-w-[8.5rem]";

type CtaSpec = { to: string; label: string };

/**
 * 会员空状态底部主/次行动（与 dashed 空态卡片配套）
 */
export function MemberEmptyStateCta({
  primary,
  anchorPrimary,
  secondary,
  className,
}: {
  primary?: CtaSpec;
  /** 同页锚点（如返回转盘区域） */
  anchorPrimary?: { href: string; label: string };
  secondary?: CtaSpec;
  className?: string;
}) {
  if (!primary && !anchorPrimary && !secondary) return null;
  return (
    <div
      className={cn(
        "mt-5 flex w-full flex-col items-stretch justify-center gap-2 sm:flex-row sm:flex-wrap sm:items-center",
        className,
      )}
    >
      {anchorPrimary ? (
        <a
          href={anchorPrimary.href}
          className={cn(
            btnBase,
            "bg-pu-gold/18 text-pu-gold-soft ring-1 ring-inset ring-pu-gold/28 hover:bg-pu-gold/25",
          )}
        >
          {anchorPrimary.label}
        </a>
      ) : null}
      {primary ? (
        <Link
          to={primary.to}
          className={cn(
            btnBase,
            "bg-pu-gold/18 text-pu-gold-soft ring-1 ring-inset ring-pu-gold/28 hover:bg-pu-gold/25",
          )}
        >
          {primary.label}
        </Link>
      ) : null}
      {secondary ? (
        <Link
          to={secondary.to}
          className={cn(
            btnBase,
            "border border-[hsl(var(--pu-m-surface-border)/0.35)] bg-[hsl(var(--pu-m-surface)/0.4)] text-[hsl(var(--pu-m-text))] hover:bg-[hsl(var(--pu-m-surface)/0.55)]",
          )}
        >
          {secondary.label}
        </Link>
      ) : null}
    </div>
  );
}
