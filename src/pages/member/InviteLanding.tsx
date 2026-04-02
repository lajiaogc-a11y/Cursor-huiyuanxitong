import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useParams, Link } from "react-router-dom";
import {
  User,
  Lock,
  Gift,
  Globe,
  Loader2,
  Fingerprint,
  ArrowRight,
  Phone,
  KeyRound,
  Eye,
  EyeOff,
  UserPlus,
  Shield,
  Sparkles,
} from "lucide-react";
import { memberRegisterInit, validateInviteAndSubmit } from "@/services/memberPortal/memberActivityService";
import { ApiError } from "@/lib/apiClient";
import { toast } from "sonner";
import {
  getDefaultMemberPortalSettings,
  getMemberPortalSettingsByInviteCode,
  type MemberPortalSettings,
} from "@/services/members/memberPortalSettingsService";
import {
  mergePlatformBrandLogo,
  seedPlatformBrandLogoFromSettings,
} from "@/lib/memberPortalPlatformBrandLogo";
import "@/styles/member-portal.css";
import { ROUTES } from "@/routes/constants";
import { useMemberResolvableMedia } from "@/hooks/useMemberResolvableMedia";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { MemberLegalDrawer } from "@/components/member/MemberLegalDrawer";
import { useLanguage } from "@/contexts/LanguageContext";
import { memberPortalLegalBody } from "@/lib/memberPortalLegalBody";
import { memberPortalGoldCssVarsFromHex } from "@/utils/memberPortalGoldCssVars";
import { MemberPageAmbientOrbs } from "@/components/member/MemberPageAmbientOrbs";
import { cn } from "@/lib/utils";

function InviteLandingBrandLogo({
  logoUrl,
  logoKey,
  logoAlt,
}: {
  logoUrl: string | null | undefined;
  logoKey: string;
  logoAlt: string;
}) {
  const raw = String(logoUrl ?? "").trim();
  const { resolvedSrc, usePlaceholder, onImageError } = useMemberResolvableMedia(logoKey, raw || undefined);
  const showImg = raw && !usePlaceholder;
  const imgShellClass =
    "mb-3 flex min-h-[3.5rem] w-auto max-w-[min(300px,90vw)] items-center justify-center rounded-2xl border border-[hsl(var(--pu-m-surface-border)/0.25)] bg-[hsl(var(--pu-m-surface)/0.2)] px-4 py-3 shadow-[0_8px_28px_rgba(0,0,0,0.3)]";
  if (showImg) {
    return (
      <div className={imgShellClass}>
        <img
          src={resolvedSrc}
          alt={logoAlt}
          loading="lazy"
          decoding="async"
          onError={onImageError}
          className="max-h-[min(8rem,36vw)] w-auto max-w-full object-contain object-center"
        />
      </div>
    );
  }
  return (
    <div
      className={cn(
        "mb-3 flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-[hsl(var(--pu-m-surface-border)/0.25)]",
        "shadow-[0_8px_28px_hsl(var(--pu-gold)/0.3)]",
      )}
      style={{
        background: "linear-gradient(135deg, hsl(var(--pu-gold)), hsl(var(--pu-gold-soft)))",
      }}
    >
      <Globe className="h-[26px] w-[26px] text-[hsl(var(--pu-primary-foreground))]" strokeWidth={2} aria-hidden />
    </div>
  );
}

export default function InviteLanding() {
  const { code } = useParams<{ code: string }>();
  const { t, language } = useLanguage();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [brandName, setBrandName] = useState("Spin & Win");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [inviteReward, setInviteReward] = useState(3);
  const [inviteEnabled, setInviteEnabled] = useState(true);
  const [themeColor, setThemeColor] = useState("#4d8cff");
  const [inviteTenantId, setInviteTenantId] = useState<string | null>(null);
  const [portalSettings, setPortalSettings] = useState<MemberPortalSettings | null>(null);
  const [agreeLegal, setAgreeLegal] = useState(false);
  const [legalDoc, setLegalDoc] = useState<null | "terms" | "privacy">(null);
  /** 服务端下发的短时一次性凭证，提交注册时必填（不由前端生成） */
  const [registerToken, setRegisterToken] = useState<string | null>(null);
  const [registerExpiresIn, setRegisterExpiresIn] = useState<number | null>(null);
  const [registerInitLoading, setRegisterInitLoading] = useState(false);
  const [registerInitError, setRegisterInitError] = useState<string | null>(null);

  useEffect(() => {
    document.documentElement.classList.add("member-html");
    return () => {
      document.documentElement.classList.remove("member-html");
    };
  }, []);

  useEffect(() => {
    if (!code) return;
    void (async () => {
      try {
        const data = await getMemberPortalSettingsByInviteCode(code);
        if (!data) return;
        const defaultPayload = await getDefaultMemberPortalSettings();
        const platformLogo = String(defaultPayload?.settings?.logo_url ?? "").trim() || null;
        seedPlatformBrandLogoFromSettings(platformLogo);
        const merged = mergePlatformBrandLogo(data.settings, platformLogo);
        setPortalSettings(merged);
        setInviteTenantId(data.tenant_id ?? null);
        setBrandName(merged.company_name || "FastGC");
        setLogoUrl(merged.logo_url);
        setInviteReward(Number(merged.invite_reward_spins || 3));
        setInviteEnabled(!!merged.enable_invite);
        const tc = String(merged.theme_primary_color || "").trim();
        setThemeColor(/^#[0-9A-Fa-f]{6}$/i.test(tc) ? tc : "#4d8cff");
      } catch {
        console.warn("[InviteLanding] Failed to load portal settings for code:", code);
      }
    })();
  }, [code]);

  useEffect(() => {
    const c = code?.trim();
    if (!c) return;
    let cancelled = false;
    setRegisterInitLoading(true);
    setRegisterInitError(null);
    setRegisterToken(null);
    setRegisterExpiresIn(null);
    void (async () => {
      const r = await memberRegisterInit(c);
      if (cancelled) return;
      setRegisterInitLoading(false);
      if (r.success) {
        setRegisterToken(r.registerToken);
        setRegisterExpiresIn(r.expiresIn);
      } else {
        setRegisterInitError(r.error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code]);

  /** 在 registerToken 过期前静默续期，减少填表中途 TOKEN_EXPIRED */
  useEffect(() => {
    if (submitted || !code?.trim() || registerInitError || registerExpiresIn == null || registerExpiresIn < 45) {
      return;
    }
    const leadSec = Math.min(120, Math.max(30, Math.floor(registerExpiresIn * 0.25)));
    const ms = Math.max(10_000, (registerExpiresIn - leadSec) * 1000);
    const tid = window.setTimeout(() => {
      void (async () => {
        const r = await memberRegisterInit(code.trim());
        if (r.success) {
          setRegisterToken(r.registerToken);
          setRegisterExpiresIn(r.expiresIn);
        }
      })();
    }, ms);
    return () => window.clearTimeout(tid);
  }, [code, registerExpiresIn, submitted, registerInitError]);

  const inviteLegalRequired =
    portalSettings != null && portalSettings.registration_require_legal_agreement !== false;

  const handleSubmit = async () => {
    if (!code?.trim()) {
      toast.error(t("邀请码无效", "Invalid invite code"));
      return;
    }
    if (!phone.trim()) {
      toast.error(t("请填写手机号", "Phone is required"));
      return;
    }
    if (!password.trim()) {
      toast.error(t("请填写密码", "Password is required"));
      return;
    }
    if (password.length < 6) {
      toast.error(t("密码至少 6 位", "Min 6 characters"));
      return;
    }
    if (password !== confirmPassword) {
      toast.error(t("两次密码不一致", "Passwords do not match"));
      return;
    }
    if (inviteLegalRequired && !agreeLegal) {
      toast.error(t("请阅读并同意条款", "Please agree to the terms to continue"));
      return;
    }
    if (!registerToken?.trim()) {
      toast.error(t("正在校验邀请链接，请稍候或刷新页面", "Verifying invite link — wait a moment or refresh"));
      return;
    }
    setLoading(true);
    try {
      const r = await validateInviteAndSubmit({
        registerToken: registerToken.trim(),
        phone: phone.trim(),
        password,
      });
      if (!r.success) {
        if (r.error === "INVALID_CODE") toast.error(t("邀请码无效", "Invalid invite code"));
        else if (r.error === "TOKEN_EXPIRED" || r.error === "INVALID_TOKEN") {
          toast.error(t("验证已过期，请重试", "Session expired — try again"));
          const again = code?.trim() ? await memberRegisterInit(code.trim()) : null;
          if (again && "success" in again && again.success) {
            setRegisterToken(again.registerToken);
            setRegisterExpiresIn(again.expiresIn);
          }
        } else if (r.error === "TOKEN_USED")
          toast.error(t("该验证已使用，请重新打开邀请链接", "This link was already used — open the invite again"));
        else if (r.error === "RATE_LIMIT")
          toast.error(t("请求过于频繁，请稍后再试", "Too many attempts, please try again later"));
        else if (r.error === "SELF_REFERRAL")
          toast.error(t("不能使用推荐人本人的手机号注册", "You cannot register with the referrer's own phone"));
        else if (r.error === "ALREADY_INVITED") toast.error(t("已被邀请过", "Already invited"));
        else if (r.error === "REGISTER_FAILED")
          toast.error(t("注册失败，请重试", "Registration failed, please try again"));
        else if (r.error?.includes("invitee") || r.error?.includes("unique"))
          toast.error(t("该手机号已注册", "Phone already registered"));
        else toast.error(r.error || t("注册失败", "Registration failed"));
        setLoading(false);
        return;
      }
      setSubmitted(true);
      toast.success(t("注册成功", "Registration successful!"));
    } catch (e: unknown) {
      if (e instanceof ApiError && e.statusCode === 429) {
        toast.error(
          e.message || t("请求过于频繁，请稍后再试", "Too many attempts, please try again later"),
        );
      } else {
        toast.error(
          e instanceof Error ? e.message : t("发生错误，请重试", "Something went wrong"),
        );
      }
    } finally {
      setLoading(false);
    }
  };

  const brandSlug = String(brandName || "MEMBER")
    .trim()
    .slice(0, 24)
    .toUpperCase();

  const inputBase =
    "h-12 w-full rounded-xl border border-[hsl(var(--pu-m-surface-border)/0.25)] bg-[hsl(var(--pu-m-surface)/0.45)] text-sm font-medium text-[hsl(var(--pu-m-text))] outline-none transition-all placeholder:text-[hsl(var(--pu-m-text-dim)/0.4)] focus-visible:ring-2 focus-visible:ring-pu-gold/25";

  const portalRootStyle = useMemo(
    () =>
      ({
        "--m-theme": themeColor,
        ...memberPortalGoldCssVarsFromHex(themeColor),
      }) as CSSProperties,
    [themeColor],
  );

  const perks = inviteEnabled
    ? [
        {
          emoji: "🎰",
          text: t(`${inviteReward} 次免费转盘`, `${inviteReward} free spins`),
        },
        {
          emoji: "💰",
          text: t("积分商城", "Points mall"),
        },
        {
          emoji: "🎁",
          text: t("新人礼遇", "Welcome perks"),
        },
      ]
    : [];

  return (
    <div
      className="member-login-premium-root member-portal-wrap flex min-h-dvh flex-col overflow-x-hidden"
      style={{
        ...portalRootStyle,
        background: "hsl(var(--pu-m-bg-1))",
        color: "hsl(var(--pu-m-text))",
      }}
    >
      {/* Hero — premium-ui-boost LoginPage register mode */}
      <div className="relative flex shrink-0 flex-col items-center overflow-x-hidden overflow-y-visible pb-10 pt-[max(4.25rem,calc(env(safe-area-inset-top)+2rem))]">
        <MemberPageAmbientOrbs />

        <Link
          to={ROUTES.MEMBER.LOGIN_LEGACY}
          className="absolute left-[max(1.25rem,env(safe-area-inset-left))] top-[max(1.25rem,env(safe-area-inset-top))] z-[2] text-xs font-bold text-[hsl(var(--pu-m-text-dim))] transition hover:text-[hsl(var(--pu-m-text))]"
        >
          ← {t("返回", "Back")}
        </Link>

        <div className="relative z-[2] flex flex-col items-center px-3 pt-2">
          <InviteLandingBrandLogo
            logoUrl={logoUrl}
            logoKey={`invite-landing-logo-${inviteTenantId ?? "x"}-${code ?? ""}`}
            logoAlt={t("品牌标识", "Brand logo")}
          />

          <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-[hsl(var(--pu-m-text-dim))]">
            {brandSlug}
          </span>
        </div>
      </div>

      <div className="relative z-[1] mx-auto flex w-full max-w-[480px] flex-1 flex-col px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        {!inviteEnabled ? (
          <div className="relative flex flex-1 flex-col items-center justify-center overflow-hidden rounded-2xl border border-dashed border-pu-gold/22 bg-gradient-to-b from-pu-gold/[0.08] via-[hsl(var(--pu-m-surface)/0.22)] to-[hsl(var(--pu-m-surface)/0.28)] px-5 py-12 text-center">
            <p className="m-0 text-base font-semibold text-[hsl(var(--pu-m-text))]">
              {t("邀请已关闭", "Invite Disabled")}
            </p>
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
            <h2 className="m-0 text-xl font-extrabold tracking-tight text-[hsl(var(--pu-m-text))]">
              {t("欢迎加入", "Welcome!")}
            </h2>
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
            <div className="mb-5">
              <div className="mb-1 flex items-center gap-2">
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
                  `您已受邀！注册即可解锁钱包、积分商城与 ${inviteReward} 次欢迎转盘。`,
                  `You're invited! Unlock your wallet, points mall, and ${inviteReward} welcome spins.`,
                )}
              </p>
            </div>

            {perks.length > 0 ? (
              <div className="mb-6 flex flex-wrap justify-center gap-2">
                {perks.map((p) => (
                  <span
                    key={p.text}
                    className="flex items-center gap-1.5 rounded-full border border-[hsl(var(--pu-m-surface-border)/0.2)] bg-[hsl(var(--pu-m-surface)/0.5)] px-3 py-1.5 text-[11px] font-bold text-[hsl(var(--pu-m-text))]"
                  >
                    <span aria-hidden>{p.emoji}</span>
                    {p.text}
                  </span>
                ))}
              </div>
            ) : null}

            <form
              className="flex flex-1 flex-col"
              onSubmit={(e) => {
                e.preventDefault();
                void handleSubmit();
              }}
            >
              {registerInitLoading ? (
                <div className="mb-4 flex items-center gap-2 rounded-xl border border-[hsl(var(--pu-m-surface-border)/0.2)] bg-[hsl(var(--pu-m-surface)/0.35)] px-3 py-2.5 text-xs text-[hsl(var(--pu-m-text-dim))]">
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-pu-gold" aria-hidden />
                  {t("正在验证邀请链接…", "Verifying invite link…")}
                </div>
              ) : null}
              {registerInitError === "INVALID_CODE" ? (
                <p className="mb-4 rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2.5 text-xs font-medium text-red-200/95">
                  {t("邀请码无效或已失效，请向好友索取最新链接。", "Invalid or expired invite code. Ask your friend for a current link.")}
                </p>
              ) : null}
              {registerInitError === "INVITE_DISABLED" ? (
                <p className="mb-4 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2.5 text-xs font-medium text-amber-100/95">
                  {t("邀请活动已关闭，暂无法通过此链接注册。", "Invites are disabled — registration via this link is not available.")}
                </p>
              ) : null}
              {registerInitError && registerInitError !== "INVALID_CODE" && registerInitError !== "INVITE_DISABLED" ? (
                <p className="mb-4 rounded-xl border border-[hsl(var(--pu-m-surface-border)/0.25)] bg-[hsl(var(--pu-m-surface)/0.35)] px-3 py-2.5 text-xs text-[hsl(var(--pu-m-text-dim))]">
                  {t("暂时无法完成校验，请刷新页面重试。", "Could not verify right now. Please refresh and try again.")}
                </p>
              ) : null}
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
              </div>

              {inviteLegalRequired ? (
                <div className="mt-6 flex items-start gap-2.5">
                  <Checkbox
                    id="invite-reg-terms"
                    checked={agreeLegal}
                    onCheckedChange={(c) => setAgreeLegal(c === true)}
                    className={cn(
                      "member-legal-consent-checkbox mt-0.5 h-[18px] w-[18px] shrink-0 rounded-[6px] border shadow-none",
                      "focus-visible:ring-0 focus-visible:ring-offset-0 data-[state=checked]:text-[#0B0E14]",
                    )}
                    style={{ ["--member-legal-check" as string]: themeColor }}
                  />
                  <div className="min-w-0 flex-1 text-[11px] leading-relaxed text-[hsl(var(--pu-m-text-dim))]">
                    <label htmlFor="invite-reg-terms" className="cursor-pointer">
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
                disabled={loading || registerInitLoading || !registerToken}
                className="mb-3 flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-sm font-bold text-[hsl(var(--pu-primary-foreground))] transition-all active:scale-[0.97] disabled:opacity-50 motion-reduce:transition-none"
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

              <p className="mb-6 text-center text-xs text-[hsl(var(--pu-m-text-dim))]">
                {t("已有账户？", "Already have an account?")}{" "}
                <Link to={ROUTES.MEMBER.LOGIN_LEGACY} className="font-bold text-pu-gold transition hover:underline">
                  {t("去登录", "Sign in")}
                </Link>
              </p>

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

      {portalSettings ? (
        <>
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
        </>
      ) : null}
    </div>
  );
}
