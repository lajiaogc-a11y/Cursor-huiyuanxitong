import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { X, Gift, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useTenantView } from "@/contexts/TenantViewContext";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  adminListPendingRewards,
  type PendingRewardRow,
} from "@/services/lottery/lotteryService";
import { cn } from "@/lib/utils";

const POLL_MS = 15_000;
const AUTO_DISMISS_S = 10;
const START_GRACE_MS = 20_000;

function storageKey(tenantId: string) {
  return `lottery-reward-staff-toasted:${tenantId}`;
}

function loadToastedIds(tenantId: string): Set<string> {
  try {
    const raw = sessionStorage.getItem(storageKey(tenantId));
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter((x) => typeof x === "string"));
  } catch {
    return new Set();
  }
}

function saveToastedIds(tenantId: string, ids: Set<string>) {
  try {
    const arr = [...ids].slice(-120);
    sessionStorage.setItem(storageKey(tenantId), JSON.stringify(arr));
  } catch {
    /* ignore */
  }
}

export function LotteryRewardStaffNotifier() {
  const { employee } = useAuth();
  const { viewingTenantId } = useTenantView() || {};
  const tenantId = viewingTenantId ?? employee?.tenant_id ?? null;
  const navigate = useNavigate();
  const { t } = useLanguage();

  const sessionStartRef = useRef(Date.now());
  const toastedRef = useRef<Set<string>>(new Set());
  const [queue, setQueue] = useState<PendingRewardRow[]>([]);
  const [countdown, setCountdown] = useState(AUTO_DISMISS_S);

  useEffect(() => {
    if (!tenantId) return;
    sessionStartRef.current = Date.now();
    toastedRef.current = loadToastedIds(tenantId);
  }, [tenantId]);

  const enqueue = useCallback(
    (row: PendingRewardRow) => {
      if (toastedRef.current.has(row.id)) return;
      toastedRef.current.add(row.id);
      saveToastedIds(tenantId!, toastedRef.current);
      setQueue((q) => [...q, row]);
    },
    [tenantId],
  );

  useEffect(() => {
    if (!tenantId || !employee?.id) return;
    let cancelled = false;

    const poll = async () => {
      if (typeof document !== "undefined" && document.hidden) return;
      try {
        const { rows } = await adminListPendingRewards({ status: "pending", limit: 50 });
        if (cancelled) return;
        const threshold = sessionStartRef.current - START_GRACE_MS;
        for (const r of rows) {
          if (r.reward_type !== "manual") continue;
          const ts = new Date(r.created_at).getTime();
          if (Number.isNaN(ts) || ts < threshold) continue;
          if (toastedRef.current.has(r.id)) continue;
          enqueue(r);
        }
      } catch {
        /* next poll */
      }
    };

    void poll();
    const id = window.setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [tenantId, employee?.id, enqueue]);

  const dismissOne = useCallback(() => {
    setQueue((q) => q.slice(1));
    setCountdown(AUTO_DISMISS_S);
  }, []);

  const current = queue[0];

  useEffect(() => {
    if (!current) return;
    setCountdown(AUTO_DISMISS_S);
  }, [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!current) return;
    const timer = window.setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          dismissOne();
          return AUTO_DISMISS_S;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [current?.id, dismissOne]); // eslint-disable-line react-hooks/exhaustive-deps

  const goToLotteryData = useCallback(() => {
    navigate("/staff/member-portal/activity_data");
    dismissOne();
  }, [navigate, dismissOne]);

  if (!tenantId || !employee || !current) return null;

  const progressPct = (countdown / AUTO_DISMISS_S) * 100;

  return (
    <div
      className={cn(
        "fixed bottom-5 right-5 z-[380] w-[min(100vw-2rem,24rem)] overflow-hidden rounded-xl border border-border/80 bg-card shadow-2xl",
        "animate-in slide-in-from-bottom-5 fade-in duration-300",
      )}
      role="status"
      aria-live="polite"
    >
      <div className="h-1 w-full bg-muted">
        <div
          className="h-full bg-amber-500 transition-all duration-1000 ease-linear"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      <div className="flex items-start gap-3 p-3.5 pb-2">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-amber-500/10 text-amber-600">
          <Gift className="h-5 w-5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold leading-tight text-foreground">
              {t("新自定义奖品中奖", "New Custom Prize Won")}
            </p>
            <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
              {countdown}s
            </span>
          </div>
          <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
            {t("会员抽中自定义奖品，请及时处理发放。", "A member won a custom prize. Please process it promptly.")}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="mt-[-4px] mr-[-6px] h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
          onClick={dismissOne}
          aria-label={t("关闭", "Close")}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="space-y-2 px-3.5 pb-3">
        <div className="rounded-lg bg-muted/50 p-2.5">
          <p className="text-sm font-medium text-foreground line-clamp-2">{current.prize_name}</p>
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
            <span>{t("类型", "Type")}: <b className="text-foreground">{current.prize_type === "custom" ? t("自定义", "Custom") : current.prize_type}</b></span>
            {current.prize_value > 0 && (
              <span>{t("奖品值", "Value")}: <b className="text-foreground">{current.prize_value}</b></span>
            )}
          </div>
        </div>

        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 flex-1 text-xs"
            onClick={dismissOne}
          >
            {t("关闭", "Close")}
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-9 flex-1 gap-1.5 text-xs"
            onClick={goToLotteryData}
          >
            {t("前往处理", "Go to process")}
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </div>

        {queue.length > 1 && (
          <p className="text-center text-[10px] text-muted-foreground">
            {t(`还有 ${queue.length - 1} 条待处理通知`, `${queue.length - 1} more pending`)}
          </p>
        )}
      </div>
    </div>
  );
}
