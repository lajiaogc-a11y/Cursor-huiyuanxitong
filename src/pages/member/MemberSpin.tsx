import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useMemberPullRefreshSignal } from "@/hooks/useMemberPullRefreshSignal";
import { formatMemberLocalTime } from "@/lib/memberLocalTime";
import { Gift, History, Trophy, Star, Sparkles, ChevronDown, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMemberAuth } from "@/contexts/MemberAuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useActionGuard } from "@/lib/actionGuard";
import { toast } from "sonner";
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

/** Probability help: 4 decimal places so tiny odds (e.g. 0.0001%) do not show as 0%. */
/** 会员端公示用：有 display_probability 则用其，否则用真实 probability */
function prizePublishedPercentSource(p: LotteryPrize): unknown {
  const d = p.display_probability;
  if (d != null && Number.isFinite(Number(d))) return Number(d);
  return p.probability;
}

function formatPublishedProbabilityPercent(probability: unknown): string {
  const raw =
    typeof probability === "number"
      ? probability
      : Number(String(probability ?? "").replace(/%/g, "").trim());
  if (!Number.isFinite(raw)) return "—";
  return raw.toFixed(4);
}

const SPIN_TIER_ZH = ["一", "二", "三", "四", "五", "六", "七", "八"] as const;
const SPIN_TIER_EN = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th"] as const;

/** 九宫格槽位 0～7 对应一等奖～八等奖（与后台奖品顺序一致） */
function spinPrizeTierLabel(t: (z: string, e: string) => string, prizeIdx: number): string {
  const i = Math.min(7, Math.max(0, prizeIdx));
  return t(`第${SPIN_TIER_ZH[i]}等奖`, `${SPIN_TIER_EN[i]} prize`);
}

/** 九宫格奖品格描边档位（对齐设计稿 premium-ui-boost MemberSpin） */
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

function prizeCellTierCn(tier: ReturnType<typeof prizeDisplayTier>) {
  return cn(
    tier === "legendary" &&
      "border-pu-rose/30 bg-pu-rose/[0.08] shadow-[0_0_16px_hsl(12_85%_60%/0.1)]",
    tier === "epic" && "border-pu-gold/25 bg-pu-gold/[0.06]",
    tier === "rare" && "border-pu-emerald/25 bg-pu-emerald/[0.05]",
    tier === "common" && "border-[hsl(var(--pu-m-surface-border)/0.22)] bg-[hsl(var(--pu-m-surface)/0.35)]",
    tier === "miss" && "border-[hsl(var(--pu-m-surface-border)/0.12)] bg-[hsl(var(--pu-m-surface)/0.2)]",
  );
}

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

/** Member spin page: duplicate-tap guard via spinGuard + spinning/remaining. */
export default function MemberSpin() {
  const { member } = useMemberAuth();
  const { t } = useLanguage();
  const spinGuard = useActionGuard(1000);
  const cached = member ? _spinCache.get(member.id) : undefined;

  const [spinning, setSpinning] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [result, setResult] = useState<DrawResult["prize"] | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [prizes, setPrizes] = useState<LotteryPrize[]>(cached?.prizes ?? []);
  const [remaining, setRemaining] = useState(cached?.remaining ?? 0);
  const [quotaUsedToday, setQuotaUsedToday] = useState(cached?.quotaUsedToday ?? 0);
  const [quotaLoading, setQuotaLoading] = useState(!cached);
  const [loadError, setLoadError] = useState(false);
  const [logs, setLogs] = useState<LotteryLog[]>(cached?.logs ?? []);
  const [logsTotal, setLogsTotal] = useState(cached?.logsTotal ?? 0);
  const [probabilityNotice, setProbabilityNotice] = useState<string | null>(cached?.probabilityNotice ?? null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [pullNonce, setPullNonce] = useState(0);
  /** 定时刷新 / 切回前台时递增，与下拉刷新一样重新拉奖品与「概率说明」 */
  const [spinDataRefreshNonce, setSpinDataRefreshNonce] = useState(0);
  const highlightCancelRef = useRef<(() => void) | null>(null);

  const [simFeedItems, setSimFeedItems] = useState<SpinSimFeedItem[]>([]);
  /** 与首页公告跑马灯一致：MemberDashboard `Math.max(14, announcementItems.length * 5)` */
  const simFeedMarqueeDurationSec = useMemo(
    () => Math.max(14, simFeedItems.length * 5),
    [simFeedItems.length],
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
  }, [member?.id]);

  const applyQuota = useCallback((q: Pick<QuotaResult, "remaining" | "used_today">) => {
    setRemaining(q.remaining);
    setQuotaUsedToday(q.used_today ?? 0);
  }, []);

  const quotaTotalToday = remaining + quotaUsedToday;

  useEffect(() => {
    if (!member) return;
    setLoadError(false);
    if (!_spinCache.has(member.id)) setQuotaLoading(true);
    loadMemberSpinPrizesAndQuota(member.id)
      .then(({ prizes: raw, quotaRemaining, quotaUsedToday: used, probability_notice }) => {
        setProbabilityNotice(probability_notice ?? null);
        const grid = pickGridPrizesForSpinPage(raw);
        if (grid.length > 0) setPrizes(grid);
        setRemaining(quotaRemaining);
        setQuotaUsedToday(used);
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
  }, [member?.id, pullNonce, spinDataRefreshNonce]);

  useEffect(() => {
    if (!member) return;
    let cancelled = false;
    const loadSim = () => {
      void getSpinSimFeed().then((items) => {
        if (!cancelled) setSimFeedItems(items);
      });
    };
    loadSim();
    const id = window.setInterval(loadSim, 12_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [member?.id]);

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
      toast.error(
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
        if (!r.success) {
          if (r.error === "LOTTERY_DISABLED")
            toast.error(t("抽奖暂时关闭", "Lottery is currently closed"));
          else if (r.error === "NO_SPIN_QUOTA")
            toast.error(
              t("抽奖次数不足，请通过签到或任务获取更多。", "Not enough draw chances. Earn more via check-in or tasks."),
            );
          else if (r.error === "PROBABILITY_SUM_NOT_100")
            toast.error(t("抽奖配置异常，请联系客服。", "Lottery configuration error, please contact support."));
          else if (r.error === "NO_PRIZES_CONFIGURED")
            toast.error(t("未配置奖品，请联系客服。", "No prizes configured, please contact support."));
          else if (r.error === "DUPLICATE_REQUEST")
            toast.info(t("请勿重复点击", "Please do not tap repeatedly."));
          else toast.error(r.error || t("抽奖失败", "Spin failed"));
          void getLotteryQuota(member.id)
            .then(applyQuota)
            .catch(() => { /* fallback quota refresh is best-effort */ });
          playMemberSpinMiss();
          setSpinning(false);
          setActiveIndex(-1);
          return;
        }
        const prize = r.prize!;
        if (typeof r.remaining === "number") setRemaining(r.remaining);

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
          void queryClient.invalidateQueries({ queryKey: memberQueryKeys.spin(member.id) });
          void queryClient.invalidateQueries({ queryKey: memberQueryKeys.points(member.id) });
          void queryClient.invalidateQueries({ queryKey: memberQueryKeys.pointsBreakdown(member.id) });
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
        toast.error(msg || memberPortalNetworkToastMessage(t));
        playMemberSpinMiss();
        highlightCancelRef.current?.();
        highlightCancelRef.current = null;
        setActiveIndex(-1);
        setSpinning(false);
      }
    });
    if (guarded === null) return;
  }, [member, spinning, remaining, prizes, spinGuard, t, applyQuota]);

  const lotteryLogsOnly = useMemo(
    () => logs.filter((log) => isLotteryPrizeLogType(log.prize_type)),
    [logs],
  );

  const visibleLogs = historyOpen ? lotteryLogsOnly : lotteryLogsOnly.slice(0, 3);

  if (!member) return null;

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
      return (
        <div className="px-1 py-3 text-center">
          <div className="mb-2 text-5xl" role="img" aria-hidden>
            🎉
          </div>
          <p className="m-0 mb-1 text-xl font-extrabold text-pu-gold-soft">
            {t(`恭喜获得 ${result.value} 积分！`, `Congrats! You won ${result.value} points!`)}
          </p>
          <p className="m-0 text-[13px] text-[hsl(var(--pu-m-text-dim)/0.85)]">
            {t("积分已发放到账户", "Points credited to your account")}
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
          {t("下次好运！", "Better luck next time!")}
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
        <div className="relative px-5 pb-4 pt-7">
          <h1 className="flex items-center gap-2 text-xl font-extrabold text-[hsl(var(--pu-m-text))]">
            <Star className="h-5 w-5 text-pu-rose-soft" aria-hidden />
            {t("幸运抽奖", "Lucky draw")}
          </h1>
          <p className="mt-1.5 text-xs font-medium text-[hsl(var(--pu-m-text-dim))]">
            {t("试试手气，赢取丰厚奖品", "Try your luck, win rich prizes")}
          </p>
        </div>

        <div className="mb-6 px-5">
          <div
            className="m-glass relative flex items-center justify-between overflow-hidden rounded-2xl border border-pu-gold/20 p-5 shadow-sm"
            style={{ borderColor: "hsl(var(--pu-gold) / 0.15)" }}
          >
            <div className="pointer-events-none absolute inset-0 rounded-[inherit] bg-gradient-to-r from-pu-gold/[0.05] to-pu-rose/[0.04]" />
            <div className="relative min-w-0 pr-3">
              <div className="text-sm font-bold text-pu-gold-soft/80">
                {t("今日抽奖次数", "Today's draw quota")}
              </div>
              <div className="mt-0.5 text-2xl font-extrabold tabular-nums text-[hsl(var(--pu-m-text))]">
                {quotaLoading ? (
                  <span
                    className="inline-block h-8 w-28 animate-pulse rounded-md bg-[hsl(var(--pu-m-surface)/0.38)] motion-reduce:animate-none"
                    aria-hidden
                  />
                ) : quotaTotalToday > 0 ? (
                  <>
                    {remaining}
                    <span className="text-sm font-bold text-[hsl(var(--pu-m-text-dim)/0.4)]">
                      {" "}
                      / {quotaTotalToday}
                    </span>
                  </>
                ) : (
                  <span className="tabular-nums">{remaining}</span>
                )}
              </div>
            </div>
            <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-pu-gold/15 ring-1 ring-inset ring-pu-gold/20">
              <Trophy className="h-6 w-6 text-pu-gold-soft" strokeWidth={1.75} aria-hidden />
            </div>
          </div>
        </div>

        {simFeedItems.length > 0 ? (
          <div className="mb-5 px-5">
            <div
              className="member-spin-sim-feed relative overflow-hidden rounded-2xl border border-pu-gold/15 bg-[hsl(var(--pu-m-surface)/0.35)] py-2.5"
              role="status"
              aria-live="polite"
            >
              <div
                className="member-spin-sim-feed__track flex w-max gap-10 pr-10"
                style={{ animationDuration: `${simFeedMarqueeDurationSec}s` }}
              >
                {[...simFeedItems, ...simFeedItems].map((it, i) => (
                  <span
                    key={`${it.id}-${i}`}
                    className="member-spin-sim-feed__seg shrink-0 whitespace-nowrap text-[11px] font-medium text-[hsl(var(--pu-m-text-dim)/0.88)]"
                  >
                    {normalizeSpinSimFeedLineForMember(it.text)}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        <main className="relative mx-auto w-full max-w-md flex-1 space-y-7 px-5 lg:max-w-lg">
          <div id="member-spin-wheel" className="mb-7 scroll-mt-24">
            <div className="relative m-glass overflow-hidden rounded-2xl border border-pu-gold/15 p-5 shadow-sm">
              <div className="pointer-events-none absolute inset-0 rounded-[inherit] bg-gradient-to-br from-pu-gold/[0.03] to-transparent" />
              <div
                className="relative grid aspect-square w-full grid-cols-3 grid-rows-3 gap-3"
                role="group"
                aria-label={t("转盘九宫格", "Spin wheel grid")}
              >
            {Array.from({ length: 9 }).map((_, cellIdx) => {
              if (cellIdx === 4) {
                return (
                  <button
                    key="go-btn"
                    type="button"
                    className={cn(
                      /* 与 premium-ui-boost MemberSpin 一致：仅用 .btn-spin 的渐变呼吸，勿再叠 Tailwind 背景否则会盖住动效 */
                      "btn-spin relative flex h-full min-h-0 w-full min-w-0 touch-manipulation flex-col items-center justify-center gap-1 outline-none transition-opacity duration-150 focus-visible:ring-2 focus-visible:ring-[hsl(var(--pu-gold))] focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--pu-m-surface))]",
                      spinning ? "cursor-wait opacity-80" : "cursor-pointer",
                      "motion-reduce:transition-none",
                    )}
                    onClick={handleSpin}
                    disabled={spinning}
                    aria-busy={spinning}
                    aria-label={
                      spinning
                        ? t("抽奖进行中…", "Spinning…")
                        : t("抽奖", "Draw")
                    }
                  >
                    {!spinning ? (
                      <span className="pointer-events-none absolute inset-0 rounded-[inherit] spin-ring" />
                    ) : null}
                    <Sparkles
                      size={24}
                      className={cn(
                        "text-white drop-shadow-[0_1px_2px_rgb(0_0_0_/_0.25)]",
                        spinning && "spin-icon motion-reduce:animate-none",
                      )}
                      aria-hidden
                    />
                    <span className="text-sm font-extrabold text-white [text-shadow:0_1px_2px_rgb(0_0_0_/_0.2)]">
                      {spinning ? t("抽奖中", "Spinning") : t("抽奖", "Draw")}
                    </span>
                    <span className="text-[10px] font-bold text-[hsl(0_0%_100%_/_0.82)]">
                      {t(`剩余 ${remaining} 次`, `${remaining} left`)}
                    </span>
                  </button>
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
                    className="flex min-h-0 min-w-0 items-center justify-center rounded-2xl border border-[hsl(var(--pu-m-surface-border)/0.12)] bg-[hsl(var(--pu-m-surface)/0.2)]"
                  >
                    <span className="text-lg text-[hsl(var(--pu-m-text-dim)/0.2)]">✦</span>
                  </div>
                );
              }
              const prize = prizes[prizeIdx];
              const isActive = activeIndex === prizeIdx;
              const isWinner = showResult && result?.id === prize.id && !spinning;
              const cellTier = prizeDisplayTier(prize);
              const pubPct = formatPublishedProbabilityPercent(prizePublishedPercentSource(prize));
              const pctLabel = pubPct === "—" ? "—" : `${pubPct}%`;

              const winnerRing =
                prize.type === "custom"
                  ? "ring-2 ring-pu-emerald/90 scale-105 shadow-[0_0_24px_-4px_hsl(var(--pu-emerald)/0.4)]"
                  : prize.type === "points"
                    ? "ring-2 ring-pu-gold scale-105 shadow-pu-glow-gold"
                    : "ring-2 ring-pu-gold/55 scale-[1.03] shadow-[0_0_18px_-4px_hsl(var(--pu-gold)/0.28)]";

              const highlightClass = isActive
                ? "ring-2 ring-pu-gold scale-[1.04] shadow-pu-glow-gold bg-pu-gold/[0.12]"
                : isWinner
                  ? winnerRing
                  : !isActive && !isWinner
                    ? "motion-safe:hover:scale-[1.03]"
                    : "";

              return (
                <div
                  key={cellIdx}
                  className={cn(
                    "relative flex min-h-0 min-w-0 flex-col items-center justify-center gap-0.5 overflow-hidden rounded-2xl border p-2 transition-all duration-150 motion-reduce:transition-none",
                    prizeCellTierCn(cellTier),
                    highlightClass,
                  )}
                >
                  {isActive && (
                    <div className="pointer-events-none absolute inset-0 rounded-[inherit] bg-gradient-to-br from-pu-gold/[0.15] to-transparent" />
                  )}
                  {isWinner && (
                    <div className="pointer-events-none absolute inset-0 animate-pulse rounded-[inherit] bg-gradient-to-br from-pu-emerald/[0.15] to-transparent motion-reduce:animate-none" />
                  )}
                  <div
                    className={cn(
                      "relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-[hsl(var(--pu-m-surface-border)/0.2)] bg-[hsl(var(--pu-m-surface)/0.5)]",
                      prize.type === "points" && "border-pu-gold/20 bg-pu-gold/12",
                      prize.type === "custom" && "border-pu-emerald/25 bg-pu-emerald/12",
                      prize.type === "none" && "bg-[hsl(var(--pu-m-surface)/0.35)]",
                    )}
                  >
                    <Gift className="h-4 w-4 text-[hsl(var(--pu-m-text-dim)/0.45)]" strokeWidth={1.75} aria-hidden />
                  </div>
                  <span className="relative z-10 text-[9px] font-extrabold leading-none text-pu-gold-soft/95">
                    {spinPrizeTierLabel(t, prizeIdx)}
                  </span>
                  <span
                    className={cn(
                      "relative z-10 line-clamp-2 w-full max-w-full break-words px-0.5 text-center text-[11px] font-bold leading-tight",
                      isActive ? "text-pu-gold-soft" : "text-[hsl(var(--pu-m-text)/0.92)]",
                    )}
                  >
                    {prize.name}
                  </span>
                  <span className="relative z-10 font-mono text-[9px] font-bold text-[hsl(var(--pu-m-text-dim)/0.45)]">
                    {pctLabel}
                  </span>
                </div>
              );
            })}
            </div>

            {remaining > 0 && !spinning && (
              <p className="relative mt-3 text-center text-[12px] leading-relaxed text-[hsl(var(--pu-m-text-dim)/0.72)]">
                {t("再试一次，更大惊喜等你！🎁", "Try again for a bigger reward! 🎁")}
              </p>
            )}

            {remaining <= 0 && !spinning && (
              <p className="relative mt-3 text-center text-[12px] leading-relaxed text-[hsl(var(--pu-m-text-dim)/0.55)]">
                {t("签到、邀请或分享可获取更多次数", "Check in, invite friends or share to earn more spins")}
              </p>
            )}
            </div>
          </div>

          <div className="mb-7">
            <div className="flex w-full items-center justify-between py-2 text-xs font-bold text-[hsl(var(--pu-m-text-dim))]">
              <span className="flex items-center gap-1.5">
                <Info className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
                {t("奖品概率公示", "Prize probability disclosure")}
              </span>
              <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
            </div>
            <div className="m-glass mt-1.5 rounded-2xl border border-pu-gold/12 p-4 shadow-sm">
              {probabilityNotice ? (
                <p className="mb-3 whitespace-pre-wrap break-words text-[12px] leading-relaxed text-[hsl(var(--pu-m-text)/0.88)]">
                  {probabilityNotice}
                </p>
              ) : null}
              <div className="space-y-2">
                {prizes.length === 0 ? (
                  <p className="text-center text-[12px] text-[hsl(var(--pu-m-text-dim)/0.72)]">
                    {t("未配置转盘奖品", "No wheel prizes configured")}
                  </p>
                ) : (
                  prizes.map((p, pi) => {
                    const pub = prizePublishedPercentSource(p);
                    const pl = formatPublishedProbabilityPercent(pub);
                    return (
                      <div key={p.id ?? `${p.name}-${p.sort_order}`} className="flex items-center justify-between text-xs">
                        <span className="min-w-0 flex-1 truncate font-medium text-[hsl(var(--pu-m-text-dim))]">
                          <span className="mr-1.5 font-bold text-pu-gold-soft/90">{spinPrizeTierLabel(t, pi)}</span>
                          {p.name}
                        </span>
                        <span className="shrink-0 pl-2 font-mono font-bold text-[hsl(var(--pu-m-text-dim)/0.45)]">
                          {pl === "—" ? pl : `${pl}%`}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          <section className="mb-7" aria-labelledby="member-spin-history-heading">
            <div className="mb-3 flex items-center gap-2">
              <History className="h-4 w-4 text-[hsl(var(--pu-m-text-dim))]" strokeWidth={2} aria-hidden />
              <h2 id="member-spin-history-heading" className="m-0 text-base font-extrabold text-[hsl(var(--pu-m-text))]">
                {t("抽奖记录", "Spin history")}
              </h2>
              {lotteryLogsOnly.length > 0 ? (
                <span className="ml-auto text-[11px] tabular-nums text-[hsl(var(--pu-m-text-dim)/0.5)]">
                  {logsTotal > SPIN_LOG_LIMIT
                    ? t(
                        `显示最近 ${SPIN_LOG_LIMIT} 条（共 ${logsTotal} 条）`,
                        `Latest ${SPIN_LOG_LIMIT} of ${logsTotal}`,
                      )
                    : t(`${lotteryLogsOnly.length} 条`, `${lotteryLogsOnly.length}`)}
                </span>
              ) : null}
            </div>

            <div id="member-spin-history-panel" className="m-glass rounded-2xl border border-pu-gold/12 px-4 shadow-sm">
            {lotteryLogsOnly.length === 0 ? (
              <div className="px-2 py-10 text-center">
                <p className="text-sm font-semibold text-[hsl(var(--pu-m-text))]">{t("暂无抽奖记录", "No spin records yet")}</p>
                <p className="mt-1.5 text-[11px] text-[hsl(var(--pu-m-text-dim)/0.65)]">
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
                    className="flex items-center gap-3 border-b border-[hsl(var(--pu-m-surface-border)/0.15)] py-3.5 last:border-0"
                  >
                    <span className="text-lg" aria-hidden>
                      {spinLogEmoji(log.prize_type)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className={cn("truncate text-sm font-bold", spinLogTitleClass(log.prize_type))}>
                        {log.prize_name}
                        {log.prize_type === "points" && log.prize_value > 0 ? (
                          <span className="ml-1.5 tabular-nums text-pu-gold-soft">+{log.prize_value}</span>
                        ) : null}
                      </div>
                      <div className="mt-0.5 text-[11px] font-medium text-[hsl(var(--pu-m-text-dim))]">
                        {formatMemberLocalTime(log.created_at)}
                      </div>
                    </div>
                  </div>
                ))}

                {lotteryLogsOnly.length > 3 ? (
                  <button
                    type="button"
                    onClick={() => setHistoryOpen(!historyOpen)}
                    aria-expanded={historyOpen}
                    aria-controls="member-spin-history-panel"
                    className="flex min-h-[44px] w-full items-center justify-center gap-2 py-3 text-[13px] font-semibold text-[hsl(var(--pu-m-text-dim)/0.75)] touch-manipulation transition hover:text-[hsl(var(--pu-m-text))]"
                  >
                    {historyOpen
                      ? t("收起", "Show less")
                      : t(`展开全部 ${lotteryLogsOnly.length} 条`, `Show all ${lotteryLogsOnly.length}`)}
                    <ChevronDown
                      size={16}
                      className={cn(
                        "transition-transform duration-200 motion-reduce:transition-none",
                        historyOpen && "rotate-180",
                      )}
                      aria-hidden
                    />
                  </button>
                ) : null}
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
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-pu-gold/35 bg-gradient-to-br from-pu-gold/25 to-pu-gold/[0.06] shadow-md">
                <Trophy className="text-pu-gold-soft" size={18} strokeWidth={2.2} aria-hidden />
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
            <div className="flex flex-col gap-2.5 border-t border-pu-gold/12 pt-4">
              {remaining > 0 && (
                <Button
                  type="button"
                  className="btn-glow h-11 w-full rounded-xl border-0 text-[15px] font-bold text-[hsl(var(--pu-primary-foreground))] shadow-[0_4px_14px_hsl(var(--pu-gold)/0.3)] hover:opacity-95"
                  onClick={() => {
                    setShowResult(false);
                    setTimeout(handleSpin, 300);
                  }}
                >
                  {t("再抽一次 🎰", "Spin again 🎰")}
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                className="h-10 w-full rounded-xl border-pu-gold/15 bg-[hsl(var(--pu-m-surface)/0.6)] text-sm text-[hsl(var(--pu-m-text)/0.92)] hover:bg-[hsl(var(--pu-m-surface)/0.8)] hover:text-[hsl(var(--pu-m-text))]"
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
