import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function StatCard({
  icon,
  label,
  value,
  sub,
  color,
}: {
  icon: ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  color: string;
}) {
  return (
    <div className={cn("rounded-lg border p-3 flex items-start gap-3 min-w-0", color)}>
      <div className="shrink-0 mt-0.5">{icon}</div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground leading-tight">{label}</p>
        <p className="text-lg font-bold leading-tight mt-0.5">{value}</p>
        {sub && <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{sub}</p>}
      </div>
    </div>
  );
}
