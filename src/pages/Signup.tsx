import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Lock, User, UserPlus, Loader2, Wifi, WifiOff, RefreshCw, Eye, EyeOff, ShieldCheck, Ticket, Info } from "lucide-react";
import { notify } from "@/lib/notifyHub";
import { validatePassword, getPasswordStrength } from "@/lib/passwordValidation";
import { GCLogo } from "@/components/GCLogo";
import { registerStaffApi } from "@/services/auth/authApiService";
import { hasAnyEmployeeRecordsForSignup } from "@/services/employees/employeeSignupReadiness";
import { getCurrenciesApi } from "@/services/staff/dataApi";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { STAFF_AUTH_MODULE_ITEMS } from "@/components/auth/staffAuthMarketing";
import { StaffAuthLanguageToggle } from "@/components/auth/StaffAuthLanguageToggle";

export default function Signup() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [realName, setRealName] = useState("");
  const [invitationCode, setInvitationCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [networkStatus, setNetworkStatus] = useState<'checking' | 'ok' | 'error' | null>(null);
  const [networkLatency, setNetworkLatency] = useState<number | null>(null);
  const [isFirstUser, setIsFirstUser] = useState<boolean | null>(null);

  useEffect(() => {
    checkNetwork();
    checkFirstUser();
  }, []);

  const checkFirstUser = async () => {
    try {
      const hasAny = await hasAnyEmployeeRecordsForSignup();
      setIsFirstUser(!hasAny);
    } catch {
      setIsFirstUser(false);
    }
  };

  const checkNetwork = async () => {
    setNetworkStatus('checking');
    const startTime = Date.now();
    try {
      await getCurrenciesApi();
      setNetworkLatency(Date.now() - startTime);
      setNetworkStatus('ok');
    } catch {
      setNetworkStatus('error');
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!username.trim()) {
      notify.error(t('signup.fillUsername'));
      return;
    }

    if (!realName.trim()) {
      notify.error(t('signup.fillRealName'));
      return;
    }

    if (!password.trim()) {
      notify.error(t('signup.fillPassword'));
      return;
    }

    const passwordCheck = validatePassword(password);
    if (!passwordCheck.valid) {
      notify.error(passwordCheck.errors[0]);
      return;
    }

    if (password !== confirmPassword) {
      notify.error(t('signup.passwordMismatch'));
      return;
    }

    // Non-first user must provide invitation code
    if (!isFirstUser && !invitationCode.trim()) {
      notify.error(t('请输入邀请码', 'Please enter invitation code'));
      return;
    }

    setLoading(true);

    try {
      const res = await registerStaffApi({
        username: username.trim(),
        password,
        realName: realName.trim(),
        invitationCode: isFirstUser ? undefined : invitationCode.trim(),
      });

      if (!res.success) {
        switch (res.error_code) {
          case 'USERNAME_EXISTS':
            notify.error(t('signup.usernameExists'));
            break;
          case 'INVITATION_CODE_REQUIRED':
            notify.error(t('请输入邀请码', 'Invitation code is required'));
            break;
          case 'INVALID_INVITATION_CODE':
            notify.error(t('邀请码无效', 'Invalid invitation code'));
            break;
          case 'INVITATION_CODE_EXPIRED':
            notify.error(t('邀请码已过期', 'Invitation code has expired'));
            break;
          case 'INVITATION_CODE_USED':
            notify.error(t('邀请码已被使用完', 'Invitation code usage limit reached'));
            break;
          default:
            notify.error(res.message || t('signup.signupFailed'));
        }
        return;
      }

      if (res.assigned_status === 'active') {
        notify.success(t('signup.signupSuccessAdmin'));
      } else {
        notify.success(t('signup.signupSuccessPending'));
      }
      navigate('/staff/login');
    } catch (error: any) {
      console.error('Signup error:', error);
      notify.error(error.message || t('signup.signupFailed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex h-dvh items-center justify-center overflow-hidden bg-[#F6F8FB] p-4 sm:p-6 dark:bg-[#0f172a]">
      <div className="absolute top-3 right-3 z-20 sm:top-4 sm:right-4">
        <StaffAuthLanguageToggle />
      </div>
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.08] dark:opacity-[0.06]"
        style={{
          backgroundImage: "radial-gradient(circle at 1px 1px, currentColor 0.5px, transparent 0)",
          backgroundSize: "24px 24px",
        }}
      />

      <div
        className="relative flex w-full max-w-[880px] flex-col overflow-hidden rounded-2xl shadow-xl lg:flex-row"
        style={{ maxHeight: "calc(100dvh - 32px)" }}
      >
        {/* 左侧品牌区 — 桌面 */}
        <div className="hidden min-w-[360px] flex-1 flex-col bg-gradient-to-br from-[#0f172a] via-[#1e293b] to-[#0f172a] p-8 lg:flex">
          <div className="flex flex-1 flex-col justify-center">
            <div className="mb-8 flex items-center gap-3">
              <GCLogo size={40} variant="light" />
              <div>
                <p className="text-lg font-semibold leading-tight text-white">{t("signup.title")}</p>
                <p className="text-sm text-slate-400">{t("signup.subtitle")}</p>
              </div>
            </div>
            <h1 className="mb-3 text-2xl font-bold leading-tight text-white">
              {t("开通员工账号", "Create your staff account")}
            </h1>
            <p className="text-sm leading-relaxed text-slate-300">
              {t(
                "使用管理员发放的邀请码加入租户；若系统尚无员工，首个账号可直接注册。",
                "Join your tenant with an invitation code from your admin. If there are no employees yet, the first account can register without a code.",
              )}
            </p>
            {isFirstUser === true && (
              <p className="mt-4 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">
                {t("检测到尚无员工账号，您将以管理员身份注册首个账号。", "No employees found — you are registering the first admin account.")}
              </p>
            )}
            <div className="mt-6 grid grid-cols-2 gap-2.5">
              {STAFF_AUTH_MODULE_ITEMS.map(({ key, icon: Icon, color }) => (
                <div
                  key={key}
                  className={`flex items-center gap-2.5 rounded-xl border bg-white/5 px-3.5 py-2.5 backdrop-blur-sm transition-all hover:bg-white/10 ${color}`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="text-sm font-medium">{t(`login.${key}`)}</span>
                </div>
              ))}
            </div>
          </div>
          <p className="mt-auto pt-4 text-xs text-slate-500">{t("login.copyright")}</p>
        </div>

        {/* 右侧表单 */}
        <div
          className="relative flex w-full flex-1 flex-col overflow-y-auto bg-white dark:border-l dark:border-slate-700/50 dark:bg-slate-800/90 lg:min-w-[370px]"
          data-spa-scroll-root="signup"
        >
          <div className="flex flex-1 flex-col justify-center p-6 sm:p-8">
            <div className="mb-5 flex items-center gap-3 lg:hidden">
              <GCLogo size={36} />
              <div>
                <h1 className="text-lg font-bold leading-tight text-[#1e293b] dark:text-white">{t("signup.title")}</h1>
                <p className="text-xs text-[#64748B] dark:text-slate-400">{t("signup.subtitle")}</p>
              </div>
            </div>

            <div className="mb-5 hidden lg:block">
              <h1 className="text-2xl font-bold text-[#1e293b] dark:text-white">{t("signup.title")}</h1>
              <p className="mt-1 text-sm text-[#64748B] dark:text-slate-400">{t("signup.subtitle")}</p>
            </div>

            <div
              className="mb-5 flex items-start gap-2.5 rounded-xl border border-border/50 bg-muted/40 px-3.5 py-2.5"
              role="note"
            >
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <p className="text-left text-xs leading-relaxed text-[#64748B] dark:text-slate-400">
                {t(
                  "邀请码由租户管理员发放；首个员工账号可在无邀请码时直接注册。",
                  "Ask your tenant admin for an invite code. The very first staff account can register without one.",
                )}
              </p>
            </div>

            <div className="mb-5 flex gap-1 rounded-lg bg-[#f1f5f9] p-1 dark:bg-slate-700/50">
              <Link
                to="/staff/login"
                className="flex-1 rounded-md py-2 text-center text-sm font-medium text-[#64748B] transition-colors hover:text-[#334155] dark:text-slate-400 dark:hover:text-slate-200"
              >
                {t("login.submit")}
              </Link>
              <span className="flex-1 rounded-md bg-white py-2 text-center text-sm font-medium text-[#1e293b] shadow-sm dark:bg-slate-600/50 dark:text-white">
                {t("login.goSignup")}
              </span>
            </div>

            {/* 网络状态 */}
            <div className="mb-4 flex min-h-[28px] items-center justify-center gap-2 text-sm lg:justify-start">
              {networkStatus === "checking" && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>{t("signup.checkingNetwork")}</span>
                </div>
              )}
              {networkStatus === "ok" && (
                <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                  <Wifi className="h-4 w-4" />
                  <span>
                    {t("signup.networkOk")} ({networkLatency}ms)
                  </span>
                </div>
              )}
              {networkStatus === "error" && (
                <div className="flex items-center gap-2 text-destructive">
                  <WifiOff className="h-4 w-4" />
                  <span>{t("signup.networkError")}</span>
                  <Button variant="ghost" size="sm" onClick={checkNetwork} className="h-6 px-2 text-destructive hover:text-destructive/80">
                    <RefreshCw className="h-3 w-3" />
                  </Button>
                </div>
              )}
            </div>

            {isFirstUser === true && (
              <p className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100 lg:hidden">
                {t("检测到尚无员工账号，您将以管理员身份注册首个账号。", "No employees found — you are registering the first admin account.")}
              </p>
            )}

          <form onSubmit={handleSignup} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username" className="text-sm font-medium text-[#334155] dark:text-slate-300">{t('signup.username')}</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder={t('signup.usernamePlaceholder')}
                  className="h-11 rounded-lg border-[#e2e8f0] pl-10 dark:border-slate-600 dark:bg-slate-700/50 dark:text-white dark:placeholder:text-slate-500"
                  autoComplete="username"
                  disabled={loading}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="realName" className="text-sm font-medium text-[#334155] dark:text-slate-300">{t('signup.realName')}</Label>
              <div className="relative">
                <UserPlus className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="realName"
                  type="text"
                  value={realName}
                  onChange={(e) => setRealName(e.target.value)}
                  placeholder={t('signup.realNamePlaceholder')}
                  className="h-11 rounded-lg border-[#e2e8f0] pl-10 dark:border-slate-600 dark:bg-slate-700/50 dark:text-white dark:placeholder:text-slate-500"
                  disabled={loading}
                />
              </div>
            </div>

            {/* Invitation Code - only show for non-first users */}
            {isFirstUser === false && (
              <div className="space-y-2">
                <Label htmlFor="invitationCode" className="text-sm font-medium text-[#334155] dark:text-slate-300">
                  {t('邀请码', 'Invitation Code')} <span className="text-destructive">*</span>
                </Label>
                <div className="relative">
                  <Ticket className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="invitationCode"
                    type="text"
                    value={invitationCode}
                    onChange={(e) => setInvitationCode(e.target.value.toUpperCase())}
                    placeholder={t('请输入邀请码', 'Enter invitation code')}
                    className="h-11 rounded-lg border-[#e2e8f0] pl-10 font-mono tracking-wider dark:border-slate-600 dark:bg-slate-700/50 dark:text-white dark:placeholder:text-slate-500"
                    disabled={loading}
                    maxLength={8}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {t('请向管理员获取邀请码', 'Please get an invitation code from administrator')}
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium text-[#334155] dark:text-slate-300">{t('signup.password')}</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t('signup.passwordPlaceholder')}
                  className="h-11 rounded-lg border-[#e2e8f0] pl-10 pr-10 dark:border-slate-600 dark:bg-slate-700/50 dark:text-white dark:placeholder:text-slate-500"
                  autoComplete="new-password"
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1.5 text-[#94a3b8] transition-colors hover:bg-[#f1f5f9] hover:text-[#64748B] dark:hover:bg-slate-600/50 dark:hover:text-slate-300"
                  tabIndex={0}
                  aria-label={showPassword ? t("signup.hidePassword", "Hide password") : t("signup.showPassword", "Show password")}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword" className="text-sm font-medium text-[#334155] dark:text-slate-300">{t('signup.confirmPassword')}</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder={t('signup.confirmPasswordPlaceholder')}
                  className="h-11 rounded-lg border-[#e2e8f0] pl-10 pr-10 dark:border-slate-600 dark:bg-slate-700/50 dark:text-white dark:placeholder:text-slate-500"
                  autoComplete="new-password"
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1.5 text-[#94a3b8] transition-colors hover:bg-[#f1f5f9] hover:text-[#64748B] dark:hover:bg-slate-600/50 dark:hover:text-slate-300"
                  tabIndex={0}
                  aria-label={showConfirmPassword ? t("signup.hideConfirmPassword", "Hide password") : t("signup.showConfirmPassword", "Show password")}
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
                </button>
              </div>
            </div>
            {/* Password strength indicator */}
            {password.length > 0 && (
              <div className="space-y-1">
                <div className="flex gap-1">
                  {['weak', 'medium', 'strong'].map((level, i) => {
                    const strength = getPasswordStrength(password);
                    const active = (strength === 'weak' && i === 0) || (strength === 'medium' && i <= 1) || (strength === 'strong');
                    const color = strength === 'weak' ? 'bg-destructive' : strength === 'medium' ? 'bg-warning' : 'bg-green-500';
                    return <div key={level} className={`h-1 flex-1 rounded-full transition-colors ${active ? color : 'bg-muted'}`} />;
                  })}
                </div>
                <div className="flex items-center gap-1 text-xs">
                  <ShieldCheck className="h-3 w-3" />
                  <span className={`${getPasswordStrength(password) === 'weak' ? 'text-destructive' : getPasswordStrength(password) === 'medium' ? 'text-warning' : 'text-green-500'}`}>
                    {getPasswordStrength(password) === 'weak' ? t('弱', 'Weak') : getPasswordStrength(password) === 'medium' ? t('中', 'Medium') : t('强', 'Strong')}
                  </span>
                </div>
              </div>
            )}
            <Button
              type="submit"
              className="mt-6 h-11 w-full rounded-lg font-medium text-white hover:opacity-95"
              style={{ backgroundColor: "#2563EB" }}
              disabled={loading}
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t('signup.registering')}
                </span>
              ) : t('signup.submit')}
            </Button>
          </form>
            <p className="mt-4 text-center text-sm text-[#64748B] dark:text-slate-400">
              {t("signup.haveAccount")}{" "}
              <Link to="/staff/login" className="font-medium text-[#2563EB] hover:underline">
                {t("signup.goLogin")}
              </Link>
            </p>
          </div>

          <div className="px-6 pb-4 lg:hidden">
            <div className="grid grid-cols-4 gap-1.5">
              {STAFF_AUTH_MODULE_ITEMS.map(({ key, icon: Icon, color }) => (
                <div
                  key={key}
                  className={`flex flex-col items-center gap-1 rounded-lg border bg-slate-50 py-2 dark:bg-slate-800/50 ${color}`}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span className="text-center text-[10px] font-medium leading-tight">{t(`login.${key}`)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
