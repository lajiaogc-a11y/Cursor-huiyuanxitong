import { cn } from "@/lib/utils";

interface GCLogoProps {
  className?: string;
  size?: number;
  variant?: "full" | "icon" | "light";
}

/**
 * GC Logo - 专业品牌标识
 * 简约现代风格，渐变与精致排版
 */
export function GCLogo({ className, size = 32, variant = "icon" }: GCLogoProps) {
  const isLight = variant === "light";

  return (
    <div
      role="img"
      aria-label="GC"
      className={cn(
        "shrink-0 rounded-xl flex items-center justify-center select-none",
        "font-bold tracking-[-0.04em] antialiased",
        isLight
          ? "bg-white text-[#1e40af] shadow-lg shadow-slate-900/10 border border-slate-100"
          : "bg-gradient-to-br from-[#2563eb] via-[#3b82f6] to-[#1d4ed8] text-white shadow-lg shadow-blue-500/25",
        className
      )}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.44),
      }}
    >
      <span className="leading-none">GC</span>
    </div>
  );
}
