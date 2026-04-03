import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { CompactTableSkeleton } from "@/components/skeletons/TablePageSkeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { LucideIcon } from "lucide-react";
import { RefreshCw, CalendarClock, Dices, Star, Settings2 } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  MobileCardList,
  MobileCard,
  MobileCardHeader,
  MobileCardRow,
} from "@/components/ui/mobile-data-card";
import { adminListPortalCheckIns, type PortalCheckInLogRow } from "@/services/members/memberPortalSettingsService";
import { adminGetLotteryLogs, type LotteryLog } from "@/services/lottery/lotteryService";
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
}

export function ActivityDataTab({ tenantId }: ActivityDataTabProps) {
  const { t } = useLanguage();
  const isMobile = useIsMobile();

  const [activityDataSub, setActivityDataSub] = useState<"lottery" | "checkin">("lottery");
  const [lotteryLogs, setLotteryLogs] = useState<LotteryLog[]>([]);
  const [lotteryLogsTotal, setLotteryLogsTotal] = useState(0);
  const [lotteryLogsPage, setLotteryLogsPage] = useState(1);
  const [lotteryLogsLoading, setLotteryLogsLoading] = useState(false);
  const [checkInLogs, setCheckInLogs] = useState<PortalCheckInLogRow[]>([]);
  const [checkInTotal, setCheckInTotal] = useState(0);
  const [checkInPage, setCheckInPage] = useState(1);
  const [checkInLoading, setCheckInLoading] = useState(false);

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

  // ─── JSX ───

  return (
    <div className="space-y-6">
      <p className="text-xs text-muted-foreground -mb-1 border-l-2 border-primary/30 pl-2 leading-relaxed">
        {t(
          "统计口径：本页为抽奖记录、签到流水。超过保留期的明细清理（抽奖/签到/抽奖类积分流水）已统一在「系统设置 → 数据管理 → 数据删除」中配置与执行。邀请榜假用户与抽奖假昵称池在「邀请与模拟」。",
          "Lottery logs and check-ins on this page. Retention cleanup for old lottery/check-in/lottery-ledger rows is under System Settings → Data Management → Delete data. Invite fakes and ticker nicknames: Invite & simulation.",
        )}
      </p>

      <Alert className="border-amber-500/25 bg-amber-500/[0.06]">
        <Settings2 className="h-4 w-4 text-amber-700 dark:text-amber-400" />
        <AlertDescription className="text-xs text-muted-foreground flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <span>
            {t(
              "活动数据保留与按保留期清理已迁至系统设置，与其它删除能力集中管理。",
              "Activity data retention and cleanup moved to System Settings with other deletion tools.",
            )}
          </span>
          <Button variant="outline" size="sm" className="shrink-0 w-fit" asChild>
            <Link to="/staff/settings?tab=data&dataDeleteFocus=1">
              {t("打开数据删除", "Open delete data")}
            </Link>
          </Button>
        </AlertDescription>
      </Alert>

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
    </div>
  );
}
