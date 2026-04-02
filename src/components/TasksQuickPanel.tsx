/**
 * 工作任务快捷面板 - 显示在汇率计算页面右侧
 * 展示当前登录员工在「工作任务」中分配到的任务及发布内容（号码/海报）
 * 点击打开弹窗显示任务列表/看板，不跳转页面
 */
import { useState, useEffect, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DrawerDetail } from "@/components/shell/DrawerDetail";
import { ListTodo, ChevronRight, Image as ImageIcon } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useTenantView } from "@/contexts/TenantViewContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { getMyTaskItems, type TaskItemWithPoster } from "@/services/taskService";
import TaskBoardContent from "@/components/TaskBoardContent";
import { ROUTES } from "@/routes/constants";
import { WORK_TASKS_REFRESH_EVENT, consumeWorkTasksStaleSessionFlag } from "@/lib/workTasksRefresh";
import { ResolvableMediaThumb } from "@/components/ResolvableMediaThumb";

function TaskItemPreview({ item }: { item: TaskItemWithPoster }) {
  const { t } = useLanguage();
  if (item.poster_id) {
    return (
      <div className="flex items-center gap-2 shrink-0">
        {item.poster_data_url ? (
          <ResolvableMediaThumb
            idKey={`task-quick-poster-${item.id}`}
            url={item.poster_data_url}
            frameClassName="h-10 w-10 rounded border object-cover"
            tone="staff"
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

const _tasksCache = new Map<string, { groups: { task: { id: string; title: string }; items: TaskItemWithPoster[]; doneCount: number }[] }>();

export default function TasksQuickPanel() {
  const { employee } = useAuth();
  const { viewingTenantId } = useTenantView() || {};
  const { t } = useLanguage();
  const location = useLocation();
  const effectiveTenantId = viewingTenantId || employee?.tenant_id || null;
  const cacheKey = `${employee?.id}_${effectiveTenantId}`;
  const cached = _tasksCache.get(cacheKey);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loading, setLoading] = useState(!cached);
  const [groups, setGroups] = useState<{ task: { id: string; title: string }; items: TaskItemWithPoster[]; doneCount: number }[]>(cached?.groups ?? []);

  const load = useCallback(async () => {
    if (!employee?.id || !effectiveTenantId) {
      setGroups([]);
      return;
    }
    try {
      const data = await getMyTaskItems(effectiveTenantId);
      setGroups(data);
      _tasksCache.set(cacheKey, { groups: data });
    } catch {
      if (!_tasksCache.has(cacheKey)) setGroups([]);
    } finally {
      setLoading(false);
    }
  }, [employee?.id, effectiveTenantId, cacheKey]);

  useEffect(() => {
    if (!employee?.id || !effectiveTenantId) {
      setLoading(false);
      setGroups([]);
      return;
    }
    setLoading(true);
    load();
  }, [employee?.id, effectiveTenantId, load]);

  // 从工作任务子页返回汇率页时强制拉一次（pathname 变化；此前发布任务时面板可能未挂载）
  useEffect(() => {
    if (location.pathname !== ROUTES.STAFF.EXCHANGE_RATE) return;
    if (!employee?.id || !effectiveTenantId) return;
    const fromStale = consumeWorkTasksStaleSessionFlag();
    if (fromStale) void load();
  }, [location.pathname, employee?.id, effectiveTenantId, load]);

  useEffect(() => {
    const onRefresh = () => {
      void load();
    };
    window.addEventListener(WORK_TASKS_REFRESH_EVENT, onRefresh);
    const onTaskTableRefresh = () => void load();
    window.addEventListener("data-refresh:tasks", onTaskTableRefresh);
    window.addEventListener("data-refresh:task_items", onTaskTableRefresh);
    window.addEventListener("data-refresh:task_item_logs", onTaskTableRefresh);
    return () => {
      window.removeEventListener(WORK_TASKS_REFRESH_EVENT, onRefresh);
      window.removeEventListener("data-refresh:tasks", onTaskTableRefresh);
      window.removeEventListener("data-refresh:task_items", onTaskTableRefresh);
      window.removeEventListener("data-refresh:task_item_logs", onTaskTableRefresh);
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
            {groups.slice(0, 5).map((g) => (
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
            {groups.length > 5 && (
              <p className="text-xs text-center text-muted-foreground">
                {t(`还有 ${groups.length - 5} 个任务`, `+${groups.length - 5} more tasks`)}
              </p>
            )}
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

    <DrawerDetail
      open={dialogOpen}
      onOpenChange={setDialogOpen}
      title={t("任务列表/看板", "Task Board")}
      sheetMaxWidth="2xl"
    >
      <div className="min-h-[min(70vh,560px)]">
        <TaskBoardContent compact onRefresh={load} />
      </div>
    </DrawerDetail>
    </>
  );
}
