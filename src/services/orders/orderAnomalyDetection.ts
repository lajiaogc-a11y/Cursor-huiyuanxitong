/**
 * 订单异常检测服务
 * 基于近30天历史订单数据，检测当前提交订单是否存在异常
 */
import { supabase } from '@/integrations/supabase/client';

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

  const { data, error } = await supabase
    .from('orders')
    .select('profit_rate, foreign_rate, amount, currency')
    .eq('is_deleted', false)
    .eq('status', 'completed')
    .gte('created_at', thirtyDaysAgo.toISOString())
    .limit(500);

  if (error || !data || data.length === 0) {
    return {
      avgProfitRate: 0,
      stdProfitRate: 0,
      avgForeignRate: {},
      avgCardWorth: 0,
      stdCardWorth: 0,
      sampleCount: 0,
    };
  }

  // 计算利润率均值和标准差
  const profitRates = data.map(o => Number(o.profit_rate) || 0).filter(r => r !== 0);
  const avgProfitRate = profitRates.length > 0
    ? profitRates.reduce((a, b) => a + b, 0) / profitRates.length : 0;
  const stdProfitRate = profitRates.length > 1
    ? Math.sqrt(profitRates.reduce((sum, r) => sum + Math.pow(r - avgProfitRate, 2), 0) / profitRates.length) : 0;

  // 按币种计算外币汇率均值
  const ratesByCurrency: Record<string, number[]> = {};
  data.forEach(o => {
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
  const amounts = data.map(o => Number(o.amount) || 0).filter(a => a > 0);
  const avgCardWorth = amounts.length > 0
    ? amounts.reduce((a, b) => a + b, 0) / amounts.length : 0;
  const stdCardWorth = amounts.length > 1
    ? Math.sqrt(amounts.reduce((sum, a) => sum + Math.pow(a - avgCardWorth, 2), 0) / amounts.length) : 0;

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
        message: `利润率为负数 (${params.profitRate.toFixed(2)}%)，此订单将产生亏损`,
        severity: 'danger',
        currentValue: params.profitRate,
      });
    }
    if (params.profitRate > 50) {
      warnings.push({
        type: 'profit_rate',
        message: `利润率异常偏高 (${params.profitRate.toFixed(2)}%)，请确认数值是否正确`,
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
      message: `利润率为负数 (${params.profitRate.toFixed(2)}%)，此订单将产生亏损。历史平均利润率: ${stats.avgProfitRate.toFixed(2)}%`,
      severity: 'danger',
      currentValue: params.profitRate,
      avgValue: stats.avgProfitRate,
    });
  } else if (stats.stdProfitRate > 0 && Math.abs(params.profitRate - stats.avgProfitRate) > 3 * stats.stdProfitRate) {
    warnings.push({
      type: 'profit_rate',
      message: `利润率 (${params.profitRate.toFixed(2)}%) 偏离历史均值 (${stats.avgProfitRate.toFixed(2)}%) 超过3个标准差`,
      severity: 'warning',
      currentValue: params.profitRate,
      avgValue: stats.avgProfitRate,
    });
  } else if (params.profitRate > 50) {
    warnings.push({
      type: 'profit_rate',
      message: `利润率异常偏高 (${params.profitRate.toFixed(2)}%)，历史平均: ${stats.avgProfitRate.toFixed(2)}%`,
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
        message: `${params.currency} 汇率 (${params.foreignRate.toFixed(2)}) 偏离近期均值 (${avgRate.toFixed(2)}) 超过15%`,
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
        message: `订单金额 (¥${params.cardWorth.toFixed(0)}) 显著偏离历史均值 (¥${stats.avgCardWorth.toFixed(0)})`,
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
