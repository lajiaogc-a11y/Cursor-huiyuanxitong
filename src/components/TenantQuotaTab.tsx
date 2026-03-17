import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { listTenantsResult, type TenantItem } from "@/services/tenantService";
import {
  getTenantQuotaStatusResult,
  setTenantQuotaResult,
  type TenantQuotaStatus,
} from "@/services/tenantQuotaService";
import { showServiceErrorToast } from "@/services/serviceErrorToast";
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
        toast.success(t("租户配额已保存", "Tenant quota saved"));
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
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold">{t("租户配额管理", "Tenant Quota Management")}</h3>
            <p className="text-sm text-muted-foreground">
              {t("空值表示不限制；可配置超限策略为硬拦截或仅告警（仅告警会放行并提示）。", "Empty value means unlimited. Exceed strategy can be block or warn-only.")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder={t("搜索租户编码/名称", "Search tenant code/name")}
              className="w-[220px]"
            />
            <Button variant="outline" onClick={() => void loadAll()} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              {t("刷新", "Refresh")}
            </Button>
          </div>
        </div>
      </div>

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
              <TableHead>{t("操作", "Action")}</TableHead>
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
    </div>
  );
}
