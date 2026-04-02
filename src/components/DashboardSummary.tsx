import { memo } from "react";
import { TrendingUp } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

interface DashboardSummaryProps {
  totalOrders: number;
  newUsers: number;
  tradingUsers: number;
  ngnVolume: number;
  ghsVolume: number;
  usdtVolume: number;
  ngnProfit: number;
  ghsProfit: number;
  usdtProfit: number;
  trendData: Array<{ date: string; orders: number; profit: number }>;
  selectedRange: string;
}

function generateSummaryZh(props: DashboardSummaryProps): string {
  const { totalOrders, newUsers, tradingUsers, ngnVolume, ghsVolume, usdtVolume, ngnProfit, ghsProfit, trendData, selectedRange } = props;

  const parts: string[] = [];

  // 订单概况
  if (totalOrders > 0) {
    parts.push(`${selectedRange}完成 ${totalOrders} 笔订单`);
  } else {
    parts.push(`${selectedRange}暂无已完成订单`);
  }

  // 趋势对比（仅多天时）
  if (trendData.length >= 2) {
    const lastDay = trendData[trendData.length - 1];
    const prevDay = trendData[trendData.length - 2];
    if (prevDay.orders > 0 && lastDay.orders > 0) {
      const change = ((lastDay.orders - prevDay.orders) / prevDay.orders * 100).toFixed(0);
      const num = Number(change);
      if (num > 0) {
        parts.push(`较前一日增长 ${change}%`);
      } else if (num < 0) {
        parts.push(`较前一日下降 ${Math.abs(num)}%`);
      }
    }
  }

  // 交易量最高的币种
  const volumes = [
    { name: 'NGN', vol: ngnVolume },
    { name: 'GHS', vol: ghsVolume },
    { name: 'USDT', vol: usdtVolume },
  ].filter(v => v.vol > 0).sort((a, b) => b.vol - a.vol);

  if (volumes.length > 0) {
    parts.push(`${volumes[0].name} 交易量最高`);
  }

  // 新用户与活跃用户
  if (newUsers > 0) {
    parts.push(`新增 ${newUsers} 位用户`);
  }
  if (tradingUsers > 0) {
    parts.push(`${tradingUsers} 位用户参与交易`);
  }

  // 利润概况
  const totalProfit = ngnProfit + ghsProfit;
  if (totalProfit > 0) {
    parts.push(`总利润 ¥${totalProfit.toLocaleString('en-US', { maximumFractionDigits: 0 })}`);
  } else if (totalProfit < 0) {
    parts.push(`总利润为负 (¥${totalProfit.toLocaleString('en-US', { maximumFractionDigits: 0 })}), 请关注`);
  }

  return parts.join('。') + '。';
}

function generateSummaryEn(props: DashboardSummaryProps): string {
  const { totalOrders, newUsers, tradingUsers, ngnVolume, ghsVolume, usdtVolume, ngnProfit, ghsProfit, trendData, selectedRange } = props;

  const rangeMap: Record<string, string> = {
    '今日': 'Today', '昨日': 'Yesterday', '本周': 'This week',
    '上周': 'Last week', '本月': 'This month', '上月': 'Last month', '自定义': 'Selected period'
  };
  const range = rangeMap[selectedRange] || selectedRange;
  const parts: string[] = [];

  if (totalOrders > 0) {
    parts.push(`${range}: ${totalOrders} orders completed`);
  } else {
    parts.push(`${range}: No completed orders`);
  }

  if (trendData.length >= 2) {
    const lastDay = trendData[trendData.length - 1];
    const prevDay = trendData[trendData.length - 2];
    if (prevDay.orders > 0 && lastDay.orders > 0) {
      const change = ((lastDay.orders - prevDay.orders) / prevDay.orders * 100).toFixed(0);
      const num = Number(change);
      if (num > 0) parts.push(`up ${change}% from previous day`);
      else if (num < 0) parts.push(`down ${Math.abs(num)}% from previous day`);
    }
  }

  const volumes = [
    { name: 'NGN', vol: ngnVolume },
    { name: 'GHS', vol: ghsVolume },
    { name: 'USDT', vol: usdtVolume },
  ].filter(v => v.vol > 0).sort((a, b) => b.vol - a.vol);

  if (volumes.length > 0) parts.push(`${volumes[0].name} has highest volume`);
  if (newUsers > 0) parts.push(`${newUsers} new users`);
  if (tradingUsers > 0) parts.push(`${tradingUsers} active traders`);

  const totalProfit = ngnProfit + ghsProfit;
  if (totalProfit > 0) parts.push(`total profit ¥${totalProfit.toLocaleString('en-US', { maximumFractionDigits: 0 })}`);
  else if (totalProfit < 0) parts.push(`negative profit (¥${totalProfit.toLocaleString('en-US', { maximumFractionDigits: 0 })}), needs attention`);

  return parts.join('. ') + '.';
}

export const DashboardSummary = memo(function DashboardSummary(props: DashboardSummaryProps) {
  const { language } = useLanguage();
  const summary = language === 'zh' ? generateSummaryZh(props) : generateSummaryEn(props);

  if (!summary || props.totalOrders === 0 && props.newUsers === 0) return null;

  return (
    <div className="flex items-start gap-2.5 px-4 py-3 rounded-lg bg-primary/5 border border-primary/20">
      <TrendingUp className="h-4 w-4 text-primary shrink-0 mt-0.5" />
      <p className="text-sm text-foreground leading-relaxed">{summary}</p>
    </div>
  );
});
