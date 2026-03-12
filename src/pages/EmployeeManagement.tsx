import { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { TablePageSkeleton } from "@/components/skeletons/TablePageSkeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { logOperation } from "@/stores/auditLogStore";
import { StickyScrollTableContainer } from "@/components/ui/sticky-scroll-table";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { TablePagination } from "@/components/ui/table-pagination";
import { Search, RefreshCw, Users, Pencil, Plus, Loader2, KeyRound, History, Clock, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useTenantView } from "@/contexts/TenantViewContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import {
  getEmployees,
  getEmployeesForTenant,
  addEmployee,
  updateEmployee,
  deleteEmployee,
  toggleEmployeeStatus,
  getEmployeeNameHistory,
  Employee,
  AppRole,
  ROLE_LABELS,
  NameHistoryEntry,
} from "@/stores/employeeStore";
import { format } from "date-fns";
import { trackRender } from "@/lib/performanceUtils";
import { useIsMobile, useIsTablet } from "@/hooks/use-mobile";
import { MobileCardList, MobileCard, MobileCardHeader, MobileCardRow, MobileCardCollapsible, MobileCardActions, MobilePagination } from "@/components/ui/mobile-data-card";

export default function EmployeeManagement() {
  // Performance tracking
  trackRender('EmployeeManagement');
  
  const { employee: currentEmployee } = useAuth();
  const { isViewingTenant, viewingTenantId } = useTenantView() || {};
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  const useCompactLayout = isMobile || isTablet;
  const { t, tr, language } = useLanguage();
  const queryClient = useQueryClient();
  const { data: employees = [], isLoading } = useQuery({
    queryKey: ['employees-management', viewingTenantId ?? '', currentEmployee?.tenant_id ?? ''],
    queryFn: () =>
      viewingTenantId
        ? getEmployeesForTenant(viewingTenantId)
        : getEmployees(currentEmployee?.tenant_id),
  });
  const refetch = () => queryClient.invalidateQueries({ queryKey: ['employees-management'] });
  const [searchTerm, setSearchTerm] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isResetPasswordOpen, setIsResetPasswordOpen] = useState(false);
  const [resetTarget, setResetTarget] = useState<Employee | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  
  // Name change history
  const [isHistoryDialogOpen, setIsHistoryDialogOpen] = useState(false);
  const [historyTarget, setHistoryTarget] = useState<Employee | null>(null);
  const [nameHistory, setNameHistory] = useState<NameHistoryEntry[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  // Delete employee
  const [deletingEmployee, setDeletingEmployee] = useState<Employee | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  
  const [formData, setFormData] = useState({
    username: "",
    real_name: "",
    role: "staff" as AppRole,
    password: "",
  });

  const isAdminOrManager = currentEmployee?.role === 'admin' || currentEmployee?.role === 'manager';
  
  // 总管理员：来自 Auth 或当前员工列表（平台总管理员查看租户时可能不在列表中）
  const isSuperAdmin = currentEmployee?.is_super_admin === true || employees.find(e => e.id === currentEmployee?.id)?.is_super_admin === true;
  // 平台总管理员：可删除租户内的总管理员/管理员（进入租户时）
  const isPlatformSuperAdmin = currentEmployee?.is_platform_super_admin === true;
  
  // Check if can modify target employee
  const canModifyEmployee = (target: Employee) => {
    if (target.is_super_admin) return isPlatformSuperAdmin; // 仅平台总管理员可删除租户总管理员
    if (target.role === 'admin') return isSuperAdmin;
    return isAdminOrManager;
  };
  
  // Check if can edit target employee
  const canEditEmployee = (target: Employee) => {
    if (isSuperAdmin) return true;
    if (currentEmployee?.role === 'admin') return target.role !== 'admin';
    if (currentEmployee?.role === 'manager') return target.role === 'staff';
    return false;
  };

  // Get role label based on language
  const getRoleLabelDisplay = (role: AppRole): string => {
    switch (role) {
      case 'admin': return tr('employees.admin');
      case 'manager': return tr('employees.manager');
      case 'staff': return tr('employees.staff');
      default: return ROLE_LABELS[role]?.[language as 'zh' | 'en'] || role;
    }
  };

  const handleResetPassword = (employee: Employee) => {
    setResetTarget(employee);
    setNewPassword("");
    setIsResetPasswordOpen(true);
  };

  const confirmResetPassword = async () => {
    if (!resetTarget || !newPassword.trim()) {
      toast.error(tr('employees.enterPassword'));
      return;
    }
    const { validatePassword } = await import('@/lib/passwordValidation');
    const passwordCheck = validatePassword(newPassword);
    if (!passwordCheck.valid) {
      toast.error(passwordCheck.errors[0]);
      return;
    }

    setIsResetting(true);
    try {
      const { data, error } = await supabase.rpc('admin_reset_password', {
        p_admin_id: currentEmployee?.id || '',
        p_target_employee_id: resetTarget.id,
        p_new_password: newPassword
      });

      if (error) {
        toast.error(tr('employees.resetFailed') + ": " + error.message);
        return;
      }

      if (data && data.length > 0 && data[0].success) {
        // 同步密码到 Auth 系统
        try {
          const { error: syncError } = await supabase.functions.invoke('sync-auth-password', {
            body: { username: resetTarget.username, password: newPassword }
          });
          if (syncError) {
            console.warn('Auth sync warning:', syncError.message);
          }
        } catch (syncErr) {
          console.warn('Auth sync failed:', syncErr);
        }
        
        toast.success(t(`已重置 ${resetTarget.real_name} 的密码`, `Reset ${resetTarget.real_name}'s password`));
        setIsResetPasswordOpen(false);
      } else {
        toast.error(data?.[0]?.message || tr('employees.resetFailed'));
      }
    } catch (e: any) {
      toast.error(tr('employees.resetFailed') + ": " + e.message);
    } finally {
      setIsResetting(false);
    }
  };

  // Realtime: auto-refresh employee list on DB changes / account switch
  useEffect(() => {
    const channel = supabase
      .channel('employees-management-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'employees' }, () => {
        queryClient.invalidateQueries({ queryKey: ['employees-management'] });
      })
      .subscribe();
    const handleUserSynced = () => queryClient.invalidateQueries({ queryKey: ['employees-management'] });
    window.addEventListener('userDataSynced', handleUserSynced);
    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener('userDataSynced', handleUserSynced);
    };
  }, [queryClient]);

  // 分页状态
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(() => {
    const saved = localStorage.getItem('employeePageSize');
    return saved ? parseInt(saved) : 20;
  });

  const filteredEmployees = useMemo(() => employees.filter(
    (e) =>
      e.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
      e.real_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      getRoleLabelDisplay(e.role).toLowerCase().includes(searchTerm.toLowerCase())
  ), [employees, searchTerm, getRoleLabelDisplay]);
  
  // 分页计算
  const totalPages = Math.ceil(filteredEmployees.length / pageSize);
  const paginatedEmployees = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredEmployees.slice(start, start + pageSize);
  }, [filteredEmployees, currentPage, pageSize]);
  
  // 搜索变化时重置分页
  useEffect(() => { setCurrentPage(1); }, [searchTerm]);
  
  // 分页大小变化处理
  const handlePageSizeChange = (size: number) => {
    localStorage.setItem('employeePageSize', size.toString());
    setPageSize(size);
    setCurrentPage(1);
  };

  const handleRefresh = () => {
    refetch();
    toast.success(tr('employees.refreshed'));
  };

  const handleAdd = () => {
    setEditingEmployee(null);
    setFormData({
      username: "",
      real_name: "",
      role: "staff",
      password: "",
    });
    setIsDialogOpen(true);
  };

  const handleEdit = (employee: Employee) => {
    setEditingEmployee(employee);
    setFormData({
      username: employee.username,
      real_name: employee.real_name,
      role: employee.role,
      password: "",
    });
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.username || !formData.real_name) {
      toast.error(tr('employees.fillRequired'));
      return;
    }
    if (!editingEmployee && !formData.password) {
      toast.error(tr('employees.fillPassword'));
      return;
    }

    setIsSaving(true);
    try {
      if (editingEmployee) {
        const nameChanged = editingEmployee.real_name !== formData.real_name;
        
        const result = await updateEmployee(
          editingEmployee.id, 
          {
            username: formData.username,
            real_name: formData.real_name,
            role: formData.role,
            ...(formData.password && { password: formData.password }),
          },
          currentEmployee?.id,
          nameChanged ? (language === 'zh' ? '员工管理页面修改' : 'Modified from Employee Management') : undefined
        );
        if (result.success) {
          // 记录操作日志
          logOperation(
            'employee_management',
            'update',
            editingEmployee.id,
            { username: editingEmployee.username, real_name: editingEmployee.real_name, role: editingEmployee.role },
            { username: formData.username, real_name: formData.real_name, role: formData.role },
            `更新员工: ${formData.real_name}`
          );
          
          if (nameChanged) {
            toast.success(t(
              `已更新，姓名变更已记录（${editingEmployee.real_name} → ${formData.real_name}）`,
              `Updated, name change recorded (${editingEmployee.real_name} → ${formData.real_name})`
            ));
          } else {
            toast.success(tr('employees.updated'));
          }
          setIsDialogOpen(false);
          refetch();
        } else {
          toast.error(result.message || tr('employees.updateFailed'));
        }
      } else {
        const result = await addEmployee({
          username: formData.username,
          real_name: formData.real_name,
          role: formData.role,
          password: formData.password,
        });
        if (result.success) {
          // 记录操作日志
          logOperation(
            'employee_management',
            'create',
            result.data?.id || null,
            null,
            { username: formData.username, real_name: formData.real_name, role: formData.role },
            `新增员工: ${formData.real_name}`
          );
          
          toast.success(tr('employees.added'));
          setIsDialogOpen(false);
          refetch();
        } else {
          toast.error(result.message || tr('employees.addFailed'));
        }
      }
    } catch (error) {
      toast.error(tr('employees.saveFailed'));
    } finally {
      setIsSaving(false);
    }
  };

  // View name change history
  const handleViewHistory = async (employee: Employee) => {
    setHistoryTarget(employee);
    setIsHistoryDialogOpen(true);
    setIsLoadingHistory(true);
    try {
      const history = await getEmployeeNameHistory(employee.id);
      setNameHistory(history);
    } catch (error) {
      toast.error(tr('employees.loadHistoryFailed'));
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const handleDeleteEmployee = (employee: Employee) => {
    setDeletingEmployee(employee);
  };

  const confirmDeleteEmployee = async () => {
    if (!deletingEmployee) return;
    if (!canModifyEmployee(deletingEmployee)) {
      toast.error(deletingEmployee.is_super_admin ? tr('employees.superAdminNotModify') : tr('employees.onlySuperAdminModify'));
      setDeletingEmployee(null);
      return;
    }
    setIsDeleting(true);
    try {
      const result = await deleteEmployee(deletingEmployee.id, language as 'zh' | 'en', {
        isPlatformSuperAdmin: currentEmployee?.is_platform_super_admin === true,
      });
      if (result.success) {
        logOperation('employee_management', 'delete', deletingEmployee.id, { username: deletingEmployee.username, real_name: deletingEmployee.real_name }, null, `删除员工: ${deletingEmployee.real_name}`);
        toast.success(t("员工已删除", "Employee deleted"));
        setDeletingEmployee(null);
        refetch();
      } else {
        const msg = result.error_code === 'CANNOT_DELETE_SUPER_ADMIN' ? tr('employees.superAdminNotModify') : (result.error_code === 'EMPLOYEE_NOT_FOUND' ? t("员工不存在", "Employee not found") : (result.error_code === 'NO_PERMISSION' ? t("无权限删除该员工", "No permission to delete this employee") : t("删除失败", "Delete failed")));
        toast.error(msg);
      }
    } catch (error) {
      toast.error(t("删除失败", "Delete failed"));
    } finally {
      setIsDeleting(false);
    }
  };

  const formatDateTime = (dateStr: string) => {
    try {
      return format(new Date(dateStr), 'yyyy-MM-dd HH:mm:ss');
    } catch {
      return dateStr;
    }
  };

  const handleToggleStatus = async (employee: Employee) => {
    if (!canModifyEmployee(employee)) {
      if (employee.is_super_admin) {
        toast.error(tr('employees.superAdminNotModify'));
      } else if (employee.role === 'admin') {
        toast.error(tr('employees.onlySuperAdminModify'));
      }
      return;
    }
    
    const beforeStatus = employee.status;
    const success = await toggleEmployeeStatus(employee.id);
    if (success) {
      const newStatus = beforeStatus === 'active' ? 'inactive' : 'active';
      
      // 记录操作日志
      logOperation(
        'employee_management',
        'status_change',
        employee.id,
        { status: beforeStatus },
        { status: newStatus },
        `${employee.real_name} 状态变更: ${beforeStatus} → ${newStatus}`
      );
      
      toast.success(tr('employees.statusUpdated'));
      refetch();
    }
  };

  const getRoleBadgeVariant = (role: AppRole) => {
    switch (role) {
      case "admin":
        return "default";
      case "manager":
        return "secondary";
      default:
        return "outline";
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-4">
          <div className={isMobile ? "space-y-3" : "flex items-center justify-between"}>
            {!isMobile && (
              <CardTitle className="text-lg flex items-center gap-2">
                <Users className="h-5 w-5" />
                {tr('employees.title')}
              </CardTitle>
            )}
            <div className={isMobile ? "flex flex-col gap-2" : "flex items-center gap-3"}>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={t("搜索...", "Search...")}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className={isMobile ? "pl-9 w-full" : "pl-9 w-64"}
                />
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" onClick={handleRefresh}>
                  <RefreshCw className="h-4 w-4" />
                </Button>
                <Button onClick={handleAdd} className="gap-2 flex-1">
                  <Plus className="h-4 w-4" />
                  {tr('employees.addEmployee')}
                </Button>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <TablePageSkeleton columns={5} rows={6} showTitle={false} />
          ) : (
            <>
              {useCompactLayout ? (
                <MobileCardList>
                  {paginatedEmployees.length === 0 ? (
                    <p className="text-center py-8 text-muted-foreground text-sm">{tr('employees.noData')}</p>
                  ) : paginatedEmployees.map((employee) => (
                    <MobileCard key={employee.id}>
                      <MobileCardHeader>
                        <span className="font-medium text-sm">{employee.real_name}</span>
                        <Badge variant={getRoleBadgeVariant(employee.role)} className="text-xs">
                          {getRoleLabelDisplay(employee.role)}
                        </Badge>
                      </MobileCardHeader>
                      <MobileCardRow label={tr('employees.username')} value={employee.username} />
                      <MobileCardRow label={tr('employees.status')} value={
                        <Switch
                          checked={employee.status === "active"}
                          onCheckedChange={() => handleToggleStatus(employee)}
                          disabled={!canModifyEmployee(employee)}
                          className="scale-75 origin-right"
                        />
                      } />
                      <MobileCardRow label={tr('employees.visibility')} value={
                        <Switch
                          checked={employee.visible}
                          onCheckedChange={async () => {
                            if (!canModifyEmployee(employee)) return;
                            await updateEmployee(employee.id, { visible: !employee.visible });
                            refetch();
                          }}
                          disabled={!canModifyEmployee(employee)}
                          className="scale-75 origin-right"
                        />
                      } />
                      <MobileCardActions>
                        <Button size="sm" variant="outline" className="flex-1 h-8" onClick={() => handleEdit(employee)}>
                          <Pencil className="h-3 w-3 mr-1" />{t("编辑", "Edit")}
                        </Button>
                        {canModifyEmployee(employee) && (
                          <Button size="sm" variant="outline" className="flex-1 h-8" onClick={() => handleResetPassword(employee)}>
                            <KeyRound className="h-3 w-3 mr-1" />{t("重置密码", "Reset Pwd")}
                          </Button>
                        )}
                        {canModifyEmployee(employee) && (
                          <Button size="sm" variant="outline" className="flex-1 h-8 text-destructive border-destructive/30" onClick={() => handleDeleteEmployee(employee)}>
                            <Trash2 className="h-3 w-3 mr-1" />{t("删除", "Delete")}
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" className="h-8 w-8 px-0" onClick={() => handleViewHistory(employee)}>
                          <History className="h-4 w-4" />
                        </Button>
                      </MobileCardActions>
                    </MobileCard>
                  ))}
                  <MobilePagination currentPage={currentPage} totalPages={totalPages} totalItems={filteredEmployees.length} onPageChange={setCurrentPage} pageSize={pageSize} onPageSizeChange={handlePageSizeChange} />
                </MobileCardList>
              ) : (
              <>
              <StickyScrollTableContainer minWidth="800px">
                <Table className="text-xs">
                  <TableHeader className="sticky top-0 z-10 bg-muted/80 backdrop-blur-sm">
                    <TableRow>
                      <TableHead className="text-center whitespace-nowrap px-1.5">{tr('employees.username')}</TableHead>
                      <TableHead className="text-center whitespace-nowrap px-1.5">{tr('employees.realName')}</TableHead>
                      <TableHead className="text-center whitespace-nowrap px-1.5">{tr('employees.role')}</TableHead>
                      <TableHead className="text-center whitespace-nowrap px-1.5">{tr('employees.status')}</TableHead>
                      <TableHead className="text-center whitespace-nowrap px-1.5">{tr('employees.visibility')}</TableHead>
                      <TableHead className="text-center whitespace-nowrap px-1.5 w-[100px]">{tr('common.actions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedEmployees.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          {tr('employees.noData')}
                        </TableCell>
                      </TableRow>
                    ) : (
                      paginatedEmployees.map((employee) => (
                        <TableRow key={employee.id}>
                          <TableCell className="font-medium text-center whitespace-nowrap px-1.5">{employee.username}</TableCell>
                          <TableCell className="text-center whitespace-nowrap px-1.5">
                            {employee.real_name}
                            {employee.is_super_admin && (
                              <Badge variant="destructive" className="ml-2 text-xs">{tr('employees.superAdmin')}</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-center whitespace-nowrap px-1.5">
                            <Badge variant={getRoleBadgeVariant(employee.role)}>
                              {getRoleLabelDisplay(employee.role)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center whitespace-nowrap px-1.5">
                            <Switch
                              checked={employee.status === "active"}
                              onCheckedChange={() => handleToggleStatus(employee)}
                              disabled={!canModifyEmployee(employee)}
                            />
                          </TableCell>
                          <TableCell className="text-center whitespace-nowrap px-1.5">
                            <Switch
                              checked={employee.visible}
                              onCheckedChange={async () => {
                                if (!canModifyEmployee(employee)) {
                                  if (employee.is_super_admin) {
                                    toast.error(tr('employees.superAdminNotModify'));
                                  } else {
                                    toast.error(tr('employees.onlySuperAdminModify'));
                                  }
                                  return;
                                }
                                const result = await updateEmployee(employee.id, { visible: !employee.visible });
                                if (result.success) {
                                  toast.success(employee.visible ? tr('employees.setInvisible') : tr('employees.setVisible'));
                                  refetch();
                                } else {
                                  toast.error(result.message || tr('employees.updateFailed'));
                                }
                              }}
                              disabled={!canModifyEmployee(employee)}
                            />
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center justify-center gap-1">
                              {canEditEmployee(employee) && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => handleEdit(employee)}
                                  title={tr('common.edit')}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => handleViewHistory(employee)}
                                title={tr('employees.nameHistory')}
                              >
                                <History className="h-4 w-4" />
                              </Button>
                              {isAdminOrManager && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => handleResetPassword(employee)}
                                  title={tr('employees.resetPassword')}
                                >
                                  <KeyRound className="h-4 w-4" />
                                </Button>
                              )}
                              {canModifyEmployee(employee) && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-destructive hover:text-destructive"
                                  onClick={() => handleDeleteEmployee(employee)}
                                  title={t("删除", "Delete")}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </StickyScrollTableContainer>
              
              {/* 分页控件 */}
              <TablePagination
                currentPage={currentPage}
                totalPages={totalPages}
                totalItems={filteredEmployees.length}
                pageSize={pageSize}
                onPageChange={setCurrentPage}
                onPageSizeChange={handlePageSizeChange}
                pageSizeOptions={[10, 20, 50, 100]}
              />
              </>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingEmployee ? tr('employees.editEmployee') : tr('employees.addEmployee')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{tr('employees.username')}</Label>
              <Input
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                disabled={editingEmployee?.role === "admin"}
              />
            </div>
            <div className="space-y-2">
              <Label>{tr('employees.nameRequired')}</Label>
              <Input
                value={formData.real_name}
                onChange={(e) => setFormData({ ...formData, real_name: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">{tr('employees.nameUnique')}</p>
            </div>
            <div className="space-y-2">
              <Label>{tr('employees.role')}</Label>
              <Select
                value={formData.role}
                onValueChange={(value: AppRole) => setFormData({ ...formData, role: value })}
                disabled={editingEmployee?.is_super_admin}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin" disabled={!(isSuperAdmin || currentEmployee?.role === 'admin')}>{tr('employees.admin')}</SelectItem>
                  <SelectItem value="manager">{tr('employees.manager')}</SelectItem>
                  <SelectItem value="staff">{tr('employees.staff')}</SelectItem>
                </SelectContent>
              </Select>
              {editingEmployee?.is_super_admin && (
                <p className="text-xs text-muted-foreground">{tr('employees.superAdminRoleFixed')}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>{editingEmployee ? tr('employees.passwordLeaveEmpty') : t('密码', 'Password')}</Label>
              <Input
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              {tr('common.cancel')}
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {tr('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog open={isResetPasswordOpen} onOpenChange={setIsResetPasswordOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{tr('employees.resetPassword')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              {t(`为 `, 'Set new password for ')}
              <span className="font-medium text-foreground">{resetTarget?.real_name}</span>
              {t(` 设置新密码`, '')}
            </p>
            <div className="space-y-2">
              <Label>{tr('employees.newPassword')}</Label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder={tr('employees.passwordPlaceholder')}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsResetPasswordOpen(false)}>
              {tr('common.cancel')}
            </Button>
            <Button onClick={confirmResetPassword} disabled={isResetting}>
              {isResetting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {tr('employees.confirmReset')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Name Change History Dialog */}
      <Dialog open={isHistoryDialogOpen} onOpenChange={setIsHistoryDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              {tr('employees.nameHistory')} - {historyTarget?.real_name}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto">
            {isLoadingHistory ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : nameHistory.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>{tr('employees.noHistory')}</p>
                <p className="text-sm mt-2">{tr('employees.neverChanged')}</p>
              </div>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="text-center">{tr('employees.changeTime')}</TableHead>
                      <TableHead className="text-center">{tr('employees.oldName')}</TableHead>
                      <TableHead className="text-center">{tr('employees.newName')}</TableHead>
                      <TableHead className="text-center">{tr('employees.operator')}</TableHead>
                      <TableHead className="text-center">{tr('common.remark')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {nameHistory.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell className="text-center text-sm">
                          {formatDateTime(entry.changed_at)}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className="text-red-600 border-red-200 bg-red-50">
                            {entry.old_name}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50">
                            {entry.new_name}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center text-sm text-muted-foreground">
                          {entry.changed_by_name || '-'}
                        </TableCell>
                        <TableCell className="text-center text-sm text-muted-foreground">
                          {entry.reason || '-'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsHistoryDialogOpen(false)}>
              {tr('common.close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Employee Confirmation */}
      <AlertDialog open={!!deletingEmployee} onOpenChange={(open) => !open && setDeletingEmployee(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("确认删除员工", "Confirm Delete Employee")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("确定要删除员工 ", "Are you sure you want to delete employee ")}
              <span className="font-semibold text-foreground">{deletingEmployee?.real_name}</span>
              {t(" 吗？此操作不可恢复。", "? This action cannot be undone.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tr('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteEmployee}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              {t("删除", "Delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
