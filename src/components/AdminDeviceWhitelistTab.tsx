import { useCallback, useEffect, useState } from "react";
import { notify } from "@/lib/notifyHub";
import { useLanguage } from "@/contexts/LanguageContext";
import { useIsMobile } from "@/hooks/ui/use-mobile";
import { showServiceErrorToast } from "@/lib/serviceErrorToast";
import {
  fetchPlatformDeviceWhitelistConfig,
  savePlatformDeviceWhitelistConfig,
  listPlatformEmployeeDevices,
  adminAddEmployeeDevice,
  adminDeleteEmployeeDevice,
  type EmployeeDeviceDto,
} from "@/services/staff/staffDeviceWhitelistService";
import { normalizeStaffDeviceId } from "@/lib/staffDeviceId";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { RefreshCw, Trash2, Info } from "lucide-react";
import { format } from "date-fns";

export default function AdminDeviceWhitelistTab() {
  const { t } = useLanguage();
  const isMobile = useIsMobile();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [maxDevices, setMaxDevices] = useState(5);
  const [devices, setDevices] = useState<EmployeeDeviceDto[]>([]);
  const [addUser, setAddUser] = useState("");
  const [addDeviceId, setAddDeviceId] = useState("");
  const [addName, setAddName] = useState("");
  const [adding, setAdding] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const cfg = await fetchPlatformDeviceWhitelistConfig();
      setEnabled(cfg.enabled);
      setMaxDevices(cfg.max_devices_per_employee);
    } catch (e) {
      showServiceErrorToast(e, t, "白名单策略加载失败", "Failed to load whitelist policy");
      setLoading(false);
      return;
    }
    try {
      const list = await listPlatformEmployeeDevices(200, 0);
      setDevices(list);
    } catch (e) {
      showServiceErrorToast(e, t, "设备列表加载失败", "Failed to load device list");
      setDevices([]);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const saveConfig = async () => {
    setSaving(true);
    try {
      const cfg = await savePlatformDeviceWhitelistConfig({
        enabled,
        max_devices_per_employee: maxDevices,
      });
      setEnabled(cfg.enabled);
      setMaxDevices(cfg.max_devices_per_employee);
      notify.success(t("已保存", "Saved"));
    } catch (e) {
      showServiceErrorToast(e, t, "保存失败", "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleAdd = async () => {
    if (!addUser.trim() || !addDeviceId.trim()) {
      notify.error(t("请填写员工用户名与 device_id", "Enter staff username and device_id"));
      return;
    }
    const did = normalizeStaffDeviceId(addDeviceId);
    if (!did) {
      notify.error(
        t(
          "device_id 不符合后端规则：8–128 个字符，仅 ASCII 字母、数字及 _ - : + . / = @",
          "device_id does not match server rules: 8–128 chars, ASCII letters/digits and _ - : + . / = @ only",
        ),
      );
      return;
    }
    setAdding(true);
    try {
      await adminAddEmployeeDevice({
        username: addUser.trim(),
        device_id: did,
        device_name: addName.trim() || undefined,
      });
      notify.success(t("已新增设备", "Device added"));
      setAddUser("");
      setAddDeviceId("");
      setAddName("");
      await load();
    } catch (e) {
      showServiceErrorToast(e, t, "新增失败", "Add failed");
    } finally {
      setAdding(false);
    }
  };

  const executeDelete = async (id: string) => {
    try {
      await adminDeleteEmployeeDevice(id);
      notify.success(t("已删除", "Deleted"));
      await load();
    } catch (e) {
      showServiceErrorToast(e, t, "删除失败", "Delete failed");
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
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold mb-1">
          {t("后台设备白名单", "Staff device whitelist")}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t(
            "开启后，非平台超级管理员的员工仅允许已在列表中的设备登录；不校验 IP。平台超管不受限。登录成功会记录 IP 至设备最近登录。",
            "When enabled, staff (except platform super admins) may only log in from listed devices; IP is not used for access control. IPs are logged on device last login. Platform super admins are exempt.",
          )}
        </p>
      </div>

      <Alert className="border-amber-200/80 bg-amber-50/80 dark:border-amber-900/45 dark:bg-amber-950/30">
        <Info className="h-4 w-4 text-amber-800 dark:text-amber-400" />
        <AlertTitle className="text-amber-950 dark:text-amber-100">
          {t("上线步骤建议", "Recommended rollout")}
        </AlertTitle>
        <AlertDescription className="text-amber-950/90 dark:text-amber-200/90 space-y-2">
          <ol className="list-decimal pl-4 space-y-1.5 text-sm">
            <li>
              {t(
                "先保持下方「启用设备白名单」为关闭，通知员工在「系统设置 → 后台登录设备」绑定常用机。",
                "Keep “Enable device whitelist” off first; ask staff to bind devices under System Settings → Staff login devices.",
              )}
            </li>
            <li>
              {t(
                "也可在本页「新增设备」按员工用户名 + 对方提供的 device_id 代为录入。",
                "Or use “Add device” here with the staff username and their device_id.",
              )}
            </li>
            <li>
              {t(
                "确认主要员工已登记后再开启白名单，避免全员瞬间无法登录。",
                "Turn the whitelist on only after enough devices are registered.",
              )}
            </li>
          </ol>
          <p className="text-sm pt-1 border-t border-amber-200/60 dark:border-amber-800/60">
            {t(
              "平台超级管理员登录不受设备白名单限制，用于应急与配置。",
              "Platform super admins are never blocked—use for emergencies and setup.",
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            {t(
              "device_id 须与后端一致：8–128 个字符，仅 ASCII 字母、数字及 _ - : + . / = @。修改规则请同步 server/.../deviceId.ts 与 src/lib/staffDeviceId.ts。",
              "device_id must match the backend: 8–128 chars, ASCII letters/digits and _ - : + . / = @. Edit server …/deviceId.ts and src/lib/staffDeviceId.ts together if you change the rules.",
            )}
          </p>
        </AlertDescription>
      </Alert>

      <div className="rounded-lg border p-4 space-y-4 max-w-xl">
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="wl-enabled">{t("启用设备白名单", "Enable device whitelist")}</Label>
          <Switch id="wl-enabled" checked={enabled} onCheckedChange={setEnabled} />
        </div>
        <div className="space-y-2">
          <Label>{t("每账号最大设备数", "Max devices per account")}</Label>
          <Input
            type="number"
            min={1}
            max={100}
            value={maxDevices}
            onChange={(e) => setMaxDevices(Math.min(100, Math.max(1, parseInt(e.target.value, 10) || 5)))}
            className="w-32"
          />
        </div>
        <Button onClick={() => void saveConfig()} disabled={saving}>
          {saving ? t("保存中…", "Saving…") : t("保存策略", "Save policy")}
        </Button>
      </div>

      <div className="rounded-lg border p-4 space-y-3">
        <h3 className="font-medium">{t("新增设备（代员工录入）", "Add device for a staff user")}</h3>
        <div className="grid gap-2 sm:grid-cols-3">
          <Input placeholder={t("员工登录用户名", "Staff username")} value={addUser} onChange={(e) => setAddUser(e.target.value)} />
          <Input
            placeholder={t(
              "device_id（8–128 字符，见说明）",
              "device_id (8–128 chars, see note)",
            )}
            value={addDeviceId}
            onChange={(e) => setAddDeviceId(e.target.value)}
            maxLength={128}
            autoComplete="off"
            spellCheck={false}
          />
          <Input placeholder={t("设备备注（可选）", "Label (optional)")} value={addName} onChange={(e) => setAddName(e.target.value)} />
        </div>
        <Button onClick={() => void handleAdd()} disabled={adding}>
          {adding ? t("提交中…", "Adding…") : t("新增", "Add")}
        </Button>
      </div>

      <div className="flex items-center justify-between">
        <h3 className="font-medium">{t("全部设备", "All devices")}</h3>
        <Button variant="outline" size="sm" onClick={() => void load()}>
          <RefreshCw className="h-4 w-4 mr-1" />
          {t("刷新", "Refresh")}
        </Button>
      </div>

      {isMobile ? (
        <div className="space-y-2">
          {devices.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("暂无记录", "No devices")}</p>
          ) : (
            devices.map((d) => (
              <div key={d.id} className="rounded-lg border p-3 text-sm space-y-1">
                <div className="font-medium">{d.username ?? d.employee_id}</div>
                <div className="text-muted-foreground break-all">{d.device_id}</div>
                <div>{t("最近登录", "Last login")}: {fmt(d.last_login_at)}</div>
                <div className="text-xs text-muted-foreground">IP: {d.last_login_ip ?? "—"}</div>
                <Button variant="destructive" size="sm" className="mt-2" onClick={() => setDeleteTargetId(d.id)}>
                  <Trash2 className="h-4 w-4 mr-1" />
                  {t("删除", "Delete")}
                </Button>
              </div>
            ))
          )}
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("员工", "User")}</TableHead>
              <TableHead>device_id</TableHead>
              <TableHead>{t("备注", "Label")}</TableHead>
              <TableHead>{t("最近登录", "Last login")}</TableHead>
              <TableHead>IP</TableHead>
              <TableHead className="w-[100px]">{t("操作", "Actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {devices.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-muted-foreground">
                  {t("暂无记录", "No devices")}
                </TableCell>
              </TableRow>
            ) : (
              devices.map((d) => (
                <TableRow key={d.id}>
                  <TableCell>
                    <div>{d.username ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">{d.real_name ?? ""}</div>
                  </TableCell>
                  <TableCell className="font-mono text-xs max-w-[200px] truncate" title={d.device_id}>
                    {d.device_id}
                  </TableCell>
                  <TableCell>{d.device_name ?? "—"}</TableCell>
                  <TableCell>{fmt(d.last_login_at)}</TableCell>
                  <TableCell className="text-xs">{d.last_login_ip ?? "—"}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => setDeleteTargetId(d.id)} aria-label={t("删除", "Delete")}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      )}

      <AlertDialog open={!!deleteTargetId} onOpenChange={(open) => !open && setDeleteTargetId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("确认删除设备", "Delete device?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("删除后立即无法用于登录，确定继续？", "This device will stop working for login immediately. Continue?")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("取消", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                const id = deleteTargetId;
                setDeleteTargetId(null);
                if (id) void executeDelete(id);
              }}
            >
              {t("删除", "Delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
