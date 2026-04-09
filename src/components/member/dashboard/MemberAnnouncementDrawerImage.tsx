import { Megaphone } from "lucide-react";
import { useMemberResolvableMedia } from "@/hooks/members/useMemberResolvableMedia";

export interface MemberAnnouncementDrawerImageProps {
  stableKey: string;
  rawUrl: string;
}

export function MemberAnnouncementDrawerImage({ stableKey, rawUrl }: MemberAnnouncementDrawerImageProps) {
  const { resolvedSrc, usePlaceholder, onImageError } = useMemberResolvableMedia(stableKey, rawUrl);
  return (
    <div className="mb-3 w-full overflow-hidden rounded-xl">
      {usePlaceholder ? (
        <div
          className="flex h-[min(220px,40vw)] w-full min-h-[120px] items-center justify-center bg-gradient-to-br from-pu-gold/12 to-pu-gold/[0.06]"
          role="img"
          aria-hidden
        >
          <Megaphone className="h-10 w-10 text-[hsl(var(--pu-m-text-dim)/0.35)]" strokeWidth={1.5} />
        </div>
      ) : (
        <img src={resolvedSrc} alt="" className="max-h-[220px] w-full object-cover" onError={onImageError} />
      )}
    </div>
  );
}
