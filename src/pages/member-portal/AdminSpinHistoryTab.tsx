/**
 * Admin Spin History Tab
 * Extracted from MemberPortalSettings.tsx for better code organization
 */
import { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Star, Gift, FileDown, RefreshCw, Dices } from "lucide-react";
import { notify } from "@/lib/notifyHub";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/ui/use-mobile";
import {
  MobileCardList, MobileCard, MobileCardHeader, MobileCardRow,
} from "@/components/ui/mobile-data-card";
import { adminListSpins } from "@/services/memberPortal/memberPortalDiagnosticsRpcService";
import { DrawerDetail } from "@/components/shell/DrawerDetail";
import { ExportConfirmDialog } from "@/components/ExportConfirmDialog";
import { useExportConfirm } from "@/hooks/ui/useExportConfirm";
import { formatBeijingTime } from "@/lib/beijingTime";
import { DATE_RANGES, type DateRangeKey, getDateRangeSql } from "@/lib/dateFilter";
import { formatSpinSource, formatSpinStatus, spinStatusBadgeVariant, type PortalT } from "@/lib/spinFormatters";
import { PaginationBar } from "@/components/common/PaginationBar";
import { StatCard } from "@/components/common/StatCard";
import { MemberPortalLogsEmpty } from "@/components/common/EmptyState";

const SOURCES = ["daily_free","member_portal","share","share_reward","invite","referral","invite_welcome","check_in","checkin","admin","points","purchase","task","bonus"];
const STATUSES = ["issued","pending","processing","cancelled","failed","expired","revoked"];

export function AdminSpinHistoryTab({ t }: { t: PortalT }) {
  const exportConfirm = useExportConfirm();
  const spinMobile = useIsMobile();
  const [spins, setSpins] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateRange, setDateRange] = useState<DateRangeKey>("7d");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [selectedSpin, setSelectedSpin] = useState<any>(null);
  const pageSize = 25;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await adminListSpins({
        p_search: search || undefined,
        p_source: sourceFilter !== "all" ? sourceFilter : undefined,
        p_status: statusFilter !== "all" ? statusFilter : undefined,
        p_date_from: getDateRangeSql(dateRange),
        p_limit: pageSize,
        p_offset: (page - 1) * pageSize,
      });
      setSpins((r?.spins as Record<string, unknown>[]) || []);
      setTotal(r?.total ?? 0);
    } catch (e) {
      console.error('[AdminSpinHistory] load failed:', e);
      notify.error(t("加载抽奖记录失败", "Failed to load spin history"));
      setSpins([]); setTotal(0);
    }
    setLoading(false);
  }, [search, sourceFilter, statusFilter, dateRange, page]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [search, sourceFilter, statusFilter, dateRange]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const hasFilters = search || sourceFilter !== "all" || statusFilter !== "all" || dateRange !== "7d";

  const stats = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todayCount = spins.filter(s => new Date(s.created_at) >= today).length;
    const issuedCount = spins.filter(s => String(s.status).toLowerCase() === "issued").length;
    const pendingCount = spins.filter(s => String(s.status).toLowerCase() === "pending").length;
    return { todayCount, issuedCount, pendingCount };
  }, [spins]);

  const exportCsv = () => {
    if (spins.length === 0) return;
    const headers = [t("手机号","Phone"), t("编号","Code"), t("昵称","Nickname"), t("结果","Result"), t("来源","Source"), t("状态","Status"), t("时间","Time")];
    const rows = spins.map(s => [
      s.phone_number || "", s.member_code || "", s.nickname || "", s.result || "",
      formatSpinSource(s.source, t), formatSpinStatus(s.status, t),
      s.created_at ? formatBeijingTime(s.created_at) : "",
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `spin_history_${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
    notify.success(t("导出成功", "Export successful"));
  };

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={<Dices className="h-4 w-4 text-purple-500" />} label={t("总抽奖次数","Total Spins")} value={total} color="bg-purple-50/50 dark:bg-purple-950/20" />
        <StatCard icon={<Star className="h-4 w-4 text-amber-500" />} label={t("本页今日","Today (page)")} value={stats.todayCount} color="bg-amber-50/50 dark:bg-amber-950/20" />
        <StatCard icon={<Gift className="h-4 w-4 text-green-500" />} label={t("已发放","Issued")} value={stats.issuedCount} color="bg-green-50/50 dark:bg-green-950/20" />
        <StatCard icon={<Loader2 className="h-4 w-4 text-blue-500" />} label={t("待处理","Pending")} value={stats.pendingCount} color="bg-blue-50/50 dark:bg-blue-950/20" />
      </div>

      {/* Filters */}
      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><circle cx="11" cy="11" r="8"/><path strokeLinecap="round" d="m21 21-4.3-4.3"/></svg>
            <Input placeholder={t("搜索手机号/编号/结果...", "Search phone/code/result...")} value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-8 text-sm" />
          </div>
          <select className="h-8 rounded-md border border-input bg-background px-2 text-xs" value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}>
            <option value="all">{t("全部来源", "All Sources")}</option>
            {SOURCES.map(s => <option key={s} value={s}>{formatSpinSource(s, t)}</option>)}
          </select>
          <select className="h-8 rounded-md border border-input bg-background px-2 text-xs" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">{t("全部状态", "All Status")}</option>
            {STATUSES.map(s => <option key={s} value={s}>{formatSpinStatus(s, t)}</option>)}
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
              <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground" onClick={() => { setSearch(""); setSourceFilter("all"); setStatusFilter("all"); setDateRange("7d"); }}>
                {t("清除", "Clear")}
              </Button>
            )}
            <Button variant="outline" size="sm" className="h-8" onClick={() => exportConfirm.requestExport(exportCsv)} disabled={spins.length === 0}>
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
          ) : spinMobile ? (
            <div className="p-3">
              {spins.length === 0 ? (
                <MemberPortalLogsEmpty message={t("暂无抽奖记录", "No spin records")} />
              ) : (
                <MobileCardList>
                  {spins.map((s, i) => (
                    <MobileCard key={s.id} compact accent={s.status === "issued" ? "success" : s.status === "pending" ? "warning" : "default"}>
                      <div className="cursor-pointer" onClick={() => setSelectedSpin(s)}>
                        <MobileCardHeader>
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-xs text-muted-foreground">{(page - 1) * pageSize + i + 1}.</span>
                            <span className="font-medium text-sm truncate">{s.nickname || s.member_code || "-"}</span>
                          </div>
                          <Badge variant={spinStatusBadgeVariant(s.status)} className="text-[10px] shrink-0">{formatSpinStatus(s.status, t)}</Badge>
                        </MobileCardHeader>
                        <MobileCardRow label={t("手机号", "Phone")} value={s.phone_number || "-"} mono />
                        <MobileCardRow label={t("结果", "Result")} value={s.result || "-"} highlight />
                        <MobileCardRow label={t("来源", "Source")} value={formatSpinSource(s.source, t)} />
                        <MobileCardRow label={t("时间", "Time")} value={s.created_at ? formatBeijingTime(s.created_at) : "-"} />
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
                    <TableHead className="whitespace-nowrap">{t("电话号码", "Phone")}</TableHead>
                    <TableHead>{t("结果", "Result")}</TableHead>
                    <TableHead>{t("来源", "Source")}</TableHead>
                    <TableHead>{t("状态", "Status")}</TableHead>
                    <TableHead>{t("时间", "Time")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {spins.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="p-3 align-top">
                        <MemberPortalLogsEmpty message={t("暂无抽奖记录", "No spin records")} />
                      </TableCell>
                    </TableRow>
                  ) : spins.map((s, i) => (
                    <TableRow key={s.id} className="cursor-pointer hover:bg-muted/40 transition-colors" onClick={() => setSelectedSpin(s)}>
                      <TableCell className="text-center text-xs text-muted-foreground">{(page - 1) * pageSize + i + 1}</TableCell>
                      <TableCell>
                        <span className="text-sm font-medium">{s.nickname || s.member_code || "-"}</span>
                      </TableCell>
                      <TableCell className="text-xs font-mono whitespace-nowrap">{s.phone_number || "—"}</TableCell>
                      <TableCell className="font-semibold">{s.result || "-"}</TableCell>
                      <TableCell><Badge variant="outline" className="text-[11px]">{formatSpinSource(s.source, t)}</Badge></TableCell>
                      <TableCell><Badge variant={spinStatusBadgeVariant(s.status)} className="text-[11px]">{formatSpinStatus(s.status, t)}</Badge></TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{s.created_at ? formatBeijingTime(s.created_at) : "-"}</TableCell>
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
        open={!!selectedSpin}
        onOpenChange={(open) => {
          if (!open) setSelectedSpin(null);
        }}
        title={t("抽奖详情", "Spin Detail")}
        sheetMaxWidth="xl"
      >
        {selectedSpin ? (
          <>
            <div className="grid grid-cols-2 gap-3 text-sm">
              {([
                [t("手机号", "Phone"), selectedSpin.phone_number],
                [t("编号", "Code"), selectedSpin.member_code],
                [t("昵称", "Nickname"), selectedSpin.nickname],
                [t("结果", "Result"), selectedSpin.result],
                [t("来源", "Source"), formatSpinSource(selectedSpin.source, t)],
                [t("状态", "Status"), formatSpinStatus(selectedSpin.status, t)],
                [t("类型", "Type"), selectedSpin.spin_type || "-"],
                [t("时间", "Time"), selectedSpin.created_at ? formatBeijingTime(selectedSpin.created_at) : "-"],
              ] as [string, string][]).map(([label, value], idx) => (
                <div key={idx}>
                  <p className="text-[11px] text-muted-foreground">{label}</p>
                  <p className="font-medium">{value || "-"}</p>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap justify-end gap-2 pt-4 mt-4 border-t border-border">
              <Button variant="outline" onClick={() => setSelectedSpin(null)}>
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
