/**
 * Phase 7: 抽奖运营仪表盘
 * 展示今日预算、发放、库存、实际 RTP、风控命中数
 */
import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { RefreshCw, Loader2, TrendingUp, Shield, Package, Wallet, AlertTriangle, Dices } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  adminGetOperationalStats,
  type OperationalStats,
} from '@/services/lottery/lotteryService';
import { SectionTitle } from './shared';

function StatBox({ label, value, sub, icon: Icon, color = 'text-foreground' }: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
  color?: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border p-3 bg-muted/10">
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted/30 ${color}`}>
        <Icon className="h-4.5 w-4.5" strokeWidth={1.8} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium text-muted-foreground leading-tight">{label}</p>
        <p className={`text-lg font-bold tabular-nums leading-tight mt-0.5 ${color}`}>{value}</p>
        {sub && <p className="text-[10px] text-muted-foreground/70 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

export default function LotteryOperationalDashboard() {
  const { t } = useLanguage();
  const [stats, setStats] = useState<OperationalStats | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await adminGetOperationalStats();
      if (r) setStats(r);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (!stats && !loading) return null;

  const b = stats?.budget;
  const td = stats?.today;
  const risk = stats?.risk;
  const budgetEnabled = (b?.daily_budget ?? 0) > 0;
  const budgetPct = budgetEnabled && b!.effective_cap > 0
    ? Math.min(100, Math.round((b!.daily_used / b!.effective_cap) * 100))
    : 0;

  const policyLabel = (p: string) => {
    if (p === 'deny') return t('拒抽', 'Deny');
    if (p === 'fallback') return t('保底', 'Fallback');
    return t('降级', 'Downgrade');
  };

  const prizeTypeLabel = (raw: string) => {
    const v = String(raw ?? '').trim().toLowerCase();
    if (v === 'none') return t('无', 'None');
    if (v === 'points') return t('积分', 'Points');
    if (v === 'custom') return t('自定义', 'Custom');
    return raw;
  };

  const rewardStatusLabel = (raw: string) => {
    const v = String(raw ?? '').trim().toLowerCase();
    if (v === 'done') return t('已完成', 'Done');
    if (v === 'pending') return t('待发放', 'Pending');
    if (v === 'failed') return t('失败', 'Failed');
    return raw;
  };

  return (
    <Card>
      <CardContent className="pt-5 space-y-5">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <SectionTitle>{t('运营仪表盘', 'Operational Dashboard')}</SectionTitle>
          <div className="flex items-center gap-2">
            {stats?.date && (
              <span className="text-[11px] text-muted-foreground tabular-nums">{stats.date}</span>
            )}
            <Button type="button" variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1.5 h-7 text-xs">
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              {t('刷新', 'Refresh')}
            </Button>
          </div>
        </div>

        {loading && !stats ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : stats ? (
          <>
            {/* ── 今日概览：积分成本 vs 综合奖品成本分开展示 ── */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <StatBox
                icon={Dices}
                label={t('今日抽奖', 'Draws Today')}
                value={td?.draws ?? 0}
                color="text-blue-600 dark:text-blue-400"
              />
              <StatBox
                icon={TrendingUp}
                label={t('今日中奖', 'Winners Today')}
                value={td?.winners ?? 0}
                color="text-emerald-600 dark:text-emerald-400"
              />
              <StatBox
                icon={TrendingUp}
                label={t('今日发放积分', 'Points Issued Today')}
                value={(td?.points_awarded ?? td?.points_cost ?? td?.cost ?? 0).toFixed(0)}
                sub={t('积分类奖品到账合计', 'Sum of points prizes')}
                color="text-emerald-700 dark:text-emerald-300"
              />
              <StatBox
                icon={Wallet}
                label={t('今日成本', 'Cost Today')}
                value={(td?.cost ?? td?.points_cost ?? 0).toFixed(2)}
                sub={
                  (td?.avg_points_cost_per_draw ?? td?.avg_cost_per_draw)
                    ? `${t('次均', 'Per draw')}: ${(td.avg_points_cost_per_draw ?? td.avg_cost_per_draw).toFixed(2)}`
                    : undefined
                }
                color="text-amber-600 dark:text-amber-400"
              />
              <StatBox
                icon={Wallet}
                label={t('今日综合奖品成本', 'Composite Prize Cost')}
                value={(td?.composite_prize_cost ?? 0).toFixed(2)}
                sub={t('含custom标价与prize_cost', 'Incl. custom & prize_cost')}
                color="text-orange-700 dark:text-orange-300"
              />
              <StatBox
                icon={Shield}
                label={t('风控拦截', 'Risk Blocked')}
                value={risk?.blocked_today ?? 0}
                sub={
                  (risk?.failed_rewards ?? 0) > 0
                    ? `${t('待补偿', 'Pending')}: ${(risk?.failed_rewards ?? 0) + (risk?.pending_rewards ?? 0)}`
                    : risk?.enabled ? t('风控已启用', 'Risk enabled') : t('风控未启用', 'Risk disabled')
                }
                color={risk?.enabled ? 'text-rose-600 dark:text-rose-400' : 'text-muted-foreground'}
              />
            </div>

            {stats.cost_breakdown && stats.cost_breakdown.length > 0 ? (
              <div className="rounded-xl border p-3 space-y-2 bg-muted/5">
                <p className="text-xs font-semibold text-muted-foreground">
                  {t('今日发奖明细（综合行 vs 积分行）', "Today's prize lines (composite vs points)")}
                </p>
                <div className="overflow-x-auto max-h-56 text-[10px]">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="text-left border-b text-muted-foreground">
                        <th className="py-1 pr-2">{t('奖品', 'Prize')}</th>
                        <th className="py-1 pr-2">{t('类型', 'Type')}</th>
                        <th className="py-1 pr-2">{t('状态', 'Status')}</th>
                        <th className="py-1 pr-2 tabular-nums">{t('奖励积分', 'Reward pts')}</th>
                        <th className="py-1 pr-2 tabular-nums">{t('展示值', 'Display value')}</th>
                        <th className="py-1 pr-2 tabular-nums">{t('发奖成本', 'Prize cost')}</th>
                        <th className="py-1 pr-2 tabular-nums">{t('综合行', 'Composite row')}</th>
                        <th className="py-1 pr-2 tabular-nums">{t('积分行', 'Points row')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.cost_breakdown.map((r) => (
                        <tr key={r.id} className="border-b border-border/40">
                          <td className="py-0.5 pr-2 max-w-[140px] truncate">{r.prize_name}</td>
                          <td className="py-0.5 pr-2">{prizeTypeLabel(r.prize_type)}</td>
                          <td className="py-0.5 pr-2">{rewardStatusLabel(r.reward_status)}</td>
                          <td className="py-0.5 pr-2 tabular-nums">{r.reward_points ?? '—'}</td>
                          <td className="py-0.5 pr-2 tabular-nums">{r.prize_value}</td>
                          <td className="py-0.5 pr-2 tabular-nums">{r.prize_cost}</td>
                          <td className="py-0.5 pr-2 tabular-nums font-medium">{r.line_composite_cost}</td>
                          <td className="py-0.5 pr-2 tabular-nums">{r.line_points_cost}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            {/* ── 预算 / RTP ── */}
            {budgetEnabled && b ? (
              <div className="rounded-xl border p-4 space-y-3 bg-muted/5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <p className="text-sm font-bold">{t('今日预算', 'Today\'s Budget')}</p>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px] h-5">
                      {policyLabel(b.budget_policy)}
                    </Badge>
                    {b.target_rtp > 0 && (
                      <Badge variant="outline" className="text-[10px] h-5">
                        RTP {b.target_rtp}%
                      </Badge>
                    )}
                  </div>
                </div>
                <Progress value={budgetPct} className="h-2.5" />
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="tabular-nums">
                    {t('已用', 'Used')}: {b.daily_used.toFixed(2)} / {b.effective_cap.toFixed(2)}
                  </span>
                  <span className="tabular-nums font-semibold">
                    {b.daily_remaining >= 0
                      ? `${t('剩余', 'Left')}: ${b.daily_remaining.toFixed(2)}`
                      : t('无限制', 'Unlimited')}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-xs">
                  <span>
                    {t('实际 RTP', 'Actual RTP')}:{' '}
                    <span className={`font-bold tabular-nums ${b.actual_rtp > 100 ? 'text-destructive' : b.actual_rtp > 80 ? 'text-amber-600' : 'text-emerald-600'}`}>
                      {b.actual_rtp.toFixed(1)}%
                    </span>
                  </span>
                  {(b.today_order_points ?? 0) > 0 ? (
                    <span className="tabular-nums text-muted-foreground/80">
                      {t('今日订单积分', 'Today order pts')}: {(b.today_order_points ?? 0).toFixed(0)}
                    </span>
                  ) : null}
                  {b.actual_rtp > 100 && (
                    <span className="inline-flex items-center gap-1 text-destructive font-medium">
                      <AlertTriangle className="h-3 w-3" />
                      {t('超预算', 'Over budget')}
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed p-3 text-center text-xs text-muted-foreground/70">
                {t('未配置每日预算限制', 'No daily budget limit configured')}
              </div>
            )}

            {/* ── 库存 ── */}
            {stats.stock.some((s) => s.stock_enabled) ? (
              <div className="space-y-2">
                <p className="text-sm font-bold flex items-center gap-1.5">
                  <Package className="h-4 w-4 text-muted-foreground" />
                  {t('奖品库存', 'Prize Stock')}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {stats.stock.filter((s) => s.stock_enabled).map((s) => {
                    const pct = s.stock_total > 0 ? Math.round((s.stock_used / s.stock_total) * 100) : 0;
                    const depleted = s.stock_remaining === 0;
                    return (
                      <div key={s.id} className="flex items-center gap-3 rounded-lg border p-2.5 bg-muted/5">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium truncate">{s.name}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <Progress value={pct} className="h-1.5 flex-1" />
                            <span className={`text-[10px] tabular-nums font-semibold shrink-0 ${depleted ? 'text-destructive' : 'text-muted-foreground'}`}>
                              {s.stock_used}/{s.stock_total}
                            </span>
                          </div>
                        </div>
                        {depleted && (
                          <Badge variant="destructive" className="text-[9px] h-4 shrink-0">
                            {t('售罄', 'Sold out')}
                          </Badge>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
