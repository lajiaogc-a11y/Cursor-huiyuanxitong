import {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
  type SyntheticEvent,
} from "react";
import {
  ShieldCheck,
  Star,
  Gift,
  Users,
  type LucideIcon,
} from "lucide-react";
import { resolveMemberMediaUrl } from "@/lib/memberMediaUrl";
import { cn } from "@/lib/utils";
import type { MemberPortalSettings } from "@/services/members/memberPortalSettingsService";

/** 自定义轮播图 404 / 跨域失败时回退（避免 handleImgError 把 img 隐藏成「纯黑块」） */
const LOGIN_CAROUSEL_IMAGE_FALLBACK =
  "linear-gradient(155deg, hsl(219 40% 12%) 0%, hsl(216 50% 8%) 55%, hsl(219 35% 16%) 100%)";
const LOGIN_CAROUSEL_IMAGE_FALLBACK_LIGHT =
  "linear-gradient(155deg, hsl(214 52% 98%) 0%, hsl(214 48% 96%) 55%, hsl(214 42% 93%) 100%)";

type BuiltinHeroSlide = {
  kind: "builtin";
  id: string;
  icon: LucideIcon;
  bg: string;
  glow: string;
  title: string;
  body: string;
};
type CustomHeroSlide = { kind: "custom"; id: string; image_url: string; title: string; body: string };
type LoginHeroSlide = BuiltinHeroSlide | CustomHeroSlide;

type BannerLayer =
  | { kind: "image"; id: string; src: string; alt: string }
  | { kind: "gradient"; id: string; background: string; glow?: string };

export type MemberLoginCarouselProps = {
  displaySettings: MemberPortalSettings;
  theme: "light" | "dark";
  t: (zh: string, en: string) => string;
  /** When true, auto-advance pauses (e.g. login panel open). */
  paused: boolean;
};

export function MemberLoginCarousel({ displaySettings, theme, t, paused }: MemberLoginCarouselProps) {
  const [bannerIdx, setBannerIdx] = useState(0);
  const [failedBannerIds, setFailedBannerIds] = useState<Record<string, true>>({});

  const carouselIntervalMs = useMemo(() => {
    const s = Math.min(60, Math.max(3, Math.floor(Number(displaySettings.login_carousel_interval_sec) || 5)));
    return s * 1000;
  }, [displaySettings.login_carousel_interval_sec]);

  const slides = useMemo((): LoginHeroSlide[] => {
    const raw = displaySettings.login_carousel_slides || [];
    const custom: LoginHeroSlide[] = raw
      .map((s, i) => {
        const image_url = String(s.image_url ?? "").trim();
        const title = String(s.title_en || s.title_zh || "").trim();
        const body = String(s.body_en || s.body_zh || "").trim();
        if (!image_url && !title && !body) return null;
        return { kind: "custom" as const, id: `c-${i}`, image_url, title, body };
      })
      .filter((x): x is NonNullable<typeof x> => x != null);
    if (custom.length > 0) return custom;

    const light = theme === "light";
    const builtin: LoginHeroSlide[] = [
      {
        kind: "builtin",
        id: "trust",
        icon: ShieldCheck,
        bg: light
          ? "linear-gradient(155deg, hsl(214 54% 99%) 0%, hsl(214 50% 97%) 55%, hsl(214 45% 94%) 100%)"
          : "linear-gradient(155deg, hsl(219 40% 12%) 0%, hsl(216 50% 8%) 55%, hsl(219 35% 14%) 100%)",
        glow: light
          ? "radial-gradient(ellipse 80% 60% at 70% 20%, hsl(var(--pu-gold) / 0.22) 0%, transparent 55%)"
          : "radial-gradient(ellipse 80% 60% at 70% 20%, hsl(var(--pu-gold) / 0.12) 0%, transparent 55%)",
        title: t("VIP 信赖之选", "Trusted by VIP members"),
        body: t("安全、快速、可靠的会员访问体验。", "Secure, fast, and reliable access."),
      },
      {
        kind: "builtin",
        id: "earn",
        icon: Star,
        bg: light
          ? "linear-gradient(165deg, hsl(214 52% 98%) 0%, hsl(214 48% 96%) 100%)"
          : "linear-gradient(165deg, hsl(219 38% 11%) 0%, hsl(216 50% 7%) 100%)",
        glow: light
          ? "radial-gradient(circle at 20% 80%, hsl(var(--pu-gold) / 0.18) 0%, transparent 50%)"
          : "radial-gradient(circle at 20% 80%, hsl(var(--pu-gold) / 0.1) 0%, transparent 50%)",
        title: t("转·赚·兑", "Spin. Earn. Redeem."),
        body: t("把活跃变成积分与礼遇。", "Turn your activity into rewards."),
      },
      {
        kind: "builtin",
        id: "mall",
        icon: Gift,
        bg: light
          ? "linear-gradient(168deg, hsl(214 50% 99%) 0%, hsl(214 46% 96%) 100%)"
          : "linear-gradient(168deg, hsl(218 35% 10%) 0%, hsl(219 40% 13%) 100%)",
        glow: light
          ? "radial-gradient(ellipse 70% 50% at 50% 0%, hsl(var(--pu-gold) / 0.16) 0%, transparent 60%)"
          : "radial-gradient(ellipse 70% 50% at 50% 0%, hsl(var(--pu-gold) / 0.08) 0%, transparent 60%)",
        title: t("解锁尊享礼遇", "Unlock premium rewards"),
        body: t("积分兑换精选礼品与专属权益。", "Redeem points for exclusive gifts."),
      },
      {
        kind: "builtin",
        id: "invite",
        icon: Users,
        bg: light
          ? "linear-gradient(155deg, hsl(214 48% 98%) 0%, hsl(252 38% 96%) 100%)"
          : "linear-gradient(155deg, hsl(216 50% 7%) 0%, hsl(219 36% 12%) 100%)",
        glow: light
          ? "radial-gradient(circle at 85% 60%, hsl(252 80% 58% / 0.12) 0%, transparent 45%)"
          : "radial-gradient(circle at 85% 60%, hsl(252 100% 68% / 0.08) 0%, transparent 45%)",
        title: t("邀请好友，共享收益", "Invite friends and earn more"),
        body: t("一起成长，点亮更多奖励。", "Grow your rewards together."),
      },
    ];
    return builtin;
  }, [displaySettings.login_carousel_slides, t, theme]);

  const bannerLayers = useMemo((): BannerLayer[] => {
    const imgFallback = theme === "light" ? LOGIN_CAROUSEL_IMAGE_FALLBACK_LIGHT : LOGIN_CAROUSEL_IMAGE_FALLBACK;
    const imgFallbackGlow =
      theme === "light"
        ? "radial-gradient(ellipse 80% 55% at 70% 25%, hsl(var(--pu-gold) / 0.2) 0%, transparent 55%)"
        : "radial-gradient(ellipse 80% 55% at 70% 25%, hsl(var(--pu-gold) / 0.14) 0%, transparent 55%)";
    return slides.map((s) => {
      if (s.kind === "custom") {
        const src = (s.image_url || "").trim() ? resolveMemberMediaUrl(s.image_url) : "";
        if (src) return { kind: "image", id: s.id, src, alt: s.title || s.body || t("活动横幅", "Banner") };
        return {
          kind: "gradient",
          id: s.id,
          background: imgFallback,
          glow: imgFallbackGlow,
        };
      }
      return { kind: "gradient", id: s.id, background: s.bg, glow: s.glow };
    });
  }, [slides, theme, t]);

  const loginBannerBottomScrimStyle = useMemo(
    () => ({
      background:
        theme === "light"
          ? "linear-gradient(to top, hsl(214 50% 97% / 0.94) 0%, hsl(214 54% 98% / 0.48) 45%, transparent 100%)"
          : "linear-gradient(to top, hsl(216 50% 5% / 0.92) 0%, hsl(216 50% 8% / 0.45) 45%, transparent 100%)",
    }),
    [theme],
  );

  const loginCarouselSig = useMemo(
    () => JSON.stringify(displaySettings.login_carousel_slides ?? []),
    [displaySettings.login_carousel_slides],
  );

  useEffect(() => {
    setFailedBannerIds({});
  }, [loginCarouselSig]);

  const onBannerImageError = useCallback((layerId: string, e: SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    const retried = img.dataset.retried;
    if (!retried && img.src) {
      img.dataset.retried = "1";
      const original = img.src;
      img.src = "";
      window.setTimeout(() => {
        img.src = original;
      }, 2000);
      return;
    }
    setFailedBannerIds((prev) => (prev[layerId] ? prev : { ...prev, [layerId]: true }));
  }, []);

  useEffect(() => {
    setBannerIdx(0);
  }, [bannerLayers.length, paused]);

  useEffect(() => {
    if (paused) return;
    if (bannerLayers.length <= 1) return;
    const id = window.setInterval(() => {
      setBannerIdx((i) => (i + 1) % bannerLayers.length);
    }, carouselIntervalMs);
    return () => window.clearInterval(id);
  }, [paused, bannerLayers.length, carouselIntervalMs]);

  const loginCarouselDragRef = useRef<{ x: number; y: number; pointerId: number } | null>(null);

  const onLoginCarouselPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (bannerLayers.length <= 1) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      loginCarouselDragRef.current = { x: e.clientX, y: e.clientY, pointerId: e.pointerId };
    },
    [bannerLayers.length],
  );

  const onLoginCarouselPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const start = loginCarouselDragRef.current;
      if (!start || start.pointerId !== e.pointerId) return;
      loginCarouselDragRef.current = null;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }
      const n = bannerLayers.length;
      if (n <= 1) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 40) {
        if (dx < 0) setBannerIdx((i) => (i + 1) % n);
        else setBannerIdx((i) => (i - 1 + n) % n);
      }
    },
    [bannerLayers.length],
  );

  const onLoginCarouselPointerCancel = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (loginCarouselDragRef.current?.pointerId === e.pointerId) {
      loginCarouselDragRef.current = null;
    }
  }, []);

  return (
    <div className="mb-8 px-5">
      <div
        className="relative cursor-grab overflow-hidden rounded-2xl active:cursor-grabbing"
        style={{ aspectRatio: "2/1", touchAction: "pan-y" }}
        onPointerDown={onLoginCarouselPointerDown}
        onPointerUp={onLoginCarouselPointerUp}
        onPointerCancel={onLoginCarouselPointerCancel}
      >
        {bannerLayers.map((layer, i) => {
          const active = i === bannerIdx;
          const showImg = layer.kind === "image" && !failedBannerIds[layer.id];
          if (layer.kind === "image" && failedBannerIds[layer.id]) {
            return (
              <div
                key={layer.id}
                className="member-login-banner-slide absolute inset-0 transition-[opacity,transform] duration-700 ease-in-out motion-reduce:transition-none"
                style={{
                  opacity: active ? 1 : 0,
                  transform: active ? "scale(1)" : "scale(1.05)",
                }}
                aria-hidden={!active}
              >
                <div className="absolute inset-0" style={{ background: LOGIN_CAROUSEL_IMAGE_FALLBACK }} />
                <div
                  className="absolute inset-0"
                  style={{
                    background:
                      "radial-gradient(ellipse 80% 55% at 70% 25%, hsl(var(--pu-gold) / 0.14) 0%, transparent 55%)",
                  }}
                  aria-hidden
                />
              </div>
            );
          }
          if (showImg) {
            return (
              <img
                key={layer.id}
                src={layer.src}
                alt={layer.alt}
                width={1024}
                height={512}
                className="absolute inset-0 h-full w-full object-cover transition-[opacity,transform,filter] duration-700 ease-in-out"
                style={{
                  opacity: active ? 1 : 0,
                  transform: active ? "scale(1)" : "scale(1.05)",
                }}
                loading={i === 0 ? "eager" : "lazy"}
                onError={(e) => onBannerImageError(layer.id, e)}
              />
            );
          }
          return (
            <div
              key={layer.id}
              className="member-login-banner-slide absolute inset-0 transition-[opacity,transform] duration-700 ease-in-out motion-reduce:transition-none"
              style={{
                opacity: active ? 1 : 0,
                transform: active ? "scale(1)" : "scale(1.05)",
              }}
              aria-hidden={!active}
            >
              <div className="absolute inset-0" style={{ background: layer.background }} />
              {layer.glow ? (
                <div className="absolute inset-0" style={{ background: layer.glow }} aria-hidden />
              ) : null}
            </div>
          );
        })}
        {(() => {
          const s = slides[bannerIdx];
          if (!s) return null;
          const showBuiltin = s.kind === "builtin";
          const showCustomText = s.kind === "custom" && (s.title || s.body);
          if (!showBuiltin && !showCustomText) return null;
          const IconComp = showBuiltin ? s.icon : null;
          return (
            <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
              <div
                className={cn(
                  "absolute inset-x-0 bottom-0 px-4 pt-14",
                  bannerLayers.length > 1 ? "pb-14" : "pb-10",
                )}
                style={loginBannerBottomScrimStyle}
              >
                {showBuiltin && IconComp ? (
                  <>
                    <IconComp className="mb-1.5 h-6 w-6 text-[hsl(var(--pu-gold))]" strokeWidth={2} aria-hidden />
                    <div className="text-[15px] font-extrabold leading-snug tracking-tight text-[hsl(var(--pu-m-text))]">{s.title}</div>
                    <div className="mt-0.5 max-w-[95%] text-[11px] leading-relaxed text-[hsl(var(--pu-m-text)/0.82)]">{s.body}</div>
                  </>
                ) : showCustomText ? (
                  <>
                    {s.title ? (
                      <div className="text-[15px] font-extrabold leading-snug tracking-tight text-[hsl(var(--pu-m-text))]">{s.title}</div>
                    ) : null}
                    {s.body ? (
                      <div className="mt-0.5 max-w-[95%] text-[11px] leading-relaxed text-[hsl(var(--pu-m-text)/0.82)]">{s.body}</div>
                    ) : null}
                  </>
                ) : null}
              </div>
            </div>
          );
        })()}
        {bannerLayers.length > 1 ? (
          <div
            className="pointer-events-auto absolute bottom-3 left-4 z-[2] flex items-center gap-2"
            role="tablist"
            aria-label={t("轮播分页", "Carousel pages")}
          >
            {bannerLayers.map((layer, i) => (
              <button
                key={layer.id}
                type="button"
                role="tab"
                aria-selected={i === bannerIdx}
                onPointerDown={(ev) => ev.stopPropagation()}
                onClick={() => setBannerIdx(i)}
                className={cn(
                  "member-login-carousel-dot shrink-0 rounded-full transition-[width,background-color,opacity,box-shadow] duration-300 ease-out motion-reduce:transition-none",
                  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--pu-gold)/0.6)]",
                  i === bannerIdx
                    ? "h-2 w-[22px] bg-slate-500/85 shadow-sm ring-1 ring-slate-600/20 dark:bg-[#1e3a5c] dark:ring-black/10"
                    : "h-2 w-2 bg-slate-900/25 hover:bg-slate-900/38 dark:bg-white/30 dark:hover:bg-white/50",
                )}
                aria-label={`${t("幻灯", "Slide")} ${i + 1}`}
              />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
