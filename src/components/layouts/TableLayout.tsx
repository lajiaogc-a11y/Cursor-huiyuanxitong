/**
 * 表格页面通用布局 - 标题、筛选区、表格区、分页
 * 不包含任何业务逻辑，仅布局结构
 */
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface TableLayoutProps {
  /** 标题区域 */
  title?: React.ReactNode;
  /** 筛选/操作栏 */
  toolbar?: React.ReactNode;
  /** 表格内容区 */
  children: React.ReactNode;
  /** 分页区域 */
  pagination?: React.ReactNode;
  /** 是否无 padding */
  noPadding?: boolean;
  className?: string;
}

export function TableLayout({
  title,
  toolbar,
  children,
  pagination,
  noPadding = false,
  className,
}: TableLayoutProps) {
  return (
    <Card className={cn(className)}>
      {(title || toolbar) && (
        <CardHeader className={noPadding ? "p-0" : undefined}>
          {title}
          {toolbar}
        </CardHeader>
      )}
      <CardContent className={cn(noPadding && "p-0")}>
        {children}
        {pagination}
      </CardContent>
    </Card>
  );
}
