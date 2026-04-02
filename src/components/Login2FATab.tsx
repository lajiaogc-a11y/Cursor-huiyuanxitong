import { useCallback, useEffect, useMemo, useState } from "react";
import { notify } from "@/lib/notifyHub";
import { useLanguage } from "@/contexts/LanguageContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { listTenantsResult, getTenantEmployeesFull, type TenantItem } from "@/services/tenantService";
import { listTenantEmployeeLogin2faResult, setEmployeeLogin2faResult } from "@/services/login2faService";
import { showServiceErrorToast } from "@/services/serviceErrorToast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RefreshCw } from "lucide-react";
import { MobileCardList, MobileCard, MobileCardHeader, MobileCardRow, MobileEmptyState } from "@/components/ui/mobile-data-card";

type EmployeeLite = {
  id: string;
  username: string;
  real_name: string;
  role: string;
};

type TwoFactorDraft = Record<string, { enabled: boolean; code: string }>;

export default function Login2FATab() {
  const { t } = useLanguage();
  const isMobile = useIsMobile();
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [tenants, setTenants] = useState<TenantItem[]>([]);
  const [tenantId, setTenantId] = useState("");
  const [employees, setEmployees] = useState<EmployeeLite[]>([]);
  const [drafts, setDrafts] = useState<TwoFactorDraft>({});

  const loadTenants = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listTenantsResult();
      if (!result.ok) {
        showServiceErrorToast(result.error, t, "加载租户失败", "Failed to load tenants");
        return;
      }
      setTenants(result.data);
      if (!tenantId && result.data.length > 0) {
        setTenantId(result.data[0].id);
      }
    } catch (error) {
      showServiceErrorToast(error, t, "加载租户失败", "Failed to load tenants");
    } finally {
      setLoading(false);
    }
  }, [t, tenantId]);

  const loadEmployees = useCallback(async () => {
    if (!tenantId) {
      setEmployees([]);
      setDrafts({});
      return;
    }
    setLoading(true);
    try {
      const [employeeRows, statusRows] = await Promise.all([
        getTenantEmployeesFull(tenantId),
        listTenantEmployeeLogin2faResult(tenantId),
      ]);
      const nextEmployees = (employeeRows || []).map((item: any) => ({
        id: item.id,
        username: item.username || "",
        real_name: item.real_name || "",
        role: item.role || "",
      })) as EmployeeLite[];
      setEmployees(nextEmployees);

      const statusMap = new Map<string, boolean>();
      if (statusRows.ok) {
        statusRows.data.forEach((row) => statusMap.set(row.employee_id, !!row.enabled));
      }

      const nextDrafts: TwoFactorDraft = {};
      nextEmployees.forEach((employee) => {
        nextDrafts[employee.id] = {
          enabled: statusMap.get(employee.id) ?? false,
          code: "",
        };
      });
      setDrafts(nextDrafts);
    } catch (error) {
      showServiceErrorToast(error, t, "加载员工2FA配置失败", "Failed to load employee 2FA settings");
    } finally {
      setLoading(false);
    }
  }, [tenantId, t]);

  useEffect(() => {
    void loadTenants();
  }, [loadTenants]);

  useEffect(() => {
    void loadEmployees();
  }, [loadEmployees]);

  const sortedEmployees = useMemo(
    () => [...employees].sort((a, b) => `${a.real_name}${a.username}`.localeCompare(`${b.real_name}${b.username}`)),
    [employees]
  );

  const updateDraft = useCallback((employeeId: string, patch: Partial<{ enabled: boolean; code: string }>) => {
    setDrafts((prev) => ({
      ...prev,
      [employeeId]: {
        enabled: patch.enabled ?? prev[employeeId]?.enabled ?? false,
        code: patch.code ?? prev[employeeId]?.code ?? "",
      },
    }));
  }, []);

  const handleSave = useCallback(
    async (employeeId: string) => {
      const draft = drafts[employeeId];
      if (!draft) return;
      if (draft.enabled && draft.code && !/^\d{6}$/.test(draft.code)) {
        notify.error(t("2FA验证码需为6位数字", "2FA code must be 6 digits"));
        return;
      }
      setSavingId(employeeId);
      try {
        const result = await setEmployeeLogin2faResult(employeeId, draft.enabled, draft.code || undefined);
        if (!result.ok) {
          const msg = result.error.message || "";
          if (msg.includes("TWO_FACTOR_CODE_REQUIRED")) {
            notify.error(t("首次开启2FA必须设置6位验证码", "First time enabling 2FA requires a 6-digit code"));
            return;
          }
          if (msg.includes("INVALID_2FA_CODE_FORMAT")) {
            notify.error(t("2FA验证码格式不正确", "Invalid 2FA code format"));
            return;
          }
          showServiceErrorToast(result.error, t, "保存2FA配置失败", "Failed to save 2FA settings");
          return;
        }
        notify.success(
          draft.enabled
            ? t("2FA已开启", "2FA enabled")
            : t("2FA已关闭", "2FA disabled")
        );
        updateDraft(employeeId, { code: "" });
      } catch (error) {
        showServiceErrorToast(error, t, "保存2FA配置失败", "Failed to save 2FA settings");
      } finally {
        setSavingId(null);
      }
    },
    [drafts, t, updateDraft]
  );

  return (
    <div className="space-y-4">
      {/* ── 2FA 功能尚未完成，禁用交互并提示 ── */}
      <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700 p-4 flex items-start gap-3">
        <span className="text-amber-600 text-lg mt-0.5">⚠️</span>
        <div>
          <p className="font-semibold text-amber-800 dark:text-amber-300">
            {t("功能开发中 · Coming Soon", "Coming Soon · Under Development")}
          </p>
          <p className="text-sm text-amber-700 dark:text-amber-400 mt-1">
            {t(
              "登录二次验证（2FA）功能正在开发中，当前配置不会生效。完成后将自动启用。",
              "Login two-factor authentication (2FA) is under development. Settings saved here will not take effect until the feature is complete."
            )}
          </p>
        </div>
      </div>
      <div className="opacity-50 pointer-events-none select-none" aria-disabled="true">
      <div className="rounded-lg border p-4 space-y-3">
        <h3 className="text-base font-semibold">{t("员工登录2FA", "Employee Login 2FA")}</h3>
        <p className="text-sm text-muted-foreground">
          {t("开启后，该员工登录时需额外输入6位二次验证码。平台总管理员可统一配置。", "When enabled, employee login requires an extra 6-digit second-factor code.")}
        </p>
        <div className={isMobile ? "space-y-2" : "flex items-center gap-2"}>
          <Select value={tenantId} onValueChange={setTenantId}>
            <SelectTrigger className={isMobile ? "w-full" : "w-[320px]"}>
              <SelectValue placeholder={t("选择租户", "Select tenant")} />
            </SelectTrigger>
            <SelectContent>
              {tenants.map((tenant) => (
                <SelectItem key={tenant.id} value={tenant.id}>
                  {(tenant.tenant_name || tenant.tenant_code || tenant.id) as string}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => void loadEmployees()} disabled={loading} className="touch-manipulation">
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            {t("刷新", "Refresh")}
          </Button>
        </div>
      </div>

      {isMobile ? (
        <MobileCardList>
          {sortedEmployees.length === 0 ? (
            <MobileEmptyState message={t("暂无员工数据", "No employees")} />
          ) : sortedEmployees.map((employee) => {
            const draft = drafts[employee.id] || { enabled: false, code: "" };
            const saving = savingId === employee.id;
            return (
              <MobileCard key={employee.id} accent={draft.enabled ? "success" : "muted"}>
                <MobileCardHeader>
                  <div className="min-w-0">
                    <span className="text-sm font-medium block truncate">{employee.real_name || "-"}</span>
                    <span className="text-[11px] text-muted-foreground">{employee.username}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Switch
                      checked={draft.enabled}
                      onCheckedChange={(checked) => updateDraft(employee.id, { enabled: checked })}
                      disabled={saving}
                    />
                    <Badge variant={draft.enabled ? "default" : "secondary"} className="text-[10px]">
                      {draft.enabled ? t("已开启", "On") : t("已关闭", "Off")}
                    </Badge>
                  </div>
                </MobileCardHeader>
                <MobileCardRow label={t("角色", "Role")} value={employee.role || "-"} />
                <div className="space-y-1.5">
                  <label className="text-[11px] text-muted-foreground">
                    {t("设置新验证码（可选）", "Set new code (optional)")}
                  </label>
                  <Input
                    value={draft.code}
                    onChange={(e) =>
                      updateDraft(employee.id, { code: e.target.value.replace(/\D/g, "").slice(0, 6) })
                    }
                    placeholder={t("输入6位数字", "Enter 6 digits")}
                    disabled={saving}
                    inputMode="numeric"
                    maxLength={6}
                    className="h-9 text-sm font-mono tracking-widest"
                  />
                </div>
                <Button
                  size="sm"
                  className="w-full h-9 touch-manipulation"
                  onClick={() => void handleSave(employee.id)}
                  disabled={saving}
                >
                  {saving ? <RefreshCw className="h-4 w-4 mr-1 animate-spin" /> : null}
                  {t("保存", "Save")}
                </Button>
              </MobileCard>
            );
          })}
        </MobileCardList>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("员工", "Employee")}</TableHead>
                <TableHead>{t("角色", "Role")}</TableHead>
                <TableHead>{t("2FA开关", "2FA")}</TableHead>
                <TableHead>{t("设置新验证码（可选）", "Set new code (optional)")}</TableHead>
                <TableHead>{t("操作", "Action")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedEmployees.map((employee) => {
                const draft = drafts[employee.id] || { enabled: false, code: "" };
                const saving = savingId === employee.id;
                return (
                  <TableRow key={employee.id}>
                    <TableCell>
                      <div className="font-medium">{employee.real_name || "-"}</div>
                      <div className="text-xs text-muted-foreground">{employee.username}</div>
                    </TableCell>
                    <TableCell>{employee.role || "-"}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={draft.enabled}
                          onCheckedChange={(checked) => updateDraft(employee.id, { enabled: checked })}
                          disabled={saving}
                        />
                        <Badge variant={draft.enabled ? "default" : "secondary"}>
                          {draft.enabled ? t("已开启", "Enabled") : t("已关闭", "Disabled")}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Input
                        value={draft.code}
                        onChange={(e) =>
                          updateDraft(employee.id, { code: e.target.value.replace(/\D/g, "").slice(0, 6) })
                        }
                        placeholder={t("输入6位数字；留空则不变更", "Enter 6 digits; keep empty to keep current")}
                        disabled={saving}
                        inputMode="numeric"
                        maxLength={6}
                      />
                    </TableCell>
                    <TableCell>
                      <Button size="sm" onClick={() => void handleSave(employee.id)} disabled={saving}>
                        {saving ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : null}
                        {t("保存", "Save")}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
              {sortedEmployees.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    {t("暂无员工数据", "No employees")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}
      </div>{/* end opacity wrapper */}
    </div>
  );
}
