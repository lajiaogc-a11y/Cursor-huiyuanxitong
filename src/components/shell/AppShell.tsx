import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** 员工端主内容区背景与滚动容器（与 MainLayout 内 main 配合使用） */
export function StaffContentShell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("elite-staff-shell elite-staff-surface min-h-0 flex-1", className)}>{children}</div>;
}

/** 会员端全屏背景壳（渐变在 elite-design-tokens.css） */
export function MemberPortalShell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("elite-member-shell min-h-0 flex-1", className)}>{children}</div>;
}
