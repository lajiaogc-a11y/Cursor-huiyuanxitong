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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import CustomerDetailHoverCard from "@/components/CustomerDetailHoverCard";
import { useAuth } from "@/contexts/AuthContext";
import { useTenantView } from "@/contexts/TenantViewContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { notify } from "@/lib/notifyHub";
import { cn } from "@/lib/utils";
import {
  getMyTaskItems,
  markTaskItemDone,
  updateTaskItemRemark,
  logTaskItemCopy,
  type TaskItemWithPoster,
  type Task,
} from "@/services/taskService";
import { WORK_TASKS_REFRESH_EVENT } from "@/lib/workTasksRefresh";
import { ResolvableMediaThumb } from "@/components/ResolvableMediaThumb";

interface TaskBoardContentProps {
  /** 弹窗模式：紧凑布局，无大标题 */
  compact?: boolean;
  /** 数据刷新回调（如弹窗关闭后通知父组件刷新） */
  onRefresh?: () => void;
}

export default function TaskBoardContent({ compact, onRefresh }: TaskBoardContentProps) {
  const { employee } = useAuth();
  const { viewingTenantId } = useTenantView() || {};
  const { t } = useLanguage();
  const effectiveTenantId = viewingTenantId || employee?.tenant_id || null;
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<{ task: Task; items: TaskItemWithPoster[]; doneCount: number }[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [editingRemarkId, setEditingRemarkId] = useState<string | null>(null);
  const [editingRemarkValue, setEditingRemarkValue] = useState("");
  /** 客户维护（号码）任务：点击「待完成」时先确认 */
  const [confirmMarkDoneItemId, setConfirmMarkDoneItemId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!employee?.id || !effectiveTenantId) {
      setGroups([]);
      return;
    }
    setLoading(true);
    try {
      const data = await getMyTaskItems(effectiveTenantId);
      setGroups(data);
    } catch (e) {
      console.error(e);
      notify.error(t("加载失败", "Load failed"));
    } finally {
      setLoading(false);
    }
  }, [employee?.id, effectiveTenantId, t]);

  useEffect(() => {
    if (!employee?.id || !effectiveTenantId) {
      setLoading(false);
      setGroups([]);
      return;
    }
    load();
  }, [employee?.id, effectiveTenantId, load]);

  useEffect(() => {
    const onRefresh = () => {
      void load();
    };
    window.addEventListener(WORK_TASKS_REFRESH_EVENT, onRefresh);
    window.addEventListener("data-refresh:tasks", onRefresh);
    window.addEventListener("data-refresh:task_items", onRefresh);
    window.addEventListener("data-refresh:task_item_logs", onRefresh);
    return () => {
      window.removeEventListener(WORK_TASKS_REFRESH_EVENT, onRefresh);
      window.removeEventListener("data-refresh:tasks", onRefresh);
      window.removeEventListener("data-refresh:task_items", onRefresh);
      window.removeEventListener("data-refresh:task_item_logs", onRefresh);
    };
  }, [load]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible" && employee?.id && effectiveTenantId) void load();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [load, employee?.id, effectiveTenantId]);

  // 30s 轮询：跨会话/跨浏览器分配的任务也能及时出现
  useEffect(() => {
    if (!employee?.id || !effectiveTenantId) return;
    const timer = setInterval(() => void load(), 30_000);
    return () => clearInterval(timer);
  }, [load, employee?.id, effectiveTenantId]);

  const handleCopy = async (item: TaskItemWithPoster) => {
    const phone = item.phone || "";
    try {
      await navigator.clipboard.writeText(phone);
      setCopiedId(item.id);
      setTimeout(() => setCopiedId(null), 1500);
      if (employee?.id) await logTaskItemCopy(item.id, employee.id, effectiveTenantId);
      notify.success(t("已复制", "Copied"));
    } catch {
      notify.error(t("复制失败", "Copy failed"));
    }
  };

  const handleRemarkBlur = async (item: TaskItemWithPoster, value: string) => {
    if (!employee?.id || !effectiveTenantId) return;
    const trimmed = value.trim();
    if (trimmed === (item.remark || "")) {
      setEditingRemarkId(null);
      return;
    }
    try {
      await updateTaskItemRemark(item.id, trimmed, employee.id, effectiveTenantId);
      setGroups((prev) =>
        prev.map((g) => ({
          ...g,
          items: g.items.map((i) => (i.id === item.id ? { ...i, remark: trimmed } : i)),
        }))
      );
      onRefresh?.();
    } catch {
      notify.error(t("保存备注失败", "Save remark failed"));
    } finally {
      setEditingRemarkId(null);
    }
  };

  const handleMarkDone = async (item: TaskItemWithPoster, remark?: string) => {
    if (!employee?.id || !effectiveTenantId) return;
    try {
      await markTaskItemDone(item.id, employee.id, remark, effectiveTenantId);
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
      notify.success(t("已标记为已完成", "Marked as done"));
      onRefresh?.();
    } catch {
      notify.error(t("操作失败", "Operation failed"));
    }
  };

  const resolveItemById = useCallback(
    (id: string | null) => {
      if (!id) return null;
      for (const g of groups) {
        const found = g.items.find((i) => i.id === id);
        if (found) return found;
      }
      return null;
    },
    [groups],
  );

  const pendingConfirmItem = confirmMarkDoneItemId ? resolveItemById(confirmMarkDoneItemId) : null;

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
      {groups.length === 0 ? (
        <div className="py-8 text-center text-muted-foreground text-sm">
          {t("暂无分配任务", "No tasks assigned")}
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
                  const isOtherAssignee = item.assigned_to !== employee?.id;
                  return (
                    <div
                      key={item.id}
                      className={cn(
                        "flex items-center gap-2 p-2 rounded-lg border",
                        compact && "gap-2 p-2",
                        item.status === "done" ? "bg-muted/50" : isOtherAssignee ? "bg-muted/30" : "bg-background"
                      )}
                    >
                      {isPoster ? (
                        <div className="flex items-center gap-2 flex-1 min-w-0 shrink-0">
                          {item.poster_data_url ? (
                            <ResolvableMediaThumb
                              idKey={`task-board-poster-${item.id}`}
                              url={item.poster_data_url}
                              frameClassName="h-10 w-10 rounded border object-cover shrink-0"
                              tone="staff"
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
                        disabled={item.status === "done" || isOtherAssignee}
                      />
                      {!isPoster && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0"
                          aria-label="Copy"
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
                          aria-label="Download"
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
                        variant={item.status === "done" ? "secondary" : isOtherAssignee ? "outline" : "default"}
                        className="shrink-0"
                        disabled={item.status === "done" || isOtherAssignee}
                        onClick={() => {
                          if (item.status === "done" || isOtherAssignee) return;
                          if (!isPoster) {
                            setConfirmMarkDoneItemId(item.id);
                            return;
                          }
                          void handleMarkDone(item, item.remark || undefined);
                        }}
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

      <AlertDialog
        open={!!confirmMarkDoneItemId}
        onOpenChange={(open) => {
          if (!open) setConfirmMarkDoneItemId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("确认完成客户维护？", "Confirm customer maintenance done?")}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  {t(
                    "将以下号码标记为「已完成」。请确认已按要求完成联系或维护后再提交。",
                    "Mark the following number as done. Confirm you have finished the required follow-up.",
                  )}
                </p>
                <p className="font-mono text-foreground font-medium">
                  {pendingConfirmItem?.phone || "—"}
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("取消", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const id = confirmMarkDoneItemId;
                setConfirmMarkDoneItemId(null);
                if (!id) return;
                const latest = resolveItemById(id);
                const remark = latest?.remark?.trim() || undefined;
                if (latest) void handleMarkDone(latest, remark);
              }}
            >
              {t("确认完成", "Confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
