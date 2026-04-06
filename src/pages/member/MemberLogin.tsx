import {
  useState,
  useEffect,
  useLayoutEffect,
  useMemo,
  type CSSProperties,
} from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ChevronRight,
  Sun,
  Moon,
} from "lucide-react";
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
import { ROUTES } from "@/routes/constants";
import { markMemberPostLoginShellTransition } from "@/lib/memberPostLoginTransition";
import { useMemberLogin } from "@/hooks/useMemberLogin";
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
import { MemberLoginCarousel } from "@/components/member/MemberLoginCarousel";
import { MemberLoginFormPanel } from "@/components/member/MemberLoginFormPanel";
import { LoginIdleHeaderLogo } from "@/components/member/LoginIdleHeaderLogo";
import "@/styles/member-portal.css";

type LandingPanel = null | "login";

const loginThemeSurfaceBtn =
  "rounded-xl border border-[hsl(var(--pu-m-surface-border)/0.3)] bg-[hsl(var(--pu-m-surface)/0.55)] p-2.5 transition motion-reduce:transition-none hover:bg-[hsl(var(--pu-m-surface)/0.85)]";

export default function MemberLogin() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t, language } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const { isAuthenticated, member } = useMemberAuth();
  const { settings } = useMemberPortalSettings(member?.id);

  const [panel, setPanel] = useState<LandingPanel>(null);
  const [legalDoc, setLegalDoc] = useState<null | "terms" | "privacy">(null);

  const [previewSettings, setPreviewSettings] = useState<MemberPortalSettings | null>(null);
  const [defaultPortalSettings, setDefaultPortalSettings] = useState<MemberPortalSettings>(() => {
    if (typeof window === "undefined") return DEFAULT_SETTINGS;
    const boot = readMemberPortalSplashBootstrap(parseInviteFromWindowSearch(window.location.search));
    return boot ? { ...DEFAULT_SETTINGS, ...boot } : DEFAULT_SETTINGS;
  });
  const [settingsReady, setSettingsReady] = useState(false);

  const loginForm = useMemberLogin({
    onSignedIn: () => setPanel(null),
  });

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
    markMemberPostLoginShellTransition();
    navigate(
      member?.must_change_password ? ROUTES.MEMBER.FIRST_PASSWORD : ROUTES.MEMBER.DASHBOARD,
      { replace: true },
    );
  }, [isAuthenticated, member?.must_change_password, navigate]);

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
    const account = String(loginForm.phone || "").trim();
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
  }, [loginForm.phone, member?.id, defaultPortalSettings]);

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

  useEffect(() => {
    warmupApiHealth();
  }, []);

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

          <MemberLoginCarousel
            displaySettings={displaySettings}
            theme={theme}
            t={t}
            paused={false}
          />

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
      <MemberLoginFormPanel
        displaySettings={displaySettings}
        loginPremiumRootStyle={loginPremiumRootStyle}
        theme={theme}
        toggleTheme={toggleTheme}
        t={t}
        onBack={() => setPanel(null)}
        phone={loginForm.phone}
        setPhone={loginForm.setPhone}
        password={loginForm.password}
        setPassword={loginForm.setPassword}
        showPassword={loginForm.showPassword}
        setShowPassword={loginForm.setShowPassword}
        rememberMe={loginForm.rememberMe}
        setRememberMe={loginForm.setRememberMe}
        loading={loginForm.loading}
        onSubmit={loginForm.handleSubmit}
      />
    );
  }

  return null;
}
