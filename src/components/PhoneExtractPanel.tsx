/**
 * 号码提取 - 放在汇率计算页面右侧，工作任务下面
 * 负责：提取、复制、归还
 */
import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Phone, Copy, RotateCcw, Trash2, Loader2, RefreshCw } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useTenantView } from "@/contexts/TenantViewContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useIsPlatformAdminViewingTenant } from "@/hooks/useIsPlatformAdminViewingTenant";
import {
  extractPhonesResult,
  returnPhonesResult,
  getPhoneStatsResult,
  getExtractSettingsResult,
  getMyReservedPhones,
  type ExtractedPhone,
  type PhoneStats,
} from "@/services/phonePoolService";

export function PhoneExtractPanel() {
  const { viewingTenantId } = useTenantView() || {};
  const { employee } = useAuth();
  const { t } = useLanguage();
  const tenantId = viewingTenantId || employee?.tenant_id;
  const effectiveTenantId = tenantId ?? "";
  const isPlatformAdminReadonlyView = useIsPlatformAdminViewingTenant();

  const [extractedList, setExtractedList] = useState<ExtractedPhone[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [stats, setStats] = useState<PhoneStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [settings, setSettings] = useState({ per_extract_limit: 100, per_user_daily_limit: 5 });
  const [copyFormat, setCopyFormat] = useState<"comma" | "newline">("comma");
  const [extracting, setExtracting] = useState(false);
  const [returning, setReturning] = useState(false);

  const loadStats = useCallback(async () => {
    if (!effectiveTenantId) return;
    setStatsLoading(true);
    try {
      const s = await getPhoneStatsResult(effectiveTenantId);
      if (s.ok) {
        setStats(s.data);
      } else {
        setStats(null);
      }
    } catch (e) {
      console.error("Phone stats load failed:", e);
      setStats(null);
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

  const loadReservedPhones = useCallback(async () => {
    if (!effectiveTenantId) return;
    try {
      const reserved = await getMyReservedPhones(effectiveTenantId);
      setExtractedList((prev) => {
        const map = new Map<number, ExtractedPhone>();
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

  const handleExtract = async () => {
    if (!effectiveTenantId) return;
    if (isPlatformAdminReadonlyView) {
      toast.error(t("平台总管理查看租户时为只读，无法提取号码", "Read-only in platform admin tenant view"));
      return;
    }
    if (stats && stats.total_available === 0) {
      toast.error(t("号码池已耗尽", "Phone pool exhausted"));
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
        toast.success(
          t(`已提取 ${result.length} 个（请求 ${n}，池已不足）`, `Extracted ${result.length} (requested ${n}, pool exhausted)`)
        );
      } else {
        toast.success(t(`已提取 ${result.length} 个号码`, `Extracted ${result.length} numbers`));
      }
      await loadStats();
    } catch (e: any) {
      const code = e?.code || e?.message;
      if (code === "DAILY_LIMIT_EXCEEDED") {
        toast.error(t("今日提取次数已达上限", "Daily extract limit reached"));
      } else if (code === "NOT_AUTHENTICATED") {
        toast.error(
          t(
            "登录会话已失效，请刷新页面重新登录后再试",
            "Session expired, please refresh and sign in again"
          )
        );
      } else if (code === "FORBIDDEN_TENANT_MISMATCH") {
        toast.error(
          t(
            "当前租户与操作租户不一致，请退出租户视图后重试",
            "Tenant mismatch. Exit tenant view and retry"
          )
        );
      } else if (code === "TENANT_REQUIRED") {
        toast.error(t("未识别到租户，请重新登录后重试", "Tenant not found, please sign in again"));
      } else {
        console.error("Phone extract failed:", e);
        const detail = e?.message ? ` (${e.message})` : "";
        toast.error(
          t(
            `提取失败，请稍后重试或联系管理员${detail}`,
            `Extract failed, please retry later or contact admin${detail}`
          )
        );
      }
    } finally {
      setExtracting(false);
    }
  };

  const handleReturn = async () => {
    if (isPlatformAdminReadonlyView) {
      toast.error(t("平台总管理查看租户时为只读，无法归还号码", "Read-only in platform admin tenant view"));
      return;
    }
    if (extractedList.length === 0) {
      toast.error(t("暂无可归还号码", "No numbers to return"));
      return;
    }
    if (!effectiveTenantId) return;
    const targetIds = selectedIds.size > 0 ? [...selectedIds] : extractedList.map((p) => p.id);
    setReturning(true);
    try {
      const returned = await returnPhonesResult(targetIds);
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
        toast.error(
          t(
            "未归还成功：号码可能已被归还或无权限",
            "No numbers returned: already returned or no permission"
          )
        );
      } else if (returnedIds.length < targetIds.length) {
        toast.warning(
          t(
            `部分归还成功：${returnedIds.length}/${targetIds.length}`,
            `Partially returned: ${returnedIds.length}/${targetIds.length}`
          )
        );
      } else {
        toast.success(
          selectedIds.size > 0
            ? t(`已归还选中号码（${returnedIds.length}）`, `Returned selected numbers (${returnedIds.length})`)
            : t(`已归还全部号码（${returnedIds.length}）`, `Returned all numbers (${returnedIds.length})`)
        );
      }
      await loadStats();
      await loadReservedPhones();
    } catch (e) {
      toast.error(t("归还失败", "Return failed"));
    } finally {
      setReturning(false);
    }
  };

  const handleCopy = () => {
    const list =
      selectedIds.size > 0
        ? extractedList.filter((p) => selectedIds.has(p.id)).map((p) => p.normalized)
        : extractedList.map((p) => p.normalized);
    if (list.length === 0) {
      toast.error(t("无号码可复制", "No numbers to copy"));
      return;
    }
    const text = copyFormat === "comma" ? list.join(",") : list.join("\n");
    navigator.clipboard.writeText(text).then(
      () => toast.success(t("已复制到剪贴板", "Copied to clipboard")),
      () => toast.error(t("复制失败", "Copy failed"))
    );
  };

  const handleClearList = () => {
    setExtractedList([]);
    setSelectedIds(new Set());
    toast.success(t("已清空列表", "List cleared"));
  };

  const toggleSelect = (id: number) => {
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
        {/* Stats */}
        <div className="grid grid-cols-3 gap-1.5">
          {[
            { label: t("可用", "Avail"),  value: statsLoading ? "…" : (stats ? stats.total_available : "-") },
            {
              label: t("净提取/次数", "Net/Acts"),
              value: statsLoading ? "…" : (stats ? `${stats.user_today_extracted} / ${stats.user_today_extract_actions}次` : "-"),
            },
            { label: t("持有", "Hold"),   value: statsLoading ? "…" : extractedList.length },
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
            onClick={handleExtract}
            disabled={isPlatformAdminReadonlyView || extracting || (stats?.total_available ?? 0) === 0}
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
                <Button size="sm" variant="ghost" className="h-6 px-1.5" onClick={handleReturn} disabled={isPlatformAdminReadonlyView || returning || extractedList.length === 0}>
                  {returning ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                </Button>
                <Button size="sm" variant="ghost" className="h-6 px-1.5" onClick={handleClearList}>
                  <Trash2 className="h-3 w-3" />
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
      </CardContent>
    </Card>
  );
}
