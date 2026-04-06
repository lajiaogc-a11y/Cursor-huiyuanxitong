import { type ReactNode, useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export type ContentRevealProps = {
  children: ReactNode;
  /** 为 true 时播放入场（blur → clear） */
  show: boolean;
  className?: string;
  /** 入场时长 ms */
  durationMs?: number;
};

/**
 * 内容渐显：轻微 blur + opacity，避免大块骨架撤掉时的「硬切」。
 */
export function ContentReveal({ children, show, className, durationMs = 300 }: ContentRevealProps) {
  const [visible, setVisible] = useState(show);

  useEffect(() => {
    if (show) {
      const id = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(id);
    }
    setVisible(false);
  }, [show]);

  return (
    <div
      className={cn("will-change-[opacity,filter]", className)}
      style={{
        opacity: visible ? 1 : 0,
        filter: visible ? "blur(0px)" : "blur(3px)",
        transitionProperty: "opacity, filter",
        transitionDuration: `${Math.max(180, durationMs)}ms`,
        transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)",
      }}
    >
      {children}
    </div>
  );
}
