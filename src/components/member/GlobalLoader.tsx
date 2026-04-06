import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type MemberGlobalLoaderProps = {
  /** 主题色（与租户品牌色一致） */
  accentColor?: string;
  className?: string;
};

/**
 * 会员端全屏短遮罩（登录后进壳等）。仅在需要时由父组件挂载；用 Portal 挂到 body。
 */
export function MemberGlobalLoader({ accentColor, className }: MemberGlobalLoaderProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || typeof document === "undefined") return null;

  return createPortal(
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={cn(
        "member-global-loader fixed inset-0 z-[100002] flex items-center justify-center motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200",
        className,
      )}
      style={{
        background:
          "linear-gradient(165deg, hsl(var(--pu-m-bg-1) / 0.94) 0%, hsl(var(--pu-m-bg-2) / 0.9) 50%, hsl(var(--pu-m-bg-1) / 0.95) 100%)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
      }}
    >
      <Loader2
        className="h-9 w-9 shrink-0 animate-spin motion-reduce:animate-none"
        style={{ color: accentColor || "hsl(var(--pu-gold))" }}
        aria-hidden
      />
    </div>,
    document.body,
  );
}
