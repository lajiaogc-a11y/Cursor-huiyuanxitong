import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Bitcoin, RefreshCw, Timer, Loader2, TrendingUp, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { useLanguage } from "@/contexts/LanguageContext";
import { loadSharedData, saveSharedData, subscribeToSharedData } from "@/services/sharedDataService";

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

// 采集BTC实时价格 - 通过 Supabase Edge Function 代理（避免浏览器直连被封锁）
const fetchRealTimeBtcRate = async (): Promise<number> => {
  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  try {
    const response = await fetch(
      `https://${projectId}.supabase.co/functions/v1/fetch-usdt-rates`,
      {
        method: 'POST',
        signal: AbortSignal.timeout(10000),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${anonKey}`,
          'apikey': anonKey,
        },
        body: JSON.stringify({ includeBtc: true }),
      }
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const price = data?.btc?.price;
    if (price && price > 0) return price;
    throw new Error(data?.btc?.error || 'BTC price unavailable');
  } catch (error) {
    throw error instanceof Error ? error : new Error(String(error));
  }
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
      const date = new Date(isoString);
      return date.toLocaleString();
    } catch {
      return "-";
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Bitcoin className="h-5 w-5 text-amber-500" />
          {t("BTC价格自动采集", "BTC Price Auto-Fetch")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 价格显示区域 - 单行Flex布局 */}
        <div className="flex flex-wrap items-center gap-3 justify-center">
          <div className="flex-1 min-w-[100px] max-w-[140px] bg-muted/50 rounded-lg p-2.5 text-center">
            <div className="text-xs text-muted-foreground">{t("原始价格", "Raw Price")}</div>
            <div className="text-lg font-bold text-primary">${config.rawPrice.toLocaleString()}</div>
          </div>
          <div className="flex items-center gap-1.5 text-lg font-mono text-muted-foreground">
            <span>×</span>
            <span className="text-blue-600 font-bold">{config.multiplierPercent}%</span>
          </div>
          <span className="text-lg text-muted-foreground">=</span>
          <div className="flex-1 min-w-[100px] max-w-[140px] bg-amber-50 dark:bg-amber-900/20 rounded-lg p-2.5 text-center border border-amber-200 dark:border-amber-800">
            <div className="text-xs text-amber-600 dark:text-amber-400">{t("最终价格", "Final")}</div>
            <div className="text-lg font-bold text-amber-600 dark:text-amber-400">${config.calculatedPrice.toLocaleString()}</div>
          </div>
        </div>

        {/* 错误提示 */}
        {fetchError && (
          <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-lg p-3">
            <AlertCircle className="h-4 w-4" />
            {t("上次采集失败: ", "Last fetch failed: ")}{fetchError}
          </div>
        )}

        {/* 设置区域 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* 百分比设置 */}
          <div className="space-y-2">
            <Label>{t("价格乘数百分比", "Price Multiplier Percentage")}</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                value={config.multiplierPercent}
                onChange={(e) => handleMultiplierChange(e.target.value)}
                min={1}
                max={500}
                step={0.1}
                className="w-24"
              />
              <span className="text-muted-foreground">%</span>
              <span className="text-xs text-muted-foreground ml-2">
                ({t("可设置1-500%", "Range: 1-500%")})
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {t("公式：原始价格 × 百分比 = 最终价格", "Formula: Raw Price × Percentage = Final Price")}
            </p>
          </div>

          {/* 自动刷新间隔 */}
          <div className="space-y-2">
            <Label>{t("自动采集间隔", "Auto-Fetch Interval")}</Label>
            <Select
              value={config.refreshIntervalSeconds.toString()}
              onValueChange={handleIntervalChange}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="60">{t("1分钟", "1 minute")}</SelectItem>
                <SelectItem value="180">{t("3分钟", "3 minutes")}</SelectItem>
                <SelectItem value="300">{t("5分钟", "5 minutes")}</SelectItem>
                <SelectItem value="600">{t("10分钟", "10 minutes")}</SelectItem>
                <SelectItem value="900">{t("15分钟", "15 minutes")}</SelectItem>
                <SelectItem value="1800">{t("30分钟", "30 minutes")}</SelectItem>
                <SelectItem value="3600">{t("1小时", "1 hour")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* 控制区域 */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t">
          {/* 自动采集开关 */}
          <div className="flex items-center gap-3">
            <Switch
              checked={config.autoRefreshEnabled}
              onCheckedChange={handleToggleAutoRefresh}
            />
            <div className="flex items-center gap-2">
              <Timer className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">
                {config.autoRefreshEnabled 
                  ? t("自动采集中", "Auto-fetching") 
                  : t("自动采集已关闭", "Auto-fetch disabled")}
              </span>
              {config.autoRefreshEnabled && countdown > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {formatCountdown(countdown)}
                </Badge>
              )}
            </div>
          </div>

          {/* 手动刷新按钮 */}
          <Button
            onClick={handleRefresh}
            disabled={isFetching}
            className="gap-2"
          >
            {isFetching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            {t("立即采集", "Fetch Now")}
          </Button>
        </div>

        {/* 上次更新时间 */}
        <div className="text-xs text-muted-foreground text-right">
          {t("上次更新: ", "Last updated: ")}{formatLastUpdated(config.lastUpdated)}
        </div>
      </CardContent>
    </Card>
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
