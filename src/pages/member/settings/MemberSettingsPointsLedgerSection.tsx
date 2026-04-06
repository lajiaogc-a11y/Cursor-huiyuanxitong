import { Coins, ChevronDown } from "lucide-react";
import { ROUTES } from "@/routes/constants";
import { cn } from "@/lib/utils";
import { MemberStackedRowSkeleton } from "@/components/member/MemberPageLoadingShell";
import { MemberEmptyStateCta } from "@/components/member/MemberEmptyStateCta";
import { formatMemberLocalTime } from "@/lib/memberLocalTime";
import { formatMemberLedgerRowOrderDisplay } from "@/lib/memberLedgerIdDisplay";
import { ledgerActivityTypeLabel } from "@/lib/memberLedgerTypeLabel";
import { useMemberAnimatedCount } from "@/hooks/useMemberAnimatedCount";
import type { MemberLedgerCategory, MemberPointsLedgerRow } from "@/services/points/memberPointsRpcService";

function fmtSettingsLedgerPts(n: number) {
  return Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function MemberSettingsLedgerCard({
  row,
  ledgerCategory,
  themeColor,
  t,
}: {
  row: MemberPointsLedgerRow;
  ledgerCategory: MemberLedgerCategory;
  themeColor: string;
  t: (zh: string, en: string) => string;
}) {
  const isAll = ledgerCategory === "all";
  const pts = Number(row.points);
  const isNeg = pts < 0;
  const bb = Number(row.balance_before);
  const ba = Number(row.balance_after);
  const dur = 520;
  const animPts = useMemberAnimatedCount(pts, { enabled: true, durationMs: dur });
  const animBb = useMemberAnimatedCount(bb, { enabled: true, durationMs: dur + 70 });
  const animBa = useMemberAnimatedCount(ba, { enabled: true, durationMs: dur + 140 });
  const orderFmt = formatMemberLedgerRowOrderDisplay(row);
  const orderDisplay = orderFmt.display;
  const orderTitle = row.order_number ? undefined : orderFmt.fullTitle;
  const idLabel =
    isAll && !row.order_id && !row.reference_id && row.description
      ? t("类型", "Type")
      : t("订单号", "Order ID");
  const idDisplay =
    isAll && !row.order_id && !row.reference_id && row.description
      ? row.description
      : orderDisplay;
  const typeLabel = ledgerActivityTypeLabel(row.type, t);

  return (
    <div className="member-ledger-card">
      <div className="member-ledger-card__row">
        <div className="flex items-center gap-1.5">
          <span className="member-ledger-card__label">{idLabel}</span>
          {isAll && (
            <span
              className={cn(
                "rounded-md px-1.5 py-px text-[9px] font-semibold",
                isNeg ? "bg-pu-rose/12 text-rose-300" : "bg-pu-emerald/12 text-emerald-300",
              )}
            >
              {typeLabel}
            </span>
          )}
        </div>
        <span
          className={cn("shrink-0 text-[15px] font-extrabold tabular-nums", isNeg ? "text-rose-300" : "")}
          style={!isNeg ? { color: themeColor } : undefined}
        >
          {isNeg ? "" : "+"}
          {fmtSettingsLedgerPts(animPts)}
        </span>
      </div>
      <div className="member-ledger-card__id" title={orderTitle}>
        {idDisplay}
      </div>
      <div className="mt-1.5 flex items-center justify-between">
        <span className="member-ledger-card__time m-0">{formatMemberLocalTime(row.earned_at)}</span>
        <span className="tabular-nums text-[10px] text-[hsl(var(--pu-m-text-dim)/0.45)]">
          {fmtSettingsLedgerPts(animBb)} → {fmtSettingsLedgerPts(animBa)}
        </span>
      </div>
    </div>
  );
}

export function MemberSettingsPointsLedgerSection({
  t,
  themeColor,
  expandedPointsLedger,
  setExpandedPointsLedger,
  ledgerCategory,
  setLedgerCategory,
  ledgerRows,
  ledgerTotal,
  hasMoreLedger,
  ledgerPackSuccess,
  ledgerLoadingMore,
  onLoadMoreLedger,
  showLedgerSkeleton,
}: {
  t: (zh: string, en: string) => string;
  themeColor: string;
  expandedPointsLedger: boolean;
  setExpandedPointsLedger: (v: boolean) => void;
  ledgerCategory: MemberLedgerCategory;
  setLedgerCategory: (v: MemberLedgerCategory) => void;
  ledgerRows: MemberPointsLedgerRow[];
  ledgerTotal: number;
  hasMoreLedger: boolean;
  ledgerPackSuccess: boolean | undefined;
  ledgerLoadingMore: boolean;
  onLoadMoreLedger: () => void | Promise<void>;
  showLedgerSkeleton: boolean;
}) {
  return (
    <div className="m-glass overflow-hidden rounded-2xl border border-pu-gold/12">
      <div className="member-settings-row">
        <button
          type="button"
          className="member-settings-trigger"
          onClick={() => setExpandedPointsLedger(!expandedPointsLedger)}
          aria-expanded={expandedPointsLedger}
        >
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-pu-gold/12 ring-1 ring-inset ring-pu-gold/15">
              <Coins className="h-4 w-4 text-pu-gold-soft" strokeWidth={2} aria-hidden />
            </div>
            <div className="min-w-0 text-left">
              <p className="m-0 text-sm font-semibold text-[hsl(var(--pu-m-text))]">
                {t("积分明细", "Points ledger")}
              </p>
              <p className="m-0 text-xs text-[hsl(var(--pu-m-text-dim)/0.55)]">
                {t("消费、推荐与抽奖等积分记录", "Consumption, referral & lottery entries")}
              </p>
            </div>
          </div>
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-[hsl(var(--pu-m-text-dim)/0.4)] transition-transform member-motion-base",
              expandedPointsLedger && "rotate-180",
            )}
            strokeWidth={2}
            aria-hidden
          />
        </button>
        <div
          className={cn(
            "member-settings-expand member-settings-collapse member-motion-base",
            expandedPointsLedger ? "is-open" : "is-closed",
          )}
          aria-hidden={!expandedPointsLedger}
        >
            <div className="mb-3 flex flex-wrap gap-2">
              {(
                [
                  { key: "all" as const, zh: "全部", en: "All" },
                  { key: "consumption" as const, zh: "消费", en: "Consumption" },
                  { key: "referral" as const, zh: "推荐", en: "Referral" },
                  { key: "lottery" as const, zh: "抽奖", en: "Lottery" },
                ] as const
              ).map(({ key, zh, en }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setLedgerCategory(key)}
                  className={cn(
                    "cursor-pointer rounded-full px-3 py-1.5 text-xs member-transition-color member-motion-fast",
                    ledgerCategory === key
                      ? "border-[1.5px] font-bold shadow-sm"
                      : "border border-[hsl(var(--pu-m-surface-border)/0.28)] font-medium text-[hsl(var(--pu-m-text-dim)/0.72)] hover:border-[hsl(var(--pu-m-surface-border)/0.42)] hover:text-[hsl(var(--pu-m-text-dim)/0.88)]",
                  )}
                  style={
                    ledgerCategory === key
                      ? {
                          borderColor: themeColor,
                          background: `color-mix(in srgb, ${themeColor} 16%, transparent)`,
                          color: themeColor,
                        }
                      : undefined
                  }
                >
                  {t(zh, en)}
                </button>
              ))}
            </div>
            {showLedgerSkeleton ? (
              <MemberStackedRowSkeleton rows={4} />
            ) : !ledgerPackSuccess ? (
              <p className="m-0 text-[13px] text-rose-400">
                {t("加载失败，请稍后重试", "Failed to load. Try again later.")}
              </p>
            ) : ledgerRows.length === 0 ? (
              <div className="relative overflow-hidden rounded-2xl border border-dashed border-pu-gold/22 bg-gradient-to-b from-pu-gold/[0.08] via-[hsl(var(--pu-m-surface)/0.18)] to-[hsl(var(--pu-m-surface)/0.22)] px-4 py-8 text-center">
                <div className="relative">
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-pu-gold/12 text-[hsl(var(--pu-m-text-dim)/0.4)]">
                    <Coins className="h-6 w-6" strokeWidth={1.75} aria-hidden />
                  </div>
                  <p className="m-0 text-sm font-semibold text-[hsl(var(--pu-m-text))]">{t("暂无记录", "No records")}</p>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-[hsl(var(--pu-m-text-dim)/0.65)]">
                    {t("切换上方分类或稍后再试", "Try another category or check back later")}
                  </p>
                  <MemberEmptyStateCta
                    primary={{ to: ROUTES.MEMBER.POINTS, label: t("去积分商城", "Go to points mall") }}
                    secondary={{ to: ROUTES.MEMBER.DASHBOARD, label: t("回首页", "Home") }}
                  />
                </div>
              </div>
            ) : (
              <>
                <div className="member-ledger-stack">
                  {ledgerRows.map((row) => (
                    <MemberSettingsLedgerCard
                      key={row.id}
                      row={row}
                      ledgerCategory={ledgerCategory}
                      themeColor={themeColor}
                      t={t}
                    />
                  ))}
                </div>
                {hasMoreLedger ? (
                  <button
                    type="button"
                    className="mx-auto mt-3 flex items-center gap-1.5 rounded-full bg-[hsl(var(--pu-m-surface)/0.35)] px-4 py-1.5 text-[11px] font-medium text-[hsl(var(--pu-m-text-dim))] member-transition-color member-motion-fast active:bg-[hsl(var(--pu-m-surface)/0.55)]"
                    disabled={ledgerLoadingMore}
                    onClick={() => void onLoadMoreLedger()}
                  >
                    {ledgerLoadingMore
                      ? t("加载中…", "Loading…")
                      : t(`加载更多（${ledgerRows.length}/${ledgerTotal}）`, `Load more (${ledgerRows.length}/${ledgerTotal})`)}
                  </button>
                ) : ledgerTotal > 0 ? (
                  <p className="mb-0 mt-2.5 text-[11px] text-[hsl(var(--pu-m-text-dim)/0.5)]">
                    {t(`共 ${ledgerTotal} 条`, `${ledgerTotal} total`)}
                  </p>
                ) : null}
              </>
            )}
          </div>
      </div>
    </div>
  );
}
