import { useCallback, useEffect, useMemo, useState } from "react";
import { notify } from "@/lib/notifyHub";
import { useLanguage } from "@/contexts/LanguageContext";
import { listTenantsResult, type TenantItem } from "@/services/tenantService";
import {
  FEATURE_FLAGS,
  getTenantFeatureFlagResult,
  setTenantFeatureFlagResult,
} from "@/services/featureFlagService";
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
import { RefreshCw } from "lucide-react";

type RowFlagMap = Record<string, boolean>;

export default function FeatureFlagsTab() {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [keyword, setKeyword] = useState("");
  const [tenants, setTenants] = useState<TenantItem[]>([]);
  const [phoneExtractFlags, setPhoneExtractFlags] = useState<RowFlagMap>({});

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
          const result = await getTenantFeatureFlagResult(tenant.id, FEATURE_FLAGS.PHONE_EXTRACT, true);
          return [tenant.id, result.ok ? result.data : true] as const;
        })
      );
      setPhoneExtractFlags(Object.fromEntries(entries));
    } catch (error) {
      console.error(error);
      showServiceErrorToast(error, t, "加载功能开关失败", "Failed to load feature flags");
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    if (!kw) return tenants;
    return tenants.filter(
      (tenant) =>
        String(tenant.tenant_code ?? '').toLowerCase().includes(kw) ||
        String(tenant.tenant_name ?? '').toLowerCase().includes(kw)
    );
  }, [tenants, keyword]);

  const handleTogglePhoneExtract = useCallback(
    async (tenantId: string, enabled: boolean) => {
      setSaving(tenantId);
      try {
        const result = await setTenantFeatureFlagResult(tenantId, FEATURE_FLAGS.PHONE_EXTRACT, enabled);
        if (!result.ok) {
          showServiceErrorToast(result.error, t, "更新功能开关失败", "Failed to update feature flag");
          return;
        }
        setPhoneExtractFlags((prev) => ({ ...prev, [tenantId]: enabled }));
        notify.success(
          enabled
            ? t("已开启号码提取功能", "Phone extract enabled")
            : t("已关闭号码提取功能", "Phone extract disabled")
        );
      } catch (error) {
        console.error(error);
        showServiceErrorToast(error, t, "更新功能开关失败", "Failed to update feature flag");
      } finally {
        setSaving(null);
      }
    },
    [t]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">{t("租户功能开关", "Tenant Feature Flags")}</h3>
          <p className="text-sm text-muted-foreground">
            {t("先提供号码提取开关，后续可按同样方式扩展更多模块。", "Phone extract flag is enabled first, and more modules can be added in the same way.")}
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

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("租户编码", "Tenant Code")}</TableHead>
              <TableHead>{t("租户名称", "Tenant Name")}</TableHead>
              <TableHead>{t("号码提取", "Phone Extract")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((tenant) => {
              const enabled = phoneExtractFlags[tenant.id] ?? true;
              const rowSaving = saving === tenant.id;
              return (
                <TableRow key={tenant.id}>
                  <TableCell className="font-medium">{tenant.tenant_code || "-"}</TableCell>
                  <TableCell>{tenant.tenant_name || "-"}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={enabled}
                        disabled={rowSaving || loading}
                        onCheckedChange={(checked) => void handleTogglePhoneExtract(tenant.id, checked)}
                      />
                      <Badge variant={enabled ? "default" : "secondary"}>
                        {enabled ? t("已开启", "Enabled") : t("已关闭", "Disabled")}
                      </Badge>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-muted-foreground py-6">
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
