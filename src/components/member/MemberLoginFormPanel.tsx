import type { CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import {
  Lock,
  Shield,
  Sparkles,
  Sun,
  Moon,
  Loader2,
  Phone,
  KeyRound,
  Eye,
  EyeOff,
  Square,
  CheckSquare,
  ArrowRight,
} from "lucide-react";
import { notify } from "@/lib/notifyHub";
import { ROUTES } from "@/routes/constants";
import { MemberPageAmbientOrbs } from "@/components/member/MemberPageAmbientOrbs";
import { LoginIdleHeaderLogo } from "@/components/member/LoginIdleHeaderLogo";
import type { MemberPortalSettings } from "@/services/members/memberPortalSettingsService";

const puInputShell: React.CSSProperties = {
  background: "hsl(var(--pu-m-surface) / 0.45)",
  border: "1px solid hsl(var(--pu-m-surface-border) / 0.25)",
  color: "hsl(var(--pu-m-text))",
};

const loginThemeSurfaceBtn =
  "rounded-xl border border-[hsl(var(--pu-m-surface-border)/0.3)] bg-[hsl(var(--pu-m-surface)/0.55)] p-2.5 transition motion-reduce:transition-none hover:bg-[hsl(var(--pu-m-surface)/0.85)]";

export type MemberLoginFormPanelProps = {
  displaySettings: MemberPortalSettings;
  loginPremiumRootStyle: CSSProperties;
  theme: "light" | "dark";
  toggleTheme: () => void;
  t: (zh: string, en: string) => string;
  onBack: () => void;
  phone: string;
  setPhone: (v: string) => void;
  password: string;
  setPassword: (v: string) => void;
  showPassword: boolean;
  setShowPassword: (v: boolean) => void;
  rememberMe: boolean;
  setRememberMe: (v: boolean) => void;
  loading: boolean;
  onSubmit: (values: { phone: string; password: string }) => void | Promise<void>;
};

export function MemberLoginFormPanel({
  displaySettings,
  loginPremiumRootStyle,
  theme,
  toggleTheme,
  t,
  onBack,
  phone,
  setPhone,
  password,
  setPassword,
  showPassword,
  setShowPassword,
  rememberMe,
  setRememberMe,
  loading,
  onSubmit,
}: MemberLoginFormPanelProps) {
  const navigate = useNavigate();

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
            onClick={onBack}
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
                void onSubmit({ phone, password });
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
                    notify.info(t("忘记密码请联系客服或邀请人。", "Forgot? Contact support or your inviter."))
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
                {t("登录", "Sign In")}
                <span className="inline-flex w-4 shrink-0 items-center justify-center" aria-hidden>
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
                  ) : (
                    <ArrowRight className="h-4 w-4" />
                  )}
                </span>
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
              { icon: Shield, label: t("SSL", "SSL") },
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
