import { useState, useEffect } from "react";
import { Zap } from "lucide-react";
import { useMemberResolvableMedia } from "@/hooks/members/useMemberResolvableMedia";
import { cn } from "@/lib/utils";

/** 有 logo_url 时仅用金渐变块 + 淡入图，无图时才用闪电，避免与公司 Logo 切换闪烁 */
export function LoginIdleHeaderLogo({
  logoUrl,
  size = "sm",
}: {
  logoUrl: string | null | undefined;
  size?: "sm" | "md";
}) {
  const raw = String(logoUrl ?? "").trim();
  const { resolvedSrc, usePlaceholder, onImageError } = useMemberResolvableMedia("login-idle-header-logo", raw || undefined);
  const [imgShown, setImgShown] = useState(false);
  const hasBrandLogoUrl = Boolean(raw);
  const imageFailed = Boolean(resolvedSrc && usePlaceholder);
  const showImage = Boolean(resolvedSrc) && !imageFailed;
  const box = size === "md" ? "h-11 w-11" : "h-9 w-9";
  const imgCls = size === "md" ? "h-11 w-11" : "h-9 w-9";
  const zapCls = size === "md" ? "h-5 w-5" : "h-[18px] w-[18px]";

  useEffect(() => {
    setImgShown(false);
    if (!raw || !resolvedSrc || imageFailed) return;
    const pre = new Image();
    pre.onload = () => setImgShown(true);
    pre.onerror = () => setImgShown(true);
    pre.src = resolvedSrc;
  }, [raw, resolvedSrc, imageFailed]);

  if (hasBrandLogoUrl) {
    return (
      <div
        className={cn("relative flex shrink-0 overflow-hidden rounded-xl border border-[hsl(var(--pu-m-surface-border)/0.28)] shadow-md", box)}
        style={{
          background: `linear-gradient(135deg, hsl(var(--pu-gold)), hsl(var(--pu-gold-soft)))`,
          boxShadow: "0 4px 16px -4px hsl(var(--pu-gold) / 0.4)",
        }}
      >
        {showImage ? (
          <img
            src={resolvedSrc}
            alt=""
            className={cn(
              "box-border object-contain object-center p-0.5 transition-opacity duration-200 motion-reduce:transition-none",
              imgCls,
            )}
            style={{ opacity: imgShown ? 1 : 0 }}
            loading="eager"
            fetchPriority="high"
            onLoad={() => setImgShown(true)}
            onError={onImageError}
          />
        ) : null}
      </div>
    );
  }
  return (
    <div
      className={cn("flex items-center justify-center rounded-xl", box)}
      style={{
        background: `linear-gradient(135deg, hsl(var(--pu-gold)), hsl(var(--pu-gold-soft)))`,
        boxShadow: "0 4px 16px -4px hsl(var(--pu-gold) / 0.4)",
      }}
    >
      <Zap
        className={cn(
          size === "md" ? "text-[hsl(var(--pu-m-bg-1))]" : "text-[hsl(var(--pu-primary-foreground))]",
          zapCls,
        )}
        strokeWidth={2.2}
        aria-hidden
      />
    </div>
  );
}
