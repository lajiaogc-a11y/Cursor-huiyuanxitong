/**
 * 邀请排行榜假用户 + 抽奖页假昵称池 — 独立于「活动数据」流水与保留期清理，避免与自动清理混淆。
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Trophy, UserRound } from "lucide-react";
import { notify } from "@/lib/notifyHub";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { useIsPlatformAdminViewingTenant } from "@/hooks/useIsPlatformAdminViewingTenant";
import {
  adminGetSimFakeSettings,
  adminSaveSimFakeSettings,
  adminGetSimulationSettings,
  adminSaveSimulationSettings,
  adminListSimulationFeed,
  adminListSimulationHourRuns,
  adminStartSimulationCron,
  ADMIN_SIM_CRON_FAKE_DRAWS_PER_FAKE_MAX,
  type AdminSimulationFeedRow,
  type AdminSimulationHourRunRow,
  type AdminSimulationSettings,
} from "@/services/lottery/lotteryService";
import { cn } from "@/lib/utils";
import { ApiError } from "@/lib/apiClient";
import { InviteLeaderboardSettingsTab } from "./InviteLeaderboardSettingsTab";
import { formatBeijingTime } from "@/lib/beijingTime";
import { normalizeSpinSimFeedLineForMember } from "@/lib/spinSimFeedDisplay";

/** 与服务端 parseNicknameLines 一致：换行 / 英文逗号 / 中文逗号 */
function countNicknameTokens(raw: string): number {
  const s = String(raw ?? "").trim();
  if (!s) return 0;
  return s
    .split(/[\n,，]+/)
    .map((x) => x.trim())
    .filter(Boolean).length;
}

const SIM_FEED_RANK_ZH = ["一", "二", "三", "四", "五", "六", "七", "八"] as const;

function SectionTitle({
  children,
  className,
  sentenceCase,
}: {
  children: React.ReactNode;
  className?: string;
  /** 为 true 时不强制 uppercase，避免英文标题整行全大写难读 */
  sentenceCase?: boolean;
}) {
  return (
    <p
      className={cn(
        "text-xs font-semibold tracking-widest text-muted-foreground mb-3 mt-6 first:mt-0",
        !sentenceCase && "uppercase",
        sentenceCase && "normal-case",
        className,
      )}
    >
      {children}
    </p>
  );
}

export interface InviteSimulationSettingsTabProps {
  tenantId: string | null;
  canManage: boolean;
}

export function InviteSimulationSettingsTab({ tenantId, canManage }: InviteSimulationSettingsTabProps) {
  const { t, tr } = useLanguage();
  const { employee } = useAuth();
  const isPlatformAdminReadonlyView = useIsPlatformAdminViewingTenant();
  const canConfigureSimFake =
    !!(employee?.role === "admin" || employee?.is_super_admin || employee?.is_platform_super_admin) &&
    !isPlatformAdminReadonlyView;

  const [sub, setSub] = useState<"invite_leaderboard" | "sim_fake">("invite_leaderboard");
  const [simFakeRaw, setSimFakeRaw] = useState("");
  const [simFakeMeta, setSimFakeMeta] = useState<{
    pool_count: number;
    source: "builtin" | "custom";
    updated_at: string | null;
  }>({ pool_count: 100, source: "builtin", updated_at: null });
  const [simFakeLoading, setSimFakeLoading] = useState(false);
  const [simFakeSaving, setSimFakeSaving] = useState(false);

  const [simPolicy, setSimPolicy] = useState<AdminSimulationSettings>({
    retention_days: 3,
    cron_fake_draws_per_hour: 3,
    sim_feed_rank_min: 1,
    sim_feed_rank_max: 8,
    enable_cron_fake_feed: false,
    cron_fake_anchor_at: null,
  });
  const [simPolicyLoading, setSimPolicyLoading] = useState(false);
  const [simPolicySaving, setSimPolicySaving] = useState(false);
  const [cronStarting, setCronStarting] = useState(false);
  const [feedRows, setFeedRows] = useState<AdminSimulationFeedRow[]>([]);
  const [feedLoading, setFeedLoading] = useState(false);
  const [hourRunRows, setHourRunRows] = useState<AdminSimulationHourRunRow[]>([]);

  const draftNicknameCount = useMemo(() => countNicknameTokens(simFakeRaw), [simFakeRaw]);

  const loadSimPolicyAndFeed = useCallback(async () => {
    if (!tenantId) return;
    setSimPolicyLoading(true);
    setFeedLoading(true);
    try {
      const [pol, rows, hourRuns] = await Promise.all([
        adminGetSimulationSettings(tenantId),
        adminListSimulationFeed(tenantId, 100),
        adminListSimulationHourRuns(tenantId, 80),
      ]);
      setSimPolicy(pol);
      setFeedRows(rows);
      setHourRunRows(hourRuns);
    } catch {
      notify.error(t("加载模拟策略失败", "Failed to load simulation policy"));
    } finally {
      setSimPolicyLoading(false);
      setFeedLoading(false);
    }
  }, [tenantId, t]);

  useEffect(() => {
    if (sub !== "sim_fake" || !tenantId) return;
    let cancelled = false;
    setSimFakeLoading(true);
    void adminGetSimFakeSettings(tenantId)
      .then((s) => {
        if (cancelled) return;
        setSimFakeRaw(s.nicknames_raw);
        setSimFakeMeta({
          pool_count: s.pool_count,
          nickname_tokens_count: s.nickname_tokens_count,
          source: s.source,
          updated_at: s.updated_at,
        });
      })
      .catch(() => {
        if (!cancelled) notify.error(t("加载模拟设置失败", "Failed to load simulation settings"));
      })
      .finally(() => {
        if (!cancelled) setSimFakeLoading(false);
      });
    void loadSimPolicyAndFeed();
    return () => {
      cancelled = true;
    };
  }, [sub, tenantId, t, loadSimPolicyAndFeed]);

  const handleSaveSimFakeSettings = useCallback(async () => {
    if (!tenantId || !canConfigureSimFake) return;
    setSimFakeSaving(true);
    try {
      await adminSaveSimFakeSettings(tenantId, simFakeRaw);
      const fresh = await adminGetSimFakeSettings(tenantId);
      setSimFakeRaw(fresh.nicknames_raw);
      setSimFakeMeta({
        pool_count: fresh.pool_count,
        nickname_tokens_count: fresh.nickname_tokens_count,
        source: fresh.source,
        updated_at: fresh.updated_at,
      });
      notify.success(t("已保存", "Saved"));
    } catch {
      notify.error(t("保存失败", "Save failed"));
    } finally {
      setSimFakeSaving(false);
    }
  }, [tenantId, canConfigureSimFake, simFakeRaw, t]);

  const handleSaveSimPolicy = useCallback(async () => {
    if (!tenantId || !canConfigureSimFake) return;
    setSimPolicySaving(true);
    try {
      const saved = await adminSaveSimulationSettings(tenantId, simPolicy);
      setSimPolicy(saved);
      notify.success(t("模拟策略已保存", "Simulation policy saved"));
    } catch {
      notify.error(t("保存失败", "Save failed"));
    } finally {
      setSimPolicySaving(false);
    }
  }, [tenantId, canConfigureSimFake, simPolicy, t]);

  const handleStartSimulationCron = useCallback(async () => {
    if (!tenantId || !canConfigureSimFake) return;
    setCronStarting(true);
    try {
      const r = await adminStartSimulationCron(tenantId);
      setSimPolicy((p) => ({ ...p, cron_fake_anchor_at: r.cron_fake_anchor_at }));
      notify.success(
        t("已启动首轮模拟，并已记录时间锚点；之后按该时刻起每小时一轮。", "First simulation batch started; hourly runs align from this anchor time."),
      );
      await loadSimPolicyAndFeed();
    } catch (e: unknown) {
      const msg = e instanceof ApiError ? e.message : t("启动失败", "Start failed");
      notify.error(msg);
    } finally {
      setCronStarting(false);
    }
  }, [tenantId, canConfigureSimFake, loadSimPolicyAndFeed, t]);

  return (
    <div className="space-y-6">
      <p className="text-xs text-muted-foreground -mb-1 border-l-2 border-emerald-600/50 dark:border-emerald-500/40 pl-2 leading-relaxed">
        {t(
          "本区为运营展示配置。抽奖「模拟滚动」写入独立表 lottery_simulation_feed，不进入 lottery_logs；可按天清理。可配置假用户每小时模拟抽奖次数及进入滚动条的名次范围。",
          "Operational display. Simulation ticker uses lottery_simulation_feed (not lottery_logs). Configure hourly fake draw count and which prize ranks appear in the ticker.",
        )}
      </p>

      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:gap-8">
        <nav
          className="flex flex-row gap-1 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:w-52 lg:shrink-0 lg:flex-col lg:overflow-visible lg:border-r lg:border-border/60 lg:pb-0 lg:pr-5"
          aria-label={t("邀请与模拟子菜单", "Invite and simulation sections")}
        >
          <Button
            type="button"
            variant={sub === "invite_leaderboard" ? "secondary" : "ghost"}
            size="sm"
            className="shrink-0 justify-start gap-1.5 lg:w-full"
            onClick={() => setSub("invite_leaderboard")}
          >
            <Trophy className="h-3.5 w-3.5 shrink-0" />
            {t("邀请设置", "Invite settings")}
          </Button>
          <Button
            type="button"
            variant={sub === "sim_fake" ? "secondary" : "ghost"}
            size="sm"
            className="shrink-0 justify-start gap-1.5 lg:w-full"
            onClick={() => setSub("sim_fake")}
          >
            <UserRound className="h-3.5 w-3.5 shrink-0" />
            {t("模拟设置", "Simulation")}
          </Button>
        </nav>

        <div className="min-w-0 flex-1 space-y-6">
          {sub === "invite_leaderboard" && (
            <InviteLeaderboardSettingsTab
              tenantId={tenantId}
              canManage={canManage && !isPlatformAdminReadonlyView}
            />
          )}

          {sub === "sim_fake" && (
            <div className="space-y-6">
              <Card>
                <CardContent className="pt-5 space-y-4">
                  <SectionTitle className="!mt-0">{t("模拟滚动", "Simulation ticker")}</SectionTitle>
                  <p className="text-xs text-muted-foreground">
                    {t(
                      "滚动喜讯文案保存在独立数据表，默认保留 3 天（可改）。开启「每小时自动生成」后，每个假用户按您设定的「每人每小时次数」在整点小时内随机时刻模拟抽奖；总次数 = 假人数 × 次数（如 100 人 × 3 = 300 次/小时），时刻互不重叠（不写真实抽奖记录）。",
                      "Ticker text is stored separately (default 3-day retention). With hourly auto-generation, each fake user runs N simulated draws per hour at random staggered times; total ≈ pool size × N (e.g. 100×3=300/h). No two draws share the same scheduled instant. Not written to real lottery logs.",
                    )}
                  </p>
                  {simPolicyLoading ? (
                    <Skeleton className="h-24 w-full rounded-md" />
                  ) : (
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="sim-retention-days">{t("保留天数", "Retention (days)")}</Label>
                        <Input
                          id="sim-retention-days"
                          type="number"
                          min={1}
                          max={365}
                          disabled={!canConfigureSimFake}
                          value={simPolicy.retention_days}
                          onChange={(e) =>
                            setSimPolicy((p) => ({
                              ...p,
                              retention_days: Math.max(1, Math.min(365, Number(e.target.value) || 1)),
                            }))
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="sim-cron-draws">
                          {t("每个假用户每小时抽奖次数", "Draws per fake user per hour")}
                        </Label>
                        <Input
                          id="sim-cron-draws"
                          type="number"
                          min={0}
                          max={ADMIN_SIM_CRON_FAKE_DRAWS_PER_FAKE_MAX}
                          disabled={!canConfigureSimFake}
                          value={simPolicy.cron_fake_draws_per_hour}
                          onChange={(e) =>
                            setSimPolicy((p) => ({
                              ...p,
                              cron_fake_draws_per_hour: Math.max(
                                0,
                                Math.min(
                                  ADMIN_SIM_CRON_FAKE_DRAWS_PER_FAKE_MAX,
                                  Number(e.target.value) || 0,
                                ),
                              ),
                            }))
                          }
                        />
                        <p className="text-[11px] text-muted-foreground">
                          {t(
                            `0 表示本小时不调度假抽奖；每人最多 ${ADMIN_SIM_CRON_FAKE_DRAWS_PER_FAKE_MAX} 次。本小时总调度 ≈ 假人数 × 本值（默认池 100 人）。`,
                            `0 skips fake draws. Max ${ADMIN_SIM_CRON_FAKE_DRAWS_PER_FAKE_MAX} per fake user. Total scheduled events per hour ≈ pool size × this value (default pool 100).`,
                          )}
                        </p>
                      </div>
                    </div>
                  )}
                  {!simPolicyLoading && (
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="sim-rank-min">
                          {t("滚动条：名次起（含，1=一等奖）", "Ticker: from rank (incl., 1 = 1st / top prize)")}
                        </Label>
                        <select
                          id="sim-rank-min"
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                          disabled={!canConfigureSimFake}
                          value={simPolicy.sim_feed_rank_min}
                          onChange={(e) => {
                            const v = Math.max(1, Math.min(8, Number(e.target.value) || 1));
                            setSimPolicy((p) => {
                              const max = Math.max(v, p.sim_feed_rank_max);
                              return { ...p, sim_feed_rank_min: v, sim_feed_rank_max: max };
                            });
                          }}
                        >
                          {SIM_FEED_RANK_ZH.map((zh, i) => (
                            <option key={i + 1} value={i + 1}>
                              {t(`第${zh}等奖`, `${i + 1}${["st", "nd", "rd", "th", "th", "th", "th", "th"][i]} prize`)}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="sim-rank-max">
                          {t("滚动条：名次止（含，8=八等奖）", "Ticker: through rank (incl., 8 = 8th prize)")}
                        </Label>
                        <select
                          id="sim-rank-max"
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                          disabled={!canConfigureSimFake}
                          value={simPolicy.sim_feed_rank_max}
                          onChange={(e) => {
                            const v = Math.max(1, Math.min(8, Number(e.target.value) || 8));
                            setSimPolicy((p) => {
                              const min = Math.min(v, p.sim_feed_rank_min);
                              return { ...p, sim_feed_rank_max: v, sim_feed_rank_min: min };
                            });
                          }}
                        >
                          {SIM_FEED_RANK_ZH.map((zh, i) => (
                            <option key={i + 1} value={i + 1}>
                              {t(`第${zh}等奖`, `${i + 1}${["st", "nd", "rd", "th", "th", "th", "th", "th"][i]} prize`)}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}
                  {simPolicyLoading ? null : (
                    <p className="text-[11px] text-muted-foreground">
                      {t(
                        "与后台「幸运抽奖」启用奖品列表顺序一致：sort_order 越小越靠前；名次 1 = 列表第 1 个奖品（请配置为一等奖），名次 8 = 第 8 个（八等奖）。仅模拟结果落在此名次区间内才会进入滚动队列。",
                        "Matches enabled spin prizes ordered by sort_order (smaller = earlier in list). Rank 1 = first prize row (configure as top/1st prize); rank 8 = 8th row. Only simulated draws whose rank falls in this range appear on the ticker.",
                      )}
                    </p>
                  )}
                  <div className="flex flex-col gap-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-0.5">
                      <p className="text-sm font-medium">{t("每小时自动生成假人滚动", "Hourly fake ticker (cron)")}</p>
                      <p className="text-xs text-muted-foreground">
                        {t("默认关闭；开启后需配置下方假昵称池（或内置池）。", "Off by default; needs nickname pool below (or built-in).")}
                      </p>
                    </div>
                    <Switch
                      checked={simPolicy.enable_cron_fake_feed}
                      disabled={!canConfigureSimFake || simPolicyLoading}
                      onCheckedChange={(v) => setSimPolicy((p) => ({ ...p, enable_cron_fake_feed: v === true }))}
                      aria-label={t("自动生成", "Auto-generate")}
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    {t(
                      "未点击「模拟执行」时：按上海时区每个整点自动跑一轮。点击「模拟执行」后：以该次点击时间为锚点，之后每满 1 小时跑一轮（与整点无关）。关闭自动生成会清除锚点。",
                      "Without “Start simulation”: runs at each Shanghai hour boundary. After “Start simulation”: hourly runs align from that moment. Turning off auto-generation clears the anchor.",
                    )}
                  </p>
                  {simPolicy.cron_fake_anchor_at && (
                    <p className="text-xs text-foreground/90 rounded-md border border-border/60 bg-muted/30 px-3 py-2">
                      {t("当前模拟锚点时间", "Simulation anchor")}:{" "}
                      <span className="font-mono">{formatBeijingTime(simPolicy.cron_fake_anchor_at)}</span>
                    </p>
                  )}
                  {tenantId && canConfigureSimFake && (
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" size="sm" disabled={simPolicySaving} onClick={() => void handleSaveSimPolicy()}>
                        {simPolicySaving ? t("保存中…", "Saving…") : t("保存策略", "Save policy")}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={cronStarting || !simPolicy.enable_cron_fake_feed || !!simPolicy.cron_fake_anchor_at}
                        onClick={() => void handleStartSimulationCron()}
                        title={
                          !simPolicy.enable_cron_fake_feed
                            ? t("请先开启开关并保存策略", "Enable and save policy first")
                            : simPolicy.cron_fake_anchor_at
                              ? t("已存在锚点；请先关闭自动生成并保存以清除", "Anchor exists; turn off auto-gen and save to clear")
                              : undefined
                        }
                      >
                        {cronStarting ? t("启动中…", "Starting…") : t("模拟执行（首轮）", "Start simulation (first batch)")}
                      </Button>
                      <Button type="button" size="sm" variant="outline" disabled={feedLoading} onClick={() => void loadSimPolicyAndFeed()}>
                        {t("刷新数据表", "Refresh table")}
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-5 space-y-3">
                  <SectionTitle className="!mt-0" sentenceCase>
                    {tr("memberPortalSimFeed.sectionTitle")}
                  </SectionTitle>
                  <p className="text-xs text-muted-foreground">
                    {tr("memberPortalSimFeed.sourceHint")}
                  </p>
                  {feedLoading ? (
                    <Skeleton className="h-40 w-full rounded-md" />
                  ) : feedRows.length === 0 ? (
                    <p className="py-6 text-sm text-muted-foreground">{t("暂无数据", "No rows")}</p>
                  ) : (
                    <div className="max-h-[320px] overflow-auto rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[100px]">{t("来源", "Source")}</TableHead>
                            <TableHead>{t("文案", "Text")}</TableHead>
                            <TableHead className="w-[160px]">{t("时间", "Time")}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {feedRows.map((r) => (
                            <TableRow key={r.id}>
                              <TableCell className="font-mono text-xs">{r.source}</TableCell>
                              <TableCell
                                className="max-w-[280px] truncate text-sm"
                                title={normalizeSpinSimFeedLineForMember(r.feed_text)}
                              >
                                {normalizeSpinSimFeedLineForMember(r.feed_text)}
                              </TableCell>
                              <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                                {formatBeijingTime(r.created_at)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-5 space-y-3">
                  <SectionTitle className="!mt-0">{t("模拟执行批次记录", "Simulation batch log")}</SectionTitle>
                  <p className="text-xs text-muted-foreground">
                    {t(
                      "每条记录表示系统认领并成功启动的一轮「每小时假人抽奖」任务。hour_key：上海整点时为日期时间串；锚点模式时为「锚点秒:槽位序号」。",
                      "Each row is one claimed hourly fake-draw batch. hour_key: Shanghai mode uses a date-hour string; anchor mode uses “anchorSec:slot”.",
                    )}
                  </p>
                  {feedLoading ? (
                    <Skeleton className="h-24 w-full rounded-md" />
                  ) : hourRunRows.length === 0 ? (
                    <p className="py-4 text-sm text-muted-foreground">{t("暂无批次记录", "No batch rows")}</p>
                  ) : (
                    <div className="max-h-[240px] overflow-auto rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[200px] font-mono text-xs">hour_key</TableHead>
                            <TableHead className="w-[180px]">{t("认领时间", "Claimed at")}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {hourRunRows.map((r, i) => (
                            <TableRow key={`${i}-${r.hour_key}-${r.created_at}`}>
                              <TableCell className="font-mono text-xs break-all">{r.hour_key}</TableCell>
                              <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                                {formatBeijingTime(r.created_at)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>

              <p className="text-xs text-muted-foreground -mb-2">
                {t(
                  "可选：自定义会员端抽奖页滚动条假昵称池。至少一行即可（不足 100 条会循环补满）。留空并保存则使用系统内置池。",
                  "Optional: custom nickname pool for the ticker. One line is enough (filled/cycled to 100). Save empty to use the built-in pool.",
                )}
              </p>
              <Card>
                <CardContent className="pt-5 space-y-4">
                  <SectionTitle className="!mt-0">{t("假昵称列表", "Fake nicknames")}</SectionTitle>
                  <p className="text-xs text-muted-foreground">
                    {t(
                      "支持换行、英文逗号、中文逗号分隔；≥100 条时随机取 100 条；不足则循环补满。",
                      "Separate with newlines, comma, or full-width comma; if ≥100 names, 100 are picked at random; otherwise names repeat to fill 100.",
                    )}
                  </p>
                  {simFakeLoading ? (
                    <div className="space-y-2" role="status" aria-busy="true" aria-label={t("加载中…", "Loading…")}>
                      <Skeleton className="h-[200px] w-full rounded-md" />
                    </div>
                  ) : (
                    <>
                      <Textarea
                        id="portal-sim-fake-nicknames-invite-sim-tab"
                        className="min-h-[200px] font-mono text-sm"
                        placeholder={"Kelvin A.\nMusa K.\nDavid O., John K., Ibrahim S."}
                        value={simFakeRaw}
                        onChange={(e) => setSimFakeRaw(e.target.value)}
                        disabled={!tenantId}
                        readOnly={!canConfigureSimFake}
                      />
                      <div className="space-y-1.5 text-xs text-muted-foreground">
                        <p className="leading-relaxed">
                          {t(
                            "「自定义」表示使用您保存的昵称生成 100 人池；「内置」为系统默认中文名池。粘贴后请先保存，保存后服务端才会用该池参与模拟。",
                            "“Custom” uses your saved nicknames to build the 100-user pool; “Built-in” uses default names. Paste then Save so the server uses your pool.",
                          )}
                        </p>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                          <span>
                            {t("运行池人数（保存后生效）", "Pool size (after save)")}:{" "}
                            <span className="font-mono text-foreground">
                              {simFakeMeta.source === "builtin"
                                ? 100
                                : simFakeMeta.pool_count === 100
                                  ? 100
                                  : simFakeMeta.pool_count}
                            </span>{" "}
                            {simFakeMeta.source === "custom"
                              ? t("（自定义）", "(custom)")
                              : t("（内置）", "(built-in)")}
                          </span>
                          <span>
                            {t("框内解析条数", "Parsed in editor")}:{" "}
                            <span className="font-mono text-foreground">{draftNicknameCount}</span>
                            {simFakeMeta.nickname_tokens_count != null && simFakeMeta.source === "custom" ? (
                              <span className="text-muted-foreground">
                                {" "}
                                ({t("上次保存", "last save")} {simFakeMeta.nickname_tokens_count})
                              </span>
                            ) : null}
                          </span>
                          {simFakeMeta.updated_at && (
                            <span>
                              {t("上次保存时间", "Last saved at")}: {formatBeijingTime(simFakeMeta.updated_at)}
                            </span>
                          )}
                        </div>
                        {simFakeMeta.source === "custom" && simFakeMeta.pool_count !== 100 && (
                          <p className="text-amber-600 dark:text-amber-500">
                            {t(
                              "库内池数据异常（非 100 条），请重新点击保存以修复，或联系管理员检查数据库。",
                              "Stored pool is invalid (not 100 entries). Click Save again to rebuild, or check the database.",
                            )}
                          </p>
                        )}
                      </div>
                      {tenantId && canConfigureSimFake && (
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            disabled={simFakeSaving}
                            onClick={() => void handleSaveSimFakeSettings()}
                          >
                            {simFakeSaving ? t("保存中…", "Saving…") : t("保存", "Save")}
                          </Button>
                        </div>
                      )}
                      {!tenantId && (
                        <p className="text-xs text-amber-600 dark:text-amber-500">
                          {t("请先选择租户后再配置。", "Select a tenant first.")}
                        </p>
                      )}
                    </>
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
