/**
 * 工作任务 - 发动态（海报库）
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, Image as ImageIcon, Users, ExternalLink, Trash2, Pencil } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useTenantView } from "@/contexts/TenantViewContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { toast } from "sonner";
import {
  createPosterTask,
  deleteTaskPoster,
  updateTaskPoster,
  type TaskPoster,
} from "@/services/taskService";
import { useTaskPosters, useTaskPostersEmployees } from "@/hooks/useTaskPosters";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function TasksPosters() {
  const { employee } = useAuth();
  const { viewingTenantId } = useTenantView() || {};
  const { t } = useLanguage();
  const isMobile = useIsMobile();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [assignSelected, setAssignSelected] = useState<string[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [editPoster, setEditPoster] = useState<TaskPoster | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const tenantId = viewingTenantId || employee?.tenant_id;
  const { posters, loading, refetch } = useTaskPosters(tenantId ?? null);
  const { employees, loading: employeesLoading } = useTaskPostersEmployees(tenantId ?? null, dialogOpen);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === posters.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(posters.map((p) => p.id)));
    }
  };

  const handleOpenAssign = () => {
    if (selectedIds.size === 0) {
      toast.error(t("请选择至少一张海报", "Select at least one poster"));
      return;
    }
    setAssignSelected([]);
    setDialogOpen(true);
  };

  const handleCreateTask = async () => {
    if (assignSelected.length === 0 || selectedIds.size === 0) {
      toast.error(t("请选择员工并确保已选海报", "Select employees and posters"));
      return;
    }
    if (!employee?.id || !tenantId) {
      toast.error(t("请先登录", "Please login"));
      return;
    }
    setCreating(true);
    try {
      await createPosterTask({
        title: `${t("发动态", "Post Dynamic")} ${new Date().toLocaleDateString()}`,
        posterIds: [...selectedIds],
        assignTo: assignSelected,
        distribute: "even",
        createdBy: employee.id,
        tenantId,
      });
      toast.success(t("创建成功", "Created"));
      setDialogOpen(false);
      setSelectedIds(new Set());
      refetch();
    } catch (e: any) {
      console.error("Create poster task failed:", e);
      const msg = e?.message || e?.error_description || e?.error?.message || e?.details || t("创建失败", "Create failed");
      toast.error(msg);
    } finally {
      setCreating(false);
    }
  };

  const handleEditOpen = (p: TaskPoster) => {
    setEditPoster(p);
    setEditTitle(p.title || "");
  };

  const handleEditSave = async () => {
    if (!editPoster || !tenantId) return;
    setSavingEdit(true);
    try {
      await updateTaskPoster(editPoster.id, tenantId, { title: editTitle.trim() || undefined });
      toast.success(t("已保存", "Saved"));
      setEditPoster(null);
      refetch();
    } catch (e: any) {
      const msg = e?.message || e?.error_description || e?.error?.message || e?.details || t("保存失败", "Save failed");
      toast.error(msg);
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!tenantId) return;
    setDeletingId(id);
    try {
      await deleteTaskPoster(id, tenantId);
      toast.success(t("已删除", "Deleted"));
      setConfirmDeleteId(null);
      refetch();
    } catch (e: any) {
      const msg = e?.message || e?.error_description || e?.error?.message || e?.details || t("删除失败", "Delete failed");
      toast.error(msg);
    } finally {
      setDeletingId(null);
    }
  };

  const formatDate = (iso: string) => {
    return new Date(iso).toLocaleString(undefined, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const isAdmin = employee?.role === "admin" || employee?.role === "manager";

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t("发动态（海报库）", "Posters")}</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {t("从汇率页面导入海报，分配给员工发布", "Import posters from rates page and assign")}
          </p>
        </div>
        <Link
          to="/exchange-rate?tab=rateSettings"
          className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
        >
          <ExternalLink className="h-4 w-4" />
          {t("去汇率页生成海报", "Go to Rates Page")}
        </Link>
      </div>

      <div className="space-y-6">
        <Card>
        <CardContent className="pt-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : posters.length === 0 ? (
            <div className="py-12 text-center space-y-4">
              <p className="text-muted-foreground">
                {t("海报库为空，请先在汇率页面生成海报并保存", "Poster library is empty. Generate and save posters from the rates page first.")}
              </p>
              <Link to="/exchange-rate?tab=rateSettings">
                <Button>
                  <ImageIcon className="h-4 w-4 mr-2" />
                  {t("去汇率页", "Go to Rates Page")}
                </Button>
              </Link>
            </div>
          ) : (
            <>
              {isAdmin && (
                <div className="mb-4 flex items-center gap-2">
                  <Button
                    size="sm"
                    disabled={selectedIds.size === 0}
                    onClick={handleOpenAssign}
                  >
                    <Users className="h-4 w-4 mr-2" />
                    {t("分配员工", "Assign to Employees")}
                    {selectedIds.size > 0 && (
                      <Badge variant="secondary" className="ml-2">
                        {selectedIds.size}
                      </Badge>
                    )}
                  </Button>
                </div>
              )}

              {isMobile ? (
                <div className="grid grid-cols-2 gap-4">
                  {posters.map((p) => (
                    <div
                      key={p.id}
                      className={cn(
                        "rounded-lg border p-2",
                        isAdmin && selectedIds.has(p.id) && "ring-2 ring-primary"
                      )}
                      onClick={() => isAdmin && toggleSelect(p.id)}
                    >
                      {p.data_url ? (
                        <img
                          src={p.data_url}
                          alt={p.title || ""}
                          className="w-full aspect-[9/16] object-cover rounded"
                        />
                      ) : (
                        <div className="aspect-[9/16] rounded bg-muted flex items-center justify-center">
                          <ImageIcon className="h-8 w-8 text-muted-foreground" />
                        </div>
                      )}
                      <p className="text-xs truncate mt-1">{p.title || "-"}</p>
                      {p.assigned_employee_names?.length ? (
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                          {t("已分配", "Assigned")}: {p.assigned_employee_names.join("、")}
                        </p>
                      ) : null}
                      <div className="mt-2 flex items-center gap-2">
                        {isAdmin && (
                          <input
                            type="checkbox"
                            checked={selectedIds.has(p.id)}
                            onChange={() => toggleSelect(p.id)}
                          />
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEditOpen(p);
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <AlertDialog open={confirmDeleteId === p.id} onOpenChange={(o) => !o && setConfirmDeleteId(null)}>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive shrink-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfirmDeleteId(p.id);
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>{t("确认删除", "Confirm Delete")}</AlertDialogTitle>
                              <AlertDialogDescription>
                                {t("确定要删除这张海报吗？", "Are you sure you want to delete this poster?")}
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>{t("取消", "Cancel")}</AlertDialogCancel>
                              <AlertDialogAction
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                onClick={() => handleDelete(p.id)}
                                disabled={deletingId === p.id}
                              >
                                {deletingId === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : t("删除", "Delete")}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {isAdmin && (
                          <TableHead className="w-12">
                            <input
                              type="checkbox"
                              checked={selectedIds.size === posters.length && posters.length > 0}
                              onChange={toggleSelectAll}
                            />
                          </TableHead>
                        )}
                        <TableHead>{t("预览", "Preview")}</TableHead>
                        <TableHead>{t("标题", "Title")}</TableHead>
                        <TableHead>{t("已分配员工", "Assigned To")}</TableHead>
                        <TableHead>{t("创建时间", "Created")}</TableHead>
                        <TableHead className="w-12">{t("操作", "Actions")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {posters.map((p) => (
                        <TableRow key={p.id}>
                          {isAdmin && (
                            <TableCell>
                              <input
                                type="checkbox"
                                checked={selectedIds.has(p.id)}
                                onChange={() => toggleSelect(p.id)}
                              />
                            </TableCell>
                          )}
                          <TableCell>
                            {p.data_url ? (
                              <img
                                src={p.data_url}
                                alt={p.title || ""}
                                className="h-16 w-auto rounded border object-cover max-w-[80px]"
                              />
                            ) : (
                              <div className="h-16 w-16 rounded border bg-muted flex items-center justify-center">
                                <ImageIcon className="h-6 w-6 text-muted-foreground" />
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate">
                            {p.title || "-"}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm max-w-[180px]">
                            {(p.assigned_employee_names?.length
                              ? p.assigned_employee_names.join("、")
                              : "-")}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {formatDate(p.created_at)}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-0.5">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleEditOpen(p);
                                }}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <AlertDialog open={confirmDeleteId === p.id} onOpenChange={(o) => !o && setConfirmDeleteId(null)}>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-destructive hover:text-destructive"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setConfirmDeleteId(p.id);
                                  }}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>{t("确认删除", "Confirm Delete")}</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    {t("确定要删除这张海报吗？", "Are you sure you want to delete this poster?")}
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>{t("取消", "Cancel")}</AlertDialogCancel>
                                  <AlertDialogAction
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    onClick={() => handleDelete(p.id)}
                                    disabled={deletingId === p.id}
                                  >
                                    {deletingId === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : t("删除", "Delete")}
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("选择员工（平均分配）", "Select Employees (Even)")}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2 max-h-60 overflow-y-auto">
            {employeesLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : employees.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                {t("暂无员工", "No employees")}
              </p>
            ) : (
            employees.map((emp) => (
              <label key={emp.id} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={assignSelected.includes(emp.id)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setAssignSelected((prev) => [...prev, emp.id]);
                    } else {
                      setAssignSelected((prev) => prev.filter((id) => id !== emp.id));
                    }
                  }}
                />
                <span>{emp.real_name}</span>
              </label>
            ))
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => setDialogOpen(false)} variant="outline">
              {t("取消", "Cancel")}
            </Button>
            <Button onClick={handleCreateTask} disabled={creating || employeesLoading || assignSelected.length === 0}>
              {creating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {t("创建并分配", "Create & Assign")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editPoster} onOpenChange={(o) => !o && setEditPoster(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("修改海报", "Edit Poster")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>{t("标题", "Title")}</Label>
              <Input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder={t("海报标题", "Poster title")}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditPoster(null)}>
              {t("取消", "Cancel")}
            </Button>
            <Button onClick={handleEditSave} disabled={savingEdit}>
              {savingEdit ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {t("保存", "Save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
