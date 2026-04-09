import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useLocation } from "react-router-dom";
import { useMemberPullRefreshSignal } from "@/hooks/members/useMemberPullRefreshSignal";
import { formatMemberLocalTime } from "@/lib/memberLocalTime";
import { History, Trophy, Star, ChevronDown, Info } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useMemberAuth } from "@/contexts/MemberAuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useActionGuard } from "@/lib/actionGuard";
import { notifyError, notifyInfo } from "@/utils/notify";
import {
  pickGridPrizesForSpinPage,
  loadMemberSpinPrizesAndQuota,
  loadMemberSpinLogs,
  executeMemberLotteryDraw,
  getLotteryQuota,
  type LotteryPrize,
  type DrawResult,
  type LotteryLog,
} from "@/services/memberPortal/memberLotteryPageService";
import { getSpinSimFeed, type SpinSimFeedItem, type QuotaResult } from "@/services/lottery/lotteryService";
import { normalizeSpinSimFeedLineForMember } from "@/lib/spinSimFeedDisplay";

/** 滚动条只展示「最新」条数，与首页公告跑马灯同一套分段 + 竖线分隔（避免 flex gap 双份复制时 -50% 接缝错位闪现） */
const SIM_FEED_DISPLAY_LIMIT = 10;

/**
 * 合并两批 feed items：去重、按 at 倒序、只保留最新 SIM_FEED_DISPLAY_LIMIT 条。
 * prev = 当前已有的 items，incoming = 新拉取的 items（或局部插入的单条）。
 */
function mergeFeedItems(prev: SpinSimFeedItem[], incoming: SpinSimFeedItem[]): SpinSimFeedItem[] {
  const map = new Map<string, SpinSimFeedItem>();
  for (const it of [...prev, ...incoming]) {
    const existing = map.get(it.id);
    // Prefer the entry with the larger `at` (most recent) for same id
    if (!existing || (it.at ?? 0) > (existing.at ?? 0)) {
      map.set(it.id, it);
    }
  }
  return [...map.values()]
    .sort((a, b) => (b.at ?? 0) - (a.at ?? 0))
    .slice(0, SIM_FEED_DISPLAY_LIMIT);
}

/** 仅保留转盘抽奖结果行（排除若接口误混入的其它类型） */
function isLotteryPrizeLogType(prizeType: string | undefined): boolean {
  const t = String(prizeType || "").toLowerCase();
  return t === "points" || t === "custom" || t === "none" || t === "miss";
}

/** 抽奖接口返回的 remaining 可能为数字或数字字符串 */
function parseDrawRemaining(r: { remaining?: unknown }): number | null {
  const raw = r.remaining;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw.trim() !== "") {
    const n = Number(raw);
    if (Number.isFinite(n)) return n;
  }
  return null;
}
import {
  getMemberSpinAudioContext,
  playMemberSpinMiss,
  playMemberSpinStart,
  playMemberSpinWin,
} from "./spin/memberSpinAudio";
import { runMemberSpinHighlightAnimation } from "./spin/memberSpinHighlightAnimation";
import { queryClient } from "@/lib/queryClient";
import { memberQueryKeys } from "@/lib/memberQueryKeys";
import { MemberPageAmbientOrbs } from "@/components/member/MemberPageAmbientOrbs";
import { Lottery } from "@/components/member/MemberSpinLottery";
import { SpinResultDrawer } from "@/components/member/SpinResultDrawer";
import {
  formatPrizeListDisplayProbability,
  prizeDisplayTier,
  spinWheelPrizeMainText,
} from "@/components/member/spinWheelDisplay";
import { cn } from "@/lib/utils";
import { ROUTES } from "@/routes/constants";
import { memberPortalNetworkToastMessage } from "@/lib/memberPortalUx";
import { fireMemberSpinWinConfetti } from "@/lib/memberPortalConfetti";
import { MemberEmptyStateCta } from "@/components/member/MemberEmptyStateCta";
import "@/styles/member-portal.css";

/** Member spin history: show at most this many latest rows (no extra pagination on page). */
const SPIN_LOG_LIMIT = 100;

const _spinCache = new Map<
  string,
  {
    prizes: LotteryPrize[];
    remaining: number;
    quotaUsedToday: number;
    probabilityNotice: string | null;
    logs: LotteryLog[];
    logsTotal: number;
  }
>();

export function clearSpinCache(): void {
  _spinCache.clear();
}

function _clearSpinCacheOnSignout() { _spinCache.clear(); }
if (typeof window !== "undefined") {
  window.addEventListener("member:signout", _clearSpinCacheOnSignout);
  if (import.meta.hot) {
    import.meta.hot.dispose(() => window.removeEventListener("member:signout", _clearSpinCacheOnSignout));
  }
}

/** Member spin page: duplicate-tap guard via spinGuard + spinning/remaining. */
export default function MemberSpin() {
  const { pathname } = useLocation();
  const { member, refreshMember } = useMemberAuth();
  const { t } = useLanguage();
  const spinGuard = useActionGuard(1000);
  const cached = member ? _spinCache.get(member.id) : undefined;

  const [spinning, setSpinning] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [result, setResult] = useState<DrawResult["prize"] | null>(null);
  const [lastDrawRewardPoints, setLastDrawRewardPoints] = useState<number | undefined>(undefined);
  const [lastDrawRewardStatus, setLastDrawRewardStatus] = useState<string | undefined>(undefined);
  const [lastDrawMeta, setLastDrawMeta] = useState<{ budget_warning?: string; risk_downgraded?: boolean } | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [prizes, setPrizes] = useState<LotteryPrize[]>(cached?.prizes ?? []);
  const [remaining, setRemaining] = useState(cached?.remaining ?? 0);
  const [quotaUsedToday, setQuotaUsedToday] = useState(cached?.quotaUsedToday ?? 0);
  const [quotaLoading, setQuotaLoading] = useState(!cached);
  const [loadError, setLoadError] = useState(false);
  const [lotteryEnabled, setLotteryEnabled] = useState(true);
  const [logs, setLogs] = useState<LotteryLog[]>(cached?.logs ?? []);
  const [logsTotal, setLogsTotal] = useState(cached?.logsTotal ?? 0);
  const [probabilityNotice, setProbabilityNotice] = useState<string | null>(cached?.probabilityNotice ?? null);
  const [historyOpen, setHistoryOpen] = useState(false);
  /** 活动奖品说明区：默认收起，点击标题展开 */
  const [prizesPanelOpen, setPrizesPanelOpen] = useState(false);
  const [pullNonce, setPullNonce] = useState(0);
  /** 定时刷新 / 切回前台时递增，与下拉刷新一样重新拉奖品与「概率说明」 */
  const [spinDataRefreshNonce, setSpinDataRefreshNonce] = useState(0);
  const highlightCancelRef = useRef<(() => void) | null>(null);
  /**
   * 记录最近一次抽奖 API 返回的时间戳（ms）。
   * 用于防止"过期轮询响应覆盖正确的抽奖后状态"的竞态条件：
   * 若轮询请求发起时间早于此值，则丢弃其配额数据（次数/已用）。
   */
  const lastDrawResponseAtRef = useRef(0);

  const [simFeedItems, setSimFeedItems] = useState<SpinSimFeedItem[]>([]);
  const simFeedLastKnownRef = useRef<SpinSimFeedItem[]>([]);
  /** 点击中奖滚动条后暂停 3 秒再继续 */
  const [simFeedClickPaused, setSimFeedClickPaused] = useState(false);
  const simFeedClickPauseTimerRef = useRef<number | null>(null);

  const simFeedDisplayItems = useMemo(() => {
    const source = simFeedItems.length > 0 ? simFeedItems : simFeedLastKnownRef.current;
    if (!source.length) return [];
    // Already sorted + limited by mergeFeedItems; just guard in case of direct setState
    const sorted = [...source]
      .sort((a, b) => (b.at ?? 0) - (a.at ?? 0))
      .slice(0, SIM_FEED_DISPLAY_LIMIT);
    if (sorted.length > 0) simFeedLastKnownRef.current = sorted;
    return sorted;
  }, [simFeedItems]);

  const applyFeedItems = useCallback((incoming: SpinSimFeedItem[]) => {
    setSimFeedItems((prev) => mergeFeedItems(prev, incoming));
  }, []);

  /** 与首页公告一致：`Math.max(14, n * 5)`，n 为当前展示的条数（最多 10） */
  const simFeedMarqueeDurationSec = useMemo(
    () => Math.max(14, simFeedDisplayItems.length * 5),
    [simFeedDisplayItems.length],
  );

  const onSimFeedStripClick = useCallback(() => {
    if (simFeedClickPauseTimerRef.current) {
      window.clearTimeout(simFeedClickPauseTimerRef.current);
      simFeedClickPauseTimerRef.current = null;
    }
    setSimFeedClickPaused(true);
    simFeedClickPauseTimerRef.current = window.setTimeout(() => {
      setSimFeedClickPaused(false);
      simFeedClickPauseTimerRef.current = null;
    }, 3000);
  }, []);

  useEffect(
    () => () => {
      if (simFeedClickPauseTimerRef.current) {
        window.clearTimeout(simFeedClickPauseTimerRef.current);
        simFeedClickPauseTimerRef.current = null;
      }
    },
    [],
  );

  useMemberPullRefreshSignal(() => {
    setPullNonce((n) => n + 1);
  });

  useEffect(() => {
    setPullNonce(0);
    setSpinDataRefreshNonce(0);
  }, [member?.id]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") {
        setSpinDataRefreshNonce((n) => n + 1);
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  useEffect(() => {
    if (!member) return;
    const id = window.setInterval(() => setSpinDataRefreshNonce((n) => n + 1), 30_000);
    return () => window.clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [member?.id]);

  /**
   * 底部 Tab 为 keep-alive（MemberTabbedShell）：签到/分享等在其它页更新抽奖次数后，本页仍挂载且不会自动重拉配额。
   * 在路由切到「抽奖」Tab 时再拉一次，使右上角剩余次数与最新 spin_credits 一致。
   */
  const wasSpinTabRef = useRef(false);
  useEffect(() => {
    const onSpinTab = pathname === ROUTES.MEMBER.SPIN;
    const was = wasSpinTabRef.current;
    wasSpinTabRef.current = onSpinTab;
    if (!member?.id) return;
    if (onSpinTab && !was) {
      setSpinDataRefreshNonce((n) => n + 1);
    }
  }, [pathname, member?.id]);

  const applyQuota = useCallback((q: Pick<QuotaResult, "remaining" | "used_today">) => {
    setRemaining(q.remaining);
    setQuotaUsedToday(q.used_today ?? 0);
  }, []);

  const quotaTotalToday = remaining + quotaUsedToday;

  useEffect(() => {
    if (!member) return;
    // 记录本次 fetch 的发起时间，用于检测是否已过期（抽奖发生后的旧请求）
    const fetchStartedAt = Date.now();
    setLoadError(false);
    if (!_spinCache.has(member.id)) setQuotaLoading(true);
    loadMemberSpinPrizesAndQuota(member.id)
      .then(({ prizes: raw, quotaRemaining, quotaUsedToday: used, probability_notice, enabled }) => {
        setLotteryEnabled(enabled);
        setProbabilityNotice(probability_notice ?? null);
        const grid = pickGridPrizesForSpinPage(raw);
        if (grid.length > 0) setPrizes(grid);
        // 只有当此次 fetch 发起时间晚于最近一次抽奖响应时间，才更新配额显示。
        // 防止竞态条件：若 30s 轮询在抽奖之前发出，但在抽奖后才回来，会覆盖正确的抽奖后次数。
        if (fetchStartedAt >= lastDrawResponseAtRef.current) {
          setRemaining(quotaRemaining);
          setQuotaUsedToday(used);
        }
        setQuotaLoading(false);
        _spinCache.set(member.id, {
          prizes: grid.length > 0 ? grid : _spinCache.get(member.id)?.prizes ?? [],
          remaining: quotaRemaining,
          quotaUsedToday: used,
          probabilityNotice: probability_notice ?? null,
          logs: _spinCache.get(member.id)?.logs ?? [],
          logsTotal: _spinCache.get(member.id)?.logsTotal ?? 0,
        });
      })
      .catch(() => { setQuotaLoading(false); setLoadError(true); });
    let cancelled = false;
    const loadLogs = () => {
      if (cancelled) return;
      loadMemberSpinLogs(member.id, { limit: SPIN_LOG_LIMIT, offset: 0 })
        .then(({ logs: list, total }) => {
          if (!cancelled) {
            setLogs(list);
            setLogsTotal(total);
            const prev = _spinCache.get(member.id);
            if (prev) _spinCache.set(member.id, { ...prev, logs: list, logsTotal: total });
          }
        })
        .catch((err) => { console.warn('[MemberSpin] loadMemberSpinLogs failed:', err); });
    };
    const idle =
      typeof window.requestIdleCallback === "function"
        ? window.requestIdleCallback(loadLogs)
        : window.setTimeout(loadLogs, 1);
    return () => {
      cancelled = true;
      if (typeof window.requestIdleCallback === "function") window.cancelIdleCallback(idle as number);
      else window.clearTimeout(idle as number);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [member?.id, pullNonce, spinDataRefreshNonce]);

  /** 拉取服务端最新 feed 并合并（兜底轮询 + 抽奖后主动刷新共用） */
  const refreshSimFeed = useCallback(() => {
    void getSpinSimFeed().then((incoming) => {
      if (incoming.length > 0) applyFeedItems(incoming);
    });
  }, [applyFeedItems]);

  useEffect(() => {
    if (!member) return;
    refreshSimFeed();
    const id = window.setInterval(refreshSimFeed, 12_000);
    return () => window.clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [member?.id, pullNonce]);

  useEffect(
    () => () => {
      highlightCancelRef.current?.();
      highlightCancelRef.current = null;
    },
    []
  );

  const handleSpin = useCallback(async () => {
    if (!member || spinning) return;
    if (remaining <= 0) {
      notifyError(
        t("抽奖次数不足，请通过签到或任务获取更多。", "Not enough draw chances. Earn more via check-in or tasks."),
      );
      return;
    }

    const guarded = await spinGuard(async () => {
      getMemberSpinAudioContext();
      playMemberSpinStart();

      setSpinning(true);
      setResult(null);
      setShowResult(false);
      try {
        const r = await executeMemberLotteryDraw(member.id);
        // 标记抽奖 API 响应时间，使此时间之前发出的轮询不会覆盖配额显示
        lastDrawResponseAtRef.current = Date.now();
        if (!r.success) {
          if (r.error === "LOTTERY_DISABLED")
            notifyError(t("抽奖暂时关闭", "Lottery is currently closed"));
          else if (r.error === "NO_SPIN_QUOTA")
            notifyError(
              t("抽奖次数不足，请通过签到或任务获取更多。", "Not enough draw chances. Earn more via check-in or tasks."),
            );
          else if (r.error === "PROBABILITY_SUM_ZERO" || r.error === "PROBABILITY_SUM_NOT_100")
            notifyError(t("抽奖配置异常，请联系客服。", "Lottery configuration error, please contact support."));
          else if (r.error === "NO_PRIZES_CONFIGURED")
            notifyError(t("未配置奖品，请联系客服。", "No prizes configured, please contact support."));
          else if (r.error === "DUPLICATE_REQUEST")
            notifyInfo(t("请勿重复点击", "Please do not tap repeatedly."));
          else if (r.error === "BUDGET_EXCEEDED")
            notifyError(t("今日奖池已发放完毕，请明天再来！", "Today's prize pool is exhausted. Come back tomorrow!"));
          else if (r.error === "RTP_LIMIT_REACHED")
            notifyError(t("今日奖池已达上限，请明天再来！", "Today's prize pool has reached its limit. Come back tomorrow!"));
          else if (r.error === "RISK_DAILY_LIMIT")
            notifyError(t("今日已超过最大抽奖次数，请明日再来。", "You have exceeded today's maximum draws. Please come back tomorrow."));
          else if (r.error === "RISK_BLOCKED")
            notifyError(t("操作过于频繁，请稍后再试。", "Too many requests. Please try again later."));
          else notifyError(t("抽奖失败，请稍后再试。", "Spin failed. Please try again later."));
          void getLotteryQuota(member.id)
            .then(applyQuota)
            .catch(() => { /* fallback quota refresh is best-effort */ });
          playMemberSpinMiss();
          setSpinning(false);
          setActiveIndex(-1);
          return;
        }
        const prize = r.prize!;
        const parsedRem = parseDrawRemaining(r);
        if (parsedRem !== null) {
          setRemaining(parsedRem);
        } else {
          // 接口未带 remaining 时先乐观减一，避免右上角要等转盘动画结束才变
          setRemaining((prev) => Math.max(0, prev - 1));
        }
        // 立刻拉配额（原逻辑仅在动画结束 onComplete 里拉，导致次数长时间不刷新）
        void getLotteryQuota(member.id)
          .then((q) => {
            applyQuota(q);
            const prev = _spinCache.get(member.id);
            if (prev) {
              _spinCache.set(member.id, {
                ...prev,
                remaining: q.remaining,
                quotaUsedToday: q.used_today ?? 0,
              });
            }
          })
          .catch(() => {});
        void queryClient.invalidateQueries({ queryKey: memberQueryKeys.spin(member.id) });

        setLastDrawRewardPoints(r.reward_points);
        setLastDrawRewardStatus(r.reward_status);
        setLastDrawMeta({ budget_warning: r.budget_warning, risk_downgraded: r.risk_downgraded });

        let targetIdx = prizes.findIndex((p) => p.id === prize.id);
        if (targetIdx < 0) {
          targetIdx = prizes.findIndex((p) => p.name === prize.name && p.type === prize.type);
        }
        if (targetIdx < 0 && prize.type === "none") {
          targetIdx = prizes.findIndex((p) => p.type === "none");
        }
        if (targetIdx < 0) {
          targetIdx = prizes.findIndex((p) => p.type === prize.type);
        }

        const onComplete = () => {
          setActiveIndex(-1);
          setResult(prize);
          setShowResult(true);
          if (prize.type === "points" || prize.type === "custom") {
            playMemberSpinWin();
            if (navigator.vibrate) navigator.vibrate([50, 30, 80]);
            fireMemberSpinWinConfetti(prizeDisplayTier(prize as LotteryPrize));
          } else {
            playMemberSpinMiss();
          }
          // 配额已在抽奖 API 返回后立即刷新；此处再拉一次作动画结束后的校准（服务端 eventual consistency）
          void getLotteryQuota(member.id)
            .then(applyQuota)
            .catch(() => {});
          loadMemberSpinLogs(member.id, { limit: SPIN_LOG_LIMIT, offset: 0 })
            .then(({ logs: list, total }) => {
              setLogs(list);
              setLogsTotal(total);
            })
            .catch(() => { /* post-draw log refresh is best-effort */ });
          void refreshMember().catch(() => {});
          void queryClient.invalidateQueries({ queryKey: memberQueryKeys.points(member.id) });
          void queryClient.invalidateQueries({ queryKey: memberQueryKeys.pointsBreakdown(member.id) });

          // ── 中奖滚动区局部刷新 ──────────────────────────────────────
          // 1. 仅有实质奖品时才插入 feed（感谢参与不插入以免刷屏）
          if (prize.type === "points" || prize.type === "custom") {
            const localItem: SpinSimFeedItem = {
              id: `local:${Date.now()}`,
              text: t(
                `恭喜中奖！${prize.name || prize.type} 🎁🎁🎁`,
                `Congratulations! You won (${prize.name || prize.type}) 🎁🎁🎁!`,
              ),
              at: Date.now(),
            };
            applyFeedItems([localItem]);
          }
          // 2. 立刻从后端拉最新数据（1s 延迟给服务端写入时间）
          window.setTimeout(refreshSimFeed, 1_000);
          // ────────────────────────────────────────────────────────────

          setSpinning(false);
          highlightCancelRef.current = null;
        };

        highlightCancelRef.current?.();
        setActiveIndex(-1);
        if (targetIdx < 0) {
          // Prize not displayed on the grid — skip animation to avoid misleading highlight
          setTimeout(onComplete, 600);
        } else {
          highlightCancelRef.current = runMemberSpinHighlightAnimation(
            targetIdx,
            prizes.length,
            setActiveIndex,
            onComplete,
          );
        }
      } catch (e: any) {
        const msg = typeof e?.message === "string" && e.message.trim() ? e.message : "";
        notifyError(msg || memberPortalNetworkToastMessage(t));
        playMemberSpinMiss();
        highlightCancelRef.current?.();
        highlightCancelRef.current = null;
        setActiveIndex(-1);
        setSpinning(false);
      }
    });
    if (guarded === null) return;
  }, [member, spinning, remaining, prizes, spinGuard, t, applyQuota, refreshMember, applyFeedItems, refreshSimFeed]);

  const handleSpinAgain = useCallback(() => {
    setShowResult(false);
    window.setTimeout(() => void handleSpin(), 300);
  }, [handleSpin]);

  const lotteryLogsOnly = useMemo(
    () => logs.filter((log) => isLotteryPrizeLogType(log.prize_type)),
    [logs],
  );

  const visibleLogs = historyOpen ? lotteryLogsOnly : lotteryLogsOnly.slice(0, 3);

  /** 与原先「整页占位」一致：非加载且（活动关闭或无奖品配置）时由 Lottery 内部垂直居中占位 */
  const blocking = !quotaLoading && (!lotteryEnabled || prizes.length === 0);

  if (!member) return null;

  const spinLogEmoji = (prizeType: string) => {
    if (prizeType === "points") return "🎁";
    if (prizeType === "custom") return "💎";
    return "💨";
  };

  const spinLogTitleClass = (prizeType: string) => {
    if (prizeType === "points") return "text-pu-gold-soft";
    if (prizeType === "custom") return "text-pu-emerald-soft";
    return "text-[hsl(var(--pu-m-text))]";
  };

  return (
      <div
        className={cn(
          "member-page-enter m-page-bg relative flex min-h-full flex-col lg:mx-auto lg:w-full lg:max-w-[960px] lg:px-6 lg:py-6",
          blocking && "justify-center",
        )}
      >
        <MemberPageAmbientOrbs />
        <div className={cn("relative z-[1] flex min-h-full flex-col", blocking && "min-h-0 flex-1 justify-center")}>

        {/* ── Header: title + inline quota ── */}
        <div className={cn("relative flex items-center justify-between px-5 pb-3 pt-7", blocking && "hidden")}>
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 text-lg font-extrabold text-[hsl(var(--pu-m-text))]">
              <Star className="h-5 w-5 text-pu-rose-soft" aria-hidden />
              {t("幸运抽奖", "Lucky draw")}
            </h1>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-pu-gold/20 bg-[hsl(var(--pu-m-surface)/0.4)] px-3.5 py-1.5">
            <Trophy className="h-4 w-4 text-pu-gold-soft" strokeWidth={2} aria-hidden />
            {quotaLoading ? (
              <span className="inline-block h-5 w-12 animate-pulse rounded bg-[hsl(var(--pu-m-surface)/0.4)] motion-reduce:animate-none" aria-hidden />
            ) : (
              <span className="text-sm font-extrabold tabular-nums text-[hsl(var(--pu-m-text))]">
                {remaining}
                {quotaTotalToday > 0 && (
                  <span className="font-bold text-[hsl(var(--pu-m-text-dim)/0.4)]"> / {quotaTotalToday}</span>
                )}
              </span>
            )}
          </div>
        </div>

        {/* ── Winner feed marquee（结构常驻，无数据时 opacity / maxHeight 收起，避免插入 DOM 时闪现）── */}
        <div
          className={cn("mb-4 px-5 will-change-[opacity]", blocking && "hidden")}
          style={{
            opacity: simFeedDisplayItems.length > 0 ? 1 : 0,
            maxHeight: simFeedDisplayItems.length > 0 ? "4rem" : "0px",
            overflow: "hidden",
            transitionProperty: "opacity, max-height",
            transitionDuration: "220ms",
            transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)",
          }}
          aria-hidden={simFeedDisplayItems.length === 0}
        >
          <div
            className={cn(
              "member-spin-sim-feed relative cursor-pointer overflow-hidden rounded-xl bg-[hsl(var(--pu-m-surface)/0.3)] py-2 select-none touch-manipulation",
              simFeedClickPaused && "member-spin-sim-feed--click-paused",
              simFeedDisplayItems.length === 0 && "pointer-events-none",
            )}
            role="status"
            aria-live="polite"
            title={t("点击暂停三秒", "Tap to pause for 3 seconds")}
            onClick={onSimFeedStripClick}
          >
            <div className="relative min-w-0 w-full overflow-hidden px-1">
              <div
                className="member-spin-sim-feed__track inline-flex w-max max-w-none items-center animate-[marquee_18s_linear_infinite]"
                style={{ animationDuration: `${simFeedMarqueeDurationSec}s` }}
              >
                {simFeedDisplayItems.length > 0 ? (
                  [0, 1].map((copyIdx) => (
                    <span key={copyIdx} className="inline-flex shrink-0 items-center">
                      {simFeedDisplayItems.map((it, i) => (
                        <span key={`${it.id}-${i}`} className="inline-flex shrink-0 items-center">
                          {i > 0 && (
                            <span className="mx-2.5 inline-block h-3 w-px shrink-0 rounded-full bg-[hsl(var(--pu-m-text)/0.2)]" aria-hidden />
                          )}
                          <span className="whitespace-nowrap px-1.5 py-0.5 text-[11px] font-medium text-[hsl(var(--pu-m-text-dim)/0.85)]">
                            {normalizeSpinSimFeedLineForMember(it.text)}
                          </span>
                        </span>
                      ))}
                      <span className="mx-2.5 inline-block h-3 w-px shrink-0 rounded-full bg-[hsl(var(--pu-m-text)/0.2)]" aria-hidden />
                    </span>
                  ))
                ) : (
                  <span className="inline-flex shrink-0 items-center whitespace-nowrap px-1.5 py-0.5 text-[11px] font-medium text-transparent" aria-hidden>
                    —
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Main content area ── */}
        <main
          className={cn(
            "relative mx-auto w-full max-w-md flex-1 space-y-5 px-5 lg:max-w-lg",
            blocking && "flex min-h-0 flex-col justify-center space-y-5",
          )}
        >
          <Lottery
            loading={quotaLoading}
            blocking={blocking}
            lotteryEnabled={lotteryEnabled}
            loadError={loadError}
            prizes={prizes}
            activeIndex={activeIndex}
            spinning={spinning}
            remaining={remaining}
            showResult={showResult}
            result={result}
            onSpin={handleSpin}
            t={t}
          />

          {/* ── Prizes list (collapsible) ── */}
          <Collapsible open={prizesPanelOpen} onOpenChange={setPrizesPanelOpen} className={cn(blocking && "hidden")}>
            <CollapsibleTrigger
              type="button"
              className="flex w-full items-center justify-between rounded-lg px-1 py-1.5 text-left text-xs font-bold text-[hsl(var(--pu-m-text-dim)/0.8)] outline-none member-transition-color member-motion-fast hover:text-[hsl(var(--pu-m-text)/0.92)] focus-visible:ring-2 focus-visible:ring-pu-gold/40"
              aria-expanded={prizesPanelOpen}
            >
              <span className="flex items-center gap-1.5">
                <Info className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
                {t("活动奖品", "Prizes")}
              </span>
              <ChevronDown
                className={cn("h-3.5 w-3.5 shrink-0 opacity-60 transition-transform member-motion-fast motion-reduce:transition-none", prizesPanelOpen && "rotate-180")}
                aria-hidden
              />
            </CollapsibleTrigger>
            <CollapsibleContent className="overflow-hidden">
              <div className="mt-1 rounded-xl border border-[hsl(var(--pu-m-surface-border)/0.12)] bg-[hsl(var(--pu-m-surface)/0.3)] p-3.5">
                {probabilityNotice && (
                  <p className="mb-2.5 whitespace-pre-wrap break-words text-[11px] leading-relaxed text-[hsl(var(--pu-m-text)/0.8)]">
                    {probabilityNotice}
                  </p>
                )}
                <div className="space-y-2">
                  {prizes.length === 0 ? (
                    <p className="text-center text-[11px] text-[hsl(var(--pu-m-text-dim)/0.6)]">
                      {t("未配置转盘奖品", "No wheel prizes configured")}
                    </p>
                  ) : (
                    prizes.map((p) => {
                      const probLabel = formatPrizeListDisplayProbability(p);
                      return (
                        <div
                          key={p.id ?? `${p.name}-${p.sort_order}`}
                          className="flex items-center justify-between gap-3 text-xs text-[hsl(var(--pu-m-text)/0.88)]"
                        >
                          <span className="min-w-0 flex-1 truncate font-medium">
                            {spinWheelPrizeMainText(t, p)}
                          </span>
                          {probLabel && (
                            <span className="shrink-0 tabular-nums text-[11px] text-[hsl(var(--pu-m-text-dim)/0.6)]">
                              {probLabel}
                            </span>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* ── Spin history ── */}
          <section aria-labelledby="member-spin-history-heading" className={cn(blocking && "hidden")}>
            <div className="mb-2 flex items-center gap-2 px-1">
              <History className="h-3.5 w-3.5 text-[hsl(var(--pu-m-text-dim)/0.7)]" strokeWidth={2} aria-hidden />
              <h2 id="member-spin-history-heading" className="m-0 text-sm font-extrabold text-[hsl(var(--pu-m-text))]">
                {t("抽奖记录", "Spin history")}
              </h2>
              {lotteryLogsOnly.length > 0 && (
                <span className="ml-auto text-[10px] tabular-nums text-[hsl(var(--pu-m-text-dim)/0.45)]">
                  {logsTotal > SPIN_LOG_LIMIT
                    ? t(`最近 ${SPIN_LOG_LIMIT} 条 / ${logsTotal}`, `${SPIN_LOG_LIMIT} / ${logsTotal}`)
                    : `${lotteryLogsOnly.length}`}
                </span>
              )}
            </div>

            <div id="member-spin-history-panel" className="rounded-xl border border-[hsl(var(--pu-m-surface-border)/0.12)] bg-[hsl(var(--pu-m-surface)/0.3)] px-3.5">
            {lotteryLogsOnly.length === 0 ? (
              <div className="px-2 py-8 text-center">
                <p className="text-sm font-semibold text-[hsl(var(--pu-m-text))]">{t("暂无抽奖记录", "No spin records yet")}</p>
                <p className="mt-1 text-[11px] text-[hsl(var(--pu-m-text-dim)/0.6)]">
                  {t("转动转盘后记录将出现在此", "Spin the wheel to see results here")}
                </p>
                <MemberEmptyStateCta
                  anchorPrimary={{ href: "#member-spin-wheel", label: t("去转盘抽奖", "Spin the wheel") }}
                  secondary={{ to: ROUTES.MEMBER.DASHBOARD, label: t("做任务赚次数", "Earn spins from tasks") }}
                />
              </div>
            ) : (
              <>
                {visibleLogs.map((log) => (
                  <div
                    key={log.id}
                    className="flex items-center gap-2.5 border-b border-[hsl(var(--pu-m-surface-border)/0.1)] py-3 last:border-0"
                  >
                    <span className="text-base shrink-0" aria-hidden>
                      {spinLogEmoji(log.prize_type)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className={cn("truncate text-[13px] font-bold", spinLogTitleClass(log.prize_type))}>
                        {log.prize_name}
                        {log.prize_type === "points" && (log.reward_points ?? log.prize_value) > 0 && (
                          <span className="ml-1 tabular-nums text-pu-gold-soft">+{log.reward_points ?? log.prize_value}</span>
                        )}
                        {log.reward_status === "failed" && (
                          <span className="ml-1 text-[10px] font-medium text-red-400">{t("(发放中)", "(processing)")}</span>
                        )}
                        {log.reward_status === "pending" && log.reward_type === "manual" && (
                          <span className="ml-1 text-[10px] font-medium text-amber-400">{t("(待处理)", "(pending)")}</span>
                        )}
                      </div>
                      <div className="mt-0.5 text-[10px] font-medium text-[hsl(var(--pu-m-text-dim)/0.55)]">
                        {formatMemberLocalTime(log.created_at)}
                      </div>
                    </div>
                  </div>
                ))}

                {lotteryLogsOnly.length > 3 && (
                  <button
                    type="button"
                    onClick={() => setHistoryOpen(!historyOpen)}
                    aria-expanded={historyOpen}
                    aria-controls="member-spin-history-panel"
                    className="flex min-h-[40px] w-full items-center justify-center gap-1.5 py-2.5 text-[12px] font-semibold text-[hsl(var(--pu-m-text-dim)/0.65)] touch-manipulation member-transition-color member-motion-fast hover:text-[hsl(var(--pu-m-text))]"
                  >
                    {historyOpen
                      ? t("收起", "Show less")
                      : t(`展开全部 ${lotteryLogsOnly.length} 条`, `Show all ${lotteryLogsOnly.length}`)}
                    <ChevronDown
                      size={14}
                      className={cn("transition-transform member-motion-fast motion-reduce:transition-none", historyOpen && "rotate-180")}
                      aria-hidden
                    />
                  </button>
                )}
              </>
            )}
            </div>
          </section>
        </main>

        <SpinResultDrawer
          open={showResult}
          onOpenChange={setShowResult}
          result={result ?? null}
          lastDrawRewardPoints={lastDrawRewardPoints}
          lastDrawRewardStatus={lastDrawRewardStatus}
          lastDrawMeta={lastDrawMeta}
          remaining={remaining}
          onClose={() => setShowResult(false)}
          onSpinAgain={handleSpinAgain}
          t={t}
        />
        </div>
      </div>
  );
}
