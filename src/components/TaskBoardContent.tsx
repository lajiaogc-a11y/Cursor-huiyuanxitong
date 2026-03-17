/**
 * 任务列表/看板内容 - 可嵌入弹窗或独立页面
 * 支持复制号码、填写备注、标记完成
 */
import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Copy, Check, Loader2, Download, Image as ImageIcon } from "lucide-react";
import CustomerDetailHoverCard from "@/components/CustomerDetailHoverCard";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  getMyTaskItems,
  markTaskItemDone,
  updateTaskItemRemark,
  logTaskItemCopy,
  type TaskItemWithPoster,
  type Task,
} from "@/services/taskService";

interface TaskBoardContentProps {
  /** 弹窗模式：紧凑布局，无大标题 */
  compact?: boolean;
  /** 数据刷新回调（如弹窗关闭后通知父组件刷新） */
  onRefresh?: () => void;
}

export default function TaskBoardContent({ compact, onRefresh }: TaskBoardContentProps) {
  const { employee } = useAuth();
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [groups, setGroups] = useState<{ task: Task; items: TaskItemWithPoster[]; doneCount: number }[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [editingRemarkId, setEditingRemarkId] = useState<string | null>(null);
  const [editingRemarkValue, setEditingRemarkValue] = useState("");

  const load = useCallback(async () => {
    if (!employee?.id) return;
    setLoading(true);
    setLoadError(false);
    try {
      const data = await getMyTaskItems(employee.id);
      setGroups(data);
    } catch (e) {
      console.error(e);
      setLoadError(true);
      toast.error(t("加载失败，请确认后端已启动", "Load failed, please ensure backend is running"));
    } finally {
      setLoading(false);
    }
  }, [employee?.id, t]);

  useEffect(() => {
    if (!employee?.id) {
      setLoading(false);
      return;
    }
    load();
  }, [employee?.id, load]);

  const handleCopy = async (item: TaskItemWithPoster) => {
    const phone = item.phone || "";
    try {
      await navigator.clipboard.writeText(phone);
      setCopiedId(item.id);
      setTimeout(() => setCopiedId(null), 1500);
      if (employee?.id) await logTaskItemCopy(item.id, employee.id);
      toast.success(t("已复制", "Copied"));
    } catch {
      toast.error(t("复制失败", "Copy failed"));
    }
  };

  const handleRemarkBlur = async (item: TaskItemWithPoster, value: string) => {
    if (!employee?.id) return;
    const trimmed = value.trim();
    if (trimmed === (item.remark || "")) {
      setEditingRemarkId(null);
      return;
    }
    try {
      await updateTaskItemRemark(item.id, trimmed, employee.id);
      setGroups((prev) =>
        prev.map((g) => ({
          ...g,
          items: g.items.map((i) => (i.id === item.id ? { ...i, remark: trimmed } : i)),
        }))
      );
      onRefresh?.();
    } catch {
      toast.error(t("保存备注失败", "Save remark failed"));
    } finally {
      setEditingRemarkId(null);
    }
  };

  const handleMarkDone = async (item: TaskItemWithPoster, remark?: string) => {
    if (!employee?.id) return;
    try {
      await markTaskItemDone(item.id, employee.id, remark);
      setGroups((prev) =>
        prev.map((g) => {
          const newItems = g.items.map((i) =>
            i.id === item.id ? { ...i, status: "done" as const, remark: remark ?? i.remark } : i
          );
          return {
            ...g,
            items: newItems,
            doneCount: newItems.filter((i) => i.status === "done").length,
          };
        })
      );
      toast.success(t("已标记为已完成", "Marked as done"));
      onRefresh?.();
    } catch {
      toast.error(t("操作失败", "Operation failed"));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[120px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className={cn("space-y-4", compact && "space-y-3")}>
      {!compact && (
        <p className="text-sm text-muted-foreground">
          {t("您分配到的任务列表，可复制号码、填写备注并标记完成", "Your assigned tasks")}
        </p>
      )}
      {loadError ? (
        <div className="py-8 text-center">
          <p className="text-muted-foreground text-sm mb-2">
            {t("加载失败，请确认后端已启动（npm run dev:all 或部署后端）", "Load failed. Ensure backend is running (npm run dev:all or deploy backend)")}
          </p>
          <Button variant="outline" size="sm" onClick={() => load()}>
            {t("重试", "Retry")}
          </Button>
        </div>
      ) : groups.length === 0 ? (
        <div className="py-8 text-center text-muted-foreground text-sm space-y-1">
          <p>{t("暂无分配任务", "No tasks assigned")}</p>
          <p className="text-xs">
            {t("请在「工作任务」→「维护设置」或「发动态」中创建任务并分配给当前员工", "Create tasks in Tasks → Maintenance or Post Dynamic and assign to current employee")}
          </p>
          <Button variant="outline" size="sm" className="mt-2" onClick={() => load()}>
            {t("刷新", "Refresh")}
          </Button>
        </div>
      ) : (
        groups.map(({ task, items, doneCount }) => (
          <Card key={task.id} className={compact ? "border" : undefined}>
            <CardHeader className={cn("pb-2", compact && "py-3")}>
              <CardTitle className={cn("flex items-center justify-between", compact ? "text-base" : "text-lg")}>
                <span className="truncate">{task.title}</span>
                <Badge variant="secondary" className="shrink-0">
                  {doneCount} / {items.length}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className={compact ? "pt-0" : undefined}>
              <div className="space-y-2">
                {[...items]
                  .sort((a, b) => (a.status === "done" ? 1 : 0) - (b.status === "done" ? 1 : 0))
                  .map((item) => {
                  const isPoster = !!item.poster_id;
                  return (
                    <div
                      key={item.id}
                      className={cn(
                        "flex items-center gap-2 p-2 rounded-lg border",
                        compact && "gap-2 p-2",
                        item.status === "done" ? "bg-muted/50" : "bg-background"
                      )}
                    >
                      {isPoster ? (
                        <div className="flex items-center gap-2 flex-1 min-w-0 shrink-0">
                          {item.poster_data_url ? (
                            <img
                              src={item.poster_data_url}
                              alt=""
                              className="h-10 w-10 rounded border object-cover shrink-0"
                            />
                          ) : (
                            <div className="h-10 w-10 rounded border bg-muted flex items-center justify-center shrink-0">
                              <ImageIcon className="h-4 w-4 text-muted-foreground" />
                            </div>
                          )}
                          <span className="text-xs text-muted-foreground truncate">{t("海报", "Poster")}</span>
                        </div>
                      ) : (
                        <CustomerDetailHoverCard phone={item.phone || ""} className="font-mono text-sm flex-1 min-w-0 truncate hover:text-primary hover:underline">
                          {item.phone || "-"}
                        </CustomerDetailHoverCard>
                      )}
                      <Input
                        placeholder={t("备注", "Remark")}
                        value={editingRemarkId === item.id ? editingRemarkValue : (item.remark || "")}
                        onChange={(e) => {
                          setEditingRemarkId(item.id);
                          setEditingRemarkValue(e.target.value);
                        }}
                        onFocus={() => {
                          setEditingRemarkId(item.id);
                          setEditingRemarkValue(item.remark || "");
                        }}
                        onBlur={(e) => {
                          const v = e.target.value;
                          if (editingRemarkId === item.id) handleRemarkBlur(item, v);
                        }}
                        className={cn("h-8 text-sm shrink-0", compact ? "max-w-[100px]" : "max-w-[120px]")}
                        disabled={item.status === "done"}
                      />
                      {!isPoster && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0"
                          onClick={() => handleCopy(item)}
                        >
                          {copiedId === item.id ? (
                            <Check className="h-4 w-4 text-green-600" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </Button>
                      )}
                      {isPoster && item.poster_data_url && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0"
                          onClick={() => {
                            const link = document.createElement("a");
                            link.download = `poster_${item.id}.png`;
                            link.href = item.poster_data_url!;
                            link.click();
                          }}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant={item.status === "done" ? "secondary" : "default"}
                        className="shrink-0"
                        disabled={item.status === "done"}
                        onClick={() => handleMarkDone(item, item.remark || undefined)}
                      >
                        {item.status === "done" ? t("已完成", "Done") : t("待完成", "Pending")}
                      </Button>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
