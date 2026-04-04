import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RefreshCw } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { showServiceErrorToast } from "@/services/serviceErrorToast";
import {
  getMemberPortalWebsiteStats,
  type MemberPortalWebsiteStats,
} from "@/services/members/memberPortalAnalyticsService";
import { cn } from "@/lib/utils";

// ─── 分区标题：中文界面不用全大写（避免「英文样式」误解）；英文保留 uppercase ───
function WebsiteSectionTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  const { language } = useLanguage();
  return (
    <p
      className={cn(
        "text-xs font-semibold text-muted-foreground mb-3 mt-6 first:mt-0",
        language === "en" ? "uppercase tracking-widest" : "tracking-wide",
        className,
      )}
    >
      {children}
    </p>
  );
}

interface WebsiteDataTabProps {
  tenantId: string | null;
  canManage: boolean;
}

export function WebsiteDataTab({ tenantId }: WebsiteDataTabProps) {
  const { t, language } = useLanguage();

  const shanghaiTodayStr = useMemo(() => {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());
    const g = (ty: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === ty)?.value ?? "";
    return `${g("year")}-${g("month")}-${g("day")}`;
  }, []);

  const [statsStart, setStatsStart] = useState("");
  const [statsEnd, setStatsEnd] = useState("");
  const [websiteStats, setWebsiteStats] = useState<MemberPortalWebsiteStats | null>(null);
  const [websiteStatsLoading, setWebsiteStatsLoading] = useState(false);
  const [websiteStatsLoadFailed, setWebsiteStatsLoadFailed] = useState(false);
  const statsLoadGenRef = useRef(0);

  useEffect(() => {
    setStatsStart((s) => s || shanghaiTodayStr);
    setStatsEnd((e) => e || shanghaiTodayStr);
  }, [shanghaiTodayStr]);

  const loadWebsiteStats = useCallback(async () => {
    if (!tenantId) return;
    const gen = ++statsLoadGenRef.current;
    setWebsiteStatsLoading(true);
    setWebsiteStatsLoadFailed(false);
    const MAX_RETRIES = 3;
    const start = statsStart || shanghaiTodayStr;
    const end = statsEnd || shanghaiTodayStr;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const s = await getMemberPortalWebsiteStats(tenantId, start, end);
        if (gen !== statsLoadGenRef.current) return;
        setWebsiteStats(s);
        setWebsiteStatsLoadFailed(false);
        setWebsiteStatsLoading(false);
        return;
      } catch (e: unknown) {
        if (gen !== statsLoadGenRef.current) return;
        if (attempt < MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
          if (gen !== statsLoadGenRef.current) return;
          continue;
        }
        setWebsiteStatsLoadFailed(true);
        showServiceErrorToast(e, t, "网站数据加载失败", "Failed to load site analytics");
      }
    }
    if (gen === statsLoadGenRef.current) setWebsiteStatsLoading(false);
  }, [tenantId, statsStart, statsEnd, shanghaiTodayStr, t]);

  useEffect(() => {
    if (!tenantId) return;
    void loadWebsiteStats();
    return () => {
      statsLoadGenRef.current += 1;
    };
  }, [tenantId, loadWebsiteStats]);

  return (
    <div className="space-y-6">
      {/* ── 统计口径标签 ── */}
      <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs dark:border-amber-800 dark:bg-amber-950/30">
        <span className="mt-0.5 shrink-0 rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-semibold text-white uppercase tracking-wide">
          {t("自助注册链接", "Invite-link only")}
        </span>
        <p className="text-amber-800 dark:text-amber-300 leading-relaxed m-0">
          {t(
            "此页面仅统计通过前端自助注册链接注册的会员（registration_source = invite_register）。后台手工创建、批量导入等来源的会员不在此统计范围内。如需查看全站汇总数据，请前往「数据统计」仪表盘。",
            "This page only counts members who signed up via the frontend invite/self-registration link (registration_source = invite_register). Members created by staff or imported in bulk are excluded. For all-source totals, see the Dashboard.",
          )}
        </p>
      </div>

      <div className="text-xs text-muted-foreground -mb-2 space-y-2 leading-relaxed">
        <p className="m-0 font-medium text-foreground/90">{t("统计范围（必读）", "What this page measures")}</p>
        <ul className="m-0 list-disc space-y-1.5 pl-4">
          <li>
            {t(
              "统计口径：仅限前端自助注册链接注册（registration_source = invite_register）。后台手工创建（admin_create）、批量导入（import）等来源均不计入。",
              "Scope: invite-link self-registration only (registration_source = invite_register). Staff-created (admin_create) and imported (import) members are excluded.",
            )}
          </li>
          <li>
            {t(
              "租户范围：仅统计当前租户，不是全平台汇总。",
              "Tenant scope: this tenant only — not the whole platform.",
            )}
          </li>
          <li>
            {t(
              "登录人数：以会员登录成功记录为准；若某种登录方式未写入日志则不会计入。",
              "Logins: based on successful login records; paths that do not write a log are not counted.",
            )}
          </li>
          <li>
            {t(
              "订单与金额：仅统计自助注册链接来源会员的订单；不含已取消、已删除。",
              "Orders & amounts: only from invite-link members; excludes cancelled/deleted.",
            )}
          </li>
          <li>
            {t(
              "在线人数：约 15 分钟内有活动的自助注册链接来源活跃会员。",
              "Online: invite-link members with activity in roughly the last 15 minutes.",
            )}
          </li>
          <li>
            {t(
              "与「数据统计」的区别：「数据统计」仪表盘统计全站所有会员与订单（含后台录入），此处仅反映前端自助注册链接渠道的数据。",
              "Difference from Dashboard: the Dashboard covers ALL members & orders (including staff-created); this page covers invite-link self-registration only.",
            )}
          </li>
        </ul>
      </div>
      <Card>
        <CardContent className="pt-5 space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label>{t("开始日期", "Start date")}</Label>
              <Input type="date" value={statsStart} onChange={(e) => setStatsStart(e.target.value)} className="w-[160px]" />
            </div>
            <div className="space-y-1">
              <Label>{t("结束日期", "End date")}</Label>
              <Input type="date" value={statsEnd} onChange={(e) => setStatsEnd(e.target.value)} className="w-[160px]" />
            </div>
            <Button type="button" variant="secondary" size="sm" className="gap-1.5" onClick={() => void loadWebsiteStats()} disabled={websiteStatsLoading || !tenantId}>
              {websiteStatsLoading ? (
                <span
                  className="inline-block h-2.5 w-8 animate-pulse rounded-full bg-muted-foreground/35 motion-reduce:animate-none"
                  aria-hidden
                />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              {t("查询", "Query")}
            </Button>
          </div>
          {websiteStatsLoading && !websiteStats ? (
            <div
              className="space-y-6 pt-2"
              role="status"
              aria-busy="true"
              aria-label={t("加载中…", "Loading…")}
            >
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-[5.5rem] rounded-lg" />
                ))}
              </div>
              <div className="space-y-3">
                <Skeleton className="h-3 w-40" />
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-20 rounded-lg" />
                  ))}
                </div>
              </div>
            </div>
          ) : websiteStatsLoadFailed && !websiteStats ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <p className="text-sm text-destructive">{t("网站数据加载失败", "Site analytics failed to load")}</p>
              <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => void loadWebsiteStats()}>
                <RefreshCw className="h-3.5 w-3.5" />
                {t("重新加载", "Retry")}
              </Button>
            </div>
          ) : websiteStats ? (
            <div className="space-y-6">
              <div>
                <WebsiteSectionTitle>{t("今日（北京时间）", "Today (Asia/Shanghai)")}</WebsiteSectionTitle>
                <p className="text-xs text-muted-foreground mb-3">
                  {t("日历日：", "Calendar day: ")}{websiteStats.calendar_today}
                </p>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-lg border bg-muted/30 p-3">
                    <p className="text-xs text-muted-foreground">{t("今日登录人数", "Logins today")}</p>
                    <p className="text-2xl font-semibold tabular-nums">{websiteStats.today.login_users}</p>
                  </div>
                  <div className="rounded-lg border bg-muted/30 p-3">
                    <p className="text-xs text-muted-foreground">{t("当前在线", "Online now")}</p>
                    <p className="text-2xl font-semibold tabular-nums">{websiteStats.online_now}</p>
                  </div>
                  <div className="rounded-lg border bg-muted/30 p-3">
                    <p className="text-xs text-muted-foreground">{t("今日注册人数（自助链接）", "Registrations today (invite-link)")}</p>
                    <p className="text-2xl font-semibold tabular-nums">{websiteStats.today.register_count}</p>
                  </div>
                  <div className="rounded-lg border bg-muted/30 p-3">
                    <p className="text-xs text-muted-foreground">{t("今日交易人数", "Traders today")}</p>
                    <p className="text-2xl font-semibold tabular-nums">{websiteStats.today.trading_users}</p>
                  </div>
                </div>
              </div>
              <div>
                <WebsiteSectionTitle>
                  {t("所选时间范围", "Selected range")}（{websiteStats.range.start_date} ~ {websiteStats.range.end_date}）
                </WebsiteSectionTitle>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="rounded-lg border bg-muted/30 p-3">
                    <p className="text-xs text-muted-foreground">{t("登录人数（去重）", "Unique logins")}</p>
                    <p className="text-2xl font-semibold tabular-nums">{websiteStats.in_range.login_users}</p>
                  </div>
                  <div className="rounded-lg border bg-muted/30 p-3">
                    <p className="text-xs text-muted-foreground">{t("注册人数（自助链接）", "Registrations (invite-link)")}</p>
                    <p className="text-2xl font-semibold tabular-nums">{websiteStats.in_range.register_count}</p>
                  </div>
                  <div className="rounded-lg border bg-muted/30 p-3">
                    <p className="text-xs text-muted-foreground">{t("交易人数（去重）", "Unique traders")}</p>
                    <p className="text-2xl font-semibold tabular-nums">{websiteStats.in_range.trading_users}</p>
                  </div>
                  <div className="rounded-lg border bg-muted/30 p-3">
                    <p className="text-xs text-muted-foreground">{t("总计交易金额", "Total transaction amount")}</p>
                    <p className="text-2xl font-semibold tabular-nums">{websiteStats.in_range.total_transaction_amount.toLocaleString()}</p>
                    <p className="text-[11px] text-muted-foreground mt-1.5 leading-snug">
                      {t(
                        "多笔订单按实付或订单金额汇总；多种货币仅做数值相加，未做汇率折算。",
                        "Summed per order from paid or order amount; mixed currencies are added as plain numbers (no FX).",
                      )}
                    </p>
                  </div>
                  <div className="rounded-lg border bg-muted/30 p-3">
                    <p className="text-xs text-muted-foreground">{t("订单金额 + 卡片价值（合计）", "Order amount + card face value (sum)")}</p>
                    <p className="text-2xl font-semibold tabular-nums">{websiteStats.in_range.card_value_sum.toLocaleString()}</p>
                  </div>
                  <div className="rounded-lg border bg-muted/30 p-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      <p className="text-xs text-muted-foreground">
                        {t("累积注册人数（截至范围结束日）", "Cumulative sign-ups (by range end)")}
                      </p>
                      <span className="rounded bg-amber-100 px-1 py-0.5 text-[9px] font-semibold text-amber-700 dark:bg-amber-900/40 dark:text-amber-400 leading-none">
                        {t("自助注册链接", "Invite-link")}
                      </span>
                    </div>
                    <p className="text-2xl font-semibold tabular-nums">
                      {(websiteStats.cumulative_members ?? websiteStats.cumulative_invite_registers).toLocaleString(
                        language === "zh" ? "zh-CN" : "en-US",
                      )}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-1.5 leading-snug">
                      {t(
                        "截至所选结束日，通过前端自助注册链接注册的累积会员数（仅含 invite_register 来源）。",
                        "Total members who signed up via invite link by end of selected range (invite_register source only).",
                      )}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t("请选择租户后查询", "Select a tenant to load stats")}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
