/**
 * MemberWallet — 余额取 `wallet_balance`，冻结积分取 points_accounts，
 * 交易活动取真实订单（member_get_orders RPC），无演示数据。
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Wallet,
  ArrowUpRight,
  ArrowDownLeft,
  TrendingUp,
  CheckCircle,
  Clock,
  AlertCircle,
  Loader2,
  ChevronDown,
} from "lucide-react";
import { notifyInfo } from "@/utils/notify";
import { LoadingButton } from "@/components/ui/LoadingButton";
import BackHeader from "@/components/member/BackHeader";
import { MemberPageAmbientOrbs } from "@/components/member/MemberPageAmbientOrbs";
import { MemberPageLoadingShell } from "@/components/member/MemberPageLoadingShell";
import { ListSkeleton } from "@/components/member/MemberSkeleton";
import { useMemberAuth } from "@/contexts/MemberAuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { Navigate } from "react-router-dom";
import { ROUTES } from "@/routes/constants";
import { useMemberAnimatedCount } from "@/hooks/useMemberAnimatedCount";
import { MEMBER_SKELETON_MIN_MS } from "@/lib/memberPortalUx";
import { MemberEmptyStateCta } from "@/components/member/MemberEmptyStateCta";
import { useMemberPullRefreshSignal } from "@/hooks/useMemberPullRefreshSignal";
import { useMemberPointsBreakdown } from "@/hooks/useMemberPointsBreakdown";
import { memberGetOrdersPage } from "@/services/memberPortal/memberActivityService";
import { mapDbRowToMemberPortalOrderView, type MemberPortalOrderView } from "@/hooks/orders/utils";
import { resolveCardName, tryRecoverMisdecodedUtf8 } from "@/services/members/nameResolver";

const ORDER_PAGE_SIZE = 20;
const FILTER_KEYS = ["all", "completed", "active"] as const;
type OrderFilter = (typeof FILTER_KEYS)[number];

export default function MemberWallet() {
  const { member, refreshMember } = useMemberAuth();
  const { t } = useLanguage();
  const memberId = member?.id;
  const [activeFilter, setActiveFilter] = useState<OrderFilter>("all");
  const [loading, setLoading] = useState(true);
  const [depositBusy, setDepositBusy] = useState(false);
  const [withdrawBusy, setWithdrawBusy] = useState(false);

  const [orders, setOrders] = useState<MemberPortalOrderView[]>([]);
  const [ordersTotal, setOrdersTotal] = useState(0);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const { breakdown: ptsBd } = useMemberPointsBreakdown(memberId);

  useEffect(() => {
    const id = window.setTimeout(() => setLoading(false), MEMBER_SKELETON_MIN_MS);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    if (!memberId) return;
    let cancelled = false;
    setOrdersLoading(true);
    void (async () => {
      try {
        const { rows, total } = await memberGetOrdersPage(memberId, ORDER_PAGE_SIZE, 0);
        if (cancelled) return;
        setOrders(rows.map((r) => mapDbRowToMemberPortalOrderView(r as Record<string, unknown>)));
        setOrdersTotal(total);
      } finally {
        if (!cancelled) setOrdersLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [memberId]);

  const loadMore = useCallback(async () => {
    if (!memberId || loadingMore || orders.length >= ordersTotal) return;
    setLoadingMore(true);
    try {
      const { rows, total } = await memberGetOrdersPage(memberId, ORDER_PAGE_SIZE, orders.length);
      setOrders((prev) => [...prev, ...rows.map((r) => mapDbRowToMemberPortalOrderView(r as Record<string, unknown>))]);
      setOrdersTotal(total);
    } finally {
      setLoadingMore(false);
    }
  }, [memberId, loadingMore, orders.length, ordersTotal]);

  useMemberPullRefreshSignal(() => {
    if (!memberId) return;
    void refreshMember();
    setOrdersLoading(true);
    void (async () => {
      try {
        const { rows, total } = await memberGetOrdersPage(memberId, ORDER_PAGE_SIZE, 0);
        setOrders(rows.map((r) => mapDbRowToMemberPortalOrderView(r as Record<string, unknown>)));
        setOrdersTotal(total);
      } finally {
        setOrdersLoading(false);
      }
    })();
  });

  const walletBalanceRaw = Number(member?.wallet_balance) || 0;
  const frozenPoints = ptsBd.frozen_points;
  const walletAnimOn = Boolean(member) && !loading;
  const animWalletBalance = useMemberAnimatedCount(walletBalanceRaw, { enabled: walletAnimOn, durationMs: 900 });
  const animFrozen = useMemberAnimatedCount(frozenPoints, { enabled: walletAnimOn, durationMs: 700 });

  const completedOrders = useMemo(() => orders.filter((o) => o.status === "completed"), [orders]);
  const completedTotal = useMemo(() => completedOrders.reduce((s, o) => s + (Number(o.amount) || 0), 0), [completedOrders]);
  const animCompletedTotal = useMemberAnimatedCount(completedTotal, { enabled: walletAnimOn, durationMs: 780 });

  const filtered = activeFilter === "all" ? orders : orders.filter((o) => o.status === activeFilter);
  const hasMore = activeFilter === "all" && orders.length < ordersTotal;

  if (!member) return <Navigate to={ROUTES.MEMBER.ROOT} replace />;

  if (loading) {
    return (
      <MemberPageLoadingShell title={t("我的钱包", "My wallet")}>
        <ListSkeleton rows={6} />
      </MemberPageLoadingShell>
    );
  }

  const filterLabel = (key: OrderFilter) => {
    const m: Record<OrderFilter, [string, string]> = {
      all: ["全部", "All"],
      completed: ["已完成", "Completed"],
      active: ["进行中", "In progress"],
    };
    return t(m[key][0], m[key][1]);
  };

  return (
    <div className="m-page-bg relative min-h-screen pb-24">
      <BackHeader title={t("我的钱包", "My wallet")} />

      <div className="relative overflow-hidden">
        <MemberPageAmbientOrbs />
        <div className="relative z-[1] px-5 pb-6 pt-8">
          <div className="mb-6 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-pu-gold to-pu-gold-soft shadow-pu-glow-gold">
              <Wallet className="h-4 w-4 text-[hsl(var(--pu-primary-foreground))]" aria-hidden />
            </div>
            <h1 className="text-xl font-extrabold text-[hsl(var(--pu-m-text))]">{t("我的钱包", "My wallet")}</h1>
          </div>

          <div
            className="m-glass relative overflow-hidden p-6"
            style={{ borderColor: "hsl(var(--pu-gold) / 0.15)" }}
          >
            <div
              className="pointer-events-none absolute inset-0 rounded-[inherit] bg-gradient-to-br from-pu-gold/[0.06] to-pu-emerald/[0.04]"
              aria-hidden
            />
            <div className="relative">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-sm font-bold text-[hsl(var(--pu-m-text-dim))]">{t("可用余额", "Available")}</span>
                <span className="rounded-full bg-[hsl(var(--pu-m-surface)/0.6)] px-2.5 py-0.5 text-[10px] font-bold text-[hsl(var(--pu-m-text-dim))]">
                  {t("冻结积分", "Frozen")}: {animFrozen.toFixed(0)}
                </span>
              </div>
              <div className="num-display-xl mb-5 bg-gradient-to-r from-[hsl(var(--pu-m-text))] to-[hsl(var(--pu-m-text)/0.7)] bg-clip-text text-transparent tabular-nums">
                ${animWalletBalance.toFixed(2)}
              </div>

              <div className="mb-5 grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-[hsl(var(--pu-m-surface-border)/0.3)] bg-[hsl(var(--pu-m-surface)/0.6)] p-3.5">
                  <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.15em] text-[hsl(var(--pu-m-text-dim))]">
                    {t("已完成交易额", "Completed value")}
                  </div>
                  <div className="text-lg font-extrabold text-pu-emerald-soft tabular-nums">
                    ${Math.round(animCompletedTotal).toLocaleString()}
                  </div>
                </div>
                <div className="rounded-xl border border-[hsl(var(--pu-m-surface-border)/0.3)] bg-[hsl(var(--pu-m-surface)/0.6)] p-3.5">
                  <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.15em] text-[hsl(var(--pu-m-text-dim))]">
                    {t("已完成笔数", "Completed orders")}
                  </div>
                  <div className="text-lg font-extrabold text-pu-gold-soft tabular-nums">
                    {completedOrders.length}
                    {ordersTotal > orders.length && <span className="text-xs opacity-50">+</span>}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <LoadingButton
                  type="button"
                  loading={depositBusy}
                  className="flex items-center justify-center gap-2 rounded-xl border-0 py-3.5 text-sm font-bold transition-all motion-reduce:transition-none motion-reduce:active:scale-100 active:scale-95 [&_svg]:text-[hsl(var(--pu-m-bg-1))]"
                  style={{
                    background: "linear-gradient(135deg, hsl(var(--pu-emerald)), hsl(var(--pu-emerald-soft)))",
                    color: "hsl(var(--pu-m-bg-1))",
                    boxShadow: "0 4px 16px -4px hsl(var(--pu-emerald) / 0.4)",
                  }}
                  onClick={() => {
                    if (depositBusy) return;
                    setDepositBusy(true);
                    notifyInfo(t("充值功能即将上线", "Deposit — coming soon"));
                    window.setTimeout(() => setDepositBusy(false), 450);
                  }}
                >
                  <ArrowDownLeft className="h-4 w-4" aria-hidden />
                  {t("充值", "Deposit")}
                </LoadingButton>
                <LoadingButton
                  type="button"
                  loading={withdrawBusy}
                  variant="outline"
                  className="flex items-center justify-center gap-2 rounded-xl border border-[hsl(var(--pu-m-surface-border)/0.4)] bg-[hsl(var(--pu-m-surface)/0.7)] py-3.5 text-sm font-bold text-[hsl(var(--pu-m-text))] transition-all motion-reduce:transition-none motion-reduce:active:scale-100 hover:border-pu-gold/30 hover:bg-[hsl(var(--pu-m-surface)/0.7)] active:scale-95"
                  onClick={() => {
                    if (withdrawBusy) return;
                    setWithdrawBusy(true);
                    notifyInfo(t("提现功能即将上线", "Withdraw — coming soon"));
                    window.setTimeout(() => setWithdrawBusy(false), 450);
                  }}
                >
                  <ArrowUpRight className="h-4 w-4 text-pu-gold-soft" aria-hidden />
                  {t("提现", "Withdraw")}
                </LoadingButton>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Transaction list from real orders */}
      <div className="px-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-base font-extrabold text-[hsl(var(--pu-m-text))]">
            <TrendingUp className="h-4 w-4 text-[hsl(var(--pu-m-text-dim))]" aria-hidden />
            {t("交易活动", "Activity")}
          </h2>
          {ordersTotal > 0 && (
            <span className="text-[10px] font-bold text-[hsl(var(--pu-m-text-dim)/0.7)]">
              {orders.length}/{ordersTotal}
            </span>
          )}
        </div>

        <div className="scrollbar-hide mb-4 flex gap-2 overflow-x-auto pb-3">
          {FILTER_KEYS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setActiveFilter(f)}
              aria-pressed={activeFilter === f}
              className={`shrink-0 rounded-full px-4 py-1.5 text-xs font-bold transition-all duration-200 motion-reduce:transition-none ${
                activeFilter === f
                  ? "bg-pu-gold/15 text-pu-gold-soft ring-1 ring-inset ring-pu-gold/25"
                  : "border border-[hsl(var(--pu-m-surface-border)/0.2)] bg-[hsl(var(--pu-m-surface)/0.4)] text-[hsl(var(--pu-m-text-dim))] hover:text-[hsl(var(--pu-m-text))]"
              }`}
            >
              {filterLabel(f)}
            </button>
          ))}
        </div>

        {ordersLoading && orders.length === 0 ? (
          <ListSkeleton rows={4} />
        ) : (
          <div className="space-y-2">
            {filtered.map((o) => {
              const cardLabel = tryRecoverMisdecodedUtf8(resolveCardName(o.giftCardName, o.orderType) || o.orderType || "—");
              const amt = Number(o.amount) || 0;
              return (
                <div
                  key={o.id}
                  className="m-glass flex items-center gap-3 rounded-2xl px-4 py-3.5 transition motion-reduce:transition-none hover:bg-[hsl(var(--pu-m-surface)/0.4)]"
                >
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                    o.status === "completed" ? "bg-pu-emerald/10" : "bg-pu-gold/10"
                  }`}>
                    {o.status === "completed" ? (
                      <CheckCircle className="h-4 w-4 text-pu-emerald-soft" aria-hidden />
                    ) : (
                      <Clock className="h-4 w-4 text-pu-gold-soft" aria-hidden />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-[hsl(var(--pu-m-text))]">{cardLabel}</span>
                    <span className="text-[10px] text-[hsl(var(--pu-m-text-dim))]">{o.createdAt?.slice(0, 16).replace("T", " ") || "—"}</span>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className={`block text-sm font-extrabold tabular-nums ${amt > 0 ? "text-pu-emerald-soft" : "text-[hsl(var(--pu-m-text))]"}`}>
                      ${amt.toFixed(2)}
                    </span>
                    <span className={`text-[10px] font-bold ${
                      o.status === "completed"
                        ? "text-pu-emerald/70"
                        : "text-pu-gold/70"
                    }`}>
                      {o.status === "completed" ? t("已完成", "Done") : t("进行中", "Active")}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {hasMore && (
          <button
            type="button"
            onClick={() => void loadMore()}
            disabled={loadingMore}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-[hsl(var(--pu-m-surface-border)/0.3)] bg-[hsl(var(--pu-m-surface)/0.5)] py-3 text-xs font-bold text-[hsl(var(--pu-m-text-dim))] transition-all hover:bg-[hsl(var(--pu-m-surface)/0.7)] active:scale-95 disabled:opacity-60"
          >
            {loadingMore ? (
              <><Loader2 className="h-4 w-4 animate-spin" aria-hidden />{t("加载中…", "Loading…")}</>
            ) : (
              <><ChevronDown className="h-4 w-4" aria-hidden />{t(`加载更多（${orders.length}/${ordersTotal}）`, `Load more (${orders.length}/${ordersTotal})`)}</>
            )}
          </button>
        )}

        {!ordersLoading && filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[hsl(var(--pu-m-surface-border)/0.45)] bg-[hsl(var(--pu-m-surface)/0.18)] px-4 py-12 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[hsl(var(--pu-m-surface)/0.45)] text-[hsl(var(--pu-m-text-dim)/0.35)]">
              <AlertCircle className="h-7 w-7" aria-hidden />
            </div>
            <p className="text-sm font-semibold text-[hsl(var(--pu-m-text))]">{t("暂无交易记录", "No transactions")}</p>
            <MemberEmptyStateCta
              primary={{ to: ROUTES.MEMBER.DASHBOARD, label: t("回首页", "Home") }}
              secondary={{ to: ROUTES.MEMBER.SETTINGS, label: t("账户设置", "Account") }}
            />
          </div>
        ) : null}
      </div>

      <div className="h-8" />
    </div>
  );
}
