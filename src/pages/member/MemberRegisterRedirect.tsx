import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { Navigate, useSearchParams, Link } from "react-router-dom";
import {
  Gift,
  Loader2,
  ArrowRight,
  Phone,
  KeyRound,
  Eye,
  EyeOff,
  UserPlus,
  Sparkles,
  Shield,
  Lock,
} from "lucide-react";
import { memberRegisterInit, validateInviteAndSubmit } from "@/services/memberPortal/memberActivityService";
import { ApiError } from "@/services/auth/authApiService";
import { seedPlatformBrandLogoFromSettings } from "@/lib/memberPortalPlatformBrandLogo";
import {
  getInviteCodeFromSearchParams,
  readMemberPortalSplashBootstrap,
} from "@/lib/memberPortalSplashCache";
import { notify } from "@/lib/notifyHub";
import {
  DEFAULT_SETTINGS,
  getDefaultMemberPortalSettings,
  type MemberPortalSettings,
} from "@/services/members/memberPortalSettingsService";
import { ROUTES } from "@/routes/constants";
import { MemberLoginBadgeGrid } from "@/components/member/MemberLoginBadgeGrid";
import { MemberLoginCarousel } from "@/components/member/MemberLoginCarousel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { MemberLegalDrawer } from "@/components/member/MemberLegalDrawer";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTheme } from "@/contexts/ThemeContext";
import { memberPortalLegalBody } from "@/lib/memberPortalLegalBody";
import { MemberRegisterShell } from "@/components/member/MemberRegisterShell";
import { MemberRegisterTrustFooter } from "@/components/member/MemberRegisterTrustFooter";
import { cn } from "@/lib/utils";

/**
 * /member/register?ref= / ?invite= / ?code= / … → 跳转 /invite/CODE（与 MemberLogin 查询键一致）
 * 无参数：与 InviteLanding 同构的注册页 — 先填手机与密码，邀请码在最后一步填写并完成校验
 */
export default function MemberRegisterRedirect() {
  const { t, language } = useLanguage();
  const { theme } = useTheme();
  const [sp] = useSearchParams();
  /** useSearchParams 与 location 双读：避免部分 WebView/Safari 首帧 query 未同步导致未重定向 */
  const ref = useMemo(() => {
    const fromRouter = getInviteCodeFromSearchParams(sp);
    if (fromRouter) return fromRouter;
    if (typeof window !== "undefined") {
      return getInviteCodeFromSearchParams(new URLSearchParams(window.location.search));
    }
    return "";
  }, [sp]);

  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [portalSettings, setPortalSettings] = useState<MemberPortalSettings>(() => {
    const cached = readMemberPortalSplashBootstrap("");
    const base = cached ? { ...DEFAULT_SETTINGS, ...cached } : DEFAULT_SETTINGS;
    /** 徽章仅以后端 default 接口为准，避免 splash 缓存与后台不一致导致闪跳 */
    return { ...base, login_badges: [] };
  });
  /** 避免“先渲染 -> 后端设置回来再跳变”导致顶部轮播与信任 6 宫格闪现 */
  const [portalSettingsReady, setPortalSettingsReady] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(() => {
    const cached = readMemberPortalSplashBootstrap("");
    return Boolean(cached?.logo_url);
  });
  const [agreeLegal, setAgreeLegal] = useState(false);
  const [legalDoc, setLegalDoc] = useState<null | "terms" | "privacy">(null);

  const inviteReward = Number(portalSettings.invite_reward_spins || 3);
  const inviteEnabled = !!portalSettings.enable_invite;
  const themeColor = useMemo(() => {
    const tc = String(portalSettings.theme_primary_color || "").trim();
    return /^#[0-9A-Fa-f]{6}$/i.test(tc) ? tc : "#4d8cff";
  }, [portalSettings.theme_primary_color]);

  useLayoutEffect(() => {
    document.documentElement.classList.add("member-html");
    return () => {
      document.documentElement.classList.remove("member-html");
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setPortalSettingsReady(false);
      try {
        const data = await getDefaultMemberPortalSettings();
        if (cancelled) return;
        if (data?.settings) {
          seedPlatformBrandLogoFromSettings(data.settings.logo_url);
          setPortalSettings(data.settings);
        }
      } catch {
        /* keep cached or DEFAULT_SETTINGS */
      } finally {
        if (!cancelled) {
          setSettingsLoaded(true);
          setPortalSettingsReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const inviteLegalRequired = portalSettings.registration_require_legal_agreement !== false;

  const handleSubmit = async () => {
    if (!phone.trim()) {
      notify.error(t("请填写手机号", "Phone is required"));
      return;
    }
    if (!password.trim()) {
      notify.error(t("请填写密码", "Password is required"));
      return;
    }
    if (password.length < 6) {
      notify.error(t("密码至少 6 位", "Min 6 characters"));
      return;
    }
    if (password !== confirmPassword) {
      notify.error(t("两次密码不一致", "Passwords do not match"));
      return;
    }
    const code = inviteCode.trim();
    if (!code) {
      notify.error(t("请填写邀请码", "Invite code is required"));
      return;
    }
    if (inviteLegalRequired && !agreeLegal) {
      notify.error(t("请阅读并同意条款", "Please agree to the terms to continue"));
      return;
    }

    setLoading(true);
    try {
      const init = await memberRegisterInit(code);
      if (!init.success) {
        if (init.error === "INVALID_CODE") {
          notify.error(t("邀请码无效或已失效", "Invalid or expired invite code"));
        } else if (init.error === "INVITE_DISABLED") {
          notify.error(t("邀请活动已关闭", "Invites are currently disabled"));
        } else {
          notify.error(t("无法校验邀请码，请稍后重试", "Could not verify invite code"));
        }
        setLoading(false);
        return;
      }

      const r = await validateInviteAndSubmit({
        registerToken: init.registerToken,
        phone: phone.trim(),
        password,
      });
      if (!r.success) {
        if (r.error === "INVALID_CODE") notify.error(t("邀请码无效", "Invalid invite code"));
        else if (r.error === "TOKEN_EXPIRED" || r.error === "INVALID_TOKEN") {
          notify.error(t("验证已过期，请重试", "Session expired — try again"));
        } else if (r.error === "TOKEN_USED")
          notify.error(t("该验证已使用，请重新打开邀请链接", "This link was already used — open the invite again"));
        else if (r.error === "RATE_LIMIT")
          notify.error(t("请求过于频繁，请稍后再试", "Too many attempts, please try again later"));
        else if (r.error === "SELF_REFERRAL")
          notify.error(t("不能使用推荐人本人的手机号注册", "You cannot register with the referrer's own phone"));
        else if (r.error === "ALREADY_INVITED") notify.error(t("已被邀请过", "Already invited"));
        else if (r.error === "PHONE_ALREADY_REGISTERED") notify.error(t("该手机号已注册", "This phone number is already registered"));
        else if (r.error === "REGISTER_FAILED")
          notify.error(t("注册失败，请重试", "Registration failed, please try again"));
        else if (r.error?.includes("invitee") || r.error?.includes("unique"))
          notify.error(t("该手机号已注册", "Phone already registered"));
        else notify.error(t("注册失败，请重试", "Registration failed, please try again"));
        setLoading(false);
        return;
      }
      setSubmitted(true);
      notify.success(t("注册成功", "Registration successful!"));
    } catch (e: unknown) {
      if (e instanceof ApiError && e.statusCode === 429) {
        notify.error(t("请求过于频繁，请稍后再试", "Too many attempts, please try again later"));
      } else {
        notify.error(t("发生错误，请重试", "Something went wrong"));
      }
    } finally {
      setLoading(false);
    }
  };

  const inputBase =
    "h-12 w-full rounded-xl border border-[hsl(var(--pu-m-surface-border)/0.25)] bg-[hsl(var(--pu-m-surface)/0.45)] text-sm font-medium text-[hsl(var(--pu-m-text))] outline-none member-transition-surface member-motion-fast placeholder:text-[hsl(var(--pu-m-text-dim)/0.4)] focus-visible:ring-2 focus-visible:ring-pu-gold/25";

  if (ref) {
    return <Navigate to={`/invite/${encodeURIComponent(ref)}`} replace />;
  }

  if (!settingsLoaded) {
    return (
      <MemberRegisterShell themeColor={themeColor}>
        <div className="flex min-h-dvh flex-1 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-[hsl(var(--pu-gold))]" />
        </div>
      </MemberRegisterShell>
    );
  }

  return (
    <MemberRegisterShell themeColor={themeColor}>
      <div className="relative z-[1] mx-auto flex w-full max-w-[min(100%,36rem)] flex-1 flex-col px-1 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))] sm:max-w-[480px] sm:px-0">
        <Link
          to={ROUTES.MEMBER.ROOT}
          replace
          className="mb-8 inline-flex items-center self-start px-5 text-xs font-bold tracking-wide text-[hsl(var(--pu-m-text-dim))] transition hover:text-[hsl(var(--pu-m-text))]"
        >
          ← {t("返回", "Back")}
        </Link>
        {!submitted ? (
          portalSettingsReady ? (
            <MemberLoginCarousel displaySettings={portalSettings} theme={theme} t={t} paused={false} />
          ) : (
            <div className="mb-8 px-5" aria-hidden>
              <div
                className="relative overflow-hidden rounded-2xl bg-[hsl(var(--pu-m-surface)/0.22)]"
                style={{ aspectRatio: "2/1" }}
              >
                <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-[hsl(var(--pu-m-surface-border)/0.12)] via-[hsl(var(--pu-m-surface)/0.35)] to-[hsl(var(--pu-m-surface-border)/0.08)]" />
              </div>
            </div>
          )
        ) : null}
        {!inviteEnabled ? (
          <div className="relative flex flex-1 flex-col items-center justify-center overflow-hidden rounded-2xl border border-dashed border-pu-gold/22 bg-gradient-to-b from-pu-gold/[0.08] via-[hsl(var(--pu-m-surface)/0.22)] to-[hsl(var(--pu-m-surface)/0.28)] px-5 py-12 text-center">
            <p className="m-0 text-base font-semibold text-[hsl(var(--pu-m-text))]">{t("邀请已关闭", "Invite Disabled")}</p>
            <p className="mt-2 text-sm leading-relaxed text-[hsl(var(--pu-m-text-dim))]">
              {t("邀请活动当前不可用。", "The invite activity is currently not available.")}
            </p>
            <Button
              asChild
              className="mt-6 h-11 w-full max-w-[280px] rounded-2xl border-0 text-base font-bold text-[hsl(var(--pu-primary-foreground))]"
              style={{
                background: "linear-gradient(135deg, hsl(var(--pu-gold)), hsl(var(--pu-gold-soft)))",
              }}
            >
              <Link to={ROUTES.MEMBER.LOGIN_LEGACY}>{t("前往登录", "Go to Login")}</Link>
            </Button>
          </div>
        ) : submitted ? (
          <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-[hsl(var(--pu-m-surface-border)/0.2)] bg-[hsl(var(--pu-m-surface)/0.25)] px-5 py-12 text-center">
            <div
              className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl"
              style={{
                background: "linear-gradient(135deg, hsl(var(--pu-emerald)), hsl(var(--pu-emerald-soft)))",
                boxShadow: "0 8px 32px -8px hsl(var(--pu-emerald) / 0.4)",
              }}
            >
              <Gift className="h-8 w-8 text-[hsl(var(--pu-m-bg-1))]" aria-hidden />
            </div>
            <h2 className="m-0 text-xl font-extrabold tracking-tight text-[hsl(var(--pu-m-text))]">{t("欢迎加入", "Welcome!")}</h2>
            <p className="mt-2 text-sm leading-relaxed text-[hsl(var(--pu-m-text-dim))]">
              {t(
                `账户已创建，您已获得 ${inviteReward} 次免费转盘！请登录开始使用。`,
                `Account created. You've earned ${inviteReward} free spins! Login to start.`,
              )}
            </p>
            <Button
              asChild
              className="mt-8 h-12 w-full max-w-[280px] rounded-2xl border-0 text-base font-bold text-[hsl(var(--pu-primary-foreground))]"
              style={{
                background: "linear-gradient(135deg, hsl(var(--pu-gold)), hsl(var(--pu-gold-soft)))",
              }}
            >
              <Link to={ROUTES.MEMBER.LOGIN_LEGACY} className="inline-flex items-center justify-center gap-2">
                {t("立即登录", "Login Now")}
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </Button>
          </div>
        ) : (
          <>
            <div className="mb-6 px-5">
              <div className="mb-2 flex items-center gap-3">
                <div
                  className="flex h-9 w-9 items-center justify-center rounded-xl"
                  style={{
                    background: "linear-gradient(135deg, hsl(var(--pu-emerald)), hsl(var(--pu-emerald-soft)))",
                    boxShadow: "0 6px 20px -6px hsl(var(--pu-emerald) / 0.45)",
                  }}
                >
                  <UserPlus className="h-4 w-4 text-[hsl(var(--pu-m-bg-1))]" aria-hidden />
                </div>
                <h1 className="text-xl font-extrabold tracking-tight text-[hsl(var(--pu-m-text))]">
                  {t("创建账户", "Create account")}
                </h1>
              </div>
              <p className="text-xs leading-relaxed text-[hsl(var(--pu-m-text-dim))]">
                {t(
                  "先设置登录手机号与密码；最后在下方填写好友邀请码完成开通（与邀请落地页相同流程）。",
                  "Set your phone and password first, then enter your invite code below to finish — same flow as the invite page.",
                )}
              </p>
            </div>

            {inviteEnabled ? (
              <MemberLoginBadgeGrid
                loading={!portalSettingsReady}
                loginBadges={portalSettings.login_badges}
                className="px-5"
              />
            ) : null}

            <form
              className="flex flex-1 flex-col px-5"
              onSubmit={(e) => {
                e.preventDefault();
                void handleSubmit();
              }}
            >
              <div className="space-y-5">
                <div>
                  <label className="mb-2 block text-[11px] font-bold text-[hsl(var(--pu-m-text-dim))]">
                    {t("手机号码", "Phone")}
                  </label>
                  <div className="relative">
                    <Phone
                      className="pointer-events-none absolute left-3.5 top-1/2 z-[1] h-4 w-4 -translate-y-1/2 text-[hsl(var(--pu-m-text-dim)/0.4)]"
                      aria-hidden
                    />
                    <Input
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder={t("例如 08012345678", "e.g. 08012345678")}
                      autoComplete="tel"
                      className={cn(inputBase, "pl-10")}
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-[11px] font-bold text-[hsl(var(--pu-m-text-dim))]">
                    {t("密码（至少 6 位）", "Password (min 6)")}
                  </label>
                  <div className="relative">
                    <KeyRound
                      className="pointer-events-none absolute left-3.5 top-1/2 z-[1] h-4 w-4 -translate-y-1/2 text-[hsl(var(--pu-m-text-dim)/0.4)]"
                      aria-hidden
                    />
                    <Input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={t("创建密码", "Create a password")}
                      autoComplete="new-password"
                      className={cn(inputBase, "pl-10 pr-12")}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-[hsl(var(--pu-m-text-dim))]"
                      aria-label={showPassword ? t("隐藏密码", "Hide password") : t("显示密码", "Show password")}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-[11px] font-bold text-[hsl(var(--pu-m-text-dim))]">
                    {t("确认密码", "Confirm password")}
                  </label>
                  <div className="relative">
                    <KeyRound
                      className="pointer-events-none absolute left-3.5 top-1/2 z-[1] h-4 w-4 -translate-y-1/2 text-[hsl(var(--pu-m-text-dim)/0.4)]"
                      aria-hidden
                    />
                    <Input
                      type={showConfirmPassword ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder={t("再次输入密码", "Confirm password")}
                      autoComplete="new-password"
                      className={cn(inputBase, "pl-10 pr-12")}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-[hsl(var(--pu-m-text-dim))]"
                      aria-label={
                        showConfirmPassword ? t("隐藏密码", "Hide password") : t("显示密码", "Show password")
                      }
                    >
                      {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="mb-2 flex items-center gap-1.5 text-[11px] font-bold text-[hsl(var(--pu-m-text-dim))]">
                    <Sparkles className="h-3 w-3 shrink-0 text-pu-gold-soft" aria-hidden />
                    {t("邀请码", "Invite code")}
                  </label>
                  <Input
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value)}
                    placeholder={t("粘贴好友邀请码", "Paste invite code")}
                    autoComplete="off"
                    className={cn(inputBase, "font-mono text-xs font-semibold uppercase tracking-wider placeholder:normal-case placeholder:tracking-normal")}
                  />
                  <p className="mt-2 text-[11px] leading-relaxed text-[hsl(var(--pu-m-text-dim)/0.85)]">
                    {t("与链接中 /invite/ 后的代码一致。", "Same as the code after /invite/ in your link.")}
                  </p>
                </div>
              </div>

              {inviteLegalRequired ? (
                <div className="mt-6 flex items-start gap-2.5">
                  <Checkbox
                    id="member-register-terms"
                    checked={agreeLegal}
                    onCheckedChange={(c) => setAgreeLegal(c === true)}
                    className={cn(
                      "member-legal-consent-checkbox mt-0.5 h-[18px] w-[18px] shrink-0 rounded-[6px] border shadow-none",
                      "focus-visible:ring-0 focus-visible:ring-offset-0",
                    )}
                    style={{ ["--member-legal-check" as string]: themeColor }}
                  />
                  <div className="min-w-0 flex-1 text-[11px] leading-relaxed text-[hsl(var(--pu-m-text-dim))]">
                    <label htmlFor="member-register-terms" className="cursor-pointer">
                      {t("我已阅读并同意", "I have read and agree to the ")}
                    </label>
                    <button
                      type="button"
                      className="font-bold text-pu-gold motion-reduce:transition-none hover:underline"
                      onClick={() => setLegalDoc("terms")}
                    >
                      {t("服务条款", "Terms of Service")}
                    </button>
                    <span>{t("与", " and ")}</span>
                    <button
                      type="button"
                      className="font-bold text-pu-gold hover:underline"
                      onClick={() => setLegalDoc("privacy")}
                    >
                      {t("隐私说明", "Privacy Policy")}
                    </button>
                    <span>{t("。", ".")}</span>
                  </div>
                </div>
              ) : null}

              <div className="min-h-6 flex-1" />

              <button
                type="submit"
                disabled={loading}
                className="mb-3 flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-sm font-bold text-[hsl(var(--pu-primary-foreground))] member-transition-surface member-motion-fast active:scale-[0.97] disabled:opacity-50 motion-reduce:transition-none"
                style={{
                  background: "linear-gradient(135deg, hsl(var(--pu-gold)), hsl(var(--pu-gold-soft)))",
                  boxShadow: "0 8px 28px -8px hsl(var(--pu-gold) / 0.5)",
                }}
              >
                {loading ? t("注册中…", "Registering...") : t("立即注册", "Register now")}
                {loading ? (
                  <Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none" aria-hidden />
                ) : (
                  <ArrowRight className="h-4 w-4" aria-hidden />
                )}
              </button>

              <p className="mb-4 text-center text-xs text-[hsl(var(--pu-m-text-dim))]">
                {t("已有账户？", "Already have an account?")}{" "}
                <Link to={ROUTES.MEMBER.LOGIN_LEGACY} className="font-bold text-pu-gold transition hover:underline">
                  {t("去登录", "Sign in")}
                </Link>
              </p>

              {/* 无邀请码：仅占位，置于主流程之后避免打断表单 */}
              <details className="mb-6 rounded-xl border border-[hsl(var(--pu-m-surface-border)/0.22)] bg-[hsl(var(--pu-m-surface)/0.14)] px-3 py-2 [&_summary::-webkit-details-marker]:hidden">
                <summary className="cursor-pointer list-none text-center text-[11px] font-bold text-[hsl(var(--pu-m-text-dim)/0.92)] transition hover:text-[hsl(var(--pu-m-text))]">
                  {t("没有邀请码？", "No invite code?")}
                </summary>
                <p className="mt-2 text-[10px] leading-relaxed text-[hsl(var(--pu-m-text-dim)/0.72)]">
                  {t(
                    "开放自助注册需服务端支持，后续将在此开放。当前请向好友索取邀请链接或使用上方邀请码。",
                    "Open self-serve sign-up needs backend support and will appear here later. Ask a friend for a link or use an invite code above.",
                  )}
                </p>
                <div className="mt-2 flex justify-center">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled
                    className="h-8 rounded-lg px-4 text-[10px] font-semibold opacity-55"
                  >
                    {t("即将开放", "Coming soon")}
                  </Button>
                </div>
              </details>

              <div className="mb-2 flex items-center justify-center gap-4 border-t border-[hsl(var(--pu-m-surface-border)/0.15)] pt-4">
                {[
                  { icon: Shield, label: t("SSL", "SSL") },
                  { icon: Lock, label: t("加密", "Secure") },
                  { icon: Sparkles, label: t("验证", "Verified") },
                ].map((item) => (
                  <div key={item.label} className="flex items-center gap-1">
                    <item.icon className="h-3 w-3 text-[hsl(var(--pu-m-text-dim)/0.35)]" aria-hidden />
                    <span className="text-[10px] font-medium text-[hsl(var(--pu-m-text-dim)/0.35)]">{item.label}</span>
                  </div>
                ))}
              </div>
              <p className="text-center text-[10px] text-[hsl(var(--pu-m-text-dim)/0.45)]">
                {t("您的数据受保护并已加密。", "Your data is protected and encrypted.")}
              </p>
            </form>
          </>
        )}
      </div>

      <MemberLegalDrawer
        open={legalDoc === "terms"}
        onOpenChange={(o) => {
          if (!o) setLegalDoc(null);
        }}
        title={t("服务条款", "Terms of Service")}
      >
        {memberPortalLegalBody(portalSettings, language, "terms")}
      </MemberLegalDrawer>
      <MemberLegalDrawer
        open={legalDoc === "privacy"}
        onOpenChange={(o) => {
          if (!o) setLegalDoc(null);
        }}
        title={t("隐私说明", "Privacy Policy")}
      >
        {memberPortalLegalBody(portalSettings, language, "privacy")}
      </MemberLegalDrawer>
    </MemberRegisterShell>
  );
}
