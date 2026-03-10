import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Lock, User, UserPlus, Loader2, Wifi, WifiOff, RefreshCw, Eye, EyeOff, ShieldCheck, Ticket } from "lucide-react";
import { toast } from "sonner";
import { validatePassword, getPasswordStrength } from "@/lib/passwordValidation";
import { GCLogo } from "@/components/GCLogo";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";

export default function Signup() {
  const navigate = useNavigate();
  const { t, tr } = useLanguage();
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
      const { data, error } = await supabase
        .from('employees')
        .select('id')
        .limit(1);
      
      if (error) {
        console.error('Check first user error:', error);
        setIsFirstUser(false);
        return;
      }
      
      setIsFirstUser(!data || data.length === 0);
    } catch {
      setIsFirstUser(false);
    }
  };

  const checkNetwork = async () => {
    setNetworkStatus('checking');
    const startTime = Date.now();
    
    try {
      const { error } = await supabase
        .from('currencies')
        .select('id')
        .limit(1);
      
      if (error) {
        console.error('Network check error:', error);
        setNetworkStatus('error');
        return;
      }
      
      const latency = Date.now() - startTime;
      setNetworkLatency(latency);
      setNetworkStatus('ok');
    } catch (err) {
      console.error('Network check failed:', err);
      setNetworkStatus('error');
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!username.trim()) {
      toast.error(tr('signup.fillUsername'));
      return;
    }

    if (!realName.trim()) {
      toast.error(tr('signup.fillRealName'));
      return;
    }

    if (!password.trim()) {
      toast.error(tr('signup.fillPassword'));
      return;
    }

    const passwordCheck = validatePassword(password);
    if (!passwordCheck.valid) {
      toast.error(passwordCheck.errors[0]);
      return;
    }

    if (password !== confirmPassword) {
      toast.error(tr('signup.passwordMismatch'));
      return;
    }

    // Non-first user must provide invitation code
    if (!isFirstUser && !invitationCode.trim()) {
      toast.error(t('请输入邀请码', 'Please enter invitation code'));
      return;
    }

    setLoading(true);

    try {
      const response = await supabase.rpc('signup_employee', {
        p_username: username.trim(),
        p_password: password,
        p_real_name: realName.trim(),
        p_invitation_code: isFirstUser ? null : invitationCode.trim(),
      });

      if (response.error) {
        console.error('Signup RPC error:', response.error);
        toast.error(tr('signup.signupFailed') + ": " + response.error.message);
        return;
      }

      if (!response.data || response.data.length === 0) {
        toast.error(tr('signup.signupFailed'));
        return;
      }

      const result = response.data[0];

      if (!result.success) {
        switch (result.error_code) {
          case 'USERNAME_EXISTS':
            toast.error(tr('signup.usernameExists'));
            break;
          case 'INVITATION_CODE_REQUIRED':
            toast.error(t('请输入邀请码', 'Invitation code is required'));
            break;
          case 'INVALID_INVITATION_CODE':
            toast.error(t('邀请码无效', 'Invalid invitation code'));
            break;
          case 'INVITATION_CODE_EXPIRED':
            toast.error(t('邀请码已过期', 'Invitation code has expired'));
            break;
          case 'INVITATION_CODE_USED':
            toast.error(t('邀请码已被使用完', 'Invitation code usage limit reached'));
            break;
          default:
            toast.error(tr('signup.signupFailed'));
        }
        return;
      }

      if (result.assigned_status === 'active') {
        toast.success(tr('signup.signupSuccessAdmin'));
      } else {
        toast.success(tr('signup.signupSuccessPending'));
      }
      navigate('/login');
    } catch (error: any) {
      console.error('Signup error:', error);
      toast.error(error.message || tr('signup.signupFailed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-login-gradient">
      <Card className="w-full max-w-md mx-4 shadow-2xl border-login-card bg-login-card backdrop-blur">
        <CardHeader className="text-center pb-2">
          {/* Network status indicator */}
          <div className="flex items-center justify-center gap-2 mb-4">
            {networkStatus === 'checking' && (
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>{tr('signup.checkingNetwork')}</span>
              </div>
            )}
            {networkStatus === 'ok' && (
              <div className="flex items-center gap-2 text-green-500 dark:text-green-400 text-sm">
                <Wifi className="h-4 w-4" />
                <span>{tr('signup.networkOk')} ({networkLatency}ms)</span>
              </div>
            )}
            {networkStatus === 'error' && (
              <div className="flex items-center gap-2 text-destructive text-sm">
                <WifiOff className="h-4 w-4" />
                <span>{tr('signup.networkError')}</span>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={checkNetwork}
                  className="h-6 px-2 text-destructive hover:text-destructive/80"
                >
                  <RefreshCw className="h-3 w-3" />
                </Button>
              </div>
            )}
          </div>
          
          <div className="mx-auto w-16 h-16 flex items-center justify-center mb-4">
            <GCLogo size={48} />
          </div>
          <CardTitle className="text-2xl font-bold text-login-foreground">{tr('signup.title')}</CardTitle>
          <p className="text-muted-foreground mt-2">{tr('signup.subtitle')}</p>
        </CardHeader>
        <CardContent className="pt-6">
          <form onSubmit={handleSignup} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username" className="text-login-label">{tr('signup.username')}</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder={tr('signup.usernamePlaceholder')}
                  className="pl-10 bg-login-input border-login-border text-login-foreground placeholder:text-muted-foreground/60"
                  autoComplete="username"
                  disabled={loading}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="realName" className="text-login-label">{tr('signup.realName')}</Label>
              <div className="relative">
                <UserPlus className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="realName"
                  type="text"
                  value={realName}
                  onChange={(e) => setRealName(e.target.value)}
                  placeholder={tr('signup.realNamePlaceholder')}
                  className="pl-10 bg-login-input border-login-border text-login-foreground placeholder:text-muted-foreground/60"
                  disabled={loading}
                />
              </div>
            </div>

            {/* Invitation Code - only show for non-first users */}
            {isFirstUser === false && (
              <div className="space-y-2">
                <Label htmlFor="invitationCode" className="text-login-label">
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
                    className="pl-10 bg-login-input border-login-border text-login-foreground placeholder:text-muted-foreground/60 font-mono tracking-wider"
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
              <Label htmlFor="password" className="text-login-label">{tr('signup.password')}</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={tr('signup.passwordPlaceholder')}
                  className="pl-10 pr-10 bg-login-input border-login-border text-login-foreground placeholder:text-muted-foreground/60"
                  autoComplete="new-password"
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword" className="text-login-label">{tr('signup.confirmPassword')}</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder={tr('signup.confirmPasswordPlaceholder')}
                  className="pl-10 pr-10 bg-login-input border-login-border text-login-foreground placeholder:text-muted-foreground/60"
                  autoComplete="new-password"
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
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
              className="w-full mt-6"
              size="lg"
              disabled={loading}
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {tr('signup.registering')}
                </span>
              ) : tr('signup.submit')}
            </Button>
          </form>
          <div className="mt-6 text-center">
            <span className="text-muted-foreground">{tr('signup.haveAccount')}</span>
            <Link to="/login" className="text-primary hover:underline ml-2">
              {tr('signup.goLogin')}
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
