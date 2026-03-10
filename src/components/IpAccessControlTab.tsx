import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Shield, Plus, Trash2, Save, Globe, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";

interface IpRule {
  ip: string;
  label: string;
}

interface IpAccessConfig {
  enabled: boolean;
  mode: "whitelist" | "blacklist";
  rules: IpRule[];
}

const SETTING_KEY = "ip_access_control";

export default function IpAccessControlTab() {
  const { t } = useLanguage();
  const [config, setConfig] = useState<IpAccessConfig>({
    enabled: false,
    mode: "whitelist",
    rules: [],
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newIp, setNewIp] = useState("");
  const [newLabel, setNewLabel] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await supabase
          .from("data_settings")
          .select("setting_value")
          .eq("setting_key", SETTING_KEY)
          .maybeSingle();

        if (data?.setting_value) {
          setConfig(data.setting_value as unknown as IpAccessConfig);
        }
      } catch (err) {
        console.error("Failed to load IP config:", err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("data_settings")
        .upsert({
          setting_key: SETTING_KEY,
          setting_value: config as any,
          updated_at: new Date().toISOString(),
        }, { onConflict: "setting_key" });

      if (error) throw error;
      toast.success(t("IP访问控制设置已保存", "IP access control saved"));
    } catch (err) {
      toast.error(t("保存失败", "Save failed"));
    } finally {
      setSaving(false);
    }
  };

  const addRule = () => {
    const ip = newIp.trim();
    if (!ip) return;

    // Basic IP/CIDR validation
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/;
    if (!ipRegex.test(ip)) {
      toast.error(t("请输入有效的IP地址或CIDR", "Please enter a valid IP or CIDR"));
      return;
    }

    if (config.rules.some(r => r.ip === ip)) {
      toast.error(t("该IP已存在", "IP already exists"));
      return;
    }

    setConfig(prev => ({
      ...prev,
      rules: [...prev.rules, { ip, label: newLabel.trim() || ip }],
    }));
    setNewIp("");
    setNewLabel("");
  };

  const removeRule = (ip: string) => {
    setConfig(prev => ({
      ...prev,
      rules: prev.rules.filter(r => r.ip !== ip),
    }));
  };

  if (loading) {
    return <div className="space-y-3"><Skeleton className="h-32 w-full" /><Skeleton className="h-48 w-full" /></div>;
  }

  return (
    <div className="space-y-4 max-w-3xl">
      {/* Enable/Disable & Mode */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            {t("IP访问控制", "IP Access Control")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">{t("启用IP访问控制", "Enable IP Access Control")}</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t("启用后将根据规则限制API和登录访问", "Restricts API and login access based on rules")}
              </p>
            </div>
            <Switch
              checked={config.enabled}
              onCheckedChange={(checked) => setConfig(prev => ({ ...prev, enabled: checked }))}
            />
          </div>

          {config.enabled && (
            <div className="flex items-center gap-4 p-3 rounded-lg border bg-muted/30">
              <Label className="text-sm shrink-0">{t("模式", "Mode")}:</Label>
              <div className="flex gap-2">
                <Button
                  variant={config.mode === "whitelist" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setConfig(prev => ({ ...prev, mode: "whitelist" }))}
                  className="text-xs"
                >
                  {t("白名单", "Whitelist")}
                </Button>
                <Button
                  variant={config.mode === "blacklist" ? "destructive" : "outline"}
                  size="sm"
                  onClick={() => setConfig(prev => ({ ...prev, mode: "blacklist" }))}
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

      {/* IP Rules */}
      {config.enabled && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Globe className="h-4 w-4" />
              {t("IP规则列表", "IP Rules")}
              <Badge variant="secondary" className="text-[10px] ml-auto">{config.rules.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Add new rule */}
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

            {/* Rules list */}
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
                      onClick={() => removeRule(rule.ip)}
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

      {/* Save */}
      <Button onClick={handleSave} disabled={saving} className="gap-2">
        <Save className="h-4 w-4" />
        {saving ? t("保存中...", "Saving...") : t("保存设置", "Save Settings")}
      </Button>
    </div>
  );
}
