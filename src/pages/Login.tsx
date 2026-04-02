import { useState, useEffect, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Lock, User, AlertCircle, Loader2, WifiOff, ShieldX, KeyRound, MapPinOff, Eye, EyeOff, Info } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { withTimeout, TIMEOUT } from "@/lib/withTimeout";
import { STAFF_AUTH_MODULE_ITEMS } from "@/components/auth/staffAuthMarketing";
import { fetchStaffDeviceWhitelistStatus } from "@/services/staff/staffDeviceWhitelistService";
import { getStaffDeviceVisitorId } from "@/lib/staffDeviceFingerprint";
import { StaffAuthLanguageToggle } from "@/components/auth/StaffAuthLanguageToggle";
import { GCLogo } from "@/components/GCLogo";

export default function Login() {
  const navigate = useNavigate();

  const { signIn, isAuthenticated, loading: authLoading } = useAuth();
  const { t } = useLanguage();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const redirectingRef = useRef(false);
  const [deviceWlEnabled, setDeviceWlEnabled] = useState(false);
  const [deviceVisitorId, setDeviceVisitorId] = useState<string | null>(null);
  const [deviceFpLoading, setDeviceFpLoading] = useState(true);

  const ERROR_CONFIG: Record<string, { icon: typeof AlertCircle; message: string }> = {
    USER_NOT_FOUND: { icon: User, message: t('login.userNotFound') },
    WRONG_PASSWORD: { icon: KeyRound, message: t('login.wrongPassword') },
    ACCOUNT_DISABLED: { icon: ShieldX, message: t('login.accountDisabled') },
    ACCOUNT_LOCKED: { icon: Lock, message: t('账号已临时锁定，请稍后重试', 'Account temporarily locked. Please try again later.') },
    MAINTENANCE_MODE: { icon: AlertCircle, message: t('系统维护中，请稍后再试', 'System is under maintenance, please try later.') },
    IP_COUNTRY_NOT_ALLOWED: { icon: MapPinOff, message: t('login.ipNotAllowed') },
    NETWORK_ERROR: { icon: WifiOff, message: t('login.networkError') },
    TIMEOUT: { icon: WifiOff, message: t('login.timeout') },
    PASSWORD_SYNC_ERROR: { icon: KeyRound, message: t('login.passwordSyncError') },
    SERVER_ERROR: { icon: AlertCircle, message: t('服务器异常，请检查后端配置或联系管理员', 'Server error. Please check backend config or contact admin.') },
    DEVICE_NOT_AUTHORIZED: { icon: ShieldX, message: t('当前设备未授权登录', 'This device is not authorized to sign in') },
    UNKNOWN: { icon: AlertCircle, message: t('login.unknownError') },
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setDeviceFpLoading(true);
      try {
        const st = await fetchStaffDeviceWhitelistStatus();
        if (cancelled) return;
        setDeviceWlEnabled(st.enabled);
        const vid = await getStaffDeviceVisitorId();
        if (cancelled) return;
        setDeviceVisitorId(vid);
      } catch {
        if (!cancelled) {
          setDeviceWlEnabled(false);
          setDeviceVisitorId(null);
        }
      } finally {
        if (!cancelled) setDeviceFpLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      redirectingRef.current = false;
      return;
    }
    if (isAuthenticated && !authLoading && !redirectingRef.current) {
      redirectingRef.current = true;
      navigate("/staff", { replace: true });
    }
  }, [isAuthenticated, authLoading, navigate]);

  useEffect(() => {
    if (error) setError(null);
  }, [username, password]);

  const parseErrorCode = (message: string): string => {
    if (message?.includes('USER_NOT_FOUND') || message?.includes('账号不存在')) return 'USER_NOT_FOUND';
    if (message?.includes('WRONG_PASSWORD') || message?.includes('密码错误')) return 'WRONG_PASSWORD';
    if (message?.includes('ACCOUNT_DISABLED') || message?.includes('已被禁用')) return 'ACCOUNT_DISABLED';
    if (message?.includes('账号已临时锁定') || message?.includes('锁定') || message?.toLowerCase().includes('locked')) return 'ACCOUNT_LOCKED';
    if (message?.includes('维护') || message?.toLowerCase().includes('maintenance')) return 'MAINTENANCE_MODE';
    if (message?.includes('IP_COUNTRY_NOT_ALLOWED') || message?.includes('区域')) return 'IP_COUNTRY_NOT_ALLOWED';
    if (message?.includes('密码不同步') || message?.includes('认证服务同步失败') || message?.includes('password sync') || message?.includes('out of sync') || message?.includes('Invalid login credentials') || message?.includes('重置密码')) return 'PASSWORD_SYNC_ERROR';
    if (message?.includes('超时') || message?.includes('timeout')) return 'TIMEOUT';
    if (message?.includes('网络') || message?.includes('network') || message?.includes('fetch') || message?.includes('无法连接后端')) return 'NETWORK_ERROR';
    if (message?.includes('Internal Server Error') || message?.includes('服务器异常') || message?.includes('服务器错误') || message?.includes('后端配置')) return 'SERVER_ERROR';
    if (message?.includes('无法连接数据库') || message?.includes('数据库不存在') || message?.includes('数据库表缺失') || message?.includes('数据库异常')) return 'SERVER_ERROR';
    if (message?.includes('DEVICE_NOT_AUTHORIZED') || message?.includes('设备未授权') || message?.includes('未授权登录后台')) return 'DEVICE_NOT_AUTHORIZED';
    return 'UNKNOWN';
  };

  const handleLogin = async (_e: React.FormEvent) => {
    setError(null);
    if (!username.trim()) {
      setError({ code: 'VALIDATION', message: t('login.validationUsername') });
      return;
    }
    if (!password.trim()) {
      setError({ code: 'VALIDATION', message: t('login.validationPassword') });
      return;
    }
    if (deviceWlEnabled && !deviceVisitorId) {
      setError({
        code: 'DEVICE_FP',
        message: t('无法获取设备标识，请刷新页面或检查浏览器是否拦截指纹脚本', 'Could not read device id. Refresh the page or allow the fingerprint script.'),
      });
      return;
    }
    setLoading(true);
    try {
      const result = await withTimeout(
        signIn(username.trim(), password, deviceWlEnabled ? deviceVisitorId : null),
        TIMEOUT.AUTH,
        t('login.timeout')
      );
      if (result.success) {
        toast.success(result.message);
        redirectingRef.current = true;
        navigate("/staff", { replace: true });
        return;
      } else {
        const errorCode = parseErrorCode(result.message);
        const errorConfig = ERROR_CONFIG[errorCode] || ERROR_CONFIG.UNKNOWN;
        const useBackendMessage = ['ACCOUNT_LOCKED', 'MAINTENANCE_MODE', 'SERVER_ERROR', 'DEVICE_NOT_AUTHORIZED'].includes(errorCode)
          || (errorCode === 'UNKNOWN' && result.message && result.message !== '登录失败');
        setError({
          code: errorCode,
          message: useBackendMessage ? result.message : errorConfig.message
        });
      }
    } catch (err: any) {
      const errorCode = parseErrorCode(err?.message || '');
      const errorConfig = ERROR_CONFIG[errorCode] || ERROR_CONFIG.UNKNOWN;
      const useErrMessage = err?.message && (errorCode !== 'UNKNOWN' || !err.message.includes('登录失败'));
      setError({ code: errorCode, message: useErrMessage ? err.message : errorConfig.message });
    } finally {
      setLoading(false);
    }
  };

  const ErrorIcon = error ? (ERROR_CONFIG[error.code]?.icon || AlertCircle) : AlertCircle;

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0f172a]">
        <Loader2 className="h-8 w-8 animate-spin text-[#3b82f6]" />
      </div>
    );
  }

  return (
    <div className="h-dvh flex items-center justify-center p-4 sm:p-6 bg-[#F6F8FB] dark:bg-[#0f172a] relative overflow-hidden">
      <div className="absolute top-3 right-3 sm:top-4 sm:right-4 z-20">
        <StaffAuthLanguageToggle />
      </div>
      {/* 背景纹理 */}
      <div
        className="absolute inset-0 opacity-[0.08] dark:opacity-[0.06] pointer-events-none"
        style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, currentColor 0.5px, transparent 0)',
          backgroundSize: '24px 24px',
        }}
      />

      {/* 居中双卡片布局 */}
      <div className="relative flex flex-col lg:flex-row w-full max-w-[880px] overflow-hidden rounded-2xl shadow-xl" style={{ maxHeight: 'calc(100dvh - 32px)' }}>

        {/* 左侧广告卡片 - 仅桌面端 */}
        <div className="hidden lg:flex flex-col flex-1 min-w-[360px] p-8 bg-gradient-to-br from-[#0f172a] via-[#1e293b] to-[#0f172a]">
          <div className="flex-1 flex flex-col justify-center">
            <div className="flex items-center gap-3 mb-8">
              <GCLogo size={40} variant="light" />
              <div>
                <p className="text-white font-semibold text-lg leading-tight">{t('login.title')}</p>
                <p className="text-slate-400 text-sm">{t('login.titleAlt')}</p>
              </div>
            </div>
            <h1 className="text-2xl font-bold text-white mb-3 leading-tight">
              {t('login.heroTitle')}
            </h1>
            <p className="text-slate-300 text-sm leading-relaxed">
              {t('login.heroSlogan')}
            </p>
            <div className="grid grid-cols-2 gap-2.5 mt-6">
              {STAFF_AUTH_MODULE_ITEMS.map(({ key, icon: Icon, color }) => (
                <div
                  key={key}
                  className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border bg-white/5 backdrop-blur-sm transition-all hover:bg-white/10 ${color}`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="font-medium text-sm">{t(`login.${key}`)}</span>
                </div>
              ))}
            </div>
          </div>
          <p className="text-slate-500 text-xs mt-auto pt-4">
            {t('login.copyright')}
          </p>
        </div>

        {/* 右侧登录卡片 */}
        <div
          className="relative w-full lg:min-w-[370px] flex-1 flex flex-col bg-white dark:bg-slate-800/90 dark:border-l dark:border-slate-700/50 overflow-y-auto"
          data-spa-scroll-root="login"
        >
          <div className="flex-1 flex flex-col justify-center p-6 sm:p-8">
            <div className="mb-6">
              <h1 className="text-xl font-bold text-[#1e293b] dark:text-white sm:text-2xl">
                {t('login.subtitle')}
              </h1>
            </div>

            <div
              className="mb-5 flex items-start gap-2.5 rounded-xl border border-border/50 bg-muted/40 px-3.5 py-2.5"
              role="note"
            >
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <p className="text-left text-xs leading-relaxed text-[#64748B] dark:text-slate-400">
                {t(
                  "请使用租户员工账号登录；若开启设备白名单，仅已登记设备可进入后台。",
                  "Use your tenant staff account. If device whitelist is on, only registered devices can sign in.",
                )}
              </p>
            </div>

            {/* 登录/注册 Tab */}
            <div className="flex gap-1 p-1 rounded-lg bg-[#f1f5f9] dark:bg-slate-700/50 mb-5">
              <span className="flex-1 py-2 text-center text-sm font-medium text-[#1e293b] dark:text-white bg-white dark:bg-slate-600/50 rounded-md shadow-sm">
                {t('login.submit')}
              </span>
              <Link
                to="/staff/signup"
                className="flex-1 py-2 text-center text-sm font-medium text-[#64748B] dark:text-slate-400 hover:text-[#334155] dark:hover:text-slate-200 rounded-md transition-colors"
              >
                {t('login.goSignup')}
              </Link>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void handleLogin(e);
              }}
              className="space-y-4"
            >
              {error && (
                <Alert variant="destructive" className="bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300">
                  <ErrorIcon className="h-4 w-4 shrink-0" />
                  <AlertDescription className="ml-2 text-sm">{error.message}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="username" className="text-sm font-medium text-[#334155] dark:text-slate-300">
                  {t('login.username')}
                </Label>
                <div className="relative">
                  <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#94a3b8] dark:text-slate-500" />
                  <Input
                    id="username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder={t('login.usernamePlaceholder')}
                    className="pl-10 h-11 rounded-lg border-[#e2e8f0] dark:border-slate-600 dark:bg-slate-700/50 dark:text-white dark:placeholder:text-slate-500 focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20"
                    style={{ height: 44 }}
                    autoComplete="username"
                    disabled={loading}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-sm font-medium text-[#334155] dark:text-slate-300">
                  {t('login.password')}
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#94a3b8] dark:text-slate-500" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={t('login.passwordPlaceholder')}
                    className="pl-10 pr-11 h-11 rounded-lg border-[#e2e8f0] dark:border-slate-600 dark:bg-slate-700/50 dark:text-white dark:placeholder:text-slate-500 focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20"
                    style={{ height: 44 }}
                    autoComplete="current-password"
                    disabled={loading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded text-[#94a3b8] hover:text-[#64748B] hover:bg-[#f1f5f9] dark:hover:bg-slate-600/50 dark:hover:text-slate-300 transition-colors"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {deviceWlEnabled && (
                <div className="text-xs text-[#64748B] dark:text-slate-400 leading-relaxed space-y-1">
                  <p>
                    {deviceFpLoading
                      ? t("正在识别本机设备…", "Preparing device identification…")
                      : deviceVisitorId
                        ? t("已启用设备白名单登录，将校验本机设备标识。", "Device whitelist is on; this device will be verified.")
                        : t("无法识别本机设备，请联系管理员或更换浏览器。", "This device could not be identified.")}
                  </p>
                  {!deviceFpLoading && deviceVisitorId && (
                    <p>
                      {t(
                        "若无法登录：请确认本机已在「系统设置 → 后台登录设备」绑定，或由平台管理员在「平台设置 → 后台设备白名单」录入本机 device_id。平台超级管理员不受限。",
                        "If login fails: ensure this device is bound under System Settings → Staff login devices, or ask a platform admin to add this device_id. Platform super admins are exempt.",
                      )}
                    </p>
                  )}
                </div>
              )}

              <Button
                type="button"
                onClick={() => void handleLogin({ preventDefault: () => {} } as React.FormEvent)}
                className="w-full h-11 font-medium rounded-lg text-white hover:opacity-95 transition-opacity"
                style={{ height: 44, backgroundColor: '#2563EB' }}
                disabled={loading || (deviceWlEnabled && (deviceFpLoading || !deviceVisitorId))}
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t('login.loggingIn')}
                  </span>
                ) : (
                  t('login.submit')
                )}
              </Button>
            </form>

            <p className="mt-4 text-center text-sm text-[#64748B] dark:text-slate-400">
              {t('login.noAccount')}{" "}
              <Link to="/staff/signup" className="text-[#2563EB] font-medium hover:underline">
                {t('login.goSignup')}
              </Link>
            </p>
          </div>

          {/* 移动端底部功能标签 */}
          <div className="lg:hidden px-6 pb-4">
            <div className="grid grid-cols-4 gap-1.5">
              {STAFF_AUTH_MODULE_ITEMS.map(({ key, icon: Icon, color }) => (
                <div
                  key={key}
                  className={`flex flex-col items-center gap-1 py-2 rounded-lg border bg-slate-50 dark:bg-slate-800/50 ${color}`}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span className="font-medium text-[10px] leading-tight text-center">{t(`login.${key}`)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
