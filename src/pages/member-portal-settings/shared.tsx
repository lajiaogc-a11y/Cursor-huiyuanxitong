/**
 * 共享组件 — MemberPortalSettings 子 tab 通用
 */
import { cn } from '@/lib/utils';

export function SectionTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn("text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3 mt-6 first:mt-0", className)}>
      {children}
    </p>
  );
}
