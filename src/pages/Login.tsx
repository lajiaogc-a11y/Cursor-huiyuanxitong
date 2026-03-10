import { useState, useEffect } from "react";
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
import { isSupabaseConfigured } from "@/integrations/supabase/client";
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
  const { signIn, isAuthenticated, loading: authLoading } = useAuth();
  const { tr, language, setLanguage } = useLanguage();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);

  const ERROR_CONFIG: Record<string, { icon: typeof AlertCircle; message: string }> = {
    USER_NOT_FOUND: { icon: User, message: tr('login.userNotFound') },
    WRONG_PASSWORD: { icon: KeyRound, message: tr('login.wrongPassword') },
    ACCOUNT_DISABLED: { icon: ShieldX, message: tr('login.accountDisabled') },
    IP_COUNTRY_NOT_ALLOWED: { icon: MapPinOff, message: tr('login.ipNotAllowed') },
    NETWORK_ERROR: { icon: WifiOff, message: tr('login.networkError') },
    TIMEOUT: { icon: WifiOff, message: tr('login.timeout') },
    PASSWORD_SYNC_ERROR: { icon: KeyRound, message: tr('login.passwordSyncError') },
    UNKNOWN: { icon: AlertCircle, message: tr('login.unknownError') },
  };

  useEffect(() => {
    if (isAuthenticated && !authLoading) {
      let from = (location.state as any)?.from?.pathname || "/";
      if (from === "/404" || !from || from === "") from = "/";
      navigate(from, { replace: true });
    }
  }, [isAuthenticated, authLoading, navigate, location]);

  useEffect(() => {
    if (error) setError(null);
  }, [username, password]);

  const parseErrorCode = (message: string): string => {
    if (message?.includes('USER_NOT_FOUND') || message?.includes('账号不存在')) return 'USER_NOT_FOUND';
    if (message?.includes('WRONG_PASSWORD') || message?.includes('密码错误')) return 'WRONG_PASSWORD';
    if (message?.includes('ACCOUNT_DISABLED') || message?.includes('已被禁用')) return 'ACCOUNT_DISABLED';
    if (message?.includes('IP_COUNTRY_NOT_ALLOWED') || message?.includes('区域')) return 'IP_COUNTRY_NOT_ALLOWED';
    if (message?.includes('密码不同步') || message?.includes('认证服务同步失败') || message?.includes('password sync') || message?.includes('out of sync') || message?.includes('Invalid login credentials') || message?.includes('重置密码')) return 'PASSWORD_SYNC_ERROR';
    if (message?.includes('超时') || message?.includes('timeout')) return 'TIMEOUT';
    if (message?.includes('网络') || message?.includes('network') || message?.includes('fetch')) return 'NETWORK_ERROR';
    return 'UNKNOWN';
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!username.trim()) {
      setError({ code: 'VALIDATION', message: tr('login.validationUsername') });
      return;
    }
    if (!password.trim()) {
      setError({ code: 'VALIDATION', message: tr('login.validationPassword') });
      return;
    }
    setLoading(true);
    try {
      const result = await withTimeout(signIn(username.trim(), password), TIMEOUT.AUTH, tr('login.timeout'));
      if (result.success) {
        toast.success(result.message);
        let from = (location.state as any)?.from?.pathname || "/";
        if (from === "/404" || !from || from === "") from = "/";
        navigate(from, { replace: true });
      } else {
        const errorCode = parseErrorCode(result.message);
        const errorConfig = ERROR_CONFIG[errorCode] || ERROR_CONFIG.UNKNOWN;
        setError({ code: errorCode, message: errorConfig.message });
      }
    } catch (err: any) {
      const errorCode = parseErrorCode(err.message);
      const errorConfig = ERROR_CONFIG[errorCode] || ERROR_CONFIG.UNKNOWN;
      setError({ code: errorCode, message: errorConfig.message });
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
                <p className="text-white font-semibold text-lg">{tr('login.title')}</p>
                <p className="text-slate-400 text-sm">{tr('login.titleAlt')}</p>
              </div>
            </div>
            <h1 className="text-2xl xl:text-3xl font-bold text-white mb-4 leading-tight">
              {tr('login.heroTitle')}
            </h1>
            <p className="text-slate-300 text-sm xl:text-base leading-relaxed">
              {tr('login.heroSlogan')}
            </p>
            <div className="grid grid-cols-2 gap-3 mt-8">
              {MODULE_ITEMS.map(({ key, icon: Icon, color }) => (
                <div
                  key={key}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl border bg-white/5 backdrop-blur-sm transition-all hover:bg-white/10 ${color}`}
                >
                  <Icon className="h-5 w-5 shrink-0" />
                  <span className="font-medium text-sm">{tr(`login.${key}`)}</span>
                </div>
              ))}
            </div>
          </div>
          <p className="text-slate-500 text-xs mt-auto pt-6">
            {tr('login.copyright')}
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
                <h1 className="text-xl font-bold text-[#1e293b] dark:text-white">{tr('login.title')}</h1>
                <p className="text-[#64748B] dark:text-slate-400 text-sm">{tr('login.subtitle')}</p>
              </div>
            </div>
            <p className="text-slate-600 dark:text-slate-300 text-sm mb-4 leading-relaxed">
              {tr('login.heroSlogan')}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {MODULE_ITEMS.map(({ key, icon: Icon, color }) => (
                <div
                  key={key}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border bg-slate-50 dark:bg-slate-800/50 transition-all ${color}`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="font-medium text-xs">{tr(`login.${key}`)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 桌面端标题 */}
          <div className="hidden lg:block mb-8">
            <h1 className="text-2xl font-bold text-[#1e293b] dark:text-white">
              {tr('login.title')}
            </h1>
            <p className="text-[#64748B] dark:text-slate-400 text-sm mt-1">
              {tr('login.subtitle')}
            </p>
          </div>

          {/* 登录/注册 Tab */}
          <div className="flex gap-1 p-1 rounded-lg bg-[#f1f5f9] dark:bg-slate-700/50 mb-6">
            <span className="flex-1 py-2.5 text-center text-sm font-medium text-[#1e293b] dark:text-white bg-white dark:bg-slate-600/50 rounded-md shadow-sm">
              {tr('login.submit')}
            </span>
            <Link
              to="/signup"
              className="flex-1 py-2.5 text-center text-sm font-medium text-[#64748B] dark:text-slate-400 hover:text-[#334155] dark:hover:text-slate-200 rounded-md transition-colors"
            >
              {tr('login.goSignup')}
            </Link>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            {!isSupabaseConfigured && (
              <Alert variant="default" className="bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <AlertDescription className="ml-2 text-sm">
                  请先在 .env 中配置 Supabase：VITE_SUPABASE_URL 和 VITE_SUPABASE_PUBLISHABLE_KEY（在 supabase.com 项目设置中获取）
                </AlertDescription>
              </Alert>
            )}
            {error && (
              <Alert variant="destructive" className="bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300">
                <ErrorIcon className="h-4 w-4 shrink-0" />
                <AlertDescription className="ml-2 text-sm">{error.message}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="username" className="text-sm font-medium text-[#334155] dark:text-slate-300">
                {tr('login.username')}
              </Label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#94a3b8] dark:text-slate-500" />
                <Input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder={tr('login.usernamePlaceholder')}
                  className="pl-10 h-11 rounded-lg border-[#e2e8f0] dark:border-slate-600 dark:bg-slate-700/50 dark:text-white dark:placeholder:text-slate-500 focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20"
                  style={{ height: 44 }}
                  autoComplete="username"
                  disabled={loading}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium text-[#334155] dark:text-slate-300">
                {tr('login.password')}
              </Label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#94a3b8] dark:text-slate-500" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={tr('login.passwordPlaceholder')}
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
              type="submit"
              className="w-full h-11 mt-1 font-medium rounded-lg text-white hover:opacity-95 transition-opacity"
              style={{ height: 44, backgroundColor: '#2563EB' }}
              disabled={loading}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {tr('login.loggingIn')}
                </span>
              ) : (
                tr('login.submit')
              )}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-[#64748B] dark:text-slate-400">
            {tr('login.noAccount')}{" "}
            <Link to="/signup" className="text-[#2563EB] font-medium hover:underline">
              {tr('login.goSignup')}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
