import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Lock, User, AlertCircle, Loader2, WifiOff, ShieldX, KeyRound, MapPinOff, Globe, Eye, EyeOff, ShoppingCart, Users, BarChart3, Wallet } from "lucide-react";
import { toast } from "sonner";
import { GCLogo } from "@/components/GCLogo";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { withTimeout, TIMEOUT } from "@/lib/withTimeout";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const MODULE_ITEMS = [
  { key: 'moduleOrders', icon: ShoppingCart, color: 'text-blue-400 border-blue-400/50' },
  { key: 'moduleMembers', icon: Users, color: 'text-emerald-400 border-emerald-400/50' },
  { key: 'moduleReports', icon: BarChart3, color: 'text-violet-400 border-violet-400/50' },
  { key: 'moduleSettlement', icon: Wallet, color: 'text-amber-400 border-amber-400/50' },
] as const;

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signIn, isAuthenticated, loading: authLoading, employee } = useAuth();
  const { t, language, setLanguage } = useLanguage();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const redirectingRef = useRef(false);

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
    UNKNOWN: { icon: AlertCircle, message: t('login.unknownError') },
  };

  const resolveAfterLoginPath = (fromPath?: string, user?: { is_platform_super_admin?: boolean } | null) => {
    const from = fromPath || "";
    const isAdminPath = from.startsWith("/staff/admin");
    const isPlatformSuperAdmin = !!(user?.is_platform_super_admin ?? employee?.is_platform_super_admin);

    // 平台总管理员：无条件锁定到平台后台
    if (isPlatformSuperAdmin) return "/staff/admin/tenants";

    // 非平台账号：禁止落到平台后台路径
    if (isAdminPath) return "/staff";
    if (from === "/404" || !from || from === "/" || from === "") return "/staff";
    return from;
  };

  useEffect(() => {
    if (!isAuthenticated) {
      redirectingRef.current = false;
      return;
    }
    if (isAuthenticated && !authLoading && !redirectingRef.current) {
      redirectingRef.current = true;
      const fromPath = (location.state as any)?.from?.pathname || "";
      navigate(resolveAfterLoginPath(fromPath), { replace: true });
    }
  }, [isAuthenticated, authLoading, navigate, location, employee?.is_platform_super_admin]);

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
    if (message?.includes('Internal Server Error') || message?.includes('服务器异常') || message?.includes('服务器错误') || message?.includes('SUPABASE_SERVICE_ROLE_KEY') || message?.includes('后端配置')) return 'SERVER_ERROR';
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
    setLoading(true);
    try {
      const result = await withTimeout(signIn(username.trim(), password), TIMEOUT.AUTH, t('login.timeout'));
      if (result.success) {
        toast.success(result.message);
        const fromPath = (location.state as any)?.from?.pathname || "";
        const target = resolveAfterLoginPath(fromPath, result.user);
        redirectingRef.current = true;
        navigate(target, { replace: true });
        return;
      } else {
        const errorCode = parseErrorCode(result.message);
        const errorConfig = ERROR_CONFIG[errorCode] || ERROR_CONFIG.UNKNOWN;
        const useBackendMessage = ['ACCOUNT_LOCKED', 'MAINTENANCE_MODE', 'SERVER_ERROR'].includes(errorCode)
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
    <div className="min-h-screen flex items-center justify-center p-6 bg-[#F6F8FB] dark:bg-[#0f172a] relative">
      {/* 背景纹理 */}
      <div
        className="absolute inset-0 opacity-[0.08] dark:opacity-[0.06] pointer-events-none"
        style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, currentColor 0.5px, transparent 0)',
          backgroundSize: '24px 24px',
        }}
      />

      {/* 语言切换 */}
      <div className="absolute top-5 right-5 z-10">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-9 gap-2 text-[#64748B] hover:text-[#334155] hover:bg-white/80 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-white/10">
              <Globe className="h-4 w-4" />
              {language === 'zh' ? '中文' : 'English'}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onSelect={() => setLanguage('zh')}
              className={language === 'zh' ? 'bg-accent' : ''}
            >
              中文
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => setLanguage('en')}
              className={language === 'en' ? 'bg-accent' : ''}
            >
              English
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* 居中双卡片布局 - 无缝隙合并，整体圆角 */}
      <div className="flex flex-col lg:flex-row items-center justify-center w-full max-w-[900px] overflow-hidden rounded-2xl shadow-xl">
        {/* 左侧广告卡片 - 桌面端 */}
        <div className="hidden lg:flex flex-col flex-1 min-w-0 lg:min-w-[380px] p-8 xl:p-10 bg-gradient-to-br from-[#0f172a] via-[#1e293b] to-[#0f172a] min-h-[520px]">
          <div className="flex-1 flex flex-col justify-center">
            <div className="flex items-center gap-3 mb-10">
              <GCLogo size={44} variant="light" />
              <div>
                <p className="text-white font-semibold text-lg">{t('login.title')}</p>
                <p className="text-slate-400 text-sm">{t('login.titleAlt')}</p>
              </div>
            </div>
            <h1 className="text-2xl xl:text-3xl font-bold text-white mb-4 leading-tight">
              {t('login.heroTitle')}
            </h1>
            <p className="text-slate-300 text-sm xl:text-base leading-relaxed">
              {t('login.heroSlogan')}
            </p>
            <div className="grid grid-cols-2 gap-3 mt-8">
              {MODULE_ITEMS.map(({ key, icon: Icon, color }) => (
                <div
                  key={key}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl border bg-white/5 backdrop-blur-sm transition-all hover:bg-white/10 ${color}`}
                >
                  <Icon className="h-5 w-5 shrink-0" />
                  <span className="font-medium text-sm">{t(`login.${key}`)}</span>
                </div>
              ))}
            </div>
          </div>
          <p className="text-slate-500 text-xs mt-auto pt-6">
            {t('login.copyright')}
          </p>
        </div>

        {/* 右侧登录卡片 - 与左侧无缝衔接 */}
        <div
          className="relative w-full lg:min-w-[380px] flex-1 p-8 xl:p-10 bg-white dark:bg-slate-800/90 dark:border-l dark:border-slate-700/50"
        >
          {/* 移动端/平板端：广告内容 + Logo（与桌面端左侧一致） */}
          <div className="lg:hidden mb-6 pb-6 border-b border-slate-200 dark:border-slate-600">
            <div className="flex items-center gap-3 mb-4">
              <GCLogo size={40} />
              <div>
                <h1 className="text-xl font-bold text-[#1e293b] dark:text-white">{t('login.title')}</h1>
                <p className="text-[#64748B] dark:text-slate-400 text-sm">{t('login.subtitle')}</p>
              </div>
            </div>
            <p className="text-slate-600 dark:text-slate-300 text-sm mb-4 leading-relaxed">
              {t('login.heroSlogan')}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {MODULE_ITEMS.map(({ key, icon: Icon, color }) => (
                <div
                  key={key}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border bg-slate-50 dark:bg-slate-800/50 transition-all ${color}`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="font-medium text-xs">{t(`login.${key}`)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 桌面端标题 */}
          <div className="hidden lg:block mb-8">
            <h1 className="text-2xl font-bold text-[#1e293b] dark:text-white">
              {t('login.title')}
            </h1>
            <p className="text-[#64748B] dark:text-slate-400 text-sm mt-1">
              {t('login.subtitle')}
            </p>
          </div>

          {/* 登录/注册 Tab */}
          <div className="flex gap-1 p-1 rounded-lg bg-[#f1f5f9] dark:bg-slate-700/50 mb-6">
            <span className="flex-1 py-2.5 text-center text-sm font-medium text-[#1e293b] dark:text-white bg-white dark:bg-slate-600/50 rounded-md shadow-sm">
              {t('login.submit')}
            </span>
            <Link
              to="/staff/signup"
              className="flex-1 py-2.5 text-center text-sm font-medium text-[#64748B] dark:text-slate-400 hover:text-[#334155] dark:hover:text-slate-200 rounded-md transition-colors"
            >
              {t('login.goSignup')}
            </Link>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleLogin(e);
            }}
            className="space-y-5"
          >
            {error && (
              <Alert variant="destructive" className="bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300">
                <ErrorIcon className="h-4 w-4 shrink-0" />
                <AlertDescription className="ml-2 text-sm">{error.message}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
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

            <div className="space-y-2">
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

            <Button
              type="button"
              onClick={() => void handleLogin({ preventDefault: () => {} } as React.FormEvent)}
              className="w-full h-11 mt-1 font-medium rounded-lg text-white hover:opacity-95 transition-opacity"
              style={{ height: 44, backgroundColor: '#2563EB' }}
              disabled={loading}
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

          <p className="mt-6 text-center text-sm text-[#64748B] dark:text-slate-400">
            {t('login.noAccount')}{" "}
            <Link to="/staff/signup" className="text-[#2563EB] font-medium hover:underline">
              {t('login.goSignup')}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
