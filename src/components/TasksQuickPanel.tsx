/**
 * 工作任务快捷面板 - 显示在汇率计算页面右侧
 * 展示当前登录员工在「工作任务」中分配到的任务及发布内容（号码/海报）
 * 点击打开弹窗显示任务列表/看板，不跳转页面
 */
import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import { ListTodo, ChevronRight, Image as ImageIcon, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { getMyTaskItems, type TaskItemWithPoster } from "@/services/taskService";
import TaskBoardContent from "@/components/TaskBoardContent";

function TaskItemPreview({ item }: { item: TaskItemWithPoster }) {
  const { t } = useLanguage();
  if (item.poster_id) {
    return (
      <div className="flex items-center gap-2 shrink-0">
        {item.poster_data_url ? (
          <img
            src={item.poster_data_url}
            alt=""
            className="h-10 w-10 rounded border object-cover"
          />
        ) : (
          <div className="h-10 w-10 rounded border bg-muted flex items-center justify-center">
            <ImageIcon className="h-4 w-4 text-muted-foreground" />
          </div>
        )}
        <span className="text-xs text-muted-foreground">{t("海报", "Poster")}</span>
      </div>
    );
  }
  return (
    <span className="text-xs font-mono text-muted-foreground truncate max-w-[120px]">
      {item.phone || "-"}
    </span>
  );
}

export default function TasksQuickPanel() {
  const { employee } = useAuth();
  const { t } = useLanguage();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<{ task: { id: string; title: string }; items: TaskItemWithPoster[]; doneCount: number }[]>([]);

  const load = useCallback(async () => {
    if (!employee?.id) return;
    try {
      const data = await getMyTaskItems(employee.id);
      setGroups(data);
    } catch {
      setGroups([]);
    } finally {
      setLoading(false);
    }
  }, [employee?.id]);

  useEffect(() => {
    if (!employee?.id) {
      setLoading(false);
      return;
    }
    load();
  }, [employee?.id, load]);

  const totalTodo = groups.reduce((sum, g) => sum + g.items.filter((i) => i.status === "todo").length, 0);

  return (
    <>
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <span className="font-medium flex items-center gap-2">
            <ListTodo className="h-4 w-4" />
            {t("工作任务", "Tasks")}
          </span>
          {totalTodo > 0 && (
            <Badge variant="secondary">{totalTodo}</Badge>
          )}
        </div>
        {employee?.real_name && (
          <p className="text-xs text-muted-foreground mt-0.5">
            {t("分配给", "Assigned to")} {employee.real_name}
          </p>
        )}
      </CardHeader>
      <CardContent className="pt-0">
        {loading ? (
          <div className="text-sm text-muted-foreground">{t("加载中...", "Loading...")}</div>
        ) : groups.length === 0 ? (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">{t("暂无任务", "No tasks")}</p>
            <Button variant="outline" size="sm" className="w-full" onClick={() => setDialogOpen(true)}>
              {t("任务列表/看板", "Task Board")}
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {groups.slice(0, 3).map((g) => (
              <div
                key={g.task.id}
                className="p-2 rounded-lg border hover:bg-muted/50 cursor-pointer transition-colors"
                onClick={() => setDialogOpen(true)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{g.task.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {g.doneCount} / {g.items.length}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground mt-0.5" />
                </div>
                {/* 发布内容预览：显示前 3 条（号码或海报缩略图） */}
                <div className="flex flex-wrap gap-1.5 mt-2 pt-2 border-t">
                  {g.items.slice(0, 3).map((item) => (
                    <TaskItemPreview key={item.id} item={item} />
                  ))}
                  {g.items.length > 3 && (
                    <span className="text-xs text-muted-foreground self-center">
                      +{g.items.length - 3}
                    </span>
                  )}
                </div>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              className="w-full mt-2"
              onClick={() => setDialogOpen(true)}
            >
              {t("任务列表/看板", "Task Board")}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>

    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <DialogContent className="max-w-2xl max-h-[85vh] p-0 gap-0 overflow-hidden flex flex-col" hideCloseButton>
        <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-card px-6 py-4 shrink-0">
          <DialogHeader>
            <DialogTitle>{t("任务列表/看板", "Task Board")}</DialogTitle>
          </DialogHeader>
          <DialogClose className="rounded-md p-1.5 opacity-70 ring-offset-background transition-all hover:opacity-100 hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
            <X className="h-4 w-4" />
            <span className="sr-only">{t("关闭", "Close")}</span>
          </DialogClose>
        </div>
        <div className="flex-1 overflow-y-auto px-6 pb-6">
          <TaskBoardContent compact onRefresh={load} />
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}
