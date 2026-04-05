import { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { TablePageSkeleton } from "@/components/skeletons/TablePageSkeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
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
import { logOperation } from "@/services/audit/auditLogService";
import { StickyScrollTableContainer } from "@/components/ui/sticky-scroll-table";
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
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
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
import { Search, RefreshCw, Pencil, Plus, Loader2, KeyRound, History, Clock, Trash2, LogOut, CircleHelp } from "lucide-react";
import { notify } from "@/lib/notifyHub";
import { useAuth } from "@/contexts/AuthContext";
import { useTenantView } from "@/contexts/TenantViewContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useIsPlatformAdminViewingTenant } from "@/hooks/useIsPlatformAdminViewingTenant";
import {
  getEmployees,
  getEmployeesForTenant,
  addEmployee,
  updateEmployee,
  deleteEmployee,
  forceLogoutEmployee,
  toggleEmployeeStatus,
  getEmployeeNameHistory,
  resetEmployeePassword,
  getEmployeeErrorMessage,
  Employee,
  AppRole,
  ROLE_LABELS,
  NameHistoryEntry,
} from "@/services/employees/employeeCrudService";
import { cn } from "@/lib/utils";
import { formatBeijingTime } from "@/lib/beijingTime";
import { trackRender } from "@/lib/performanceUtils";
import { useIsMobile, useIsTablet } from "@/hooks/use-mobile";
import { MobileCardList, MobileCard, MobileCardHeader, MobileCardRow, MobileCardCollapsible, MobileCardActions, MobilePagination, MobileEmptyState } from "@/components/ui/mobile-data-card";
import { MobileFilterBar } from "@/components/ui/mobile-filter-bar";
import { checkMyTenantQuotaResult, getQuotaExceededText, getQuotaSoftExceededText } from "@/services/tenantQuotaService";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { PageHeader, PageActions, FilterBar, KPIGrid } from "@/components/common";
import { DrawerDetail } from "@/components/shell/DrawerDetail";

export default function EmployeeManagement() {
  // Performance tracking
  trackRender('EmployeeManagement');
  
  const { employee: currentEmployee } = useAuth();
  const { isViewingTenant, viewingTenantId } = useTenantView() || {};
  const effectiveTenantId = currentEmployee?.is_platform_super_admin
    ? viewingTenantId
    : (viewingTenantId || currentEmployee?.tenant_id);
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  const useCompactLayout = isMobile || isTablet;
  const { t, language } = useLanguage();
  const isPlatformAdminReadonlyView = useIsPlatformAdminViewingTenant();
  const queryClient = useQueryClient();
  const { data: employees = [], isLoading } = useQuery({
    queryKey: ['employees-management', effectiveTenantId ?? '', currentEmployee?.tenant_id ?? ''],
    queryFn: () =>
      effectiveTenantId
        ? getEmployeesForTenant(effectiveTenantId)
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
  const [forceLogoutTarget, setForceLogoutTarget] = useState<Employee | null>(null);
  
  const [formData, setFormData] = useState({
    username: "",
    real_name: "",
    role: "staff" as AppRole,
    password: "",
  });

  const isAdminOrManager = currentEmployee?.role === 'admin' || currentEmployee?.role === 'manager';
  const blockReadonly = (actionZh: string, actionEn: string) => {
    if (!isPlatformAdminReadonlyView) return false;
    notify.error(t(`平台总管理查看租户时为只读，无法${actionZh}`, `Read-only in platform admin tenant view: cannot ${actionEn}`));
    return true;
  };
  
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const getRoleLabelDisplay = (role: AppRole): string => {
    switch (role) {
      case 'admin': return t('employees.admin');
      case 'manager': return t('employees.manager');
      case 'staff': return t('employees.staff');
      default: return ROLE_LABELS[role]?.[language as 'zh' | 'en'] || role;
    }
  };

  const handleResetPassword = (employee: Employee) => {
    if (blockReadonly("重置密码", "reset password")) return;
    setResetTarget(employee);
    setNewPassword("");
    setIsResetPasswordOpen(true);
  };

  const confirmResetPassword = async () => {
    if (blockReadonly("重置密码", "reset password")) return;
    if (!resetTarget || !newPassword.trim()) {
      notify.error(t('employees.enterPassword'));
      return;
    }
    const { validatePassword } = await import('@/lib/passwordValidation');
    const passwordCheck = validatePassword(newPassword);
    if (!passwordCheck.valid) {
      notify.error(passwordCheck.errors[0]);
      return;
    }

    setIsResetting(true);
    try {
      const success = await resetEmployeePassword(resetTarget.id, newPassword);
      if (success) {
        notify.success(t(`已重置 ${resetTarget.real_name} 的密码`, `Reset ${resetTarget.real_name}'s password`));
        setIsResetPasswordOpen(false);
      } else {
        notify.error(t('employees.resetFailed'));
      }
    } catch (e: any) {
      notify.error(t('employees.resetFailed') + ": " + e.message);
    } finally {
      setIsResetting(false);
    }
  };

  const requestForceLogout = (target: Employee) => {
    if (blockReadonly("强制下线", "force logout")) return;
    if (!canModifyEmployee(target)) {
      notify.error(t("权限不足，无法强制下线该员工", "No permission to force logout this employee"));
      return;
    }
    if (target.id === currentEmployee?.id) {
      notify.error(t("不能强制下线当前登录账号", "Cannot force logout current account"));
      return;
    }
    setForceLogoutTarget(target);
  };

  const executeForceLogout = async () => {
    const target = forceLogoutTarget;
    setForceLogoutTarget(null);
    if (!target) return;

    try {
      const success = await forceLogoutEmployee(target.id, "admin_force_logout");
      if (!success) {
        notify.error(t("强制下线失败", "Force logout failed"));
        return;
      }

      logOperation(
        "employee_management",
        "force_logout",
        target.id,
        { target_username: target.username },
        { forced: true },
        t(`强制下线员工: ${target.username}`, `Force logout employee: ${target.username}`)
      );
      notify.success(t("已强制下线该员工所有会话", "All sessions have been force logged out"));
    } catch (e: any) {
      notify.error(t("强制下线失败", "Force logout failed") + `: ${e?.message || "unknown"}`);
    }
  };

  // Realtime: auto-refresh employee list on DB changes / account switch
  useEffect(() => {
    const handleUserSynced = () => queryClient.invalidateQueries({ queryKey: ['employees-management'] });
    window.addEventListener('userDataSynced', handleUserSynced);
    return () => {
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
      String(e.username ?? '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      String(e.real_name ?? '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      String(getRoleLabelDisplay(e.role) ?? '').toLowerCase().includes(searchTerm.toLowerCase())
  ), [employees, searchTerm, getRoleLabelDisplay]);
  
  // 分页计算
  const totalPages = Math.ceil(filteredEmployees.length / pageSize);
  const paginatedEmployees = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredEmployees.slice(start, start + pageSize);
  }, [filteredEmployees, currentPage, pageSize]);

  const activeEmployeeCount = useMemo(
    () => employees.filter((e) => e.status === "active").length,
    [employees],
  );
  const employeeKpiItems = useMemo(
    () => [
      { label: t("员工总数", "Total staff"), value: String(employees.length) },
      { label: t("启用中", "Active"), value: String(activeEmployeeCount) },
      { label: t("筛选结果", "Filtered"), value: String(filteredEmployees.length) },
      { label: t("本页", "This page"), value: String(paginatedEmployees.length) },
    ],
    [employees.length, activeEmployeeCount, filteredEmployees.length, paginatedEmployees.length, t],
  );
  
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
    notify.success(t('employees.refreshed'));
  };

  const handleAdd = () => {
    if (blockReadonly("新增员工", "add employee")) return;
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
    if (blockReadonly("编辑员工", "edit employee")) return;
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
    if (blockReadonly(editingEmployee ? "编辑员工" : "新增员工", editingEmployee ? "edit employee" : "add employee")) return;
    if (!formData.username || !formData.real_name) {
      notify.error(t('employees.fillRequired'));
      return;
    }
    if (!editingEmployee && !formData.password) {
      notify.error(t('employees.fillPassword'));
      return;
    }
    // 新增员工时验证密码强度
    if (!editingEmployee && formData.password) {
      const pwd = formData.password;
      if (pwd.length < 8) {
        notify.error(t('密码至少需要8位字符', 'Password must be at least 8 characters'));
        return;
      }
      const hasLetter = /[a-zA-Z]/.test(pwd);
      const hasDigit = /[0-9]/.test(pwd);
      if (!hasLetter || !hasDigit) {
        notify.error(t('密码需包含字母和数字', 'Password must contain both letters and numbers'));
        return;
      }
    }
    // 编辑员工时如果填了新密码也做强度校验
    if (editingEmployee && formData.password) {
      const pwd = formData.password;
      if (pwd.length < 8 || !/[a-zA-Z]/.test(pwd) || !/[0-9]/.test(pwd)) {
        notify.error(t('新密码需至少8位且包含字母和数字', 'New password must be at least 8 characters and contain letters and numbers'));
        return;
      }
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
            t(`更新员工: ${formData.real_name}`, `Update employee: ${formData.real_name}`)
          );
          
          if (nameChanged) {
            notify.success(t(
              `已更新，姓名变更已记录（${editingEmployee.real_name} → ${formData.real_name}）`,
              `Updated, name change recorded (${editingEmployee.real_name} → ${formData.real_name})`
            ));
          } else {
            notify.success(t('employees.updated'));
          }
          setIsDialogOpen(false);
          refetch();
        } else {
          notify.error(result.message || t('employees.updateFailed'));
        }
      } else {
        const quotaResult = await checkMyTenantQuotaResult("employees");
        if (!quotaResult.ok) {
          const quotaText = getQuotaExceededText(quotaResult.error.message);
          notify.error(quotaText ? t(quotaText.zh, quotaText.en) : t("员工数量已达到租户配额上限", "Employee quota exceeded"));
          return;
        }
        const softQuotaText = getQuotaSoftExceededText(quotaResult.data?.message);
        if (softQuotaText) {
          notify.warning(t(softQuotaText.zh, softQuotaText.en));
        }
        const result = await addEmployee({
          username: formData.username,
          real_name: formData.real_name,
          role: formData.role,
          password: formData.password,
          tenant_id: effectiveTenantId || currentEmployee?.tenant_id || null,
        });
        if (result.success) {
          logOperation(
            'employee_management',
            'create',
            result.data?.id ?? "",
            null,
            { username: formData.username, real_name: formData.real_name, role: formData.role },
            t(`新增员工: ${formData.real_name}`, `Add employee: ${formData.real_name}`)
          );
          
          notify.success(t('employees.added'));
          setIsDialogOpen(false);
          refetch();
        } else {
          const lang = language === 'zh' ? 'zh' : 'en';
          const translated = result.error_code ? getEmployeeErrorMessage(result.error_code, lang) : '';
          notify.error(translated && translated !== result.error_code ? translated : (result.message || t('employees.addFailed')));
        }
      }
    } catch (error) {
      notify.error(t('employees.saveFailed'));
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
      notify.error(t('employees.loadHistoryFailed'));
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const handleDeleteEmployee = (employee: Employee) => {
    setDeletingEmployee(employee);
  };

  const confirmDeleteEmployee = async () => {
    if (blockReadonly("删除员工", "delete employee")) return;
    if (!deletingEmployee) return;
    if (!canModifyEmployee(deletingEmployee)) {
      notify.error(deletingEmployee.is_super_admin ? t('employees.superAdminNotModify') : t('employees.onlySuperAdminModify'));
      setDeletingEmployee(null);
      return;
    }
    setIsDeleting(true);
    try {
      const result = await deleteEmployee(deletingEmployee.id, language as 'zh' | 'en');
      if (result.success) {
        logOperation('employee_management', 'delete', deletingEmployee.id, { username: deletingEmployee.username, real_name: deletingEmployee.real_name }, null, t(`删除员工: ${deletingEmployee.real_name}`, `Delete employee: ${deletingEmployee.real_name}`));
        notify.success(t("员工已删除", "Employee deleted"));
        setDeletingEmployee(null);
        refetch();
      } else {
        const msg = result.error_code === 'CANNOT_DELETE_SUPER_ADMIN' ? t('employees.superAdminNotModify') : (result.error_code === 'EMPLOYEE_NOT_FOUND' ? t("员工不存在", "Employee not found") : (result.error_code === 'NO_PERMISSION' ? t("无权限删除该员工", "No permission to delete this employee") : t("删除失败", "Delete failed")));
        notify.error(msg);
      }
    } catch (error) {
      notify.error(t("删除失败", "Delete failed"));
    } finally {
      setIsDeleting(false);
    }
  };

  const formatDateTime = (dateStr: string) => {
    return formatBeijingTime(dateStr);
  };

  const handleToggleStatus = async (employee: Employee) => {
    if (blockReadonly("修改员工状态", "change employee status")) return;
    if (!canModifyEmployee(employee)) {
      if (employee.is_super_admin) {
        notify.error(t('employees.superAdminNotModify'));
      } else if (employee.role === 'admin') {
        notify.error(t('employees.onlySuperAdminModify'));
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
        t(`${employee.real_name} 状态变更: ${beforeStatus} → ${newStatus}`, `${employee.real_name} status change: ${beforeStatus} → ${newStatus}`)
      );
      
      notify.success(t('employees.statusUpdated'));
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

  const visibilityColumnLabel = (
    <span className="inline-flex items-center justify-center gap-0.5">
      <span>{t("employees.visibility")}</span>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="inline-flex shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground hover:bg-muted/80"
            aria-label={t("employees.visibilityHelpAria")}
          >
            <CircleHelp className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" align="end" className="max-w-[min(90vw,320px)] text-left text-xs leading-snug">
          {t("employees.visibilityHelp")}
        </TooltipContent>
      </Tooltip>
    </span>
  );

  return (
    <TooltipProvider delayDuration={200}>
    <div className="flex h-full flex-col gap-4">
      <PageHeader
        description={t(
          "管理员工账号、角色与可见性；支持重置密码与姓名变更记录。",
          "Manage staff accounts, roles, and visibility; reset passwords and view name history.",
        )}
        actions={
          !useCompactLayout ? (
            <PageActions>
              <Button variant="outline" size="icon" onClick={handleRefresh} aria-label={t("刷新", "Refresh")}>
                <RefreshCw className="h-4 w-4" />
              </Button>
              <Button onClick={handleAdd} className="gap-2">
                <Plus className="h-4 w-4" />
                {t("employees.addEmployee")}
              </Button>
            </PageActions>
          ) : undefined
        }
      />

      <KPIGrid items={employeeKpiItems} />

      {!useCompactLayout && (
        <FilterBar>
          <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative min-w-0 max-w-md flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={t("搜索...", "Search...")}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
        </FilterBar>
      )}

      <Card className="flex min-h-0 flex-1 flex-col">
        {useCompactLayout && (
          <CardHeader className="shrink-0 px-2.5 pb-2 pt-2">
            <MobileFilterBar
              searchValue={searchTerm}
              onSearchChange={setSearchTerm}
              placeholder={t("搜索...", "Search...")}
              onRefresh={handleRefresh}
              actions={
                <Button onClick={handleAdd} className="gap-2 flex-1">
                  <Plus className="h-4 w-4" />
                  {t("employees.addEmployee")}
                </Button>
              }
            />
          </CardHeader>
        )}
        <CardContent className="flex min-h-0 flex-1 flex-col space-y-4">
          {isLoading ? (
            <TablePageSkeleton columns={5} rows={6} showTitle={false} />
          ) : (
            <>
              {useCompactLayout ? (
                <MobileCardList>
                  {paginatedEmployees.length === 0 ? (
                    <MobileEmptyState message={t('employees.noData')} />
                  ) : paginatedEmployees.map((employee) => (
                    <MobileCard key={employee.id} accent={employee.status === "active" ? "success" : "muted"}>
                      <MobileCardHeader>
                        <span className="font-medium text-sm">{employee.real_name}</span>
                        <Badge variant={getRoleBadgeVariant(employee.role)} className="text-xs">
                          {getRoleLabelDisplay(employee.role)}
                        </Badge>
                      </MobileCardHeader>
                      <MobileCardRow label={t('employees.username')} value={employee.username} />
                      <MobileCardRow label={t('employees.status')} value={
                        <Switch
                          checked={employee.status === "active"}
                          onCheckedChange={() => handleToggleStatus(employee)}
                          disabled={!canModifyEmployee(employee)}
                          className="scale-75 origin-right"
                        />
                      } />
                      <MobileCardRow label={visibilityColumnLabel} value={
                        <Switch
                          checked={employee.visible}
                          onCheckedChange={async () => {
                            if (isPlatformAdminReadonlyView) {
                              notify.error(t("平台总管理查看租户时为只读，无法修改员工可见性", "Read-only in platform admin tenant view: cannot change employee visibility"));
                              return;
                            }
                            if (!canModifyEmployee(employee)) return;
                            await updateEmployee(employee.id, { visible: !employee.visible });
                            refetch();
                          }}
                          disabled={!canModifyEmployee(employee)}
                          className="scale-75 origin-right"
                        />
                      } />
                      <MobileCardActions>
                        <Button size="sm" variant="outline" className="flex-1 h-9 touch-manipulation" onClick={() => handleEdit(employee)}>
                          <Pencil className="h-3 w-3 mr-1" />{t("编辑", "Edit")}
                        </Button>
                        {canModifyEmployee(employee) && (
                          <Button size="sm" variant="outline" className="flex-1 h-9 touch-manipulation" onClick={() => handleResetPassword(employee)}>
                            <KeyRound className="h-3 w-3 mr-1" />{t("重置密码", "Reset Pwd")}
                          </Button>
                        )}
                        {canModifyEmployee(employee) && (
                          <Button size="sm" variant="outline" className="flex-1 h-9 touch-manipulation text-destructive border-destructive/30" onClick={() => handleDeleteEmployee(employee)}>
                            <Trash2 className="h-3 w-3 mr-1" />{t("删除", "Delete")}
                          </Button>
                        )}
                        {canModifyEmployee(employee) && (
                          <Button size="sm" variant="outline" className="flex-1 h-9 touch-manipulation" onClick={() => requestForceLogout(employee)}>
                            <LogOut className="h-3 w-3 mr-1" />{t("强制下线", "Force Logout")}
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" className="h-9 w-9 px-0 touch-manipulation" onClick={() => handleViewHistory(employee)}>
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
                      <TableHead className="text-center whitespace-nowrap px-1.5">{t('employees.username')}</TableHead>
                      <TableHead className="text-center whitespace-nowrap px-1.5">{t('employees.realName')}</TableHead>
                      <TableHead className="text-center whitespace-nowrap px-1.5">{t('employees.role')}</TableHead>
                      <TableHead className="text-center whitespace-nowrap px-1.5">{t('employees.status')}</TableHead>
                      <TableHead className="text-center whitespace-nowrap px-1.5">{visibilityColumnLabel}</TableHead>
                      <TableHead className="text-center whitespace-nowrap px-1.5 w-[100px]">{t('common.actions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedEmployees.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          {t('employees.noData')}
                        </TableCell>
                      </TableRow>
                    ) : (
                      paginatedEmployees.map((employee) => (
                        <TableRow key={employee.id}>
                          <TableCell className="font-medium text-center whitespace-nowrap px-1.5">{employee.username}</TableCell>
                          <TableCell className="text-center whitespace-nowrap px-1.5">
                            {employee.real_name}
                            {employee.is_super_admin && (
                              <Badge variant="destructive" className="ml-2 text-xs">{t('employees.superAdmin')}</Badge>
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
                                if (isPlatformAdminReadonlyView) {
                                  notify.error(t("平台总管理查看租户时为只读，无法修改员工可见性", "Read-only in platform admin tenant view: cannot change employee visibility"));
                                  return;
                                }
                                if (!canModifyEmployee(employee)) {
                                  if (employee.is_super_admin) {
                                    notify.error(t('employees.superAdminNotModify'));
                                  } else {
                                    notify.error(t('employees.onlySuperAdminModify'));
                                  }
                                  return;
                                }
                                const result = await updateEmployee(employee.id, { visible: !employee.visible });
                                if (result.success) {
                                  notify.success(employee.visible ? t('employees.setInvisible') : t('employees.setVisible'));
                                  refetch();
                                } else {
                                  notify.error(result.message || t('employees.updateFailed'));
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
                                  title={t('common.edit')}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => handleViewHistory(employee)}
                                title={t('employees.nameHistory')}
                              >
                                <History className="h-4 w-4" />
                              </Button>
                              {isAdminOrManager && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => handleResetPassword(employee)}
                                  title={t('employees.resetPassword')}
                                >
                                  <KeyRound className="h-4 w-4" />
                                </Button>
                              )}
                              {canModifyEmployee(employee) && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => requestForceLogout(employee)}
                                  title={t("强制下线", "Force Logout")}
                                >
                                  <LogOut className="h-4 w-4" />
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

      <DrawerDetail
        open={isDialogOpen}
        onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) setEditingEmployee(null);
        }}
        title={editingEmployee ? t("employees.editEmployee") : t("employees.addEmployee")}
        sheetMaxWidth="xl"
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>{t("employees.username")}</Label>
            <Input
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              disabled={editingEmployee?.role === "admin"}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("employees.nameRequired")}</Label>
            <Input
              value={formData.real_name}
              onChange={(e) => setFormData({ ...formData, real_name: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">{t("employees.nameUnique")}</p>
          </div>
          <div className="space-y-2">
            <Label>{t("employees.role")}</Label>
            <Select
              value={formData.role}
              onValueChange={(value: AppRole) => setFormData({ ...formData, role: value })}
              disabled={editingEmployee?.is_super_admin}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin" disabled={!(isSuperAdmin || currentEmployee?.role === "admin")}>
                  {t("employees.admin")}
                </SelectItem>
                <SelectItem value="manager">{t("employees.manager")}</SelectItem>
                <SelectItem value="staff">{t("employees.staff")}</SelectItem>
              </SelectContent>
            </Select>
            {editingEmployee?.is_super_admin && (
              <p className="text-xs text-muted-foreground">{t("employees.superAdminRoleFixed")}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label>{editingEmployee ? t("employees.passwordLeaveEmpty") : t("密码", "Password")}</Label>
            <Input
              type="password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
            />
          </div>
          <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-border pt-4">
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("common.save")}
            </Button>
          </div>
        </div>
      </DrawerDetail>

      <DrawerDetail
        open={isResetPasswordOpen}
        onOpenChange={(open) => {
          setIsResetPasswordOpen(open);
          if (!open) {
            setResetTarget(null);
            setNewPassword("");
          }
        }}
        title={t("employees.resetPassword")}
        sheetMaxWidth="xl"
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {t("employees.setPasswordFor").replace(/\{name\}/g, resetTarget?.real_name ?? "—")}
          </p>
          <div className="space-y-2">
            <Label>{t("employees.newPassword")}</Label>
            <Input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder={t("employees.passwordPlaceholder")}
            />
          </div>
          <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-border pt-4">
            <Button variant="outline" onClick={() => setIsResetPasswordOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={confirmResetPassword} disabled={isResetting}>
              {isResetting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("employees.confirmReset")}
            </Button>
          </div>
        </div>
      </DrawerDetail>

      <DrawerDetail
        open={isHistoryDialogOpen}
        onOpenChange={(open) => {
          setIsHistoryDialogOpen(open);
          if (!open) {
            setHistoryTarget(null);
            setNameHistory([]);
          }
        }}
        title={`${t("employees.nameHistory")}${historyTarget?.real_name ? ` — ${historyTarget.real_name}` : ""}`}
        sheetMaxWidth="3xl"
      >
        <div className="space-y-4">
          {isLoadingHistory ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : nameHistory.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <Clock className="mx-auto mb-4 h-12 w-12 opacity-50" />
              <p>{t("employees.noHistory")}</p>
              <p className="mt-2 text-sm">{t("employees.neverChanged")}</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="text-center">{t("employees.changeTime")}</TableHead>
                    <TableHead className="text-center">{t("employees.oldName")}</TableHead>
                    <TableHead className="text-center">{t("employees.newName")}</TableHead>
                    <TableHead className="text-center">{t("employees.operator")}</TableHead>
                    <TableHead className="text-center">{t("common.remark")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {nameHistory.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="text-center text-sm">{formatDateTime(entry.changed_at)}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className="border-red-200 bg-red-50 text-red-600">
                          {entry.old_name}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className="border-green-200 bg-green-50 text-green-600">
                          {entry.new_name}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center text-sm text-muted-foreground">
                        {entry.changed_by_name || "-"}
                      </TableCell>
                      <TableCell className="text-center text-sm text-muted-foreground">{entry.reason || "-"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
            <Button variant="outline" onClick={() => setIsHistoryDialogOpen(false)}>
              {t("common.close")}
            </Button>
          </div>
        </div>
      </DrawerDetail>

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
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
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

      <ConfirmDialog
        open={!!forceLogoutTarget}
        onOpenChange={(open) => !open && setForceLogoutTarget(null)}
        title={t("强制下线？", "Force logout?")}
        description={
          forceLogoutTarget
            ? t(
                `将断开 ${forceLogoutTarget.real_name}（${forceLogoutTarget.username}）的所有登录会话。`,
                `All sessions for ${forceLogoutTarget.real_name} (${forceLogoutTarget.username}) will be ended.`,
              )
            : undefined
        }
        cancelLabel={t("common.cancel")}
        confirmLabel={t("强制下线", "Force logout")}
        variant="destructive"
        onConfirm={() => void executeForceLogout()}
      />
    </div>
    </TooltipProvider>
  );
}
