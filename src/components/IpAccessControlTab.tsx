import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Shield, Plus, Trash2, Save, Globe, AlertTriangle, MapPin, Info } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { upsertDataSetting, type IpAccessControlNormalized } from "@/services/staff/dataApi/permissionsAndSettings";
import { apiClient } from "@/lib/apiClient";
import { useLanguage } from "@/contexts/LanguageContext";
import { notify } from "@/lib/notifyHub";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

const SETTING_KEY = "ip_access_control";

/** 常用 ISO 3166-1 alpha-2，便于一键加入禁止列表 */
const QUICK_BLOCK_COUNTRIES: { code: string; zh: string; en: string }[] = [
  { code: "CN", zh: "中国", en: "China" },
  { code: "US", zh: "美国", en: "United States" },
  { code: "RU", zh: "俄罗斯", en: "Russia" },
  { code: "IR", zh: "伊朗", en: "Iran" },
  { code: "KP", zh: "朝鲜", en: "DPRK" },
  { code: "MM", zh: "缅甸", en: "Myanmar" },
];

function defaultConfig(): IpAccessControlNormalized {
  return {
    enabled: false,
    mode: "whitelist",
    rules: [],
    enforce_private_lan: false,
    country_restrict_login: false,
    country_mode: "block",
    country_codes: [],
  };
}

export default function IpAccessControlTab() {
  const { t, language } = useLanguage();
  const [config, setConfig] = useState<IpAccessControlNormalized>(defaultConfig);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newIp, setNewIp] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newCountryCode, setNewCountryCode] = useState("");
  const [pendingRemove, setPendingRemove] = useState<null | { type: "ip"; value: string } | { type: "country"; value: string }>(
    null,
  );

  useEffect(() => {
    const load = async () => {
      try {
        const data = await apiClient.get<IpAccessControlNormalized>("/api/data/settings/ip-access-control");
        if (data && typeof data === "object") {
          setConfig({
            ...defaultConfig(),
            ...data,
            rules: Array.isArray(data.rules) ? data.rules : [],
            enforce_private_lan: data.enforce_private_lan === true,
          });
        }
      } catch (err) {
        console.error("Failed to load IP config:", err);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  const handleSave = async () => {
    if (config.enabled && config.mode === "whitelist" && config.rules.length === 0) {
      notify.error(
        t(
          "白名单模式下请至少添加一条 IP/CIDR，否则规则不生效（等同于未启用）。",
          "Whitelist mode needs at least one IP/CIDR or rules have no effect.",
        ),
      );
      return;
    }
    if (config.country_restrict_login && config.country_codes.length === 0) {
      notify.error(
        t(
          "已开启「限制员工端登录地区」时，请至少添加一个国家/地区两位码，否则不会按地区拦截。",
          "When staff region restriction is on, add at least one 2-letter country code.",
        ),
      );
      return;
    }
    setSaving(true);
    try {
      await upsertDataSetting(SETTING_KEY, config);
      notify.success(t("IP访问控制设置已保存", "IP access control saved"));
    } catch (err) {
      notify.error(t("保存失败", "Save failed"));
    } finally {
      setSaving(false);
    }
  };

  const addRule = () => {
    const ip = newIp.trim();
    if (!ip) return;

    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/;
    if (!ipRegex.test(ip)) {
      notify.error(t("请输入有效的IP地址或CIDR", "Please enter a valid IP or CIDR"));
      return;
    }

    if (config.rules.some((r) => r.ip === ip)) {
      notify.error(t("该IP已存在", "IP already exists"));
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
    setConfig((prev) => ({
      ...prev,
      rules: prev.rules.filter((r) => r.ip !== ip),
    }));
  };

  const addCountryCode = (raw: string) => {
    const code = raw.trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(code)) {
      notify.error(t("请输入两位国家/地区代码（如 CN、US）", "Enter a 2-letter country code (e.g. CN, US)"));
      return;
    }
    if (config.country_codes.includes(code)) {
      notify.error(t("该国家/地区已在列表中", "Already in list"));
      return;
    }
    setConfig((prev) => ({
      ...prev,
      country_codes: [...prev.country_codes, code].sort(),
    }));
    setNewCountryCode("");
  };

  const removeCountryCode = (code: string) => {
    setConfig((prev) => ({
      ...prev,
      country_codes: prev.country_codes.filter((c) => c !== code),
    }));
  };

  if (loading) {
    return (
      <div className="space-y-3">
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
                "租户员工登录 IP 白名单：在租户设置中先启用，并至少添加一条 IP/CIDR 再保存；无规则时服务端会自动关闭「启用」。",
                "Tenant staff IP allowlist: enable and add at least one IP/CIDR before save; the server turns off “enabled” if the list is empty.",
              )}
            </li>
            <li>
              {t(
                "平台「仅允许部分国家」：选择「仅允许以下国家/地区登录」，把允许的两位码加入列表，并开启「限制员工端登录地区」。",
                "Platform allowlist countries: choose “Allow only listed countries/regions”, add ISO codes, and turn on “Restrict staff login by region”.",
              )}
            </li>
            <li>
              {t(
                "若需内网/回环也受本页 IP 名单约束，请开启下方「对内网地址也应用 IP 规则」；默认与全站 API 中间件一致（内网放行），租户员工登录白名单与此开关同步。",
                "To enforce IP rules on LAN/loopback too, enable “Apply IP rules to private LAN” below; default matches site-wide API middleware (LAN exempt), and tenant staff allowlist follows the same switch.",
              )}
            </li>
          </ul>
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            {t("IP 地址规则（API）", "IP rules (API)")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">{t("启用 IP 规则", "Enable IP rules")}</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t(
                  "开启且填写下方列表后，对 /api 请求按白名单或黑名单拦截；默认内网 IP 不受限，可单独开启「对内网也应用」。与国家/地区登录限制相互独立。",
                  "When on and the list is non-empty, /api is filtered by whitelist or blacklist; LAN is exempt by default unless you enable “Apply to private LAN”. Independent from country login rules.",
                )}
              </p>
            </div>
            <Switch
              checked={config.enabled}
              onCheckedChange={(checked) => setConfig((prev) => ({ ...prev, enabled: checked }))}
            />
          </div>

          {config.enabled && (
            <div className="flex items-center justify-between gap-4 rounded-lg border bg-muted/20 px-3 py-2">
              <div>
                <Label className="text-sm font-medium">{t("对内网地址也应用 IP 规则", "Apply IP rules to private LAN")}</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t(
                    "开启后 10.x、192.168.x、172.16–31 与回环须命中名单（白名单须包含办公网段）。租户员工登录白名单与此一致。",
                    "When on, RFC1918 and loopback must match the list (whitelist must include office CIDRs). Tenant staff allowlist follows this.",
                  )}
                </p>
              </div>
              <Switch
                checked={config.enforce_private_lan}
                onCheckedChange={(checked) => setConfig((prev) => ({ ...prev, enforce_private_lan: checked }))}
              />
            </div>
          )}

          {config.enabled && (
            <div className="flex items-center gap-4 p-3 rounded-lg border bg-muted/30">
              <Label className="text-sm shrink-0">{t("模式", "Mode")}:</Label>
              <div className="flex gap-2">
                <Button
                  variant={config.mode === "whitelist" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setConfig((prev) => ({ ...prev, mode: "whitelist" }))}
                  className="text-xs"
                >
                  {t("白名单", "Whitelist")}
                </Button>
                <Button
                  variant={config.mode === "blacklist" ? "destructive" : "outline"}
                  size="sm"
                  onClick={() => setConfig((prev) => ({ ...prev, mode: "blacklist" }))}
                  className="text-xs"
                >
                  {t("黑名单", "Blacklist")}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground ml-auto">
                {config.mode === "whitelist"
                  ? t("仅允许列表中的IP访问", "Only listed IPs can access")
                  : t("阻止列表中的IP访问", "Block listed IPs")}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {config.enabled && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Globe className="h-4 w-4" />
              {t("IP规则列表", "IP Rules")}
              <Badge variant="secondary" className="text-[10px] ml-auto">
                {config.rules.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-end gap-2">
              <div className="flex-1 space-y-1">
                <Label className="text-xs">{t("IP地址/CIDR", "IP/CIDR")}</Label>
                <Input
                  placeholder="192.168.1.0/24"
                  value={newIp}
                  onChange={(e) => setNewIp(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addRule()}
                  className="text-sm"
                />
              </div>
              <div className="flex-1 space-y-1">
                <Label className="text-xs">{t("备注", "Label")}</Label>
                <Input
                  placeholder={t("办公室网络", "Office network")}
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addRule()}
                  className="text-sm"
                />
              </div>
              <Button size="sm" onClick={addRule} className="gap-1">
                <Plus className="h-3.5 w-3.5" />
                {t("添加", "Add")}
              </Button>
            </div>

            {config.rules.length === 0 ? (
              <div className="text-center py-6 text-sm text-muted-foreground flex flex-col items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                {config.mode === "whitelist"
                  ? t("白名单为空，所有IP都将被允许", "Whitelist is empty, all IPs will be allowed")
                  : t("黑名单为空，没有IP被阻止", "Blacklist is empty, no IPs are blocked")}
              </div>
            ) : (
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {config.rules.map((rule) => (
                  <div
                    key={rule.ip}
                    className="flex items-center gap-3 px-3 py-2 rounded-md border bg-card hover:bg-muted/30 transition-colors group"
                  >
                    <code className="text-xs font-mono bg-muted px-2 py-0.5 rounded">{rule.ip}</code>
                    <span className="text-xs text-muted-foreground flex-1 truncate">{rule.label}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-destructive"
                      onClick={() => setPendingRemove({ type: "ip", value: rule.ip })}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <MapPin className="h-4 w-4 text-primary" />
            {t("国家/地区登录限制", "Country / region login restriction")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">{t("限制员工端登录地区", "Restrict staff login by region")}</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t(
                  "开启后，根据下方策略校验登录 IP 所在国家/地区（与 IP 名单独立）。使用 ISO 两位代码，如 MY、CN。",
                  "When enabled, staff login IP is checked against the policy below (independent of IP list). Use 2-letter ISO codes, e.g. MY, CN.",
                )}
              </p>
            </div>
            <Switch
              checked={config.country_restrict_login}
              onCheckedChange={(checked) => setConfig((prev) => ({ ...prev, country_restrict_login: checked }))}
            />
          </div>

          {config.country_restrict_login && (
            <>
              <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                <p className="text-xs font-medium">{t("两种策略（二选一）", "Two policies (choose one)")}</p>
                <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-1">
                  <li>
                    {t(
                      "禁止名单：下列国家/地区的 IP 不得登录员工操作后台。",
                      "Blocklist: IPs in listed countries cannot log in to the staff backend.",
                    )}
                  </li>
                  <li>
                    {t(
                      "仅允许名单：只有下列国家/地区的 IP 可以登录员工操作后台，其余国家一律拒绝。",
                      "Allowlist only: only IPs in listed countries may log in; all other countries are denied.",
                    )}
                  </li>
                </ul>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">{t("策略", "Policy")}</Label>
                <Select
                  value={config.country_mode}
                  onValueChange={(v) =>
                    setConfig((prev) => ({ ...prev, country_mode: v === "allow" ? "allow" : "block" }))
                  }
                >
                  <SelectTrigger className="max-w-md">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="block">
                      {t("禁止以下国家/地区登录", "Block listed countries/regions")}
                    </SelectItem>
                    <SelectItem value="allow">
                      {t("仅允许以下国家/地区登录", "Allow only listed countries/regions")}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {config.country_mode === "block" && (
                <div className="space-y-2">
                  <Label className="text-xs">{t("快捷添加（禁止列表）", "Quick add (for blocklist)")}</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {QUICK_BLOCK_COUNTRIES.map((row) => (
                      <Button
                        key={row.code}
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 text-[11px]"
                        onClick={() => {
                          if (config.country_codes.includes(row.code)) return;
                          setConfig((prev) => ({
                            ...prev,
                            country_codes: [...prev.country_codes, row.code].sort(),
                          }));
                        }}
                      >
                        {row.code} {language === "en" ? row.en : row.zh}
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-end gap-2">
                <div className="flex-1 space-y-1">
                  <Label className="text-xs">{t("国家/地区代码", "Country code")}</Label>
                  <Input
                    placeholder="CN"
                    value={newCountryCode}
                    onChange={(e) => setNewCountryCode(e.target.value.toUpperCase())}
                    onKeyDown={(e) => e.key === "Enter" && addCountryCode(newCountryCode)}
                    maxLength={2}
                    className="text-sm font-mono uppercase max-w-[120px]"
                  />
                </div>
                <Button size="sm" type="button" onClick={() => addCountryCode(newCountryCode)} className="gap-1">
                  <Plus className="h-3.5 w-3.5" />
                  {t("添加", "Add")}
                </Button>
              </div>

              {config.country_codes.length === 0 ? (
                <p className="text-xs text-amber-600 dark:text-amber-500 flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  {t(
                    "列表为空时不会拦截任何国家（等同于未配置）。请至少添加一个代码。",
                    "Empty list does not block or restrict any country. Add at least one code.",
                  )}
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {config.country_codes.map((code) => (
                    <Badge key={code} variant="secondary" className="pl-2 pr-1 gap-1 font-mono text-xs">
                      {code}
                      <button
                        type="button"
                        className="rounded p-0.5 hover:bg-muted"
                        onClick={() => setPendingRemove({ type: "country", value: code })}
                        aria-label={t("移除", "Remove")}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Button onClick={() => void handleSave()} disabled={saving} className="gap-2">
        <Save className="h-4 w-4" />
        {saving ? t("保存中...", "Saving...") : t("保存设置", "Save Settings")}
      </Button>

      <AlertDialog open={!!pendingRemove} onOpenChange={(open) => !open && setPendingRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingRemove?.type === "country"
                ? t("确认移除国家/地区", "Remove country/region?")
                : t("确认移除 IP 规则", "Remove IP rule?")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingRemove?.type === "country"
                ? t(
                    `确定从列表中移除「${pendingRemove.value}」吗？需点击「保存设置」后才会生效。`,
                    `Remove "${pendingRemove.value}" from the list? Click "Save Settings" to apply.`,
                  )
                : t(
                    `确定移除规则「${pendingRemove?.value ?? ""}」吗？需点击「保存设置」后才会生效。`,
                    `Remove rule "${pendingRemove?.value ?? ""}"? Click "Save Settings" to apply.`,
                  )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("取消", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (!pendingRemove) return;
                if (pendingRemove.type === "ip") removeRule(pendingRemove.value);
                else removeCountryCode(pendingRemove.value);
                setPendingRemove(null);
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
