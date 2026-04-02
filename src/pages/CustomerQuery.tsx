import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Search, ShoppingCart, Star, ArrowLeft, Loader2 } from 'lucide-react';
import { GCLogo } from '@/components/GCLogo';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTenantView } from '@/contexts/TenantViewContext';
import { getCustomerDetailByPhoneApi } from '@/services/members/membersApiService';
import { getMyTenantOrdersFull, getMyTenantUsdtOrdersFull, getTenantOrdersFull, getTenantUsdtOrdersFull } from '@/services/tenantService';
import { formatBeijingDate } from '@/lib/beijingTime';

interface QueryResult {
  memberCode: string;
  phone: string;
  points: number;
  orderCount: number;
  recentOrders: { order_number: string; status: string; created_at: string; amount: number; currency: string }[];
}

export default function CustomerQuery() {
  const { t, language } = useLanguage();
  const { employee } = useAuth();
  const { viewingTenantId } = useTenantView() || {};
  const effectiveTenantId = viewingTenantId || employee?.tenant_id || null;
  const useMyTenantRpc = !!(effectiveTenantId && employee?.tenant_id && effectiveTenantId === employee.tenant_id);
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState('');

  const handleQuery = async () => {
    if (!phone || phone.length < 6) {
      setError(t('请输入有效的手机号', 'Please enter a valid phone number'));
      return;
    }
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const detail = await getCustomerDetailByPhoneApi(phone, effectiveTenantId);
      const member = detail.member;
      
      if (!member) {
        setError(t('未找到该手机号对应的会员记录', 'No member found with this phone number'));
        setLoading(false);
        return;
      }

      const [normalOrders, usdtOrders] = (effectiveTenantId && !useMyTenantRpc)
        ? await Promise.all([getTenantOrdersFull(effectiveTenantId), getTenantUsdtOrdersFull(effectiveTenantId)])
        : await Promise.all([getMyTenantOrdersFull(), getMyTenantUsdtOrdersFull()]);
      const recentOrders = [...(normalOrders || []), ...(usdtOrders || [])]
        .filter((order: any) =>
          !order.is_deleted &&
          (order.member_id === member.id || order.phone_number === member.phone_number)
        )
        .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 5)
        .map((order: any) => ({
          order_number: order.order_number,
          status: order.status,
          created_at: order.created_at,
          amount: Number(order.amount) || Number(order.actual_payment) || 0,
          currency: order.currency,
        }));

      setResult({
        memberCode: member.member_code,
        phone: member.phone_number,
        points: detail.activity?.remaining_points || 0,
        orderCount: detail.activity?.order_count || 0,
        recentOrders,
      });
    } catch {
      setError(t('查询失败，请稍后重试', 'Query failed, please try again'));
    } finally {
      setLoading(false);
    }
  };

  const statusMap: Record<string, { zh: string; en: string; variant: 'default' | 'secondary' | 'destructive' }> = {
    completed: { zh: '已完成', en: 'Completed', variant: 'default' },
    pending: { zh: '待处理', en: 'Pending', variant: 'secondary' },
    cancelled: { zh: '已取消', en: 'Cancelled', variant: 'destructive' },
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white flex flex-col items-center justify-center p-6">
      <div className="max-w-md w-full space-y-6">
        <div className="text-center space-y-2">
          <div className="mx-auto mb-4">
            <GCLogo size={48} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">{t('会员自助查询', 'Member Self-Service Query')}</h1>
        </div>

        {!result ? (
          <Card className="bg-white/5 border-white/10 backdrop-blur-sm">
            <CardContent className="p-6 space-y-4">
              <div className="space-y-2">
                <label className="text-sm text-slate-300">{t('手机号', 'Phone Number')}</label>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder={t("请输入手机号...", "Enter phone number...")}
                  className="bg-white/10 border-white/20 text-white placeholder:text-slate-500 h-12 text-base"
                  onKeyDown={(e) => e.key === 'Enter' && handleQuery()}
                />
              </div>
              {error && <p className="text-sm text-red-400">{error}</p>}
              <Button
                className="w-full h-11"
                onClick={handleQuery}
                disabled={loading}
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Search className="h-4 w-4 mr-2" />}
                {t('查询', 'Query')}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            <Card className="bg-white/5 border-white/10 backdrop-blur-sm">
              <CardContent className="p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-400">{t('会员编号', 'Member Code')}</span>
                  <span className="font-mono font-bold">{result.memberCode}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-400">{t('手机号', 'Phone Number')}</span>
                  <span>{result.phone}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Star className="h-4 w-4 text-amber-400" />
                    <span className="text-sm text-slate-400">{t('可用积分', 'Available Points')}</span>
                  </div>
                  <span className="text-xl font-bold text-amber-300">{result.points}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <ShoppingCart className="h-4 w-4 text-blue-400" />
                    <span className="text-sm text-slate-400">{t('累计订单', 'Total Orders')}</span>
                  </div>
                  <span className="font-bold">{result.orderCount}</span>
                </div>
              </CardContent>
            </Card>

            {result.recentOrders.length > 0 && (
              <Card className="bg-white/5 border-white/10 backdrop-blur-sm">
                <CardContent className="p-5">
                  <h3 className="text-sm font-medium text-slate-300 mb-3">{t('最近订单', 'Recent Orders')}</h3>
                  <div className="space-y-2.5">
                    {result.recentOrders.map((o) => {
                      const s = statusMap[o.status] || statusMap.pending;
                      return (
                        <div key={o.order_number} className="flex items-center justify-between text-sm border-b border-white/5 pb-2 last:border-0">
                          <div>
                            <p className="font-mono text-xs">{o.order_number}</p>
                            <p className="text-[11px] text-slate-500">{formatBeijingDate(o.created_at)}</p>
                          </div>
                          <div className="text-right flex items-center gap-2">
                            <span className="text-xs">{o.amount} {o.currency}</span>
                            <Badge variant={s.variant} className="text-[10px] h-5">
                              {language === 'zh' ? s.zh : s.en}
                            </Badge>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            <Button
              variant="ghost"
              className="w-full text-slate-400 hover:text-white hover:bg-white/10"
              onClick={() => { setResult(null); setPhone(''); }}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              {t('返回查询', 'Back')}
            </Button>
          </div>
        )}

        <p className="text-center text-[11px] text-slate-600 mt-8">
          © {new Date().getFullYear()} FastGC
        </p>
      </div>
    </div>
  );
}
