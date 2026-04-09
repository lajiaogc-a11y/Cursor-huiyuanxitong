import { useCallback, useEffect, useMemo, useState } from "react";
import { notify } from "@/lib/notifyHub";
import { RefreshCw, Search } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useIsMobile } from "@/hooks/ui/use-mobile";
import { listTenantsResult, type TenantItem } from "@/services/tenantService";
import {
  getTenantQuotaStatusResult,
  setTenantQuotaResult,
  type TenantQuotaStatus,
} from "@/services/tenantQuotaService";
import { showServiceErrorToast } from "@/lib/serviceErrorToast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MobileCardList, MobileCard, MobileCardHeader, MobileCardRow, MobileEmptyState } from "@/components/ui/mobile-data-card";

type QuotaDraft = {
  maxEmployees: string;
  maxMembers: string;
  maxDailyOrders: string;
  exceedStrategy: "BLOCK" | "WARN";
};

const toText = (v: number | null | undefined) => (typeof v === "number" && v > 0 ? String(v) : "");
const fromText = (v: string): number | null => {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n);
};

export default function TenantQuotaTab() {
  const { t } = useLanguage();
  const isMobile = useIsMobile();
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState("");
  const [savingTenantId, setSavingTenantId] = useState<string | null>(null);
  const [tenants, setTenants] = useState<TenantItem[]>([]);
  const [statusMap, setStatusMap] = useState<Record<string, TenantQuotaStatus>>({});
  const [draftMap, setDraftMap] = useState<Record<string, QuotaDraft>>({});

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const tenantResult = await listTenantsResult();
      if (!tenantResult.ok) {
        showServiceErrorToast(tenantResult.error, t, "加载租户失败", "Failed to load tenants");
        return;
      }
      setTenants(tenantResult.data);

      const entries = await Promise.all(
        tenantResult.data.map(async (tenant) => {
          const res = await getTenantQuotaStatusResult(tenant.id);
          return { tenantId: tenant.id, res };
        })
      );

      const nextStatus: Record<string, TenantQuotaStatus> = {};
      const nextDraft: Record<string, QuotaDraft> = {};
      entries.forEach(({ tenantId, res }) => {
        if (!res.ok) return;
        nextStatus[tenantId] = res.data;
        nextDraft[tenantId] = {
          maxEmployees: toText(res.data.max_employees),
          maxMembers: toText(res.data.max_members),
          maxDailyOrders: toText(res.data.max_daily_orders),
          exceedStrategy: res.data.exceed_strategy === "WARN" ? "WARN" : "BLOCK",
        };
      });
      setStatusMap(nextStatus);
      setDraftMap(nextDraft);
    } catch (error) {
      console.error(error);
      showServiceErrorToast(error, t, "加载租户配额失败", "Failed to load tenant quotas");
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
    return tenants.filter((tenant) => {
      const code = tenant.tenant_code?.toLowerCase() || "";
      const name = tenant.tenant_name?.toLowerCase() || "";
      return code.includes(kw) || name.includes(kw);
    });
  }, [tenants, keyword]);

  const updateDraft = useCallback((tenantId: string, patch: Partial<QuotaDraft>) => {
    setDraftMap((prev) => ({
      ...prev,
      [tenantId]: {
        maxEmployees: patch.maxEmployees ?? prev[tenantId]?.maxEmployees ?? "",
        maxMembers: patch.maxMembers ?? prev[tenantId]?.maxMembers ?? "",
        maxDailyOrders: patch.maxDailyOrders ?? prev[tenantId]?.maxDailyOrders ?? "",
        exceedStrategy: patch.exceedStrategy ?? prev[tenantId]?.exceedStrategy ?? "BLOCK",
      },
    }));
  }, []);

  const handleSave = useCallback(
    async (tenantId: string) => {
      const draft = draftMap[tenantId] || { maxEmployees: "", maxMembers: "", maxDailyOrders: "", exceedStrategy: "BLOCK" as const };
      setSavingTenantId(tenantId);
      try {
        const result = await setTenantQuotaResult({
          tenantId,
          maxEmployees: fromText(draft.maxEmployees),
          maxMembers: fromText(draft.maxMembers),
          maxDailyOrders: fromText(draft.maxDailyOrders),
          exceedStrategy: draft.exceedStrategy,
        });
        if (!result.ok) {
          showServiceErrorToast(result.error, t, "保存租户配额失败", "Failed to save tenant quota");
          return;
        }
        notify.success(t("租户配额已保存", "Tenant quota saved"));
        const statusResult = await getTenantQuotaStatusResult(tenantId);
        if (statusResult.ok) {
          setStatusMap((prev) => ({ ...prev, [tenantId]: statusResult.data }));
        }
      } catch (error) {
        console.error(error);
        showServiceErrorToast(error, t, "保存租户配额失败", "Failed to save tenant quota");
      } finally {
        setSavingTenantId(null);
      }
    },
    [draftMap, t]
  );

  return (
    <div className="space-y-4">
      <div className="rounded-lg border p-4 space-y-3">
        <div className={isMobile ? "space-y-2" : "flex items-center justify-between gap-2"}>
          <div>
            <h3 className="text-base font-semibold">{t("租户配额管理", "Tenant Quota")}</h3>
            <p className="text-sm text-muted-foreground">
              {t("空值表示不限制；可配置超限策略为硬拦截或仅告警（仅告警会放行并提示）。", "Empty value means unlimited. Exceed strategy can be block or warn-only.")}
            </p>
          </div>
          <div className={isMobile ? "flex items-center gap-2" : "flex items-center gap-2"}>
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder={t("搜索租户", "Search tenant")}
                className={isMobile ? "pl-8 w-full" : "pl-8 w-[220px]"}
              />
            </div>
            <Button variant="outline" onClick={() => void loadAll()} disabled={loading} className="shrink-0 touch-manipulation">
              <RefreshCw className={`h-4 w-4 ${!isMobile ? "mr-2" : ""} ${loading ? "animate-spin" : ""}`} />
              {!isMobile && t("刷新", "Refresh")}
            </Button>
          </div>
        </div>
      </div>

      {isMobile ? (
        <MobileCardList>
          {filteredTenants.length === 0 ? (
            <MobileEmptyState message={t("暂无租户数据", "No tenants")} />
          ) : filteredTenants.map((tenant) => {
            const rowSaving = savingTenantId === tenant.id;
            const draft = draftMap[tenant.id] || { maxEmployees: "", maxMembers: "", maxDailyOrders: "", exceedStrategy: "BLOCK" as const };
            const status = statusMap[tenant.id];
            return (
              <MobileCard key={tenant.id} accent="info">
                <MobileCardHeader>
                  <div className="min-w-0">
                    <span className="text-sm font-medium block truncate">{tenant.tenant_name || "-"}</span>
                    <span className="text-[11px] text-muted-foreground font-mono">{tenant.tenant_code || "-"}</span>
                  </div>
                </MobileCardHeader>

                {/* Quota inputs as labeled fields */}
                <div className="space-y-2.5">
                  <div className="space-y-1">
                    <label className="text-[11px] text-muted-foreground">
                      {t("员工上限", "Employees Limit")}
                      {status?.employees_count != null && (
                        <span className="ml-1 text-foreground font-medium">
                          ({t("当前", "Current")}: {status.employees_count})
                        </span>
                      )}
                    </label>
                    <Input
                      value={draft.maxEmployees}
                      onChange={(e) => updateDraft(tenant.id, { maxEmployees: e.target.value })}
                      placeholder={t("不限", "Unlimited")}
                      className="h-9 text-sm"
                      disabled={rowSaving}
                      inputMode="numeric"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] text-muted-foreground">
                      {t("会员上限", "Members Limit")}
                      {status?.members_count != null && (
                        <span className="ml-1 text-foreground font-medium">
                          ({t("当前", "Current")}: {status.members_count})
                        </span>
                      )}
                    </label>
                    <Input
                      value={draft.maxMembers}
                      onChange={(e) => updateDraft(tenant.id, { maxMembers: e.target.value })}
                      placeholder={t("不限", "Unlimited")}
                      className="h-9 text-sm"
                      disabled={rowSaving}
                      inputMode="numeric"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] text-muted-foreground">
                      {t("日订单上限", "Daily Orders Limit")}
                      {status?.daily_orders_count != null && (
                        <span className="ml-1 text-foreground font-medium">
                          ({t("今日", "Today")}: {status.daily_orders_count})
                        </span>
                      )}
                    </label>
                    <Input
                      value={draft.maxDailyOrders}
                      onChange={(e) => updateDraft(tenant.id, { maxDailyOrders: e.target.value })}
                      placeholder={t("不限", "Unlimited")}
                      className="h-9 text-sm"
                      disabled={rowSaving}
                      inputMode="numeric"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] text-muted-foreground">
                      {t("超限策略", "Exceed Strategy")}
                    </label>
                    <Select
                      value={draft.exceedStrategy}
                      onValueChange={(value) => updateDraft(tenant.id, { exceedStrategy: value as "BLOCK" | "WARN" })}
                      disabled={rowSaving}
                    >
                      <SelectTrigger className="h-9 w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="BLOCK">{t("硬拦截", "Block")}</SelectItem>
                        <SelectItem value="WARN">{t("仅告警", "Warn only")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Button
                  size="sm"
                  className="w-full h-9 touch-manipulation"
                  onClick={() => void handleSave(tenant.id)}
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
                <TableHead>{t("员工上限 / 当前", "Employees Limit / Current")}</TableHead>
                <TableHead>{t("会员上限 / 当前", "Members Limit / Current")}</TableHead>
                <TableHead>{t("日订单上限 / 今日", "Daily Orders Limit / Today")}</TableHead>
                <TableHead>{t("超限策略", "Exceed Strategy")}</TableHead>
                <TableHead>{t("操作", "Actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTenants.map((tenant) => {
                const rowSaving = savingTenantId === tenant.id;
                const draft = draftMap[tenant.id] || { maxEmployees: "", maxMembers: "", maxDailyOrders: "", exceedStrategy: "BLOCK" as const };
                const status = statusMap[tenant.id];
                return (
                  <TableRow key={tenant.id}>
                    <TableCell className="font-medium">{tenant.tenant_code || "-"}</TableCell>
                    <TableCell>{tenant.tenant_name || "-"}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Input
                          value={draft.maxEmployees}
                          onChange={(e) => updateDraft(tenant.id, { maxEmployees: e.target.value })}
                          placeholder={t("不限", "Unlimited")}
                          className="w-[110px]"
                          disabled={rowSaving}
                        />
                        <span className="text-xs text-muted-foreground">{status?.employees_count ?? "-"}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Input
                          value={draft.maxMembers}
                          onChange={(e) => updateDraft(tenant.id, { maxMembers: e.target.value })}
                          placeholder={t("不限", "Unlimited")}
                          className="w-[110px]"
                          disabled={rowSaving}
                        />
                        <span className="text-xs text-muted-foreground">{status?.members_count ?? "-"}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Input
                          value={draft.maxDailyOrders}
                          onChange={(e) => updateDraft(tenant.id, { maxDailyOrders: e.target.value })}
                          placeholder={t("不限", "Unlimited")}
                          className="w-[110px]"
                          disabled={rowSaving}
                        />
                        <span className="text-xs text-muted-foreground">{status?.daily_orders_count ?? "-"}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={draft.exceedStrategy}
                        onValueChange={(value) => updateDraft(tenant.id, { exceedStrategy: value as "BLOCK" | "WARN" })}
                        disabled={rowSaving}
                      >
                        <SelectTrigger className="w-[140px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="BLOCK">{t("硬拦截", "Block")}</SelectItem>
                          <SelectItem value="WARN">{t("仅告警", "Warn only")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Button size="sm" onClick={() => void handleSave(tenant.id)} disabled={rowSaving || loading}>
                        {rowSaving ? <RefreshCw className="h-4 w-4 mr-1 animate-spin" /> : null}
                        {t("保存", "Save")}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
              {filteredTenants.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-6">
                    {t("暂无租户数据", "No tenants")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
