import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { X, ShoppingBag, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useTenantView } from "@/contexts/TenantViewContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { ROUTES } from "@/routes/constants";
import {
  listMyPointsMallRedemptionOrders,
  type PointsMallRedemptionOrder,
} from "@/services/members/memberPointsMallService";
import { cn } from "@/lib/utils";

const POLL_MS = 12_000;
const AUTO_DISMISS_MS = 10_000;
/** 仅提示「会话开始后」新建的待处理单，避免打开页面时刷屏历史待办；允许时钟偏差 */
const START_GRACE_MS = 20_000;

function storageKey(tenantId: string) {
  return `mall-rdm-staff-toasted:${tenantId}`;
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

export function MallRedemptionStaffNotifier() {
  const { employee } = useAuth();
  const { viewingTenantId } = useTenantView() || {};
  const tenantId = viewingTenantId ?? employee?.tenant_id ?? null;
  const navigate = useNavigate();
  const { t } = useLanguage();

  const sessionStartRef = useRef(Date.now());
  const toastedRef = useRef<Set<string>>(new Set());
  const [queue, setQueue] = useState<PointsMallRedemptionOrder[]>([]);

  useEffect(() => {
    if (!tenantId) return;
    sessionStartRef.current = Date.now();
    toastedRef.current = loadToastedIds(tenantId);
  }, [tenantId]);

  const enqueue = useCallback((o: PointsMallRedemptionOrder) => {
    if (toastedRef.current.has(o.id)) return;
    toastedRef.current.add(o.id);
    saveToastedIds(tenantId!, toastedRef.current);
    setQueue((q) => [...q, o]);
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId || !employee?.id) return;

    let cancelled = false;

    const poll = async () => {
      if (typeof document !== "undefined" && document.hidden) return;
      try {
        const list = await listMyPointsMallRedemptionOrders("pending", 120, tenantId);
        if (cancelled) return;
        const threshold = sessionStartRef.current - START_GRACE_MS;
        for (const o of list) {
          const ts = new Date(o.created_at).getTime();
          if (Number.isNaN(ts) || ts < threshold) continue;
          if (toastedRef.current.has(o.id)) continue;
          enqueue(o);
        }
      } catch {
        /* 静默失败，下一轮再试 */
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
  }, []);

  const current = queue[0];

  useEffect(() => {
    if (!current) return;
    const timer = window.setTimeout(dismissOne, AUTO_DISMISS_MS);
    return () => window.clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, dismissOne]);

  const goToOrder = useCallback(() => {
    if (!current) return;
    const id = encodeURIComponent(current.id);
    navigate(`${ROUTES.STAFF.ORDERS}?tab=mall&highlightMall=${id}`);
    dismissOne();
  }, [current, navigate, dismissOne]);

  if (!tenantId || !employee || !current) return null;

  return (
    <div
      className={cn(
        "fixed bottom-4 right-4 z-[380] w-[min(100vw-2rem,22rem)] rounded-xl border bg-card shadow-lg",
        "animate-in slide-in-from-bottom-4 fade-in duration-300",
      )}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start gap-3 p-3 pr-2 border-b border-border/60">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          <ShoppingBag className="h-5 w-5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1 pt-0.5">
          <p className="text-sm font-semibold leading-tight">
            {t("新商城兑换", "New mall redemption")}
          </p>
          <p className="mt-1 text-xs text-muted-foreground leading-snug">
            {t("会员提交了积分商城兑换，请及时处理。", "A member submitted a points mall redemption.")}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 text-muted-foreground"
          onClick={dismissOne}
          aria-label={t("关闭", "Close")}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="p-3 space-y-2 text-xs">
        <div className="font-medium text-sm text-foreground line-clamp-2">{current.item_title}</div>
        <dl className="grid gap-1 text-muted-foreground">
          <div className="flex justify-between gap-2">
            <dt>{t("数量", "Qty")}</dt>
            <dd className="font-mono text-foreground">{current.quantity}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt>{t("积分", "Pts")}</dt>
            <dd className="font-mono text-foreground">{current.points_used}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt>{t("会员编号", "Member code")}</dt>
            <dd className="font-mono text-foreground truncate max-w-[55%] text-right">
              {current.member_code?.trim() || "—"}
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt>{t("电话", "Phone")}</dt>
            <dd className="font-mono text-foreground truncate max-w-[55%] text-right">
              {current.member_phone?.trim() || "—"}
            </dd>
          </div>
        </dl>
        <div className="flex gap-2 pt-1">
          <Button type="button" variant="outline" size="sm" className="flex-1 h-8 text-xs" onClick={dismissOne}>
            {t("关闭", "Close")}
          </Button>
          <Button type="button" size="sm" className="flex-1 h-8 text-xs gap-1" onClick={goToOrder}>
            {t("前往订单", "Open order")}
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground text-center pt-0.5">
          {t("10 秒后自动关闭", "Auto-closes in 10s")}
        </p>
      </div>
    </div>
  );
}
