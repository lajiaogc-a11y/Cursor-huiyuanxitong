import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Shield, Plus, Trash2, Save, Info } from "lucide-react";
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { useTenantView } from "@/contexts/TenantViewContext";
import { notify } from "@/lib/notifyHub";
import { Skeleton } from "@/components/ui/skeleton";
import { getSharedDataApi, postSharedDataApi } from "@/services/staff/dataApi/sharedDataApi";

const STORE_KEY = "tenant_staff_login_ip_allowlist";

type Rule = { ip: string; label?: string };
type Config = { enabled: boolean; rules: Rule[] };

function defaultConfig(): Config {
  return { enabled: false, rules: [] };
}

export default function TenantStaffLoginIpTab() {
  const { t } = useLanguage();
  const { employee } = useAuth();
  const { viewingTenantId } = useTenantView() || {};
  const effectiveTenantId = employee?.is_platform_super_admin
    ? viewingTenantId || null
    : employee?.tenant_id || null;

  const [config, setConfig] = useState<Config>(defaultConfig);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newIp, setNewIp] = useState("");
  const [newLabel, setNewLabel] = useState("");

  const load = useCallback(async () => {
    if (!effectiveTenantId) {
      setConfig(defaultConfig());
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const raw = await getSharedDataApi<Config | null>(STORE_KEY, effectiveTenantId);
      if (raw && typeof raw === "object") {
        setConfig({
          enabled: !!raw.enabled,
          rules: Array.isArray(raw.rules) ? raw.rules.filter((r) => r && typeof r.ip === "string" && r.ip.trim()) : [],
        });
      } else {
        setConfig(defaultConfig());
      }
    } catch {
      setConfig(defaultConfig());
    } finally {
      setLoading(false);
    }
  }, [effectiveTenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSave = async () => {
    if (!effectiveTenantId) {
      notify.error(t("请先选择租户", "Select a tenant first"));
      return;
    }
    if (config.enabled && config.rules.length === 0) {
      notify.error(t("开启白名单时请至少添加一个 IP 或网段", "Add at least one IP/CIDR when allowlist is enabled"));
      return;
    }
    setSaving(true);
    try {
      const ok = await postSharedDataApi(STORE_KEY, config, effectiveTenantId);
      if (ok) {
        notify.success(t("员工登录 IP 设置已保存", "Staff login IP settings saved"));
        void load();
      } else {
        notify.error(t("保存失败", "Save failed"));
      }
    } finally {
      setSaving(false);
    }
  };

  const addRule = () => {
    const ip = newIp.trim();
    if (!ip) return;
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/;
    if (!ipRegex.test(ip)) {
      notify.error(t("请输入有效的 IPv4 或 CIDR", "Enter a valid IPv4 or CIDR"));
      return;
    }
    if (config.rules.some((r) => r.ip === ip)) {
      notify.error(t("该 IP 已存在", "IP already exists"));
      return;
    }
    setConfig((prev) => ({
      ...prev,
      rules: [...prev.rules, { ip, label: newLabel.trim() || ip }],
    }));
    setNewIp("");
    setNewLabel("");
  };

  const removeRule = (ip: string) => {
    setConfig((prev) => ({ ...prev, rules: prev.rules.filter((r) => r.ip !== ip) }));
  };

  if (!effectiveTenantId) {
    return (
      <p className="text-sm text-muted-foreground">
        {t("平台总管理请从「租户管理」进入目标租户后再配置；普通员工需绑定租户。", "Platform admins: open a tenant from Tenant Management first.")}
      </p>
    );
  }

  if (loading) {
    return (
      <div className="space-y-3 max-w-3xl">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <Alert className="border-primary/30 bg-muted/40">
        <Info className="h-4 w-4" />
        <AlertTitle className="text-sm">{t("使用提示", "Usage tips")}</AlertTitle>
        <AlertDescription className="text-xs text-muted-foreground space-y-2 mt-2 [&_ul]:list-disc [&_ul]:pl-4 [&_li]:mt-1">
          <ul>
            <li>
              {t(
                "先启用白名单并至少添加一条 IP/CIDR 再保存；列表为空时无法保存，且服务端会在无规则时自动关闭「启用」。",
                "Enable the allowlist and add at least one IP/CIDR before save; empty list blocks save and the server disables “enabled” if there are no rules.",
              )}
            </li>
            <li>
              {t(
                "平台若限制员工登录国家/地区，请在「IP 访问控制」中开启「限制员工端登录地区」并配置国家码（如仅允许名单）。",
                "For platform country restrictions, use IP Access Control → “Restrict staff login by region” and configure codes (e.g. allowlist).",
              )}
            </li>
            <li>
              {t(
                "默认内网/回环不受本白名单限制；若平台开启了「对内网地址也应用 IP 规则」，此处将与全站策略一致（内网也须命中白名单）。",
                "LAN/loopback is exempt by default; if the platform enables “Apply IP rules to private LAN”, this allowlist applies to LAN the same way.",
              )}
            </li>
          </ul>
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            {t("员工登录 IP 白名单", "Staff login IP allowlist")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <p className="text-xs text-muted-foreground">
            {t(
              "开启并填写列表后，仅允许列表中的 IP（或网段）登录本租户员工后台；是否放行内网与平台「对内网地址也应用 IP 规则」一致。平台总管理员不受本租户白名单限制。",
              "When enabled, only listed IPs/CIDRs can log in to this tenant’s staff backend; LAN handling matches the platform “Apply IP rules to private LAN” switch. Platform super admins bypass this list.",
            )}
          </p>
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="tenant-ip-en">{t("启用白名单", "Enable allowlist")}</Label>
            <Switch
              id="tenant-ip-en"
              checked={config.enabled}
              onCheckedChange={(checked) => setConfig((p) => ({ ...p, enabled: checked }))}
            />
          </div>

          {config.enabled && (
            <>
              <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                <div className="space-y-1">
                  <Label className="text-xs">{t("IP / CIDR", "IP / CIDR")}</Label>
                  <Input
                    placeholder="203.0.113.10 或 203.0.113.0/24"
                    value={newIp}
                    onChange={(e) => setNewIp(e.target.value.trim())}
                    onKeyDown={(e) => e.key === "Enter" && addRule()}
                    className="font-mono text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t("备注", "Label")}</Label>
                  <Input
                    placeholder={t("可选", "Optional")}
                    value={newLabel}
                    onChange={(e) => setNewLabel(e.target.value)}
                    className="text-xs"
                  />
                </div>
                <Button type="button" size="sm" variant="secondary" onClick={addRule} className="gap-1 shrink-0">
                  <Plus className="h-3.5 w-3.5" />
                  {t("添加", "Add")}
                </Button>
              </div>

              {config.rules.length === 0 ? (
                <p className="text-xs text-amber-600 dark:text-amber-500">{t("请添加至少一条规则后再保存。", "Add at least one rule before saving.")}</p>
              ) : (
                <ul className="space-y-1 border rounded-md divide-y">
                  {config.rules.map((r) => (
                    <li key={r.ip} className="flex items-center gap-2 px-3 py-2 text-xs">
                      <code className="font-mono bg-muted px-1.5 py-0.5 rounded">{r.ip}</code>
                      <span className="text-muted-foreground flex-1 truncate">{r.label}</span>
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => setRemoveRuleIp(r.ip)} aria-label="Remove">
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Button onClick={() => void handleSave()} disabled={saving} className="gap-2">
        <Save className="h-4 w-4" />
        {saving ? t("保存中…", "Saving…") : t("保存设置", "Save settings")}
      </Button>

      <AlertDialog open={removeRuleIp !== null} onOpenChange={(o) => !o && setRemoveRuleIp(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("从白名单移除该 IP？", "Remove this IP from the allowlist?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                `将从此列表移除「${removeRuleIp ?? "—"}」。须点击「保存设置」后才会生效。`,
                `Removes "${removeRuleIp ?? "—"}" from the list. Click Save settings to apply.`,
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("取消", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                const ip = removeRuleIp;
                setRemoveRuleIp(null);
                if (ip) removeRule(ip);
              }}
            >
              {t("移除", "Remove")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
