/**
 * 订单异常检测服务
 * 基于近30天历史订单数据，检测当前提交订单是否存在异常
 */
import { apiGet } from '@/api/client';

function _t(zh: string, en: string): string {
  return (typeof localStorage !== 'undefined' && localStorage.getItem('appLanguage') === 'en') ? en : zh;
}

export interface AnomalyWarning {
  type: 'profit_rate' | 'exchange_rate' | 'amount' | 'negative_profit';
  message: string;
  severity: 'warning' | 'danger';
  currentValue: number;
  avgValue?: number;
}

interface OrderStats {
  avgProfitRate: number;
  stdProfitRate: number;
  avgForeignRate: Record<string, number>;
  avgCardWorth: number;
  stdCardWorth: number;
  sampleCount: number;
}

// 缓存统计数据，避免重复查询（5分钟有效）
let statsCache: { data: OrderStats; timestamp: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000;

async function getRecentOrderStats(): Promise<OrderStats> {
  if (statsCache && Date.now() - statsCache.timestamp < CACHE_TTL) {
    return statsCache.data;
  }

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const empty: OrderStats = {
    avgProfitRate: 0,
    stdProfitRate: 0,
    avgForeignRate: {},
    avgCardWorth: 0,
    stdCardWorth: 0,
    sampleCount: 0,
  };

  let data: { profit_rate: number | null; foreign_rate: number | null; amount: number | null; currency: string | null }[];
  try {
    const iso = thirtyDaysAgo.toISOString();
    const rows = await apiGet<unknown>(
      `/api/data/table/orders?select=profit_rate,foreign_rate,amount,currency&is_deleted=eq.false&status=eq.completed&created_at=gte.${encodeURIComponent(iso)}&limit=500`
    );
    data = Array.isArray(rows) ? rows : [];
  } catch (e) {
    console.warn('[orderAnomalyDetection] Failed to load recent orders:', e);
    return empty;
  }

  if (!data.length) {
    return empty;
  }

  // 计算利润率均值和标准差
  const profitRates = data.map((o: { profit_rate: number | null; foreign_rate: number | null; amount: number | null; currency: string | null }) => Number(o.profit_rate) || 0).filter((r: number) => r !== 0);
  const avgProfitRate = profitRates.length > 0
    ? profitRates.reduce((a: number, b: number) => a + b, 0) / profitRates.length : 0;
  const stdProfitRate = profitRates.length > 1
    ? Math.sqrt(profitRates.reduce((sum: number, r: number) => sum + Math.pow(r - avgProfitRate, 2), 0) / profitRates.length) : 0;

  // 按币种计算外币汇率均值
  const ratesByCurrency: Record<string, number[]> = {};
  data.forEach((o: { profit_rate: number | null; foreign_rate: number | null; amount: number | null; currency: string | null }) => {
    const c = o.currency || 'NGN';
    const r = Number(o.foreign_rate) || 0;
    if (r > 0) {
      if (!ratesByCurrency[c]) ratesByCurrency[c] = [];
      ratesByCurrency[c].push(r);
    }
  });
  const avgForeignRate: Record<string, number> = {};
  for (const [c, rates] of Object.entries(ratesByCurrency)) {
    avgForeignRate[c] = rates.reduce((a, b) => a + b, 0) / rates.length;
  }

  // 计算卡价值均值和标准差
  const amounts = data.map((o: { amount: number | null }) => Number(o.amount) || 0).filter((a: number) => a > 0);
  const avgCardWorth = amounts.length > 0
    ? amounts.reduce((a: number, b: number) => a + b, 0) / amounts.length : 0;
  const stdCardWorth = amounts.length > 1
    ? Math.sqrt(amounts.reduce((sum: number, a: number) => sum + Math.pow(a - avgCardWorth, 2), 0) / amounts.length) : 0;

  const stats: OrderStats = {
    avgProfitRate,
    stdProfitRate,
    avgForeignRate,
    avgCardWorth,
    stdCardWorth,
    sampleCount: data.length,
  };

  statsCache = { data: stats, timestamp: Date.now() };
  return stats;
}

/**
 * 检测订单是否存在异常
 */
export async function detectOrderAnomalies(params: {
  profitRate: number;
  foreignRate: number;
  cardWorth: number;
  currency: string;
}): Promise<AnomalyWarning[]> {
  const warnings: AnomalyWarning[] = [];
  const stats = await getRecentOrderStats();

  // 样本不足时跳过统计类检测
  if (stats.sampleCount < 5) {
    // 仍检测明显异常
    if (params.profitRate < 0) {
      warnings.push({
        type: 'negative_profit',
        message: _t(`利润率为负数 (${params.profitRate.toFixed(2)}%)，此订单将产生亏损`, `Negative profit rate (${params.profitRate.toFixed(2)}%), this order will result in a loss`),
        severity: 'danger',
        currentValue: params.profitRate,
      });
    }
    if (params.profitRate > 50) {
      warnings.push({
        type: 'profit_rate',
        message: _t(`利润率异常偏高 (${params.profitRate.toFixed(2)}%)，请确认数值是否正确`, `Abnormally high profit rate (${params.profitRate.toFixed(2)}%), please verify the value`),
        severity: 'danger',
        currentValue: params.profitRate,
      });
    }
    return warnings;
  }

  // 1. 利润率检测
  if (params.profitRate < 0) {
    warnings.push({
      type: 'negative_profit',
      message: _t(
        `利润率为负数 (${params.profitRate.toFixed(2)}%)，此订单将产生亏损。历史平均利润率: ${stats.avgProfitRate.toFixed(2)}%`,
        `Negative profit rate (${params.profitRate.toFixed(2)}%), this order will result in a loss. Historical avg: ${stats.avgProfitRate.toFixed(2)}%`
      ),
      severity: 'danger',
      currentValue: params.profitRate,
      avgValue: stats.avgProfitRate,
    });
  } else if (stats.stdProfitRate > 0 && Math.abs(params.profitRate - stats.avgProfitRate) > 3 * stats.stdProfitRate) {
    warnings.push({
      type: 'profit_rate',
      message: _t(
        `利润率 (${params.profitRate.toFixed(2)}%) 偏离历史均值 (${stats.avgProfitRate.toFixed(2)}%) 超过3个标准差`,
        `Profit rate (${params.profitRate.toFixed(2)}%) deviates from historical avg (${stats.avgProfitRate.toFixed(2)}%) by more than 3 std deviations`
      ),
      severity: 'warning',
      currentValue: params.profitRate,
      avgValue: stats.avgProfitRate,
    });
  } else if (params.profitRate > 50) {
    warnings.push({
      type: 'profit_rate',
      message: _t(
        `利润率异常偏高 (${params.profitRate.toFixed(2)}%)，历史平均: ${stats.avgProfitRate.toFixed(2)}%`,
        `Abnormally high profit rate (${params.profitRate.toFixed(2)}%), historical avg: ${stats.avgProfitRate.toFixed(2)}%`
      ),
      severity: 'danger',
      currentValue: params.profitRate,
      avgValue: stats.avgProfitRate,
    });
  }

  // 2. 汇率检测（按币种）
  const avgRate = stats.avgForeignRate[params.currency];
  if (avgRate && avgRate > 0 && params.foreignRate > 0) {
    const rateDeviation = Math.abs(params.foreignRate - avgRate) / avgRate;
    if (rateDeviation > 0.15) { // 偏离超过15%
      warnings.push({
        type: 'exchange_rate',
        message: _t(
          `${params.currency} 汇率 (${params.foreignRate.toFixed(2)}) 偏离近期均值 (${avgRate.toFixed(2)}) 超过15%`,
          `${params.currency} rate (${params.foreignRate.toFixed(2)}) deviates from recent avg (${avgRate.toFixed(2)}) by more than 15%`
        ),
        severity: rateDeviation > 0.3 ? 'danger' : 'warning',
        currentValue: params.foreignRate,
        avgValue: avgRate,
      });
    }
  }

  // 3. 金额检测
  if (stats.stdCardWorth > 0 && params.cardWorth > 0) {
    const amountDeviation = (params.cardWorth - stats.avgCardWorth) / stats.stdCardWorth;
    if (Math.abs(amountDeviation) > 4) { // 超过4个标准差
      warnings.push({
        type: 'amount',
        message: _t(
          `订单金额 (¥${params.cardWorth.toFixed(0)}) 显著偏离历史均值 (¥${stats.avgCardWorth.toFixed(0)})`,
          `Order amount (¥${params.cardWorth.toFixed(0)}) significantly deviates from historical avg (¥${stats.avgCardWorth.toFixed(0)})`
        ),
        severity: 'warning',
        currentValue: params.cardWorth,
        avgValue: stats.avgCardWorth,
      });
    }
  }

  return warnings;
}

// 清除缓存（用于测试或强制刷新）
export function clearAnomalyCache() {
  statsCache = null;
}
