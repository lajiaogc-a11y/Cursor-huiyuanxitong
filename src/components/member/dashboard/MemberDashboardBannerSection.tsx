import { useCallback, useEffect, useMemo, useState } from "react";
import { Megaphone } from "lucide-react";
import { MemberHomeBannerModule } from "@/components/member/MemberHomeBannerModule";
import type { AnnouncementItem, MemberPortalSettings } from "@/services/members/memberPortalSettingsService";

type HomeBanners = MemberPortalSettings["home_banners"];

function useFallbackHomeBannerSlides(t: (zh: string, en: string) => string, theme: "light" | "dark") {
  return useMemo(
    () => {
      const dark = [
        {
          title: t("春季积分狂欢", "Spring points festival"),
          desc: t("消费满 500 积分翻倍，限时 3 天", "Spend 500 pts — double points, 3 days only"),
          gradient: "linear-gradient(135deg, hsl(219 40% 14%), hsl(216 50% 8%))",
          accent: "--pu-gold" as const,
        },
        {
          title: t("邀请好友赢大奖", "Invite friends — win big"),
          desc: t("每邀请 1 人即得 10 次免费抽奖", "Each invite earns 10 free lucky draws"),
          gradient: "linear-gradient(135deg, hsl(252 35% 14%), hsl(216 50% 8%))",
          accent: "--pu-violet" as const,
        },
        {
          title: t("新品上架通知", "New arrivals"),
          desc: t("限量版商品已上线积分商城", "Limited items are live in the points mall"),
          gradient: "linear-gradient(135deg, hsl(219 50% 16%), hsl(216 50% 8%))",
          accent: "--pu-gold-deep" as const,
        },
      ];
      if (theme !== "light") return dark;
      return [
        {
          ...dark[0],
          gradient: "linear-gradient(135deg, hsl(214 54% 97%), hsl(214 48% 94%))",
        },
        {
          ...dark[1],
          gradient: "linear-gradient(135deg, hsl(252 40% 97%), hsl(214 50% 95%))",
        },
        {
          ...dark[2],
          gradient: "linear-gradient(135deg, hsl(214 52% 96%), hsl(214 45% 93%))",
        },
      ];
    },
    [t, theme],
  );
}

export interface MemberDashboardCheckInSummaryLike {
  current_streak_days?: number | null;
}

export interface MemberDashboardBannerSectionProps {
  homeBanners: HomeBanners;
  homeBannersCarouselIntervalSec: number;
  themeColor: string;
  theme: "light" | "dark";
  t: (zh: string, en: string) => string;
  spinRemaining: number;
  spinError: unknown;
  checkInSummary: MemberDashboardCheckInSummaryLike | null | undefined;
  showPointsSkeleton: boolean;
  showCheckInSublineSkeleton: boolean;
  announcementItems: AnnouncementItem[];
  onSelectAnnouncement: (item: AnnouncementItem) => void;
}

export function MemberDashboardBannerSection({
  homeBanners,
  homeBannersCarouselIntervalSec,
  themeColor,
  theme,
  t,
  spinRemaining,
  spinError,
  checkInSummary,
  showPointsSkeleton,
  showCheckInSublineSkeleton,
  announcementItems,
  onSelectAnnouncement,
}: MemberDashboardBannerSectionProps) {
  const fallbackBannerSlides = useFallbackHomeBannerSlides(t, theme);
  const [fallbackBannerIdx, setFallbackBannerIdx] = useState(0);
  const [fallbackBannerSliding, setFallbackBannerSliding] = useState(false);

  const nextFallbackBanner = useCallback(() => {
    setFallbackBannerSliding(true);
    window.setTimeout(() => {
      setFallbackBannerIdx((i) => (i + 1) % fallbackBannerSlides.length);
      setFallbackBannerSliding(false);
    }, 300);
  }, [fallbackBannerSlides.length]);

  useEffect(() => {
    if (Array.isArray(homeBanners) && homeBanners.length > 0) return;
    const timer = window.setInterval(nextFallbackBanner, 4000);
    return () => window.clearInterval(timer);
  }, [nextFallbackBanner, homeBanners]);

  return (
    <>
      {Array.isArray(homeBanners) && homeBanners.length > 0 ? (
        <div className="mb-5 overflow-hidden rounded-2xl border border-[hsl(var(--pu-m-surface-border)/0.28)] bg-[hsl(var(--pu-m-surface)/0.08)] p-2 shadow-[0_12px_40px_-12px_rgba(0,0,0,0.35)]">
          <MemberHomeBannerModule
            banners={homeBanners}
            themeColor={themeColor}
            className="mb-0"
            carouselIntervalSec={homeBannersCarouselIntervalSec}
          />
        </div>
      ) : (
        <div className="mb-5">
          <div
            className="relative min-h-[120px] overflow-hidden rounded-2xl border border-[hsl(var(--pu-m-surface-border)/0.25)] p-5 pb-4 transition-all duration-300"
            style={{
              background: fallbackBannerSlides[fallbackBannerIdx].gradient,
              opacity: fallbackBannerSliding ? 0 : 1,
              transform: fallbackBannerSliding ? "translateX(-12px)" : "translateX(0)",
            }}
          >
            <div
              className="pointer-events-none absolute right-0 top-0 h-40 w-40 rounded-full blur-[60px]"
              style={{
                background: `hsl(var(${fallbackBannerSlides[fallbackBannerIdx].accent}) / 0.15)`,
              }}
              aria-hidden
            />
            <div className="relative">
              <h3 className="mb-1.5 text-lg font-extrabold text-[hsl(var(--pu-m-text))] drop-shadow-sm">
                {fallbackBannerSlides[fallbackBannerIdx].title}
              </h3>
              <p className="text-sm font-medium leading-relaxed text-[hsl(var(--pu-m-text)/0.75)]">
                {fallbackBannerSlides[fallbackBannerIdx].desc}
              </p>
              <p className="mt-3 flex min-h-[1.25rem] flex-wrap items-center gap-x-1 gap-y-1 text-[11px] font-medium text-[hsl(var(--pu-m-text-dim))]">
                {showPointsSkeleton ? (
                  <span
                    className="inline-block h-3.5 w-36 max-w-[55vw] animate-pulse rounded-md bg-[hsl(var(--pu-m-surface)/0.38)] motion-reduce:animate-none"
                    aria-hidden
                  />
                ) : spinError ? (
                  "—"
                ) : (
                  t(`剩余转盘 ${spinRemaining} 次`, `${spinRemaining} spins left`)
                )}
                <span className="opacity-40" aria-hidden>
                  ·
                </span>
                {showCheckInSublineSkeleton ? (
                  <span
                    className="inline-block h-3.5 w-24 max-w-[40vw] animate-pulse rounded-md bg-[hsl(var(--pu-m-surface)/0.38)] motion-reduce:animate-none"
                    aria-hidden
                  />
                ) : (
                  t(
                    `连续 ${checkInSummary?.current_streak_days ?? 0} 天`,
                    `${checkInSummary?.current_streak_days ?? 0}d streak`,
                  )
                )}
              </p>
              <div className="mt-4 flex items-center gap-1.5">
                {fallbackBannerSlides.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    aria-label={`${t("活动", "Promo")} ${i + 1}`}
                    onClick={() => {
                      setFallbackBannerSliding(true);
                      window.setTimeout(() => {
                        setFallbackBannerIdx(i);
                        setFallbackBannerSliding(false);
                      }, 300);
                    }}
                    className="rounded-full transition-all duration-300"
                    style={{
                      width: i === fallbackBannerIdx ? 20 : 6,
                      height: 6,
                      background:
                        i === fallbackBannerIdx ? "hsl(var(--pu-m-text))" : "hsl(var(--pu-m-text) / 0.25)",
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {announcementItems.length > 0 ? (
        <div className="member-home-ann-scroller m-glass mb-4 flex items-center gap-2.5 overflow-hidden p-3">
          <Megaphone className="h-4 w-4 shrink-0 text-pu-rose-soft" aria-hidden />
          <div className="member-home-ann-viewport relative min-w-0 flex-1 overflow-hidden">
            <div
              className="member-home-ann-track inline-flex w-max items-center animate-[marquee_18s_linear_infinite]"
              style={{
                animationDuration: `${Math.max(14, announcementItems.length * 5)}s`,
              }}
            >
              {[...announcementItems, ...announcementItems].map((ann, i) => (
                <span key={`${ann.sort_order}-${i}`} className="inline-flex shrink-0 items-center">
                  {i > 0 ? (
                    <span
                      className="mx-3 inline-block h-3.5 w-px shrink-0 rounded-full bg-[hsl(var(--pu-m-text)/0.28)] opacity-85"
                      aria-hidden
                    />
                  ) : null}
                  <button
                    type="button"
                    onClick={() => onSelectAnnouncement(ann)}
                    className="inline-flex max-w-none items-center rounded-lg border border-transparent px-2 py-1 text-left text-sm font-medium text-[hsl(var(--pu-m-text)/0.82)] transition-colors hover:border-[hsl(var(--pu-m-surface-border)/0.35)] hover:bg-[hsl(var(--pu-m-surface)/0.25)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--pu-gold)/0.35)]"
                  >
                    <span className="whitespace-nowrap">
                      {(ann.title && ann.title.trim()) || (ann.content && ann.content.trim()) || t("通知", "Notice")}
                    </span>
                  </button>
                </span>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
