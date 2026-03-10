import { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { AlertTriangle, RefreshCw, Check, Wifi, WifiOff, TrendingUp, TrendingDown } from 'lucide-react';
import { toast } from 'sonner';
import { useLanguage } from '@/contexts/LanguageContext';
import { loadSharedData, saveSharedData } from '@/services/sharedDataService';

// Types
export interface UsdtLiveRates {
  bid: number;
  ask: number;
  mid: number;
  source: string;
  lastUpdated: string;
  binanceAvailable: boolean;
  okxAvailable: boolean;
}

export interface UsdtLiveRateConfig {
  enabled: boolean;
  intervalSeconds: number;
  anomalyThresholdPercent: number;
  lastConfirmedMid: number;
  paused: boolean;
  pauseReason: string | null;
}

const DEFAULT_CONFIG: UsdtLiveRateConfig = {
  enabled: false,
  intervalSeconds: 15,
  anomalyThresholdPercent: 2,
  lastConfirmedMid: 0,
  paused: false,
  pauseReason: null,
};

const DEFAULT_RATES: UsdtLiveRates = {
  bid: 0, ask: 0, mid: 0,
  source: 'none',
  lastUpdated: '',
  binanceAvailable: false,
  okxAvailable: false,
};

interface Props {
  onRateUpdate?: (rates: UsdtLiveRates) => void;
  compact?: boolean;
}

export default function UsdtRatePanel({ onRateUpdate, compact = false }: Props) {
  const { t } = useLanguage();
  const [config, setConfig] = useState<UsdtLiveRateConfig>(DEFAULT_CONFIG);
  const [rates, setRates] = useState<UsdtLiveRates>(DEFAULT_RATES);
  const [loading, setLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const configRef = useRef(config);
  configRef.current = config;

  // Load config and cached rates from DB
  useEffect(() => {
    const init = async () => {
      const [savedConfig, savedRates] = await Promise.all([
        loadSharedData<UsdtLiveRateConfig>('usdtLiveRateConfig' as any),
        loadSharedData<UsdtLiveRates>('usdtLiveRates' as any),
      ]);
      if (savedConfig) setConfig({ ...DEFAULT_CONFIG, ...savedConfig });
      if (savedRates) {
        setRates(savedRates);
        onRateUpdate?.(savedRates);
      }
      setInitialized(true);
    };
    init();
  }, []);

  const fetchRates = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    try {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const resp = await fetch(`https://${projectId}.supabase.co/functions/v1/fetch-usdt-rates`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${anonKey}`,
          'apikey': anonKey,
        },
        body: JSON.stringify({
          lastConfirmedMid: configRef.current.lastConfirmedMid,
          anomalyThresholdPercent: configRef.current.anomalyThresholdPercent,
        }),
      });

      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();

      if (data.recommended && data.recommended.mid > 0) {
        const newRates: UsdtLiveRates = {
          bid: data.recommended.bid,
          ask: data.recommended.ask,
          mid: data.recommended.mid,
          source: data.source,
          lastUpdated: data.timestamp,
          binanceAvailable: data.binance?.available ?? false,
          okxAvailable: data.okx?.available ?? false,
        };

        // Anomaly check
        if (data.anomaly) {
          const newConfig = {
            ...configRef.current,
            paused: true,
            pauseReason: `${t('价格变动超过阈值', 'Price change exceeds threshold')}: ${data.anomalyDelta.toFixed(2)}%`,
          };
          setConfig(newConfig);
          await saveSharedData('usdtLiveRateConfig' as any, newConfig);
          toast.warning(t('USDT汇率异常波动，已暂停自动更新', 'USDT rate anomaly detected, auto-update paused'));
        }

        setRates(newRates);
        await saveSharedData('usdtLiveRates' as any, newRates);
        onRateUpdate?.(newRates);

        // Update lastConfirmedMid if no anomaly
        if (!data.anomaly && !configRef.current.paused) {
          const updated = { ...configRef.current, lastConfirmedMid: data.recommended.mid };
          setConfig(updated);
          await saveSharedData('usdtLiveRateConfig' as any, updated);
        }
      } else {
        toast.error(t('未获取到有效汇率数据', 'No valid rate data received'));
      }
    } catch (err) {
      console.error('Failed to fetch USDT rates:', err);
      toast.error(t('USDT汇率获取失败，使用缓存数据', 'Failed to fetch USDT rates, using cached data'));
    } finally {
      setLoading(false);
    }
  }, [loading, onRateUpdate, t]);

  // Auto-polling
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (config.enabled && !config.paused && initialized) {
      fetchRates();
      intervalRef.current = setInterval(fetchRates, config.intervalSeconds * 1000);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [config.enabled, config.paused, config.intervalSeconds, initialized]);

  const updateConfig = async (partial: Partial<UsdtLiveRateConfig>) => {
    const updated = { ...config, ...partial };
    setConfig(updated);
    const ok = await saveSharedData('usdtLiveRateConfig' as any, updated);
    if (!ok) {
      setConfig(config);
      toast.error(t('保存失败', 'Save failed'));
    }
  };

  const handleConfirmRate = () => {
    updateConfig({ paused: false, pauseReason: null, lastConfirmedMid: rates.mid });
    toast.success(t('已确认新汇率', 'New rate confirmed'));
  };

  const formatTime = (iso: string) => {
    if (!iso) return '--';
    return new Date(iso).toLocaleString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  if (compact) {
    return (
      <div className="flex items-center gap-1.5 text-xs flex-wrap">
        {/* Bid/Ask/Mid compact display */}
        <div className="flex items-center gap-1 bg-muted/50 px-2 py-1 rounded-md">
          <span className="text-muted-foreground">{t('买', 'Bid')}</span>
          <span className="font-mono font-semibold text-foreground">{rates.bid > 0 ? rates.bid.toFixed(4) : '--'}</span>
        </div>
        <div className="flex items-center gap-1 bg-primary/10 px-2 py-1 rounded-md border border-primary/20">
          <span className="text-muted-foreground">{t('中', 'Mid')}</span>
          <span className="font-mono font-bold text-primary">{rates.mid > 0 ? rates.mid.toFixed(4) : '--'}</span>
        </div>
        <div className="flex items-center gap-1 bg-muted/50 px-2 py-1 rounded-md">
          <span className="text-muted-foreground">{t('卖', 'Ask')}</span>
          <span className="font-mono font-semibold text-foreground">{rates.ask > 0 ? rates.ask.toFixed(4) : '--'}</span>
        </div>
        {/* Source */}
        {rates.source !== 'none' && (
          <Badge variant="outline" className="text-[10px] h-5 px-1.5">
            {rates.source === 'binance+okx' ? 'B+O' : rates.source === 'binance' ? 'Bin' : rates.source === 'okx' ? 'OKX' : t('缓存', 'Cache')}
          </Badge>
        )}
        {/* Status dots */}
        <div className="flex items-center gap-1">
          <span className={`h-1.5 w-1.5 rounded-full ${rates.binanceAvailable ? 'bg-green-500' : 'bg-destructive'}`} title="Binance" />
          <span className={`h-1.5 w-1.5 rounded-full ${rates.okxAvailable ? 'bg-green-500' : 'bg-destructive'}`} title="OKX" />
        </div>
        {/* Time */}
        <span className="text-muted-foreground hidden sm:inline">{formatTime(rates.lastUpdated)}</span>
        {/* Auto toggle */}
        <Switch
          checked={config.enabled}
          onCheckedChange={(v) => updateConfig({ enabled: v })}
          className="scale-75"
        />
        {/* Refresh */}
        <Button
          size="sm"
          variant="ghost"
          className="h-6 w-6 p-0"
          onClick={fetchRates}
          disabled={loading}
        >
          <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
        </Button>
        {/* Anomaly warning */}
        {config.paused && (
          <div className="flex items-center gap-1">
            <AlertTriangle className="h-3 w-3 text-destructive" />
            <Button size="sm" variant="destructive" className="h-5 text-[10px] px-1.5" onClick={handleConfirmRate}>
              <Check className="h-2.5 w-2.5 mr-0.5" />{t('确认', 'OK')}
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <Card className="border-border/50">
      <CardContent className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">{t('USDT 实时汇率', 'USDT Live Rates')}</h3>
            {rates.source !== 'none' && (
              <Badge variant="outline" className="text-xs">
                {rates.source === 'binance+okx' ? 'Binance + OKX' : rates.source === 'binance' ? 'Binance' : rates.source === 'okx' ? 'OKX' : t('缓存', 'Cached')}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={config.enabled}
              onCheckedChange={(v) => updateConfig({ enabled: v })}
            />
            <Label className="text-xs">{t('自动', 'Auto')}</Label>
          </div>
        </div>

        {/* Anomaly Warning */}
        {config.paused && (
          <div className="flex items-center gap-2 p-2 rounded-md bg-destructive/10 border border-destructive/20">
            <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
            <span className="text-xs text-destructive flex-1">{config.pauseReason}</span>
            <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={handleConfirmRate}>
              <Check className="h-3 w-3 mr-1" />{t('确认', 'Confirm')}
            </Button>
          </div>
        )}

        {/* Rates Display */}
        <div className="grid grid-cols-3 gap-2">
          <div className="text-center p-2 rounded-md bg-muted/50">
            <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
              <TrendingDown className="h-3 w-3" />{t('买入价', 'Bid')}
            </div>
            <div className="text-lg font-bold text-foreground">{rates.bid > 0 ? rates.bid.toFixed(4) : '--'}</div>
          </div>
          <div className="text-center p-2 rounded-md bg-primary/5 border border-primary/20">
            <div className="text-xs text-muted-foreground">{t('中间价', 'Mid')}</div>
            <div className="text-lg font-bold text-primary">{rates.mid > 0 ? rates.mid.toFixed(4) : '--'}</div>
          </div>
          <div className="text-center p-2 rounded-md bg-muted/50">
            <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
              <TrendingUp className="h-3 w-3" />{t('卖出价', 'Ask')}
            </div>
            <div className="text-lg font-bold text-foreground">{rates.ask > 0 ? rates.ask.toFixed(4) : '--'}</div>
          </div>
        </div>

        {/* Source Status & Controls */}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1">
              {rates.binanceAvailable ? <Wifi className="h-3 w-3 text-green-500" /> : <WifiOff className="h-3 w-3 text-destructive" />}
              Binance
            </span>
            <span className="flex items-center gap-1">
              {rates.okxAvailable ? <Wifi className="h-3 w-3 text-green-500" /> : <WifiOff className="h-3 w-3 text-destructive" />}
              OKX
            </span>
          </div>
          <span>{t('更新', 'Updated')}: {formatTime(rates.lastUpdated)}</span>
        </div>

        {/* Controls Row */}
        <div className="flex items-center gap-2">
          <Select
            value={String(config.intervalSeconds)}
            onValueChange={(v) => updateConfig({ intervalSeconds: Number(v) })}
          >
            <SelectTrigger className="h-7 text-xs w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="10">10s</SelectItem>
              <SelectItem value="15">15s</SelectItem>
              <SelectItem value="30">30s</SelectItem>
              <SelectItem value="60">60s</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={String(config.anomalyThresholdPercent)}
            onValueChange={(v) => updateConfig({ anomalyThresholdPercent: Number(v) })}
          >
            <SelectTrigger className="h-7 text-xs w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">1%</SelectItem>
              <SelectItem value="2">2%</SelectItem>
              <SelectItem value="3">3%</SelectItem>
              <SelectItem value="5">5%</SelectItem>
            </SelectContent>
          </Select>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs ml-auto"
            onClick={fetchRates}
            disabled={loading}
          >
            <RefreshCw className={`h-3 w-3 mr-1 ${loading ? 'animate-spin' : ''}`} />
            {t('手动刷新', 'Refresh')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
