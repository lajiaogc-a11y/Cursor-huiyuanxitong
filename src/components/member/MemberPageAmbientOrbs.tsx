import { cn } from "@/lib/utils";

/**
 * premium-ui-boost：首屏右上金、左下翠微光晕。用于会员门户各页（首页/登录/注册/引导/404 等）统一氛围。
 * 父级需 `position: relative`；前景内容建议 `relative z-[1]`，返回类控件可用 `z-[2]`。
 */
export function MemberPageAmbientOrbs({ className }: { className?: string }) {
  return (
    <div
      className={cn("member-ambient-orbs pointer-events-none absolute inset-0 overflow-hidden", className)}
      aria-hidden
    >
      <div className="absolute -right-20 -top-20 h-80 w-80 rounded-full bg-pu-gold/[0.06] blur-[100px]" />
      <div className="absolute -bottom-16 -left-16 h-60 w-60 rounded-full bg-pu-emerald/[0.04] blur-[80px]" />
    </div>
  );
}
