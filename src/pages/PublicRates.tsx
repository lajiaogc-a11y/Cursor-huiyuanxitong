import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, TrendingUp, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { GCLogo } from '@/components/GCLogo';
import { EXTERNAL_API } from '@/config/externalApis';

interface Rates {
  usdToNgn: number;
  usdToGhs: number;
  usdtRate: number;
  lastUpdated: string;
}

let _ratesCache: Rates | null = null;

export default function PublicRates() {
  const [rates, setRates] = useState<Rates | null>(_ratesCache);
  const [loading, setLoading] = useState(!_ratesCache);

  const fetchRates = async () => {
    setLoading(true);
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 10_000);
      const res = await fetch(EXTERNAL_API.EXCHANGE_RATE_USD_ER_API, { signal: ctrl.signal });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.result === 'success' && data.rates) {
        const r: Rates = {
          usdToNgn: data.rates.NGN || 0,
          usdToGhs: data.rates.GHS || 0,
          usdtRate: 0.98,
          lastUpdated: new Date().toISOString(),
        };
        setRates(r);
        _ratesCache = r;
      }
    } catch (err) {
      console.warn('[PublicRates] fetchRates failed:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchRates(); }, []);

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white flex flex-col items-center justify-center p-6">
      <div className="max-w-lg w-full space-y-6">
        <div className="text-center space-y-2">
          <div className="mx-auto mb-4">
            <GCLogo size={48} />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">实时汇率</h1>
          <p className="text-slate-400 text-sm">Live Exchange Rates</p>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <RefreshCw className="h-8 w-8 animate-spin text-slate-400" />
          </div>
        ) : rates ? (
          <div className="space-y-4">
            <Card className="bg-white/5 border-white/10 backdrop-blur-sm">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30">USD → NGN</Badge>
                  </div>
                  <TrendingUp className="h-4 w-4 text-emerald-400" />
                </div>
                <p className="text-4xl font-bold tabular-nums">
                  ₦ {rates.usdToNgn.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
                <p className="text-xs text-slate-500 mt-1">1 USD = {rates.usdToNgn.toFixed(2)} NGN</p>
              </CardContent>
            </Card>

            <Card className="bg-white/5 border-white/10 backdrop-blur-sm">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/30">USD → GHS</Badge>
                  <TrendingUp className="h-4 w-4 text-blue-400" />
                </div>
                <p className="text-4xl font-bold tabular-nums">
                  ₵ {rates.usdToGhs.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
                <p className="text-xs text-slate-500 mt-1">1 USD = {rates.usdToGhs.toFixed(2)} GHS</p>
              </CardContent>
            </Card>

            <Card className="bg-white/5 border-white/10 backdrop-blur-sm">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30">USD → USDT</Badge>
                  <TrendingUp className="h-4 w-4 text-amber-400" />
                </div>
                <p className="text-4xl font-bold tabular-nums">
                  $ {rates.usdtRate.toFixed(4)}
                </p>
                <p className="text-xs text-slate-500 mt-1">1 USD ≈ {rates.usdtRate} USDT</p>
              </CardContent>
            </Card>

            <div className="flex items-center justify-between text-xs text-slate-500">
              <div className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatTime(rates.lastUpdated)}
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-slate-400 hover:text-white hover:bg-white/10"
                onClick={fetchRates}
              >
                <RefreshCw className="h-3 w-3 mr-1" />
                刷新 Refresh
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-center text-slate-400">无法获取汇率数据</p>
        )}

        <p className="text-center text-[11px] text-slate-600 mt-8">
          © {new Date().getFullYear()} FastGC · Powered by Open Exchange Rates
        </p>
      </div>
    </div>
  );
}
