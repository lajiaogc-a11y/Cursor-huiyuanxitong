/**
 * 号码提取器设置 - 放在工作任务发动态（海报库）下面
 * 负责：批量导入、提取参数设置、清空池
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
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
import { DrawerDetail } from "@/components/shell/DrawerDetail";
import { Phone, Upload, FileUp, Loader2, Settings, Trash2, History, RefreshCw, Eraser, Stethoscope } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useTenantView } from "@/contexts/TenantViewContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { formatBeijingTime } from "@/lib/beijingTime";
import { notify } from "@/lib/notifyHub";
import { useIsPlatformAdminViewingTenant } from "@/hooks/useIsPlatformAdminViewingTenant";
import {
  phoneBulkImportResult,
  getPhoneStatsResult,
  clearPhonePoolResult,
  getExtractSettingsResult,
  updateExtractSettingsResult,
  getExtractRecords,
  checkPhoneExtractHealth,
  type PhoneStats,
  type ExtractRecord,
  type PhoneExtractHealthItem,
} from "@/services/phonePoolService";
import { showServiceErrorToast } from "@/services/serviceErrorToast";
import { normalizeBulkImportPhoneLines } from "@/lib/phoneValidation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/** 批量粘贴区草稿：仅存 sessionStorage（本会话），非业务真源；历史曾用 localStorage 会在首次读取时迁移并删除 */
const BULK_TEXT_SESSION_KEY = "phone_extract_bulk_text";

function readBulkDraftText(): string {
  try {
    const fromSession = sessionStorage.getItem(BULK_TEXT_SESSION_KEY);
    if (fromSession != null) return fromSession;
    const legacy = localStorage.getItem(BULK_TEXT_SESSION_KEY);
    if (legacy != null) {
      sessionStorage.setItem(BULK_TEXT_SESSION_KEY, legacy);
      localStorage.removeItem(BULK_TEXT_SESSION_KEY);
      return legacy;
    }
  } catch {
    /* ignore */
  }
  return "";
}

export function PhoneExtractSettingsSection() {
  const { employee } = useAuth();
  const { viewingTenantId } = useTenantView() || {};
  const { t } = useLanguage();
  const tenantId = viewingTenantId || employee?.tenant_id;
  const effectiveTenantId = tenantId ?? "";
  const isPlatformAdminReadonlyView = useIsPlatformAdminViewingTenant();

  const [bulkText, setBulkText] = useState(() => readBulkDraftText());
  const [stats, setStats] = useState<PhoneStats | null>(null);
  const [settings, setSettings] = useState({ per_extract_limit: 100, per_user_daily_limit: 5 });
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importStatus, setImportStatus] = useState("");
  const [showClearPoolConfirm, setShowClearPoolConfirm] = useState(false);
  const [clearingPool, setClearingPool] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [settingsForm, setSettingsForm] = useState({ per_extract_limit: 100, per_user_daily_limit: 5 });
  const [savingSettings, setSavingSettings] = useState(false);
  const [records, setRecords] = useState<ExtractRecord[]>([]);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [healthItems, setHealthItems] = useState<PhoneExtractHealthItem[] | null>(null);
  const [healthRunning, setHealthRunning] = useState(false);

  const loadStats = useCallback(async () => {
    if (!effectiveTenantId) return;
    setStatsError(false);
    setStatsLoading(true);
    try {
      const s = await getPhoneStatsResult(effectiveTenantId);
      if (s.ok) {
        setStats(s.data);
      } else {
        setStatsError(true);
      }
    } catch (e) {
      console.error("Phone stats load failed:", e);
      setStatsError(true);
    } finally {
      setStatsLoading(false);
    }
  }, [effectiveTenantId]);

  const loadSettings = useCallback(async () => {
    try {
      const s = await getExtractSettingsResult();
      if (s.ok) setSettings(s.data);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const loadRecords = useCallback(async () => {
    if (!effectiveTenantId) return;
    setRecordsLoading(true);
    try {
      const list = await getExtractRecords(effectiveTenantId);
      setRecords(list);
    } catch (e) {
      console.error("Phone extract records load failed", e);
    } finally {
      setRecordsLoading(false);
    }
  }, [effectiveTenantId]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    try {
      if (bulkText) sessionStorage.setItem(BULK_TEXT_SESSION_KEY, bulkText);
      else sessionStorage.removeItem(BULK_TEXT_SESSION_KEY);
    } catch {
      /* ignore */
    }
  }, [bulkText]);

  useEffect(() => {
    if (effectiveTenantId) {
      loadStats();
      loadRecords();
      const statsInterval = setInterval(loadStats, 10000);
      const recordsInterval = setInterval(loadRecords, 10000);
      return () => {
        clearInterval(statsInterval);
        clearInterval(recordsInterval);
      };
    }
  }, [effectiveTenantId, loadStats, loadRecords]);

  const handleImport = async () => {
    if (!effectiveTenantId) return;
    if (isPlatformAdminReadonlyView) {
      notify.error(t("平台总管理查看租户时为只读，无法导入号码", "Read-only in platform admin tenant view"));
      return;
    }
    const lines = normalizeBulkImportPhoneLines(bulkText);
    if (lines.length === 0) {
      notify.error(
        t(
          "未识别到有效号码（每段至少 6 位数字）。支持多行或一行内逗号/分号分隔。",
          "No valid numbers (min 6 digits per entry). Use multiple lines or comma/semicolon-separated.",
        ),
      );
      return;
    }
    setImporting(true);
    setImportProgress(0);
    setImportStatus("");
    try {
      const importResult = await phoneBulkImportResult(
        effectiveTenantId,
        lines,
        (progress, currentChunk, totalChunks) => {
          setImportProgress(progress);
          setImportStatus(
            totalChunks > 1
              ? t(`导入中 ${currentChunk}/${totalChunks}`, `Importing ${currentChunk}/${totalChunks}`)
              : ""
          );
        }
      );
      if (!importResult.ok) {
        throw importResult.error;
      }
      const { inserted, skipped } = importResult.data;
      setImportProgress(100);
      setImportStatus("");
      if (inserted === 0 && skipped > 0) {
        notify.warning(
          t(`导入完成：0 条新增，${skipped} 条跳过。请检查号码格式（需至少6位数字）或是否已存在`, `Import done: 0 inserted, ${skipped} skipped. Check format (min 6 digits) or duplicates`)
        );
      } else if (inserted === 0 && skipped === 0) {
        notify.warning(t("未导入任何号码，请检查格式", "No numbers imported. Check format."));
      } else {
        notify.success(
          t(`导入完成：新增 ${inserted}，跳过 ${skipped}`, `Import done: ${inserted} inserted, ${skipped} skipped`)
        );
      }
      setBulkText("");
      try {
        sessionStorage.removeItem(BULK_TEXT_SESSION_KEY);
      } catch {
        /* ignore */
      }
      await loadStats();
      await loadRecords();
      if (inserted > 0) {
        setTimeout(() => loadStats(), 500);
      }
    } catch (e: unknown) {
      console.error("Phone import failed:", e);
      showServiceErrorToast(e, t, "导入失败", "Import failed");
    } finally {
      setImporting(false);
      setImportProgress(0);
      setImportStatus("");
    }
  };

  const handleClearBulk = () => {
    if (!bulkText.trim()) {
      notify.info(t("没有可清空的内容", "Nothing to clear"));
      return;
    }
    setBulkText("");
    try {
      sessionStorage.removeItem(BULK_TEXT_SESSION_KEY);
    } catch {
      /* ignore */
    }
    notify.success(t("已清空批量粘贴区", "Paste / upload area cleared"));
  };

  const handleRunHealthCheck = async () => {
    if (!effectiveTenantId) return;
    setHealthRunning(true);
    setHealthItems(null);
    try {
      const rows = await checkPhoneExtractHealth(effectiveTenantId);
      setHealthItems(rows);
      const bad = rows.filter((r) => !r.ok);
      if (bad.length) {
        notify.error(
          t("部分项目异常，请查看下方明细", "Some checks failed — see details below"),
          { duration: 8000 }
        );
      } else {
        notify.success(t("检测通过", "All checks passed"));
      }
    } catch (e) {
      console.error(e);
      notify.error(t("检测失败", "Health check failed"));
    } finally {
      setHealthRunning(false);
    }
  };

  const healthLabel = (key: string) => {
    const map: Record<string, [string, string]> = {
      staff_token: ["员工登录令牌", "Staff auth token"],
      tenant: ["当前租户", "Current tenant"],
      pool_stats: ["号码池统计接口", "Pool stats API"],
      extract_settings_api: ["提取参数接口", "Extract settings API"],
      extract_records_api: ["提取记录接口", "Extract records API"],
      phone_pool_table: ["号码池表结构（phone_pool）", "Phone pool table structure"],
    };
    const pair = map[key];
    return pair ? t(pair[0], pair[1]) : key;
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result);
      const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      setBulkText((prev) => (prev ? prev + "\n" + lines.join("\n") : lines.join("\n")));
      notify.success(t(`已加载 ${lines.length} 行`, `Loaded ${lines.length} lines`));
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleClearPool = async () => {
    if (!effectiveTenantId) return;
    if (isPlatformAdminReadonlyView) {
      notify.error(t("平台总管理查看租户时为只读，无法清空号码池", "Read-only in platform admin tenant view"));
      return;
    }
    setClearingPool(true);
    try {
      const cleared = await clearPhonePoolResult(effectiveTenantId);
      if (!cleared.ok) throw cleared.error;
      await loadStats();
      notify.success(t("号码池已清空", "Pool cleared"));
      setShowClearPoolConfirm(false);
    } catch (e) {
      showServiceErrorToast(e, t, "清空失败", "Clear failed");
    } finally {
      setClearingPool(false);
    }
  };

  const handleOpenSettings = () => {
    if (isPlatformAdminReadonlyView) {
      notify.error(t("平台总管理查看租户时为只读，无法修改设置", "Read-only in platform admin tenant view"));
      return;
    }
    setSettingsForm({ per_extract_limit: settings.per_extract_limit, per_user_daily_limit: settings.per_user_daily_limit });
    setShowSettingsModal(true);
  };

  const handleSaveSettings = async () => {
    if (isPlatformAdminReadonlyView) {
      notify.error(t("平台总管理查看租户时为只读，无法保存设置", "Read-only in platform admin tenant view"));
      return;
    }
    setSavingSettings(true);
    try {
      const updated = await updateExtractSettingsResult(settingsForm.per_extract_limit, settingsForm.per_user_daily_limit);
      if (!updated.ok) throw updated.error;
      await loadSettings();
      setShowSettingsModal(false);
      notify.success(t("设置已保存", "Settings saved"));
    } catch (e: any) {
      showServiceErrorToast(e, t, "保存失败", "Save failed");
    } finally {
      setSavingSettings(false);
    }
  };

  const isAdmin = employee?.role === "admin";

  if (!effectiveTenantId) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Phone className="h-4 w-4" />
              {t("号码提取器设置", "Phone Extractor Settings")}
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t("批量导入号码、配置提取参数。提取功能请在汇率计算页面右侧使用。", "Bulk import numbers, configure settings. Use extraction on Exchange Rate page (right side).")}
            </p>
          </div>
          {isAdmin && (
            <Button size="sm" variant="ghost" className="h-8 w-8 p-0 shrink-0" onClick={handleOpenSettings} title={t("设置", "Settings")}>
              <Settings className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Stats */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{t("号码池状态", "Pool Status")}</span>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              onClick={() => { loadStats(); loadRecords(); }}
              disabled={statsLoading}
            >
              {statsLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              {t("刷新", "Refresh")}
            </Button>
          </div>
          <div className="grid grid-cols-3 gap-2 text-sm">
            <div className="rounded-lg border p-2 text-center" title={t("可被提取的号码数量", "Numbers available for extraction")}>
              <p className="text-muted-foreground text-xs">{t("可用", "Available")}</p>
              <p className="font-mono font-semibold">
                {statsLoading ? "…" : statsError ? t("失败", "Err") : (stats?.total_available ?? "-")}
              </p>
            </div>
            <div className="rounded-lg border p-2 text-center" title={t("已被提取但未归还的号码数量", "Numbers extracted but not yet returned")}>
              <p className="text-muted-foreground text-xs">{t("已预留", "Reserved")}</p>
              <p className="font-mono font-semibold">
                {statsLoading ? "…" : statsError ? t("失败", "Err") : (stats?.total_reserved ?? "-")}
              </p>
            </div>
            <div className="rounded-lg border p-2 text-center">
              <p className="text-muted-foreground text-xs">{t("每次/每日上限", "Limit")}</p>
              <p className="font-mono font-semibold text-xs">{settings.per_extract_limit} / {settings.per_user_daily_limit}</p>
            </div>
          </div>
          {statsError && (
            <p className="text-xs text-destructive">
              {t("加载失败，请点击右上角刷新。若持续失败，请检查员工是否已关联租户。", "Load failed. Click refresh. If it persists, check employee-tenant link.")}
            </p>
          )}
        </div>

        {/* 自检：哪些接口不可用 */}
        <div className="rounded-lg border p-3 space-y-2 bg-muted/20">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-medium">{t("提取功能自检", "Connectivity check")}</span>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="h-7 text-xs gap-1"
              onClick={() => void handleRunHealthCheck()}
              disabled={healthRunning || !effectiveTenantId}
            >
              {healthRunning ? <Loader2 className="h-3 w-3 animate-spin" /> : <Stethoscope className="h-3 w-3" />}
              {t("检测", "Run check")}
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {t(
              "检测员工令牌、租户、号码池统计/提取设置/提取记录等接口是否正常。导入失败若提示 phone_number，请在数据库执行 mysql/migrations/20260322_phone_pool_reserved_columns.sql 中的语句。",
              "Checks token, tenant, and phone-pool APIs. If import fails with phone_number, run mysql/migrations/20260322_phone_pool_reserved_columns.sql on the DB.",
            )}
          </p>
          {healthItems && healthItems.length > 0 && (
            <ul className="text-xs space-y-1 font-mono">
              {healthItems.map((row) => (
                <li
                  key={row.key}
                  className={row.ok ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}
                >
                  {row.ok ? "✓" : "✗"} {healthLabel(row.key)}: {row.message}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Bulk import */}
        <div className="space-y-2">
          <Label className="text-xs">{t("批量粘贴或上传", "Paste or upload")}</Label>
          <textarea
            className="w-full min-h-[80px] rounded-md border px-3 py-2 text-sm font-mono resize-y"
            placeholder="2349162838527&#10;09162838527&#10;916-283-8527"
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            disabled={importing}
          />
          <div className="flex flex-wrap gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.csv"
              className="hidden"
              onChange={handleFileUpload}
            />
            <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={isPlatformAdminReadonlyView || importing}>
              <FileUp className="h-3.5 w-3.5 mr-1.5" />
              {t("上传文件", "Upload")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleClearBulk}
              disabled={importing || !bulkText.trim()}
              title={t("清空文本框与本地缓存", "Clear textarea and local cache")}
            >
              <Eraser className="h-3.5 w-3.5 mr-1.5" />
              {t("一键清空", "Clear all")}
            </Button>
            <Button size="sm" onClick={handleImport} disabled={isPlatformAdminReadonlyView || importing || !bulkText.trim()}>
              {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Upload className="h-3.5 w-3.5 mr-1.5" />}
              {t("标准化并导入", "Normalize & Import")}
            </Button>
          </div>
          {importing && (
            <div className="space-y-1">
              {importStatus && <p className="text-xs text-muted-foreground">{importStatus}</p>}
              <Progress value={importProgress} className="h-1.5" />
            </div>
          )}
        </div>

        {/* Pool exhausted / empty notice */}
        {stats && stats.total_available === 0 && stats.total_reserved === 0 && (
          <p className="text-sm text-amber-600 dark:text-amber-400">
            {records.length > 0
              ? t("号码池已耗尽，请导入新号码", "Pool exhausted. Please import new numbers.")
              : t("请先导入号码：粘贴号码后点击「标准化并导入」保存到池中", "Paste numbers and click Normalize & Import to save to pool.")}
          </p>
        )}

        {/* Extract records table */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs flex items-center gap-1.5">
              <History className="h-3.5 w-3.5" />
              {t("提取记录", "Extract Records")}
            </Label>
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={loadRecords} disabled={recordsLoading}>
              {recordsLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              {t("刷新", "Refresh")}
            </Button>
          </div>
          <div className="rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[80px]">{t("类型", "Type")}</TableHead>
                  <TableHead>{t("操作人", "Operator")}</TableHead>
                  <TableHead className="w-[70px] text-center">{t("数量", "Count")}</TableHead>
                  <TableHead className="w-[140px]">{t("时间", "Time")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recordsLoading && records.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-6 text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin mx-auto mb-1" />
                      {t("加载中…", "Loading…")}
                    </TableCell>
                  </TableRow>
                ) : records.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-6 text-muted-foreground text-sm">
                      {t("暂无记录", "No records yet")}
                    </TableCell>
                  </TableRow>
                ) : (
                  records.map((r, i) => (
                    <TableRow key={`${r.action_type}-${r.action_at}-${i}`}>
                      <TableCell>
                        <span
                          className={
                            r.action_type === "extract"
                              ? "text-emerald-600 dark:text-emerald-400 font-medium"
                              : "text-amber-600 dark:text-amber-400 font-medium"
                          }
                        >
                          {r.action_type === "extract" ? t("提取", "Extract") : t("归还", "Return")}
                        </span>
                      </TableCell>
                      <TableCell className="font-medium">{r.operator_name}</TableCell>
                      <TableCell className="text-center font-mono">{r.action_count}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {r.action_at ? formatBeijingTime(r.action_at) : "-"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* Admin: Clear pool */}
        {isAdmin && (
          <Button size="sm" variant="destructive" className="w-full" disabled={isPlatformAdminReadonlyView} onClick={() => setShowClearPoolConfirm(true)}>
            <Trash2 className="h-3.5 w-3.5 mr-1.5" />
            {t("清空号码池（管理员）", "Clear Pool (Admin)")}
          </Button>
        )}
      </CardContent>

      <AlertDialog open={showClearPoolConfirm} onOpenChange={setShowClearPoolConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("确认清空号码池", "Confirm Clear Pool")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("将删除本租户所有号码池数据，不可恢复。", "This will permanently delete all phone pool data for this tenant.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("取消", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleClearPool} disabled={clearingPool} className="bg-destructive">
              {clearingPool ? <Loader2 className="h-4 w-4 animate-spin" /> : t("确认清空", "Clear")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <DrawerDetail
        open={showSettingsModal}
        onOpenChange={setShowSettingsModal}
        title={t("提取设置", "Extract Settings")}
        sheetMaxWidth="xl"
      >
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("每次提取上限", "Per-extract limit")}</Label>
              <Input
                type="number"
                min={1}
                max={10000}
                value={settingsForm.per_extract_limit}
                onChange={(e) =>
                  setSettingsForm((prev) => ({
                    ...prev,
                    per_extract_limit: Math.min(10000, Math.max(1, Number(e.target.value) || 1)),
                  }))
                }
              />
              <p className="text-xs text-muted-foreground">{t("单次最多可提取的号码数量（1-10000）", "Max numbers per extract (1-10000)")}</p>
            </div>
            <div className="space-y-2">
              <Label>{t("每人每日提取上限", "Per-user daily limit")}</Label>
              <Input
                type="number"
                min={1}
                max={1000}
                value={settingsForm.per_user_daily_limit}
                onChange={(e) =>
                  setSettingsForm((prev) => ({
                    ...prev,
                    per_user_daily_limit: Math.min(1000, Math.max(1, Number(e.target.value) || 1)),
                  }))
                }
              />
              <p className="text-xs text-muted-foreground">{t("每人每天最多可执行的提取次数（1-1000）", "Max extract actions per user per day (1-1000)")}</p>
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-2 pt-4 mt-4 border-t border-border">
            <Button variant="outline" onClick={() => setShowSettingsModal(false)}>
              {t("取消", "Cancel")}
            </Button>
            <Button onClick={handleSaveSettings} disabled={savingSettings}>
              {savingSettings ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {t("保存", "Save")}
            </Button>
          </div>
      </DrawerDetail>
    </Card>
  );
}
