import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CompactTableSkeleton } from "@/components/skeletons/TablePageSkeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import type { LucideIcon } from "lucide-react";
import { RefreshCw, CalendarClock, Dices, Star } from "lucide-react";
import { toast } from "sonner";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { useIsPlatformAdminViewingTenant } from "@/hooks/useIsPlatformAdminViewingTenant";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  MobileCardList,
  MobileCard,
  MobileCardHeader,
  MobileCardRow,
} from "@/components/ui/mobile-data-card";
import { adminListPortalCheckIns, type PortalCheckInLogRow } from "@/services/members/memberPortalSettingsService";
import { adminGetLotteryLogs, type LotteryLog } from "@/services/lottery/lotteryService";
import {
  getActivityDataRetentionApi,
  putActivityDataRetentionApi,
  postActivityDataRetentionRunApi,
} from "@/services/staff/dataApi/activityDataRetention";
import { cn } from "@/lib/utils";
import {
  PaginationBar,
  portalSettingsEmptyShellClass,
  portalSettingsEmptyIconWrapClass,
} from "../member-portal/shared";
import { AdminSpinHistoryTab } from "../member-portal/AdminSpinHistoryTab";
import { formatBeijingTime } from "@/lib/beijingTime";
const LOTTERY_ADMIN_LOGS_PAGE_SIZE = 50;
const CHECKIN_ADMIN_PAGE_SIZE = 50;

function lotteryLogMemberLabel(log: LotteryLog): string {
  const n = log.nickname?.trim();
  if (n) return n;
  const c = log.member_code?.trim();
  if (c) return c;
  return log.member_id;
}

// ─── 分区标题组件 ──────────────────────────────────────────────────────────────
/** 有数据时刷新/翻页：顶条脉冲 + 略透明，避免误以为仍是新数据 */
function DataTableReloadingChrome({
  loading,
  busyLabel,
  children,
}: {
  loading: boolean;
  busyLabel: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn("space-y-4", loading && "opacity-[0.62] transition-opacity duration-200")}
      aria-busy={loading}
      aria-label={loading ? busyLabel : undefined}
    >
      {loading ? (
        <div className="h-1 w-full overflow-hidden rounded-full bg-muted/80" aria-hidden>
          <div className="h-full w-2/5 animate-pulse rounded-full bg-primary/40 motion-reduce:animate-none" />
        </div>
      ) : null}
      {children}
    </div>
  );
}

function SectionTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn("text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3 mt-6 first:mt-0", className)}>
      {children}
    </p>
  );
}

function AdminDataEmptyState({
  loading,
  loadingLabel,
  title,
  hint,
  icon: Icon,
}: {
  loading: boolean;
  loadingLabel: string;
  title: string;
  hint: string;
  icon: LucideIcon;
}) {
  return (
    <div className={cn(portalSettingsEmptyShellClass, "py-10")}>
      <div className="relative flex flex-col items-center">
        {loading ? (
          <div className="w-full max-w-4xl px-0 sm:px-1" role="status" aria-busy="true" aria-label={loadingLabel}>
            <CompactTableSkeleton columns={6} rows={6} />
          </div>
        ) : (
          <>
            <div className={cn("mb-3", portalSettingsEmptyIconWrapClass)}>
              <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
            </div>
            <p className="text-sm font-medium text-foreground">{title}</p>
            <p className="mt-1.5 max-w-md text-center text-xs leading-relaxed text-muted-foreground">{hint}</p>
          </>
        )}
      </div>
    </div>
  );
}

interface ActivityDataTabProps {
  tenantId: string | null;
  canManage: boolean;
}

export function ActivityDataTab({ tenantId, canManage }: ActivityDataTabProps) {
  const { t } = useLanguage();
  const { employee } = useAuth();
  const isPlatformAdminReadonlyView = useIsPlatformAdminViewingTenant();
  const isMobile = useIsMobile();
  const canConfigureActivityRetention =
    !!(employee?.role === "admin" || employee?.is_super_admin || employee?.is_platform_super_admin) &&
    !isPlatformAdminReadonlyView;

  const [activityDataSub, setActivityDataSub] = useState<"lottery" | "checkin">("lottery");
  const [lotteryLogs, setLotteryLogs] = useState<LotteryLog[]>([]);
  const [lotteryLogsTotal, setLotteryLogsTotal] = useState(0);
  const [lotteryLogsPage, setLotteryLogsPage] = useState(1);
  const [lotteryLogsLoading, setLotteryLogsLoading] = useState(false);
  const [checkInLogs, setCheckInLogs] = useState<PortalCheckInLogRow[]>([]);
  const [checkInTotal, setCheckInTotal] = useState(0);
  const [checkInPage, setCheckInPage] = useState(1);
  const [checkInLoading, setCheckInLoading] = useState(false);
  const [retentionEnabled, setRetentionEnabled] = useState(false);
  const [retentionDaysInput, setRetentionDaysInput] = useState("365");
  const [retentionMeta, setRetentionMeta] = useState<{
    lastRunAt: string | null;
    lastSummary: { lotteryLogs: number; checkIns: number; lotteryPointsLedger: number } | null;
  }>({ lastRunAt: null, lastSummary: null });
  const [retentionLoading, setRetentionLoading] = useState(false);
  const [retentionSaving, setRetentionSaving] = useState(false);
  const [retentionRunning, setRetentionRunning] = useState(false);
  const [retentionRunConfirmOpen, setRetentionRunConfirmOpen] = useState(false);

  const loadLotteryLogsPage = useCallback(async (page: number) => {
    if (!tenantId) {
      setLotteryLogs([]);
      setLotteryLogsTotal(0);
      return;
    }
    setLotteryLogsLoading(true);
    try {
      const offset = (page - 1) * LOTTERY_ADMIN_LOGS_PAGE_SIZE;
      const { logs, total } = await adminGetLotteryLogs({
        limit: LOTTERY_ADMIN_LOGS_PAGE_SIZE,
        offset,
        tenantId,
      });
      setLotteryLogs(logs);
      setLotteryLogsTotal(total);
      setLotteryLogsPage(page);
    } catch {
      setLotteryLogs([]);
      setLotteryLogsTotal(0);
    } finally {
      setLotteryLogsLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    if (activityDataSub !== "lottery") return;
    void loadLotteryLogsPage(1);
  }, [activityDataSub, loadLotteryLogsPage]);

  const loadCheckInsPage = useCallback(async (page: number) => {
    setCheckInLoading(true);
    try {
      const offset = (page - 1) * CHECKIN_ADMIN_PAGE_SIZE;
      const { rows, total } = await adminListPortalCheckIns({
        limit: CHECKIN_ADMIN_PAGE_SIZE,
        offset,
        tenantId: tenantId || undefined,
      });
      setCheckInLogs(rows);
      setCheckInTotal(total);
      setCheckInPage(page);
    } catch {
      setCheckInLogs([]);
      setCheckInTotal(0);
    } finally {
      setCheckInLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    if (activityDataSub !== "checkin") return;
    void loadCheckInsPage(1);
  }, [activityDataSub, loadCheckInsPage]);

  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;
    setRetentionLoading(true);
    void getActivityDataRetentionApi(tenantId)
      .then((s) => {
        if (cancelled) return;
        setRetentionEnabled(!!s.enabled);
        setRetentionDaysInput(String(s.retentionDays ?? 365));
        setRetentionMeta({ lastRunAt: s.lastRunAt ?? null, lastSummary: s.lastSummary ?? null });
      })
      .catch(() => {
        if (!cancelled) toast.error(t("加载保留策略失败", "Failed to load retention settings"));
      })
      .finally(() => {
        if (!cancelled) setRetentionLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId, t]);

  const handleSaveActivityDataRetention = async () => {
    if (!tenantId || !canConfigureActivityRetention) return;
    const days = Math.min(3650, Math.max(1, Math.floor(Number(retentionDaysInput) || 0)));
    if (!Number.isFinite(days) || days < 1) {
      toast.error(t("保留天数须为 1～3650", "Retention days must be 1–3650"));
      return;
    }
    setRetentionSaving(true);
    try {
      const s = await putActivityDataRetentionApi(tenantId, {
        enabled: retentionEnabled,
        retentionDays: days,
      });
      setRetentionEnabled(!!s.enabled);
      setRetentionDaysInput(String(s.retentionDays));
      setRetentionMeta({ lastRunAt: s.lastRunAt ?? null, lastSummary: s.lastSummary ?? null });
      toast.success(t("已保存", "Saved"));
    } catch {
      toast.error(t("保存失败", "Save failed"));
    } finally {
      setRetentionSaving(false);
    }
  };

  const handleRunActivityDataRetentionNow = async () => {
    if (!tenantId || !canConfigureActivityRetention) return;
    setRetentionRunning(true);
    try {
      const r = await postActivityDataRetentionRunApi(tenantId);
      setRetentionMeta({
        lastRunAt: r.settings.lastRunAt ?? null,
        lastSummary: r.settings.lastSummary ?? null,
      });
      toast.success(
        t(
          `已清理：抽奖 ${r.summary.lotteryLogs} 条，签到 ${r.summary.checkIns} 条，抽奖积分流水 ${r.summary.lotteryPointsLedger} 条`,
          `Cleaned: ${r.summary.lotteryLogs} lottery rows, ${r.summary.checkIns} check-ins, ${r.summary.lotteryPointsLedger} lottery ledger rows`,
        ),
      );
      await Promise.all([loadLotteryLogsPage(lotteryLogsPage), loadCheckInsPage(checkInPage)]);
    } catch {
      toast.error(t("清理失败", "Cleanup failed"));
    } finally {
      setRetentionRunning(false);
    }
  };

  // ─── JSX ───

  return (
    <div className="space-y-6">
      <p className="text-xs text-muted-foreground -mb-1 border-l-2 border-primary/30 pl-2 leading-relaxed">
        {t(
          "统计口径：本页为抽奖记录、签到流水及保留期清理（保留期任务仍会清理过期的抽奖类积分流水，此处不再单独展示该流水列表）。邀请榜假用户与抽奖假昵称池在顶部「邀请与模拟」。",
          "Lottery logs, check-ins, and retention cleanup (expired lottery-type points_ledger rows are still purged by retention; that ledger is no longer listed here). Invite fakes and ticker nicknames live under Invite & simulation.",
        )}
      </p>

      {tenantId && (
        <Card>
          <CardHeader className="py-3 pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-muted-foreground" />
              {t("活动数据保留", "Activity data retention")}
            </CardTitle>
            <p className="text-sm text-muted-foreground font-normal mt-1">
              {t(
                "仅清理超过保留期的明细：抽奖流水、签到流水、抽奖类积分流水（不含消费/推荐积分、活动赠送、订单）。启用后服务端每 24 小时自动执行一次。",
                "Deletes rows older than the retention period: lottery logs, check-in logs, and lottery-type points_ledger rows only (not consumption/referral points, activity gifts, or orders). When enabled, the server runs cleanup every 24 hours.",
              )}
            </p>
          </CardHeader>
          <CardContent className="pt-0 space-y-4">
            {retentionLoading ? (
              <div
                className="space-y-4 py-1"
                role="status"
                aria-busy="true"
                aria-label={t("加载中…", "Loading…")}
              >
                <div className="flex flex-wrap items-center gap-4">
                  <Skeleton className="h-6 w-11 rounded-full" />
                  <Skeleton className="h-4 w-40 max-w-[min(100%,280px)]" />
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-9 w-24" />
                  <Skeleton className="h-4 w-28" />
                </div>
                <Skeleton className="h-3 w-full max-w-lg" />
                <div className="flex flex-wrap gap-2">
                  <Skeleton className="h-9 w-28" />
                  <Skeleton className="h-9 w-36" />
                </div>
              </div>
            ) : (
              <>
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Switch
                      id="portal-activity-retention-enabled"
                      checked={retentionEnabled}
                      onCheckedChange={(v) => setRetentionEnabled(v === true)}
                      disabled={!canConfigureActivityRetention}
                    />
                    <Label htmlFor="portal-activity-retention-enabled" className="text-sm cursor-pointer">
                      {t("启用自动清理", "Enable automatic cleanup")}
                    </Label>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Label htmlFor="portal-retention-days" className="text-sm whitespace-nowrap">
                      {t("保留最近", "Keep last")}
                    </Label>
                    <Input
                      id="portal-retention-days"
                      type="number"
                      min={1}
                      max={3650}
                      className="w-24 h-9"
                      value={retentionDaysInput}
                      onChange={(e) => setRetentionDaysInput(e.target.value)}
                      disabled={!canConfigureActivityRetention}
                    />
                    <span className="text-sm text-muted-foreground">{t("天的数据", "days of data")}</span>
                  </div>
                </div>
                {retentionMeta.lastRunAt && (
                  <p className="text-xs text-muted-foreground">
                    {t("上次执行", "Last run")}: {formatBeijingTime(retentionMeta.lastRunAt)}
                    {retentionMeta.lastSummary && (
                      <>
                        {" "}
                        — {t("抽奖", "Lottery")} {retentionMeta.lastSummary.lotteryLogs},{" "}
                        {t("签到", "Check-in")} {retentionMeta.lastSummary.checkIns},{" "}
                        {t("抽奖积分流水", "Lottery ledger")} {retentionMeta.lastSummary.lotteryPointsLedger}
                      </>
                    )}
                  </p>
                )}
                {canConfigureActivityRetention && (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="default"
                      disabled={retentionSaving}
                      onClick={() => void handleSaveActivityDataRetention()}
                    >
                      {retentionSaving ? t("保存中…", "Saving…") : t("保存设置", "Save settings")}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={retentionRunning}
                      onClick={() => setRetentionRunConfirmOpen(true)}
                    >
                      {retentionRunning ? t("执行中…", "Running…") : t("立即按保留期清理", "Clean up now")}
                    </Button>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:gap-8">
        <nav
          className="flex flex-row gap-1 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:w-52 lg:shrink-0 lg:flex-col lg:overflow-visible lg:border-r lg:border-border/60 lg:pb-0 lg:pr-5"
          aria-label={t("活动数据子菜单", "Activity data sections")}
        >
          <Button
            type="button"
            variant={activityDataSub === "lottery" ? "secondary" : "ghost"}
            size="sm"
            className="shrink-0 justify-start gap-1.5 lg:w-full"
            onClick={() => setActivityDataSub("lottery")}
          >
            <Dices className="h-3.5 w-3.5 shrink-0" />
            {t("抽奖数据", "Lottery")}
          </Button>
          <Button
            type="button"
            variant={activityDataSub === "checkin" ? "secondary" : "ghost"}
            size="sm"
            className="shrink-0 justify-start gap-1.5 lg:w-full"
            onClick={() => setActivityDataSub("checkin")}
          >
            <Star className="h-3.5 w-3.5 shrink-0" />
            {t("签到数据", "Check-ins")}
          </Button>
        </nav>

        <div className="min-w-0 flex-1 space-y-6">
      {activityDataSub === "lottery" && (
        <div className="space-y-10">
          <p className="text-xs text-muted-foreground -mb-2">
            {t(
              "会员每次抽奖均写入数据库（无条数上限）；此处按租户查询全部抽奖流水，支持分页。",
              "Every spin is persisted with no cap; paginate through the full lottery history for this tenant.",
            )}
          </p>
          <Card>
            <CardContent className="pt-5 space-y-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <SectionTitle>{t("抽奖记录", "Lottery logs")}</SectionTitle>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void loadLotteryLogsPage(lotteryLogsPage)}
                  disabled={lotteryLogsLoading}
                  className="gap-1.5"
                >
                  <RefreshCw className={cn("h-3.5 w-3.5", lotteryLogsLoading && "animate-spin")} />
                  {t("刷新本页", "Refresh page")}
                </Button>
              </div>
              {lotteryLogs.length > 0 ? (
                <DataTableReloadingChrome
                  loading={lotteryLogsLoading}
                  busyLabel={t("更新数据中…", "Updating data…")}
                >
                  {isMobile ? (
                    <MobileCardList>
                      {lotteryLogs.map((log) => (
                        <MobileCard key={log.id} compact>
                          <MobileCardHeader>
                            <span className="font-medium text-sm truncate">{lotteryLogMemberLabel(log)}</span>
                            <Badge variant="outline" className="text-[10px] shrink-0">
                              {log.prize_type === "points" ? t("积分", "Points") : log.prize_type === "none" ? t("感谢参与", "Thanks") : t("自定义", "Custom")}
                            </Badge>
                          </MobileCardHeader>
                          <MobileCardRow label={t("电话号码", "Phone")} value={log.phone_number || "—"} mono />
                          <MobileCardRow label={t("奖品", "Prize")} value={log.prize_name} highlight />
                          <MobileCardRow label={t("积分值", "Points")} value={log.prize_value} mono />
                          <MobileCardRow label={t("时间", "Time")} value={formatBeijingTime(log.created_at)} />
                        </MobileCard>
                      ))}
                    </MobileCardList>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>{t("时间", "Time")}</TableHead>
                            <TableHead>{t("电话号码", "Phone")}</TableHead>
                            <TableHead>{t("会员", "Member")}</TableHead>
                            <TableHead>{t("奖品", "Prize")}</TableHead>
                            <TableHead>{t("类型", "Type")}</TableHead>
                            <TableHead>{t("积分值", "Points")}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {lotteryLogs.map((log) => (
                            <TableRow key={log.id}>
                              <TableCell className="text-xs whitespace-nowrap">{formatBeijingTime(log.created_at)}</TableCell>
                              <TableCell className="text-xs font-mono whitespace-nowrap">{log.phone_number || "—"}</TableCell>
                              <TableCell className="text-xs">{lotteryLogMemberLabel(log)}</TableCell>
                              <TableCell className="text-xs">{log.prize_name}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className="text-[10px]">
                                  {log.prize_type === "points"
                                    ? t("积分", "Points")
                                    : log.prize_type === "none"
                                      ? t("感谢参与", "Thanks")
                                      : t("自定义", "Custom")}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-xs font-mono">{log.prize_value}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                  <PaginationBar
                    page={lotteryLogsPage}
                    totalPages={Math.max(1, Math.ceil(lotteryLogsTotal / LOTTERY_ADMIN_LOGS_PAGE_SIZE))}
                    total={lotteryLogsTotal}
                    pageSize={LOTTERY_ADMIN_LOGS_PAGE_SIZE}
                    onPageChange={(p) => void loadLotteryLogsPage(p)}
                    t={t}
                  />
                </DataTableReloadingChrome>
              ) : (
                <AdminDataEmptyState
                  loading={lotteryLogsLoading}
                  loadingLabel={t("加载中…", "Loading…")}
                  title={t("暂无抽奖记录", "No lottery records")}
                  hint={t("会员参与转盘后，记录将出现在此。", "Records appear after members use the wheel.")}
                  icon={Dices}
                />
              )}
            </CardContent>
          </Card>

          <div className="space-y-4 border-t border-border/60 pt-8">
            <p className="text-xs text-muted-foreground -mt-2">
              {t(
                "以下为抽奖行为与来源筛选（RPC 统计），可与上方流水对照使用。",
                "Spin analytics and filters (RPC); use together with the table above.",
              )}
            </p>
            <AdminSpinHistoryTab t={t} />
          </div>
        </div>
      )}

      {activityDataSub === "checkin" && (
        <div className="space-y-6">
          <p className="text-xs text-muted-foreground -mb-2">
            {t(
              "连续签到天数与奖励由后端根据 check_ins 与「任务与奖励」配置计算；此处为全量签到流水（上海日历日）。奖励列为基础+额外合计（写入 spin_credits 时按次取整）。",
              "Streaks and rewards are computed server-side from check_ins and task settings. This table lists all check-ins (Shanghai calendar day). Reward column is base+bonus total (credits use ceil).",
            )}
          </p>
          <Card>
            <CardContent className="pt-5 space-y-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <SectionTitle>{t("签到流水", "Check-in log")}</SectionTitle>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void loadCheckInsPage(checkInPage)}
                  disabled={checkInLoading}
                  className="gap-1.5"
                >
                  <RefreshCw className={cn("h-3.5 w-3.5", checkInLoading && "animate-spin")} />
                  {t("刷新本页", "Refresh page")}
                </Button>
              </div>
              {checkInLogs.length > 0 ? (
                <DataTableReloadingChrome
                  loading={checkInLoading}
                  busyLabel={t("更新数据中…", "Updating data…")}
                >
                  {isMobile ? (
                    <MobileCardList>
                      {checkInLogs.map((row) => (
                        <MobileCard key={row.id} compact>
                          <MobileCardHeader>
                            <span className="font-medium text-sm truncate">{row.nickname || row.member_id}</span>
                            <span className="text-xs text-muted-foreground shrink-0">{String(row.check_in_date)}</span>
                          </MobileCardHeader>
                          <MobileCardRow label={t("电话号码", "Phone")} value={row.phone_number || "—"} mono />
                          <MobileCardRow label={t("连续天数", "Streak")} value={row.streak ?? "—"} mono highlight />
                          <MobileCardRow label={t("奖励(次值)", "Reward")} value={row.points_awarded ?? "—"} mono />
                          <MobileCardRow label={t("记录时间", "Logged at")} value={formatBeijingTime(row.created_at)} />
                        </MobileCard>
                      ))}
                    </MobileCardList>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>{t("签到日期", "Date")}</TableHead>
                            <TableHead>{t("电话号码", "Phone")}</TableHead>
                            <TableHead>{t("会员", "Member")}</TableHead>
                            <TableHead>{t("连续天数", "Streak")}</TableHead>
                            <TableHead>{t("奖励(次值)", "Reward")}</TableHead>
                            <TableHead>{t("记录时间", "Logged at")}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {checkInLogs.map((row) => (
                            <TableRow key={row.id}>
                              <TableCell className="text-xs whitespace-nowrap">{String(row.check_in_date)}</TableCell>
                              <TableCell className="text-xs font-mono whitespace-nowrap">{row.phone_number || "—"}</TableCell>
                              <TableCell className="text-xs">{row.nickname || row.member_id}</TableCell>
                              <TableCell className="text-xs font-mono">{row.streak ?? "—"}</TableCell>
                              <TableCell className="text-xs font-mono">{row.points_awarded ?? "—"}</TableCell>
                              <TableCell className="text-xs whitespace-nowrap">{formatBeijingTime(row.created_at)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                  <PaginationBar
                    page={checkInPage}
                    totalPages={Math.max(1, Math.ceil(checkInTotal / CHECKIN_ADMIN_PAGE_SIZE))}
                    total={checkInTotal}
                    pageSize={CHECKIN_ADMIN_PAGE_SIZE}
                    onPageChange={(p) => void loadCheckInsPage(p)}
                    t={t}
                  />
                </DataTableReloadingChrome>
              ) : (
                <AdminDataEmptyState
                  loading={checkInLoading}
                  loadingLabel={t("加载中…", "Loading…")}
                  title={t("暂无签到记录", "No check-ins")}
                  hint={t("会员在任务中心签到后，流水会显示在此。", "Check-ins from the task center appear here.")}
                  icon={CalendarClock}
                />
              )}
            </CardContent>
          </Card>
        </div>
      )}
        </div>
      </div>

      <AlertDialog open={retentionRunConfirmOpen} onOpenChange={setRetentionRunConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("立即按保留期清理？", "Clean up expired activity data now?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "将永久删除超过保留天数的抽奖流水、签到流水与抽奖类积分流水，此操作不可撤销。确定继续？",
                "Permanently deletes lottery logs, check-in logs, and lottery-type points ledger rows older than your retention period. This cannot be undone. Continue?",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("取消", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                setRetentionRunConfirmOpen(false);
                void handleRunActivityDataRetentionNow();
              }}
            >
              {t("确认清理", "Confirm cleanup")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
