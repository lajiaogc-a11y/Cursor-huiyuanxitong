/**
 * 会员端登录流水（member_login_logs），与员工 employee_login_logs 分离展示
 */
import { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, LogIn, RefreshCw, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  MobileCardList,
  MobileCard,
  MobileCardHeader,
  MobileCardRow,
} from "@/components/ui/mobile-data-card";
import { adminListMemberLoginLogs } from "@/services/memberPortal/memberPortalDiagnosticsRpcService";
import { useLanguage } from "@/contexts/LanguageContext";
import { formatBeijingTime } from "@/lib/beijingTime";
import {
  DATE_RANGES,
  type DateRangeKey,
  getDateRangeSql,
  PaginationBar,
  StatCard,
  MemberPortalLogsEmpty,
} from "./shared";

export type MemberLoginLogRow = {
  id: string;
  tenant_id: string | null;
  member_id: string;
  login_at: string;
  phone_number?: string | null;
  member_code?: string | null;
  nickname?: string | null;
};

export function MemberLoginLogsTab() {
  const { t } = useLanguage();
  const logMobile = useIsMobile();
  const [logs, setLogs] = useState<MemberLoginLogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [dateRange, setDateRange] = useState<DateRangeKey>("7d");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const pageSize = 25;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await adminListMemberLoginLogs({
        p_search: search || undefined,
        p_date_from: getDateRangeSql(dateRange),
        p_limit: pageSize,
        p_offset: (page - 1) * pageSize,
      });
      const raw = (r?.logs as Record<string, unknown>[]) || [];
      setLogs(
        raw.map((row) => ({
          id: String(row.id ?? ""),
          tenant_id: row.tenant_id != null ? String(row.tenant_id) : null,
          member_id: String(row.member_id ?? ""),
          login_at: String(row.login_at ?? ""),
          phone_number: row.phone_number != null ? String(row.phone_number) : null,
          member_code: row.member_code != null ? String(row.member_code) : null,
          nickname: row.nickname != null ? String(row.nickname) : null,
        })),
      );
      setTotal(r?.total ?? 0);
    } catch {
      setLogs([]);
      setTotal(0);
    }
    setLoading(false);
  }, [search, dateRange, page]);

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    setPage(1);
  }, [search, dateRange]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const hasFilters = !!(search || dateRange !== "7d");

  const stats = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayCount = logs.filter((l) => new Date(l.login_at) >= today).length;
    const uniqueMembers = new Set(logs.map((l) => l.member_id)).size;
    return { todayCount, uniqueMembers };
  }, [logs]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          icon={<LogIn className="h-4 w-4 text-emerald-500" />}
          label={t("总记录数", "Total records")}
          value={total}
          color="bg-emerald-50/50 dark:bg-emerald-950/20"
        />
        <StatCard
          icon={<Users className="h-4 w-4 text-blue-500" />}
          label={t("本页独立会员", "Unique members (page)")}
          value={stats.uniqueMembers}
          color="bg-blue-50/50 dark:bg-blue-950/20"
        />
        <StatCard
          icon={<LogIn className="h-4 w-4 text-amber-500" />}
          label={t("本页今日", "Today (page)")}
          value={stats.todayCount}
          color="bg-amber-50/50 dark:bg-amber-950/20"
        />
        <StatCard
          icon={<RefreshCw className="h-4 w-4 text-muted-foreground" />}
          label={t("当前页", "Page")}
          value={`${page} / ${totalPages}`}
          color="bg-muted/40"
        />
      </div>

      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[180px] max-w-xs flex-1">
            <Input
              placeholder={t("搜索手机号/编号/昵称...", "Search phone, code, nickname...")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
          <div className="flex items-center overflow-hidden rounded-md border border-input">
            {DATE_RANGES.map((dr) => (
              <button
                key={dr.key}
                type="button"
                onClick={() => setDateRange(dr.key)}
                className={cn(
                  "h-8 px-2.5 text-xs transition-colors",
                  dateRange === dr.key
                    ? "bg-primary text-primary-foreground"
                    : "bg-background hover:bg-muted",
                )}
              >
                {t(dr.zh, dr.en)}
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-1">
            {hasFilters && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs text-muted-foreground"
                onClick={() => {
                  setSearch("");
                  setDateRange("7d");
                }}
              >
                {t("清除", "Clear")}
              </Button>
            )}
            <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => void load()}>
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : logMobile ? (
            <div className="p-3">
              {logs.length === 0 ? (
                <MemberPortalLogsEmpty message={t("暂无会员登录记录", "No member login records")} />
              ) : (
                <MobileCardList>
                  {logs.map((l, i) => (
                    <MobileCard key={l.id} compact>
                      <MobileCardHeader>
                        <div className="min-w-0">
                          <span className="text-xs text-muted-foreground">
                            #{(page - 1) * pageSize + i + 1}
                          </span>
                          <span className="ml-2 text-sm font-medium">{l.nickname || l.member_code || "-"}</span>
                        </div>
                      </MobileCardHeader>
                      <MobileCardRow label={t("手机号", "Phone")} value={l.phone_number || "-"} mono />
                      <MobileCardRow label={t("编号", "Code")} value={l.member_code || "-"} mono />
                      <MobileCardRow
                        label={t("登录时间", "Login time")}
                        value={l.login_at ? formatBeijingTime(l.login_at) : "-"}
                      />
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
                    <TableHead>{t("手机号", "Phone")}</TableHead>
                    <TableHead>{t("编号", "Code")}</TableHead>
                    <TableHead>{t("登录时间", "Login time")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="p-3 align-top">
                        <MemberPortalLogsEmpty message={t("暂无会员登录记录", "No member login records")} />
                      </TableCell>
                    </TableRow>
                  ) : (
                    logs.map((l, i) => (
                      <TableRow key={l.id}>
                        <TableCell className="text-center text-xs text-muted-foreground">
                          {(page - 1) * pageSize + i + 1}
                        </TableCell>
                        <TableCell className="font-medium">{l.nickname || l.member_code || "-"}</TableCell>
                        <TableCell className="font-mono text-xs">{l.phone_number || "-"}</TableCell>
                        <TableCell className="font-mono text-xs">{l.member_code || "-"}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                          {l.login_at ? formatBeijingTime(l.login_at) : "-"}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
          <div className="px-4 pb-3">
            <PaginationBar
              page={page}
              totalPages={totalPages}
              total={total}
              pageSize={pageSize}
              onPageChange={setPage}
              t={t}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
