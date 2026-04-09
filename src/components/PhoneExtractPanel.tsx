/**
 * 号码提取 - 放在汇率计算页面右侧，工作任务下面
 * 负责：提取、复制、归还
 */
import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { DrawerDetail } from "@/components/shell/DrawerDetail";
import { Phone, Copy, RotateCcw, Trash2, Loader2, RefreshCw } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useTenantView } from "@/contexts/TenantViewContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";
import { notify } from "@/lib/notifyHub";
import { useIsPlatformAdminViewingTenant } from "@/hooks/auth/useIsPlatformAdminViewingTenant";
import { verifyEmployeeLoginDetailedApi } from "@/services/auth/authApiService";
import {
  extractPhonesResult,
  consumePhonesResult,
  returnPhonesResult,
  getPhoneStatsResult,
  getExtractSettingsResult,
  getMyReservedPhones,
  type ExtractedPhone,
  type PhoneStats,
} from "@/services/phonePoolService";
import { showServiceErrorToast } from "@/lib/serviceErrorToast";
import { useTenantFeatureFlag } from "@/hooks/system/useTenantFeatureFlag";
import { FEATURE_FLAGS } from "@/services/featureFlagService";

const _phoneExtractCache = new Map<string, { stats: PhoneStats | null; extractedList: ExtractedPhone[]; settings: { per_extract_limit: number; per_user_daily_limit: number } }>();

export function PhoneExtractPanel() {
  const { viewingTenantId } = useTenantView() || {};
  const { employee } = useAuth();
  const { t } = useLanguage();
  const tenantId = viewingTenantId || employee?.tenant_id;
  const effectiveTenantId = tenantId ?? "";
  const isPlatformAdminReadonlyView = useIsPlatformAdminViewingTenant();
  const { enabled: phoneExtractEnabled, loading: phoneExtractFlagLoading } = useTenantFeatureFlag(
    FEATURE_FLAGS.PHONE_EXTRACT,
    true
  );

  const cached = effectiveTenantId ? _phoneExtractCache.get(effectiveTenantId) : undefined;
  const [extractedList, setExtractedList] = useState<ExtractedPhone[]>(cached?.extractedList ?? []);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [stats, setStats] = useState<PhoneStats | null>(cached?.stats ?? null);
  const [statsLoading, setStatsLoading] = useState(!cached);
  const [settings, setSettings] = useState(cached?.settings ?? { per_extract_limit: 100, per_user_daily_limit: 5 });
  const [copyFormat, setCopyFormat] = useState<"comma" | "newline">("comma");
  const [extracting, setExtracting] = useState(false);
  const [returning, setReturning] = useState(false);
  const [consuming, setConsuming] = useState(false);
  const [passwordDialogAction, setPasswordDialogAction] = useState<"extract" | "return" | "consume" | null>(null);
  const [confirmPassword, setConfirmPassword] = useState("");
  const [verifyingPassword, setVerifyingPassword] = useState(false);

  const loadStats = useCallback(async () => {
    if (!effectiveTenantId) return;
    if (!_phoneExtractCache.has(effectiveTenantId)) setStatsLoading(true);
    try {
      const s = await getPhoneStatsResult(effectiveTenantId);
      if (s.ok) {
        setStats(s.data);
        const prev = _phoneExtractCache.get(effectiveTenantId);
        _phoneExtractCache.set(effectiveTenantId, { stats: s.data, extractedList: prev?.extractedList ?? [], settings: prev?.settings ?? { per_extract_limit: 100, per_user_daily_limit: 5 } });
      } else {
        setStats(null);
      }
    } catch (e) {
      console.error("Phone stats load failed:", e);
      if (!_phoneExtractCache.has(effectiveTenantId)) setStats(null);
    } finally {
      setStatsLoading(false);
    }
  }, [effectiveTenantId]);

  const loadSettings = useCallback(async () => {
    try {
      const s = await getExtractSettingsResult();
      if (s.ok) {
        setSettings(s.data);
        if (effectiveTenantId) {
          const prev = _phoneExtractCache.get(effectiveTenantId);
          if (prev) _phoneExtractCache.set(effectiveTenantId, { ...prev, settings: s.data });
        }
      }
    } catch (e) {
      console.error(e);
    }
  }, [effectiveTenantId]);

  const loadReservedPhones = useCallback(async () => {
    if (!effectiveTenantId) return;
    try {
      const reserved = await getMyReservedPhones(effectiveTenantId);
      setExtractedList((prev) => {
        const map = new Map<string, ExtractedPhone>();
        [...reserved, ...prev].forEach((p) => map.set(p.id, p));
        return [...map.values()];
      });
    } catch (e) {
      console.error("Load reserved phones failed:", e);
    }
  }, [effectiveTenantId]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    if (effectiveTenantId) {
      loadStats();
      loadReservedPhones();
      const interval = setInterval(loadStats, 10000);
      return () => clearInterval(interval);
    } else {
      setStatsLoading(false);
    }
  }, [effectiveTenantId, loadStats, loadReservedPhones]);

  // 轮询替代 Realtime 订阅：每 15 秒刷新号码池数据
  useEffect(() => {
    if (!effectiveTenantId) return;
    const timer = setInterval(() => {
      void loadStats();
      void loadReservedPhones();
    }, 15000);
    return () => {
      clearInterval(timer);
    };
  }, [effectiveTenantId, loadReservedPhones, loadStats]);

  const verifyPassword = async () => {
    if (!employee?.username) {
      notify.error(t("未识别到当前账号，请重新登录", "Current user not found, please sign in again"));
      return false;
    }
    if (!confirmPassword.trim()) {
      notify.error(t("请输入密码确认", "Please enter password"));
      return false;
    }
    setVerifyingPassword(true);
    try {
      const row = await verifyEmployeeLoginDetailedApi(employee.username, confirmPassword);
      if (!row || row.error_code) return false;
      return !!row.verified;
    } catch {
      return false;
    } finally {
      setVerifyingPassword(false);
    }
  };

  const executeExtract = async () => {
    if (!effectiveTenantId) return;
    if (!phoneExtractEnabled) {
      notify.error(t("该租户已关闭号码提取功能", "Phone extract is disabled for this tenant"));
      return;
    }
    if (isPlatformAdminReadonlyView) {
      notify.error(t("平台总管理查看租户时为只读，无法提取号码", "Read-only in platform admin tenant view"));
      return;
    }
    if (stats && stats.total_available === 0) {
      notify.error(t("号码池已耗尽", "Phone pool exhausted"));
      return;
    }
    if (extractedList.length > 0) {
      notify.error(t("请先归还或删除当前已提取号码后再提取", "Please return or delete current extracted numbers first"));
      return;
    }
    setExtracting(true);
    try {
      // 每次提取前读取最新设置，确保汇率页执行与“提取设置”完全一致
      let latestSettings = settings;
      try {
        const latest = await getExtractSettingsResult();
        if (latest.ok) {
          latestSettings = latest.data;
          setSettings(latestSettings);
        }
      } catch (e) {
        console.error("Load latest extract settings failed, fallback to local settings:", e);
      }
      const n = Math.max(1, latestSettings.per_extract_limit || 1);

      const extractedResult = await extractPhonesResult(effectiveTenantId, n);
      if (!extractedResult.ok) {
        throw extractedResult.error;
      }
      const result = extractedResult.data;
      setExtractedList((prev) => [...result, ...prev]);
      // 默认选中本次提取结果，便于一键归还
      setSelectedIds((prev) => {
        const next = new Set(prev);
        result.forEach((item) => next.add(item.id));
        return next;
      });
      if (result.length < n) {
        notify.success(
          t(`已提取 ${result.length} 个（请求 ${n}，池已不足）`, `Extracted ${result.length} (requested ${n}, pool exhausted)`)
        );
      } else {
        notify.success(t(`已提取 ${result.length} 个号码`, `Extracted ${result.length} numbers`));
      }
      await loadStats();
    } catch (e: any) {
      console.error("Phone extract failed:", e);
      showServiceErrorToast(e, t, "提取失败，请稍后重试或联系管理员", "Extract failed, please retry later or contact admin");
    } finally {
      setExtracting(false);
    }
  };

  const executeReturn = async () => {
    if (!phoneExtractEnabled) {
      notify.error(t("该租户已关闭号码提取功能", "Phone extract is disabled for this tenant"));
      return;
    }
    if (isPlatformAdminReadonlyView) {
      notify.error(t("平台总管理查看租户时为只读，无法归还号码", "Read-only in platform admin tenant view"));
      return;
    }
    if (extractedList.length === 0) {
      notify.error(t("暂无可归还号码", "No numbers to return"));
      return;
    }
    if (!effectiveTenantId) return;
    const targetIds = selectedIds.size > 0 ? [...selectedIds] : extractedList.map((p) => p.id);
    setReturning(true);
    try {
      const returned = await returnPhonesResult(effectiveTenantId, targetIds);
      if (!returned.ok) {
        throw returned.error;
      }
      const returnedIds = returned.data;
      const returnedSet = new Set(returnedIds);

      setExtractedList((prev) => prev.filter((p) => !returnedSet.has(p.id)));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        returnedIds.forEach((id) => next.delete(id));
        return next;
      });

      if (returnedIds.length === 0) {
        notify.error(
          t(
            "未归还成功：号码可能已被归还或无权限",
            "No numbers returned: already returned or no permission"
          )
        );
      } else if (returnedIds.length < targetIds.length) {
        notify.warning(
          t(
            `部分归还成功：${returnedIds.length}/${targetIds.length}`,
            `Partially returned: ${returnedIds.length}/${targetIds.length}`
          )
        );
      } else {
        notify.success(
          selectedIds.size > 0
            ? t(`已归还选中号码（${returnedIds.length}）`, `Returned selected numbers (${returnedIds.length})`)
            : t(`已归还全部号码（${returnedIds.length}）`, `Returned all numbers (${returnedIds.length})`)
        );
      }
      await loadStats();
      await loadReservedPhones();
    } catch (e) {
      showServiceErrorToast(e, t, "归还失败", "Return failed");
    } finally {
      setReturning(false);
    }
  };

  const executeConsume = async () => {
    if (!effectiveTenantId) return;
    if (!phoneExtractEnabled) {
      notify.error(t("该租户已关闭号码提取功能", "Phone extract is disabled for this tenant"));
      return;
    }
    if (isPlatformAdminReadonlyView) {
      notify.error(t("平台总管理查看租户时为只读，无法删除号码", "Read-only in platform admin tenant view"));
      return;
    }
    if (extractedList.length === 0) {
      notify.error(t("暂无可删除号码", "No numbers to delete"));
      return;
    }
    const targetIds = selectedIds.size > 0 ? [...selectedIds] : extractedList.map((p) => p.id);
    setConsuming(true);
    try {
      const consumed = await consumePhonesResult(effectiveTenantId, targetIds);
      if (!consumed.ok) throw consumed.error;
      const consumedIds = consumed.data;
      const consumedSet = new Set(consumedIds);
      setExtractedList((prev) => prev.filter((p) => !consumedSet.has(p.id)));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        consumedIds.forEach((id) => next.delete(id));
        return next;
      });
      if (consumedIds.length === 0) {
        notify.error(t("未删除成功：号码可能已被处理或无权限", "No numbers deleted: already handled or no permission"));
      } else {
        notify.success(
          selectedIds.size > 0
            ? t(`已删除选中号码（${consumedIds.length}）`, `Deleted selected numbers (${consumedIds.length})`)
            : t(`已删除全部号码（${consumedIds.length}）`, `Deleted all numbers (${consumedIds.length})`)
        );
      }
      await loadStats();
      await loadReservedPhones();
    } catch (e) {
      showServiceErrorToast(e, t, "删除失败", "Delete failed");
    } finally {
      setConsuming(false);
    }
  };

  const openPasswordDialog = (action: "extract" | "return" | "consume") => {
    if (!phoneExtractEnabled) {
      notify.error(t("该租户已关闭号码提取功能", "Phone extract is disabled for this tenant"));
      return;
    }
    setConfirmPassword("");
    setPasswordDialogAction(action);
  };

  const handlePasswordConfirmedAction = async () => {
    const ok = await verifyPassword();
    if (!ok) {
      notify.error(t("密码错误，操作已取消", "Invalid password, action cancelled"));
      return;
    }
    const action = passwordDialogAction;
    setPasswordDialogAction(null);
    if (action === "extract") await executeExtract();
    if (action === "return") await executeReturn();
    if (action === "consume") await executeConsume();
  };

  const handleCopy = () => {
    const list =
      selectedIds.size > 0
        ? extractedList.filter((p) => selectedIds.has(p.id)).map((p) => p.normalized)
        : extractedList.map((p) => p.normalized);
    if (list.length === 0) {
      notify.error(t("无号码可复制", "No numbers to copy"));
      return;
    }
    const text = copyFormat === "comma" ? list.join(",") : list.join("\n");
    navigator.clipboard.writeText(text).then(
      () => notify.success(t("已复制到剪贴板", "Copied to clipboard")),
      () => notify.error(t("复制失败", "Copy failed"))
    );
  };

  const actionTitleMap: Record<"extract" | "return" | "consume", string> = {
    extract: t("确认提取号码", "Confirm Extract"),
    return: t("确认归还号码", "Confirm Return"),
    consume: t("确认删除号码", "Confirm Delete"),
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === extractedList.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(extractedList.map((p) => p.id)));
    }
  };

  if (!effectiveTenantId) return null;
  if (phoneExtractFlagLoading) {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-muted-foreground">
          {t("正在加载功能开关...", "Loading feature flags...")}
        </CardContent>
      </Card>
    );
  }
  if (!phoneExtractEnabled) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Phone className="h-4 w-4" />
            {t("号码提取", "Phone Extract")}
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {t("该租户已关闭号码提取功能，如需启用请联系平台管理员在「平台设置 > 功能开关」开启。", "Phone extract is disabled for this tenant. Contact platform admin to enable it in Platform Settings > Feature Flags.")}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Phone className="h-4 w-4" />
              {t("号码提取", "Phone Extract")}
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t("提取、复制、归还。设置请从左侧导航进入。", "Extract, copy, return. Settings via left nav.")}
            </p>
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 shrink-0"
            onClick={() => loadStats()}
            disabled={statsLoading || !effectiveTenantId}
            title={t("刷新", "Refresh")}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", statsLoading && "animate-spin")} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Stats: 可用、今日净提取/次数、当前持有 */}
        <div className="grid grid-cols-3 gap-1.5">
          {[
            { label: t("可用", "Avail"), value: statsLoading ? "…" : (stats ? String(stats.total_available) : "-") },
            {
              label: t("今日/次数", "Today/Acts"),
              value: statsLoading ? "…" : (stats ? `${stats.user_today_extracted} / ${stats.user_today_extract_actions}` : "-"),
            },
            { label: t("持有", "Hold"), value: statsLoading ? "…" : String(extractedList.length) },
          ].map(({ label, value }) => (
            <div key={label} className="rounded border bg-muted/30 py-1.5 px-1 text-center">
              <p className="text-[10px] text-muted-foreground">{label}</p>
              <p className="font-mono text-xs font-semibold mt-0.5 tabular-nums">{value}</p>
            </div>
          ))}
        </div>

        {/* Extract */}
        <div className="flex items-center gap-2">
          <div className="h-8 px-2 rounded border bg-muted/30 text-xs flex items-center whitespace-nowrap">
            {t("每次提取", "Per extract")} {settings.per_extract_limit}
          </div>
          <Button
            size="sm"
            className="flex-1 h-8"
            onClick={() => openPasswordDialog("extract")}
            disabled={
              isPlatformAdminReadonlyView ||
              extracting ||
              verifyingPassword ||
              consuming ||
              returning ||
              (stats?.total_available ?? 0) === 0 ||
              extractedList.length > 0
            }
          >
            {extracting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {t("提取", "Extract")}
          </Button>
        </div>

        {/* Extracted list */}
        {extractedList.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-1">
              <select
                value={copyFormat}
                onChange={(e) => setCopyFormat(e.target.value as "comma" | "newline")}
                className="text-[10px] border rounded px-1.5 py-0.5 h-6"
              >
                <option value="comma">{t("逗号", "Comma")}</option>
                <option value="newline">{t("换行", "Newline")}</option>
              </select>
              <div className="flex gap-0.5">
                <Button size="sm" variant="ghost" className="h-6 px-1.5" onClick={handleCopy}>
                  <Copy className="h-3 w-3" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-1.5"
                  onClick={() => openPasswordDialog("return")}
                  disabled={isPlatformAdminReadonlyView || returning || extractedList.length === 0 || verifyingPassword || consuming}
                >
                  {returning ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-1.5"
                  onClick={() => openPasswordDialog("consume")}
                  disabled={isPlatformAdminReadonlyView || consuming || extractedList.length === 0 || verifyingPassword || returning}
                >
                  {consuming ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                </Button>
              </div>
            </div>
            <div className="max-h-32 overflow-y-auto rounded border p-1.5 space-y-0.5">
              <div className="flex items-center gap-1.5 pb-1 border-b">
                <Checkbox
                  checked={selectedIds.size === extractedList.length && extractedList.length > 0}
                  onCheckedChange={toggleSelectAll}
                  className="h-3 w-3"
                />
                <span className="text-[10px] text-muted-foreground">{t("全选", "All")}</span>
              </div>
              {extractedList.slice(0, 30).map((p) => (
                <div key={p.id} className="flex items-center gap-1.5 text-xs font-mono">
                  <Checkbox checked={selectedIds.has(p.id)} onCheckedChange={() => toggleSelect(p.id)} className="h-3 w-3" />
                  <span className="truncate">{p.normalized}</span>
                </div>
              ))}
              {extractedList.length > 30 && (
                <p className="text-[10px] text-muted-foreground">... {extractedList.length}</p>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground">
              {t("提示：不勾选时点击归还将归还全部号码", "Tip: If none selected, Return will return all numbers")}
            </p>
          </div>
        )}

        {!statsLoading && !stats && effectiveTenantId && (
          <p className="text-xs text-amber-600 dark:text-amber-400">{t("加载失败，请点击右上角刷新", "Load failed. Click refresh to retry.")}</p>
        )}
        {stats && stats.total_available === 0 && (
          <p className="text-xs text-amber-600 dark:text-amber-400">{t("池已耗尽，请到提取设置导入", "Pool exhausted. Import in Extract Settings.")}</p>
        )}
        {extractedList.length > 0 && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            {t("当前有未处理号码，请先归还或删除后再提取下一批", "You have unprocessed numbers. Return or delete them before next extract.")}
          </p>
        )}
      </CardContent>

      <DrawerDetail
        open={!!passwordDialogAction}
        onOpenChange={(open) => {
          if (!open) setPasswordDialogAction(null);
        }}
        title={passwordDialogAction ? actionTitleMap[passwordDialogAction] : t("确认操作", "Confirm Action")}
        description={t("请输入当前账号密码进行安全确认", "Enter current account password to continue")}
        sheetMaxWidth="xl"
      >
        <div className="space-y-2">
          <Input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder={t("输入密码", "Enter password")}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                void handlePasswordConfirmedAction();
              }
            }}
          />
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4 mt-4">
          <Button variant="outline" onClick={() => setPasswordDialogAction(null)}>
            {t("取消", "Cancel")}
          </Button>
          <Button onClick={() => void handlePasswordConfirmedAction()} disabled={verifyingPassword}>
            {verifyingPassword ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            {t("确认", "Confirm")}
          </Button>
        </div>
      </DrawerDetail>
    </Card>
  );
}
