import { useCallback, useEffect, useMemo, useState } from "react";
import { notify } from "@/lib/notifyHub";
import { useLanguage } from "@/contexts/LanguageContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { listTenantsResult, type TenantItem } from "@/services/tenantService";
import {
  getMaintenanceModeStatusResult,
  getTenantMaintenanceModesResult,
  setGlobalMaintenanceModeResult,
  setTenantMaintenanceModeResult,
} from "@/services/maintenanceModeService";
import { showServiceErrorToast } from "@/services/serviceErrorToast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RefreshCw, Search } from "lucide-react";
import { MobileCardList, MobileCard, MobileCardHeader, MobileCardRow, MobileEmptyState } from "@/components/ui/mobile-data-card";

type TenantModeState = Record<string, { enabled: boolean; message: string }>;

export default function MaintenanceModeTab() {
  const { t } = useLanguage();
  const isMobile = useIsMobile();
  const [loading, setLoading] = useState(true);
  const [savingGlobal, setSavingGlobal] = useState(false);
  const [savingTenantId, setSavingTenantId] = useState<string | null>(null);
  const [keyword, setKeyword] = useState("");
  const [tenants, setTenants] = useState<TenantItem[]>([]);
  const [globalEnabled, setGlobalEnabled] = useState(false);
  const [globalMessage, setGlobalMessage] = useState("");
  const [tenantModes, setTenantModes] = useState<TenantModeState>({});

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [tenantResult, globalResult, tenantModesResult] = await Promise.all([
        listTenantsResult(),
        getMaintenanceModeStatusResult(null),
        getTenantMaintenanceModesResult(),
      ]);
      if (!tenantResult.ok) {
        showServiceErrorToast(tenantResult.error, t, "加载租户失败", "Failed to load tenants");
        return;
      }
      if (!globalResult.ok) {
        showServiceErrorToast(globalResult.error, t, "加载维护模式失败", "Failed to load maintenance mode");
        return;
      }
      if (!tenantModesResult.ok) {
        showServiceErrorToast(tenantModesResult.error, t, "加载租户维护状态失败", "Failed to load tenant maintenance modes");
        return;
      }

      setTenants(tenantResult.data);
      setGlobalEnabled(globalResult.data.globalEnabled);
      setGlobalMessage(globalResult.data.globalMessage || "");

      const nextTenantModes: TenantModeState = {};
      tenantModesResult.data.forEach((item) => {
        nextTenantModes[item.tenant_id] = {
          enabled: Boolean(item.enabled),
          message: item.message || "",
        };
      });
      setTenantModes(nextTenantModes);
    } catch (error) {
      console.error(error);
      showServiceErrorToast(error, t, "加载维护模式失败", "Failed to load maintenance mode");
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const filteredTenants = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    if (!kw) return tenants;
    return tenants.filter(
      (tenant) =>
        String(tenant.tenant_code ?? '').toLowerCase().includes(kw) ||
        String(tenant.tenant_name ?? '').toLowerCase().includes(kw)
    );
  }, [tenants, keyword]);

  const handleSaveGlobal = useCallback(async () => {
    setSavingGlobal(true);
    try {
      const result = await setGlobalMaintenanceModeResult(globalEnabled, globalMessage);
      if (!result.ok) {
        showServiceErrorToast(result.error, t, "保存全站维护模式失败", "Failed to save global maintenance mode");
        return;
      }
      notify.success(
        globalEnabled
          ? t("已开启全站维护模式", "Global maintenance enabled")
          : t("已关闭全站维护模式", "Global maintenance disabled")
      );
    } catch (error) {
      console.error(error);
      showServiceErrorToast(error, t, "保存全站维护模式失败", "Failed to save global maintenance mode");
    } finally {
      setSavingGlobal(false);
    }
  }, [globalEnabled, globalMessage, t]);

  const updateTenantDraft = useCallback((tenantId: string, patch: Partial<{ enabled: boolean; message: string }>) => {
    setTenantModes((prev) => ({
      ...prev,
      [tenantId]: {
        enabled: patch.enabled ?? prev[tenantId]?.enabled ?? false,
        message: patch.message ?? prev[tenantId]?.message ?? "",
      },
    }));
  }, []);

  const handleSaveTenant = useCallback(
    async (tenantId: string) => {
      const draft = tenantModes[tenantId] || { enabled: false, message: "" };
      setSavingTenantId(tenantId);
      try {
        const result = await setTenantMaintenanceModeResult(tenantId, draft.enabled, draft.message);
        if (!result.ok) {
          showServiceErrorToast(result.error, t, "保存租户维护模式失败", "Failed to save tenant maintenance mode");
          return;
        }
        notify.success(
          draft.enabled
            ? t("已开启租户维护模式", "Tenant maintenance enabled")
            : t("已关闭租户维护模式", "Tenant maintenance disabled")
        );
      } catch (error) {
        console.error(error);
        showServiceErrorToast(error, t, "保存租户维护模式失败", "Failed to save tenant maintenance mode");
      } finally {
        setSavingTenantId(null);
      }
    },
    [tenantModes, t]
  );

  return (
    <div className="space-y-5">
      {/* Global maintenance - works on both mobile and desktop */}
      <div className="rounded-lg border p-4 space-y-3">
        <div className={isMobile ? "space-y-3" : "flex items-center justify-between gap-3"}>
          <div>
            <h3 className="text-base font-semibold">{t("全站维护模式", "Global Maintenance Mode")}</h3>
            <p className="text-sm text-muted-foreground">
              {t("开启后，除平台总管理员外，其余账号会被统一拦截。", "When enabled, all users except platform super admin will be blocked.")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={globalEnabled} onCheckedChange={setGlobalEnabled} />
            <Badge variant={globalEnabled ? "default" : "secondary"}>
              {globalEnabled ? t("已开启", "Enabled") : t("已关闭", "Disabled")}
            </Badge>
          </div>
        </div>
        <Input
          value={globalMessage}
          onChange={(e) => setGlobalMessage(e.target.value)}
          placeholder={t("可选：维护提示文案（留空使用默认文案）", "Optional maintenance message")}
        />
        <div className="flex items-center gap-2">
          <Button onClick={() => void handleSaveGlobal()} disabled={savingGlobal} className="touch-manipulation">
            {savingGlobal ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : null}
            {t("保存全站设置", "Save Global Setting")}
          </Button>
          <Button variant="outline" onClick={() => void loadAll()} disabled={loading} className="touch-manipulation">
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            {t("刷新", "Refresh")}
          </Button>
        </div>
      </div>

      {/* Tenant maintenance */}
      <div className="rounded-lg border p-4 space-y-3">
        <div className={isMobile ? "space-y-2" : "flex items-center justify-between gap-2"}>
          <div>
            <h3 className="text-base font-semibold">{t("租户维护模式", "Tenant Maintenance Mode")}</h3>
            <p className="text-sm text-muted-foreground">
              {t("按租户独立维护，不影响其它租户。", "Tenant-level maintenance does not affect other tenants.")}
            </p>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder={t("搜索租户", "Search tenant")}
              className={isMobile ? "pl-8 w-full" : "pl-8 w-[220px]"}
            />
          </div>
        </div>

        {isMobile ? (
          <MobileCardList>
            {filteredTenants.length === 0 ? (
              <MobileEmptyState message={t("暂无租户数据", "No tenants")} />
            ) : filteredTenants.map((tenant) => {
              const draft = tenantModes[tenant.id] || { enabled: false, message: "" };
              const rowSaving = savingTenantId === tenant.id;
              return (
                <MobileCard key={tenant.id} accent={draft.enabled ? "warning" : "muted"}>
                  <MobileCardHeader>
                    <div className="min-w-0">
                      <span className="text-sm font-medium block truncate">{tenant.tenant_name || "-"}</span>
                      <span className="text-[11px] text-muted-foreground font-mono">{tenant.tenant_code || "-"}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Switch
                        checked={draft.enabled}
                        onCheckedChange={(checked) => updateTenantDraft(tenant.id, { enabled: checked })}
                        disabled={rowSaving || loading}
                      />
                      <Badge variant={draft.enabled ? "default" : "secondary"} className="text-[10px]">
                        {draft.enabled ? t("维护中", "On") : t("正常", "Off")}
                      </Badge>
                    </div>
                  </MobileCardHeader>
                  <Input
                    value={draft.message}
                    onChange={(e) => updateTenantDraft(tenant.id, { message: e.target.value })}
                    placeholder={t("可选维护提示", "Optional message")}
                    disabled={rowSaving}
                    className="h-9 text-sm"
                  />
                  <Button
                    size="sm"
                    className="w-full h-9 touch-manipulation"
                    onClick={() => void handleSaveTenant(tenant.id)}
                    disabled={rowSaving || loading}
                  >
                    {rowSaving ? <RefreshCw className="h-4 w-4 mr-1 animate-spin" /> : null}
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
                  <TableHead>{t("租户编码", "Tenant Code")}</TableHead>
                  <TableHead>{t("租户名称", "Tenant Name")}</TableHead>
                  <TableHead>{t("维护开关", "Maintenance")}</TableHead>
                  <TableHead>{t("维护文案", "Message")}</TableHead>
                  <TableHead>{t("操作", "Actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTenants.map((tenant) => {
                  const draft = tenantModes[tenant.id] || { enabled: false, message: "" };
                  const rowSaving = savingTenantId === tenant.id;
                  return (
                    <TableRow key={tenant.id}>
                      <TableCell className="font-medium">{tenant.tenant_code || "-"}</TableCell>
                      <TableCell>{tenant.tenant_name || "-"}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={draft.enabled}
                            onCheckedChange={(checked) => updateTenantDraft(tenant.id, { enabled: checked })}
                            disabled={rowSaving || loading}
                          />
                          <Badge variant={draft.enabled ? "default" : "secondary"}>
                            {draft.enabled ? t("已开启", "Enabled") : t("已关闭", "Disabled")}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Input
                          value={draft.message}
                          onChange={(e) => updateTenantDraft(tenant.id, { message: e.target.value })}
                          placeholder={t("可选维护提示", "Optional message")}
                          disabled={rowSaving}
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          onClick={() => void handleSaveTenant(tenant.id)}
                          disabled={rowSaving || loading}
                        >
                          {rowSaving ? <RefreshCw className="h-4 w-4 mr-1 animate-spin" /> : null}
                          {t("保存", "Save")}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {filteredTenants.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                      {t("暂无租户数据", "No tenants")}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
