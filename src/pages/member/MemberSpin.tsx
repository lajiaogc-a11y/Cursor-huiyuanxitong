import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useMemberPullRefreshSignal } from "@/hooks/useMemberPullRefreshSignal";
import { formatMemberLocalTime } from "@/lib/memberLocalTime";
import { Gift, History, Trophy, Star, Sparkles, ChevronDown, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LoadingButton } from "@/components/ui/LoadingButton";
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
import { getSpinSimFeed, type SpinSimFeedItem } from "@/services/lottery/lotteryService";
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
import type { QuotaResult } from "@/services/lottery/lotteryService";
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
import { DrawerDetail } from "@/components/shell/DrawerDetail";
import { cn } from "@/lib/utils";
import { ROUTES } from "@/routes/constants";
import { memberPortalNetworkToastMessage } from "@/lib/memberPortalUx";
import { fireMemberSpinWinConfetti } from "@/lib/memberPortalConfetti";
import { MemberEmptyStateCta } from "@/components/member/MemberEmptyStateCta";
import "@/styles/member-portal.css";

const GRID_ORDER = [
  { row: 0, col: 0 },
  { row: 0, col: 1 },
  { row: 0, col: 2 },
  { row: 1, col: 2 },
  { row: 2, col: 2 },
  { row: 2, col: 1 },
  { row: 2, col: 0 },
  { row: 1, col: 0 },
];

/** Member spin history: show at most this many latest rows (no extra pagination on page). */
const SPIN_LOG_LIMIT = 100;

/** 积分类：后台配置的数值；非有限数字时返回 null */
function spinPrizePointsValue(p: LotteryPrize): number | null {
  if (p.type !== "points") return null;
  const v = Number(p.value);
  return Number.isFinite(v) ? v : null;
}

/**
 * 转盘格子 / 奖品列表主文案：不展示几等奖与概率；积分类只强调后台 value（如 积分 10 / Points 10）
 */
function spinWheelPrizeMainText(t: (z: string, e: string) => string, prize: LotteryPrize): string {
  const pts = spinPrizePointsValue(prize);
  if (pts != null) return t(`积分 ${pts}`, `Points ${pts}`);
  if (prize.type === "custom") return prize.name?.trim() || t("实物奖品", "Prize");
  return prize.name?.trim() || t("谢谢参与", "Thanks for playing");
}

function prizeDisplayTier(p: LotteryPrize): "legendary" | "epic" | "rare" | "common" | "miss" {
  if (p.type === "none") return "miss";
  const raw = Number(p.probability);
  if (!Number.isFinite(raw)) return "common";
  if (raw <= 0) return "common";
  if (raw < 0.05) return "legendary";
  if (raw < 1) return "epic";
  if (raw < 15) return "rare";
  return "common";
}

function prizeTierIconColor(tier: ReturnType<typeof prizeDisplayTier>): string {
  switch (tier) {
    case "legendary": return "text-pu-gold-soft";
    case "epic": return "text-pu-rose-soft";
    case "rare": return "text-pu-emerald-soft";
    default: return "text-[hsl(var(--pu-m-text-dim)/0.5)]";
  }
}

function prizeTierBadgeBg(tier: ReturnType<typeof prizeDisplayTier>): string {
  switch (tier) {
    case "legendary": return "bg-pu-gold/20 ring-pu-gold/30";
    case "epic": return "bg-pu-rose/15 ring-pu-rose/25";
    case "rare": return "bg-pu-emerald/15 ring-pu-emerald/25";
    default: return "bg-pu-gold/10 ring-pu-gold/15";
  }
}

/**
 * 会员端「活动奖品」列表右侧概率：优先后台「展示用概率」；
 * 未配置展示概率时按 lotteryService 约定回退为真实 probability（转盘格子上仍不显示）。
 */
function formatPrizeListDisplayProbability(p: LotteryPrize): string | null {
  const pick =
    p.display_probability != null && Number.isFinite(Number(p.display_probability))
      ? Number(p.display_probability)
      : Number(p.probability);
  if (!Number.isFinite(pick)) return null;
  return `${pick.toFixed(4)}%`;
}

/**
 * 九宫格奖品格：与页面上方「今日抽奖次数」卡同一套 m-glass + 金边 + 金→玫瑰晕（iOS 式圆角框架根色）
 */
const SPIN_PRIZE_CELL_FRAME =
  "m-glass relative flex min-h-0 min-w-0 overflow-hidden rounded-2xl border border-pu-gold/20 bg-[hsl(var(--pu-m-surface)/0.45)] shadow-sm";

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

if (typeof window !== "undefined") {
  window.addEventListener("member:signout", () => _spinCache.clear());
}

/** Member spin page: duplicate-tap guard via spinGuard + spinning/remaining. */
export default function MemberSpin() {
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
  /** 每次 feed 数据真正变化时递增，用作滚动轨道 key 触发动画平滑重启 */
  const [feedVersion, setFeedVersion] = useState(0);
  const simFeedLastKnownRef = useRef<SpinSimFeedItem[]>([]);
  /** 点击中奖滚动条后暂停 3 秒再继续 */
  const [simFeedClickPaused, setSimFeedClickPaused] = useState(false);
  const simFeedClickPauseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  /** Update feed state; bump feedVersion only when content actually changed */
  const applyFeedItems = useCallback((incoming: SpinSimFeedItem[]) => {
    setSimFeedItems((prev) => {
      const next = mergeFeedItems(prev, incoming);
      const prevIds = prev.map((x) => x.id).join(',');
      const nextIds = next.map((x) => x.id).join(',');
      if (prevIds !== nextIds) {
        setFeedVersion((v) => v + 1);
      }
      return next;
    });
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

  const prizeCount = prizes.length;

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
        if (typeof r.remaining === "number") {
          setRemaining(r.remaining);
          setQuotaUsedToday((u) => u + 1);
        }
        setLastDrawRewardPoints(r.reward_points);
        setLastDrawRewardStatus(r.reward_status);
        setLastDrawMeta({ budget_warning: r.budget_warning, risk_downgraded: r.risk_downgraded });

        let targetIdx = prizes.findIndex((p) => p.id === prize.id);
        if (targetIdx < 0) {
          targetIdx = prizes.findIndex((p) => p.name === prize.name && p.type === prize.type);
        }

        const onComplete = () => {
          setActiveIndex(-1);
          setResult(prize);
          setShowResult(true);
          if (prize.type === "points" || prize.type === "custom") {
            playMemberSpinWin();
            if (navigator.vibrate) navigator.vibrate([50, 30, 80]);
            fireMemberSpinWinConfetti(prizeDisplayTier(prize));
          } else {
            playMemberSpinMiss();
          }
          getLotteryQuota(member.id)
            .then(applyQuota)
            .catch(() => { /* post-draw quota refresh is best-effort */ });
          loadMemberSpinLogs(member.id, { limit: SPIN_LOG_LIMIT, offset: 0 })
            .then(({ logs: list, total }) => {
              setLogs(list);
              setLogsTotal(total);
            })
            .catch(() => { /* post-draw log refresh is best-effort */ });
          void refreshMember().catch(() => {});
          void queryClient.invalidateQueries({ queryKey: memberQueryKeys.spin(member.id) });
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

  const lotteryLogsOnly = useMemo(
    () => logs.filter((log) => isLotteryPrizeLogType(log.prize_type)),
    [logs],
  );

  const visibleLogs = historyOpen ? lotteryLogsOnly : lotteryLogsOnly.slice(0, 3);

  if (!member) return null;

  if (!lotteryEnabled && !quotaLoading) {
    return (
      <div className="member-page-enter relative m-page-bg flex min-h-full flex-col items-center justify-center px-4 pb-24 pt-8 lg:px-8">
        <MemberPageAmbientOrbs />
        <div className="relative z-[1] mx-auto w-full max-w-md space-y-4 lg:max-w-lg">
          <div className="relative overflow-hidden rounded-2xl border border-dashed border-pu-gold/22 bg-gradient-to-b from-pu-gold/[0.08] via-[hsl(var(--pu-m-surface)/0.22)] to-[hsl(var(--pu-m-surface)/0.28)] px-5 py-12 text-center">
            <div className="relative">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-pu-gold/20 bg-pu-gold/10 text-pu-gold-soft opacity-60">
                <Gift className="h-7 w-7" strokeWidth={1.75} aria-hidden />
              </div>
              <p className="m-0 text-sm font-semibold text-[hsl(var(--pu-m-text))]">
                {t("抽奖活动暂未开启", "Lottery is not open")}
              </p>
              <p className="mt-1.5 text-[11px] leading-relaxed text-[hsl(var(--pu-m-text-dim)/0.65)]">
                {t("活动开启后即可参与抽奖，请稍后再来。", "The lottery will be available once the event starts. Please check back later.")}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (prizes.length === 0 && !quotaLoading) {
    return (
      <div className="member-page-enter relative m-page-bg flex min-h-full flex-col items-center justify-center px-4 pb-24 pt-8 lg:px-8">
        <MemberPageAmbientOrbs />
        <div className="relative z-[1] mx-auto w-full max-w-md space-y-4 lg:max-w-lg">
          <div className="relative overflow-hidden rounded-2xl border border-dashed border-pu-gold/22 bg-gradient-to-b from-pu-gold/[0.08] via-[hsl(var(--pu-m-surface)/0.22)] to-[hsl(var(--pu-m-surface)/0.28)] px-5 py-12 text-center">
            <div className="relative">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-pu-gold/20 bg-pu-gold/10 text-pu-gold-soft">
              <Gift className="h-7 w-7" strokeWidth={1.75} aria-hidden />
            </div>
            <p className="m-0 text-sm font-semibold text-[hsl(var(--pu-m-text))]">
              {loadError
                ? t("抽奖加载失败", "Failed to load lottery")
                : t("尚未配置抽奖活动", "Lottery is not configured yet")}
            </p>
            <p className="mt-1.5 text-[11px] leading-relaxed text-[hsl(var(--pu-m-text-dim)/0.65)]">
              {loadError
                ? t("点击重试或稍后再打开本页。", "Tap retry or open this page again later.")
                : t("开启活动并配置奖品后即可抽奖。", "Enable the activity and add prizes to spin.")}
            </p>
            {loadError ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="mt-4 rounded-xl border-[hsl(var(--pu-m-surface-border)/0.35)] bg-[hsl(var(--pu-m-surface)/0.45)] text-[hsl(var(--pu-m-text))] hover:bg-[hsl(var(--pu-m-surface)/0.6)]"
                onClick={() => window.location.reload()}
              >
                {t("重试", "Retry")}
              </Button>
            ) : null}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const resultModalContent = () => {
    if (!result) return null;
    if (result.type === "points") {
      const displayPoints = lastDrawRewardPoints ?? result.value;
      const rewardFailed = lastDrawRewardStatus === 'failed';
      return (
        <div className="px-1 py-3 text-center">
          <div className="mb-2 text-5xl" role="img" aria-hidden>
            {rewardFailed ? '⚠️' : '🎉'}
          </div>
          <p className="m-0 mb-1 text-xl font-extrabold text-pu-gold-soft">
            {rewardFailed
              ? t('积分发放异常，请稍后查看账户', 'Points delivery issue. Please check your account later.')
              : t(`恭喜获得 ${displayPoints} 积分！`, `Congrats! You won ${displayPoints} points!`)}
          </p>
          <p className="m-0 text-[13px] text-[hsl(var(--pu-m-text-dim)/0.85)]">
            {rewardFailed
              ? t('系统将自动补发，无需重复操作', 'System will auto-retry. No action needed.')
              : t("积分已发放到账户", "Points credited to your account")}
          </p>
        </div>
      );
    }
    if (result.type === "custom") {
      return (
        <div className="px-1 py-3 text-center">
          <div className="mb-2 text-5xl" role="img" aria-hidden>
            🎁
          </div>
          <p className="m-0 mb-1 text-xl font-extrabold text-pu-emerald-soft">
            {t(`中奖：${result.name}`, `You won: ${result.name}`)}
          </p>
          {result.description ? (
            <p className="mx-auto mb-3 max-w-sm text-[13px] leading-relaxed text-[hsl(var(--pu-m-text-dim)/0.85)]">
              {result.description}
            </p>
          ) : null}
          <div className="inline-block rounded-xl border border-pu-emerald/30 bg-pu-emerald/12 px-3.5 py-2 text-xs font-semibold text-pu-emerald-soft">
            {t("奖品将由客服为您处理", "Prize will be processed by customer service")}
          </div>
        </div>
      );
    }
    return (
      <div className="px-1 py-3 text-center">
        <div className="mb-2 text-5xl" role="img" aria-hidden>
          😊
        </div>
        <p className="m-0 mb-1 text-lg font-bold text-[hsl(var(--pu-m-text))]">
          {t("感谢参与！", "Thanks for playing!")}
        </p>
        <p className="m-0 text-[13px] text-[hsl(var(--pu-m-text-dim)/0.8)]">
          {lastDrawMeta?.risk_downgraded
            ? t("操作频率较高，请稍后再试可获得更好奖品。", "High activity detected. Try again later for better rewards.")
            : lastDrawMeta?.budget_warning === "BUDGET_EXCEEDED" || lastDrawMeta?.budget_warning === "RTP_LIMIT_REACHED"
              ? t("今日奖池接近上限，明天会有更多惊喜！", "Today's prizes are running low. More surprises tomorrow!")
              : t("下次好运！", "Better luck next time!")}
        </p>
      </div>
    );
  };

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
      <div className="member-page-enter m-page-bg relative flex min-h-full flex-col pb-24 lg:mx-auto lg:w-full lg:max-w-[960px] lg:px-6 lg:py-6">
        <MemberPageAmbientOrbs />
        <div className="relative z-[1] flex min-h-full flex-col">

        {/* ── Header: title + inline quota ── */}
        <div className="relative flex items-center justify-between px-5 pb-3 pt-7">
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

        {/* ── Winner feed marquee ── */}
        {simFeedDisplayItems.length > 0 && (
          <div className="mb-4 px-5">
            <div
              className={cn(
                "member-spin-sim-feed relative cursor-pointer overflow-hidden rounded-xl bg-[hsl(var(--pu-m-surface)/0.3)] py-2 select-none touch-manipulation",
                simFeedClickPaused && "member-spin-sim-feed--click-paused",
              )}
              role="status"
              aria-live="polite"
              title={t("点击暂停三秒", "Tap to pause for 3 seconds")}
              onClick={onSimFeedStripClick}
            >
              <div className="relative min-w-0 w-full overflow-hidden px-1">
                <div
                  key={feedVersion}
                  className="member-spin-sim-feed__track inline-flex w-max max-w-none items-center animate-[marquee_18s_linear_infinite]"
                  style={{ animationDuration: `${simFeedMarqueeDurationSec}s` }}
                >
                  {[0, 1].map((copyIdx) => (
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
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Main content area ── */}
        <main className="relative mx-auto w-full max-w-md flex-1 space-y-5 px-5 lg:max-w-lg">

          {/* ── Spin Grid ── */}
          <div id="member-spin-wheel" className="scroll-mt-24">
            <div className="relative m-glass overflow-hidden rounded-2xl border border-pu-gold/15 p-4 shadow-sm">
              <div className="pointer-events-none absolute inset-0 rounded-[inherit] bg-gradient-to-br from-pu-gold/[0.04] to-transparent" />
              <div
                className="relative grid aspect-square w-full grid-cols-3 grid-rows-3 gap-2.5"
                role="group"
                aria-label={t("转盘九宫格", "Spin wheel grid")}
              >
            {Array.from({ length: 9 }).map((_, cellIdx) => {
              if (cellIdx === 4) {
                return (
                  <LoadingButton
                    key="go-btn"
                    type="button"
                    variant="ghost"
                    loading={spinning}
                    disabled={spinning || remaining <= 0}
                    className={cn(
                      "btn-spin relative !flex !h-full !min-h-0 !w-full !min-w-0 flex-col touch-manipulation items-center justify-center gap-0.5 rounded-xl border-0 bg-transparent p-0 text-inherit shadow-none outline-none transition-opacity duration-150 hover:bg-transparent focus-visible:ring-2 focus-visible:ring-[hsl(var(--pu-gold))] focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--pu-m-surface))] [&_svg]:text-white",
                      spinning ? "cursor-wait opacity-80" : remaining <= 0 ? "cursor-not-allowed opacity-50" : "cursor-pointer",
                      "motion-reduce:transition-none",
                    )}
                    onClick={() => void handleSpin()}
                    aria-busy={spinning}
                    aria-disabled={remaining <= 0}
                    aria-label={
                      spinning
                        ? t("抽奖进行中…", "Spinning…")
                        : remaining <= 0
                          ? t("次数不足", "No draws left")
                          : t("抽奖", "Draw")
                    }
                  >
                    {!spinning && (
                      <span className="pointer-events-none absolute inset-0 rounded-[inherit] spin-ring" />
                    )}
                    {!spinning && (
                      <Sparkles size={22} className="text-white drop-shadow-[0_1px_2px_rgb(0_0_0_/_0.25)]" aria-hidden />
                    )}
                    <span className="text-sm font-extrabold text-white [text-shadow:0_1px_2px_rgb(0_0_0_/_0.2)]">
                      {spinning ? t("抽奖中", "Spinning") : t("抽奖", "Draw")}
                    </span>
                    <span className="text-[10px] font-bold text-[hsl(0_0%_100%_/_0.78)]">
                      {t(`剩余 ${remaining} 次`, `${remaining} left`)}
                    </span>
                  </LoadingButton>
                );
              }

              const row = Math.floor(cellIdx / 3);
              const col = cellIdx % 3;
              const prizeIdx = GRID_ORDER.findIndex(
                (g) => g.row === row && g.col === col
              );
              if (prizeIdx < 0 || prizeIdx >= prizeCount) {
                return (
                  <div
                    key={cellIdx}
                    className={cn(SPIN_PRIZE_CELL_FRAME, "items-center justify-center rounded-xl")}
                  >
                    <Star className="relative z-10 h-4 w-4 text-[hsl(var(--pu-m-text-dim)/0.15)]" aria-hidden />
                  </div>
                );
              }
              const prize = prizes[prizeIdx];
              const isActive = activeIndex === prizeIdx;
              const isWinner = showResult && result?.id === prize.id && !spinning;
              const wheelMain = spinWheelPrizeMainText(t, prize);
              const tier = prizeDisplayTier(prize);

              const highlightClass = isActive
                ? "ring-2 ring-pu-gold scale-[1.03] shadow-pu-glow-gold"
                : isWinner
                  ? "ring-2 ring-pu-gold scale-[1.05] shadow-pu-glow-gold"
                  : "motion-safe:hover:scale-[1.01]";

              return (
                <div
                  key={cellIdx}
                  className={cn(
                    SPIN_PRIZE_CELL_FRAME,
                    "flex flex-col items-center justify-center gap-0.5 rounded-xl p-1.5 transition-all duration-150 motion-reduce:transition-none",
                    highlightClass,
                  )}
                >
                  <div className="pointer-events-none absolute inset-0 rounded-[inherit] bg-gradient-to-br from-pu-gold/[0.04] to-transparent" />
                  {isActive && (
                    <div className="pointer-events-none absolute inset-0 rounded-[inherit] bg-gradient-to-br from-pu-gold/[0.12] to-transparent" />
                  )}
                  {isWinner && (
                    <div className="pointer-events-none absolute inset-0 animate-pulse rounded-[inherit] bg-gradient-to-br from-pu-gold/[0.15] to-pu-rose/[0.05] motion-reduce:animate-none" />
                  )}
                  <div className={cn(
                    "relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset",
                    prizeTierBadgeBg(tier),
                  )}>
                    {prize.type === "points" ? (
                      <Star className={cn("h-3 w-3", prizeTierIconColor(tier))} strokeWidth={2} aria-hidden />
                    ) : prize.type === "none" ? (
                      <Sparkles className={cn("h-3 w-3", prizeTierIconColor(tier))} strokeWidth={2} aria-hidden />
                    ) : (
                      <Gift className={cn("h-3 w-3", prizeTierIconColor(tier))} strokeWidth={2} aria-hidden />
                    )}
                  </div>
                  <span
                    className={cn(
                      "relative z-10 line-clamp-2 w-full max-w-full px-0.5 text-center text-[10px] font-bold leading-tight tabular-nums",
                      isActive ? "text-pu-gold-soft" : "text-[hsl(var(--pu-m-text)/0.85)]",
                    )}
                  >
                    {wheelMain}
                  </span>
                </div>
              );
            })}
            </div>

            {remaining > 0 && !spinning && (
              <p className="relative mt-2.5 text-center text-[11px] leading-relaxed text-[hsl(var(--pu-m-text-dim)/0.65)]">
                {t("再试一次，更大惊喜等你！", "Try again for a bigger reward!")}
              </p>
            )}
            {remaining <= 0 && !spinning && (
              <p className="relative mt-2.5 text-center text-[11px] leading-relaxed text-[hsl(var(--pu-m-text-dim)/0.5)]">
                {t("签到、邀请或分享可获取更多次数", "Check in, invite friends or share to earn more spins")}
              </p>
            )}
            </div>
          </div>

          {/* ── Prizes list (collapsible) ── */}
          <Collapsible open={prizesPanelOpen} onOpenChange={setPrizesPanelOpen}>
            <CollapsibleTrigger
              type="button"
              className="flex w-full items-center justify-between rounded-lg px-1 py-1.5 text-left text-xs font-bold text-[hsl(var(--pu-m-text-dim)/0.8)] outline-none transition-colors hover:text-[hsl(var(--pu-m-text)/0.92)] focus-visible:ring-2 focus-visible:ring-pu-gold/40"
              aria-expanded={prizesPanelOpen}
            >
              <span className="flex items-center gap-1.5">
                <Info className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
                {t("活动奖品", "Prizes")}
              </span>
              <ChevronDown
                className={cn("h-3.5 w-3.5 shrink-0 opacity-60 transition-transform duration-200", prizesPanelOpen && "rotate-180")}
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
          <section aria-labelledby="member-spin-history-heading">
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
                    className="flex min-h-[40px] w-full items-center justify-center gap-1.5 py-2.5 text-[12px] font-semibold text-[hsl(var(--pu-m-text-dim)/0.65)] touch-manipulation transition hover:text-[hsl(var(--pu-m-text))]"
                  >
                    {historyOpen
                      ? t("收起", "Show less")
                      : t(`展开全部 ${lotteryLogsOnly.length} 条`, `Show all ${lotteryLogsOnly.length}`)}
                    <ChevronDown
                      size={14}
                      className={cn("transition-transform duration-200 motion-reduce:transition-none", historyOpen && "rotate-180")}
                      aria-hidden
                    />
                  </button>
                )}
              </>
            )}
            </div>
          </section>
        </main>

        <DrawerDetail
          open={showResult}
          onOpenChange={setShowResult}
          variant="member"
          title={
            <span className="inline-flex items-center gap-2">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-pu-gold/30 bg-gradient-to-br from-pu-gold/20 to-pu-gold/[0.05]">
                <Trophy className="text-pu-gold-soft" size={16} strokeWidth={2.2} aria-hidden />
              </span>
              {t("抽奖结果", "Spin result")}
            </span>
          }
          description={
            result?.type === "points"
              ? t("积分已计入您的账户", "Points were credited to your account")
              : result?.type === "custom"
                ? t("您获得的奖品", "Your prize")
                : t("谢谢参与", "Thanks for playing")
          }
          sheetMaxWidth="xl"
        >
          <div className="space-y-4">
            {resultModalContent()}
            <div className="flex flex-col gap-2.5 border-t border-pu-gold/10 pt-4">
              {remaining > 0 && (
                <Button
                  type="button"
                  className="btn-glow h-11 w-full rounded-xl border-0 text-[15px] font-bold text-[hsl(var(--pu-primary-foreground))] shadow-[0_4px_14px_hsl(var(--pu-gold)/0.25)] hover:opacity-95"
                  onClick={() => {
                    setShowResult(false);
                    setTimeout(handleSpin, 300);
                  }}
                >
                  {t("再抽一次", "Spin again")}
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                className="h-10 w-full rounded-xl border-[hsl(var(--pu-m-surface-border)/0.2)] bg-[hsl(var(--pu-m-surface)/0.5)] text-sm text-[hsl(var(--pu-m-text)/0.9)] hover:bg-[hsl(var(--pu-m-surface)/0.7)]"
                onClick={() => setShowResult(false)}
              >
                {t("关闭", "Close")}
              </Button>
            </div>
          </div>
        </DrawerDetail>
        </div>
      </div>
  );
}
