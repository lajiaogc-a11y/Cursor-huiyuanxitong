import { ShoppingCart, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useMemberResolvableMedia } from "@/hooks/useMemberResolvableMedia";
import type { PointsMallItem } from "@/services/members/memberPointsMallRpcService";

export type MemberPointsMallProductCornerTL = "none" | "soldout" | "lowstock";
export type MemberPointsMallProductCornerTR = "none" | "hot";

export type MemberPointsMallProductCardProps = {
  product: PointsMallItem;
  memberPoints: number;
  themeColor: string;
  /** 左上角：售罄 / 低库存 */
  cornerTL: MemberPointsMallProductCornerTL;
  /** 右上角：热门 */
  cornerTR: MemberPointsMallProductCornerTR;
  soldOut: boolean;
  maxR: number;
  canRedeem: boolean;
  deficit: number;
  redeemLabel: string;
  redeeming: boolean;
  isRedeemTarget: boolean;
  t: (zh: string, en: string) => string;
  onRedeem: () => void;
  /** 主网格展示简介两行；推荐区可关闭以收紧版面 */
  showDescription?: boolean;
  stockLine: string;
};

export function MallProductCornerBadges({
  cornerTL,
  cornerTR,
  stockRemaining,
  t,
}: {
  cornerTL: MemberPointsMallProductCornerTL;
  cornerTR: MemberPointsMallProductCornerTR;
  stockRemaining: number;
  t: (zh: string, en: string) => string;
}) {
  return (
    <>
      {cornerTL === "soldout" ? (
        <span className="member-pu-product-card__badge member-pu-product-card__badge--tl member-pu-product-card__badge--soldout">
          {t("售罄", "Sold out")}
        </span>
      ) : null}
      {cornerTL === "lowstock" ? (
        <span className="member-pu-product-card__badge member-pu-product-card__badge--tl member-pu-product-card__badge--stock">
          {t(`仅剩 ${stockRemaining} 件`, `Only ${stockRemaining} left`)}
        </span>
      ) : null}
      {cornerTR === "hot" ? (
        <span className="member-pu-product-card__badge member-pu-product-card__badge--tr member-pu-product-card__badge--hot">HOT</span>
      ) : null}
    </>
  );
}

/**
 * 积分商城商品卡（premium-ui-boost ProductCard 结构：1:1 方图、角标、图底积分条 + 标题与兑换按钮）。
 */
export function MemberPointsMallProductCard({
  product: p,
  memberPoints: points,
  themeColor: _themeColor,
  cornerTL,
  cornerTR,
  soldOut,
  maxR,
  canRedeem,
  deficit,
  redeemLabel,
  redeeming,
  isRedeemTarget,
  t,
  onRedeem,
  showDescription = true,
  stockLine,
}: MemberPointsMallProductCardProps) {
  const { resolvedSrc, usePlaceholder, onImageError } = useMemberResolvableMedia(p.id, p.image_url);

  return (
    <div
      className={cn("member-pu-product-card", soldOut && "member-pu-product-card--soldout")}
      style={{ opacity: soldOut ? 0.78 : 1 }}
    >
      <div className="member-pu-product-card__media-wrap">
        {usePlaceholder ? (
          <div className="member-pu-product-card__placeholder flex h-full w-full items-center justify-center">
            <ShoppingCart className="h-8 w-8 text-[hsl(var(--pu-m-text-dim)/0.35)]" strokeWidth={1.5} aria-hidden />
          </div>
        ) : (
          <img
            src={resolvedSrc}
            alt={p.title}
            className="member-pu-product-card__img"
            loading="lazy"
            onError={onImageError}
            style={{ filter: soldOut ? "grayscale(0.5)" : undefined }}
          />
        )}
        <MallProductCornerBadges cornerTL={cornerTL} cornerTR={cornerTR} stockRemaining={p.stock_remaining} t={t} />
        <div className="member-pu-product-card__points-strip">
          <div className="flex min-w-0 items-center gap-1.5">
            <Sparkles
              className={cn(
                "h-3.5 w-3.5 shrink-0",
                soldOut ? "text-[hsl(var(--pu-m-text-dim)/0.35)]" : "text-[hsl(var(--pu-gold-soft))]",
              )}
              aria-hidden
            />
            <span
              className={cn(
                "member-pu-product-card__points-value tabular-nums",
                soldOut && "member-pu-product-card__points-value--muted",
              )}
            >
              {p.points_cost}
              <span className="member-pu-product-card__points-unit">{t("积分", "pts")}</span>
            </span>
          </div>
        </div>
      </div>

      <div className="member-pu-product-card__body">
        <p className="member-pu-product-card__title">{p.title}</p>
        {showDescription && p.description ? (
          <p className="member-pu-product-card__desc">{p.description}</p>
        ) : (
          <div className="member-pu-product-card__desc-spacer" />
        )}
        <p className={cn("member-pu-product-card__stock", soldOut && "member-pu-product-card__stock--soldout")}>
          {stockLine}
          {soldOut ? ` · ${t("暂不可兑", "Unavailable")}` : ""}
        </p>
        {!soldOut && deficit > 0 && p.points_cost > 0 ? (
          <div className="member-pu-product-card__progress">
            <div className="member-pu-product-card__progress-track">
              <div
                className="member-pu-product-card__progress-fill"
                style={{
                  width: `${Math.min(100, (points / p.points_cost) * 100)}%`,
                  background: "linear-gradient(90deg, hsl(var(--pu-gold)), hsl(var(--pu-gold-soft)))",
                }}
              />
            </div>
            <p className="member-pu-product-card__progress-label">{t("兑换进度", "Progress to redeem")}</p>
          </div>
        ) : null}
        <Button
          type="button"
          size="sm"
          disabled={!canRedeem || redeeming || soldOut || maxR < 1}
          className={cn(
            "member-pu-product-card__cta h-10 w-full rounded-xl text-xs font-extrabold tracking-wide",
            canRedeem && !soldOut && maxR >= 1
              ? "border-0 text-[hsl(var(--pu-primary-foreground))] shadow-lg hover:opacity-95"
              : soldOut
                ? "border border-[hsl(var(--pu-m-surface-border)/0.28)] bg-[hsl(var(--pu-m-surface)/0.22)] text-[hsl(var(--pu-m-text-dim)/0.5)] hover:bg-[hsl(var(--pu-m-surface)/0.22)]"
                : "border border-pu-gold/50 bg-transparent text-pu-gold-soft hover:bg-pu-gold/12 hover:text-pu-gold-soft",
          )}
          style={
            canRedeem && !soldOut && maxR >= 1
              ? {
                  background: "linear-gradient(135deg, hsl(var(--pu-gold)), hsl(var(--pu-gold-soft)))",
                  boxShadow: "0 8px 22px hsl(var(--pu-gold) / 0.27)",
                }
              : undefined
          }
          onClick={() => {
            if (!canRedeem || soldOut || maxR < 1) return;
            onRedeem();
          }}
        >
          {redeeming && isRedeemTarget ? (
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden />
          ) : null}
          {redeemLabel}
        </Button>
      </div>
    </div>
  );
}

export type MemberPointsMallProductListRowProps = Omit<MemberPointsMallProductCardProps, "showDescription" | "cornerTR"> & {
  cornerTR?: MemberPointsMallProductCornerTR;
};

/**
 * 列表视图：与网格同一套角标 + 方图底积分条，横向信息区 + 兑换按钮。
 */
export function MemberPointsMallProductListRow({
  product: p,
  memberPoints: points,
  themeColor: _themeColor,
  cornerTL,
  cornerTR = "none",
  soldOut,
  maxR,
  canRedeem,
  deficit,
  redeemLabel,
  redeeming,
  isRedeemTarget,
  t,
  onRedeem,
  stockLine,
}: MemberPointsMallProductListRowProps) {
  const { resolvedSrc, usePlaceholder, onImageError } = useMemberResolvableMedia(p.id, p.image_url);

  return (
    <div
      className={cn("member-pu-product-list-row", soldOut && "member-pu-product-list-row--soldout")}
      style={{ opacity: soldOut ? 0.78 : 1 }}
    >
      <div className="member-pu-product-list-row__thumb">
        {usePlaceholder ? (
          <div className="member-pu-product-card__placeholder flex h-full w-full items-center justify-center rounded-none border-0">
            <ShoppingCart className="h-7 w-7 text-[hsl(var(--pu-m-text-dim)/0.35)]" strokeWidth={1.5} aria-hidden />
          </div>
        ) : (
          <img
            src={resolvedSrc}
            alt=""
            className="member-pu-product-list-row__img"
            loading="lazy"
            onError={onImageError}
            style={{ filter: soldOut ? "grayscale(0.5)" : undefined }}
          />
        )}
        <MallProductCornerBadges cornerTL={cornerTL} cornerTR={cornerTR} stockRemaining={p.stock_remaining} t={t} />
        <div className="member-pu-product-list-row__points-strip">
          <Sparkles
            className={cn(
              "member-pu-product-list-row__spark h-3 w-3 shrink-0",
              soldOut ? "text-[hsl(var(--pu-m-text-dim)/0.35)]" : "text-[hsl(var(--pu-gold-soft))]",
            )}
            aria-hidden
          />
          <span
            className={cn(
              "member-pu-product-list-row__points tabular-nums",
              soldOut && "member-pu-product-list-row__points--muted",
            )}
          >
            {p.points_cost}
            <span className="member-pu-product-list-row__pts">{t("积分", "pts")}</span>
          </span>
        </div>
      </div>
      <div className="member-pu-product-list-row__body">
        <p className="member-pu-product-list-row__title">{p.title}</p>
        {p.description ? (
          <p className="member-pu-product-list-row__sub">{p.description}</p>
        ) : null}
        <p className={cn("member-pu-product-list-row__stock", soldOut && "member-pu-product-list-row__stock--soldout")}>
          {stockLine}
          {soldOut ? ` · ${t("不可兑", "Unavailable")}` : ""}
        </p>
        {!soldOut && deficit > 0 && p.points_cost > 0 ? (
          <div className="member-pu-product-list-row__progress">
            <div className="member-pu-product-card__progress-track">
              <div
                className="member-pu-product-card__progress-fill"
                style={{
                  width: `${Math.min(100, (points / p.points_cost) * 100)}%`,
                  background: "linear-gradient(90deg, hsl(var(--pu-gold)), hsl(var(--pu-gold-soft)))",
                }}
              />
            </div>
            <p className="member-pu-product-list-row__progress-lbl">{t("兑换进度", "Progress")}</p>
          </div>
        ) : null}
      </div>
      <Button
        type="button"
        size="sm"
        disabled={!canRedeem || redeeming || soldOut || maxR < 1}
        className={cn(
          "member-pu-product-list-row__btn h-9 min-w-[88px] shrink-0 rounded-xl px-3 text-[11px] font-extrabold",
          canRedeem && !soldOut && maxR >= 1
            ? "border-0 text-[hsl(var(--pu-primary-foreground))] shadow-md hover:opacity-95"
            : soldOut
              ? "border border-[hsl(var(--pu-m-surface-border)/0.28)] bg-[hsl(var(--pu-m-surface)/0.22)] text-[hsl(var(--pu-m-text-dim)/0.5)] hover:bg-[hsl(var(--pu-m-surface)/0.22)]"
              : "border border-pu-gold/50 bg-transparent text-pu-gold-soft hover:bg-pu-gold/12",
        )}
        style={
          canRedeem && !soldOut && maxR >= 1
            ? {
                background: "linear-gradient(135deg, hsl(var(--pu-gold)), hsl(var(--pu-gold-soft)))",
              }
            : undefined
        }
        onClick={() => {
          if (!canRedeem || soldOut || maxR < 1) return;
          onRedeem();
        }}
      >
        {redeeming && isRedeemTarget ? (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden />
        ) : null}
        {redeemLabel}
      </Button>
    </div>
  );
}
