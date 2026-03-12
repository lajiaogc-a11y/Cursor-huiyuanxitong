/**
 * 工作任务 - 维护设置（管理员：生成名单、分配）
 * 支持上周/上月/近三月未交易生成名单
 */
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Users, Info, Trash2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useTenantView } from "@/contexts/TenantViewContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { toast } from "sonner";
import {
  generateCustomerList,
  createCustomerMaintenanceTask,
  getDateRangeForPreset,
  closeTask,
  type DateRangePreset,
} from "@/services/taskService";
import { useOpenTasks, useTaskSettingsEmployees } from "@/hooks/useOpenTasks";
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

const DATE_PRESETS: { value: DateRangePreset; labelZh: string; labelEn: string }[] = [
  { value: "last_week", labelZh: "上周未交易", labelEn: "Last Week No Trade" },
  { value: "last_month", labelZh: "上月未交易", labelEn: "Last Month No Trade" },
  { value: "last_3_months", labelZh: "近三个月未交易", labelEn: "Last 3 Months No Trade" },
];

export default function TasksSettings() {
  const { employee } = useAuth();
  const { viewingTenantId } = useTenantView() || {};
  const { t } = useLanguage();
  const tenantId = viewingTenantId || employee?.tenant_id;
  const [datePreset, setDatePreset] = useState<DateRangePreset>("last_week");
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [phones, setPhones] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [sample, setSample] = useState<{ phone: string }[]>([]);
  const [closingId, setClosingId] = useState<string | null>(null);
  const [confirmCloseId, setConfirmCloseId] = useState<string | null>(null);

  const { openTasks, loading: tasksLoading, refetch: refetchOpenTasks } = useOpenTasks(tenantId ?? null);
  const { employees } = useTaskSettingsEmployees(tenantId ?? null, dialogOpen);

  const handleCloseTask = async (taskId: string) => {
    if (!tenantId) return;
    setClosingId(taskId);
    try {
      await closeTask(taskId, tenantId);
      toast.success(t("已取消任务", "Task cancelled"));
      setConfirmCloseId(null);
      refetchOpenTasks();
    } catch (e) {
      console.error(e);
      toast.error(t("取消失败", "Cancel failed"));
    } finally {
      setClosingId(null);
    }
  };

  const handleGenerate = async () => {
    if (!tenantId) {
      toast.error(t("请先选择租户", "Please select tenant first"));
      return;
    }
    setGenerating(true);
    try {
      const { start, end } = getDateRangeForPreset(datePreset);
      const { phones: ph, sample: s } = await generateCustomerList({
        start_date: start,
        end_date: end,
        tenantId,
      });
      setPhones(ph);
      setSample(s);
      setPreviewOpen(true);
    } catch (e) {
      console.error(e);
      toast.error(t("生成失败", "Generate failed"));
    } finally {
      setGenerating(false);
    }
  };

  const handleCreateTask = async () => {
    if (selectedIds.length === 0 || phones.length === 0) {
      toast.error(t("请选择员工并确保有名单", "Select employees and ensure list exists"));
      return;
    }
    if (!employee?.id || !tenantId) {
      toast.error(t("请先登录", "Please login"));
      return;
    }
    setLoading(true);
    try {
      const { task_id, distributed } = await createCustomerMaintenanceTask({
        title: `${t("客户维护", "Customer Maintenance")} ${new Date().toLocaleDateString()}`,
        phones,
        assignTo: selectedIds,
        distribute: "even",
        createdBy: employee.id,
        tenantId,
      });
      toast.success(t("创建成功", "Created"));
      setDialogOpen(false);
      setPhones([]);
      setSample([]);
      refetchOpenTasks();
    } catch (e) {
      console.error(e);
      toast.error(t("创建失败", "Create failed"));
    } finally {
      setLoading(false);
    }
  };

  const { start, end } = getDateRangeForPreset(datePreset);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("维护设置", "Maintenance Settings")}</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {t("生成未交易会员名单并分配给员工", "Generate and assign customer list")}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("客户维护", "Customer Maintenance")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>{t("时间范围", "Date Range")}</Label>
            <Select value={datePreset} onValueChange={(v) => setDatePreset(v as DateRangePreset)}>
              <SelectTrigger className="w-[220px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DATE_PRESETS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {t(p.labelZh, p.labelEn)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              {start} ~ {end}
            </p>
          </div>
          <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/50 text-sm">
            <Info className="h-4 w-4 shrink-0 mt-0.5 text-muted-foreground" />
            <div>
              <p className="font-medium mb-1">{t("未交易判定方法", "Untraded Criteria")}</p>
              <p className="text-muted-foreground text-xs">
                {t("在选定日期范围内，从 orders 表查询 status 为 completed/pending 的订单，提取 member_id 与 phone_number；会员表中存在但在该范围内无任何订单的会员即为未交易客户。", "Members with no orders in the selected date range (orders.status in completed/pending) are considered untraded.")}
              </p>
            </div>
          </div>
          <Button onClick={handleGenerate} disabled={generating}>
            {generating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            {t("生成名单", "Generate List")}
          </Button>
          {sample.length > 0 && (
            <Button variant="outline" onClick={() => setPreviewOpen(true)}>
              {t("预览", "Preview")} ({phones.length})
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("已发布任务", "Published Tasks")}</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            {t("删除记录即取消任务发布，任务将从汇率计算工作任务中消失", "Delete removes the task and it will disappear from the task list")}
          </p>
        </CardHeader>
        <CardContent>
          {tasksLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : openTasks.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">{t("暂无进行中的任务", "No active tasks")}</p>
          ) : (
            <div className="space-y-2">
              {openTasks.map((task) => (
                <div
                  key={task.id}
                  className="flex items-center justify-between py-2 px-3 rounded-lg border bg-muted/30"
                >
                  <div>
                    <p className="font-medium">{task.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(task.created_at).toLocaleString(undefined, {
                        year: "numeric",
                        month: "2-digit",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}{" "}
                      · {task.total_items} {t("条", "items")}
                    </p>
                  </div>
                  <AlertDialog open={confirmCloseId === task.id} onOpenChange={(o) => !o && setConfirmCloseId(null)}>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setConfirmCloseId(task.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{t("确认取消任务", "Confirm Cancel Task")}</AlertDialogTitle>
                        <AlertDialogDescription>
                          {t("取消后任务将从任务列表中消失，员工将无法再看到该任务。确定要取消吗？", "Cancelling will remove this task from the task list. Employees will no longer see it. Continue?")}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{t("取消", "Cancel")}</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          onClick={() => handleCloseTask(task.id)}
                          disabled={closingId === task.id}
                        >
                          {closingId === task.id ? <Loader2 className="h-4 w-4 animate-spin" /> : t("取消任务", "Cancel Task")}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("名单预览", "List Preview")}</DialogTitle>
          </DialogHeader>
          <div className="max-h-60 overflow-y-auto space-y-1 text-sm">
            {sample.map((s, i) => (
              <div key={i} className="font-mono">
                {s.phone}
              </div>
            ))}
            {phones.length > sample.length && (
              <p className="text-muted-foreground">... {phones.length - sample.length} more</p>
            )}
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                setPreviewOpen(false);
                setDialogOpen(true);
              }}
            >
              {t("分配员工", "Assign Employees")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("选择员工（平均分配）", "Select Employees (Even)")}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2 max-h-60 overflow-y-auto">
            {employees.map((emp) => (
              <label key={emp.id} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedIds.includes(emp.id)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedIds((prev) => [...prev, emp.id]);
                    } else {
                      setSelectedIds((prev) => prev.filter((id) => id !== emp.id));
                    }
                  }}
                />
                <span>{emp.real_name}</span>
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button onClick={handleCreateTask} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {t("创建并分配", "Create & Assign")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
