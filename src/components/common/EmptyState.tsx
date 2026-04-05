import { cn } from "@/lib/utils";
import { Inbox } from "lucide-react";

/** 会员门户设置内日志 / 空列表外壳（与 PortalSettingsEmptyState 同一套 muted 虚线面） */
export const portalSettingsEmptyShellClass =
  "relative overflow-hidden rounded-xl border border-dashed border-border/50 bg-muted/35 px-4 py-8 text-center";

export const portalSettingsEmptyIconWrapClass =
  "inline-flex h-11 w-11 items-center justify-center rounded-xl border border-border/40 bg-muted/60 text-muted-foreground";

/** 会员门户设置内日志类 Tab 的空列表；不影响全局 MobileEmptyState。 */
export function MemberPortalLogsEmpty({ message }: { message: string }) {
  return (
    <div className={cn(portalSettingsEmptyShellClass, "py-10")}>
      <div className="relative flex flex-col items-center gap-3">
        <div className={cn(portalSettingsEmptyIconWrapClass, "h-12 w-12")}>
          <Inbox className="h-6 w-6" strokeWidth={1.75} aria-hidden />
        </div>
        <p className="text-sm font-medium text-foreground">{message}</p>
      </div>
    </div>
  );
}
