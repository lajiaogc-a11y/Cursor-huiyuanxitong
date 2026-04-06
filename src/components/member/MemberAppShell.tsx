import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * 会员端 App Shell 语义容器：中间主内容区 + 底部 Tabbar 槽位。
 * Tabbar 由父级始终挂载同一实例，仅通过 hideTabbar 隐藏，避免路由切换时 remount 闪动。
 */
export function MemberAppShellPageSlot({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("member-app-shell-page relative min-h-0 flex-1", className)} data-member-app-shell="page">
      {children}
    </div>
  );
}

export function MemberAppShellTabbarSlot({
  children,
  hidden,
  className,
}: {
  children: ReactNode;
  /** true 时仅视觉隐藏，子组件保持挂载（如首次改密页不显示底栏） */
  hidden?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "member-app-shell-tabbar transition-[opacity,transform] member-motion-fast motion-reduce:transition-none",
        hidden
          ? "pointer-events-none translate-y-2 opacity-0"
          : "pointer-events-auto translate-y-0 opacity-100",
        className,
      )}
      data-member-app-shell="tabbar"
      aria-hidden={hidden ? true : undefined}
    >
      {children}
    </div>
  );
}
