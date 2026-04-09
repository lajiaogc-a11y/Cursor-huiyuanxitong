import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { Gift, LayoutGrid, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { getMallCache, clearMallCatalogCache } from "@/lib/mallCatalogCache";
export { clearMallCatalogCache };
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
import { type RedeemPointsMallItemResult } from "@/services/members/memberPointsMallRpcService";
import { notify } from "@/lib/notifyHub";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";
import { memberQueryKeys } from "@/lib/memberQueryKeys";
import { useMemberResolvableMedia } from "@/hooks/useMemberResolvableMedia";
import { MemberPageAmbientOrbs } from "@/components/member/MemberPageAmbientOrbs";
import { useMemberSkeletonGate } from "@/hooks/useMemberSkeletonGate";
import { memberPortalNetworkToastMessage } from "@/lib/memberPortalUx";
import { DrawerDetail } from "@/components/shell/DrawerDetail";
import { getMemberTodayEarnedRpc } from "@/services/points/memberPointsRpcService";
import { MemberPortalPointsHero } from "@/components/member/MemberPortalPointsHero";
import { pickBilingualPortalField } from "@/lib/memberPortalBilingualHint";
import "@/styles/member-portal.css";
import { useMemberPullRefreshSignal } from "@/hooks/useMemberPullRefreshSignal";
import { num, redeemableMaxQty } from "@/pages/member/memberPointsShared";
import { REDEMPTION_HISTORY_LIMIT, MemberRedemptionHistoryFeed } from "@/pages/member/MemberPointsRedemptionHistory";
import {
  MALL_TAB_ALL,
  MALL_TAB_POPULAR,
  MemberPointsMallCatalogSection,
} from "@/pages/member/MemberPointsMallCatalogSection";
import { MemberPointsRedeemDrawerBody } from "@/pages/member/MemberPointsRedeemDrawerBody";
import { ContentReveal } from "@/components/member/ContentReveal";
import { scrollToMemberHashAnchor } from "@/lib/memberHashAnchorScroll";

type PointsMainTab = "mall" | "history";

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
      return t("兑换失败，请重试或联系客服。", "Redeem failed. Try again or contact support.");
    default:
      return t("兑换失败，请稍后重试。", "Redeem failed. Try again later.");
  }
}

const _mallCache = getMallCache() as unknown as Map<string, PointsMallItem[]>;

export default function MemberPoints() {
  const { member, refreshMember } = useMemberAuth();
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
  /** 首次进入「兑换历史」后再挂载列表，避免默认商城 Tab 时多打一条历史 API */
  const [historyPanelActivated, setHistoryPanelActivated] = useState(false);
  const [todayEarned, setTodayEarned] = useState(0);
  const [todayEarnedLoading, setTodayEarnedLoading] = useState(true);
  const todayEarnedHydratedRef = useRef(false);
  const [pullNonce, setPullNonce] = useState(0);
  const lastSeenPullForMall = useRef(0);
  const showMallSkeleton = useMemberSkeletonGate(loading || itemsLoading);
  const pointsHeroReveal = !loading && !todayEarnedLoading;
  const mallCatalogReveal = !showMallSkeleton;

  useMemberPullRefreshSignal(() => {
    setPullNonce((n) => n + 1);
  });

  useEffect(() => {
    setCatalogRetryKey(0);
    setPullNonce(0);
    lastSeenPullForMall.current = 0;
    setPointsTab("mall");
    setHistoryPanelActivated(false);
    todayEarnedHydratedRef.current = false;
    setTodayEarnedLoading(true);
  }, [member?.id]);

  useEffect(() => {
    if (pointsTab === "history") setHistoryPanelActivated(true);
  }, [pointsTab]);

  useEffect(() => {
    const h = location.hash.replace(/^#/, "").trim();
    if (h === "member-mall-catalog") setPointsTab("mall");
  }, [location.hash]);

  useEffect(() => {
    if (!member?.id) return;
    let cancelled = false;
    const fetchTodayEarned = async (showLoading: boolean) => {
      if (showLoading && !todayEarnedHydratedRef.current) setTodayEarnedLoading(true);
      const earned = await getMemberTodayEarnedRpc(member.id);
      if (cancelled) return;
      setTodayEarned(earned);
      todayEarnedHydratedRef.current = true;
      setTodayEarnedLoading(false);
    };
    void fetchTodayEarned(true);
    const timer = window.setInterval(() => void fetchTodayEarned(false), 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [member?.id, redemptionsKey, pullNonce]);

  const lastHandledHashRef = useRef<string>("");
  useEffect(() => {
    const hash = String(location.hash || "").trim();
    if (!hash) {
      lastHandledHashRef.current = "";
      return;
    }
    if (hash === lastHandledHashRef.current) return;
    const cancel = scrollToMemberHashAnchor(hash, { behavior: "smooth", block: "start", maxFrames: 24 });
    lastHandledHashRef.current = hash;
    return cancel;
  }, [location.hash, items.length]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    const targetSnapshot = redeemTarget;
    const memberId = member.id;
    await redeemGuard(async () => {
      const cap = redeemableMaxQty(targetSnapshot);
      const qty = cap < 1 ? 0 : Math.max(1, Math.min(Number(redeemQty || 1), cap));
      if (qty < 1) {
        notify.error(
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
          memberId,
          targetSnapshot.id,
          qty,
          redeemClientRequestIdRef.current || undefined,
        );
        if (!r.success) {
          const detail = redeemFailureDetail(r, t);
          setRedeemError(detail);
          notify.error(detail);
          return;
        }
        if (r.idempotent_replay) {
          notify.info(t("该兑换请求已处理过", "This redeem request was already processed"));
        } else {
          notify.success(
            t(
              `已兑换：${r.item?.title || targetSnapshot.title}`,
              `Redeemed: ${r.item?.title || targetSnapshot.title}`,
            ),
          );
        }
        setRedeemError(null);
        setRedeemTarget(null);
        void refreshPoints().catch(() => {});
        void refreshMember().catch(() => {});
        void queryClient.invalidateQueries({ queryKey: memberQueryKeys.points(memberId) }).catch(() => {});
        void queryClient.invalidateQueries({ queryKey: memberQueryKeys.mall(memberId) }).catch(() => {});
        void queryClient.invalidateQueries({ queryKey: memberQueryKeys.profile(memberId) }).catch(() => {});
        void queryClient.invalidateQueries({ queryKey: memberQueryKeys.pointsBreakdown(memberId) }).catch(() => {});
        /** 若商城兑换会发放抽奖次数，与抽奖 Tab 本地缓存需一并失效 */
        void queryClient.invalidateQueries({ queryKey: memberQueryKeys.spin(memberId) }).catch(() => {});
        loadMemberPointsMallCatalog(memberId)
          .then((raw) => {
            setItems(raw.map(normalizeMallItem));
            return loadMemberPointsMallCategories(memberId);
          })
          .then((cats) => setMallCategories(Array.isArray(cats) ? cats : []))
          .catch(() => {
            notify.warning(
              t("商城列表同步失败，请下拉刷新或稍后重试。", "Catalog sync failed. Pull to refresh or try again later."),
            );
          });
        setRedemptionsKey((k) => k + 1);
      } catch {
        const msg = memberPortalNetworkToastMessage(t);
        setRedeemError(msg);
        notify.error(msg);
      } finally {
        setRedeeming(false);
      }
    });
  }, [member, redeemTarget, redeemQty, redeemGuard, refreshPoints, refreshMember, queryClient, t]);

  const requestRedeemProduct = useCallback((p: PointsMallItem) => {
    redeemClientRequestIdRef.current =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? (crypto.randomUUID() as string).replace(/-/g, "")
        : `r_${Date.now()}_${Math.random().toString(36).slice(2, 14)}`;
    setRedeemTarget(p);
    setRedeemQty(1);
  }, []);

  if (!member) return null;

  return (
    <div className="member-page-enter m-page-bg relative flex flex-col">
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

        <ContentReveal show={pointsHeroReveal} durationMs={220}>
          <MemberPortalPointsHero
            points={points}
            frozenPoints={frozenPoints}
            loading={loading}
            todayEarned={todayEarned}
            todayEarnedLoading={todayEarnedLoading}
            t={t}
          />
        </ContentReveal>

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
                "flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2.5 text-sm font-bold member-transition-color member-motion-fast motion-reduce:transition-none",
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
                "flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2.5 text-sm font-bold member-transition-color member-motion-fast motion-reduce:transition-none",
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

        <div className="member-page-body relative flex flex-col">
          <div
            className={cn(
              "member-points-tab-panel",
              pointsTab === "mall" ? "relative z-[1] block" : "hidden",
            )}
            role="tabpanel"
            aria-hidden={pointsTab !== "mall"}
            id="member-points-tab-mall"
          >
            <ContentReveal show={mallCatalogReveal} durationMs={220}>
              <MemberPointsMallCatalogSection
                t={t}
                language={language}
                itemsLoading={itemsLoading}
                items={items}
                filteredItems={filteredItems}
                mallFilterKey={mallFilterKey}
                onMallFilterKeyChange={setMallFilterKey}
                mallCategories={mallCategories}
                showMallSkeleton={showMallSkeleton}
                catalogError={catalogError}
                onCatalogRetry={() => {
                  setCatalogError(false);
                  setCatalogRetryKey((k) => k + 1);
                }}
                itemsLoadingForRetry={itemsLoading}
                points={points}
                hasFrozen={hasFrozen}
                redeeming={redeeming}
                redeemTargetId={redeemTarget?.id}
                themeColor={themeColor}
                onRequestRedeem={requestRedeemProduct}
              />
            </ContentReveal>
          </div>

          <div
            className={cn(
              "member-points-tab-panel px-5 pb-10",
              pointsTab === "history" ? "relative z-[1] block" : "hidden",
            )}
            role="tabpanel"
            aria-hidden={pointsTab !== "history"}
            id="member-points-tab-history"
          >
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
            {historyPanelActivated ? (
              <ContentReveal show={pointsTab === "history"} durationMs={220}>
                <MemberRedemptionHistoryFeed
                  memberId={member.id}
                  refreshKey={redemptionsKey}
                  pullRefreshSignal={pullNonce}
                  t={t}
                />
              </ContentReveal>
            ) : (
              <div
                className="min-h-[12rem] rounded-2xl border border-dashed border-[hsl(var(--pu-m-surface-border)/0.22)] bg-[hsl(var(--pu-m-surface)/0.06)]"
                aria-hidden
              />
            )}
          </div>
        </div>

        <DrawerDetail
          open={!!redeemTarget}
          onOpenChange={(open) => {
            if (!open) setRedeemTarget(null);
          }}
          variant="member"
          title={redeemTarget?.title ?? t("安全兑换", "Secure redemption")}
          description={t(
            "确认数量 · 提交后扣积分 · 自助礼遇商城",
            "Confirm quantity · points deduct on submit · self-service mall",
          )}
          sheetMaxWidth="2xl"
          sheetContentProps={{ className: "member-redeem-drawer" }}
        >
          {redeemTarget ? (
            <MemberPointsRedeemDrawerBody
              redeemTarget={redeemTarget}
              redeemDrawerImg={redeemDrawerImg}
              redeemQty={redeemQty}
              onRedeemQtyChange={setRedeemQty}
              redeemError={redeemError}
              onDismissError={() => setRedeemError(null)}
              points={points}
              redeemRulesTitle={redeemRulesTitle}
              redeemDailyUnlimitedLine={redeemDailyUnlimitedLine}
              redeemLifetimeUnlimitedLine={redeemLifetimeUnlimitedLine}
              t={t}
              redeeming={redeeming}
              onRedeemingErrorReset={() => setRedeeming(false)}
              onCancel={() => setRedeemTarget(null)}
              onConfirmRedeem={handleRedeem}
            />
          ) : null}
        </DrawerDetail>
      </div>
    </div>
  );
}
