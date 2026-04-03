import { useState, useEffect, useSyncExternalStore, useMemo, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { AlertTriangle, RefreshCw, Check, Wifi, WifiOff, TrendingUp, TrendingDown } from 'lucide-react';
import { notify } from "@/lib/notifyHub";
import { useLanguage } from '@/contexts/LanguageContext';
import { loadSharedData, saveSharedData } from '@/services/finance/sharedDataService';
import { fetchUsdtRatesViaApi } from '@/services/finance/marketRatesService';
import { formatBeijingTimeOnly } from '@/lib/beijingTime';
import { pickBilingual } from '@/lib/appLocale';

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

/** 可选自动采集间隔（秒），最小 15s、最大 24h */
export const USDT_RATE_INTERVAL_PRESETS = [15, 30, 60, 120, 180, 300, 600, 900, 1800, 3600, 7200, 14400] as const;

const MIN_INTERVAL_SEC = 15;
const MAX_INTERVAL_SEC = 86400;

function clampIntervalSec(sec: number): number {
  const n = Number(sec);
  if (!Number.isFinite(n)) return 600;
  return Math.min(MAX_INTERVAL_SEC, Math.max(MIN_INTERVAL_SEC, Math.round(n)));
}

const DEFAULT_CONFIG: UsdtLiveRateConfig = {
  enabled: false,
  intervalSeconds: 600,
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

// ============================================================================
// Global singleton: rate fetching runs independently of component lifecycle
// ============================================================================

function _tGlobal(zh: string, en: string): string {
  return pickBilingual(zh, en);
}

let _rates: UsdtLiveRates = { ...DEFAULT_RATES };
let _config: UsdtLiveRateConfig = { ...DEFAULT_CONFIG };
let _lastFetchTime = 0;
let _fetching = false;
let _timerId: ReturnType<typeof setInterval> | null = null;
let _initDone = false;
let _initPromise: Promise<void> | null = null;
const _listeners = new Set<() => void>();
let _snapshotVersion = 0;

function bumpUsdtRatesSnapshot() {
  _snapshotVersion++;
  _listeners.forEach(fn => fn());
}

function subscribe(fn: () => void) {
  _listeners.add(fn);
  return () => { _listeners.delete(fn); };
}

function getSnapshot() {
  return _snapshotVersion;
}

async function _doFetch(force: boolean, opts?: { silent?: boolean }) {
  if (_fetching) return;

  const intervalMs = clampIntervalSec(_config.intervalSeconds) * 1000;
  if (!force && _lastFetchTime > 0 && Date.now() - _lastFetchTime < intervalMs - 5000) {
    return;
  }

  _fetching = true;
  bumpUsdtRatesSnapshot();

  try {
    const data = (await fetchUsdtRatesViaApi({
      lastConfirmedMid: _config.lastConfirmedMid,
      anomalyThresholdPercent: _config.anomalyThresholdPercent,
    })) as any;

    if (data.success !== false && (data.mid > 0 || data.data?.mid > 0)) {
      const d = data.data || data;
      // 后端：avgBuy=收购侧(你卖USDT，CNY/USDT 较高)；avgSell=出售侧(你买USDT，CNY/USDT 较低)
      // 内部 bid/ask 与盘口一致：bid 低、ask 高。界面「买入价」= ask，「卖出价」= bid（卖价 < 买价）
      const newRates: UsdtLiveRates = {
        bid: d.avgSell || d.mid,
        ask: d.avgBuy || d.mid,
        mid: d.mid,
        source: (d.sources || []).map((s: any) => s.name).join(', ') || 'API',
        lastUpdated: d.fetchedAt || new Date().toISOString(),
        binanceAvailable: (d.sources || []).some((s: any) => s.name?.includes('Binance')),
        okxAvailable: (d.sources || []).some((s: any) => s.name?.includes('OKX')),
      };

      if (d.anomaly) {
        _config = { ..._config, paused: true, pauseReason: d.anomalyMessage || _tGlobal('价格变动超过阈值', 'Price change exceeds threshold') };
        saveSharedData('usdtLiveRateConfig' as any, _config);
        notify.warning(_tGlobal('USDT汇率异常波动，已暂停自动更新', 'USDT rate fluctuation detected, auto-update paused'));
        _stopTimer();
      }

      _rates = newRates;
      _lastFetchTime = Date.now();
      saveSharedData('usdtLiveRates' as any, newRates);

      if (!d.anomaly && !_config.paused) {
        _config = { ..._config, lastConfirmedMid: d.mid };
        saveSharedData('usdtLiveRateConfig' as any, _config);
      }

      // 定时自动采集不弹成功 Toast，避免「一直在弹」的干扰；手动刷新仍提示
      if (!opts?.silent) {
        notify.success(_tGlobal(`汇率已更新: ¥${d.mid.toFixed(4)} (来源: ${newRates.source})`, `Rate updated: ¥${d.mid.toFixed(4)} (source: ${newRates.source})`));
      }
    } else {
      notify.error(_tGlobal('未获取到有效汇率数据', 'No valid rate data retrieved'));
    }
  } catch (err) {
    console.error('Failed to fetch USDT rates:', err);
    notify.error(_tGlobal('USDT汇率获取失败，使用缓存数据', 'USDT rate fetch failed, using cached data'));
  } finally {
    _fetching = false;
    bumpUsdtRatesSnapshot();
  }
}

function _startTimer() {
  _stopTimer();
  if (!_config.enabled || _config.paused) return;

  const intervalMs = clampIntervalSec(_config.intervalSeconds) * 1000;
  const elapsed = _lastFetchTime > 0 ? Date.now() - _lastFetchTime : intervalMs;

  if (elapsed >= intervalMs) {
    _doFetch(true, { silent: true });
    _timerId = setInterval(() => _doFetch(true, { silent: true }), intervalMs);
  } else {
    const remaining = intervalMs - elapsed;
    _timerId = setTimeout(() => {
      _doFetch(true, { silent: true });
      _timerId = setInterval(() => _doFetch(true, { silent: true }), intervalMs);
    }, remaining) as any;
  }
}

function _stopTimer() {
  if (_timerId !== null) {
    clearInterval(_timerId);
    clearTimeout(_timerId as any);
    _timerId = null;
  }
}

async function _ensureInit() {
  if (_initDone) return;
  if (_initPromise) { await _initPromise; return; }

  _initPromise = (async () => {
    try {
      const [savedConfig, savedRates] = await Promise.all([
        loadSharedData<UsdtLiveRateConfig>('usdtLiveRateConfig' as any),
        loadSharedData<UsdtLiveRates>('usdtLiveRates' as any),
      ]);
      if (savedConfig) {
        _config = { ...DEFAULT_CONFIG, ...savedConfig };
        const raw = _config.intervalSeconds;
        _config.intervalSeconds = clampIntervalSec(_config.intervalSeconds);
        if (raw !== _config.intervalSeconds) {
          saveSharedData('usdtLiveRateConfig' as any, _config).catch(() => { /* config correction save is best-effort */ });
        }
      }
      if (savedRates && savedRates.mid > 0) {
        _rates = savedRates;
        const updatedTime = new Date(savedRates.lastUpdated).getTime();
        if (updatedTime > 0 && _lastFetchTime === 0) {
          _lastFetchTime = updatedTime;
        }
      }
    } catch (e) {
      console.error('[UsdtRateEngine] init failed:', e);
    }
    _initDone = true;
    _startTimer();
    bumpUsdtRatesSnapshot();
  })();

  await _initPromise;
}

// Public API for the component
export function getGlobalRates(): UsdtLiveRates { return _rates; }
export function getGlobalConfig(): UsdtLiveRateConfig { return _config; }
export function isGlobalFetching(): boolean { return _fetching; }

export async function globalUpdateConfig(partial: Partial<UsdtLiveRateConfig>) {
  _config = { ..._config, ...partial };
  if (partial.intervalSeconds != null) {
    _config.intervalSeconds = clampIntervalSec(partial.intervalSeconds);
  }
  bumpUsdtRatesSnapshot();
  const ok = await saveSharedData('usdtLiveRateConfig' as any, _config);
  if (!ok) {
    await new Promise(r => setTimeout(r, 600));
    await saveSharedData('usdtLiveRateConfig' as any, _config);
  }
  _startTimer();
}

export async function globalFetchRates(force = true) {
  await _ensureInit();
  return _doFetch(force, { silent: false });
}

// Boot on import (lazy — first subscriber or manual call triggers init)
_ensureInit();

// ============================================================================
// React component — purely presentational, reads from global singleton
// ============================================================================

interface Props {
  onRateUpdate?: (rates: UsdtLiveRates) => void;
  compact?: boolean;
}

function formatIntervalLabel(sec: number, t: (zh: string, en: string) => string): string {
  const s = clampIntervalSec(sec);
  if (s < 60) return t(`${s} 秒`, `${s}s`);
  if (s < 3600) {
    const m = s / 60;
    return Number.isInteger(m) ? t(`${m} 分钟`, `${m} min`) : t(`${s} 秒`, `${s}s`);
  }
  const h = s / 3600;
  return Number.isInteger(h) ? t(`${h} 小时`, `${h} hr`) : t(`${Math.round(s / 60)} 分钟`, `${Math.round(s / 60)} min`);
}

export default function UsdtRatePanel({ onRateUpdate, compact = false }: Props) {
  const { t } = useLanguage();

  useSyncExternalStore(subscribe, getSnapshot);

  const intervalSelectValues = useMemo(() => {
    const cur = clampIntervalSec(_config.intervalSeconds);
    const set = new Set<number>([...USDT_RATE_INTERVAL_PRESETS, cur]);
    return [...set].sort((a, b) => a - b);
  }, []);

  const rates = _rates;
  const config = _config;
  const loading = _fetching;

  // 同步父组件（活动赠送等）：mid / 买入价(ask) / 卖出价(bid) 任一变化都要通知，不能只看 mid
  const prevRatesSigRef = useRef('');
  useEffect(() => {
    if (rates.mid <= 0 && rates.bid <= 0 && rates.ask <= 0) return;
    const sig = `${rates.mid}|${rates.bid}|${rates.ask}|${rates.lastUpdated}`;
    if (sig === prevRatesSigRef.current) return;
    prevRatesSigRef.current = sig;
    onRateUpdate?.(rates);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rates.mid, rates.bid, rates.ask, rates.lastUpdated, onRateUpdate]);

  const handleConfirmRate = () => {
    globalUpdateConfig({ paused: false, pauseReason: null, lastConfirmedMid: rates.mid });
    notify.success(t('已确认新汇率', 'New rate confirmed'));
  };

  const formatTime = (iso: string) => {
    if (!iso) return '--';
    return formatBeijingTimeOnly(iso);
  };

  if (compact) {
    return (
      <div className="flex items-center gap-1.5 text-xs flex-wrap">
        <div className="flex items-center gap-1 bg-muted/50 px-2 py-1 rounded-md">
          <span className="text-muted-foreground">{t('买', 'Buy')}</span>
          <span className="font-mono font-semibold text-foreground">{rates.ask > 0 ? rates.ask.toFixed(4) : '--'}</span>
        </div>
        <div className="flex items-center gap-1 bg-primary/10 px-2 py-1 rounded-md border border-primary/20">
          <span className="text-muted-foreground">{t('中', 'Mid')}</span>
          <span className="font-mono font-bold text-primary">{rates.mid > 0 ? rates.mid.toFixed(4) : '--'}</span>
        </div>
        <div className="flex items-center gap-1 bg-muted/50 px-2 py-1 rounded-md">
          <span className="text-muted-foreground">{t('卖', 'Sell')}</span>
          <span className="font-mono font-semibold text-foreground">{rates.bid > 0 ? rates.bid.toFixed(4) : '--'}</span>
        </div>
        {rates.source !== 'none' && (
          <Badge variant="outline" className="text-[10px] h-5 px-1.5">
            {rates.source === 'binance+okx' ? 'B+O' : rates.source === 'binance' ? 'Bin' : rates.source === 'okx' ? 'OKX' : t('缓存', 'Cache')}
          </Badge>
        )}
        <div className="flex items-center gap-1">
          <span className={`h-1.5 w-1.5 rounded-full ${rates.binanceAvailable ? 'bg-green-500' : 'bg-destructive'}`} title="Binance" />
          <span className={`h-1.5 w-1.5 rounded-full ${rates.okxAvailable ? 'bg-green-500' : 'bg-destructive'}`} title="OKX" />
        </div>
        <span className="text-muted-foreground hidden sm:inline">{formatTime(rates.lastUpdated)}</span>
        <Select
          value={String(clampIntervalSec(config.intervalSeconds))}
          onValueChange={(v) => {
            globalUpdateConfig({ intervalSeconds: Number(v) });
            notify.success(t('已保存采集间隔', 'Refresh interval saved'));
          }}
        >
          <SelectTrigger
            className="h-7 w-[92px] text-[10px] px-1.5 shrink-0"
            title={t('自动采集间隔', 'Auto-fetch interval')}
          >
            <SelectValue placeholder={t('间隔', 'Interval')} />
          </SelectTrigger>
          <SelectContent>
            {intervalSelectValues.map((sec) => (
              <SelectItem key={sec} value={String(sec)} className="text-xs">
                {formatIntervalLabel(sec, t)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Switch
          checked={config.enabled}
          onCheckedChange={(v) => globalUpdateConfig({ enabled: v })}
          className="scale-75 shrink-0"
        />
        <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => globalFetchRates(true)} disabled={loading}>
          <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
        </Button>
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
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">{t('USDT/CNY 实时汇率', 'USDT/CNY Live Rates')}</h3>
            {rates.source !== 'none' && (
              <Badge variant="outline" className="text-xs">
                {rates.source === 'binance+okx' ? 'Binance + OKX' : rates.source === 'binance' ? 'Binance' : rates.source === 'okx' ? 'OKX' : t('缓存', 'Cached')}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <div className="flex items-center gap-1.5">
              <Label className="text-xs text-muted-foreground whitespace-nowrap">{t('采集间隔', 'Interval')}</Label>
              <Select
                value={String(clampIntervalSec(config.intervalSeconds))}
                onValueChange={(v) => {
                  globalUpdateConfig({ intervalSeconds: Number(v) });
                  notify.success(t('已保存采集间隔', 'Refresh interval saved'));
                }}
              >
                <SelectTrigger className="h-8 w-[120px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {intervalSelectValues.map((sec) => (
                    <SelectItem key={sec} value={String(sec)} className="text-xs">
                      {formatIntervalLabel(sec, t)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Switch checked={config.enabled} onCheckedChange={(v) => globalUpdateConfig({ enabled: v })} />
            <Label className="text-xs">{t('自动采集', 'Auto-fetch')}</Label>
          </div>
        </div>

        {config.paused && (
          <div className="flex items-center gap-2 p-2 rounded-md bg-destructive/10 border border-destructive/20">
            <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
            <span className="text-xs text-destructive flex-1">{config.pauseReason}</span>
            <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={handleConfirmRate}>
              <Check className="h-3 w-3 mr-1" />{t('确认', 'Confirm')}
            </Button>
          </div>
        )}

        <div className="grid grid-cols-3 gap-2">
          <div className="text-center p-2 rounded-md bg-muted/50">
            <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
              <TrendingUp className="h-3 w-3" />{t('买入价', 'Buy (CNY/USDT)')}
            </div>
            <div className="text-lg font-bold text-foreground">{rates.ask > 0 ? rates.ask.toFixed(4) : '--'}</div>
          </div>
          <div className="text-center p-2 rounded-md bg-primary/5 border border-primary/20">
            <div className="text-xs text-muted-foreground">{t('中间价', 'Mid')}</div>
            <div className="text-lg font-bold text-primary">{rates.mid > 0 ? rates.mid.toFixed(4) : '--'}</div>
          </div>
          <div className="text-center p-2 rounded-md bg-muted/50">
            <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
              <TrendingDown className="h-3 w-3" />{t('卖出价', 'Sell (CNY/USDT)')}
            </div>
            <div className="text-lg font-bold text-foreground">{rates.bid > 0 ? rates.bid.toFixed(4) : '--'}</div>
          </div>
        </div>

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

        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={String(config.anomalyThresholdPercent)}
            onValueChange={(v) => globalUpdateConfig({ anomalyThresholdPercent: Number(v) })}
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
          <span className="text-xs text-muted-foreground">
            {t('波动阈值（超则暂停自动采集）', 'Anomaly threshold (pauses auto-fetch)')}
          </span>
          <span className="text-xs text-muted-foreground w-full sm:w-auto sm:ml-0">
            {config.enabled
              ? t(
                  `开启自动后约每 ${formatIntervalLabel(config.intervalSeconds, t)} 拉取一次（界面不再每次弹成功提示）`,
                  `Auto-fetch about every ${formatIntervalLabel(config.intervalSeconds, t)} (no toast on each success)`,
                )
              : t('开启「自动采集」后按上方间隔定时拉取', 'Turn on auto-fetch to poll at the interval above')}
          </span>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs ml-auto"
            onClick={() => globalFetchRates(true)}
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
