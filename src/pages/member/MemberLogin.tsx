import {
  useState,
  useEffect,
  useLayoutEffect,
  useMemo,
  useCallback,
  useRef,
  type CSSProperties,
  type SyntheticEvent,
} from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Lock,
  ShieldCheck,
  Loader2,
  Star,
  Users,
  Gift,
  type LucideIcon,
  Zap,
  TrendingUp,
  Shield,
  Sparkles,
  ChevronRight,
  ArrowRight,
  Phone,
  KeyRound,
  Eye,
  EyeOff,
  Square,
  CheckSquare,
  Sun,
  Moon,
} from "lucide-react";
import { toast } from "sonner";
import { useMemberAuth } from "@/contexts/MemberAuthContext";
import { useMemberPortalSettings } from "@/hooks/useMemberPortalSettings";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTheme } from "@/contexts/ThemeContext";
import { MemberLegalDrawer } from "@/components/member/MemberLegalDrawer";
import {
  DEFAULT_SETTINGS,
  getDefaultMemberPortalSettings,
  getMemberPortalSettingsByAccount,
  getMemberPortalSettingsByInviteCode,
  type MemberPortalSettings,
} from "@/services/members/memberPortalSettingsService";
import { warmupApiHealth } from "@/services/system/apiWarmup";
import { memberPortalNetworkToastMessage } from "@/lib/memberPortalUx";
import { ROUTES } from "@/routes/constants";
import { resolveMemberMediaUrl } from "@/lib/memberMediaUrl";
import { useMemberResolvableMedia } from "@/hooks/useMemberResolvableMedia";
import { cn } from "@/lib/utils";
import { MemberPageAmbientOrbs } from "@/components/member/MemberPageAmbientOrbs";
import SplashScreen from "@/components/member/SplashScreen";
import { memberPortalLegalBody } from "@/lib/memberPortalLegalBody";
import { memberPortalGoldCssVarsFromHex } from "@/utils/memberPortalGoldCssVars";
import { MEMBER_LOGIN_BADGE_SLOT_COUNT, parseMemberLoginBadge } from "@/lib/memberLoginBadge";
import {
  parseInviteFromWindowSearch,
  readMemberPortalSplashBootstrap,
  persistMemberPortalSplashCache,
} from "@/lib/memberPortalSplashCache";
import {
  getPlatformBrandLogoUrl,
  mergePlatformBrandLogo,
  seedPlatformBrandLogoFromSettings,
} from "@/lib/memberPortalPlatformBrandLogo";
import { preloadMemberPortalLogo } from "@/lib/memberPortalLogoPreload";
import { applyMemberPortalFaviconFromLogoRaw } from "@/lib/memberPortalFavicon";
import "@/styles/member-portal.css";

const SAVED_ACCOUNT_KEY = "member_saved_account";

function loadSavedAccount(): string | null {
  try {
    return localStorage.getItem(SAVED_ACCOUNT_KEY) || null;
  } catch {
    return null;
  }
}

function saveAccount(phone: string) {
  try {
    localStorage.setItem(SAVED_ACCOUNT_KEY, phone);
  } catch {
    /* storage may be unavailable */
  }
}

function clearSavedAccount() {
  try {
    localStorage.removeItem(SAVED_ACCOUNT_KEY);
    localStorage.removeItem("member_saved_credentials");
  } catch {
    /* storage may be unavailable */
  }
}

/** 有 logo_url 时仅用金渐变块 + 淡入图，无图时才用闪电，避免与公司 Logo 切换闪烁 */
function LoginIdleHeaderLogo({
  logoUrl,
  size = "sm",
}: {
  logoUrl: string | null | undefined;
  size?: "sm" | "md";
}) {
  const raw = String(logoUrl ?? "").trim();
  const { resolvedSrc, usePlaceholder, onImageError } = useMemberResolvableMedia("login-idle-header-logo", raw || undefined);
  const [imgShown, setImgShown] = useState(false);
  const hasBrandLogoUrl = Boolean(raw);
  const imageFailed = Boolean(resolvedSrc && usePlaceholder);
  const showImage = Boolean(resolvedSrc) && !imageFailed;
  const box = size === "md" ? "h-11 w-11" : "h-9 w-9";
  const imgCls = size === "md" ? "h-11 w-11" : "h-9 w-9";
  const zapCls = size === "md" ? "h-5 w-5" : "h-[18px] w-[18px]";

  useEffect(() => {
    setImgShown(false);
    if (!raw || !resolvedSrc || imageFailed) return;
    const pre = new Image();
    pre.onload = () => setImgShown(true);
    pre.onerror = () => setImgShown(true);
    pre.src = resolvedSrc;
  }, [raw, resolvedSrc, imageFailed]);

  if (hasBrandLogoUrl) {
    return (
      <div
        className={cn("relative flex shrink-0 overflow-hidden rounded-xl border border-[hsl(var(--pu-m-surface-border)/0.28)] shadow-md", box)}
        style={{
          background: `linear-gradient(135deg, hsl(var(--pu-gold)), hsl(var(--pu-gold-soft)))`,
          boxShadow: "0 4px 16px -4px hsl(var(--pu-gold) / 0.4)",
        }}
      >
        {showImage ? (
          <img
            src={resolvedSrc}
            alt=""
            className={cn(
              "box-border object-contain object-center p-0.5 transition-opacity duration-200 motion-reduce:transition-none",
              imgCls,
            )}
            style={{ opacity: imgShown ? 1 : 0 }}
            loading="eager"
            fetchPriority="high"
            onLoad={() => setImgShown(true)}
            onError={onImageError}
          />
        ) : null}
      </div>
    );
  }
  return (
    <div
      className={cn("flex items-center justify-center rounded-xl", box)}
      style={{
        background: `linear-gradient(135deg, hsl(var(--pu-gold)), hsl(var(--pu-gold-soft)))`,
        boxShadow: "0 4px 16px -4px hsl(var(--pu-gold) / 0.4)",
      }}
    >
      <Zap
        className={cn(
          size === "md" ? "text-[hsl(var(--pu-m-bg-1))]" : "text-[hsl(var(--pu-primary-foreground))]",
          zapCls,
        )}
        strokeWidth={2.2}
        aria-hidden
      />
    </div>
  );
}

type LandingPanel = null | "login";

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

/** 自定义轮播图 404 / 跨域失败时回退（避免 handleImgError 把 img 隐藏成「纯黑块」） */
const LOGIN_CAROUSEL_IMAGE_FALLBACK =
  "linear-gradient(155deg, hsl(219 40% 12%) 0%, hsl(216 50% 8%) 55%, hsl(219 35% 16%) 100%)";

/** premium-ui-boost LoginPage 输入框底纹 */
const puInputShell: React.CSSProperties = {
  background: "hsl(var(--pu-m-surface) / 0.45)",
  border: "1px solid hsl(var(--pu-m-surface-border) / 0.25)",
  color: "hsl(var(--pu-m-text))",
};

const loginThemeSurfaceBtn =
  "rounded-xl border border-[hsl(var(--pu-m-surface-border)/0.3)] bg-[hsl(var(--pu-m-surface)/0.55)] p-2.5 transition motion-reduce:transition-none hover:bg-[hsl(var(--pu-m-surface)/0.85)]";

export default function MemberLogin() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t, language } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const { signIn, isAuthenticated, member } = useMemberAuth();
  const { settings } = useMemberPortalSettings(member?.id);

  const [panel, setPanel] = useState<LandingPanel>(null);
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [legalDoc, setLegalDoc] = useState<null | "terms" | "privacy">(null);

  const [previewSettings, setPreviewSettings] = useState<MemberPortalSettings | null>(null);
  const [defaultPortalSettings, setDefaultPortalSettings] = useState<MemberPortalSettings>(() => {
    if (typeof window === "undefined") return DEFAULT_SETTINGS;
    const boot = readMemberPortalSplashBootstrap(parseInviteFromWindowSearch(window.location.search));
    return boot ? { ...DEFAULT_SETTINGS, ...boot } : DEFAULT_SETTINGS;
  });
  const [settingsReady, setSettingsReady] = useState(false);

  const [bannerIdx, setBannerIdx] = useState(0);
  /** 轮播图加载最终失败时改用渐变层，不用全局 handleImgError（会 display:none 留下空窗） */
  const [failedBannerIds, setFailedBannerIds] = useState<Record<string, true>>({});

  const brandName = (displaySettings: MemberPortalSettings) =>
    String(displaySettings.company_name || "").trim() || "FastGC";

  useLayoutEffect(() => {
    document.documentElement.classList.add("member-html");
    return () => {
      document.documentElement.classList.remove("member-html");
    };
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    navigate(
      member?.must_change_password ? ROUTES.MEMBER.FIRST_PASSWORD : ROUTES.MEMBER.DASHBOARD,
      { replace: true },
    );
  }, [isAuthenticated, member?.must_change_password, navigate]);

  useEffect(() => {
    const savedPhone = loadSavedAccount();
    if (savedPhone) {
      setPhone(savedPhone);
      setRememberMe(true);
    }
  }, []);

  const inviteOrRefCode = useMemo(() => {
    const q = searchParams;
    const c =
      q.get("ref") ||
      q.get("invite") ||
      q.get("code") ||
      q.get("invite_code") ||
      q.get("referral") ||
      "";
    return String(c).trim();
  }, [searchParams]);

  useLayoutEffect(() => {
    const boot = readMemberPortalSplashBootstrap(inviteOrRefCode);
    if (boot?.logo_url) void preloadMemberPortalLogo(boot.logo_url);
  }, [inviteOrRefCode]);

  useEffect(() => {
    if (member?.id) {
      setSettingsReady(true);
      return;
    }
    const bootstrap = readMemberPortalSplashBootstrap(inviteOrRefCode);
    setDefaultPortalSettings({ ...DEFAULT_SETTINGS, ...(bootstrap || {}) });
    setPreviewSettings(null);
    let cancelled = false;
    (async () => {
      try {
        let next = DEFAULT_SETTINGS;
        const defaultPayload = await getDefaultMemberPortalSettings();
        const platformLogo = String(defaultPayload?.settings?.logo_url ?? "").trim() || null;
        seedPlatformBrandLogoFromSettings(platformLogo);
        if (inviteOrRefCode) {
          const byInvite = await getMemberPortalSettingsByInviteCode(inviteOrRefCode);
          if (byInvite?.settings) {
            next = mergePlatformBrandLogo(byInvite.settings, platformLogo);
          } else {
            next = mergePlatformBrandLogo(defaultPayload?.settings || DEFAULT_SETTINGS, platformLogo);
          }
        } else {
          next = defaultPayload?.settings || DEFAULT_SETTINGS;
        }
        if (cancelled) return;
        setDefaultPortalSettings(next);
        setPreviewSettings(next);
        persistMemberPortalSplashCache(inviteOrRefCode, next);
        await preloadMemberPortalLogo(next.logo_url);
      } catch {
        if (!cancelled) setPreviewSettings((prev) => prev || DEFAULT_SETTINGS);
      } finally {
        if (!cancelled) setSettingsReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [member?.id, inviteOrRefCode]);

  useEffect(() => {
    if (member?.id) return;
    const account = String(phone || "").trim();
    if (!account) {
      setPreviewSettings(defaultPortalSettings);
      return;
    }
    const timer = window.setTimeout(async () => {
      try {
        const data = await getMemberPortalSettingsByAccount(account);
        const raw = data?.settings || defaultPortalSettings;
        const pl = await getPlatformBrandLogoUrl();
        setPreviewSettings(mergePlatformBrandLogo(raw, pl));
      } catch {
        setPreviewSettings(defaultPortalSettings);
      }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [phone, member?.id, defaultPortalSettings]);

  const displaySettings = member?.id ? settings : (previewSettings ?? defaultPortalSettings);

  useEffect(() => {
    applyMemberPortalFaviconFromLogoRaw(displaySettings.logo_url);
  }, [displaySettings.logo_url]);

  const themeColor = useMemo(() => {
    const c = String(displaySettings.theme_primary_color || "").trim();
    return /^#[0-9A-Fa-f]{6}$/i.test(c) ? c : "#4d8cff";
  }, [displaySettings.theme_primary_color]);

  const loginPremiumRootStyle = useMemo(
    () =>
      ({
        "--m-theme": themeColor,
        ...memberPortalGoldCssVarsFromHex(themeColor),
      }) as CSSProperties,
    [themeColor],
  );

  const carouselIntervalMs = useMemo(() => {
    const s = Math.min(60, Math.max(3, Math.floor(Number(displaySettings.login_carousel_interval_sec) || 5)));
    return s * 1000;
  }, [displaySettings.login_carousel_interval_sec]);

  useEffect(() => {
    warmupApiHealth();
  }, []);

  const slides = useMemo((): LoginHeroSlide[] => {
    const raw = displaySettings.login_carousel_slides || [];
    const custom: LoginHeroSlide[] = raw
      .map((s, i) => {
        const image_url = (s.image_url || "").trim();
        const title = (s.title_en || s.title_zh).trim();
        const body = (s.body_en || s.body_zh).trim();
        if (!image_url && !title && !body) return null;
        return { kind: "custom" as const, id: `c-${i}`, image_url, title, body };
      })
      .filter((x): x is NonNullable<typeof x> => x != null);
    if (custom.length > 0) return custom;

    const builtin: LoginHeroSlide[] = [
      {
        kind: "builtin",
        id: "trust",
        icon: ShieldCheck,
        bg: "linear-gradient(155deg, hsl(219 40% 12%) 0%, hsl(216 50% 8%) 55%, hsl(219 35% 14%) 100%)",
        glow: "radial-gradient(ellipse 80% 60% at 70% 20%, hsl(var(--pu-gold) / 0.12) 0%, transparent 55%)",
        title: t("VIP 信赖之选", "Trusted by VIP members"),
        body: t("安全、快速、可靠的会员访问体验。", "Secure, fast, and reliable access."),
      },
      {
        kind: "builtin",
        id: "earn",
        icon: Star,
        bg: "linear-gradient(165deg, hsl(219 38% 11%) 0%, hsl(216 50% 7%) 100%)",
        glow: "radial-gradient(circle at 20% 80%, hsl(var(--pu-gold) / 0.1) 0%, transparent 50%)",
        title: t("转·赚·兑", "Spin. Earn. Redeem."),
        body: t("把活跃变成积分与礼遇。", "Turn your activity into rewards."),
      },
      {
        kind: "builtin",
        id: "mall",
        icon: Gift,
        bg: "linear-gradient(168deg, hsl(218 35% 10%) 0%, hsl(219 40% 13%) 100%)",
        glow: "radial-gradient(ellipse 70% 50% at 50% 0%, hsl(var(--pu-gold) / 0.08) 0%, transparent 60%)",
        title: t("解锁尊享礼遇", "Unlock premium rewards"),
        body: t("积分兑换精选礼品与专属权益。", "Redeem points for exclusive gifts."),
      },
      {
        kind: "builtin",
        id: "invite",
        icon: Users,
        bg: "linear-gradient(155deg, hsl(216 50% 7%) 0%, hsl(219 36% 12%) 100%)",
        glow: "radial-gradient(circle at 85% 60%, hsl(252 100% 68% / 0.08) 0%, transparent 45%)",
        title: t("邀请好友，共享收益", "Invite friends and earn more"),
        body: t("一起成长，点亮更多奖励。", "Grow your rewards together."),
      },
    ];
    return builtin;
  }, [displaySettings.login_carousel_slides, t]);

  const bannerLayers = useMemo((): BannerLayer[] => {
    return slides.map((s) => {
      if (s.kind === "custom") {
        const src = (s.image_url || "").trim() ? resolveMemberMediaUrl(s.image_url) : "";
        if (src) return { kind: "image", id: s.id, src, alt: s.title || s.body || "banner" };
        return {
          kind: "gradient",
          id: s.id,
          background: LOGIN_CAROUSEL_IMAGE_FALLBACK,
          glow:
            "radial-gradient(ellipse 80% 55% at 70% 25%, hsl(var(--pu-gold) / 0.14) 0%, transparent 55%)",
        };
      }
      return { kind: "gradient", id: s.id, background: s.bg, glow: s.glow };
    });
  }, [slides]);

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
  }, [bannerLayers.length, panel]);

  useEffect(() => {
    if (panel !== null) return;
    if (bannerLayers.length <= 1) return;
    const id = window.setInterval(() => {
      setBannerIdx((i) => (i + 1) % bannerLayers.length);
    }, carouselIntervalMs);
    return () => window.clearInterval(id);
  }, [panel, bannerLayers.length, carouselIntervalMs]);

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

  const handleSubmit = useCallback(
    async (values: { phone: string; password: string }) => {
      if (!values.phone?.trim()) {
        toast.error(t("请输入手机号或会员编号", "Please enter your phone or member code"));
        return;
      }
      if (!values.password) {
        toast.error(t("请输入密码", "Please enter your password"));
        return;
      }
      setLoading(true);
      try {
        const result = await signIn(values.phone.trim(), values.password);
        if (result.success) {
          if (rememberMe) saveAccount(values.phone.trim());
          else clearSavedAccount();
          toast.success(result.message || t("登录成功", "Signed in successfully"));
          setPanel(null);
          navigate(
            result.mustChangePassword ? ROUTES.MEMBER.FIRST_PASSWORD : ROUTES.MEMBER.DASHBOARD,
            { replace: true },
          );
          return;
        }
        const errText = (() => {
          switch (result.code) {
            case "WRONG_PASSWORD":
              return t("密码错误", "Wrong password");
            case "MEMBER_NOT_FOUND":
              return t("未找到该会员账号", "Member not found");
            case "NO_PASSWORD_SET":
              return t("尚未设置登录密码，请联系管理员", "No password set. Please contact your admin.");
            case "VALIDATION_ERROR":
              return t("请填写手机号和密码", "Enter phone and password.");
            default:
              return (
                result.message ||
                t("登录失败，请检查账号或密码", "Sign-in failed. Check your credentials.")
              );
          }
        })();
        toast.error(errText);
      } catch {
        toast.error(memberPortalNetworkToastMessage(t));
      } finally {
        setLoading(false);
      }
    },
    [rememberMe, signIn, navigate, t],
  );

  /** 须在任意 early return 之前调用，避免 React #310（hooks 数量不一致） */
  const loginBadgeSlots = useMemo(() => {
    const lines = (displaySettings.login_badges || [])
      .map((s) => String(s).trim())
      .filter(Boolean)
      .slice(0, MEMBER_LOGIN_BADGE_SLOT_COUNT);
    return Array.from({ length: MEMBER_LOGIN_BADGE_SLOT_COUNT }, (_, i) => parseMemberLoginBadge(lines[i] ?? ""));
  }, [displaySettings.login_badges]);

  if (!settingsReady) {
    return (
      <div
        className="member-login-premium-root relative min-h-dvh overflow-hidden"
        style={{
          ...loginPremiumRootStyle,
          background: "hsl(var(--pu-m-bg-1))",
          color: "hsl(var(--pu-m-text))",
        }}
      >
        <SplashScreen
          holdUntilUnmount
          brandName={brandName(displaySettings)}
          accentColor={themeColor}
          logoUrl={displaySettings.logo_url}
          pendingBrand={!String(displaySettings.logo_url ?? "").trim()}
          duration={2200}
        />
      </div>
    );
  }

  const bn = brandName(displaySettings);
  const welcomeTitle = String(displaySettings.welcome_title || "").trim();
  const welcomeSub = String(displaySettings.welcome_subtitle || "").trim();

  /* ── premium-ui-boost：落地页 idle ── */
  if (panel === null) {
    return (
      <div
        className="member-login-premium-root member-login-viewport flex min-h-dvh w-full flex-col overflow-x-hidden"
        style={{
          ...loginPremiumRootStyle,
          background: "hsl(var(--pu-m-bg-1))",
          color: "hsl(var(--pu-m-text))",
        }}
      >
        <div className="relative flex flex-1 flex-col">
          <MemberPageAmbientOrbs />
          <div className="relative z-[1] mx-auto flex min-h-0 w-full max-w-[min(100%,36rem)] flex-1 flex-col px-1 sm:max-w-[480px] sm:px-0">
          <div className="flex items-center justify-between px-5 pb-5 pt-[max(20px,env(safe-area-inset-top))]">
            <div className="flex items-center gap-2.5">
              <LoginIdleHeaderLogo logoUrl={displaySettings.logo_url} />
              <span className="text-base font-extrabold tracking-tight">{bn}</span>
            </div>
            <button
              type="button"
              className={loginThemeSurfaceBtn}
              onClick={toggleTheme}
              aria-label={t("主题", "Theme")}
            >
              {theme === "dark" ? (
                <Sun className="h-5 w-5 text-pu-gold-soft" aria-hidden />
              ) : (
                <Moon className="h-5 w-5 text-[hsl(var(--pu-m-text-dim))]" aria-hidden />
              )}
            </button>
          </div>

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
                      className="member-login-banner-slide absolute inset-0 transition-all duration-700 ease-in-out motion-reduce:transition-none"
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
                      className="absolute inset-0 h-full w-full object-cover transition-all duration-700 ease-in-out"
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
                    className="member-login-banner-slide absolute inset-0 transition-all duration-700 ease-in-out motion-reduce:transition-none"
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
                      style={{
                        background: "linear-gradient(to top, hsl(216 50% 5% / 0.92) 0%, hsl(216 50% 8% / 0.45) 45%, transparent 100%)",
                      }}
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
                        "member-login-carousel-dot shrink-0 rounded-full transition-all duration-300 ease-out motion-reduce:transition-none",
                        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--pu-gold)/0.6)]",
                        i === bannerIdx
                          ? "h-2 w-[22px] bg-[#1a2d4a] shadow-sm ring-1 ring-black/10 dark:bg-[#1e3a5c]"
                          : "h-2 w-2 bg-white/35 hover:bg-white/50 dark:bg-white/30",
                      )}
                      aria-label={`${t("幻灯", "Slide")} ${i + 1}`}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          <div className="mb-8 px-6">
            <h1 className="mb-3 text-[28px] font-extrabold leading-[1.2] tracking-tight">
              {welcomeTitle ? (
                welcomeTitle
              ) : (
                <>
                  {t("您的礼遇与积分", "Your rewards")}
                  <br />
                  <span className="text-[hsl(var(--pu-gold))]">{t("轻松掌控", "simplified.")}</span>
                </>
              )}
            </h1>
            <p className="text-[13px] leading-relaxed text-[hsl(var(--pu-m-text-dim))]">
              {welcomeSub ||
                t(
                  "管理积分、兑换礼遇，邀请好友赚取更多奖励。",
                  "Manage points, redeem gifts, and earn more by inviting friends.",
                )}
            </p>
          </div>

          <div className="mb-6 grid grid-cols-3 gap-2.5 px-5 [grid-auto-rows:1fr]">
            {loginBadgeSlots.map((slot, idx) => {
              const { icon, label } = slot;
              const isEmpty = !icon && !label;
              return (
                <div
                  key={idx}
                  className={cn(
                    "flex h-full min-h-[5.75rem] flex-col items-stretch rounded-2xl p-3 text-center",
                    isEmpty
                      ? "border border-dashed border-[hsl(var(--pu-m-surface-border)/0.38)] bg-[hsl(var(--pu-m-surface)/0.12)]"
                      : "border border-[hsl(var(--pu-m-surface-border)/0.2)] bg-[hsl(var(--pu-m-surface)/0.35)]",
                  )}
                >
                  <div className="flex min-h-[2.25rem] flex-shrink-0 items-center justify-center text-[1.35rem] leading-none">
                    {icon ? (
                      <span className="select-none" aria-hidden>
                        {icon}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex min-h-0 flex-1 items-start justify-center text-[10px] font-medium leading-snug text-[hsl(var(--pu-m-text-dim))] break-words">
                    {label}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex-1" />

          <div className="space-y-3 px-5 pb-[max(24px,env(safe-area-inset-bottom))]">
            <button
              type="button"
              onClick={() => setPanel("login")}
              className="flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-sm font-bold transition-all motion-reduce:transition-none motion-reduce:active:scale-100 active:scale-[0.97]"
              style={{
                background: "linear-gradient(135deg, hsl(var(--pu-gold)), hsl(var(--pu-gold-soft)))",
                color: "white",
                boxShadow: "0 6px 28px -6px hsl(var(--pu-gold) / 0.45)",
              }}
            >
              {t("登录", "Sign In")}
              <ChevronRight className="h-4 w-4" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => navigate(ROUTES.MEMBER.REGISTER)}
              className="w-full rounded-2xl py-4 text-sm font-bold transition-all motion-reduce:transition-none motion-reduce:active:scale-100 active:scale-[0.97]"
              style={{
                background: "hsl(var(--pu-m-surface) / 0.5)",
                border: "1px solid hsl(var(--pu-m-surface-border) / 0.3)",
              }}
            >
              {t("注册账号", "Create account")}
            </button>
            <p className="pt-1 text-center text-[10px] text-[hsl(var(--pu-m-text-dim)/0.4)]">
              {t("登录即表示同意", "By signing in you agree to our ")}{" "}
              <button type="button" className="font-semibold text-[hsl(var(--pu-gold-soft))]" onClick={() => setLegalDoc("terms")}>
                {t("条款", "Terms")}
              </button>
              {t("与", " & ")}{" "}
              <button type="button" className="font-semibold text-[hsl(var(--pu-gold-soft))]" onClick={() => setLegalDoc("privacy")}>
                {t("隐私", "Privacy")}
              </button>
            </p>
          </div>
          </div>
        </div>

        <MemberLegalDrawer
          open={legalDoc === "terms"}
          onOpenChange={(o) => {
            if (!o) setLegalDoc(null);
          }}
          title={t("服务条款", "Terms of Service")}
        >
          {memberPortalLegalBody(displaySettings, language, "terms")}
        </MemberLegalDrawer>
        <MemberLegalDrawer
          open={legalDoc === "privacy"}
          onOpenChange={(o) => {
            if (!o) setLegalDoc(null);
          }}
          title={t("隐私说明", "Privacy Policy")}
        >
          {memberPortalLegalBody(displaySettings, language, "privacy")}
        </MemberLegalDrawer>
      </div>
    );
  }

  /* ── premium-ui-boost：登录全屏 ── */
  if (panel === "login") {
    return (
      <div
        className="member-login-premium-root member-login-viewport relative flex min-h-dvh w-full flex-col overflow-x-hidden"
        style={{
          ...loginPremiumRootStyle,
          background: "hsl(var(--pu-m-bg-1))",
          color: "hsl(var(--pu-m-text))",
        }}
      >
        <div
          className="h-1 w-full"
          style={{
            background: "linear-gradient(90deg, hsl(var(--pu-gold)), hsl(var(--pu-emerald)), hsl(var(--pu-gold-soft)))",
          }}
        />
        <button
          type="button"
          className={`absolute right-4 z-30 ${loginThemeSurfaceBtn}`}
          style={{ top: "max(12px, env(safe-area-inset-top))" }}
          onClick={toggleTheme}
          aria-label={t("主题", "Theme")}
        >
          {theme === "dark" ? (
            <Sun className="h-5 w-5 text-pu-gold-soft" aria-hidden />
          ) : (
            <Moon className="h-5 w-5 text-[hsl(var(--pu-m-text-dim))]" aria-hidden />
          )}
        </button>
        <div className="relative flex min-h-0 flex-1 flex-col px-6">
          <MemberPageAmbientOrbs />
          <div className="relative z-[1] flex min-h-0 flex-1 flex-col">
          <button
            type="button"
            onClick={() => setPanel(null)}
            className="mb-4 mt-5 self-start text-xs font-bold text-[hsl(var(--pu-m-text-dim))] transition motion-reduce:transition-none hover:text-[hsl(var(--pu-m-text))]"
          >
            ← {t("返回", "Back")}
          </button>

          <div className="mb-6 flex flex-col items-center">
            <div
              className="mb-3"
              style={{
                boxShadow: "0 6px 20px -6px hsl(var(--pu-gold) / 0.5)",
              }}
            >
              <LoginIdleHeaderLogo logoUrl={displaySettings.logo_url} size="md" />
            </div>
            <h1 className="text-xl font-extrabold tracking-tight">{t("安全登录", "Secure sign in")}</h1>
            <p className="mt-1 text-[11px] text-[hsl(var(--pu-m-text-dim))]">
              {t("访问您的会员账户与专属权益", "Access your member account and benefits")}
            </p>
          </div>

          <div
            className="mb-6 rounded-2xl p-5"
            style={{
              background: "hsl(var(--pu-m-surface) / 0.3)",
              border: "1px solid hsl(var(--pu-m-surface-border) / 0.2)",
            }}
          >
            <form
              className="space-y-5"
              onSubmit={(e) => {
                e.preventDefault();
                void handleSubmit({ phone, password });
              }}
            >
              <div>
                <label
                  htmlFor="member-login-account"
                  className="mb-2 block text-[11px] font-bold text-[hsl(var(--pu-m-text-dim))]"
                >
                  {t("手机 / 会员编号", "Phone / member code")}
                </label>
                <div className="relative">
                  <Phone className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--pu-m-text-dim)/0.35)]" aria-hidden />
                  <input
                    id="member-login-account"
                    name="username"
                    type="tel"
                    inputMode="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder={t("请输入手机号或编号", "Enter phone or code")}
                    autoComplete="username"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    className="w-full rounded-xl py-3.5 pl-10 pr-4 text-sm font-medium outline-none transition-all motion-reduce:transition-none focus:ring-2 focus:ring-[hsl(var(--pu-gold)/0.25)]"
                    style={puInputShell}
                  />
                </div>
              </div>
              <div>
                <label
                  htmlFor="member-login-password"
                  className="mb-2 block text-[11px] font-bold text-[hsl(var(--pu-m-text-dim))]"
                >
                  {t("密码", "Password")}
                </label>
                <div className="relative">
                  <KeyRound className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--pu-m-text-dim)/0.35)]" aria-hidden />
                  <input
                    id="member-login-password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={t("请输入密码", "Enter password")}
                    autoComplete="current-password"
                    className="w-full rounded-xl py-3.5 pl-10 pr-12 text-sm font-medium outline-none transition-all motion-reduce:transition-none focus:ring-2 focus:ring-[hsl(var(--pu-gold)/0.25)]"
                    style={puInputShell}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-[hsl(var(--pu-m-text-dim)/0.4)] motion-reduce:transition-none"
                    aria-label={showPassword ? t("隐藏密码", "Hide password") : t("显示密码", "Show password")}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setRememberMe(!rememberMe)}
                  className="flex items-center gap-2"
                  aria-pressed={rememberMe}
                >
                  {rememberMe ? (
                    <CheckSquare className="h-4 w-4" style={{ color: "hsl(var(--pu-emerald-soft))" }} aria-hidden />
                  ) : (
                    <Square className="h-4 w-4 text-[hsl(var(--pu-m-text-dim)/0.3)]" aria-hidden />
                  )}
                  <span className="text-[11px] text-[hsl(var(--pu-m-text-dim))]">{t("记住账号", "Remember account")}</span>
                </button>
                <button
                  type="button"
                  className="text-[11px] font-bold transition motion-reduce:transition-none"
                  style={{ color: "hsl(var(--pu-gold-soft))" }}
                  onClick={() =>
                    toast.info(t("忘记密码请联系客服或邀请人。", "Forgot? Contact support or your inviter."))
                  }
                >
                  {t("忘记密码？", "Forgot password?")}
                </button>
              </div>
              <button
                type="submit"
                disabled={loading}
                aria-busy={loading}
                className="flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-sm font-bold transition-all motion-reduce:transition-none motion-reduce:active:scale-100 active:scale-[0.97] disabled:opacity-60"
                style={{
                  background: "linear-gradient(135deg, hsl(var(--pu-gold)), hsl(var(--pu-gold-soft)))",
                  color: "hsl(var(--pu-primary-foreground))",
                  boxShadow: "0 8px 28px -8px hsl(var(--pu-gold) / 0.5)",
                }}
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : null}
                {t("登录", "Sign In")}
                {!loading ? <ArrowRight className="h-4 w-4" aria-hidden /> : null}
              </button>
            </form>
          </div>

          <p className="text-center text-xs text-[hsl(var(--pu-m-text-dim))]">
            {t("还没有账号？", "No account?")}{" "}
            <button
              type="button"
              onClick={() => navigate(ROUTES.MEMBER.REGISTER)}
              className="ml-1 font-bold underline underline-offset-2 transition motion-reduce:transition-none"
              style={{ color: "hsl(var(--pu-emerald-soft))" }}
            >
              {t("注册账号", "Create account")}
            </button>
          </p>

          <div className="flex-1" />
          <div className="flex items-center justify-center gap-4 pb-[max(24px,env(safe-area-inset-bottom))] pt-4">
            {[
              { icon: Shield, label: "SSL" },
              { icon: Lock, label: t("加密", "Encrypted") },
              { icon: Sparkles, label: t("验证", "Verified") },
            ].map((b) => (
              <div key={b.label} className="flex items-center gap-1">
                <b.icon className="h-3 w-3 text-[hsl(var(--pu-m-text-dim)/0.3)]" />
                <span className="text-[10px] font-medium text-[hsl(var(--pu-m-text-dim)/0.3)]">{b.label}</span>
              </div>
            ))}
          </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
