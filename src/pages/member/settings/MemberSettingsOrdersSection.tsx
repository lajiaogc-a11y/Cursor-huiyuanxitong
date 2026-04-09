import { ShoppingCart, ChevronDown } from "lucide-react";
import { ROUTES } from "@/routes/constants";
import { cn } from "@/lib/utils";
import { MemberStackedRowSkeleton } from "@/components/member/MemberPageLoadingShell";
import { MemberEmptyStateCta } from "@/components/member/MemberEmptyStateCta";
import { resolveCardName, tryRecoverMisdecodedUtf8, extractEnglishName } from "@/services/members/nameResolver";
import type { MemberPortalOrderView } from "@/hooks/orders/utils";

export function MemberSettingsOrdersSection({
  t,
  expandedOrders,
  setExpandedOrders,
  memberOrders,
  showOrdersSkeleton,
  ordersFetching,
}: {
  t: (zh: string, en: string) => string;
  expandedOrders: boolean;
  setExpandedOrders: (v: boolean) => void;
  memberOrders: MemberPortalOrderView[];
  showOrdersSkeleton: boolean;
  ordersFetching: boolean;
}) {
  return (
    <div id="orders" className="m-glass overflow-hidden rounded-2xl border border-pu-emerald/12">
      <div className="member-settings-row">
        <button
          type="button"
          className="member-settings-trigger"
          onClick={() => setExpandedOrders(!expandedOrders)}
          aria-expanded={expandedOrders}
        >
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-pu-emerald/12 ring-1 ring-inset ring-[hsl(var(--pu-m-surface-border)/0.28)]">
              <ShoppingCart className="h-4 w-4 text-pu-emerald-soft" strokeWidth={2} aria-hidden />
            </div>
            <div className="min-w-0 text-left">
              <p className="m-0 text-sm font-semibold text-[hsl(var(--pu-m-text))]">{t("我的订单", "My orders")}</p>
              <p className="m-0 flex items-center gap-2 text-xs text-[hsl(var(--pu-m-text-dim)/0.55)]">
                {showOrdersSkeleton ? (
                  <span className="inline-flex items-center gap-2" role="status" aria-label={t("加载中…", "Loading…")}>
                    <span
                      className="h-2 w-14 animate-pulse rounded-full bg-[hsl(var(--pu-m-surface)/0.42)] motion-reduce:animate-none"
                      aria-hidden
                    />
                    <span className="sr-only">{t("加载中…", "Loading…")}</span>
                  </span>
                ) : (
                  <>
                    <span>{t(`${memberOrders.length} 条记录`, `${memberOrders.length} records`)}</span>
                    {ordersFetching ? (
                      <span className="inline-flex shrink-0 items-center" role="status" aria-label={t("同步中…", "Syncing…")}>
                        <span
                          className="h-2 w-9 animate-pulse rounded-full bg-[hsl(var(--pu-m-surface)/0.42)] motion-reduce:animate-none"
                          aria-hidden
                        />
                      </span>
                    ) : null}
                  </>
                )}
              </p>
            </div>
          </div>
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-[hsl(var(--pu-m-text-dim)/0.4)] transition-transform member-motion-base motion-reduce:transition-none",
              expandedOrders && "rotate-180",
            )}
            strokeWidth={2}
            aria-hidden
          />
        </button>
        <div
          className={cn(
            "member-settings-expand member-settings-collapse member-motion-base",
            expandedOrders ? "is-open" : "is-closed",
          )}
          aria-hidden={!expandedOrders}
        >
          <div className="member-settings-collapse__inner">
            {showOrdersSkeleton ? (
              <MemberStackedRowSkeleton rows={4} />
            ) : memberOrders.length === 0 ? (
              <div className="relative overflow-hidden rounded-2xl border border-dashed border-pu-gold/22 bg-gradient-to-b from-pu-gold/[0.08] via-[hsl(var(--pu-m-surface)/0.18)] to-[hsl(var(--pu-m-surface)/0.22)] px-4 py-8 text-center">
                <div className="relative">
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-pu-gold/12 text-[hsl(var(--pu-m-text-dim)/0.4)]">
                    <ShoppingCart className="h-6 w-6" strokeWidth={1.75} aria-hidden />
                  </div>
                  <p className="m-0 text-sm font-semibold text-[hsl(var(--pu-m-text))]">{t("暂无订单", "No orders")}</p>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-[hsl(var(--pu-m-text-dim)/0.65)]">
                    {t("下单成功后将显示在此", "Paid orders will appear here")}
                  </p>
                  <MemberEmptyStateCta
                    primary={{ to: ROUTES.MEMBER.DASHBOARD, label: t("去首页逛逛", "Go to Home") }}
                    secondary={{ to: ROUTES.MEMBER.TRADE_CONTACT, label: t("联系客服下单", "Contact to order") }}
                  />
                </div>
              </div>
            ) : (
              <div className="member-order-list">
                {memberOrders.map((order) => {
                  const cardLabel = extractEnglishName(tryRecoverMisdecodedUtf8(
                    (order.cardDisplayName && order.cardDisplayName.trim()) ||
                      resolveCardName(order.cardTypeId) ||
                      order.cardTypeId ||
                      "-",
                  ));
                  const paidLabel = order.isUsdt
                    ? `${Number(order.actualPaid || 0).toLocaleString()} USDT`
                    : `${Number(order.actualPaid || 0).toLocaleString()} ${order.currency || ""}`.trim();
                  return (
                    <div key={order.dbId} className="member-order-card">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-[11px] text-[hsl(var(--pu-m-text-dim)/0.45)]">{order.createdAt}</span>
                        <span
                          className="font-mono text-[11px] text-[hsl(var(--pu-m-text-dim)/0.45)]"
                          title={order.dbId ? t(`订单引用: ${order.dbId}`, `Order ref: ${order.dbId}`) : undefined}
                        >
                          #{order.orderNumber}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="m-0 truncate text-sm font-semibold text-[hsl(var(--pu-m-text))]" title={cardLabel}>
                            {cardLabel}
                          </p>
                          <p className="mt-0.5 text-xs text-[hsl(var(--pu-m-text-dim)/0.6)]">
                            {t("面值", "Face value")}: {Number(order.faceValue || 0).toLocaleString()}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="m-0 text-base font-bold tabular-nums text-[hsl(var(--pu-m-text))]">{paidLabel}</p>
                          <p className="mt-0.5 text-[11px] text-[hsl(var(--pu-m-text-dim)/0.45)]">
                            {order.status === "cancelled"
                              ? t("已取消", "Cancelled")
                              : order.status === "active"
                                ? t("处理中", "In progress")
                                : t("已支付", "Paid")}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          </div>
      </div>
    </div>
  );
}
