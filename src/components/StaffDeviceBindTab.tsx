import { useCallback, useEffect, useState } from "react";
import { notify } from "@/lib/notifyHub";
import { useLanguage } from "@/contexts/LanguageContext";
import { getStaffDeviceVisitorId } from "@/lib/staffDeviceFingerprint";
import {
  fetchStaffDeviceWhitelistStatus,
  listMyStaffDevices,
  bindCurrentStaffDevice,
  type EmployeeDeviceDto,
} from "@/services/staff/staffDeviceWhitelistService";
import { setAuthToken } from "@/services/auth/authApiService";
import { showServiceErrorToast } from "@/lib/serviceErrorToast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { RefreshCw, Info } from "lucide-react";
import { format } from "date-fns";

export default function StaffDeviceBindTab() {
  const { t } = useLanguage();
  const [wl, setWl] = useState({ enabled: false, max_devices_per_employee: 5 });
  const [devices, setDevices] = useState<EmployeeDeviceDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [binding, setBinding] = useState(false);
  const [visitorId, setVisitorId] = useState<string | null>(null);
  const [label, setLabel] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [st, list] = await Promise.all([fetchStaffDeviceWhitelistStatus(), listMyStaffDevices()]);
      setWl(st);
      setDevices(list);
    } catch (e) {
      showServiceErrorToast(e, t, "加载失败", "Load failed");
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void getStaffDeviceVisitorId().then(setVisitorId);
  }, []);

  const bind = async () => {
    const id = visitorId || (await getStaffDeviceVisitorId());
    if (!id) {
      notify.error(t("无法获取设备标识，请更换浏览器或关闭拦截后重试", "Could not read device id"));
      return;
    }
    setBinding(true);
    try {
      const res = await bindCurrentStaffDevice({ device_id: id, device_name: label.trim() || undefined });
      if (res.token) setAuthToken(res.token);
      notify.success(t("已绑定本设备", "This device is now bound"));
      setLabel("");
      await load();
    } catch (e) {
      showServiceErrorToast(e, t, "绑定失败", "Bind failed");
    } finally {
      setBinding(false);
    }
  };

  const fmt = (d: string | null) => {
    if (!d) return "—";
    try {
      return format(new Date(d), "yyyy-MM-dd HH:mm");
    } catch {
      return d;
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16 text-muted-foreground">
        <RefreshCw className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <Alert className="border-sky-200/80 bg-sky-50/80 dark:border-sky-900/45 dark:bg-sky-950/30">
        <Info className="h-4 w-4 text-sky-700 dark:text-sky-400" />
        <AlertTitle className="text-sky-950 dark:text-sky-100">
          {t("使用建议", "How to roll out")}
        </AlertTitle>
        <AlertDescription className="text-sky-900/90 dark:text-sky-200/90 space-y-2">
          <ol className="list-decimal pl-4 space-y-1.5 text-sm">
            <li>
              {t(
                "请管理员先在「平台设置 → 后台设备白名单」保持白名单关闭。",
                "Ask a platform admin to keep the device whitelist off in Platform Settings → Staff device whitelist.",
              )}
            </li>
            <li>
              {t(
                "员工在本页绑定常用浏览器/电脑；或由平台管理员在平台页「新增设备」代为录入 device_id。",
                "Staff bind their usual browser here, or a platform admin adds the device_id under “Add device”.",
              )}
            </li>
            <li>
              {t(
                "设备登记充分后再开启白名单，避免全员瞬间无法登录。",
                "Enable the whitelist only after devices are registered, so nobody is locked out at once.",
              )}
            </li>
          </ol>
          <p className="text-sm font-medium pt-1 border-t border-sky-200/60 dark:border-sky-800/60">
            {t(
              "平台超级管理员始终不受设备限制，可用于应急与配置。",
              "Platform super admins are never blocked by device rules (break-glass & setup).",
            )}
          </p>
        </AlertDescription>
      </Alert>

      <div>
        <h2 className="text-lg font-semibold mb-1">{t("后台登录设备", "Staff login devices")}</h2>
        <p className="text-sm text-muted-foreground">
          {wl.enabled
            ? t(
                "平台已启用设备白名单：请在本机点击绑定；新设备需绑定或由平台管理员在「平台设置」中录入。每账号最多 ",
                "Device whitelist is on: bind this browser, or ask a platform admin to register the device. Max ",
              ) + `${wl.max_devices_per_employee} ` + t("台。", "devices per account.")
            : t(
                "当前未强制设备白名单，您仍可预先绑定设备，以便管理员稍后开启策略时本机可直接登录。",
                "Whitelist is off; you can still bind this device so it works when the policy is enabled.",
              )}
        </p>
      </div>

      <div className="rounded-lg border p-4 space-y-3">
        <div className="text-sm">
          <span className="text-muted-foreground">{t("本机 device_id", "This device id")}: </span>
          <code className="text-xs break-all">{visitorId ?? t("获取中…", "Loading…")}</code>
        </div>
        <div className="space-y-2">
          <Label>{t("设备备注（可选）", "Label (optional)")}</Label>
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t("例如：办公室电脑", "e.g. Office PC")} />
        </div>
        <Button onClick={() => void bind()} disabled={binding || !visitorId}>
          {binding ? t("绑定中…", "Binding…") : t("绑定当前设备", "Bind this device")}
        </Button>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-medium">{t("我的已登记设备", "My registered devices")}</h3>
          <Button variant="outline" size="sm" onClick={() => void load()}>
            <RefreshCw className="h-4 w-4 mr-1" />
            {t("刷新", "Refresh")}
          </Button>
        </div>
        <ul className="text-sm space-y-2 border rounded-lg divide-y">
          {devices.length === 0 ? (
            <li className="p-3 text-muted-foreground">{t("暂无记录", "None")}</li>
          ) : (
            devices.map((d) => (
              <li key={d.id} className="p-3 space-y-1">
                <div className="font-mono text-xs break-all">{d.device_id}</div>
                <div className="text-muted-foreground">
                  {d.device_name ?? t("无备注", "No label")} · {t("最近登录", "Last login")}: {fmt(d.last_login_at)}
                </div>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
