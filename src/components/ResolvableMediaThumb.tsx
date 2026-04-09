import { ImageOff, Megaphone } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMemberResolvableMedia } from "@/hooks/members/useMemberResolvableMedia";

export type ResolvableMediaThumbTone = "staff" | "memberPreview";

/**
 * 员工端预览 / 配置页小图：与会员商城一致的先重试再占位，避免 handleImgError 把图 display:none 后留白。
 */
export function ResolvableMediaThumb({
  idKey,
  url,
  frameClassName,
  imgClassName,
  tone = "staff",
  alt = "",
}: {
  idKey: string;
  url: string | null | undefined;
  frameClassName: string;
  imgClassName?: string;
  tone?: ResolvableMediaThumbTone;
  /** 有则写入 img，利于无障碍与客服头像 */
  alt?: string;
}) {
  const trimmed = typeof url === "string" ? url.trim() : "";
  const { resolvedSrc, usePlaceholder, onImageError } = useMemberResolvableMedia(idKey, trimmed);

  if (!trimmed) return null;

  if (usePlaceholder) {
    return (
      <div
        className={cn(
          "flex items-center justify-center overflow-hidden",
          frameClassName,
          tone === "memberPreview"
            ? "border border-pu-gold/22 bg-[hsl(var(--pu-m-bg-1)/0.42)]"
            : "border border-border/60 bg-muted/50",
        )}
        aria-hidden
      >
        {tone === "memberPreview" ? (
          <Megaphone className="h-4 w-4 shrink-0 text-pu-gold-soft/80" strokeWidth={2} />
        ) : (
          <ImageOff className="h-3.5 w-3.5 shrink-0 opacity-45" strokeWidth={1.75} />
        )}
      </div>
    );
  }

  return <img src={resolvedSrc} alt={alt} className={cn(frameClassName, imgClassName)} onError={onImageError} />;
}
