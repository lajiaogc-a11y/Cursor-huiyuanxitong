import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { CompactTableSkeleton } from "@/components/skeletons/TablePageSkeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { LucideIcon } from "lucide-react";
import { RefreshCw, CalendarClock, Dices, Star, Settings2, ShoppingCart, Share2, UserPlus } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  MobileCardList,
  MobileCard,
  MobileCardHeader,
  MobileCardRow,
} from "@/components/ui/mobile-data-card";
import {
  adminListPortalCheckIns,
  adminListSpinCreditsLog,
  type PortalCheckInLogRow,
  type SpinCreditCategoryParam,
  type SpinCreditsLogRow,
} from "@/services/members/memberPortalSettingsService";
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
const SPIN_CREDITS_ADMIN_PAGE_SIZE = 50;

function spinCreditSourceLabel(source: string | null, t: (zh: string, en: string) => string): string {
  if (!source) return "—";
  if (source === "share") return t("分享奖励", "Share reward");
  if (source.startsWith("order_completed:")) return t("完成订单", "Order completed");
  if (source === "referral") return t("邀请奖励", "Referral reward");
  if (source === "invite_welcome") return t("注册欢迎", "Welcome bonus");
  if (source === "check_in") return t("签到奖励", "Check-in reward");
  return source;
}

function lotteryLogMemberLabel(log: LotteryLog): string {
  const n = log.nickname?.trim();
  if (n) return n;
  const c = log.member_code?.trim();
  if (c) return c;
  return log.member_id;
}

type ActivityDataSubKey = "lottery" | "checkin" | "spin_order" | "spin_share" | "spin_invite";

type MemberFilter = { phone: string; memberCode: string };

const EMPTY_MEMBER_FILTER: MemberFilter = { phone: "", memberCode: "" };

function MemberSearchBar({
  phone,
  memberCode,
  onPhoneChange,
  onMemberCodeChange,
  onSearch,
  disabled,
  t,
}: {
  phone: string;
  memberCode: string;
  onPhoneChange: (v: string) => void;
  onMemberCodeChange: (v: string) => void;
  onSearch: () => void;
  disabled?: boolean;
  t: (zh: string, en: string) => string;
}) {
  return (
    <div className="flex flex-wrap items-end gap-2 sm:gap-3">
      <div className="min-w-[140px] flex-1 space-y-1 sm:max-w-[200px]">
        <Label className="text-[10px] text-muted-foreground">{t("电话号码", "Phone")}</Label>
        <Input
          value={phone}
          onChange={(e) => onPhoneChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSearch()}
          placeholder={t("筛选电话", "Filter phone")}
          disabled={disabled}
          className="h-8 text-sm"
        />
      </div>
      <div className="min-w-[140px] flex-1 space-y-1 sm:max-w-[200px]">
        <Label className="text-[10px] text-muted-foreground">{t("会员编号", "Member ID")}</Label>
        <Input
          value={memberCode}
          onChange={(e) => onMemberCodeChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSearch()}
          placeholder={t("筛选编号", "Filter member ID")}
          disabled={disabled}
          className="h-8 text-sm"
        />
      </div>
      <Button type="button" variant="secondary" size="sm" className="h-8 shrink-0" onClick={onSearch} disabled={disabled}>
        {t("搜索", "Search")}
      </Button>
    </div>
  );
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

type SpinTabFilterKey = "spin_order" | "spin_share" | "spin_invite";

function spinTabMeta(
  sub: ActivityDataSubKey,
  t: (zh: string, en: string) => string,
): {
  category: SpinCreditCategoryParam;
  filterKey: SpinTabFilterKey;
  title: string;
  desc: string;
  emptyHint: string;
  Icon: LucideIcon;
} | null {
  if (sub === "spin_order") {
    return {
      category: "order",
      filterKey: "spin_order",
      title: t("订单抽奖", "Order spins"),
      desc: t(
        "交易完成时按租户设置发放的抽奖次数，来源标识为完成订单。",
        "Spin credits granted when an order is marked completed (per tenant settings).",
      ),
      emptyHint: t("订单完成后若已开启送转盘次数，记录会出现在此。", "Records appear when order-complete spins are enabled."),
      Icon: ShoppingCart,
    };
  }
  if (sub === "spin_share") {
    return {
      category: "share",
      filterKey: "spin_share",
      title: t("分享数据", "Share"),
      desc: t("会员通过分享任务领取的抽奖次数。", "Spin credits from the share reward task."),
      emptyHint: t("会员完成分享领取次数后，记录会显示在此。", "Records appear after members claim share rewards."),
      Icon: Share2,
    };
  }
  if (sub === "spin_invite") {
    return {
      category: "invite",
      filterKey: "spin_invite",
      title: t("邀请数据", "Invites"),
      desc: t(
        "邀请好友成功注册时，邀请人与被邀请人获得的抽奖次数（邀请奖励、注册欢迎）。",
        "Credits for referrer and invitee when a friend registers via invite.",
      ),
      emptyHint: t("成功邀请注册后，记录会显示在此。", "Records appear after successful invite registrations."),
      Icon: UserPlus,
    };
  }
  return null;
}

export function ActivityDataTab({ tenantId }: ActivityDataTabProps) {
  const { t } = useLanguage();
  const isMobile = useIsMobile();

  const [activityDataSub, setActivityDataSub] = useState<ActivityDataSubKey>("lottery");
  const [filters, setFilters] = useState<Record<ActivityDataSubKey, MemberFilter>>({
    lottery: { ...EMPTY_MEMBER_FILTER },
    checkin: { ...EMPTY_MEMBER_FILTER },
    spin_order: { ...EMPTY_MEMBER_FILTER },
    spin_share: { ...EMPTY_MEMBER_FILTER },
    spin_invite: { ...EMPTY_MEMBER_FILTER },
  });

  const [lotteryLogs, setLotteryLogs] = useState<LotteryLog[]>([]);
  const [lotteryLogsTotal, setLotteryLogsTotal] = useState(0);
  const [lotteryLogsPage, setLotteryLogsPage] = useState(1);
  const [lotteryLogsLoading, setLotteryLogsLoading] = useState(false);
  const [checkInLogs, setCheckInLogs] = useState<PortalCheckInLogRow[]>([]);
  const [checkInTotal, setCheckInTotal] = useState(0);
  const [checkInPage, setCheckInPage] = useState(1);
  const [checkInLoading, setCheckInLoading] = useState(false);
  const [spinCreditsRows, setSpinCreditsRows] = useState<SpinCreditsLogRow[]>([]);
  const [spinCreditsTotal, setSpinCreditsTotal] = useState(0);
  const [spinCreditsPage, setSpinCreditsPage] = useState(1);
  const [spinCreditsLoading, setSpinCreditsLoading] = useState(false);

  const loadLotteryLogsPage = useCallback(
    async (page: number, filter: MemberFilter) => {
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
          phone: filter.phone.trim() || undefined,
          memberCode: filter.memberCode.trim() || undefined,
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
    },
    [tenantId],
  );

  const loadCheckInsPage = useCallback(
    async (page: number, filter: MemberFilter) => {
      setCheckInLoading(true);
      try {
        const offset = (page - 1) * CHECKIN_ADMIN_PAGE_SIZE;
        const { rows, total } = await adminListPortalCheckIns({
          limit: CHECKIN_ADMIN_PAGE_SIZE,
          offset,
          tenantId: tenantId || undefined,
          phone: filter.phone.trim() || undefined,
          memberCode: filter.memberCode.trim() || undefined,
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
    },
    [tenantId],
  );

  const loadSpinCreditsPage = useCallback(
    async (page: number, category: SpinCreditCategoryParam, filter: MemberFilter) => {
      if (!tenantId) {
        setSpinCreditsRows([]);
        setSpinCreditsTotal(0);
        return;
      }
      setSpinCreditsLoading(true);
      try {
        const offset = (page - 1) * SPIN_CREDITS_ADMIN_PAGE_SIZE;
        const { rows, total } = await adminListSpinCreditsLog({
          limit: SPIN_CREDITS_ADMIN_PAGE_SIZE,
          offset,
          tenantId,
          category,
          phone: filter.phone.trim() || undefined,
          memberCode: filter.memberCode.trim() || undefined,
        });
        setSpinCreditsRows(rows);
        setSpinCreditsTotal(total);
        setSpinCreditsPage(page);
      } catch {
        setSpinCreditsRows([]);
        setSpinCreditsTotal(0);
      } finally {
        setSpinCreditsLoading(false);
      }
    },
    [tenantId],
  );

  useEffect(() => {
    if (activityDataSub === "lottery") void loadLotteryLogsPage(1, filters.lottery);
    else if (activityDataSub === "checkin") void loadCheckInsPage(1, filters.checkin);
    else if (activityDataSub === "spin_order") {
      setSpinCreditsPage(1);
      void loadSpinCreditsPage(1, "order", filters.spin_order);
    } else if (activityDataSub === "spin_share") {
      setSpinCreditsPage(1);
      void loadSpinCreditsPage(1, "share", filters.spin_share);
    } else if (activityDataSub === "spin_invite") {
      setSpinCreditsPage(1);
      void loadSpinCreditsPage(1, "invite", filters.spin_invite);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅切换子菜单或租户就绪时拉取；筛选条件由「搜索」触发
  }, [activityDataSub, tenantId]);

  const spinSection = spinTabMeta(activityDataSub, t);

  // ─── JSX ───

  return (
    <div className="space-y-6">
      <p className="text-xs text-muted-foreground -mb-1 border-l-2 border-primary/30 pl-2 leading-relaxed">
        {t(
          "统计口径：本页为抽奖记录、签到流水，以及按来源拆分的抽奖次数（订单完成、分享、邀请）。超过保留期的明细清理已统一在「系统设置 → 数据管理 → 数据删除」中配置与执行。邀请榜假用户与抽奖假昵称池在「邀请与模拟」。",
          "Lottery logs, check-ins, and spin credits by source (order, share, invite). Retention cleanup is under System Settings → Data Management → Delete data. Invite fakes and ticker nicknames: Invite & simulation.",
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
          <Button
            type="button"
            variant={activityDataSub === "spin_order" ? "secondary" : "ghost"}
            size="sm"
            className="shrink-0 justify-start gap-1.5 lg:w-full"
            onClick={() => setActivityDataSub("spin_order")}
          >
            <ShoppingCart className="h-3.5 w-3.5 shrink-0" />
            {t("订单抽奖", "Order spins")}
          </Button>
          <Button
            type="button"
            variant={activityDataSub === "spin_share" ? "secondary" : "ghost"}
            size="sm"
            className="shrink-0 justify-start gap-1.5 lg:w-full"
            onClick={() => setActivityDataSub("spin_share")}
          >
            <Share2 className="h-3.5 w-3.5 shrink-0" />
            {t("分享数据", "Share")}
          </Button>
          <Button
            type="button"
            variant={activityDataSub === "spin_invite" ? "secondary" : "ghost"}
            size="sm"
            className="shrink-0 justify-start gap-1.5 lg:w-full"
            onClick={() => setActivityDataSub("spin_invite")}
          >
            <UserPlus className="h-3.5 w-3.5 shrink-0" />
            {t("邀请数据", "Invites")}
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
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <SectionTitle className="!mt-0 !mb-0">{t("抽奖记录", "Lottery logs")}</SectionTitle>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void loadLotteryLogsPage(lotteryLogsPage, filters.lottery)}
                    disabled={lotteryLogsLoading}
                    className="gap-1.5"
                  >
                    <RefreshCw className={cn("h-3.5 w-3.5", lotteryLogsLoading && "animate-spin")} />
                    {t("刷新本页", "Refresh page")}
                  </Button>
                </div>
                <MemberSearchBar
                  phone={filters.lottery.phone}
                  memberCode={filters.lottery.memberCode}
                  onPhoneChange={(v) => setFilters((p) => ({ ...p, lottery: { ...p.lottery, phone: v } }))}
                  onMemberCodeChange={(v) => setFilters((p) => ({ ...p, lottery: { ...p.lottery, memberCode: v } }))}
                  onSearch={() => void loadLotteryLogsPage(1, filters.lottery)}
                  disabled={lotteryLogsLoading}
                  t={t}
                />
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
                          <MobileCardRow label={t("会员编号", "Member ID")} value={log.member_code || "—"} mono />
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
                            <TableHead>{t("会员编号", "Member ID")}</TableHead>
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
                              <TableCell className="text-xs font-mono">{log.member_code || "—"}</TableCell>
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
                    onPageChange={(p) => void loadLotteryLogsPage(p, filters.lottery)}
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
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <SectionTitle className="!mt-0 !mb-0">{t("签到流水", "Check-in log")}</SectionTitle>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void loadCheckInsPage(checkInPage, filters.checkin)}
                    disabled={checkInLoading}
                    className="gap-1.5"
                  >
                    <RefreshCw className={cn("h-3.5 w-3.5", checkInLoading && "animate-spin")} />
                    {t("刷新本页", "Refresh page")}
                  </Button>
                </div>
                <MemberSearchBar
                  phone={filters.checkin.phone}
                  memberCode={filters.checkin.memberCode}
                  onPhoneChange={(v) => setFilters((p) => ({ ...p, checkin: { ...p.checkin, phone: v } }))}
                  onMemberCodeChange={(v) => setFilters((p) => ({ ...p, checkin: { ...p.checkin, memberCode: v } }))}
                  onSearch={() => void loadCheckInsPage(1, filters.checkin)}
                  disabled={checkInLoading}
                  t={t}
                />
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
                          <MobileCardRow label={t("会员编号", "Member ID")} value={row.member_code || "—"} mono />
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
                            <TableHead>{t("会员编号", "Member ID")}</TableHead>
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
                              <TableCell className="text-xs font-mono">{row.member_code || "—"}</TableCell>
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
                    onPageChange={(p) => void loadCheckInsPage(p, filters.checkin)}
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

      {spinSection && (
        <div className="space-y-6">
          <p className="text-xs text-muted-foreground -mb-2">{spinSection.desc}</p>
          <Card>
            <CardContent className="pt-5 space-y-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <SectionTitle className="!mt-0 !mb-0">{spinSection.title}</SectionTitle>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      void loadSpinCreditsPage(spinCreditsPage, spinSection.category, filters[spinSection.filterKey])
                    }
                    disabled={spinCreditsLoading}
                    className="gap-1.5"
                  >
                    <RefreshCw className={cn("h-3.5 w-3.5", spinCreditsLoading && "animate-spin")} />
                    {t("刷新本页", "Refresh page")}
                  </Button>
                </div>
                <MemberSearchBar
                  phone={filters[spinSection.filterKey].phone}
                  memberCode={filters[spinSection.filterKey].memberCode}
                  onPhoneChange={(v) =>
                    setFilters((p) => ({
                      ...p,
                      [spinSection.filterKey]: { ...p[spinSection.filterKey], phone: v },
                    }))
                  }
                  onMemberCodeChange={(v) =>
                    setFilters((p) => ({
                      ...p,
                      [spinSection.filterKey]: { ...p[spinSection.filterKey], memberCode: v },
                    }))
                  }
                  onSearch={() => void loadSpinCreditsPage(1, spinSection.category, filters[spinSection.filterKey])}
                  disabled={spinCreditsLoading}
                  t={t}
                />
              </div>
              {spinCreditsRows.length > 0 ? (
                <DataTableReloadingChrome
                  loading={spinCreditsLoading}
                  busyLabel={t("更新数据中…", "Updating data…")}
                >
                  {isMobile ? (
                    <MobileCardList>
                      {spinCreditsRows.map((row) => (
                        <MobileCard key={row.id} compact>
                          <MobileCardHeader>
                            <span className="font-medium text-sm truncate">{row.member_label || row.member_id}</span>
                            <Badge variant="outline" className="text-[10px] shrink-0">
                              {spinCreditSourceLabel(row.source, t)}
                            </Badge>
                          </MobileCardHeader>
                          <MobileCardRow label={t("电话号码", "Phone")} value={row.phone_number || "—"} mono />
                          <MobileCardRow label={t("会员编号", "Member ID")} value={row.member_code || "—"} mono />
                          <MobileCardRow label={t("次数", "Credits")} value={row.amount} mono highlight />
                          <MobileCardRow label={t("时间", "Time")} value={formatBeijingTime(row.created_at)} />
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
                            <TableHead>{t("会员编号", "Member ID")}</TableHead>
                            <TableHead>{t("来源", "Source")}</TableHead>
                            <TableHead>{t("次数", "Credits")}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {spinCreditsRows.map((row) => (
                            <TableRow key={row.id}>
                              <TableCell className="text-xs whitespace-nowrap">{formatBeijingTime(row.created_at)}</TableCell>
                              <TableCell className="text-xs font-mono whitespace-nowrap">{row.phone_number || "—"}</TableCell>
                              <TableCell className="text-xs">{row.member_label || row.member_id}</TableCell>
                              <TableCell className="text-xs font-mono">{row.member_code || "—"}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className="text-[10px]">
                                  {spinCreditSourceLabel(row.source, t)}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-xs font-mono">{row.amount}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                  <PaginationBar
                    page={spinCreditsPage}
                    totalPages={Math.max(1, Math.ceil(spinCreditsTotal / SPIN_CREDITS_ADMIN_PAGE_SIZE))}
                    total={spinCreditsTotal}
                    pageSize={SPIN_CREDITS_ADMIN_PAGE_SIZE}
                    onPageChange={(p) =>
                      void loadSpinCreditsPage(p, spinSection.category, filters[spinSection.filterKey])
                    }
                    t={t}
                  />
                </DataTableReloadingChrome>
              ) : (
                <AdminDataEmptyState
                  loading={spinCreditsLoading}
                  loadingLabel={t("加载中…", "Loading…")}
                  title={t("暂无记录", "No records")}
                  hint={spinSection.emptyHint}
                  icon={spinSection.Icon}
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
