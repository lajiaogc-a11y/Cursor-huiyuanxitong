import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Building2, KeyRound, Pencil, Plus, RefreshCw, Trash2, UserCog } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import {
  createTenantWithAdminResult,
  deleteTenantResult,
  listTenantsResult,
  resetTenantAdminPasswordResult,
  updateTenantBasicInfoResult,
  setTenantSuperAdminResult,
  getTenantEmployeesFull,
  type TenantItem,
} from "@/services/tenantService";
import { showServiceErrorToast } from "@/services/serviceErrorToast";

const TENANT_FORM_DRAFT_KEY = "tenant_management_form_draft_v1";
const SYSTEM_TENANT_CODE = "platform";

export default function TenantManagementTab() {
  const { t } = useLanguage();
  const { employee } = useAuth();
  const isPlatformSuperAdmin = employee?.is_platform_super_admin === true;

  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [resettingPwd, setResettingPwd] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [settingSuperAdmin, setSettingSuperAdmin] = useState<string | null>(null);
  const [superAdminTenant, setSuperAdminTenant] = useState<TenantItem | null>(null);
  const [tenantEmployees, setTenantEmployees] = useState<{ id: string; username: string; real_name: string; role: string; is_super_admin: boolean }[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>("");
  const [loadingEmployees, setLoadingEmployees] = useState(false);
  const [tenants, setTenants] = useState<TenantItem[]>([]);
  const [editingTenant, setEditingTenant] = useState<TenantItem | null>(null);
  const [resetPwdTenant, setResetPwdTenant] = useState<TenantItem | null>(null);
  const [deletingTenant, setDeletingTenant] = useState<TenantItem | null>(null);
  const [deleteHasData, setDeleteHasData] = useState(false);
  const [deleteDataDetail, setDeleteDataDetail] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteConfirmCode, setDeleteConfirmCode] = useState("");
  const [superAdminConfirmName, setSuperAdminConfirmName] = useState("");
  const [editTenantCode, setEditTenantCode] = useState("");
  const [editTenantName, setEditTenantName] = useState("");
  const [editTenantStatus, setEditTenantStatus] = useState("active");
  const [newAdminPassword, setNewAdminPassword] = useState("");

  const [tenantCode, setTenantCode] = useState("");
  const [tenantName, setTenantName] = useState("");
  const [adminUsername, setAdminUsername] = useState("");
  const [adminRealName, setAdminRealName] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [formHydrated, setFormHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(TENANT_FORM_DRAFT_KEY);
      if (raw) {
        const draft = JSON.parse(raw) as Partial<{
          tenantCode: string;
          tenantName: string;
          adminUsername: string;
          adminRealName: string;
        }>;
        setTenantCode(draft.tenantCode || "");
        setTenantName(draft.tenantName || "");
        setAdminUsername(draft.adminUsername || "");
        setAdminRealName(draft.adminRealName || "");
      }
    } catch (error) {
      console.error("Failed to restore tenant form draft:", error);
    } finally {
      setFormHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!formHydrated) return;
    const draft = { tenantCode, tenantName, adminUsername, adminRealName };
    localStorage.setItem(TENANT_FORM_DRAFT_KEY, JSON.stringify(draft));
  }, [tenantCode, tenantName, adminUsername, adminRealName, formHydrated]);

  const loadTenants = useCallback(async () => {
    if (!isPlatformSuperAdmin) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const result = await listTenantsResult();
      if (!result.ok) {
        showServiceErrorToast(result.error, t, "加载租户列表失败", "Failed to load tenants");
        return;
      }
      setTenants(result.data);
    } catch (error) {
      console.error(error);
      showServiceErrorToast(error, t, "加载租户列表失败", "Failed to load tenants");
    } finally {
      setLoading(false);
    }
  }, [isPlatformSuperAdmin, t]);

  useEffect(() => {
    void loadTenants();
  }, [loadTenants]);

  const resetForm = () => {
    setTenantCode("");
    setTenantName("");
    setAdminUsername("");
    setAdminRealName("");
    setAdminPassword("");
    localStorage.removeItem(TENANT_FORM_DRAFT_KEY);
  };

  const handleCreateTenant = async () => {
    if (!tenantCode.trim() || !tenantName.trim() || !adminUsername.trim() || !adminRealName.trim() || !adminPassword.trim()) {
      toast.error(t("请完整填写租户和管理员信息", "Please complete tenant and admin fields"));
      return;
    }
    setCreating(true);
    try {
      const result = await createTenantWithAdminResult({ tenantCode, tenantName, adminUsername, adminRealName, adminPassword });
      if (!result.ok) {
        showServiceErrorToast(result.error, t, "创建租户失败", "Create tenant failed");
        return;
      }
      if (result.data?.authSyncSuccess === false) {
        toast.warning(
          result.data.authSyncMessage
            ? t(`租户已创建，但认证同步失败：${result.data.authSyncMessage}`, `Tenant created, but auth sync failed: ${result.data.authSyncMessage}`)
            : t("租户已创建，但认证同步失败，管理员可能无法登录，请通过平台重置密码", "Tenant created but auth sync failed. Admin may not be able to login. Please reset password via platform.")
        );
      }
      toast.success(t("租户创建成功", "Tenant created successfully"));
      resetForm();
      await loadTenants();
    } catch (error) {
      console.error(error);
      showServiceErrorToast(error, t, "创建租户失败", "Create tenant failed");
    } finally {
      setCreating(false);
    }
  };

  // --- Edit ---
  const openEditDialog = (tenant: TenantItem) => {
    setEditingTenant(tenant);
    setEditTenantCode(tenant.tenant_code || "");
    setEditTenantName(tenant.tenant_name || "");
    setEditTenantStatus(tenant.status || "active");
  };
  const closeEditDialog = () => { setEditingTenant(null); };
  const handleUpdateTenant = async () => {
    if (!editingTenant) return;
    if (!editTenantCode.trim() || !editTenantName.trim()) {
      toast.error(t("公司编码和名称不能为空", "Tenant code and name are required"));
      return;
    }
    setUpdating(true);
    try {
      const result = await updateTenantBasicInfoResult({
        tenantId: editingTenant.id, tenantCode: editTenantCode, tenantName: editTenantName, status: editTenantStatus,
      });
      if (!result.ok) {
        showServiceErrorToast(result.error, t, "修改租户失败", "Update tenant failed");
        return;
      }
      toast.success(t("租户信息已更新", "Tenant updated"));
      closeEditDialog();
      await loadTenants();
    } catch (error) {
      console.error(error);
      showServiceErrorToast(error, t, "修改租户失败", "Update tenant failed");
    } finally {
      setUpdating(false);
    }
  };

  // --- Reset Password ---
  const openResetPwdDialog = (tenant: TenantItem) => { setResetPwdTenant(tenant); setNewAdminPassword(""); };
  const closeResetPwdDialog = () => { setResetPwdTenant(null); setNewAdminPassword(""); };
  const handleResetAdminPassword = async () => {
    if (!resetPwdTenant) return;
    if (!newAdminPassword.trim()) { toast.error(t("请输入新密码", "Please enter new password")); return; }
    setResettingPwd(true);
    try {
      const result = await resetTenantAdminPasswordResult({
        tenantId: resetPwdTenant.id, adminEmployeeId: resetPwdTenant.admin_employee_id || null, newPassword: newAdminPassword,
      });
      if (!result.ok) {
        showServiceErrorToast(result.error, t, "重置管理员密码失败", "Reset admin password failed");
        return;
      }
      if (result.data?.authSyncSuccess === false) {
        toast.warning(
          result.data.authSyncMessage
            ? t(`密码已重置，但认证同步失败：${result.data.authSyncMessage}`, `Password reset, but auth sync failed: ${result.data.authSyncMessage}`)
            : t("密码已重置，但认证同步失败，请重试登录", "Password reset but auth sync failed, please try login again")
        );
      }
      toast.success(t(`已重置管理员密码：${result.data?.adminRealName || ""}(${result.data?.adminUsername || ""})`, `Admin password reset: ${result.data?.adminRealName || ""} (${result.data?.adminUsername || ""})`));
      closeResetPwdDialog();
      await loadTenants();
    } catch (error: unknown) {
      console.error("[TenantManagement] Reset password error:", error);
      showServiceErrorToast(error, t, "重置管理员密码失败", "Reset admin password failed");
    } finally {
      setResettingPwd(false);
    }
  };

  // --- Delete ---
  const openDeleteDialog = (tenant: TenantItem) => {
    setDeletingTenant(tenant);
    setDeleteHasData(false);
    setDeleteDataDetail("");
  };
  const closeDeleteDialog = () => {
    setDeletingTenant(null);
    setDeleteHasData(false);
    setDeleteDataDetail("");
    setDeletePassword("");
    setDeleteConfirmCode("");
  };

  const selectedEmployee = useMemo(
    () => tenantEmployees.find((emp) => emp.id === selectedEmployeeId),
    [tenantEmployees, selectedEmployeeId]
  );

  const canSubmitDelete = !!(
    deletingTenant &&
    deletePassword.trim() &&
    deleteConfirmCode.trim() === deletingTenant.tenant_code
  );

  const handleDeleteTenant = async (force: boolean) => {
    if (!deletingTenant) return;
    if (deleteConfirmCode.trim() !== deletingTenant.tenant_code) {
      toast.error(t("请正确输入租户编码后再删除", "Please enter the exact tenant code before deleting"));
      return;
    }
    if (!employee?.username || !deletePassword.trim()) {
      toast.error(t("请输入当前账号密码以确认删除", "Please enter your password to confirm deletion"));
      return;
    }
    setDeleting(true);
    try {
      const result = await deleteTenantResult({
        tenantId: deletingTenant.id,
        force,
        username: employee.username,
        password: deletePassword,
      });
      if (!result.ok) {
        if (result.error.code === "TENANT_HAS_DATA") {
          setDeleteHasData(true);
          setDeleteDataDetail(result.error.message || "");
          return;
        }
        showServiceErrorToast(result.error, t, "删除租户失败", "Delete tenant failed");
        return;
      }
      toast.success(t("租户已删除", "Tenant deleted"));
      closeDeleteDialog();
      await loadTenants();
    } catch (error) {
      console.error(error);
      showServiceErrorToast(error, t, "删除租户失败", "Delete tenant failed");
    } finally {
      setDeleting(false);
    }
  };

  const openSetSuperAdminDialog = async (tenant: TenantItem) => {
    setSuperAdminTenant(tenant);
    setSelectedEmployeeId(tenant.admin_employee_id || "");
    setSuperAdminConfirmName("");
    setLoadingEmployees(true);
    try {
      const emps = await getTenantEmployeesFull(tenant.id);
      setTenantEmployees((emps || []).map((e: any) => ({
        id: e.id,
        username: e.username || "",
        real_name: e.real_name || "",
        role: e.role || "",
        is_super_admin: !!e.is_super_admin,
      })));
      if (tenant.admin_employee_id) setSelectedEmployeeId(tenant.admin_employee_id);
      else if (emps?.length) setSelectedEmployeeId(emps[0].id);
    } catch (e) {
      toast.error(t("加载员工列表失败", "Failed to load employees"));
      setSuperAdminTenant(null);
    } finally {
      setLoadingEmployees(false);
    }
  };

  const handleSetSuperAdmin = async () => {
    if (!superAdminTenant || !selectedEmployeeId) return;
    if (!selectedEmployee) {
      toast.error(t("请选择员工", "Please select an employee"));
      return;
    }
    if (superAdminConfirmName.trim() !== selectedEmployee.username) {
      toast.error(t("确认输入不一致，请输入目标员工账号", "Confirmation mismatch, please input target employee username"));
      return;
    }
    setSettingSuperAdmin(superAdminTenant.id);
    try {
      const result = await setTenantSuperAdminResult(selectedEmployeeId);
      if (result.ok) {
        toast.success(t("已设为总管理员", "Set as super admin"));
        setSuperAdminTenant(null);
        setSuperAdminConfirmName("");
        await loadTenants();
      } else {
        showServiceErrorToast(result.error, t, "设置失败", "Failed");
      }
    } catch (e) {
      showServiceErrorToast(e, t, "设置失败", "Failed");
    } finally {
      setSettingSuperAdmin(null);
    }
  };

  const getStatusLabel = (status: string) => {
    if (status === "active") return t("启用", "Active");
    if (status === "inactive") return t("停用", "Inactive");
    if (status === "suspended") return t("冻结", "Suspended");
    return status;
  };

  if (!isPlatformSuperAdmin) return null;

  return (
    <div className="space-y-4">
      {/* Create tenant form */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            {t("创建公司租户", "Create Company Tenant")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t("公司编码", "Tenant Code")}</Label>
              <Input value={tenantCode} onChange={(e) => setTenantCode(e.target.value)} placeholder="acme" />
            </div>
            <div className="space-y-1.5">
              <Label>{t("公司名称", "Tenant Name")}</Label>
              <Input value={tenantName} onChange={(e) => setTenantName(e.target.value)} placeholder={t("例如：Acme Ltd", "e.g. Acme Ltd")} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("管理员账号", "Admin Username")}</Label>
              <Input value={adminUsername} onChange={(e) => setAdminUsername(e.target.value)} placeholder="admin_acme" />
            </div>
            <div className="space-y-1.5">
              <Label>{t("管理员姓名", "Admin Name")}</Label>
              <Input value={adminRealName} onChange={(e) => setAdminRealName(e.target.value)} placeholder={t("公司管理员", "Company Admin")} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t("管理员初始密码", "Initial Password")}</Label>
            <Input type="password" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} />
            {adminPassword.length > 0 && adminPassword.length < 6 && (
              <p className="text-xs text-destructive">{t("密码至少 6 位", "Password must be at least 6 characters")}</p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button onClick={handleCreateTenant} disabled={creating || adminPassword.length < 6}>
              <Plus className="h-4 w-4 mr-1.5" />
              {creating ? t("创建中...", "Creating...") : t("创建租户", "Create Tenant")}
            </Button>
            <Button variant="outline" onClick={() => void loadTenants()} disabled={loading}>
              <RefreshCw className="h-4 w-4 mr-1.5" />
              {t("刷新", "Refresh")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Tenant list */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t("租户列表", "Tenant List")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("编码", "Code")}</TableHead>
                <TableHead>{t("名称", "Name")}</TableHead>
                <TableHead>{t("管理员账号", "Admin Username")}</TableHead>
                <TableHead>{t("管理员姓名", "Admin Name")}</TableHead>
                <TableHead>{t("状态", "Status")}</TableHead>
                <TableHead className="text-right">{t("操作", "Actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-sm text-muted-foreground">{t("加载中...", "Loading...")}</TableCell>
                </TableRow>
              ) : tenants.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-sm text-muted-foreground">{t("暂无租户数据", "No tenant data")}</TableCell>
                </TableRow>
              ) : (
                tenants.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-mono text-xs">{item.tenant_code}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span>{item.tenant_name}</span>
                        {item.tenant_code === SYSTEM_TENANT_CODE ? (
                          <Badge variant="secondary">
                            {t("系统租户（不可用于业务数据）", "System Tenant (Not for business data)")}
                          </Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{item.admin_username || "-"}</TableCell>
                    <TableCell>{item.admin_real_name || "-"}</TableCell>
                    <TableCell>
                      <Badge variant={item.status === "active" ? "default" : "secondary"}>
                        {getStatusLabel(item.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2 flex-wrap">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openSetSuperAdminDialog(item)}
                          disabled={settingSuperAdmin === item.id || item.tenant_code === SYSTEM_TENANT_CODE}
                        >
                          {settingSuperAdmin === item.id ? t("设置中...", "Setting...") : (
                            <>
                              <UserCog className="h-3.5 w-3.5 mr-1.5" />
                              {t("设为总管理员", "Set Super Admin")}
                            </>
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openEditDialog(item)}
                          disabled={item.tenant_code === SYSTEM_TENANT_CODE}
                        >
                          <Pencil className="h-3.5 w-3.5 mr-1.5" />
                          {t("编辑", "Edit")}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openResetPwdDialog(item)}
                          disabled={item.tenant_code === SYSTEM_TENANT_CODE}
                        >
                          <KeyRound className="h-3.5 w-3.5 mr-1.5" />
                          {t("重置密码", "Reset Pwd")}
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => openDeleteDialog(item)}
                          disabled={item.tenant_code === SYSTEM_TENANT_CODE}
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                          {t("删除", "Delete")}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={!!editingTenant} onOpenChange={(open) => !open && closeEditDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("编辑公司信息", "Edit Company")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>{t("公司编码", "Tenant Code")}</Label>
              <Input value={editTenantCode} onChange={(e) => setEditTenantCode(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("公司名称", "Tenant Name")}</Label>
              <Input value={editTenantName} onChange={(e) => setEditTenantName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("状态", "Status")}</Label>
              <Select value={editTenantStatus} onValueChange={setEditTenantStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">{t("启用", "Active")}</SelectItem>
                  <SelectItem value="inactive">{t("停用", "Inactive")}</SelectItem>
                  <SelectItem value="suspended">{t("冻结", "Suspended")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeEditDialog}>{t("取消", "Cancel")}</Button>
            <Button onClick={handleUpdateTenant} disabled={updating}>
              {updating ? t("保存中...", "Saving...") : t("保存", "Save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog open={!!resetPwdTenant} onOpenChange={(open) => !open && closeResetPwdDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("重置管理员密码", "Reset Admin Password")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">
              {t("租户", "Tenant")}: <span className="text-foreground">{resetPwdTenant?.tenant_name || "-"}</span>
            </div>
            <div className="text-sm text-muted-foreground">
              {t("管理员", "Admin")}: <span className="text-foreground">{resetPwdTenant?.admin_real_name || "-"} ({resetPwdTenant?.admin_username || "-"})</span>
            </div>
            <div className="space-y-1.5">
              <Label>{t("新密码", "New Password")}</Label>
              <Input type="password" value={newAdminPassword} onChange={(e) => setNewAdminPassword(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeResetPwdDialog}>{t("取消", "Cancel")}</Button>
            <Button onClick={handleResetAdminPassword} disabled={resettingPwd}>
              {resettingPwd ? t("重置中...", "Resetting...") : t("确认重置", "Confirm Reset")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Tenant Dialog */}
      <Dialog open={!!deletingTenant} onOpenChange={(open) => !open && closeDeleteDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("删除租户", "Delete Tenant")}</DialogTitle>
            <DialogDescription>
              {deletingTenant?.tenant_name} ({deletingTenant?.tenant_code})
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>{t("确认租户编码", "Confirm Tenant Code")}</Label>
              <Input
                value={deleteConfirmCode}
                onChange={(e) => setDeleteConfirmCode(e.target.value)}
                placeholder={deletingTenant?.tenant_code || ""}
              />
              <p className="text-xs text-muted-foreground">
                {t("请输入租户编码进行二次确认：", "Type tenant code for second confirmation:")}{" "}
                <span className="font-mono text-foreground">{deletingTenant?.tenant_code}</span>
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>{t("当前账号密码", "Your Password")}</Label>
              <Input
                type="password"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                placeholder={t("请输入密码以确认删除", "Enter password to confirm")}
              />
              <p className="text-xs text-muted-foreground">
                {t("删除租户需输入当前登录账号的密码进行验证", "Deleting a tenant requires your password for verification")}
              </p>
            </div>
            {!deleteHasData ? (
              <p className="text-sm text-muted-foreground">
                {t(
                  "确定要删除此租户吗？此操作将删除该租户及其所有员工和配置数据。",
                  "Are you sure you want to delete this tenant? This will remove the tenant and all its employees and configuration."
                )}
              </p>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-destructive font-medium">
                  {t("该租户包含业务数据，无法直接删除：", "This tenant has business data and cannot be deleted directly:")}
                </p>
                <p className="text-xs text-muted-foreground bg-muted p-2 rounded">{deleteDataDetail}</p>
                <p className="text-sm text-destructive">
                  {t(
                    "如果确定要删除，点击「强制删除」将永久删除该租户的所有数据，此操作不可恢复！",
                    "Click 'Force Delete' to permanently delete ALL data for this tenant. This cannot be undone!"
                  )}
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDeleteDialog}>{t("取消", "Cancel")}</Button>
            {!deleteHasData ? (
              <Button variant="destructive" onClick={() => handleDeleteTenant(false)} disabled={deleting || !canSubmitDelete}>
                {deleting ? t("删除中...", "Deleting...") : t("确认删除", "Confirm Delete")}
              </Button>
            ) : (
              <Button variant="destructive" onClick={() => handleDeleteTenant(true)} disabled={deleting || !canSubmitDelete}>
                {deleting ? t("删除中...", "Deleting...") : t("强制删除所有数据", "Force Delete All Data")}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Set Super Admin Dialog */}
      <Dialog open={!!superAdminTenant} onOpenChange={(open) => !open && setSuperAdminTenant(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("设为总管理员", "Set Super Admin")}</DialogTitle>
            <DialogDescription>
              {t("租户", "Tenant")}: {superAdminTenant?.tenant_name} ({superAdminTenant?.tenant_code})
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>{t("选择员工", "Select Employee")}</Label>
              {loadingEmployees ? (
                <p className="text-sm text-muted-foreground">{t("加载中...", "Loading...")}</p>
              ) : tenantEmployees.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("该租户暂无员工", "No employees in this tenant")}</p>
              ) : (
                <Select value={selectedEmployeeId} onValueChange={setSelectedEmployeeId}>
                  <SelectTrigger><SelectValue placeholder={t("选择员工", "Select employee")} /></SelectTrigger>
                  <SelectContent>
                    {tenantEmployees.map((emp) => (
                      <SelectItem key={emp.id} value={emp.id}>
                        {emp.real_name} ({emp.username}) {emp.role === "admin" ? t("管理员", "Admin") : emp.role === "manager" ? t("主管", "Manager") : t("员工", "Staff")}
                        {emp.is_super_admin ? ` [${t("当前总管理员", "Current Super Admin")}]` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>{t("二次确认（输入目标员工账号）", "Second Confirmation (input target username)")}</Label>
              <Input
                value={superAdminConfirmName}
                onChange={(e) => setSuperAdminConfirmName(e.target.value)}
                placeholder={selectedEmployee?.username || t("请输入目标员工账号", "Enter target username")}
              />
              <p className="text-xs text-muted-foreground">
                {t("请准确输入将被设置为总管理员的员工账号", "Please input the exact username to be promoted as super admin")}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setSuperAdminTenant(null); setSuperAdminConfirmName(""); }}>{t("取消", "Cancel")}</Button>
            <Button
              onClick={handleSetSuperAdmin}
              disabled={
                !selectedEmployeeId ||
                tenantEmployees.length === 0 ||
                settingSuperAdmin === superAdminTenant?.id ||
                !selectedEmployee ||
                superAdminConfirmName.trim() !== selectedEmployee.username
              }
            >
              {settingSuperAdmin === superAdminTenant?.id ? t("设置中...", "Setting...") : t("确认设为总管理员", "Confirm Set Super Admin")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
