import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Clock, LogOut, RefreshCw, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { GCLogo } from "@/components/GCLogo";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";

export default function PendingAuthorization() {
  const navigate = useNavigate();
  const { signOut, employee } = useAuth();
  const { t } = useLanguage();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleLogout = async () => {
    await signOut();
    navigate('/staff/login');
  };

  const handleRefresh = async () => {
    if (!employee?.id) {
      toast.error(t('pending.cannotGetUser'));
      return;
    }
    
    setIsRefreshing(true);
    try {
      const { data: emp, error } = await supabase
        .from('employees')
        .select('status')
        .eq('id', employee.id)
        .single();
      
      if (error) throw error;
      
      if (emp?.status === 'active') {
        toast.success(t('pending.approved'));
        navigate('/staff', { replace: true });
      } else {
        toast.info(t('pending.stillPending'));
      }
    } catch (error) {
      console.error('Failed to check status:', error);
      toast.error(t('pending.checkFailed'));
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-login-gradient">
      <Card className="w-full max-w-md mx-4 shadow-2xl border-login-card bg-login-card backdrop-blur">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto w-16 h-16 bg-warning/20 rounded-full flex items-center justify-center mb-4">
            <Clock className="h-8 w-8 text-warning" />
          </div>
          <CardTitle className="text-2xl font-bold text-login-foreground">{t('pending.title')}</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="text-center space-y-4">
            <p className="text-foreground">
              {t('pending.greeting')}{employee?.real_name ? `，${employee.real_name}` : ''}！
            </p>
            <p className="text-muted-foreground">
              {t('pending.accountCreated')}
            </p>
            <p className="text-muted-foreground text-sm">
              {t('pending.approvedMessage')}
            </p>
            
            <div className="pt-4 space-y-3">
              <Button
                onClick={handleRefresh}
                variant="outline"
                disabled={isRefreshing}
                className="w-full"
              >
                {isRefreshing ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                {isRefreshing ? t('pending.checking') : t('pending.refreshStatus')}
              </Button>
              <Button
                onClick={handleLogout}
                variant="ghost"
                className="w-full text-muted-foreground hover:text-foreground"
              >
                <LogOut className="h-4 w-4 mr-2" />
                {t('pending.logout')}
              </Button>
            </div>
          </div>
          
          <div className="mt-8 pt-6 border-t border-border">
            <div className="flex items-center justify-center gap-2 text-muted-foreground text-sm">
              <GCLogo size={20} />
              <span>{t('login.title')}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
