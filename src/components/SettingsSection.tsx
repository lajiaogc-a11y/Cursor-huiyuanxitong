/**
 * 统一的设置区块组件 - 用于系统设置各 Tab 页面
 * 提供一致的视觉风格和间距
 */
import { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface SettingsSectionProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  iconClassName?: string;
  children: ReactNode;
  className?: string;
  /** 左侧边框强调色 */
  accent?: "primary" | "violet" | "indigo" | "emerald" | "amber" | "none";
}

const accentMap = {
  primary: "border-l-4 border-l-primary",
  violet: "border-l-4 border-l-violet-500",
  indigo: "border-l-4 border-l-indigo-500",
  emerald: "border-l-4 border-l-emerald-500",
  amber: "border-l-4 border-l-amber-500",
  none: "",
};

export function SettingsSection({
  title,
  description,
  icon: Icon,
  iconClassName,
  children,
  className,
  accent = "primary",
}: SettingsSectionProps) {
  return (
    <Card
      className={cn(
        "overflow-hidden transition-all duration-200",
        accentMap[accent],
        "shadow-sm hover:shadow-md",
        className
      )}
    >
      <CardHeader className="pb-4">
        <CardTitle className="text-base font-semibold flex items-center gap-2.5">
          {Icon && (
            <span
              className={cn(
                "flex items-center justify-center h-9 w-9 rounded-lg shrink-0",
                iconClassName ?? "bg-primary/10 text-primary"
              )}
            >
              <Icon className="h-4 w-4" />
            </span>
          )}
          {title}
        </CardTitle>
        {description && (
          <CardDescription className="mt-1.5 text-sm leading-relaxed">
            {description}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="pt-0">{children}</CardContent>
    </Card>
  );
}

/** 设置页面容器 - 统一内边距和间距 */
export function SettingsPageContainer({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-6", className)}>
      {children}
    </div>
  );
}
