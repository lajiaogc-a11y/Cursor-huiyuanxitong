/**
 * 会员首页 Banner 轮播（模块化）
 * - `MemberBannerCarousel`：`items: BannerItem[]` 可复用轮播
 * - `MemberHomeBannerModule`：门户 `home_banners`（含 full_image / split）适配层
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode, type TouchEvent } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";
import { resolveMemberMediaUrl } from "@/lib/memberMediaUrl";
import { useMemberResolvableMedia } from "@/hooks/useMemberResolvableMedia";
import type { MemberPortalSettings } from "@/services/members/memberPortalSettingsService";
import { getHomeBannerPresetById, type HomeBannerTone } from "@/lib/memberPortalHomeBannerPresets";
import {
  normalizeHomeBannerImageFit,
  normalizeHomeBannerLayout,
  sanitizeHomeBannerObjectPosition,
} from "@/lib/memberHomeBannerStyle";
import { ChevronRight } from "lucide-react";

// --- 公共数据模型（可复用） ---

export interface BannerItem {
  title: string;
  subtitle?: string;
  image?: string;
  actionText?: string;
  onClick?: () => void;
}

export type MemberHomeBannerItem = MemberPortalSettings["home_banners"][number];

const GRADIENTS = [
  "from-violet-600 via-purple-600 to-indigo-900",
  "from-emerald-600 via-teal-600 to-cyan-900",
  "from-orange-500 via-amber-500 to-rose-900",
  "from-rose-600 via-pink-600 to-fuchsia-900",
  "from-emerald-700 via-teal-800 to-cyan-950",
];

const BANNER_HEIGHT = "clamp(160px, 28vw, 190px)";
const BANNER_RADIUS = "rounded-[22px]";

// --- 工具 ---

function resolveBannerImageSrc(banner: MemberHomeBannerItem): string {
  const presetId = String(banner.image_preset_id || "").trim();
  if (presetId) {
    const p = getHomeBannerPresetById(presetId);
    if (p?.dataUrl) return p.dataUrl;
  }
  const url = String(banner.image_url || "").trim();
  return url ? resolveMemberMediaUrl(url) : "";
}

function resolveBannerTone(banner: MemberHomeBannerItem): HomeBannerTone {
  const presetId = String(banner.image_preset_id || "").trim();
  if (presetId) {
    const p = getHomeBannerPresetById(presetId);
    if (p) return p.tone;
  }
  return "dark";
}

function isFullImageLayout(banner: MemberHomeBannerItem): boolean {
  return normalizeHomeBannerLayout(banner.banner_layout) === "full_image";
}

// --- BannerIndicator ---

interface BannerIndicatorProps {
  count: number;
  current: number;
  onSelect: (index: number) => void;
  labelSlide: (i: number) => string;
  labelList: string;
}

function BannerIndicator({ count, current, onSelect, labelSlide, labelList }: BannerIndicatorProps) {
  if (count <= 1) return null;
  return (
    <div
      className="absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2"
      role="tablist"
      aria-label={labelList}
    >
      {Array.from({ length: count }, (_, i) => (
        <button
          key={i}
          type="button"
          role="tab"
          aria-selected={i === current}
          className={cn(
            "h-2 min-w-2 rounded-full transition-all duration-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pu-gold/55",
            i === current
              ? "w-6 bg-pu-gold-soft shadow-[0_0_12px_hsl(var(--pu-gold)/0.4)]"
              : "w-2 bg-[hsl(var(--pu-m-text)/0.35)] hover:bg-[hsl(var(--pu-m-text)/0.52)]",
          )}
          onClick={() => onSelect(i)}
          aria-label={labelSlide(i)}
        />
      ))}
    </div>
  );
}

// --- BannerContent（左侧文案 + 操作） ---

interface BannerContentProps {
  title: string;
  subtitle?: string;
  actionText?: string;
  onAction?: () => void;
  themeColor: string;
  tone: HomeBannerTone;
  /** 为底部指示条预留空间 */
  paddedBottom: boolean;
}

function BannerContent({
  title,
  subtitle,
  actionText,
  onAction,
  themeColor,
  tone,
  paddedBottom,
}: BannerContentProps) {
  const isLight = tone === "light";
  return (
    <div
      className={cn(
        "relative z-10 flex min-h-0 min-w-0 flex-1 flex-col justify-center gap-2 pl-5 pr-3 pt-1 sm:pl-6",
        paddedBottom ? "pb-11" : "pb-3",
      )}
    >
      {title?.trim() ? (
        <h3
          className={cn(
            "line-clamp-2 max-w-full text-balance font-bold leading-[1.2] tracking-tight",
            "text-[clamp(1.05rem,3.8vw,1.5rem)]",
            isLight
              ? "text-[hsl(var(--pu-m-text))] drop-shadow-[0_2px_14px_rgba(0,0,0,0.55)]"
              : "text-[hsl(var(--pu-m-text))] drop-shadow-[0_2px_12px_rgba(0,0,0,0.45)]",
          )}
        >
          {title}
        </h3>
      ) : null}
      {subtitle?.trim() ? (
        <p
          className={cn(
            "line-clamp-2 max-w-full text-pretty leading-snug",
            "text-[clamp(0.72rem,2.4vw,0.875rem)]",
            isLight
              ? "text-[hsl(var(--pu-m-text)/0.92)] drop-shadow-[0_1px_10px_rgba(0,0,0,0.45)]"
              : "text-[hsl(var(--pu-m-text)/0.88)] drop-shadow-[0_1px_8px_rgba(0,0,0,0.35)]",
          )}
        >
          {subtitle}
        </p>
      ) : null}
      {actionText?.trim() && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className={cn(
            "mt-1 inline-flex min-h-11 max-w-full shrink-0 items-center justify-center gap-1.5 self-start rounded-xl px-5 py-2.5",
            "text-sm font-semibold text-[hsl(var(--pu-primary-foreground))] shadow-lg transition active:scale-[0.98]",
            "ring-1 ring-[hsl(var(--pu-m-surface-border)/0.35)] hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pu-gold/45",
          )}
          style={{
            WebkitTapHighlightColor: "transparent",
            backgroundColor: themeColor,
            boxShadow: `0 10px 28px -6px ${themeColor}66, 0 4px 12px rgba(0,0,0,0.35)`,
          }}
        >
          {actionText}
          <ChevronRight className="h-4 w-4 shrink-0 opacity-90" aria-hidden />
        </button>
      ) : null}
    </div>
  );
}

// --- 装饰层（无图时） ---

function DecoShapes({ idx }: { idx: number }) {
  const variant = idx % 3;
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {variant === 0 && (
        <>
          <div className="absolute -right-4 -top-8 h-32 w-32 rounded-full bg-pu-gold/[0.14] blur-xl" />
          <div className="absolute bottom-2 right-8 h-20 w-20 rounded-full bg-pu-gold/[0.1] blur-md" />
          <div className="absolute right-6 top-1/2 h-14 w-14 -translate-y-1/2 rotate-45 rounded-2xl bg-[hsl(var(--pu-m-surface)/0.22)]" />
        </>
      )}
      {variant === 1 && (
        <>
          <div className="absolute -right-2 top-1/2 h-36 w-36 -translate-y-1/2 rounded-full border-2 border-pu-gold/[0.18] blur-[1px]" />
          <div className="absolute -bottom-4 right-12 h-24 w-24 rounded-full bg-pu-emerald/[0.08] blur-lg" />
        </>
      )}
      {variant === 2 && (
        <>
          <div className="absolute right-2 top-4 h-24 w-24 rotate-12 rounded-3xl bg-[hsl(var(--pu-m-surface)/0.25)] blur-sm" />
          <div className="absolute -right-2 bottom-4 h-28 w-20 rounded-full bg-pu-gold/[0.09] blur-md" />
        </>
      )}
    </div>
  );
}

// --- BannerVisual（右侧视觉：融合进整体渐变，禁止硬拼矩形） ---

interface BannerVisualProps {
  image?: string;
  /** 与 useMemberResolvableMedia 的稳定 key（同图换 URL 时重置重试） */
  imageKey: string;
  imageFit: ReturnType<typeof normalizeHomeBannerImageFit>;
  imagePosition: string;
  themeColor: string;
  gradientIndex: number;
}

function BannerVisual({ image, imageKey, imageFit, imagePosition, themeColor, gradientIndex }: BannerVisualProps) {
  const raw = (image || "").trim();
  const { resolvedSrc, usePlaceholder, onImageError } = useMemberResolvableMedia(imageKey, raw || undefined);

  if (raw && !usePlaceholder) {
    /** 后台上传图：置于轮播卡片内独立圆角区域，与左侧文案并列（object-fit 随后台配置） */
    return (
      <div
        className="pointer-events-none relative z-[1] flex h-full min-h-0 shrink-0 items-center justify-center py-1.5 pl-1 pr-2 sm:py-2 sm:pr-3"
        aria-hidden
      >
        <div
          className="relative flex h-[clamp(5.25rem,24vw,7rem)] w-[clamp(5.25rem,30vw,8.25rem)] max-h-[calc(100%-0.5rem)] items-center justify-center overflow-hidden rounded-[14px] border border-[hsl(var(--pu-m-surface-border)/0.35)] bg-[hsl(var(--pu-m-bg-1)/0.12)]"
          style={{
            boxShadow: `inset 0 1px 0 hsl(var(--pu-m-surface-border) / 0.2), 0 8px 22px -10px ${themeColor}33`,
          }}
        >
          <img
            src={resolvedSrc}
            alt=""
            className="h-full w-full select-none"
            style={{
              objectFit: imageFit,
              objectPosition: imagePosition,
            }}
            onError={onImageError}
            draggable={false}
          />
        </div>
      </div>
    );
  }

  if (raw && usePlaceholder) {
    return (
      <div
        className="pointer-events-none relative z-[1] flex h-full min-h-0 shrink-0 items-center justify-center py-1.5 pl-1 pr-2 sm:py-2 sm:pr-3"
        aria-hidden
      >
        <div
          className="relative flex h-[clamp(5.25rem,24vw,7rem)] w-[clamp(5.25rem,30vw,8.25rem)] max-h-[calc(100%-0.5rem)] items-center justify-center overflow-hidden rounded-[14px] border border-[hsl(var(--pu-m-surface-border)/0.3)] bg-gradient-to-br from-[hsl(var(--pu-m-surface)/0.35)] to-[hsl(var(--pu-m-bg-1)/0.75)]"
          style={{
            boxShadow: `inset 0 1px 0 hsl(var(--pu-m-surface-border) / 0.2), 0 8px 22px -10px ${themeColor}33`,
          }}
        />
      </div>
    );
  }

  return (
    <div className="pointer-events-none relative z-[1] h-full w-[min(40%,10rem)] shrink-0 sm:w-[min(36%,12rem)]" aria-hidden>
      <DecoShapes idx={gradientIndex} />
      <div
        className="absolute inset-0 opacity-35"
        style={{
          background: `radial-gradient(ellipse 85% 70% at 88% 42%, ${themeColor}, transparent 62%)`,
        }}
        aria-hidden
      />
      <div className="absolute inset-0 flex items-center justify-center pr-1">
        <div
          className="h-[4.25rem] w-[4.25rem] rounded-[1.25rem] border border-[hsl(var(--pu-m-surface-border)/0.35)] shadow-[0_12px_40px_rgba(0,0,0,0.2)] opacity-80 blur-[0.5px] sm:h-[5rem] sm:w-[5rem] sm:rounded-3xl"
          style={{
            background: `linear-gradient(145deg, ${themeColor}66, hsl(var(--pu-m-surface) / 0.35))`,
            transform: "rotate(8deg)",
          }}
          aria-hidden
        />
      </div>
    </div>
  );
}

// --- BannerSlide ---

interface BannerSlideProps {
  active: boolean;
  children: ReactNode;
}

function BannerSlide({ active, children }: BannerSlideProps) {
  return (
    <div
      className={cn(
        "absolute inset-0 transition-[opacity,transform] duration-500 ease-out motion-reduce:transition-none",
        active ? "z-10 translate-x-0 opacity-100" : "z-0 translate-x-8 opacity-0 pointer-events-none",
      )}
      role="tabpanel"
      aria-hidden={!active}
    >
      {children}
    </div>
  );
}

// --- full-bleed 单项（保留门户 full_image） ---

interface BannerFullBleedContentProps {
  imgSrc: string;
  imageKey: string;
  gradientClass: string;
  fit: ReturnType<typeof normalizeHomeBannerImageFit>;
  pos: string;
  link?: string;
  /** 有链接时的无障碍名称；未填标题/副标题时留空，不显示占位文案 */
  label?: string;
  showDots: boolean;
}

function BannerFullBleedInner({
  imgSrc,
  imageKey,
  gradientClass,
  fit,
  pos,
}: Pick<BannerFullBleedContentProps, "imgSrc" | "imageKey" | "gradientClass" | "fit" | "pos">) {
  const raw = (imgSrc || "").trim();
  const { resolvedSrc, usePlaceholder, onImageError } = useMemberResolvableMedia(imageKey, raw || undefined);
  const showImg = raw && !usePlaceholder;

  if (showImg) {
    return (
      <img
        src={resolvedSrc}
        alt=""
        className="h-full w-full select-none"
        style={{ objectFit: fit, objectPosition: pos }}
        onError={onImageError}
        draggable={false}
      />
    );
  }
  return <div className={cn("h-full w-full bg-gradient-to-br", gradientClass)} aria-hidden />;
}

function BannerFullBleedContent({
  imgSrc,
  imageKey,
  gradientClass,
  fit,
  pos,
  link,
  label,
  showDots,
}: BannerFullBleedContentProps) {
  const imgNode = (
    <BannerFullBleedInner imgSrc={imgSrc} imageKey={imageKey} gradientClass={gradientClass} fit={fit} pos={pos} />
  );

  const inner = (
    <div
      className={cn("absolute inset-x-0 top-0 overflow-hidden", showDots ? "bottom-10" : "bottom-0")}
    >
      {link ? (
        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          className="block h-full w-full outline-none focus-visible:ring-2 focus-visible:ring-pu-gold/50 focus-visible:ring-inset"
          aria-label={label?.trim() ? label.trim() : undefined}
        >
          {imgNode}
        </a>
      ) : (
        imgNode
      )}
    </div>
  );

  return <div className="relative h-full w-full overflow-hidden">{inner}</div>;
}

// --- BannerContainer（外层轨道 + 手势 + 指示器） ---

interface BannerContainerProps {
  className?: string;
  /** true：视口全宽外溢（旧版）；false：限制在父卡片内（首页） */
  fullBleed?: boolean;
  children: ReactNode;
  showDots: boolean;
  dotCount: number;
  current: number;
  setCurrent: (i: number | ((n: number) => number)) => void;
  ariaLabel: string;
  labelSlide: (i: number) => string;
  labelList: string;
}

function BannerContainer({
  className,
  fullBleed = false,
  children,
  showDots,
  dotCount,
  current,
  setCurrent,
  ariaLabel,
  labelSlide,
  labelList,
}: BannerContainerProps) {
  const [touchStart, setTouchStart] = useState<number | null>(null);

  const onTouchStart = useCallback((e: TouchEvent) => setTouchStart(e.touches[0].clientX), []);
  const onTouchEnd = useCallback(
    (e: TouchEvent) => {
      if (touchStart === null || dotCount <= 1) return;
      const diff = touchStart - e.changedTouches[0].clientX;
      if (Math.abs(diff) > 40) {
        setCurrent((c) => (diff > 0 ? (c + 1) % dotCount : (c - 1 + dotCount) % dotCount));
      }
      setTouchStart(null);
    },
    [touchStart, dotCount, setCurrent],
  );

  return (
    <section
      className={cn(
        "member-hero-banner relative z-0 mb-6 w-full max-w-full",
        fullBleed
          ? "left-1/2 w-screen max-w-[100vw] -translate-x-1/2 px-3 sm:px-4"
          : "left-auto translate-x-0 px-0",
        className,
      )}
      role="region"
      aria-roledescription="carousel"
      aria-label={ariaLabel}
    >
      <div
        className={cn(
          "relative w-full overflow-hidden shadow-[0_22px_56px_-14px_rgba(0,0,0,0.55)] ring-1 ring-[hsl(var(--pu-m-surface-border)/0.22)]",
          BANNER_RADIUS,
        )}
        style={{ height: BANNER_HEIGHT, minHeight: 160 }}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {children}
        <BannerIndicator
          count={dotCount}
          current={current}
          onSelect={(i) => setCurrent(i)}
          labelSlide={labelSlide}
          labelList={labelList}
        />
      </div>
    </section>
  );
}

// --- 卡片式单项（统一渐变底 + flex） ---

interface BannerCardSlideBodyProps {
  item: BannerItem;
  /** 轮播项稳定 id，供图片重试/失败回退 */
  imageKey: string;
  themeColor: string;
  tone: HomeBannerTone;
  gradientIndex: number;
  imageFit: ReturnType<typeof normalizeHomeBannerImageFit>;
  imagePosition: string;
  showDots: boolean;
}

function BannerCardSlideBody({
  item,
  imageKey,
  themeColor,
  tone,
  gradientIndex,
  imageFit,
  imagePosition,
  showDots,
}: BannerCardSlideBodyProps) {
  const gradient = GRADIENTS[gradientIndex % GRADIENTS.length];
  const rawImg = (item.image || "").trim();
  const { resolvedSrc, usePlaceholder, onImageError } = useMemberResolvableMedia(imageKey, rawImg || undefined);
  const showPhoto = rawImg && !usePlaceholder;

  /** 有后台图：整卡铺满（object-fit/position 随后台），文案叠在左侧渐变蒙层上 */
  if (showPhoto) {
    return (
      <div className={cn("relative h-full w-full overflow-hidden", BANNER_RADIUS)}>
        <img
          src={resolvedSrc}
          alt=""
          className="absolute inset-0 h-full w-full select-none"
          style={{ objectFit: imageFit, objectPosition: imagePosition }}
          onError={onImageError}
          draggable={false}
        />
        {/* 左侧文案可读性：仅左半幅轻量压暗，避免整图被「蒙灰」 */}
        <div
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(0,0,0,0.42)_0%,rgba(0,0,0,0.14)_42%,transparent_68%)] sm:bg-[linear-gradient(to_right,rgba(0,0,0,0.34)_0%,rgba(0,0,0,0.1)_40%,transparent_65%)]"
          aria-hidden
        />
        <div className="relative z-10 flex h-full min-h-0 w-full min-w-0 items-stretch">
          <BannerContent
            title={item.title}
            subtitle={item.subtitle}
            actionText={item.actionText}
            onAction={item.onClick}
            themeColor={themeColor}
            tone={tone}
            paddedBottom={showDots}
          />
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative flex h-full w-full flex-row items-stretch overflow-hidden",
        BANNER_RADIUS,
        "bg-gradient-to-br",
        gradient,
      )}
    >
      <div className="pointer-events-none absolute inset-0 bg-black/15" aria-hidden />
      <div
        className="pointer-events-none absolute inset-0 opacity-90"
        style={{
          background: `radial-gradient(ellipse 120% 90% at 0% 50%, rgba(0,0,0,0.22), transparent 55%)`,
        }}
        aria-hidden
      />

      <BannerContent
        title={item.title}
        subtitle={item.subtitle}
        actionText={item.actionText}
        onAction={item.onClick}
        themeColor={themeColor}
        tone={tone}
        paddedBottom={showDots}
      />
      <BannerVisual
        image={undefined}
        imageKey={`${imageKey}-split-vis`}
        imageFit={imageFit}
        imagePosition={imagePosition}
        themeColor={themeColor}
        gradientIndex={gradientIndex}
      />
    </div>
  );
}

// --- 可复用轮播（items API） ---

export interface MemberBannerCarouselProps {
  items: BannerItem[];
  themeColor: string;
  className?: string;
  /** 视口全宽外溢（默认 false，与首页卡片内嵌一致） */
  fullBleed?: boolean;
  /** 自动轮播间隔（毫秒），默认 4500 */
  autoPlayIntervalMs?: number;
  /** 无 CMS 配置时的图片 fit（默认 cover） */
  imageFit?: ReturnType<typeof normalizeHomeBannerImageFit>;
  imagePosition?: string;
}

export function MemberBannerCarousel({
  items,
  themeColor,
  className,
  fullBleed = false,
  autoPlayIntervalMs = 4500,
  imageFit = "cover",
  imagePosition = "center",
}: MemberBannerCarouselProps) {
  const { t } = useLanguage();
  const [current, setCurrent] = useState(0);

  const valid = useMemo(() => filterBannerItems(items || []), [items]);

  const count = valid.length;

  useEffect(() => {
    if (count <= 1) return;
    const ms = Math.max(1500, Math.floor(Number(autoPlayIntervalMs) || 4500));
    const id = setInterval(() => setCurrent((c) => (c + 1) % count), ms);
    return () => clearInterval(id);
  }, [count, autoPlayIntervalMs]);

  useEffect(() => {
    if (current >= count) setCurrent(0);
  }, [count, current]);

  if (!count) return null;

  const showDots = count > 1;

  return (
    <BannerContainer
      className={className}
      fullBleed={fullBleed}
      showDots={showDots}
      dotCount={count}
      current={current}
      setCurrent={setCurrent}
      ariaLabel={t("首页轮播", "Homepage carousel")}
      labelSlide={(i) => t(`第 ${i + 1} 张`, `Slide ${i + 1}`)}
      labelList={t("轮播页码", "Carousel slides")}
    >
      {valid.map((item, idx) => (
        <BannerSlide key={idx} active={idx === current}>
          <BannerCardSlideBody
            item={item}
            imageKey={`mbc-${idx}`}
            themeColor={themeColor}
            tone="dark"
            gradientIndex={idx}
            imageFit={imageFit}
            imagePosition={sanitizeHomeBannerObjectPosition(imagePosition)}
            showDots={showDots}
          />
        </BannerSlide>
      ))}
    </BannerContainer>
  );
}

// --- 门户适配：banners → 幻灯片模型 ---

type PortalSlide =
  | {
      kind: "full";
      banner: MemberHomeBannerItem;
      idx: number;
    }
  | {
      kind: "card";
      /** 门户 split 时有值；仅用 `items` 注入时为 null */
      banner: MemberHomeBannerItem | null;
      item: BannerItem;
      tone: HomeBannerTone;
      gradientIndex: number;
    };

function filterBannerItems(raw: BannerItem[]): BannerItem[] {
  return (raw || []).filter(
    (it) =>
      !!(it.title?.trim() || it.subtitle?.trim() || it.image?.trim() || (it.actionText?.trim() && it.onClick)),
  );
}

function mapBannersToSlides(
  banners: MemberHomeBannerItem[],
  t: (z: string, e: string) => string,
): PortalSlide[] {
  const valid = (banners || []).filter((b) => {
    const src = resolveBannerImageSrc(b);
    if (isFullImageLayout(b)) return !!src;
    return !!(b.title?.trim() || b.subtitle?.trim() || b.link?.trim() || src);
  });

  return valid.map((banner, idx) => {
    if (isFullImageLayout(banner)) {
      return { kind: "full" as const, banner, idx };
    }
    const link = String(banner.link || "").trim();
    const imgSrc = resolveBannerImageSrc(banner);
    const item: BannerItem = {
      title: banner.title?.trim() || "",
      subtitle: banner.subtitle?.trim() || undefined,
      image: imgSrc || undefined,
      actionText: link ? t("立即开始", "Start now") : undefined,
      onClick: link ? () => window.open(link, "_blank", "noopener,noreferrer") : undefined,
    };
    return {
      kind: "card" as const,
      banner: banner,
      item,
      tone: resolveBannerTone(banner),
      gradientIndex: idx,
    };
  });
}

// --- 导出入口：门户 ---

export interface MemberHomeBannerModuleProps {
  /** 门户配置的轮播（与后台一致） */
  banners?: MemberHomeBannerItem[];
  /**
   * 可选：通用 `BannerItem[]`；若过滤后非空则 **优先于 `banners`**，否则仍用门户配置
   */
  items?: BannerItem[];
  themeColor: string;
  className?: string;
  /** 自动切换间隔（秒，3–60），来自 `home_banners_carousel_interval_sec` */
  carouselIntervalSec?: number;
}

export function MemberHomeBannerModule({ banners, items, themeColor, className, carouselIntervalSec }: MemberHomeBannerModuleProps) {
  const { t } = useLanguage();
  const [current, setCurrent] = useState(0);

  const autoPlayMs = useMemo(() => {
    const s = Math.min(60, Math.max(3, Math.floor(Number(carouselIntervalSec ?? 5))));
    return s * 1000;
  }, [carouselIntervalSec]);

  const slides = useMemo((): PortalSlide[] => {
    const fromItems = filterBannerItems(items || []);
    if (fromItems.length > 0) {
      return fromItems.map((it, idx) => ({
        kind: "card" as const,
        banner: null,
        item: it,
        tone: "dark" as HomeBannerTone,
        gradientIndex: idx,
      }));
    }
    return mapBannersToSlides(banners || [], t);
  }, [banners, items, t]);

  const count = slides.length;

  useEffect(() => {
    if (count <= 1) return;
    const id = setInterval(() => setCurrent((c) => (c + 1) % count), autoPlayMs);
    return () => clearInterval(id);
  }, [count, autoPlayMs]);

  useEffect(() => {
    if (current >= count) setCurrent(0);
  }, [count, current]);

  if (!count) return null;

  const showDots = count > 1;

  return (
    <BannerContainer
      className={className}
      showDots={showDots}
      dotCount={count}
      current={current}
      setCurrent={setCurrent}
      ariaLabel={t("首页轮播", "Homepage carousel")}
      labelSlide={(i) => t(`第 ${i + 1} 张`, `Slide ${i + 1}`)}
      labelList={t("轮播页码", "Carousel slides")}
    >
      {slides.map((slide, idx) => {
        if (slide.kind === "full") {
          const b = slide.banner;
          const imgSrc = resolveBannerImageSrc(b);
          const gradient = GRADIENTS[slide.idx % GRADIENTS.length];
          const fit = normalizeHomeBannerImageFit(b.image_object_fit);
          const pos = sanitizeHomeBannerObjectPosition(b.image_object_position);
          const link = String(b.link || "").trim();
          const label =
            String(b.title || "").trim() ||
            String(b.subtitle || "").trim() ||
            "";
          return (
            <BannerSlide key={`full-${idx}`} active={idx === current}>
              <BannerFullBleedContent
                imgSrc={imgSrc}
                imageKey={`mhm-full-${slide.idx}`}
                gradientClass={gradient}
                fit={fit}
                pos={pos}
                link={link || undefined}
                label={label || undefined}
                showDots={showDots}
              />
            </BannerSlide>
          );
        }

        const b = slide.banner;
        const fit = b
          ? normalizeHomeBannerImageFit(b.image_object_fit)
          : "cover";
        const pos = b ? sanitizeHomeBannerObjectPosition(b.image_object_position) : "center";

        return (
          <BannerSlide key={`card-${idx}`} active={idx === current}>
            <BannerCardSlideBody
              item={slide.item}
              imageKey={`mhm-card-${idx}`}
              themeColor={themeColor}
              tone={slide.tone}
              gradientIndex={slide.gradientIndex}
              imageFit={fit}
              imagePosition={pos}
              showDots={showDots}
            />
          </BannerSlide>
        );
      })}
    </BannerContainer>
  );
}
