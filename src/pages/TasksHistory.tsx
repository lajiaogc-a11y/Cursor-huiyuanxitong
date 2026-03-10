/**
 * 工作任务 - 维护历史
 * 显示已完成/未完成、分配员工完成情况、完成进度统计
 */
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, Search, Check, Clock, ChevronDown, ChevronRight } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useTenantView } from "@/contexts/TenantViewContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getTaskProgressList, type TaskProgressOverview } from "@/services/taskService";
import { useIsMobile } from "@/hooks/use-mobile";
import { MobileCardList, MobileCard, MobileCardHeader, MobileCardRow } from "@/components/ui/mobile-data-card";
import { cn } from "@/lib/utils";

export default function TasksHistory() {
  const { employee } = useAuth();
  const { viewingTenantId } = useTenantView() || {};
  const { t } = useLanguage();
  const isMobile = useIsMobile();
  const tenantId = viewingTenantId || employee?.tenant_id;
  const [loading, setLoading] = useState(true);
  const [overviews, setOverviews] = useState<TaskProgressOverview[]>([]);
  const [employees, setEmployees] = useState<{ id: string; real_name: string }[]>([]);
  const [employeeId, setEmployeeId] = useState<string>("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [selectedEmpInTask, setSelectedEmpInTask] = useState<string | null>(null);

  const loadEmployees = async () => {
    if (!tenantId) return;
    const { data } = await supabase
      .from("employees")
      .select("id, real_name")
      .eq("tenant_id", tenantId)
      .eq("status", "active")
      .order("real_name");
    setEmployees(data || []);
  };

  const loadHistory = async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const data = await getTaskProgressList({
        tenantId,
        employeeId: employeeId && employeeId !== "all" ? employeeId : undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      });
      setOverviews(data);
    } catch (e) {
      console.error(e);
      toast.error(t("加载失败", "Load failed"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEmployees();
  }, [tenantId]);

  useEffect(() => {
    if (tenantId) {
      loadHistory();
    } else {
      setLoading(false);
    }
  }, [tenantId, employeeId, startDate, endDate]);

  const formatDate = (iso: string | null) => {
    if (!iso) return "-";
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("维护历史", "Maintenance History")}</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {t("查看任务完成进度，支持按员工、日期筛选，显示已完成/未完成及分配员工统计", "View task progress")}
        </p>
      </div>

      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-end gap-4 mb-4">
            <div className="space-y-2">
              <Label className="text-xs">{t("员工", "Employee")}</Label>
              <Select value={employeeId} onValueChange={setEmployeeId}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder={t("全部", "All")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("全部", "All")}</SelectItem>
                  {employees.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.real_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">{t("开始日期", "Start Date")}</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-[140px]"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">{t("结束日期", "End Date")}</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-[140px]"
              />
            </div>
            <Button variant="outline" size="sm" onClick={loadHistory}>
              <Search className="h-4 w-4 mr-2" />
              {t("查询", "Search")}
            </Button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : overviews.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-sm">
              {t("暂无任务", "No tasks")}
            </div>
          ) : (
            <div className="space-y-6">
              {overviews.map((ov) => {
                const isExpanded = expandedTaskId === ov.task_id;
                const empId = isExpanded && selectedEmpInTask ? selectedEmpInTask : (ov.employeeStats[0]?.employee_id ?? null);
                const filteredItems = empId === "_unassigned"
                  ? ov.items.filter((i) => !i.assigned_to)
                  : empId
                    ? ov.items.filter((i) => i.assigned_to === empId)
                    : ov.items;

                return (
                  <Card key={ov.task_id}>
                    <CardHeader
                      className="pb-2 cursor-pointer hover:bg-muted/30 transition-colors rounded-t-lg"
                      onClick={() => {
                        setExpandedTaskId(isExpanded ? null : ov.task_id);
                        setSelectedEmpInTask(isExpanded ? null : (ov.employeeStats[0]?.employee_id ?? null));
                      }}
                    >
                      <CardTitle className="text-base flex items-center justify-between flex-wrap gap-2">
                        <span className="flex items-center gap-2">
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4 shrink-0" />
                          ) : (
                            <ChevronRight className="h-4 w-4 shrink-0" />
                          )}
                          <span className="truncate">{ov.task_title}</span>
                        </span>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge variant="secondary">
                            {ov.done} / {ov.total} {t("已完成", "Done")}
                          </Badge>
                          <span className="text-sm text-muted-foreground font-normal">
                            {ov.total > 0 ? Math.round((ov.done / ov.total) * 100) : 0}%
                          </span>
                        </div>
                      </CardTitle>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {ov.employeeStats.map((es) => (
                          <Badge
                            key={es.employee_id}
                            variant={es.done < es.total ? "outline" : "secondary"}
                            className={cn(
                              "text-xs",
                              es.done < es.total && "border-amber-500/50 text-amber-700 dark:text-amber-400"
                            )}
                          >
                            {es.name}: {es.done}/{es.total}
                            {es.done < es.total && ` ${t("未完成", "Pending")}`}
                          </Badge>
                        ))}
                      </div>
                    </CardHeader>
                    {isExpanded && (
                      <CardContent className="pt-0 border-t">
                        <div className="flex flex-wrap gap-2 mb-3">
                          {ov.employeeStats.map((es) => (
                            <Button
                              key={es.employee_id}
                              variant={selectedEmpInTask === es.employee_id ? "default" : "outline"}
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedEmpInTask(es.employee_id);
                              }}
                            >
                              {es.name}: {es.done}/{es.total}
                              {es.done < es.total && ` ${t("未完成", "Pending")}`}
                            </Button>
                          ))}
                        </div>
                        {isMobile ? (
                          <MobileCardList>
                            {filteredItems.map((item) => (
                              <MobileCard key={item.id}>
                                <MobileCardHeader>
                                  <span className={item.display_label === "海报" ? "" : "font-mono"}>
                                    {item.display_label}
                                  </span>
                                  <span className="flex items-center gap-1 text-xs">
                                    {item.status === "done" ? (
                                      <Check className="h-3.5 w-3.5 text-green-600" />
                                    ) : (
                                      <Clock className="h-3.5 w-3.5 text-amber-500" />
                                    )}
                                    {item.status === "done" ? t("已完成", "Done") : t("未完成", "Pending")}
                                  </span>
                                </MobileCardHeader>
                                <MobileCardRow label={item.status === "done" ? t("完成时间", "Done At") : t("状态", "Status")} value={item.done_at ? formatDate(item.done_at) : t("未完成", "Pending")} />
                                {item.remark && <MobileCardRow label={t("备注", "Remark")} value={item.remark} />}
                              </MobileCard>
                            ))}
                          </MobileCardList>
                        ) : (
                          <div className="rounded-md border overflow-x-auto">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>{t("号码/海报", "Phone/Poster")}</TableHead>
                                  <TableHead>{t("状态", "Status")}</TableHead>
                                  <TableHead>{t("完成时间", "Done At")}</TableHead>
                                  <TableHead>{t("备注", "Remark")}</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {filteredItems.map((item) => (
                                  <TableRow
                                    key={item.id}
                                    className={cn(item.status === "done" && "bg-muted/30")}
                                  >
                                    <TableCell className={item.display_label !== "海报" ? "font-mono" : ""}>
                                      {item.display_label}
                                    </TableCell>
                                    <TableCell>
                                      <span className="flex items-center gap-1.5">
                                        {item.status === "done" ? (
                                          <Check className="h-4 w-4 text-green-600" />
                                        ) : (
                                          <Clock className="h-4 w-4 text-amber-500" />
                                        )}
                                        {item.status === "done" ? t("已完成", "Done") : t("未完成", "Pending")}
                                      </span>
                                    </TableCell>
                                    <TableCell className="text-muted-foreground text-sm">
                                      {formatDate(item.done_at)}
                                    </TableCell>
                                    <TableCell className="max-w-[120px] truncate">{item.remark || "-"}</TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        )}
                      </CardContent>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
