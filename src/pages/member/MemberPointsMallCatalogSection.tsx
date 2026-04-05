import { ShoppingCart, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ROUTES } from "@/routes/constants";
import { MemberEmptyStateCta } from "@/components/member/MemberEmptyStateCta";
import {
  MemberPointsMallProductCard,
  type MemberPointsMallProductCornerTL,
  type MemberPointsMallProductCornerTR,
} from "@/components/member/MemberPointsMallProductCard";
import type { PointsMallItem, PointsMallCategory } from "@/services/memberPortal/memberPointsPortalService";
import { num, redeemableMaxQty, stockLabel } from "@/pages/member/memberPointsShared";

export const MALL_TAB_ALL = "__all__";
export const MALL_TAB_POPULAR = "__popular__";

export function MemberPointsMallCatalogSection({
  t,
  language,
  itemsLoading,
  items,
  filteredItems,
  mallFilterKey,
  onMallFilterKeyChange,
  mallCategories,
  showMallSkeleton,
  catalogError,
  onCatalogRetry,
  itemsLoadingForRetry,
  points,
  hasFrozen,
  redeeming,
  redeemTargetId,
  themeColor,
  onRequestRedeem,
}: {
  t: (zh: string, en: string) => string;
  language: string;
  itemsLoading: boolean;
  items: PointsMallItem[];
  filteredItems: PointsMallItem[];
  mallFilterKey: string;
  onMallFilterKeyChange: (key: string) => void;
  mallCategories: PointsMallCategory[];
  showMallSkeleton: boolean;
  catalogError: boolean;
  onCatalogRetry: () => void;
  itemsLoadingForRetry: boolean;
  points: number;
  hasFrozen: boolean;
  redeeming: boolean;
  redeemTargetId: string | undefined;
  themeColor: string;
  onRequestRedeem: (p: PointsMallItem) => void;
}) {
  return (
    <>
      <div id="member-mall-catalog" className="scroll-mt-4 px-5">
        {!itemsLoading && items.length > 0 ? (
          <div
            className="-mx-1 mb-4 flex gap-2 overflow-x-auto pb-1 pt-0.5 [scrollbar-width:thin]"
            role="tablist"
            aria-label={t("商品分类", "Categories")}
          >
            <button
              type="button"
              role="tab"
              aria-selected={mallFilterKey === MALL_TAB_ALL}
              className={cn(
                "member-mall-category-tabs__btn shrink-0",
                mallFilterKey === MALL_TAB_ALL && "member-mall-category-tabs__btn--active",
              )}
              onClick={() => onMallFilterKeyChange(MALL_TAB_ALL)}
            >
              {t("全部", "All")}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mallFilterKey === MALL_TAB_POPULAR}
              className={cn(
                "member-mall-category-tabs__btn shrink-0",
                mallFilterKey === MALL_TAB_POPULAR && "member-mall-category-tabs__btn--active",
              )}
              onClick={() => onMallFilterKeyChange(MALL_TAB_POPULAR)}
            >
              {t("受欢迎的", "Popular")}
            </button>
            {mallCategories.map((c) => (
              <button
                key={c.id}
                type="button"
                role="tab"
                aria-selected={mallFilterKey === c.id}
                className={cn(
                  "member-mall-category-tabs__btn shrink-0",
                  mallFilterKey === c.id && "member-mall-category-tabs__btn--active",
                )}
                onClick={() => onMallFilterKeyChange(c.id)}
              >
                {language === "en" ? c.name_en || c.name_zh : c.name_zh}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {showMallSkeleton ? (
        <div className="member-mall-grid px-5">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="member-pu-product-card overflow-hidden" aria-hidden>
              <div className="member-skeleton member-pu-product-card__media-wrap rounded-none border-0" />
              <div className="member-pu-product-card__body">
                <div className="member-skeleton mb-2 h-3.5 w-[88%] rounded-md" />
                <div className="member-skeleton mx-auto mb-2 h-2.5 w-[55%] rounded-md" />
                <div className="member-skeleton h-9 w-full rounded-xl" />
              </div>
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="px-5">
          <div className="rounded-2xl border border-dashed border-[hsl(var(--pu-m-surface-border)/0.35)] bg-[hsl(var(--pu-m-surface)/0.35)] px-5 py-12 text-center">
            <div className="relative">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-[hsl(var(--pu-m-surface-border)/0.25)] bg-[hsl(var(--pu-m-surface)/0.5)] text-[hsl(var(--pu-m-text-dim))]">
                <ShoppingCart className="h-7 w-7" strokeWidth={1.75} aria-hidden />
              </div>
              <p className="m-0 text-sm font-semibold text-[hsl(var(--pu-m-text))]">
                {catalogError
                  ? t("商品列表加载失败", "Failed to load catalog")
                  : t("暂无可兑换商品", "No redeemable items yet")}
              </p>
              <p className="mt-1.5 text-[11px] leading-relaxed text-[hsl(var(--pu-m-text-dim)/0.65)]">
                {catalogError
                  ? t("可点击重试重新加载，或下拉刷新整页数据。", "Tap retry to reload, or pull down to refresh.")
                  : t("管理员上架商品后将显示在此。", "Items will appear here once admins publish them.")}
              </p>
              {!catalogError ? (
                <MemberEmptyStateCta
                  primary={{ to: ROUTES.MEMBER.SPIN, label: t("抽奖赚积分", "Win points on wheel") }}
                  secondary={{ to: ROUTES.MEMBER.DASHBOARD, label: t("回首页看看", "Back to Home") }}
                />
              ) : null}
              {catalogError ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-4 border-[hsl(var(--pu-m-surface-border)/0.35)] bg-[hsl(var(--pu-m-surface)/0.35)] text-[hsl(var(--pu-m-text))] hover:bg-[hsl(var(--pu-m-surface)/0.55)]"
                  disabled={itemsLoadingForRetry}
                  onClick={onCatalogRetry}
                >
                  {itemsLoadingForRetry ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
                      {t("加载中…", "Loading…")}
                    </>
                  ) : (
                    t("重试", "Retry")
                  )}
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="px-5 pb-6 text-center">
          <p className="m-0 text-sm text-[hsl(var(--pu-m-text-dim)/0.85)]">
            {t("该分类下暂无商品", "No items in this category")}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-4 border-[hsl(var(--pu-m-surface-border)/0.35)] bg-[hsl(var(--pu-m-surface)/0.35)] text-[hsl(var(--pu-m-text))]"
            onClick={() => onMallFilterKeyChange(MALL_TAB_ALL)}
          >
            {t("查看全部商品", "View all items")}
          </Button>
        </div>
      ) : (
        <div className="member-mall-grid px-5">
          {filteredItems.map((p) => {
            const soldOut = p.stock_remaining === 0;
            const maxR = redeemableMaxQty(p);
            const canRedeem =
              !hasFrozen && maxR >= 1 && points >= p.points_cost && (p.stock_remaining === -1 || p.stock_remaining > 0);
            const deficit = p.points_cost - points;
            const lowStock = p.stock_remaining > 0 && p.stock_remaining <= 5;
            const redeemLabel = soldOut
              ? t("售罄", "Sold out")
              : hasFrozen
                ? t("冻结中", "Frozen")
                : maxR < 1
                  ? t("已达上限", "Limit reached")
                  : canRedeem
                    ? t("兑换", "Redeem")
                    : t(`还差 ${deficit} 积分`, `Need ${deficit} pts`);
            const cornerTL: MemberPointsMallProductCornerTL = soldOut ? "soldout" : lowStock ? "lowstock" : "none";
            const pop = num(p.tenant_redeem_qty, 0);
            const cornerTR: MemberPointsMallProductCornerTR =
              !soldOut && mallFilterKey === MALL_TAB_POPULAR && pop > 0 ? "hot" : "none";
            return (
              <MemberPointsMallProductCard
                key={p.id}
                product={p}
                memberPoints={points}
                themeColor={themeColor}
                cornerTL={cornerTL}
                cornerTR={cornerTR}
                soldOut={soldOut}
                maxR={maxR}
                canRedeem={canRedeem}
                deficit={deficit}
                redeemLabel={redeemLabel}
                redeeming={redeeming}
                isRedeemTarget={redeemTargetId === p.id}
                t={t}
                showDescription
                stockLine={stockLabel(p.stock_remaining, t)}
                onRedeem={() => {
                  if (!canRedeem || soldOut || maxR < 1) return;
                  onRequestRedeem(p);
                }}
              />
            );
          })}
        </div>
      )}
    </>
  );
}
