import { useState, useEffect, useCallback, useRef } from "react";
// Card removed — component renders as a plain div for flexible embedding in Popover / Dialog
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Bitcoin, RefreshCw, Timer, Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { formatBeijingTime } from "@/lib/beijingTime";
import { useLanguage } from "@/contexts/LanguageContext";
import { loadSharedData, saveSharedData, subscribeToSharedData } from "@/services/finance/sharedDataService";
import { fetchBtcPriceViaApi } from "@/services/finance/marketRatesService";
import { EXTERNAL_API } from "@/config/externalApis";

// BTC配置类型
export interface BtcPriceConfig {
  rawPrice: number;           // 原始采集价格（美元）
  multiplierPercent: number;  // 百分比乘数（如 98 表示 98%）
  calculatedPrice: number;    // 计算后的价格
  autoRefreshEnabled: boolean;
  refreshIntervalSeconds: number;
  lastUpdated: string;
}

const DEFAULT_CONFIG: BtcPriceConfig = {
  rawPrice: 0,              // 0表示未采集
  multiplierPercent: 98,
  calculatedPrice: 0,       // 0表示未采集
  autoRefreshEnabled: false,
  refreshIntervalSeconds: 300, // 5分钟
  lastUpdated: '',          // 空字符串表示从未更新
};

// BTC 价格采集 — 优先走后端代理（绕过 CSP），失败后直连外部 API
const fetchRealTimeBtcRate = async (): Promise<number> => {
  // 1. 后端代理（不受 CSP 限制）
  try {
    const r = await fetchBtcPriceViaApi(AbortSignal.timeout(12000));
    if (r.success && r.price != null && r.price > 0) return r.price;
  } catch { /* try direct */ }

  // 2. CoinGecko 直连
  try {
    const res = await fetch(EXTERNAL_API.COINGECKO_BTC_USD, { signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      const data = await res.json();
      const price = data?.bitcoin?.usd;
      if (price && price > 0) return price;
    }
  } catch { /* try fallback */ }

  // 3. Binance 直连
  try {
    const res = await fetch(EXTERNAL_API.BINANCE_BTC_USDT_TICKER, { signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      const data = await res.json();
      const price = parseFloat(data?.price);
      if (price && price > 0) return price;
    }
  } catch { /* skip */ }

  throw new Error('BTC price unavailable from all sources');
};

// 🔧 修复：基于时间戳计算剩余秒数，而不是依赖组件内存
const calculateRemainingSeconds = (lastUpdated: string | undefined, intervalSeconds: number): number => {
  if (!lastUpdated) return 0;  // 尚未更新，显示 0 表示需要首次采集
  
  const lastTime = new Date(lastUpdated).getTime();
  const now = Date.now();
  const elapsedMs = now - lastTime;
  const elapsedSeconds = Math.floor(elapsedMs / 1000);
  const remaining = Math.max(0, intervalSeconds - elapsedSeconds);
  
  return remaining;
};

export default function BtcPriceSettingsCard() {
  const { t } = useLanguage();
  const [config, setConfig] = useState<BtcPriceConfig>(DEFAULT_CONFIG);
  const [isLoading, setIsLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [fetchError, setFetchError] = useState<string | null>(null);
  
  const countdownRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);
  const configRef = useRef(config);
  const isTogglingRef = useRef(false);
  
  // 保持 configRef 同步
  useEffect(() => {
    configRef.current = config;
  }, [config]);

  // 加载配置 - 🔧 修复：基于 lastUpdated 计算剩余时间
  const loadConfig = useCallback(async () => {
    try {
      const saved = await loadSharedData<BtcPriceConfig>('btcPriceSettings');
      if (saved) {
        setConfig(saved);
        // 🔧 关键修复：基于 lastUpdated 时间戳计算剩余秒数
        if (saved.autoRefreshEnabled) {
          const remaining = calculateRemainingSeconds(saved.lastUpdated, saved.refreshIntervalSeconds);
          setCountdown(remaining);
        }
      }
    } catch (error) {
      console.error('Failed to load BTC config:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 保存配置 - 同步等待数据库写入，确保刷新后不丢失。返回是否成功。
  const saveConfig = useCallback(async (newConfig: BtcPriceConfig): Promise<boolean> => {
    try {
      const ok = await saveSharedData('btcPriceSettings', newConfig);
      if (ok) setConfig(newConfig);
      else toast.error(t("保存失败", "Failed to save"));
      return !!ok;
    } catch (error) {
      console.error('Failed to save BTC config:', error);
      toast.error(t("保存失败", "Failed to save"));
      return false;
    }
  }, [t]);

  // 刷新BTC价格
  const handleRefresh = useCallback(async () => {
    if (isFetching) return;
    
    setIsFetching(true);
    setFetchError(null);
    
    try {
      const rawPrice = await fetchRealTimeBtcRate();
      const calculatedPrice = Math.round(rawPrice * (config.multiplierPercent / 100));
      
      const newConfig: BtcPriceConfig = {
        ...config,
        rawPrice,
        calculatedPrice,
        lastUpdated: new Date().toISOString(),
      };
      
      await saveConfig(newConfig);
      
      // 重置倒计时
      if (config.autoRefreshEnabled) {
        setCountdown(config.refreshIntervalSeconds);
      }
      
      toast.success(t("BTC价格已更新", "BTC price updated"));
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      setFetchError(errorMsg);
      toast.error(t("采集失败: " + errorMsg, "Fetch failed: " + errorMsg));
    } finally {
      if (isMountedRef.current) {
        setIsFetching(false);
      }
    }
  }, [config, isFetching, saveConfig, t]);

  // 切换自动刷新 - 乐观更新：先更新 UI，再保存，失败时回滚
  const handleToggleAutoRefresh = async (enabled: boolean) => {
    const prevConfig = config;
    const newConfig = { ...config, autoRefreshEnabled: enabled };
    
    isTogglingRef.current = true;
    setConfig(newConfig);
    if (enabled) {
      const remaining = calculateRemainingSeconds(config.lastUpdated, config.refreshIntervalSeconds);
      if (remaining === 0) {
        setCountdown(config.refreshIntervalSeconds);
        handleRefresh();
      } else {
        setCountdown(remaining);
      }
    } else {
      setCountdown(0);
    }
    
    const ok = await saveConfig(newConfig);
    isTogglingRef.current = false;
    if (!ok) {
      setConfig(prevConfig);
      if (enabled) setCountdown(0);
    }
  };

  // 修改刷新间隔 - 🔧 修复：基于 lastUpdated 重新计算剩余时间
  const handleIntervalChange = async (seconds: string) => {
    const interval = parseInt(seconds);
    const newConfig = { ...config, refreshIntervalSeconds: interval };
    await saveConfig(newConfig);
    // 基于当前 lastUpdated 重新计算剩余时间
    const remaining = calculateRemainingSeconds(config.lastUpdated, interval);
    setCountdown(remaining);
  };

  // 修改百分比
  const handleMultiplierChange = async (value: string) => {
    const percent = parseFloat(value) || 100;
    const calculatedPrice = Math.round(config.rawPrice * (percent / 100));
    const newConfig = { ...config, multiplierPercent: percent, calculatedPrice };
    await saveConfig(newConfig);
  };

  // 初始化
  useEffect(() => {
    isMountedRef.current = true;
    loadConfig();
    
    return () => {
      isMountedRef.current = false;
    };
  }, [loadConfig]);

  // 订阅外部变更（其他标签页/设备同步）
  useEffect(() => {
    const unsubscribe = subscribeToSharedData((key, value) => {
      if (key === 'btcPriceSettings' && value && !isTogglingRef.current) {
        setConfig(value as BtcPriceConfig);
      }
    });
    return unsubscribe;
  }, []);

  // 自动刷新倒计时 - 🔧 修复：刷新后使用新的 lastUpdated 计算
  useEffect(() => {
    if (!config.autoRefreshEnabled) {
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
      }
      return;
    }

    countdownRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          handleRefresh();
          // 刷新后从配置的间隔重新开始
          return configRef.current.refreshIntervalSeconds;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
      }
    };
  }, [config.autoRefreshEnabled, config.refreshIntervalSeconds, handleRefresh]);

  // 格式化倒计时
  const formatCountdown = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins > 0 ? `${mins}:${secs.toString().padStart(2, '0')}` : `${secs}s`;
  };

  // 格式化时间
  const formatLastUpdated = (isoString: string) => {
    try {
      return formatBeijingTime(isoString) || "-";
    } catch {
      return "-";
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* 标题 */}
      <div className="flex items-center gap-2 px-4 pt-4 pb-2">
        <Bitcoin className="h-5 w-5 text-amber-500" />
        <span className="text-base font-semibold">{t("BTC价格自动采集", "BTC Price Auto-Fetch")}</span>
      </div>

      <div className="px-4 pb-4 space-y-3">
        {/* 价格公式 — 单行紧凑排列 */}
        <div className="flex items-center gap-2 bg-muted/40 rounded-lg p-3">
          <div className="flex-1 text-center min-w-0">
            <div className="text-[10px] text-muted-foreground leading-tight">{t("原始价格", "Raw")}</div>
            <div className="text-sm font-bold text-primary truncate">${config.rawPrice.toLocaleString()}</div>
          </div>
          <span className="text-xs text-muted-foreground shrink-0">×</span>
          <span className="text-sm font-bold text-blue-600 shrink-0">{config.multiplierPercent}%</span>
          <span className="text-xs text-muted-foreground shrink-0">=</span>
          <div className="flex-1 text-center min-w-0 bg-amber-50 dark:bg-amber-900/20 rounded-md p-1.5 border border-amber-200 dark:border-amber-800">
            <div className="text-[10px] text-amber-600 dark:text-amber-400 leading-tight">{t("最终价格", "Final")}</div>
            <div className="text-sm font-bold text-amber-600 dark:text-amber-400 truncate">${config.calculatedPrice.toLocaleString()}</div>
          </div>
        </div>

        {/* 错误提示 */}
        {fetchError && (
          <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 rounded-lg p-2.5">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{t("采集失败: ", "Failed: ")}{fetchError}</span>
          </div>
        )}

        {/* 设置区域 — 始终单列 */}
        <div className="space-y-3">
          {/* 百分比设置 */}
          <div className="space-y-1.5">
            <Label className="text-xs">{t("价格乘数百分比", "Multiplier %")}</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                value={config.multiplierPercent}
                onChange={(e) => handleMultiplierChange(e.target.value)}
                min={1}
                max={500}
                step={0.1}
                className="w-20 h-8 text-sm"
              />
              <span className="text-sm text-muted-foreground">%</span>
              <span className="text-[10px] text-muted-foreground">
                ({t("1-500%", "1-500%")})
              </span>
            </div>
          </div>

          {/* 自动刷新间隔 */}
          <div className="space-y-1.5">
            <Label className="text-xs">{t("自动采集间隔", "Auto-Fetch Interval")}</Label>
            <Select
              value={config.refreshIntervalSeconds.toString()}
              onValueChange={handleIntervalChange}
            >
              <SelectTrigger className="w-full h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="60">{t("1分钟", "1 min")}</SelectItem>
                <SelectItem value="180">{t("3分钟", "3 min")}</SelectItem>
                <SelectItem value="300">{t("5分钟", "5 min")}</SelectItem>
                <SelectItem value="600">{t("10分钟", "10 min")}</SelectItem>
                <SelectItem value="900">{t("15分钟", "15 min")}</SelectItem>
                <SelectItem value="1800">{t("30分钟", "30 min")}</SelectItem>
                <SelectItem value="3600">{t("1小时", "1 hour")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* 控制区域 */}
        <div className="flex items-center justify-between gap-3 pt-3 border-t">
          <div className="flex items-center gap-2 min-w-0">
            <Switch
              checked={config.autoRefreshEnabled}
              onCheckedChange={handleToggleAutoRefresh}
            />
            <div className="flex items-center gap-1.5 min-w-0">
              <Timer className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="text-xs truncate">
                {config.autoRefreshEnabled
                  ? t("自动采集中", "Auto-fetching")
                  : t("已关闭", "Off")}
              </span>
              {config.autoRefreshEnabled && countdown > 0 && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 shrink-0">
                  {formatCountdown(countdown)}
                </Badge>
              )}
            </div>
          </div>

          <Button
            onClick={handleRefresh}
            disabled={isFetching}
            size="sm"
            className="gap-1.5 shrink-0 h-8 px-3 text-xs"
          >
            {isFetching ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            {t("立即采集", "Fetch Now")}
          </Button>
        </div>

        {/* 上次更新时间 */}
        {config.lastUpdated && (
          <div className="text-[10px] text-muted-foreground text-right">
            {t("更新: ", "Updated: ")}{formatLastUpdated(config.lastUpdated)}
          </div>
        )}
      </div>
    </div>
  );
}

// 导出获取BTC配置的函数，供其他组件使用
export async function getBtcPriceConfig(): Promise<BtcPriceConfig | null> {
  try {
    const config = await loadSharedData<BtcPriceConfig>('btcPriceSettings');
    return config || null;
  } catch {
    return null;
  }
}
