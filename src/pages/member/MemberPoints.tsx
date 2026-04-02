import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { formatMemberLocalTime } from "@/lib/memberLocalTime";
import { ledgerActivityTypeLabel } from "@/lib/memberLedgerTypeLabel";
import { ShoppingCart, Package, Loader2, X, Gift, LayoutGrid, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { useMemberAuth } from "@/contexts/MemberAuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useMemberPortalSettings } from "@/hooks/useMemberPortalSettings";
import { useMemberPoints } from "@/hooks/useMemberPoints";
import { useActionGuard } from "@/lib/actionGuard";
import {
  loadMemberPointsMallCatalog,
  loadMemberPointsMallCategories,
  redeemPointsMallItem,
  type PointsMallItem,
  type PointsMallCategory,
} from "@/services/memberPortal/memberPointsPortalService";
import {
  listMemberPointsMallRedemptionsForPortal,
  type MemberPortalRedemptionRpcRow,
  type RedeemPointsMallItemResult,
} from "@/services/members/memberPointsMallRpcService";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";
import { ROUTES } from "@/routes/constants";
import { memberQueryKeys } from "@/lib/memberQueryKeys";
import { useMemberResolvableMedia } from "@/hooks/useMemberResolvableMedia";
import { MemberPageAmbientOrbs } from "@/components/member/MemberPageAmbientOrbs";
import { MemberStackedRowSkeleton } from "@/components/member/MemberPageLoadingShell";
import { MemberEmptyStateCta } from "@/components/member/MemberEmptyStateCta";
import { useMemberSkeletonGate } from "@/hooks/useMemberSkeletonGate";
import { memberPortalNetworkToastMessage } from "@/lib/memberPortalUx";
import { DrawerDetail } from "@/components/shell/DrawerDetail";
import { sumTodayEarnedFromLedger } from "@/lib/memberLedgerToday";
import {
  getMemberPointsLedgerRpc,
  type MemberPointsLedgerRow,
} from "@/services/points/memberPointsRpcService";
import { formatMemberLedgerRowOrderDisplay } from "@/lib/memberLedgerIdDisplay";
import { MemberPortalPointsHero } from "@/components/member/MemberPortalPointsHero";
import {
  MemberPointsMallProductCard,
  type MemberPointsMallProductCornerTL,
  type MemberPointsMallProductCornerTR,
} from "@/components/member/MemberPointsMallProductCard";
import {
  pickBilingualPortalField,
} from "@/lib/memberPortalBilingualHint";
import "@/styles/member-portal.css";
import { useMemberAnimatedCount } from "@/hooks/useMemberAnimatedCount";
import { useMemberPullRefreshSignal } from "@/hooks/useMemberPullRefreshSignal";

const MALL_TAB_ALL = "__all__";
const MALL_TAB_POPULAR = "__popular__";

const REDEMPTION_HISTORY_LIMIT = 50;

type PointsMainTab = "mall" | "history";

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeMallItem(row: PointsMallItem): PointsMallItem {
  return {
    ...row,
    points_cost: num(row.points_cost, 0),
    stock_remaining: row.stock_remaining == null ? -1 : num(row.stock_remaining, -1),
    per_order_limit: Math.max(1, num(row.per_order_limit, 1)),
    per_user_daily_limit: Math.max(0, num(row.per_user_daily_limit, 0)),
    per_user_lifetime_limit: Math.max(0, num(row.per_user_lifetime_limit, 0)),
    used_today: num(row.used_today, 0),
    used_lifetime: num(row.used_lifetime, 0),
    tenant_redeem_qty: num((row as { tenant_redeem_qty?: unknown }).tenant_redeem_qty, 0),
  };
}

function redeemFailureDetail(r: RedeemPointsMallItemResult, t: (zh: string, en: string) => string): string {
  switch (r.error) {
    case "INSUFFICIENT_POINTS": {
      const req = num(r.required, 0);
      const cur = num(r.current, 0);
      const gap = Math.max(0, req - cur);
      return t(
        `积分不足：本单需 ${req} 积分，当前 ${cur}，还差 ${gap}。`,
        `Not enough points: this order needs ${req} pts, you have ${cur}, need ${gap} more.`,
      );
    }
    case "OUT_OF_STOCK": {
      const av = num(r.available, 0);
      const rq = num(r.requested, 1);
      return t(
        `库存不足：仅剩 ${av} 件，您选择了 ${rq}。请减少数量或刷新列表。`,
        `Out of stock: only ${av} left, you requested ${rq}. Lower the quantity or refresh.`,
      );
    }
    case "ITEM_NOT_FOUND":
      return t("该商品暂不可用，请返回并刷新列表。", "This item is unavailable. Go back and refresh the list.");
    case "EXCEED_PER_ORDER_LIMIT":
      return t(
        `单笔上限：最多 ${num(r.limit, 1)} 件，请调低数量。`,
        `Per-order limit: at most ${num(r.limit, 1)} item(s). Lower the quantity.`,
      );
    case "EXCEED_DAILY_LIMIT": {
      const lim = num(r.limit, 0);
      const used = num(r.used, 0);
      const left = Math.max(0, lim - used);
      return t(
        `超出每日上限：今日已兑 ${used}，上限 ${lim}，今日剩余 ${left}。`,
        `Daily limit exceeded: redeemed ${used} today, limit ${lim}, ${left} left today.`,
      );
    }
    case "EXCEED_LIFETIME_LIMIT": {
      const lim = num(r.limit, 0);
      const used = num(r.used, 0);
      const left = Math.max(0, lim - used);
      return t(
        `超出终身上限：累计已兑 ${used}，上限 ${lim}，剩余 ${left}。`,
        `Lifetime limit exceeded: redeemed ${used} total, limit ${lim}, ${left} remaining.`,
      );
    }
    case "HAS_FROZEN_POINTS":
      return t(
        "您有待审核的兑换，积分已冻结；请等待员工在后台处理完成或驳回后再发起新的兑换。",
        "You have a redemption pending staff review; points are frozen. Wait until it is completed or rejected before redeeming again.",
      );
    case "DUPLICATE_REQUEST":
      return t("请求过于频繁或重复提交，请稍后再试。", "Too many requests or duplicate submit. Please wait and try again.");
    case "INVALID_PARAMS":
      return t("请求无效，请关闭弹窗后重新打开。", "Invalid request. Close this dialog and open again.");
    case "REDEEM_FAILED":
      return r.message?.trim()
        ? t(`兑换失败：${r.message.trim()}`, `Redeem failed: ${r.message.trim()}`)
        : t("兑换失败，请重试或联系客服。", "Redeem failed. Try again or contact support.");
    default:
      return r.message?.trim()
        ? t(
            `${r.error ? `${r.error}：` : ""}${r.message.trim()}`,
            `${r.error ? `${r.error}: ` : ""}${r.message.trim()}`,
          )
        : t(
            r.error ? `操作失败（${r.error}），请稍后重试。` : "兑换失败，请稍后重试。",
            r.error ? `${r.error}. Try again later.` : "Redeem failed. Try again later.",
          );
  }
}

function stockLabel(stock: number, t: (zh: string, en: string) => string): string {
  if (stock < 0) return t("库存：不限", "Stock: unlimited");
  return t(`库存：${stock}`, `Stock: ${stock}`);
}

/** Max redeemable qty for this member (per order, stock, daily, lifetime). */
function redeemableMaxQty(p: PointsMallItem): number {
  const perOrder = Math.max(1, num(p.per_order_limit, 1));
  const stockCap = p.stock_remaining < 0 ? 999999 : num(p.stock_remaining, 0);
  const dailyLim = num(p.per_user_daily_limit, 0);
  const lifeLim = num(p.per_user_lifetime_limit, 0);
  const usedDay = num(p.used_today, 0);
  const usedLife = num(p.used_lifetime, 0);
  const dailyLeft = dailyLim > 0 ? Math.max(0, dailyLim - usedDay) : 999999;
  const lifeLeft = lifeLim > 0 ? Math.max(0, lifeLim - usedLife) : 999999;
  return Math.max(0, Math.min(perOrder, stockCap, dailyLeft, lifeLeft));
}

function fmtLedgerPts(n: number) {
  return Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function mallRedemptionStatusLabel(status: string, t: (zh: string, en: string) => string): string {
  const s = String(status || "").toLowerCase().trim();
  if (s === "pending") return t("待审核", "Pending");
  if (s === "completed" || s === "complete") return t("已完成", "Completed");
  if (s === "rejected" || s === "reject") return t("已驳回", "Rejected");
  return status?.trim() ? status : "—";
}

/** 单条商城兑换记录（redemptions 表，非 points_ledger consumption 筛选） */
function MemberMallRedemptionHistoryRow({
  row,
  t,
}: {
  row: MemberPortalRedemptionRpcRow;
  t: (zh: string, en: string) => string;
}) {
  const pts = -Math.abs(Number(row.points_used ?? 0));
  const dur = 520;
  const animPts = useMemberAnimatedCount(pts, { enabled: true, durationMs: dur });
  const qty = Math.max(1, Math.floor(Number(row.quantity ?? 1)));
  const title =
    qty > 1
      ? `${String(row.prize_name || "—").trim()} ×${qty}`
      : String(row.prize_name || "—").trim();
  const created =
    typeof row.created_at === "string"
      ? row.created_at
      : row.created_at != null
        ? String(row.created_at)
        : "";
  const statusText = mallRedemptionStatusLabel(String(row.status || ""), t);

  return (
    <div className="member-activity-feed__row">
      <div className="member-activity-feed__dot member-activity-feed__dot--debit" aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <p className="m-0 min-w-0 flex-1 text-sm font-semibold text-[hsl(var(--pu-m-text)/0.95)]">{title}</p>
          <span className="shrink-0 rounded-full border border-[hsl(var(--pu-m-surface-border)/0.35)] bg-[hsl(var(--pu-m-surface)/0.25)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[hsl(var(--pu-m-text-dim)/0.85)]">
            {statusText}
          </span>
        </div>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-[hsl(var(--pu-m-text-dim)/0.72)]">
          <span>{formatMemberLocalTime(created)}</span>
        </p>
        <p className="mt-0.5 text-[15px] font-extrabold tabular-nums tracking-tight text-pu-rose-soft">
          {fmtLedgerPts(animPts)}{" "}
          <span className="text-xs font-bold text-[hsl(var(--pu-m-text-dim)/0.75)]">{t("积分", "pts")}</span>
        </p>
      </div>
    </div>
  );
}

/** 单条流水：数字缓动（每行独立组件以满足 Hooks） */
function MemberPointsRecentLedgerRow({
  row,
  t,
}: {
  row: MemberPointsLedgerRow;
  t: (zh: string, en: string) => string;
}) {
  const pts = Number(row.points);
  const isNeg = pts < 0;
  const bb = Number(row.balance_before);
  const ba = Number(row.balance_after);
  const dur = 520;
  const animPts = useMemberAnimatedCount(pts, { enabled: true, durationMs: dur });
  const animBb = useMemberAnimatedCount(bb, { enabled: true, durationMs: dur + 70 });
  const animBa = useMemberAnimatedCount(ba, { enabled: true, durationMs: dur + 140 });
  const orderFmt = formatMemberLedgerRowOrderDisplay(row);
  const desc = row.description?.trim() ?? "";
  const refLine =
    desc ||
    (orderFmt.display && orderFmt.display !== "—"
      ? `${t("关联单号", "Reference")} ${orderFmt.display}`
      : null);
  const refTitle = !desc && orderFmt.fullTitle ? orderFmt.fullTitle : undefined;

  return (
    <div className="member-activity-feed__row">
      <div
        className={cn("member-activity-feed__dot", isNeg && "member-activity-feed__dot--debit")}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <p className="m-0 min-w-0 flex-1 text-sm font-semibold text-[hsl(var(--pu-m-text)/0.95)]">
            {ledgerActivityTypeLabel(row.type, t)}
          </p>
          <span
            className={cn(
              "shrink-0 text-[15px] font-extrabold tabular-nums tracking-tight",
              isNeg ? "text-pu-rose-soft" : "text-pu-emerald",
            )}
          >
            {isNeg ? "" : "+"}
            {fmtLedgerPts(animPts)}{" "}
            <span className="text-xs font-bold text-[hsl(var(--pu-m-text-dim)/0.75)]">{t("积分", "pts")}</span>
          </span>
        </div>
        {refLine ? (
          <p className="member-recent-ledger__desc" title={refTitle}>
            {refLine}
          </p>
        ) : null}
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-[hsl(var(--pu-m-text-dim)/0.72)]">
          <span>{formatMemberLocalTime(row.earned_at)}</span>
          <span className="tabular-nums text-[hsl(var(--pu-m-text-dim)/0.55)]">
            {fmtLedgerPts(animBb)} → {fmtLedgerPts(animBa)}
          </span>
        </p>
      </div>
    </div>
  );
}

/** 积分商城页内「兑换历史」：redemptions 商城单（member_list_points_mall_redemptions），与 ledger consumption 筛选互斥 */
function MemberRedemptionHistoryFeed({
  memberId,
  refreshKey = 0,
  pullRefreshSignal = 0,
  t,
}: {
  memberId: string;
  refreshKey?: number;
  pullRefreshSignal?: number;
  t: (zh: string, en: string) => string;
}) {
  const [rows, setRows] = useState<MemberPortalRedemptionRpcRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [retryTick, setRetryTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFetchError(false);
    void (async () => {
      try {
        const items = await listMemberPointsMallRedemptionsForPortal(memberId, REDEMPTION_HISTORY_LIMIT);
        if (cancelled) return;
        setRows(Array.isArray(items) ? items : []);
      } catch {
        if (!cancelled) {
          setRows([]);
          setFetchError(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [memberId, refreshKey, retryTick]);

  useEffect(() => {
    if (!memberId || pullRefreshSignal === 0) return;
    let cancelled = false;
    void (async () => {
      try {
        const items = await listMemberPointsMallRedemptionsForPortal(memberId, REDEMPTION_HISTORY_LIMIT);
        if (cancelled) return;
        setRows(Array.isArray(items) ? items : []);
        setFetchError(false);
      } catch {
        if (!cancelled) setFetchError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [memberId, pullRefreshSignal]);

  const showSkeleton = useMemberSkeletonGate(loading);
  if (showSkeleton) {
    return <MemberStackedRowSkeleton rows={5} />;
  }

  if (fetchError) {
    return (
      <div className="relative overflow-hidden rounded-2xl border border-dashed border-pu-rose/28 bg-gradient-to-b from-pu-rose/[0.06] via-[hsl(var(--pu-m-surface)/0.18)] to-[hsl(var(--pu-m-surface)/0.22)] px-4 py-8 text-center">
        <p className="m-0 text-sm font-semibold text-[hsl(var(--pu-m-text))]">
          {t("兑换记录加载失败", "Could not load records")}
        </p>
        <p className="mt-1.5 text-[11px] leading-relaxed text-[hsl(var(--pu-m-text-dim)/0.65)]">
          {t("请检查网络后重试，或下拉刷新页面。", "Check your network and try again, or pull down to refresh.")}
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-4 border-[hsl(var(--pu-m-surface-border)/0.35)] bg-[hsl(var(--pu-m-surface)/0.35)] text-[hsl(var(--pu-m-text))] hover:bg-[hsl(var(--pu-m-surface)/0.55)]"
          onClick={() => setRetryTick((x) => x + 1)}
        >
          {t("重试", "Retry")}
        </Button>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="relative overflow-hidden rounded-2xl border border-dashed border-pu-gold/22 bg-gradient-to-b from-pu-gold/[0.08] via-[hsl(var(--pu-m-surface)/0.18)] to-[hsl(var(--pu-m-surface)/0.22)] px-4 py-10 text-center">
        <div className="relative">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-pu-gold/12 text-[hsl(var(--pu-m-text-dim)/0.4)]">
            <Package className="h-6 w-6" strokeWidth={1.75} aria-hidden />
          </div>
          <p className="m-0 text-sm font-semibold text-[hsl(var(--pu-m-text))]">
            {t("暂无兑换记录", "No records yet")}
          </p>
          <p className="mt-1.5 text-[11px] leading-relaxed text-[hsl(var(--pu-m-text-dim)/0.65)]">
            {t("在商城兑换商品后，记录将显示在这里。", "Redeem items in the mall to see them here.")}
          </p>
          <MemberEmptyStateCta
            anchorPrimary={{ href: "#member-mall-catalog", label: t("去商城逛逛", "Browse mall") }}
            secondary={{ to: ROUTES.MEMBER.DASHBOARD, label: t("回首页", "Home") }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="member-activity-feed member-history-panel space-y-0 rounded-2xl border border-[hsl(var(--pu-m-surface-border)/0.22)] bg-[hsl(var(--pu-m-surface)/0.18)] px-1 py-2">
      {rows.map((row) => (
        <MemberMallRedemptionHistoryRow key={row.id} row={row} t={t} />
      ))}
    </div>
  );
}

const _mallCache = new Map<string, PointsMallItem[]>();

export default function MemberPoints() {
  const { member } = useMemberAuth();
  const queryClient = useQueryClient();
  const location = useLocation();
  const { settings: portalSettings } = useMemberPortalSettings(member?.id);
  const { t, language } = useLanguage();
  const themeColor = useMemo(() => {
    const c = String(portalSettings.theme_primary_color || "").trim();
    return /^#[0-9A-Fa-f]{6}$/i.test(c) ? c : "#4d8cff";
  }, [portalSettings.theme_primary_color]);

  const redeemRulesTitle = useMemo(
    () =>
      pickBilingualPortalField(
        language,
        portalSettings.points_mall_redeem_rules_title_zh,
        portalSettings.points_mall_redeem_rules_title_en,
        "规则（与后台同步）",
        "Rules (synced with admin)",
      ),
    [language, portalSettings.points_mall_redeem_rules_title_en, portalSettings.points_mall_redeem_rules_title_zh],
  );
  const redeemDailyUnlimitedLine = useMemo(
    () =>
      pickBilingualPortalField(
        language,
        portalSettings.points_mall_redeem_daily_unlimited_zh,
        portalSettings.points_mall_redeem_daily_unlimited_en,
        "每日上限：不限制（以后台为准）",
        "Daily limit: none (per admin)",
      ),
    [
      language,
      portalSettings.points_mall_redeem_daily_unlimited_en,
      portalSettings.points_mall_redeem_daily_unlimited_zh,
    ],
  );
  const redeemLifetimeUnlimitedLine = useMemo(
    () =>
      pickBilingualPortalField(
        language,
        portalSettings.points_mall_redeem_lifetime_unlimited_zh,
        portalSettings.points_mall_redeem_lifetime_unlimited_en,
        "终身上限：不限制（以后台为准）",
        "Lifetime limit: none",
      ),
    [
      language,
      portalSettings.points_mall_redeem_lifetime_unlimited_en,
      portalSettings.points_mall_redeem_lifetime_unlimited_zh,
    ],
  );

  const { points, frozenPoints, loading, refresh: refreshPoints } = useMemberPoints(member?.id);
  const hasFrozen = frozenPoints > 0;
  const cachedItems = member ? _mallCache.get(member.id) : undefined;
  const [items, setItems] = useState<PointsMallItem[]>(cachedItems ?? []);
  const [itemsLoading, setItemsLoading] = useState(!cachedItems);
  const [redeeming, setRedeeming] = useState(false);
  const [redeemTarget, setRedeemTarget] = useState<PointsMallItem | null>(null);
  const redeemDrawerImg = useMemberResolvableMedia(redeemTarget?.id ?? "", redeemTarget?.image_url);
  const [redeemQty, setRedeemQty] = useState(1);
  const [redemptionsKey, setRedemptionsKey] = useState(0);
  const [mallCategories, setMallCategories] = useState<PointsMallCategory[]>([]);
  const redeemGuard = useActionGuard(800);
  const redeemClientRequestIdRef = useRef("");
  const [redeemError, setRedeemError] = useState<string | null>(null);
  const [catalogError, setCatalogError] = useState(false);
  const [catalogRetryKey, setCatalogRetryKey] = useState(0);
  const [mallFilterKey, setMallFilterKey] = useState<string>(MALL_TAB_ALL);
  const [pointsTab, setPointsTab] = useState<PointsMainTab>("mall");
  const [todayEarned, setTodayEarned] = useState(0);
  const [todayEarnedLoading, setTodayEarnedLoading] = useState(true);
  const [pullNonce, setPullNonce] = useState(0);
  const lastSeenPullForMall = useRef(0);
  const showMallSkeleton = useMemberSkeletonGate(loading || itemsLoading);

  useMemberPullRefreshSignal(() => {
    setPullNonce((n) => n + 1);
  });

  useEffect(() => {
    setCatalogRetryKey(0);
    setPullNonce(0);
    lastSeenPullForMall.current = 0;
    setPointsTab("mall");
  }, [member?.id]);

  useEffect(() => {
    const h = location.hash.replace(/^#/, "").trim();
    if (h === "member-mall-catalog") setPointsTab("mall");
  }, [location.hash]);

  useEffect(() => {
    if (!member?.id) return;
    let cancelled = false;
    setTodayEarnedLoading(true);
    void (async () => {
      const r = await getMemberPointsLedgerRpc(member.id, "all", 200, 0);
      if (cancelled) return;
      if (r.success) setTodayEarned(sumTodayEarnedFromLedger(r.rows));
      else setTodayEarned(0);
      setTodayEarnedLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [member?.id, redemptionsKey]);

  useEffect(() => {
    if (!member?.id || pullNonce === 0) return;
    let cancelled = false;
    void (async () => {
      const r = await getMemberPointsLedgerRpc(member.id, "all", 200, 0);
      if (cancelled) return;
      if (r.success) setTodayEarned(sumTodayEarnedFromLedger(r.rows));
      else setTodayEarned(0);
    })();
    return () => {
      cancelled = true;
    };
  }, [member?.id, pullNonce]);

  useEffect(() => {
    const id = location.hash.replace(/^#/, "").trim();
    if (!id) return;
    const run = () => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    const t0 = window.setTimeout(run, itemsLoading ? 280 : 80);
    return () => window.clearTimeout(t0);
  }, [location.hash, itemsLoading, items.length]);

  const filteredItems = useMemo(() => {
    const base = [...items];
    if (mallFilterKey === MALL_TAB_ALL) return base;
    if (mallFilterKey === MALL_TAB_POPULAR) {
      return [...base].sort((a, b) => {
        const pa = num(a.tenant_redeem_qty, 0);
        const pb = num(b.tenant_redeem_qty, 0);
        if (pb !== pa) return pb - pa;
        return String(a.title || "").localeCompare(String(b.title || ""));
      });
    }
    return base.filter((p) => String(p.mall_category_id || "") === mallFilterKey);
  }, [items, mallFilterKey]);

  useEffect(() => {
    if (!member) return;
    const pullDelta = pullNonce > lastSeenPullForMall.current;
    if (pullDelta) lastSeenPullForMall.current = pullNonce;

    setCatalogError(false);
    const silentMall = pullDelta && pullNonce > 0 && _mallCache.has(member.id);
    if (!silentMall) {
      if (!_mallCache.has(member.id) || catalogRetryKey > 0) setItemsLoading(true);
    }
    (async () => {
      try {
        const [raw, cats] = await Promise.all([
          loadMemberPointsMallCatalog(member.id),
          loadMemberPointsMallCategories(member.id),
        ]);
        const normalized = raw.map(normalizeMallItem);
        setItems(normalized);
        _mallCache.set(member.id, normalized);
        setMallCategories(Array.isArray(cats) ? cats : []);
      } catch {
        if (!_mallCache.has(member.id) || catalogRetryKey > 0) {
          setItems([]);
          setCatalogError(true);
        }
        setMallCategories([]);
      } finally {
        setItemsLoading(false);
      }
    })();
  }, [member?.id, catalogRetryKey, pullNonce]);

  useEffect(() => {
    setRedeemError(null);
  }, [redeemTarget]);

  useEffect(() => {
    setRedeemError(null);
  }, [redeemQty]);

  useEffect(() => {
    if (!redeemTarget) return;
    const m = redeemableMaxQty(redeemTarget);
    if (m < 1) return;
    setRedeemQty((q) => Math.min(Math.max(1, q), m));
  }, [redeemTarget]);

  const handleRedeem = useCallback(async () => {
    if (!member || !redeemTarget) return;
    await redeemGuard(async () => {
      const cap = redeemableMaxQty(redeemTarget);
      const qty = cap < 1 ? 0 : Math.max(1, Math.min(Number(redeemQty || 1), cap));
      if (qty < 1) {
        toast.error(
          t(
            "当前无法兑换（额度或库存不足）。",
            "You cannot redeem this item right now (quota or stock exhausted).",
          ),
        );
        return;
      }
      setRedeeming(true);
      try {
        const r = await redeemPointsMallItem(
          member.id,
          redeemTarget.id,
          qty,
          redeemClientRequestIdRef.current || undefined,
        );
        if (!r.success) {
          const detail = redeemFailureDetail(r, t);
          setRedeemError(detail);
          toast.error(detail);
          return;
        }
        if (r.idempotent_replay) {
          toast.info(t("该兑换请求已处理过", "This redeem request was already processed"));
        } else {
          toast.success(
            t(`已兑换：${r.item?.title || redeemTarget.title}`, `Redeemed: ${r.item?.title || redeemTarget.title}`),
          );
        }
        setRedeemError(null);
        setRedeemTarget(null);
        await refreshPoints();
        void queryClient.invalidateQueries({ queryKey: memberQueryKeys.points(member.id) });
        void queryClient.invalidateQueries({ queryKey: memberQueryKeys.mall(member.id) });
        void queryClient.invalidateQueries({ queryKey: memberQueryKeys.profile(member.id) });
        void queryClient.invalidateQueries({ queryKey: memberQueryKeys.pointsBreakdown(member.id) });
        try {
          const [raw, cats] = await Promise.all([
            loadMemberPointsMallCatalog(member.id),
            loadMemberPointsMallCategories(member.id),
          ]);
          setItems(raw.map(normalizeMallItem));
          setMallCategories(Array.isArray(cats) ? cats : []);
        } catch {
          toast.warning(
            t("商城列表同步失败，请下拉刷新或稍后重试。", "Catalog sync failed. Pull to refresh or try again later."),
          );
        }
        setRedemptionsKey((k) => k + 1);
      } catch (e: unknown) {
        const msg =
          e instanceof Error && e.message.trim()
            ? e.message
            : memberPortalNetworkToastMessage(t);
        setRedeemError(msg);
        toast.error(msg);
      }
      finally { setRedeeming(false); }
    });
  }, [member, redeemTarget, redeemQty, redeemGuard, refreshPoints, queryClient, t]);

  if (!member) return null;

  return (
    <div className="member-page-enter m-page-bg relative flex min-h-full flex-col pb-24">
      <MemberPageAmbientOrbs />
      <div className="relative z-[1] flex min-h-full flex-col">
      <div className="relative px-5 pb-1 pt-7">
        <h1 className="flex items-center gap-2 text-xl font-extrabold text-[hsl(var(--pu-m-text))]">
          <Gift className="h-5 w-5 shrink-0 text-pu-gold-soft" aria-hidden />
          {t("积分商城", "Points mall")}
        </h1>
        <p className="mt-1.5 text-xs font-medium text-[hsl(var(--pu-m-text-dim))]">
          {t("用积分兑换精选好礼", "Redeem curated gifts with your points")}
        </p>
      </div>

      <MemberPortalPointsHero
        points={points}
        frozenPoints={frozenPoints}
        loading={loading}
        todayEarned={todayEarned}
        todayEarnedLoading={todayEarnedLoading}
        t={t}
      />

      <div className="mb-6 px-5">
        <div
          className="flex gap-1 rounded-xl border border-[hsl(var(--pu-m-surface-border)/0.2)] bg-[hsl(var(--pu-m-surface)/0.4)] p-1"
          role="tablist"
          aria-label={t("积分商城视图", "Points mall view")}
        >
          <button
            type="button"
            role="tab"
            aria-selected={pointsTab === "mall"}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2.5 text-sm font-bold transition motion-reduce:transition-none",
              pointsTab === "mall"
                ? "bg-pu-gold/15 text-pu-gold-soft ring-1 ring-inset ring-pu-gold/20"
                : "text-[hsl(var(--pu-m-text-dim))] hover:text-[hsl(var(--pu-m-text))]",
            )}
            onClick={() => setPointsTab("mall")}
          >
            <LayoutGrid className="h-4 w-4 shrink-0" aria-hidden />
            {t("商城", "Mall")}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={pointsTab === "history"}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2.5 text-sm font-bold transition motion-reduce:transition-none",
              pointsTab === "history"
                ? "bg-pu-gold/15 text-pu-gold-soft ring-1 ring-inset ring-pu-gold/20"
                : "text-[hsl(var(--pu-m-text-dim))] hover:text-[hsl(var(--pu-m-text))]",
            )}
            onClick={() => setPointsTab("history")}
          >
            <Clock className="h-4 w-4 shrink-0" aria-hidden />
            {t("兑换历史", "Record")}
          </button>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="member-page-body flex flex-1 flex-col">
        {pointsTab === "mall" ? (
          <>
            <div id="member-mall-catalog" className="scroll-mt-4 px-5">
              {!itemsLoading && items.length > 0 ? (
                <div
                  className="-mx-1 mb-4 flex gap-2 overflow-x-auto pb-1 pt-0.5 [scrollbar-width:thin]"
                  role="tablist"
                  aria-label={t("商品分类", "Categories")}
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={mallFilterKey === MALL_TAB_ALL}
                    className={cn(
                      "member-mall-category-tabs__btn shrink-0",
                      mallFilterKey === MALL_TAB_ALL && "member-mall-category-tabs__btn--active",
                    )}
                    onClick={() => setMallFilterKey(MALL_TAB_ALL)}
                  >
                    {t("全部", "All")}
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={mallFilterKey === MALL_TAB_POPULAR}
                    className={cn(
                      "member-mall-category-tabs__btn shrink-0",
                      mallFilterKey === MALL_TAB_POPULAR && "member-mall-category-tabs__btn--active",
                    )}
                    onClick={() => setMallFilterKey(MALL_TAB_POPULAR)}
                  >
                    {t("受欢迎的", "Popular")}
                  </button>
                  {mallCategories.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      role="tab"
                      aria-selected={mallFilterKey === c.id}
                      className={cn(
                        "member-mall-category-tabs__btn shrink-0",
                        mallFilterKey === c.id && "member-mall-category-tabs__btn--active",
                      )}
                      onClick={() => setMallFilterKey(c.id)}
                    >
                      {language === "en" ? c.name_en || c.name_zh : c.name_zh}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            {showMallSkeleton ? (
              <div className="member-mall-grid px-5">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="member-pu-product-card overflow-hidden" aria-hidden>
                    <div className="member-skeleton member-pu-product-card__media-wrap rounded-none border-0" />
                    <div className="member-pu-product-card__body">
                      <div className="member-skeleton mb-2 h-3.5 w-[88%] rounded-md" />
                      <div className="member-skeleton mx-auto mb-2 h-2.5 w-[55%] rounded-md" />
                      <div className="member-skeleton h-9 w-full rounded-xl" />
                    </div>
                  </div>
                ))}
              </div>
            ) : items.length === 0 ? (
              <div className="px-5">
                <div className="rounded-2xl border border-dashed border-[hsl(var(--pu-m-surface-border)/0.35)] bg-[hsl(var(--pu-m-surface)/0.35)] px-5 py-12 text-center">
                  <div className="relative">
                    <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-[hsl(var(--pu-m-surface-border)/0.25)] bg-[hsl(var(--pu-m-surface)/0.5)] text-[hsl(var(--pu-m-text-dim))]">
                      <ShoppingCart className="h-7 w-7" strokeWidth={1.75} aria-hidden />
                    </div>
                    <p className="m-0 text-sm font-semibold text-[hsl(var(--pu-m-text))]">
                      {catalogError
                        ? t("商品列表加载失败", "Failed to load catalog")
                        : t("暂无可兑换商品", "No redeemable items yet")}
                    </p>
                    <p className="mt-1.5 text-[11px] leading-relaxed text-[hsl(var(--pu-m-text-dim)/0.65)]">
                      {catalogError
                        ? t("可点击重试重新加载，或下拉刷新整页数据。", "Tap retry to reload, or pull down to refresh.")
                        : t("管理员上架商品后将显示在此。", "Items will appear here once admins publish them.")}
                    </p>
                    {!catalogError ? (
                      <MemberEmptyStateCta
                        primary={{ to: ROUTES.MEMBER.SPIN, label: t("抽奖赚积分", "Win points on wheel") }}
                        secondary={{ to: ROUTES.MEMBER.DASHBOARD, label: t("回首页看看", "Back to Home") }}
                      />
                    ) : null}
                    {catalogError ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="mt-4 border-[hsl(var(--pu-m-surface-border)/0.35)] bg-[hsl(var(--pu-m-surface)/0.35)] text-[hsl(var(--pu-m-text))] hover:bg-[hsl(var(--pu-m-surface)/0.55)]"
                        disabled={itemsLoading}
                        onClick={() => {
                          setCatalogError(false);
                          setCatalogRetryKey((k) => k + 1);
                        }}
                      >
                        {itemsLoading ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
                            {t("加载中…", "Loading…")}
                          </>
                        ) : (
                          t("重试", "Retry")
                        )}
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="px-5 pb-6 text-center">
                <p className="m-0 text-sm text-[hsl(var(--pu-m-text-dim)/0.85)]">
                  {t("该分类下暂无商品", "No items in this category")}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-4 border-[hsl(var(--pu-m-surface-border)/0.35)] bg-[hsl(var(--pu-m-surface)/0.35)] text-[hsl(var(--pu-m-text))]"
                  onClick={() => setMallFilterKey(MALL_TAB_ALL)}
                >
                  {t("查看全部商品", "View all items")}
                </Button>
              </div>
            ) : (
              <div className="member-mall-grid px-5">
                {filteredItems.map((p) => {
                  const soldOut = p.stock_remaining === 0;
                  const maxR = redeemableMaxQty(p);
                  const canRedeem = !hasFrozen && maxR >= 1 && points >= p.points_cost && (p.stock_remaining === -1 || p.stock_remaining > 0);
                  const deficit = p.points_cost - points;
                  const lowStock = p.stock_remaining > 0 && p.stock_remaining <= 5;
                  const redeemLabel = soldOut
                    ? t("售罄", "Sold out")
                    : hasFrozen
                      ? t("冻结中", "Frozen")
                      : maxR < 1
                        ? t("已达上限", "Limit reached")
                        : canRedeem
                          ? t("兑换", "Redeem")
                          : t(`还差 ${deficit} 积分`, `Need ${deficit} pts`);
                  const cornerTL: MemberPointsMallProductCornerTL = soldOut
                    ? "soldout"
                    : lowStock
                      ? "lowstock"
                      : "none";
                  const pop = num(p.tenant_redeem_qty, 0);
                  const cornerTR: MemberPointsMallProductCornerTR =
                    !soldOut && mallFilterKey === MALL_TAB_POPULAR && pop > 0 ? "hot" : "none";
                  return (
                    <MemberPointsMallProductCard
                      key={p.id}
                      product={p}
                      memberPoints={points}
                      themeColor={themeColor}
                      cornerTL={cornerTL}
                      cornerTR={cornerTR}
                      soldOut={soldOut}
                      maxR={maxR}
                      canRedeem={canRedeem}
                      deficit={deficit}
                      redeemLabel={redeemLabel}
                      redeeming={redeeming}
                      isRedeemTarget={redeemTarget?.id === p.id}
                      t={t}
                      showDescription
                      stockLine={stockLabel(p.stock_remaining, t)}
                      onRedeem={() => {
                        if (!canRedeem || soldOut || maxR < 1) return;
                        redeemClientRequestIdRef.current =
                          typeof crypto !== "undefined" && "randomUUID" in crypto
                            ? (crypto.randomUUID() as string).replace(/-/g, "")
                            : `r_${Date.now()}_${Math.random().toString(36).slice(2, 14)}`;
                        setRedeemTarget(p);
                        setRedeemQty(1);
                      }}
                    />
                  );
                })}
              </div>
            )}
          </>
        ) : (
          <div className="px-5 pb-10" role="tabpanel">
            <div className="mb-3 flex items-center gap-2">
              <div className="h-5 w-1 rounded-full bg-pu-gold" aria-hidden />
              <h2 className="m-0 text-base font-extrabold text-[hsl(var(--pu-m-text))]">
                {t("兑换历史", "Record")}
              </h2>
            </div>
            <p className="mb-4 text-[11px] leading-relaxed text-[hsl(var(--pu-m-text-dim)/0.78)]">
              {t(
                `最近 ${REDEMPTION_HISTORY_LIMIT} 条积分商城兑换记录（含待审核、已完成、已驳回）`,
                `Latest ${REDEMPTION_HISTORY_LIMIT} points mall redemptions (pending, completed, or rejected).`,
              )}
            </p>
            <MemberRedemptionHistoryFeed
              memberId={member.id}
              refreshKey={redemptionsKey}
              pullRefreshSignal={pullNonce}
              t={t}
            />
          </div>
        )}
      </div>

        <DrawerDetail
          open={!!redeemTarget}
          onOpenChange={(open) => {
            if (!open) setRedeemTarget(null);
          }}
          variant="member"
          title={
            redeemTarget?.title ??
            t("安全兑换", "Secure redemption")
          }
          description={t(
            "确认数量 · 提交后扣积分 · 自助礼遇商城",
            "Confirm quantity · points deduct on submit · self-service mall",
          )}
          sheetMaxWidth="2xl"
          sheetContentProps={{ className: "member-redeem-drawer" }}
        >
          {redeemTarget && (() => {
            const perOrder = Math.max(1, num(redeemTarget.per_order_limit, 1));
            const dailyLim = num(redeemTarget.per_user_daily_limit, 0);
            const lifeLim = num(redeemTarget.per_user_lifetime_limit, 0);
            const usedDay = num(redeemTarget.used_today, 0);
            const usedLife = num(redeemTarget.used_lifetime, 0);
            const dailyLeft = dailyLim > 0 ? Math.max(0, dailyLim - usedDay) : 999999;
            const lifeLeft = lifeLim > 0 ? Math.max(0, lifeLim - usedLife) : 999999;
            const stockRem = redeemTarget.stock_remaining;
            const stockCap = stockRem < 0 ? 999999 : num(stockRem, 0);
            const maxQtyAllowed = Math.min(perOrder, stockCap, dailyLeft, lifeLeft);
            const maxQty = Math.max(0, maxQtyAllowed);
            const qtySafe = maxQty < 1 ? 0 : Math.max(1, Math.min(Number(redeemQty || 1), maxQty));
            const totalCost = (redeemTarget.points_cost || 0) * qtySafe;
            const affordable = totalCost <= points;
            const dailyLine =
              dailyLim <= 0
                ? redeemDailyUnlimitedLine
                : t(
                    `每日上限 ${dailyLim} · 今日已兑 ${usedDay} · 今日剩余 ${dailyLeft}`,
                    `Daily limit: ${dailyLim} · redeemed ${usedDay} today · ${dailyLeft} left today`,
                  );
            const lifeLine =
              lifeLim <= 0
                ? redeemLifetimeUnlimitedLine
                : t(
                    `终身上限 ${lifeLim} · 累计已兑 ${usedLife} · 剩余 ${lifeLeft}`,
                    `Lifetime limit: ${lifeLim} · redeemed ${usedLife} total · ${lifeLeft} left`,
                  );
            return (
              <div className="member-redeem-vault">
                {redeemError ? (
                  <Alert
                    variant="destructive"
                    className="relative border-red-500/45 bg-red-950/45 pr-10 text-red-50"
                  >
                    <AlertTitle className="text-red-100">{t("兑换失败", "Redeem failed")}</AlertTitle>
                    <AlertDescription className="text-red-100/90">{redeemError}</AlertDescription>
                    <button
                      type="button"
                      className="absolute right-3 top-3 rounded-md p-1 text-red-200/90 transition-colors motion-reduce:transition-none hover:bg-red-500/25 hover:text-red-50"
                      onClick={() => setRedeemError(null)}
                      aria-label={t("关闭", "Dismiss")}
                    >
                      <X className="h-4 w-4" aria-hidden />
                    </button>
                  </Alert>
                ) : null}
                <div className="member-redeem-vault__product member-redeem-product-row flex items-start gap-3.5">
                  {redeemDrawerImg.usePlaceholder ? (
                    <div className="flex h-[88px] w-[88px] shrink-0 items-center justify-center rounded-xl border border-[hsl(var(--pu-m-surface-border)/0.22)] bg-[hsl(var(--pu-m-surface)/0.38)]">
                      <ShoppingCart className="h-8 w-8 text-[hsl(var(--pu-m-text-dim)/0.45)]" strokeWidth={1.5} aria-hidden />
                    </div>
                  ) : (
                    <img
                      src={redeemDrawerImg.resolvedSrc}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      onError={redeemDrawerImg.onImageError}
                      className="h-[88px] w-[88px] shrink-0 rounded-xl border border-[hsl(var(--pu-m-surface-border)/0.28)] object-cover"
                    />
                  )}
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <h3 className="m-0 break-words text-[17px] font-extrabold leading-tight tracking-tight text-[hsl(var(--pu-m-text))]">
                      {redeemTarget.title}
                    </h3>
                    <div
                      className={cn(
                        "member-redeem-product-desc m-0 max-h-[132px] overflow-y-auto whitespace-pre-wrap break-words text-[13px] leading-[1.55]",
                        redeemTarget.description?.trim()
                          ? "text-[hsl(var(--pu-m-text-dim)/0.88)] not-italic"
                          : "text-[hsl(var(--pu-m-text-dim)/0.42)] italic",
                      )}
                    >
                      {redeemTarget.description?.trim() || t("暂无商品说明", "No description")}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-2">
                      <span className="rounded-full bg-[hsl(var(--pu-m-surface)/0.5)] px-2.5 py-0.5 text-[11px] text-[hsl(var(--pu-m-text-dim)/0.88)]">
                        {t(
                          `每件 ${redeemTarget.points_cost} 积分`,
                          `${redeemTarget.points_cost} pts each`,
                        )}
                      </span>
                      <span
                        className={cn(
                          "rounded-full bg-[hsl(var(--pu-m-surface)/0.5)] px-2.5 py-0.5 text-[11px]",
                          stockRem === 0 ? "text-pu-rose-soft" : "text-[hsl(var(--pu-m-text-dim)/0.88)]",
                        )}
                      >
                        {stockRem < 0 ? t("库存：不限", "Stock: unlimited") : t(`库存：${stockRem}`, `Stock: ${stockRem}`)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="member-redeem-vault__rules">
                  <p className="member-redeem-vault__rules-title">{redeemRulesTitle}</p>
                  <p className="member-redeem-vault__rules-line">
                    {t("单笔最多", "Max per order")}: {perOrder}
                  </p>
                  <p className="member-redeem-vault__rules-line">{dailyLine}</p>
                  <p className="member-redeem-vault__rules-line">{lifeLine}</p>
                  {maxQty < 1 ? (
                    <p className="mt-2.5 text-xs font-semibold leading-snug text-pu-gold-soft">
                      {t(
                        "当前无法兑换（已达每日/终身上限或库存不足）。可改日再试或选择其它商品。",
                        "You cannot redeem this item now (daily/lifetime quota or stock exhausted). Try another day or another item.",
                      )}
                    </p>
                  ) : null}
                </div>

                <div className="member-redeem-vault__settlement">
                  <div className="mb-3 flex items-center justify-between">
                    <Label
                      htmlFor="member-points-redeem-qty"
                      className="text-[13px] font-medium text-[hsl(var(--pu-m-text)/0.88)]"
                    >
                      {t("数量", "Quantity")}
                    </Label>
                    <Input
                      id="member-points-redeem-qty"
                      name="redeem_quantity"
                      type="number"
                      inputMode="numeric"
                      autoComplete="off"
                      aria-label={t("兑换数量", "Redeem quantity")}
                      min={maxQty < 1 ? 0 : 1}
                      max={maxQty < 1 ? 0 : maxQty}
                      value={maxQty < 1 ? 0 : redeemQty}
                      onChange={(e) => {
                        const raw = e.target.value;
                        const n = raw === "" ? 1 : Number(raw);
                        setRedeemQty(
                          Math.max(1, Math.min(Number.isFinite(n) ? n : 1, Math.max(1, maxQty))),
                        );
                      }}
                      disabled={maxQty < 1}
                      className="h-9 w-[100px] rounded-xl border border-[hsl(var(--pu-m-surface-border)/0.35)] bg-[hsl(var(--pu-m-bg-1)/0.72)] text-center text-sm text-[hsl(var(--pu-m-text))] tabular-nums focus-visible:border-pu-gold/55 focus-visible:ring-pu-gold/20"
                    />
                  </div>
                  <div className="flex items-baseline justify-between border-t border-[hsl(var(--pu-m-surface-border)/0.2)] pt-3">
                    <span className="text-[13px] text-[hsl(var(--pu-m-text)/0.88)]">
                      {t("所需积分", "Points required")}
                    </span>
                    <span
                      className={cn(
                        "text-xl font-extrabold tabular-nums",
                        affordable ? "text-pu-gold-soft" : "text-pu-rose-soft",
                      )}
                    >
                      {totalCost}
                    </span>
                  </div>
                  <div className="mt-1 flex items-baseline justify-between">
                    <span className="text-[11px] text-[hsl(var(--pu-m-text-dim)/0.55)]">
                      {t("当前余额", "Your balance")}
                    </span>
                    <span className="text-[13px] font-semibold text-[hsl(var(--pu-m-text-dim)/0.72)]">{points}</span>
                  </div>
                  {!affordable && maxQty >= 1 && (
                    <p className="mt-2 text-xs font-medium text-pu-rose-soft">
                      {t(
                        `积分不足，还差 ${totalCost - points}。`,
                        `Not enough points — need ${totalCost - points} more.`,
                      )}
                    </p>
                  )}
                </div>

                <p className="member-redeem-vault__hint">
                  {t(
                    "加密会话 · 确认后兑换即生效",
                    "Encrypted session · redemption is final once confirmed",
                  )}
                </p>

                <div className="flex flex-wrap justify-end gap-2 border-t border-[hsl(var(--pu-m-surface-border)/0.2)] pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    className="rounded-xl border-[hsl(var(--pu-m-surface-border)/0.35)] bg-transparent text-[hsl(var(--pu-m-text))] hover:bg-[hsl(var(--pu-m-surface)/0.45)]"
                    onClick={() => setRedeemTarget(null)}
                  >
                    {t("取消", "Cancel")}
                  </Button>
                  <Button
                    type="button"
                    size="lg"
                    disabled={(() => {
                      const perOrder = Math.max(1, num(redeemTarget.per_order_limit, 1));
                      const dailyLim = num(redeemTarget.per_user_daily_limit, 0);
                      const lifeLim = num(redeemTarget.per_user_lifetime_limit, 0);
                      const usedDay = num(redeemTarget.used_today, 0);
                      const usedLife = num(redeemTarget.used_lifetime, 0);
                      const dailyLeft = dailyLim > 0 ? Math.max(0, dailyLim - usedDay) : 999999;
                      const lifeLeft = lifeLim > 0 ? Math.max(0, lifeLim - usedLife) : 999999;
                      const stockRem = redeemTarget.stock_remaining;
                      const stockCap = stockRem < 0 ? 999999 : num(stockRem, 0);
                      const maxQ = Math.max(0, Math.min(perOrder, stockCap, dailyLeft, lifeLeft));
                      if (maxQ < 1) return true;
                      const q = Math.max(1, Math.min(Number(redeemQty || 1), maxQ));
                      const cost = (redeemTarget.points_cost || 0) * q;
                      return cost > points || redeeming;
                    })()}
                    className="rounded-xl border-0 font-bold text-[hsl(var(--pu-primary-foreground))] hover:opacity-95 disabled:opacity-50"
                    style={{
                      background: "linear-gradient(135deg, hsl(var(--pu-gold)), hsl(var(--pu-gold-soft)))",
                      boxShadow: "0 8px 24px hsl(var(--pu-gold) / 0.25)",
                    }}
                    onClick={() => void handleRedeem()}
                  >
                    {redeeming ? (
                      <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
                    ) : null}
                    {t("确认兑换", "Confirm redemption")}
                  </Button>
                </div>
              </div>
            );
          })()}
        </DrawerDetail>
      </div>
    </div>
  );
}
