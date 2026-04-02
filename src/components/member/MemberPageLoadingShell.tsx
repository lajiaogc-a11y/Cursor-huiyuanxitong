import type { ReactNode } from "react";
import BackHeader from "@/components/member/BackHeader";
import { MemberPageAmbientOrbs } from "@/components/member/MemberPageAmbientOrbs";
import { cn } from "@/lib/utils";

/**
 * 与 premium-ui-boost 一致：加载态也保留 m-page-bg + 环境光，避免「闪一下平色底」。
 * `showBackHeader={false}` 用于首页等已有顶栏的场景，仅保留底纹 + orbs + 内容槽。
 */
export function MemberPageLoadingShell({
  title,
  children,
  showBackHeader = true,
}: {
  title: string;
  children: ReactNode;
  /** 默认 true；false 时不渲染返回顶栏（仍保留 m-page-bg 与 orbs） */
  showBackHeader?: boolean;
}) {
  return (
    <div className="m-page-bg relative min-h-screen pb-24">
      {showBackHeader ? <BackHeader title={title} /> : null}
      <MemberPageAmbientOrbs />
      <div className="relative z-[1]">{children}</div>
    </div>
  );
}

/** 与积分块数字位对齐的脉冲条，供首页等内联骨架使用 */
export function MemberPointsValueSkeleton({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "mx-auto block h-8 w-[5.25rem] max-w-[90%] animate-pulse rounded-xl bg-[hsl(var(--pu-m-surface)/0.42)] motion-reduce:animate-none",
        className,
      )}
      aria-hidden
    />
  );
}

/** 列表/卡片区占位（近期流水、我的订单等），与会员页 glass 节奏一致 */
export function MemberStackedRowSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-2.5 py-3" role="status" aria-busy="true">
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="h-[3.25rem] animate-pulse rounded-xl bg-[hsl(var(--pu-m-surface)/0.36)] motion-reduce:animate-none"
          aria-hidden
        />
      ))}
    </div>
  );
}
