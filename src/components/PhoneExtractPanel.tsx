/**
 * 号码提取 - 放在汇率计算页面右侧，工作任务下面
 * 负责：提取、复制、归还
 */
import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Phone, Copy, RotateCcw, Trash2, Loader2, RefreshCw } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useTenantView } from "@/contexts/TenantViewContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  extractPhones,
  returnPhones,
  getPhoneStats,
  getExtractSettings,
  type ExtractedPhone,
  type PhoneStats,
} from "@/services/phonePoolService";

export function PhoneExtractPanel() {
  const { viewingTenantId } = useTenantView() || {};
  const { employee } = useAuth();
  const { t } = useLanguage();
  const tenantId = viewingTenantId || employee?.tenant_id;
  const effectiveTenantId = tenantId ?? "";

  const [extractedList, setExtractedList] = useState<ExtractedPhone[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [stats, setStats] = useState<PhoneStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [settings, setSettings] = useState({ per_extract_limit: 100, per_user_daily_limit: 5 });
  const [extractCount, setExtractCount] = useState(100);
  const [copyFormat, setCopyFormat] = useState<"comma" | "newline">("comma");
  const [extracting, setExtracting] = useState(false);
  const [returning, setReturning] = useState(false);
  const [dailyLimitReached, setDailyLimitReached] = useState(false);

  const loadStats = useCallback(async () => {
    if (!effectiveTenantId) return;
    setStatsLoading(true);
    try {
      const s = await getPhoneStats(effectiveTenantId);
      setStats(s);
      setDailyLimitReached(s.user_today_extracted >= settings.per_user_daily_limit);
    } catch (e) {
      console.error("Phone stats load failed:", e);
      setStats(null);
    } finally {
      setStatsLoading(false);
    }
  }, [effectiveTenantId, settings.per_user_daily_limit]);

  const loadSettings = useCallback(async () => {
    try {
      const s = await getExtractSettings();
      setSettings(s);
      setExtractCount(s.per_extract_limit || 100);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    if (effectiveTenantId) {
      loadStats();
      const interval = setInterval(loadStats, 10000);
      return () => clearInterval(interval);
    } else {
      setStatsLoading(false);
    }
  }, [effectiveTenantId, loadStats]);

  const handleExtract = async () => {
    if (!effectiveTenantId) return;
    const n = Math.min(Math.max(1, extractCount), settings.per_extract_limit);
    if (dailyLimitReached || (stats && stats.user_today_extracted >= settings.per_user_daily_limit)) {
      toast.error(t("今日提取次数已达上限", "Daily extract limit reached"));
      return;
    }
    if (stats && stats.total_available === 0) {
      toast.error(t("号码池已耗尽", "Phone pool exhausted"));
      return;
    }
    setExtracting(true);
    try {
      const result = await extractPhones(effectiveTenantId, n);
      setExtractedList((prev) => [...result, ...prev]);
      if (result.length < n) {
        toast.success(
          t(`已提取 ${result.length} 个（请求 ${n}，池已不足）`, `Extracted ${result.length} (requested ${n}, pool exhausted)`)
        );
      } else {
        toast.success(t(`已提取 ${result.length} 个号码`, `Extracted ${result.length} numbers`));
      }
      await loadStats();
    } catch (e: any) {
      if (e?.message === "DAILY_LIMIT_EXCEEDED") {
        setDailyLimitReached(true);
        toast.error(t("今日提取次数已达上限", "Daily extract limit reached"));
      } else if (e?.message === "NOT_AUTHENTICATED") {
        toast.error(
          t(
            "登录会话已失效，请刷新页面重新登录后再试",
            "Session expired, please refresh and sign in again"
          )
        );
      } else {
        console.error("Phone extract failed:", e);
        toast.error(
          t(
            "提取失败，请稍后重试或联系管理员",
            "Extract failed, please retry later or contact admin"
          )
        );
      }
    } finally {
      setExtracting(false);
    }
  };

  const handleReturn = async () => {
    if (selectedIds.size === 0) return;
    if (!effectiveTenantId) return;
    setReturning(true);
    try {
      await returnPhones([...selectedIds]);
      setExtractedList((prev) => prev.filter((p) => !selectedIds.has(p.id)));
      setSelectedIds(new Set());
      toast.success(t("已归还选中号码", "Returned selected numbers"));
      await loadStats();
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
        <div className="grid grid-cols-3 gap-1.5 text-sm">
          <div className="rounded border p-1.5 text-center">
            <p className="text-muted-foreground text-[10px]">{t("可用", "Avail")}</p>
            <p className="font-mono text-xs font-semibold">
              {statsLoading ? "…" : (stats ? stats.total_available : "-")}
            </p>
          </div>
          <div className="rounded border p-1.5 text-center">
            <p className="text-muted-foreground text-[10px]">{t("今日", "Today")}</p>
            <p className="font-mono text-xs font-semibold">
              {statsLoading ? "…" : (stats ? `${stats.user_today_extracted}/${settings.per_user_daily_limit}` : "-")}
            </p>
          </div>
          <div className="rounded border p-1.5 text-center">
            <p className="text-muted-foreground text-[10px]">{t("已提取", "Got")}</p>
            <p className="font-mono text-xs font-semibold">
              {statsLoading ? "…" : extractedList.length}
            </p>
          </div>
        </div>

        {/* Extract */}
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={1}
            max={settings.per_extract_limit}
            value={extractCount}
            onChange={(e) => setExtractCount(Math.min(settings.per_extract_limit, Math.max(1, Number(e.target.value) || 1)))}
            className="w-20 h-8 text-xs"
          />
          <Button
            size="sm"
            className="flex-1 h-8"
            onClick={handleExtract}
            disabled={extracting || dailyLimitReached || (stats?.total_available ?? 0) === 0}
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
                <Button size="sm" variant="ghost" className="h-6 px-1.5" onClick={handleReturn} disabled={returning || selectedIds.size === 0}>
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
