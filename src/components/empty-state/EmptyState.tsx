/**
 * 统一空状态组件 - 列表/表格无数据时展示
 * 不包含任何业务逻辑，仅 UI 展示
 */
import { FileQuestion, LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface EmptyStateProps {
  /** 主文案 */
  message?: string;
  /** 副文案/描述 */
  description?: string;
  /** 自定义图标，默认 FileQuestion */
  icon?: LucideIcon;
  /** 操作按钮区域 */
  action?: React.ReactNode;
  /** 自定义 className */
  className?: string;
  /** 是否紧凑模式（减少 padding） */
  compact?: boolean;
}

export function EmptyState({
  message = "暂无数据",
  description,
  icon: Icon = FileQuestion,
  action,
  className,
  compact = false,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center text-muted-foreground",
        compact ? "py-6" : "py-8",
        className
      )}
    >
      <Icon className="h-10 w-10 mb-3 opacity-50" />
      <p className={cn("font-medium", compact ? "text-sm" : "text-sm")}>
        {message}
      </p>
      {description && (
        <p className="mt-1 text-xs opacity-80 max-w-sm">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
