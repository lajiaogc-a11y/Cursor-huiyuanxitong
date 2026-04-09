import type { SyntheticEvent } from "react";
import { ShoppingCart, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { notify } from "@/lib/notifyHub";
import type { PointsMallItem } from "@/services/memberPortal/memberPointsPortalService";
import { num } from "@/pages/member/memberPointsShared";

type RedeemDrawerImage = {
  resolvedSrc: string;
  usePlaceholder: boolean;
  onImageError: (e: SyntheticEvent<HTMLImageElement>) => void;
};

export function MemberPointsRedeemDrawerBody({
  redeemTarget,
  redeemDrawerImg,
  redeemQty,
  onRedeemQtyChange,
  redeemError,
  onDismissError,
  points,
  redeemRulesTitle,
  redeemDailyUnlimitedLine,
  redeemLifetimeUnlimitedLine,
  t,
  redeeming,
  onRedeemingErrorReset,
  onCancel,
  onConfirmRedeem,
}: {
  redeemTarget: PointsMallItem;
  redeemDrawerImg: RedeemDrawerImage;
  redeemQty: number;
  onRedeemQtyChange: (qty: number) => void;
  redeemError: string | null;
  onDismissError: () => void;
  points: number;
  redeemRulesTitle: string;
  redeemDailyUnlimitedLine: string;
  redeemLifetimeUnlimitedLine: string;
  t: (zh: string, en: string) => string;
  redeeming: boolean;
  onRedeemingErrorReset: () => void;
  onCancel: () => void;
  onConfirmRedeem: () => Promise<void>;
}) {
  const perOrder = Math.max(1, num(redeemTarget.per_order_limit, 1));
  const dailyLim = num(redeemTarget.per_user_daily_limit, 0);
  const lifeLim = num(redeemTarget.per_user_lifetime_limit, 0);
  const usedDay = num(redeemTarget.used_today, 0);
  const usedLife = num(redeemTarget.used_lifetime, 0);
  const dailyLeft = dailyLim > 0 ? Math.max(0, dailyLim - usedDay) : 999999;
  const lifeLeft = lifeLim > 0 ? Math.max(0, lifeLim - usedLife) : 999999;
  const stockRem = redeemTarget.stock_remaining;
  const stockCap = stockRem < 0 ? 999999 : num(stockRem, 0);
  const maxQtyAllowed = Math.min(perOrder, stockCap, dailyLeft, lifeLeft);
  const maxQty = Math.max(0, maxQtyAllowed);
  const qtySafe = maxQty < 1 ? 0 : Math.max(1, Math.min(Number(redeemQty || 1), maxQty));
  const totalCost = (redeemTarget.points_cost || 0) * qtySafe;
  const affordable = totalCost <= points;
  const dailyLine =
    dailyLim <= 0
      ? redeemDailyUnlimitedLine
      : t(
          `每日上限 ${dailyLim} · 今日已兑 ${usedDay} · 今日剩余 ${dailyLeft}`,
          `Daily limit: ${dailyLim} · redeemed ${usedDay} today · ${dailyLeft} left today`,
        );
  const lifeLine =
    lifeLim <= 0
      ? redeemLifetimeUnlimitedLine
      : t(
          `终身上限 ${lifeLim} · 累计已兑 ${usedLife} · 剩余 ${lifeLeft}`,
          `Lifetime limit: ${lifeLim} · redeemed ${usedLife} total · ${lifeLeft} left`,
        );

  const confirmDisabled = (() => {
    const perOrderInner = Math.max(1, num(redeemTarget.per_order_limit, 1));
    const dailyLimInner = num(redeemTarget.per_user_daily_limit, 0);
    const lifeLimInner = num(redeemTarget.per_user_lifetime_limit, 0);
    const usedDayInner = num(redeemTarget.used_today, 0);
    const usedLifeInner = num(redeemTarget.used_lifetime, 0);
    const dailyLeftInner = dailyLimInner > 0 ? Math.max(0, dailyLimInner - usedDayInner) : 999999;
    const lifeLeftInner = lifeLimInner > 0 ? Math.max(0, lifeLimInner - usedLifeInner) : 999999;
    const stockRemInner = redeemTarget.stock_remaining;
    const stockCapInner = stockRemInner < 0 ? 999999 : num(stockRemInner, 0);
    const maxQ = Math.max(0, Math.min(perOrderInner, stockCapInner, dailyLeftInner, lifeLeftInner));
    if (maxQ < 1) return true;
    const q = Math.max(1, Math.min(Number(redeemQty || 1), maxQ));
    const cost = (redeemTarget.points_cost || 0) * q;
    return cost > points || redeeming;
  })();

  return (
    <div className="member-redeem-vault">
      {redeemError ? (
        <Alert variant="destructive" className="relative border-red-500/45 bg-red-950/45 pr-10 text-red-50">
          <AlertTitle className="text-red-100">{t("兑换失败", "Redeem failed")}</AlertTitle>
          <AlertDescription className="text-red-100/90">{redeemError}</AlertDescription>
          <button
            type="button"
            className="absolute right-3 top-3 rounded-md p-1 text-red-200/90 transition-colors motion-reduce:transition-none hover:bg-red-500/25 hover:text-red-50"
            onClick={onDismissError}
            aria-label={t("关闭", "Dismiss")}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </Alert>
      ) : null}
      <div className="member-redeem-vault__product member-redeem-product-row flex items-start gap-3.5">
        {redeemDrawerImg.usePlaceholder ? (
          <div className="flex h-[88px] w-[88px] shrink-0 items-center justify-center rounded-xl border border-[hsl(var(--pu-m-surface-border)/0.22)] bg-[hsl(var(--pu-m-surface)/0.38)]">
            <ShoppingCart className="h-8 w-8 text-[hsl(var(--pu-m-text-dim)/0.45)]" strokeWidth={1.5} aria-hidden />
          </div>
        ) : (
          <img
            src={redeemDrawerImg.resolvedSrc}
            alt=""
            loading="lazy"
            decoding="async"
            onError={redeemDrawerImg.onImageError}
            className="h-[88px] w-[88px] shrink-0 rounded-xl border border-[hsl(var(--pu-m-surface-border)/0.28)] object-cover"
          />
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <h3 className="m-0 break-words text-[17px] font-extrabold leading-tight tracking-tight text-[hsl(var(--pu-m-text))]">
            {redeemTarget.title}
          </h3>
          <div
            className={cn(
              "member-redeem-product-desc m-0 max-h-[132px] overflow-y-auto whitespace-pre-wrap break-words text-[13px] leading-[1.55]",
              redeemTarget.description?.trim()
                ? "text-[hsl(var(--pu-m-text-dim)/0.88)] not-italic"
                : "text-[hsl(var(--pu-m-text-dim)/0.42)] italic",
            )}
          >
            {redeemTarget.description?.trim() || t("暂无商品说明", "No description")}
          </div>
          <div className="mt-1 flex flex-wrap gap-2">
            <span className="rounded-full bg-[hsl(var(--pu-m-surface)/0.5)] px-2.5 py-0.5 text-[11px] text-[hsl(var(--pu-m-text-dim)/0.88)]">
              {t(`每件 ${redeemTarget.points_cost} 积分`, `${redeemTarget.points_cost} pts each`)}
            </span>
            <span
              className={cn(
                "rounded-full bg-[hsl(var(--pu-m-surface)/0.5)] px-2.5 py-0.5 text-[11px]",
                stockRem === 0 ? "text-pu-rose-soft" : "text-[hsl(var(--pu-m-text-dim)/0.88)]",
              )}
            >
              {stockRem < 0 ? t("库存：不限", "Stock: unlimited") : t(`库存：${stockRem}`, `Stock: ${stockRem}`)}
            </span>
          </div>
        </div>
      </div>

      <div className="member-redeem-vault__rules">
        <p className="member-redeem-vault__rules-title">{redeemRulesTitle}</p>
        <p className="member-redeem-vault__rules-line">
          {t("单笔最多", "Max per order")}: {perOrder}
        </p>
        <p className="member-redeem-vault__rules-line">{dailyLine}</p>
        <p className="member-redeem-vault__rules-line">{lifeLine}</p>
        {maxQty < 1 ? (
          <p className="mt-2.5 text-xs font-semibold leading-snug text-pu-gold-soft">
            {t(
              "当前无法兑换（已达每日/终身上限或库存不足）。可改日再试或选择其它商品。",
              "You cannot redeem this item now (daily/lifetime quota or stock exhausted). Try another day or another item.",
            )}
          </p>
        ) : null}
      </div>

      <div className="member-redeem-vault__settlement">
        <div className="mb-3 flex items-center justify-between">
          <Label htmlFor="member-points-redeem-qty" className="text-[13px] font-medium text-[hsl(var(--pu-m-text)/0.88)]">
            {t("数量", "Quantity")}
          </Label>
          <Input
            id="member-points-redeem-qty"
            name="redeem_quantity"
            type="number"
            inputMode="numeric"
            autoComplete="off"
            aria-label={t("兑换数量", "Redeem quantity")}
            min={maxQty < 1 ? 0 : 1}
            max={maxQty < 1 ? 0 : maxQty}
            value={maxQty < 1 ? 0 : redeemQty}
            onChange={(e) => {
              const raw = e.target.value;
              const n = raw === "" ? 1 : Number(raw);
              onRedeemQtyChange(Math.max(1, Math.min(Number.isFinite(n) ? n : 1, Math.max(1, maxQty))));
            }}
            disabled={maxQty < 1}
            className="h-9 w-[100px] rounded-xl border border-[hsl(var(--pu-m-surface-border)/0.35)] bg-[hsl(var(--pu-m-bg-1)/0.72)] text-center text-sm text-[hsl(var(--pu-m-text))] tabular-nums focus-visible:border-pu-gold/55 focus-visible:ring-pu-gold/20"
          />
        </div>
        <div className="flex items-baseline justify-between border-t border-[hsl(var(--pu-m-surface-border)/0.2)] pt-3">
          <span className="text-[13px] text-[hsl(var(--pu-m-text)/0.88)]">{t("所需积分", "Points required")}</span>
          <span
            className={cn("text-xl font-extrabold tabular-nums", affordable ? "text-pu-gold-soft" : "text-pu-rose-soft")}
          >
            {totalCost}
          </span>
        </div>
        <div className="mt-1 flex items-baseline justify-between">
          <span className="text-[11px] text-[hsl(var(--pu-m-text-dim)/0.55)]">{t("当前余额", "Your balance")}</span>
          <span className="text-[13px] font-semibold text-[hsl(var(--pu-m-text-dim)/0.72)]">{points}</span>
        </div>
        {!affordable && maxQty >= 1 && (
          <p className="mt-2 text-xs font-medium text-pu-rose-soft">
            {t(`积分不足，还差 ${totalCost - points}。`, `Not enough points — need ${totalCost - points} more.`)}
          </p>
        )}
      </div>

      <p className="member-redeem-vault__hint">
        {t("加密会话 · 确认后兑换即生效", "Encrypted session · redemption is final once confirmed")}
      </p>

      <div className="flex flex-wrap justify-end gap-2 border-t border-[hsl(var(--pu-m-surface-border)/0.2)] pt-4">
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="rounded-xl border-[hsl(var(--pu-m-surface-border)/0.35)] bg-transparent text-[hsl(var(--pu-m-text))] hover:bg-[hsl(var(--pu-m-surface)/0.45)]"
          onClick={onCancel}
        >
          {t("取消", "Cancel")}
        </Button>
        <Button
          type="button"
          size="lg"
          disabled={confirmDisabled}
          className="rounded-xl border-0 font-bold text-[hsl(var(--pu-primary-foreground))] hover:opacity-95 disabled:opacity-50"
          style={{
            background: "linear-gradient(135deg, hsl(var(--pu-gold)), hsl(var(--pu-gold-soft)))",
            boxShadow: "0 8px 24px hsl(var(--pu-gold) / 0.25)",
          }}
          onClick={() => {
            onConfirmRedeem().catch((err) => {
              console.error("[MemberPoints] handleRedeem uncaught:", err);
              notify.error(t("兑换失败，请稍后重试。", "Redeem failed. Try again later."));
              onRedeemingErrorReset();
            });
          }}
        >
          {redeeming ? (
            <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
          ) : null}
          {t("确认兑换", "Confirm redemption")}
        </Button>
      </div>
    </div>
  );
}
