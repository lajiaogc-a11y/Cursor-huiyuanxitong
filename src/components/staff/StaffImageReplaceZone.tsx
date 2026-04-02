import { Loader2, Upload, ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { ResolvableMediaThumb } from "@/components/ResolvableMediaThumb";

export type StaffImageReplaceZoneProps = {
  idKey: string;
  /** 展示用地址（相对 API 路径、https、data URL 均可） */
  imageUrl: string;
  /** 外层预览区域：如 aspect-video max-w-lg、或固定高宽 */
  frameClassName: string;
  emptyLabel: string;
  replaceLabel: string;
  uploading?: boolean;
  disabled?: boolean;
  onPick: () => void;
  /** 小屏无 hover 时的辅助说明 */
  tapHint?: string;
};

/**
 * 员工端门户配置：大图预览 + 悬停/点击更换（触摸设备可直点整块区域）。
 */
export function StaffImageReplaceZone({
  idKey,
  imageUrl,
  frameClassName,
  emptyLabel,
  replaceLabel,
  uploading = false,
  disabled = false,
  onPick,
  tapHint,
}: StaffImageReplaceZoneProps) {
  const trimmed = typeof imageUrl === "string" ? imageUrl.trim() : "";

  return (
    <div className="space-y-1.5">
      <div
        className={cn(
          "group relative overflow-hidden rounded-xl border border-border/80 bg-muted/25 shadow-sm ring-offset-background transition",
          !disabled && "hover:border-primary/45 hover:shadow-md",
          frameClassName,
        )}
      >
        {trimmed ? (
          <ResolvableMediaThumb
            idKey={idKey}
            url={trimmed}
            frameClassName="absolute inset-0 h-full w-full"
            imgClassName="object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center text-muted-foreground">
            <ImageIcon className="h-10 w-10 opacity-35" strokeWidth={1.25} aria-hidden />
            <span className="text-xs font-medium leading-snug">{emptyLabel}</span>
          </div>
        )}

        <button
          type="button"
          disabled={disabled || uploading}
          onClick={onPick}
          aria-label={replaceLabel}
          className={cn(
            "absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-gradient-to-t from-background/90 via-background/65 to-background/40 text-foreground opacity-0 transition",
            "focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            "group-hover:opacity-100 group-active:opacity-100",
            uploading && "opacity-100 cursor-wait",
            (disabled || uploading) && "pointer-events-none",
          )}
        >
          {uploading ? (
            <Loader2 className="h-7 w-7 animate-spin text-primary" aria-hidden />
          ) : (
            <>
              <Upload className="h-5 w-5 text-primary" strokeWidth={2} aria-hidden />
              <span className="rounded-md bg-background/85 px-2.5 py-1 text-xs font-semibold shadow-sm backdrop-blur-sm">
                {replaceLabel}
              </span>
            </>
          )}
        </button>
      </div>
      {tapHint ? (
        <p className="text-[11px] text-muted-foreground sm:hidden">{tapHint}</p>
      ) : null}
    </div>
  );
}
