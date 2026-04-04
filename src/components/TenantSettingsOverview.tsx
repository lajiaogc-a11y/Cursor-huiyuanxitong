import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  RefreshCw,
  ChevronDown,
  ChevronRight,
  DollarSign,
  Shield,
  Settings2,
  Coins,
  Gift,
  Lock,
  Loader2,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useIsMobile, useIsTablet } from '@/hooks/use-mobile';
import { loadMultipleSharedData } from '@/services/finance/sharedDataService';
import { resolveAllRates, invalidateRatesBatch, type ResolvedRatesSummary } from '@/lib/resolveRates';
import { mergeAuditSettings, type AuditSettings, ORDER_AUDIT_FIELDS, MEMBER_AUDIT_FIELDS, ACTIVITY_AUDIT_FIELDS, ORDER_OPERATION_FIELDS } from '@/lib/auditSettingsTypes';

interface SectionProps {
  title: string;
  icon: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

function Section({ title, icon, defaultOpen = true, children }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex items-center gap-2 w-full text-left py-2 px-1 rounded hover:bg-muted/50 transition-colors">
        {open ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
        <span className="shrink-0">{icon}</span>
        <span className="font-medium text-sm">{title}</span>
      </CollapsibleTrigger>
      <CollapsibleContent className="pl-7 pr-1 pb-3 space-y-2">{children}</CollapsibleContent>
    </Collapsible>
  );
}

function KV({ label, value, badge }: { label: string; value: React.ReactNode; badge?: 'on' | 'off' }) {
  return (
    <div className="flex items-center justify-between py-1 text-sm border-b border-border/40 last:border-b-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums flex items-center gap-1.5">
        {badge === 'on' && <Badge variant="default" className="text-[10px] px-1.5 py-0 bg-emerald-500/90">ON</Badge>}
        {badge === 'off' && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">OFF</Badge>}
        {value}
      </span>
    </div>
  );
}

function EnabledFields({ label, settings, fieldDefs }: { label: string; settings: string[]; fieldDefs: { key: string; label_zh: string; label_en: string }[] }) {
  const { language } = useLanguage();
  if (!settings.length) return <KV label={label} value={<span className="text-muted-foreground text-xs">—</span>} />;
  const names = settings.map(k => {
    const f = fieldDefs.find(d => d.key === k);
    return f ? (language === 'zh' ? f.label_zh : f.label_en) : k;
  });
  return <KV label={label} value={<span className="text-xs max-w-[220px] truncate" title={names.join(', ')}>{names.join(', ')}</span>} />;
}

export default function TenantSettingsOverview() {
  const { t } = useLanguage();
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  const compact = isMobile || isTablet;

  const [loading, setLoading] = useState(true);
  const [rates, setRates] = useState<ResolvedRatesSummary | null>(null);
  const [audit, setAudit] = useState<AuditSettings | null>(null);
  const [feeSettings, setFeeSettings] = useState<any>(null);
  const [pointsSettings, setPointsSettings] = useState<any>(null);
  const [activitySettings, setActivitySettings] = useState<any>(null);
  const [copySettings, setCopySettings] = useState<any>(null);
  const [productionLock, setProductionLock] = useState<any>(null);
  const [autoUpdate, setAutoUpdate] = useState<any>(null);
  const [exchangeRateSettings, setExchangeRateSettings] = useState<any>(null);
  const [memoSettings, setMemoSettings] = useState<any>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      invalidateRatesBatch();
      const [resolvedRates, batchData] = await Promise.all([
        resolveAllRates(),
        loadMultipleSharedData([
          'auditSettings', 'feeSettings', 'points_settings', 'activitySettings',
          'copySettings', 'production_lock', 'currencyRatesAutoUpdate',
          'exchangeRateSettings', 'memoSettings',
        ]),
      ]);
      setRates(resolvedRates);
      setAudit(mergeAuditSettings(batchData.auditSettings));
      setFeeSettings(batchData.feeSettings);
      setPointsSettings(batchData.points_settings);
      setActivitySettings(batchData.activitySettings);
      setCopySettings(batchData.copySettings);
      setProductionLock(batchData.production_lock);
      setAutoUpdate(batchData.currencyRatesAutoUpdate);
      setExchangeRateSettings(batchData.exchangeRateSettings);
      setMemoSettings(batchData.memoSettings);
    } catch (e) {
      console.error('[TenantOverview] load error', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const fmt = (v: number | undefined | null, digits = 2) => v != null && v > 0 ? v.toFixed(digits) : '—';
  const bool = (v: unknown) => v ? 'on' as const : 'off' as const;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold">{t('租户设置总览', 'Tenant Settings Overview')}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">{t('只读聚合所有配置的当前值', 'Read-only aggregation of all current settings')}</p>
        </div>
        <Button variant="outline" size="sm" onClick={loadAll}>
          <RefreshCw className="h-3.5 w-3.5 mr-1" />
          {t('刷新', 'Refresh')}
        </Button>
      </div>

      <div className={compact ? 'space-y-3' : 'grid grid-cols-2 gap-4'}>
        {/* 汇率总览 */}
        <Card>
          <CardContent className="pt-4 pb-3 px-4 space-y-0">
            <Section title={t('汇率', 'Exchange Rates')} icon={<DollarSign className="h-4 w-4 text-blue-500" />}>
              <KV label="USDT/CNY" value={fmt(rates?.usdtCny)} />
              <KV label={t('USDT 卖出价', 'USDT Sell')} value={fmt(rates?.usdtSell)} />
              <KV label={t('奈拉(RMB基准)', 'Naira (RMB)')} value={fmt(rates?.naira, 0)} />
              <KV label={t('赛地(RMB基准)', 'Cedi (RMB)')} value={fmt(rates?.cedi, 4)} />
              <KV label="USD→NGN" value={fmt(rates?.usdToNgn, 0)} />
              <KV label="USD→GHS" value={fmt(rates?.usdToGhs)} />
              <KV label={t('自动采集USD汇率', 'Auto-fetch USD rates')} value="" badge={bool(exchangeRateSettings?.autoUpdateEnabled ?? exchangeRateSettings?.autoUpdate)} />
              <KV label={t('多币种自动更新', 'Currency auto-update')} value="" badge={bool(autoUpdate?.enabled)} />
            </Section>
          </CardContent>
        </Card>

        {/* 手续费 */}
        <Card>
          <CardContent className="pt-4 pb-3 px-4 space-y-0">
            <Section title={t('手续费', 'Fees')} icon={<Coins className="h-4 w-4 text-amber-500" />}>
              <KV label={t('奈拉阈值', 'NGN Threshold')} value={fmt(feeSettings?.nairaThreshold, 0)} />
              <KV label={t('奈拉手续费(≥阈值)', 'NGN Fee (≥threshold)')} value={fmt(feeSettings?.nairaFeeAbove, 0)} />
              <KV label={t('奈拉手续费(<阈值)', 'NGN Fee (<threshold)')} value={fmt(feeSettings?.nairaFeeBelow, 0)} />
              <KV label={t('赛地阈值', 'GHS Threshold')} value={fmt(feeSettings?.cediThreshold, 0)} />
              <KV label={t('赛地手续费(≥阈值)', 'GHS Fee (≥threshold)')} value={fmt(feeSettings?.cediFeeAbove, 0)} />
              <KV label={t('赛地手续费(<阈值)', 'GHS Fee (<threshold)')} value={fmt(feeSettings?.cediFeeBelow, 0)} />
              <KV label={t('USDT汇率', 'USDT Rate')} value={fmt(feeSettings?.usdtExchangeRate)} />
            </Section>
          </CardContent>
        </Card>

        {/* 积分设置 */}
        <Card>
          <CardContent className="pt-4 pb-3 px-4 space-y-0">
            <Section title={t('积分', 'Points')} icon={<Gift className="h-4 w-4 text-purple-500" />}>
              <KV label={t('模式', 'Mode')} value={pointsSettings?.mode || '—'} />
              <KV label="NGN/USD" value={fmt(pointsSettings?.ngnToUsdRate, 0)} />
              <KV label="GHS/USD" value={fmt(pointsSettings?.ghsToUsdRate)} />
              <KV label={t('USD→积分', 'USD→Points')} value={fmt(pointsSettings?.usdToPointsRate)} />
              <KV label={t('推荐积分/次', 'Referral pts/action')} value={String(pointsSettings?.referralPointsPerAction ?? '—')} />
              <KV label={t('推荐模式', 'Referral mode')} value={pointsSettings?.referralMode || '—'} />
            </Section>
          </CardContent>
        </Card>

        {/* 活动设置 */}
        <Card>
          <CardContent className="pt-4 pb-3 px-4 space-y-0">
            <Section title={t('活动', 'Activity')} icon={<Gift className="h-4 w-4 text-green-500" />}>
              <KV label={t('累积奖励梯度数', 'Reward tiers')} value={String(activitySettings?.accumulatedRewardTiers?.length ?? 0)} />
              <KV label={t('推荐奖励', 'Referral reward')} value="" badge={bool(activitySettings?.referralReward?.isEnabled)} />
              <KV label={t('每推荐积分', 'Pts/referral')} value={String(activitySettings?.referralReward?.pointsPerReferral ?? '—')} />
              <KV label={t('积分→NGN', 'Points→NGN')} value={fmt(activitySettings?.activity2Config?.pointsToNGN, 0)} />
              <KV label={t('积分→GHS', 'Points→GHS')} value={fmt(activitySettings?.activity2Config?.pointsToGHS)} />
            </Section>
          </CardContent>
        </Card>

        {/* 审核设置 */}
        <Card>
          <CardContent className="pt-4 pb-3 px-4 space-y-0">
            <Section title={t('审核规则', 'Audit Rules')} icon={<Shield className="h-4 w-4 text-red-500" />}>
              <EnabledFields label={t('订单字段', 'Order fields')} settings={audit?.orderFields ?? []} fieldDefs={ORDER_AUDIT_FIELDS} />
              <EnabledFields label={t('订单操作', 'Order ops')} settings={audit?.orderOperations ?? []} fieldDefs={ORDER_OPERATION_FIELDS} />
              <EnabledFields label={t('会员字段', 'Member fields')} settings={audit?.memberFields ?? []} fieldDefs={MEMBER_AUDIT_FIELDS} />
              <EnabledFields label={t('活动字段', 'Activity fields')} settings={audit?.activityFields ?? []} fieldDefs={ACTIVITY_AUDIT_FIELDS} />
            </Section>
          </CardContent>
        </Card>

        {/* 系统状态 */}
        <Card>
          <CardContent className="pt-4 pb-3 px-4 space-y-0">
            <Section title={t('系统状态', 'System Status')} icon={<Settings2 className="h-4 w-4 text-slate-500" />}>
              <KV
                label={t('生产锁定', 'Production lock')}
                value={productionLock?.isLocked ? (
                  <span className="flex items-center gap-1 text-red-500"><Lock className="h-3 w-3" /> {t('已锁定', 'Locked')}</span>
                ) : (
                  <span className="flex items-center gap-1 text-emerald-500"><CheckCircle2 className="h-3 w-3" /> {t('未锁定', 'Unlocked')}</span>
                )}
              />
              <KV label={t('复制模板', 'Copy template')} value="" badge={bool(copySettings?.template)} />
              <KV label={t('包含汇率', 'Include rate')} value="" badge={bool(copySettings?.includeRate)} />
              <KV label={t('包含时间', 'Include time')} value="" badge={bool(copySettings?.includeTime)} />
              <KV label={t('备忘录自动清理', 'Memo auto-cleanup')} value="" badge={bool(memoSettings?.autoCleanupEnabled)} />
            </Section>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
