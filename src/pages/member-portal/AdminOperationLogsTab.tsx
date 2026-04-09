/**
 * Admin Member Operation Logs Tab
 * Extracted from MemberPortalSettings.tsx for better code organization
 */
import { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, ScrollText, Star, Users, Activity, FileDown, RefreshCw } from "lucide-react";
import { notify } from "@/lib/notifyHub";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/ui/use-mobile";
import {
  MobileCardList, MobileCard, MobileCardHeader, MobileCardRow,
} from "@/components/ui/mobile-data-card";
import { adminListMemberOperationLogs } from "@/services/memberPortal/memberPortalDiagnosticsRpcService";
import { DrawerDetail } from "@/components/shell/DrawerDetail";
import { ExportConfirmDialog } from "@/components/ExportConfirmDialog";
import { useExportConfirm } from "@/hooks/ui/useExportConfirm";
import { formatBeijingTime } from "@/lib/beijingTime";
import { useLanguage } from "@/contexts/LanguageContext";
import { DATE_RANGES, type DateRangeKey, getDateRangeSql } from "@/lib/dateFilter";
import { ACTION_MAP, getActionLabel, getActionBadgeClass } from "@/lib/operationLogFormatters";
import { PaginationBar } from "@/components/common/PaginationBar";
import { StatCard } from "@/components/common/StatCard";
import { MemberPortalLogsEmpty } from "@/components/common/EmptyState";

export function AdminOperationLogsTab() {
  const { t } = useLanguage();
  const exportConfirm = useExportConfirm();
  const logMobile = useIsMobile();
  const [logs, setLogs] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [dateRange, setDateRange] = useState<DateRangeKey>("7d");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [selectedLog, setSelectedLog] = useState<any>(null);
  const pageSize = 25;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await adminListMemberOperationLogs({
        p_search: search || undefined,
        p_action: actionFilter !== "all" ? actionFilter : undefined,
        p_date_from: getDateRangeSql(dateRange),
        p_limit: pageSize,
        p_offset: (page - 1) * pageSize,
      });
      setLogs((r?.logs as any[]) || []);
      setTotal(r?.total ?? 0);
    } catch (e) {
      console.error('[AdminOperationLogs] load failed:', e);
      notify.error(t("加载操作日志失败", "Failed to load operation logs"));
      setLogs([]); setTotal(0);
    }
    setLoading(false);
  }, [search, actionFilter, dateRange, page]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [search, actionFilter, dateRange]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const hasFilters = !!(search || actionFilter !== "all" || dateRange !== "7d");

  const stats = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todayCount = logs.filter(l => new Date(l.created_at) >= today).length;
    const actionCounts: Record<string, number> = {};
    logs.forEach(l => { actionCounts[l.action] = (actionCounts[l.action] || 0) + 1; });
    const topAction = Object.entries(actionCounts).sort((a, b) => b[1] - a[1])[0];
    const uniqueMembers = new Set(logs.map(l => l.member_id)).size;
    return { todayCount, topAction, uniqueMembers };
  }, [logs]);

  const exportCsv = () => {
    if (logs.length === 0) return;
    const headers = [t("手机号","Phone"), t("编号","Code"), t("昵称","Nickname"), t("动作","Action"), t("详情","Detail"), t("时间","Time")];
    const rows = logs.map(l => [
      l.phone_number || "", l.member_code || "", l.nickname || "",
      getActionLabel(l.action, t), l.detail || "",
      l.created_at ? formatBeijingTime(l.created_at) : "",
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `member_logs_${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
    notify.success(t("导出成功", "Export successful"));
  };

  const ACTIONS = Object.keys(ACTION_MAP);

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={<ScrollText className="h-4 w-4 text-indigo-500" />} label={t("总日志数","Total Logs")} value={total} color="bg-indigo-50/50 dark:bg-indigo-950/20" />
        <StatCard icon={<Star className="h-4 w-4 text-amber-500" />} label={t("本页今日","Today (page)")} value={stats.todayCount} color="bg-amber-50/50 dark:bg-amber-950/20" />
        <StatCard icon={<Users className="h-4 w-4 text-blue-500" />} label={t("活跃会员","Active Members")} value={stats.uniqueMembers} color="bg-blue-50/50 dark:bg-blue-950/20" />
        <StatCard
          icon={<Activity className="h-4 w-4 text-purple-500" />}
          label={t("最多操作","Top Action")}
          value={stats.topAction ? getActionLabel(stats.topAction[0], t) : "-"}
          sub={stats.topAction ? `${stats.topAction[1]} ${t("次","times")}` : undefined}
          color="bg-purple-50/50 dark:bg-purple-950/20"
        />
      </div>

      {/* Filters */}
      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><circle cx="11" cy="11" r="8"/><path strokeLinecap="round" d="m21 21-4.3-4.3"/></svg>
            <Input placeholder={t("搜索手机号/编号/昵称/详情...", "Search phone/code/name/detail...")} value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-8 text-sm" />
          </div>
          <select className="h-8 rounded-md border border-input bg-background px-2 text-xs" value={actionFilter} onChange={(e) => setActionFilter(e.target.value)}>
            <option value="all">{t("全部动作", "All Actions")}</option>
            {ACTIONS.map(a => <option key={a} value={a}>{getActionLabel(a, t)}</option>)}
          </select>
          <div className="flex items-center rounded-md border border-input overflow-hidden">
            {DATE_RANGES.map(dr => (
              <button key={dr.key} onClick={() => setDateRange(dr.key)}
                className={cn("px-2.5 h-8 text-xs transition-colors", dateRange === dr.key ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted")}>
                {t(dr.zh, dr.en)}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 ml-auto">
            {hasFilters && (
              <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground" onClick={() => { setSearch(""); setActionFilter("all"); setDateRange("7d"); }}>
                {t("清除", "Clear")}
              </Button>
            )}
            <Button variant="outline" size="sm" className="h-8" onClick={() => exportConfirm.requestExport(exportCsv)} disabled={logs.length === 0}>
              <FileDown className="h-3.5 w-3.5 mr-1" />{t("导出", "Export")}
            </Button>
            <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={load}>
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            </Button>
          </div>
        </div>
      </Card>

      {/* Table / Mobile Cards */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : logMobile ? (
            <div className="p-3">
              {logs.length === 0 ? (
                <MemberPortalLogsEmpty message={t("暂无操作日志", "No operation logs")} />
              ) : (
                <MobileCardList>
                  {logs.map((l, i) => (
                    <MobileCard key={l.id} compact>
                      <div className="cursor-pointer" onClick={() => setSelectedLog(l)}>
                        <MobileCardHeader>
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-xs text-muted-foreground">{(page - 1) * pageSize + i + 1}.</span>
                            <span className="font-medium text-sm truncate">{l.nickname || l.member_code || "-"}</span>
                          </div>
                          <Badge className={cn("text-[10px] font-medium shrink-0", getActionBadgeClass(l.action))}>
                            {getActionLabel(l.action, t)}
                          </Badge>
                        </MobileCardHeader>
                        <MobileCardRow label={t("手机号", "Phone")} value={l.phone_number || "-"} mono />
                        <MobileCardRow label={t("详情", "Detail")} value={<span className="line-clamp-2 text-right">{l.detail || "-"}</span>} />
                        <MobileCardRow label={t("时间", "Time")} value={l.created_at ? formatBeijingTime(l.created_at) : "-"} />
                      </div>
                    </MobileCard>
                  ))}
                </MobileCardList>
              )}
            </div>
          ) : (
            <div className="overflow-auto">
              <Table className="text-sm">
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="w-10 text-center">#</TableHead>
                    <TableHead>{t("会员", "Member")}</TableHead>
                    <TableHead>{t("动作", "Action")}</TableHead>
                    <TableHead className="min-w-[200px]">{t("详情", "Detail")}</TableHead>
                    <TableHead>{t("时间", "Time")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="p-3 align-top">
                        <MemberPortalLogsEmpty message={t("暂无操作日志", "No operation logs")} />
                      </TableCell>
                    </TableRow>
                  ) : logs.map((l, i) => (
                    <TableRow key={l.id} className="cursor-pointer hover:bg-muted/40 transition-colors" onClick={() => setSelectedLog(l)}>
                      <TableCell className="text-center text-xs text-muted-foreground">{(page - 1) * pageSize + i + 1}</TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-0.5">
                          <span className="text-sm font-medium">{l.nickname || l.member_code || "-"}</span>
                          <span className="text-[11px] text-muted-foreground font-mono">{l.phone_number || "-"}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={cn("text-[11px] font-medium", getActionBadgeClass(l.action))}>
                          {getActionLabel(l.action, t)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs max-w-[280px]">
                        <span className="line-clamp-2">{l.detail || "-"}</span>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{l.created_at ? formatBeijingTime(l.created_at) : "-"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <div className="px-4 pb-3">
            <PaginationBar page={page} totalPages={totalPages} total={total} pageSize={pageSize} onPageChange={setPage} t={t} />
          </div>
        </CardContent>
      </Card>

      <DrawerDetail
        open={!!selectedLog}
        onOpenChange={(open) => {
          if (!open) setSelectedLog(null);
        }}
        title={t("操作详情", "Log Detail")}
        sheetMaxWidth="xl"
      >
        {selectedLog ? (
          <>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 text-sm">
                {([
                  [t("手机号", "Phone"), selectedLog.phone_number],
                  [t("编号", "Code"), selectedLog.member_code],
                  [t("昵称", "Nickname"), selectedLog.nickname],
                  [t("时间", "Time"), selectedLog.created_at ? formatBeijingTime(selectedLog.created_at) : "-"],
                ] as [string, string][]).map(([label, value], idx) => (
                  <div key={idx}>
                    <p className="text-[11px] text-muted-foreground">{label}</p>
                    <p className="font-medium">{value || "-"}</p>
                  </div>
                ))}
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground mb-1">{t("动作", "Action")}</p>
                <Badge className={cn("text-xs font-medium", getActionBadgeClass(selectedLog.action))}>
                  {getActionLabel(selectedLog.action, t)}
                </Badge>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground mb-1">{t("详情", "Detail")}</p>
                <p className="text-sm bg-muted/50 rounded-lg p-3 whitespace-pre-wrap break-all">
                  {selectedLog.detail || t("无详情", "No detail")}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap justify-end gap-2 pt-4 mt-4 border-t border-border">
              <Button variant="outline" onClick={() => setSelectedLog(null)}>
                {t("关闭", "Close")}
              </Button>
            </div>
          </>
        ) : null}
      </DrawerDetail>

      <ExportConfirmDialog
        open={exportConfirm.open}
        onOpenChange={exportConfirm.handleOpenChange}
        onConfirm={exportConfirm.handleConfirm}
      />
    </div>
  );
}
