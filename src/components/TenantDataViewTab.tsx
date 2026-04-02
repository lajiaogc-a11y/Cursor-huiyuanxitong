import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LogIn, RefreshCw } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTenantView } from "@/contexts/TenantViewContext";
import { listTenants, type TenantItem } from "@/services/tenantService";
import { notify } from "@/lib/notifyHub";

const SYSTEM_TENANT_CODE = "platform";

export default function TenantDataViewTab() {
  const { t } = useLanguage();
  const { enterTenant } = useTenantView() || {};
  const [tenants, setTenants] = useState<TenantItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [entering, setEntering] = useState<string | null>(null);

  const loadTenants = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listTenants();
      setTenants(data);
    } catch (error) {
      console.error(error);
      notify.error(t("加载租户列表失败", "Failed to load tenants"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadTenants();
  }, [loadTenants]);

  const handleEnterTenant = async (tenant: TenantItem) => {
    if (!enterTenant) return;
    setEntering(tenant.id);
    try {
      await enterTenant(tenant.id, tenant.tenant_name || tenant.tenant_code || "", tenant.tenant_code || "");
    } catch (error) {
      console.error(error);
      notify.error(t("进入租户失败", "Failed to enter tenant"));
    } finally {
      setEntering(null);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">{t("租户数据查看", "View Tenant Data")}</CardTitle>
        <Button variant="outline" size="sm" onClick={loadTenants} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
          {t("刷新", "Refresh")}
        </Button>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-4">
          {t("点击「进入租户」后，将以该租户视角浏览全部真实数据（仪表盘、订单、会员、员工等）；平台总管理员在该视角下为只读，租户不会收到任何通知。", "Click 'Enter Tenant' to browse all real data as that tenant (dashboard, orders, members, employees, etc.); platform super admins are read-only in this view, and tenants are not notified.")}
        </p>
        {loading ? (
          <div className="py-8 text-center text-muted-foreground">{t("加载中...", "Loading...")}</div>
        ) : tenants.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">{t("暂无租户", "No tenants")}</div>
        ) : (
          <div className="space-y-2">
            {tenants
              .map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded-lg border p-3 hover:bg-muted/50"
                >
                  <div>
                    <span className="font-medium">{item.tenant_name}</span>
                    <span className="text-muted-foreground ml-2 font-mono text-sm">({item.tenant_code})</span>
                    {item.tenant_code === SYSTEM_TENANT_CODE ? (
                      <span className="text-xs text-blue-600 ml-2">
                        {t("平台主租户", "Platform Tenant")}
                      </span>
                    ) : null}
                  </div>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => handleEnterTenant(item)}
                    disabled={entering === item.id}
                  >
                    {entering === item.id ? (
                      t("进入中...", "Entering...")
                    ) : (
                      <>
                        <LogIn className="h-3.5 w-3.5 mr-1.5" />
                        {t("进入租户", "Enter Tenant")}
                      </>
                    )}
                  </Button>
                </div>
              ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
