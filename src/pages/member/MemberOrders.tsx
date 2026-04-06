/**
 * 会员订单页 — UI 对齐 premium-ui-boost；列表为分页接口 memberGetOrdersPage（缓存键 ordersPaged，与设置页全量 orders 键分离）。
 */
import { useState, useMemo, useCallback } from "react";
import { Link, NavLink } from "react-router-dom";
import { ChevronDown, Gift, Loader2, ArrowLeftRight, LayoutGrid, Clock } from "lucide-react";
import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";
import BackHeader from "@/components/member/BackHeader";
import { ListSkeleton } from "@/components/member/MemberSkeleton";
import { useLanguage } from "@/contexts/LanguageContext";
import { useMemberAuth } from "@/contexts/MemberAuthContext";
import { ROUTES } from "@/routes/constants";
import "@/styles/member-portal.css";
import { MemberPageAmbientOrbs } from "@/components/member/MemberPageAmbientOrbs";
import { MemberPageLoadingShell } from "@/components/member/MemberPageLoadingShell";
import { memberGetOrdersPage } from "@/services/memberPortal/memberActivityService";
import { mapDbRowToMemberPortalOrderView, type MemberPortalOrderView } from "@/hooks/orders/utils";
import { memberQueryKeys } from "@/lib/memberQueryKeys";
import { resolveCardName, tryRecoverMisdecodedUtf8 } from "@/services/members/nameResolver";
import { cn } from "@/lib/utils";
import { MemberEmptyStateCta } from "@/components/member/MemberEmptyStateCta";
import { useMemberPullRefreshSignal } from "@/hooks/useMemberPullRefreshSignal";

const ORDER_PAGE_SIZE = 20;

type OrderStatusFilter = "all" | "completed" | "active";

export default function MemberOrders() {
  const { t } = useLanguage();
  const { member } = useMemberAuth();
  const memberId = member?.id;

  const {
    data,
    isLoading,
    isError,
    refetch,
    isFetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: memberId ? memberQueryKeys.ordersPaged(memberId) : ["member", "ordersPaged", "__none"],
    queryFn: async ({ pageParam }) => {
      if (!memberId) return { rows: [] as MemberPortalOrderView[], total: 0 };
      const { rows, total } = await memberGetOrdersPage(memberId, ORDER_PAGE_SIZE, pageParam);
      const mapped = rows.map((r) => mapDbRowToMemberPortalOrderView(r as Record<string, unknown>));
      return { rows: mapped, total };
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((acc, p) => acc + p.rows.length, 0);
      if (lastPage.rows.length === 0 || loaded >= lastPage.total) return undefined;
      return loaded;
    },
    enabled: !!memberId,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  const orders = useMemo(() => data?.pages.flatMap((p) => p.rows) ?? [], [data?.pages]);

  const ordersTotal = useMemo(() => data?.pages[0]?.total ?? 0, [data?.pages]);

  const [activeFilter, setActiveFilter] = useState<OrderStatusFilter>("all");
  const [expandedId, setExpandedId] = useState<string | null>("__list__");

  const statusFilters: Array<{ key: OrderStatusFilter; label: string }> = [
    { key: "all", label: t("全部", "All") },
    { key: "completed", label: t("已支付", "Paid") },
    { key: "active", label: t("待处理", "Pending") },
  ];

  const filtered = useMemo(() => {
    if (activeFilter === "all") return orders;
    return orders.filter((o) => (activeFilter === "completed" ? o.status === "completed" : o.status === "active"));
  }, [orders, activeFilter]);

  const hasMore = useMemo(
    () => activeFilter === "all" && Boolean(hasNextPage),
    [activeFilter, hasNextPage],
  );

  const loadMore = useCallback(() => {
    if (!memberId || !hasNextPage || isFetchingNextPage) return;
    void fetchNextPage();
  }, [memberId, hasNextPage, isFetchingNextPage, fetchNextPage]);

  useMemberPullRefreshSignal(() => {
    if (!memberId) return;
    void refetch();
  });

  const handleFilterChange = (key: OrderStatusFilter) => {
    setActiveFilter(key);
  };

  if (isLoading) {
    return (
      <MemberPageLoadingShell title={t("订单管理", "Orders")}>
        <ListSkeleton rows={6} />
      </MemberPageLoadingShell>
    );
  }

  return (
    <div className="m-page-bg relative min-h-screen pb-24">
      <BackHeader title={t("订单管理", "Orders")} />

      <div className="relative z-[2] mb-4 px-5 pt-2">
        <div className="flex gap-1 rounded-xl border border-[hsl(var(--pu-m-surface-border)/0.2)] bg-[hsl(var(--pu-m-surface)/0.4)] p-1">
          <NavLink
            to={ROUTES.MEMBER.POINTS}
            end
            className={({ isActive }) =>
              cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2.5 text-sm font-bold no-underline transition motion-reduce:transition-none",
                isActive
                  ? "bg-pu-gold/15 text-pu-gold-soft ring-1 ring-inset ring-pu-gold/20"
                  : "text-[hsl(var(--pu-m-text-dim))] hover:text-[hsl(var(--pu-m-text))]",
              )
            }
          >
            <LayoutGrid className="h-4 w-4 shrink-0" aria-hidden />
            {t("商城", "Mall")}
          </NavLink>
          <NavLink
            to={ROUTES.MEMBER.ORDERS}
            className={({ isActive }) =>
              cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2.5 text-sm font-bold no-underline transition motion-reduce:transition-none",
                isActive
                  ? "bg-pu-gold/15 text-pu-gold-soft ring-1 ring-inset ring-pu-gold/20"
                  : "text-[hsl(var(--pu-m-text-dim))] hover:text-[hsl(var(--pu-m-text))]",
              )
            }
          >
            <Clock className="h-4 w-4 shrink-0" aria-hidden />
            {t("兑换记录", "Record")}
          </NavLink>
        </div>
      </div>

      <div className="relative overflow-hidden">
        <MemberPageAmbientOrbs />
        <div className="relative z-[1] mb-4 px-5 pt-1">
          {isError ? (
            <p className="text-[11px] leading-relaxed text-[hsl(var(--pu-m-text-dim))]">
              <span className="text-rose-400">{t("订单加载失败。", "Failed to load orders.")}</span>{" "}
              <button
                type="button"
                onClick={() => void refetch()}
                className="font-bold text-pu-gold-soft underline-offset-2 hover:underline"
              >
                {t("重试", "Retry")}
              </button>
              <span className="text-[hsl(var(--pu-m-text-dim)/0.65)]">
                {" · "}
                <Link
                  to={`${ROUTES.MEMBER.SETTINGS}#orders`}
                  className="font-bold text-pu-gold-soft/90 underline-offset-2 hover:underline"
                >
                  {t("设置中查看", "Settings")}
                </Link>
              </span>
            </p>
          ) : (
            <p className="text-[11px] leading-relaxed text-[hsl(var(--pu-m-text-dim))]">
              {t("与账户设置中的订单数据同步。", "Same order list as in Account settings.")}{" "}
              <Link
                to={`${ROUTES.MEMBER.SETTINGS}#orders`}
                className="font-bold text-pu-gold-soft underline-offset-2 hover:underline"
              >
                {t("在设置中打开", "Open in Settings")}
              </Link>
            </p>
          )}
        </div>

        <div className="relative z-[1] mb-5 px-5">
          <div className="mb-1 flex items-center gap-2">
            <div className="h-5 w-1 rounded-full bg-pu-gold" aria-hidden />
            <h2 className="text-base font-extrabold text-[hsl(var(--pu-m-text))]">
              {t("交易记录", "Transaction history")}
            </h2>
          </div>
        </div>

        <div className="relative z-[1] mb-5 px-5">
          <button
            type="button"
            onClick={() => setExpandedId(expandedId === "__list__" ? null : "__list__")}
            className="flex w-full items-center gap-3 rounded-[1.25rem] border border-[hsl(var(--pu-m-surface-border)/0.25)] p-4 transition-all motion-reduce:transition-none m-glass"
            aria-expanded={expandedId === "__list__"}
            aria-controls="member-orders-panel"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-pu-emerald/10 bg-gradient-to-br from-pu-emerald/20 to-pu-emerald/5">
              <ArrowLeftRight className="h-[18px] w-[18px] text-pu-emerald" aria-hidden />
            </div>
            <div className="min-w-0 flex-1 text-left">
              <div className="text-sm font-bold text-[hsl(var(--pu-m-text))]">{t("我的订单", "My orders")}</div>
              <div className="flex items-center gap-2 text-[11px] font-medium text-[hsl(var(--pu-m-text-dim))]">
                <span>
                  {orders.length} {t("条记录", "records")}
                </span>
                {isFetching && !isLoading && !isFetchingNextPage ? (
                  <span
                    className="inline-flex shrink-0 items-center"
                    role="status"
                    aria-label={t("同步中…", "Syncing…")}
                  >
                    <span className="h-2 w-9 animate-pulse rounded-full bg-[hsl(var(--pu-m-surface)/0.42)] motion-reduce:animate-none" aria-hidden />
                  </span>
                ) : null}
              </div>
            </div>
            <ChevronDown
              className={cn(
                "h-4 w-4 shrink-0 text-[hsl(var(--pu-m-text-dim)/0.5)] transition-transform duration-300 motion-reduce:transition-none",
                expandedId === "__list__" && "rotate-180",
              )}
              aria-hidden
            />
          </button>
        </div>

        <div
          id="member-orders-panel"
          className="relative z-[1] member-orders-list-collapse overflow-hidden transition-all ease-in-out"
          style={{
            maxHeight: expandedId === "__list__" ? "3000px" : "0",
            opacity: expandedId === "__list__" ? 1 : 0,
            transitionDuration: "400ms",
          }}
        >
          <div className="mb-4 px-5">
            <div className="scrollbar-hide flex gap-2 overflow-x-auto pb-1">
              {statusFilters.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => handleFilterChange(f.key)}
                  aria-pressed={activeFilter === f.key}
                  className={cn(
                    "shrink-0 rounded-full px-4 py-1.5 text-xs font-bold transition-all duration-200 motion-reduce:transition-none",
                    activeFilter === f.key
                      ? "bg-pu-gold/15 text-pu-gold-soft ring-1 ring-inset ring-pu-gold/25"
                      : "border border-[hsl(var(--pu-m-surface-border)/0.2)] bg-[hsl(var(--pu-m-surface)/0.4)] text-[hsl(var(--pu-m-text-dim))] hover:text-[hsl(var(--pu-m-text))]",
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2.5 px-5">
            {filtered.map((order) => {
              const cardLabel = tryRecoverMisdecodedUtf8(
                (order.cardDisplayName && order.cardDisplayName.trim()) ||
                  resolveCardName(order.cardTypeId) ||
                  order.cardTypeId ||
                  "-",
              );
              const paidLabel = order.isUsdt
                ? `${Number(order.actualPaid || 0).toLocaleString()} USDT`
                : `${Number(order.actualPaid || 0).toLocaleString()} ${order.currency || ""}`.trim();
              const statusLabel =
                order.status === "cancelled"
                  ? t("已取消", "Cancelled")
                  : order.status === "active"
                    ? t("待处理", "Pending")
                    : t("已支付", "Paid");
              const statusClass =
                order.status === "cancelled"
                  ? "text-[hsl(var(--pu-m-text-dim)/0.55)]"
                  : order.status === "active"
                    ? "text-pu-rose-soft"
                    : "text-pu-emerald";

              return (
                <div key={order.dbId} className="space-y-2 rounded-[1.25rem] p-4 m-glass">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-medium text-[hsl(var(--pu-m-text-dim))]">{order.createdAt}</span>
                    <span
                      className="font-mono text-[11px] text-[hsl(var(--pu-m-text-dim))]"
                      title={order.dbId ? t(`订单引用: ${order.dbId}`, `Order ref: ${order.dbId}`) : undefined}
                    >
                      #{order.orderNumber}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="m-0 truncate text-sm font-extrabold text-[hsl(var(--pu-m-text))]" title={cardLabel}>
                        {cardLabel}
                      </p>
                    </div>
                    <p className="m-0 shrink-0 text-base font-extrabold tabular-nums text-[hsl(var(--pu-m-text))]">
                      {paidLabel}
                    </p>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-[hsl(var(--pu-m-text-dim))]">
                      {t("面值", "Face value")}: {Number(order.faceValue || 0).toLocaleString()}
                    </span>
                    <span className={cn("text-[11px] font-bold", statusClass)}>{statusLabel}</span>
                  </div>
                </div>
              );
            })}

            {hasMore ? (
              <button
                type="button"
                onClick={loadMore}
                disabled={isFetchingNextPage}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-[hsl(var(--pu-m-surface-border)/0.3)] bg-[hsl(var(--pu-m-surface)/0.5)] py-3 text-xs font-bold text-[hsl(var(--pu-m-text-dim))] transition-all motion-reduce:transition-none hover:bg-[hsl(var(--pu-m-surface)/0.7)] hover:text-[hsl(var(--pu-m-text))] active:scale-95 motion-reduce:active:scale-100 disabled:opacity-60"
              >
                {isFetchingNextPage ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
                    {t("加载中…", "Loading…")}
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-4 w-4" aria-hidden />
                    {t(`加载更多（${orders.length}/${ordersTotal}）`, `Load more (${orders.length}/${ordersTotal})`)}
                  </>
                )}
              </button>
            ) : null}

            {!hasMore && filtered.length > 0 ? (
              <p className="mt-3 pb-2 text-center text-[10px] font-medium text-[hsl(var(--pu-m-text-dim)/0.4)]">
                — {t("已显示全部订单", "All orders shown")} —
              </p>
            ) : null}

            {filtered.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[hsl(var(--pu-m-surface-border)/0.45)] bg-[hsl(var(--pu-m-surface)/0.18)] px-4 py-12 text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[hsl(var(--pu-m-surface)/0.45)] text-[hsl(var(--pu-m-text-dim)/0.35)]">
                  <Gift className="h-7 w-7" strokeWidth={1.75} aria-hidden />
                </div>
                <p className="text-sm font-semibold text-[hsl(var(--pu-m-text))]">{t("暂无订单", "No orders")}</p>
                <p className="mt-1.5 text-[11px] leading-relaxed text-[hsl(var(--pu-m-text-dim)/0.65)]">
                  {isError
                    ? t("请检查网络后重试。", "Check your network and try again.")
                    : t("切换筛选或稍后再试。", "Try another filter or check back later.")}
                </p>
                {!isError ? (
                  <MemberEmptyStateCta
                    primary={{ to: ROUTES.MEMBER.DASHBOARD, label: t("去首页看看", "Browse Home") }}
                    secondary={{ to: ROUTES.MEMBER.TRADE_CONTACT, label: t("联系客服下单", "Contact to order") }}
                  />
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        <div className="h-8" />
      </div>
    </div>
  );
}
