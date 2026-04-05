/**
 * 共享组件 — MemberPortalSettings 子 tab 通用
 */
import type { LucideIcon } from "lucide-react";
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import {
  portalSettingsEmptyShellClass,
  portalSettingsEmptyIconWrapClass,
} from "../member-portal/shared";

export function SwitchRow({
  label,
  desc,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  desc?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-between rounded-xl border bg-card px-4 py-3 gap-4',
        disabled && 'opacity-60',
      )}
    >
      <div>
        <p className="text-sm font-medium leading-none">{label}</p>
        {desc && <p className="text-xs text-muted-foreground mt-1">{desc}</p>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </div>
  );
}

export function SectionTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn("text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3 mt-6 first:mt-0", className)}>
      {children}
    </p>
  );
}

export function PortalSettingsEmptyState({
  icon: Icon,
  title,
  hint,
}: {
  icon: LucideIcon;
  title: string;
  hint?: string;
}) {
  return (
    <div className={cn(portalSettingsEmptyShellClass)}>
      <div className="relative flex flex-col items-center">
        <div className={cn("mb-3", portalSettingsEmptyIconWrapClass)}>
          <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
        </div>
        <p className="text-sm font-medium text-foreground">{title}</p>
        {hint ? <p className="mt-1.5 max-w-lg text-xs leading-relaxed text-muted-foreground">{hint}</p> : null}
      </div>
    </div>
  );
}
