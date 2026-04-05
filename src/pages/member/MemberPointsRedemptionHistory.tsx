import { useEffect, useState } from "react";
import { formatMemberLocalTime } from "@/lib/memberLocalTime";
import { ledgerActivityTypeLabel } from "@/lib/memberLedgerTypeLabel";
import { Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MemberStackedRowSkeleton } from "@/components/member/MemberPageLoadingShell";
import { MemberEmptyStateCta } from "@/components/member/MemberEmptyStateCta";
import { ROUTES } from "@/routes/constants";
import {
  listMemberPointsMallRedemptionsForPortal,
  type MemberPortalRedemptionRpcRow,
} from "@/services/members/memberPointsMallRpcService";
import { useMemberSkeletonGate } from "@/hooks/useMemberSkeletonGate";
import { useMemberAnimatedCount } from "@/hooks/useMemberAnimatedCount";
import { formatMemberLedgerRowOrderDisplay } from "@/lib/memberLedgerIdDisplay";
import type { MemberPointsLedgerRow } from "@/services/points/memberPointsRpcService";
import { cn } from "@/lib/utils";

export const REDEMPTION_HISTORY_LIMIT = 50;

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
export function MemberPointsRecentLedgerRow({
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
export function MemberRedemptionHistoryFeed({
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
