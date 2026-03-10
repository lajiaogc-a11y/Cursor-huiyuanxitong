import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/contexts/LanguageContext';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Legend, LineChart, Line } from 'recharts';
import { ArrowUpRight, ArrowDownRight, Minus, TrendingUp } from 'lucide-react';
import { safeToFixed } from '@/lib/safeCalc';

type CompareMode = 'wow' | 'mom';

interface PeriodData {
  label: string;
  orders: number;
  profitNgn: number;
  profitUsdt: number;
}

function getWeekRange(weeksAgo: number) {
  const now = new Date();
  const dayOfWeek = now.getDay() || 7;
  const endOfThisWeek = new Date(now);
  endOfThisWeek.setDate(now.getDate() - dayOfWeek + 7);
  endOfThisWeek.setHours(23, 59, 59, 999);

  const end = new Date(endOfThisWeek);
  end.setDate(end.getDate() - weeksAgo * 7);
  const start = new Date(end);
  start.setDate(start.getDate() - 6);
  start.setHours(0, 0, 0, 0);
  return { start, end };
}

function getMonthRange(monthsAgo: number) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - monthsAgo, 1);
  const end = new Date(now.getFullYear(), now.getMonth() - monthsAgo + 1, 0, 23, 59, 59, 999);
  return { start, end };
}

async function fetchPeriodOrders(start: Date, end: Date) {
  const { data, error } = await supabase
    .from('orders')
    .select('profit_ngn, profit_usdt, created_at')
    .eq('is_deleted', false)
    .eq('status', 'completed')
    .gte('created_at', start.toISOString())
    .lte('created_at', end.toISOString())
    .limit(1000);
  if (error) throw error;
  return data || [];
}

function ChangeIndicator({ current, previous, suffix = '' }: { current: number; previous: number; suffix?: string }) {
  if (previous === 0 && current === 0) return <Minus className="h-4 w-4 text-muted-foreground" />;
  const pct = previous === 0 ? 100 : ((current - previous) / Math.abs(previous)) * 100;
  const isUp = pct > 0;
  const isZero = Math.abs(pct) < 0.01;

  if (isZero) return <span className="text-xs text-muted-foreground">-</span>;

  return (
    <span className={`flex items-center gap-0.5 text-xs font-medium ${isUp ? 'text-emerald-600' : 'text-destructive'}`}>
      {isUp ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
      {safeToFixed(Math.abs(pct), 1)}%{suffix}
    </span>
  );
}

export default function ProfitComparisonTab() {
  const { t } = useLanguage();
  const [mode, setMode] = useState<CompareMode>('wow');

  const currentRange = mode === 'wow' ? getWeekRange(0) : getMonthRange(0);
  const previousRange = mode === 'wow' ? getWeekRange(1) : getMonthRange(1);

  const { data: currentOrders = [] } = useQuery({
    queryKey: ['profit-compare-current', mode, currentRange.start.toISOString()],
    queryFn: () => fetchPeriodOrders(currentRange.start, currentRange.end),
  });

  const { data: previousOrders = [] } = useQuery({
    queryKey: ['profit-compare-previous', mode, previousRange.start.toISOString()],
    queryFn: () => fetchPeriodOrders(previousRange.start, previousRange.end),
  });

  const current: PeriodData = useMemo(() => ({
    label: mode === 'wow' ? t('本周', 'This Week') : t('本月', 'This Month'),
    orders: currentOrders.length,
    profitNgn: currentOrders.reduce((s, o) => s + (Number(o.profit_ngn) || 0), 0),
    profitUsdt: currentOrders.reduce((s, o) => s + (Number(o.profit_usdt) || 0), 0),
  }), [currentOrders, mode, t]);

  const previous: PeriodData = useMemo(() => ({
    label: mode === 'wow' ? t('上周', 'Last Week') : t('上月', 'Last Month'),
    orders: previousOrders.length,
    profitNgn: previousOrders.reduce((s, o) => s + (Number(o.profit_ngn) || 0), 0),
    profitUsdt: previousOrders.reduce((s, o) => s + (Number(o.profit_usdt) || 0), 0),
  }), [previousOrders, mode, t]);

  // Daily breakdown for chart
  const chartData = useMemo(() => {
    const days = mode === 'wow' ? 7 : new Date(currentRange.end.getFullYear(), currentRange.end.getMonth() + 1, 0).getDate();
    const result: { day: string; current: number; previous: number }[] = [];

    for (let i = 0; i < days; i++) {
      const curDay = new Date(currentRange.start);
      curDay.setDate(curDay.getDate() + i);
      const prevDay = new Date(previousRange.start);
      prevDay.setDate(prevDay.getDate() + i);

      const curDayStr = curDay.toISOString().slice(0, 10);
      const prevDayStr = prevDay.toISOString().slice(0, 10);

      const curProfit = currentOrders
        .filter(o => o.created_at?.slice(0, 10) === curDayStr)
        .reduce((s, o) => s + (Number(o.profit_ngn) || 0), 0);
      const prevProfit = previousOrders
        .filter(o => o.created_at?.slice(0, 10) === prevDayStr)
        .reduce((s, o) => s + (Number(o.profit_ngn) || 0), 0);

      result.push({
        day: `${curDay.getMonth() + 1}/${curDay.getDate()}`,
        current: parseFloat(curProfit.toFixed(2)),
        previous: parseFloat(prevProfit.toFixed(2)),
      });
    }
    return result;
  }, [currentOrders, previousOrders, currentRange, previousRange, mode]);

  const chartConfig = {
    current: { label: current.label, color: 'hsl(var(--primary))' },
    previous: { label: previous.label, color: 'hsl(var(--muted-foreground))' },
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          <span className="font-medium text-sm">{t('利润对比分析', 'Profit Comparison')}</span>
        </div>
        <Select value={mode} onValueChange={(v) => setMode(v as CompareMode)}>
          <SelectTrigger className="w-[120px] h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="wow">{t('周环比', 'Week over Week')}</SelectItem>
            <SelectItem value="mom">{t('月环比', 'Month over Month')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">{t('订单数', 'Orders')}</p>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-lg font-bold">{current.orders}</span>
              <ChangeIndicator current={current.orders} previous={previous.orders} />
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {previous.label}: {previous.orders}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">{t('利润(元)', 'Profit(CNY)')}</p>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-lg font-bold">¥{safeToFixed(current.profitNgn, 2)}</span>
              <ChangeIndicator current={current.profitNgn} previous={previous.profitNgn} />
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {previous.label}: ¥{safeToFixed(previous.profitNgn, 2)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">{t('利润(USDT)', 'Profit(USDT)')}</p>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-lg font-bold">{safeToFixed(current.profitUsdt, 4)}</span>
              <ChangeIndicator current={current.profitUsdt} previous={previous.profitUsdt} />
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {previous.label}: {safeToFixed(previous.profitUsdt, 4)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Chart */}
      <Card>
        <CardContent className="p-4">
          <p className="text-xs font-medium text-muted-foreground mb-3">
            {t('每日利润对比 (元)', 'Daily Profit Comparison (CNY)')}
          </p>
          <ChartContainer config={chartConfig} className="h-[280px] w-full">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="current" name={current.label} fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
              <Bar dataKey="previous" name={previous.label} fill="hsl(var(--muted-foreground) / 0.4)" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>
    </div>
  );
}
