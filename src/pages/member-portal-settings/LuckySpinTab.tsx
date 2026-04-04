/**
 * LuckySpinTab — 幸运抽奖设置 tab
 * 权重抽奖模型：概率字段为任意非负权重，运行时自动归一化，不再强制总和=100。
 */
import { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Trash2, Save, Loader2, Package, ShieldAlert, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { notify } from "@/lib/notifyHub";
import { useLanguage } from '@/contexts/LanguageContext';
import {
  adminGetLotteryPrizes,
  adminGetLotterySettings,
  adminSaveLotteryPrizes,
  adminSaveLotterySettings,
  type LotteryPrize,
  type LotteryPrizeType,
  type LotterySettings,
} from '@/services/lottery/lotteryService';
import { SectionTitle } from './shared';
import LotteryOperationalDashboard from './LotteryOperationalDashboard';

/** 允许输入过程中的「12.」等中间态，避免受控 number 立刻 parse 掉小数点 */
const DECIMAL_TYPING_RE = /^\d*\.?\d*$/;

function endsWithLoneDot(s: string): boolean {
  return /\.$/.test(s.trim());
}

interface Props {
  lotteryPrizes: LotteryPrize[];
  setLotteryPrizes: React.Dispatch<React.SetStateAction<LotteryPrize[]>>;
  lotterySettings: LotterySettings;
  setLotterySettings: React.Dispatch<React.SetStateAction<LotterySettings>>;
  savingSpinPrizes: boolean;
  setSavingSpinPrizes: React.Dispatch<React.SetStateAction<boolean>>;
}

export default function LuckySpinTab({
  lotteryPrizes, setLotteryPrizes,
  lotterySettings, setLotterySettings,
  savingSpinPrizes, setSavingSpinPrizes,
}: Props) {
  const { t } = useLanguage();
  const [removePrizeIdx, setRemovePrizeIdx] = useState<number | null>(null);
  /** win | display，key = `${kind}:${idx}`，解决小数点输入被 parse 掉的问题 */
  const [probFieldDrafts, setProbFieldDrafts] = useState<Record<string, string>>({});

  const lotteryWeightTotal = useMemo(
    () => lotteryPrizes.reduce((acc, x) => acc + Math.max(0, Number(x.probability || 0)), 0),
    [lotteryPrizes],
  );
  const hasThanksPrize = useMemo(() => lotteryPrizes.some(p => p.type === 'none'), [lotteryPrizes]);

  const addLotteryPrize = () => {
    setLotteryPrizes(prev => [...prev, {
      name: '', type: 'points' as LotteryPrizeType, value: 0,
      description: null, probability: 0, display_probability: null, image_url: null,
      sort_order: prev.length, prize_cost: 0, stock_enabled: false, stock_total: -1, daily_stock_limit: -1,
    }]);
  };
  const removeLotteryPrize = (idx: number) => {
    setProbFieldDrafts({});
    setLotteryPrizes(prev => prev.filter((_, i) => i !== idx));
  };
  const updateLotteryPrize = (idx: number, patch: Partial<LotteryPrize>) => {
    setLotteryPrizes(prev => prev.map((x, i) => (i === idx ? { ...x, ...patch } : x)));
  };

  const saveLotteryPrizes = async () => {
    if (!hasThanksPrize) {
      notify.error(t('必须包含一个\u201C感谢参与\u201D类型奖品', 'Must include a \u201CThanks for participating\u201D prize'));
      return;
    }
    setSavingSpinPrizes(true);
    try {
      await adminSaveLotteryPrizes(lotteryPrizes);
      setProbFieldDrafts({});
      setLotteryPrizes(await adminGetLotteryPrizes());
      notify.success(t('奖品配置已保存', 'Prize config saved'));
    } catch (e: any) {
      notify.error(e?.message || t('保存失败', 'Save failed'));
    } finally {
      setSavingSpinPrizes(false);
    }
  };

  const saveLotterySettingsHandler = async () => {
    try {
      await adminSaveLotterySettings(lotterySettings);
      const fresh = await adminGetLotterySettings();
      setLotterySettings(fresh);
      notify.success(t('抽奖设置已保存', 'Lottery settings saved'));
    } catch (e: any) {
      notify.error(e?.message || t('保存失败', 'Save failed'));
    }
  };

  const pendingRemovePrizeLabel =
    removePrizeIdx !== null
      ? lotteryPrizes[removePrizeIdx]?.name?.trim() || t("未命名奖品", "Unnamed prize")
      : "";

  return (
    <div className="space-y-10">
      {/* ── 0) 运营仪表盘 ── */}
      <LotteryOperationalDashboard />

      {/* ── A) 基础抽奖设置 ── */}
      <Card>
        <CardContent className="pt-5 space-y-4">
          <SectionTitle>{t("抽奖设置", "Lottery Settings")}</SectionTitle>
          <div className="flex items-center gap-4 flex-wrap">
            <Label className="flex items-center gap-2">
              {t("启用抽奖", "Enable Lottery")}
              <Switch
                checked={lotterySettings.enabled}
                onCheckedChange={(v) => setLotterySettings(prev => ({ ...prev, enabled: v }))}
              />
            </Label>
            <Label className="flex items-center gap-2">
              {t("每日免费次数", "Daily Free Spins")}
              <Input
                type="number"
                min={0}
                value={lotterySettings.daily_free_spins}
                onChange={(e) => setLotterySettings(prev => ({ ...prev, daily_free_spins: Math.max(0, Number(e.target.value || 0)) }))}
                className="w-24"
              />
            </Label>
            <Button size="sm" className="gap-1.5" onClick={saveLotterySettingsHandler}>
              <Save className="h-3.5 w-3.5" />
              {t("保存设置", "Save Settings")}
            </Button>
          </div>
          <div className="space-y-3 pt-2 border-t border-border/60">
            <p className="text-xs text-muted-foreground">
              {t(
                "会员在门户完成交易（员工将订单标为「已完成」）后，按下方次数为其增加转盘抽奖机会（与每日免费、签到等次数合并计算）。",
                "When staff marks an order completed, the member earns extra wheel spins (combined with daily free spins, check-in rewards, etc.).",
              )}
            </p>
            <div className="flex flex-wrap items-center gap-4">
              <Label className="flex items-center gap-2">
                {t("交易完成赠送抽奖", "Spins per completed order")}
                <Switch
                  checked={lotterySettings.order_completed_spin_enabled === true}
                  onCheckedChange={(v) =>
                    setLotterySettings((prev) => ({ ...prev, order_completed_spin_enabled: v }))
                  }
                />
              </Label>
              <Label className="flex items-center gap-2">
                {t("每单赠送次数", "Spins per order")}
                <Input
                  type="number"
                  min={0}
                  disabled={lotterySettings.order_completed_spin_enabled !== true}
                  value={lotterySettings.order_completed_spin_amount ?? 1}
                  onChange={(e) =>
                    setLotterySettings((prev) => ({
                      ...prev,
                      order_completed_spin_amount: Math.max(0, Number(e.target.value || 0)),
                    }))
                  }
                  className="w-24"
                />
              </Label>
            </div>
          </div>
          <div className="space-y-2 pt-2 border-t border-border/60">
            <Label>{t("会员端「概率说明」", "Probability notice (member app)")}</Label>
            <Textarea
              rows={4}
              value={lotterySettings.probability_notice || ''}
              onChange={(e) =>
                setLotterySettings((prev) => ({
                  ...prev,
                  probability_notice: e.target.value.trim() === '' ? null : e.target.value,
                }))
              }
              placeholder={t(
                "可填写活动规则、免责说明等。会员在转盘页点击「概率说明」时与公示概率列表一同展示。",
                "Rules, disclaimers, etc. Shown in the member spin page \"Probability info\" dialog together with the prize odds list.",
              )}
            />
            <p className="text-xs text-muted-foreground">
              {t(
                "抽奖配置保存后立即生效，不受「发布管理」影响。点击「保存设置」即写入数据库并实时生效于会员端。",
                "Lottery settings take effect immediately after saving — independent of the Publish flow.",
              )}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ── B) 每日预算 / RTP ── */}
      <Card>
        <CardContent className="pt-5 space-y-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
            <SectionTitle>{t("每日预算与 RTP", "Daily Budget & RTP")}</SectionTitle>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label className="text-xs">{t("每日发奖预算（0=不限）", "Daily Reward Budget (0=unlimited)")}</Label>
              <Input
                type="number"
                min={0}
                step={10}
                value={lotterySettings.daily_reward_budget ?? 0}
                onChange={(e) => setLotterySettings(prev => ({ ...prev, daily_reward_budget: Math.max(0, Number(e.target.value || 0)) }))}
              />
              <p className="text-[11px] text-muted-foreground/70">{t("单位：积分。超出后按策略处理。", "Unit: points. When exceeded, budget policy applies.")}</p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t("今日已用预算（只读）", "Used Today (read-only)")}</Label>
              <Input
                type="number"
                readOnly
                value={lotterySettings.daily_reward_used ?? 0}
                className="bg-muted/50 cursor-not-allowed"
              />
              <p className="text-[11px] text-muted-foreground/70">{t("每日北京时间 0 点自动重置。", "Auto-resets at Beijing midnight each day.")}</p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t("目标 RTP（%，0=不限）", "Target RTP (%, 0=no limit)")}</Label>
              <Input
                type="number"
                min={0}
                max={100}
                step={1}
                value={lotterySettings.target_rtp ?? 0}
                onChange={(e) => setLotterySettings(prev => ({ ...prev, target_rtp: Math.min(100, Math.max(0, Number(e.target.value || 0))) }))}
              />
              <p className="text-[11px] text-muted-foreground/70">{t("有效预算上限 = min(预算, 预算×RTP/100)。", "Effective cap = min(budget, budget×RTP/100).")}</p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t("预算策略", "Budget Policy")}</Label>
              <Select
                value={lotterySettings.budget_policy ?? 'downgrade'}
                onValueChange={(v) => setLotterySettings(prev => ({ ...prev, budget_policy: v as 'deny' | 'downgrade' | 'fallback' }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="downgrade">{t("降级（压权，优先保底）", "Downgrade (suppress weights, fallback first)")}</SelectItem>
                  <SelectItem value="fallback">{t("保底（只保留低成本奖品）", "Fallback (only low-cost prizes)")}</SelectItem>
                  <SelectItem value="deny">{t("拒绝（预算耗尽禁止抽奖）", "Deny (block spins when exhausted)")}</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground/70">{t("预算耗尽时的行为：降级压权 / 仅保底 / 直接拒绝。", "Behavior when budget runs out: downgrade / fallback / deny.")}</p>
            </div>
          </div>
          <Button size="sm" className="gap-1.5" onClick={saveLotterySettingsHandler}>
            <Save className="h-3.5 w-3.5" />
            {t("保存预算设置", "Save Budget Settings")}
          </Button>
        </CardContent>
      </Card>

      {/* ── C) 风险控制 ── */}
      <Card>
        <CardContent className="pt-5 space-y-4">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-muted-foreground" />
            <SectionTitle>{t("风险控制", "Risk Control")}</SectionTitle>
          </div>
          <Label className="flex items-center gap-3">
            {t("启用风控", "Enable Risk Control")}
            <Switch
              checked={lotterySettings.risk_control_enabled === true}
              onCheckedChange={(v) => setLotterySettings(prev => ({ ...prev, risk_control_enabled: v }))}
            />
          </Label>
          <div className={cn("grid grid-cols-1 sm:grid-cols-2 gap-4 transition-opacity", !lotterySettings.risk_control_enabled && "opacity-40 pointer-events-none")}>
            <div className="space-y-1">
              <Label className="text-xs">{t("单账号每日抽奖上限（0=不限）", "Account daily limit (0=no limit)")}</Label>
              <Input
                type="number" min={0}
                value={lotterySettings.risk_account_daily_limit ?? 0}
                onChange={(e) => setLotterySettings(prev => ({ ...prev, risk_account_daily_limit: Math.max(0, Math.floor(Number(e.target.value || 0))) }))}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t("单账号60s内抽奖上限（0=不限）", "Account burst limit/60s (0=no limit)")}</Label>
              <Input
                type="number" min={0}
                value={lotterySettings.risk_account_burst_limit ?? 0}
                onChange={(e) => setLotterySettings(prev => ({ ...prev, risk_account_burst_limit: Math.max(0, Math.floor(Number(e.target.value || 0))) }))}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t("同IP每日抽奖上限（0=不限）", "IP daily limit (0=no limit)")}</Label>
              <Input
                type="number" min={0}
                value={lotterySettings.risk_ip_daily_limit ?? 0}
                onChange={(e) => setLotterySettings(prev => ({ ...prev, risk_ip_daily_limit: Math.max(0, Math.floor(Number(e.target.value || 0))) }))}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t("同IP 60s内抽奖上限（0=不限）", "IP burst limit/60s (0=no limit)")}</Label>
              <Input
                type="number" min={0}
                value={lotterySettings.risk_ip_burst_limit ?? 0}
                onChange={(e) => setLotterySettings(prev => ({ ...prev, risk_ip_burst_limit: Math.max(0, Math.floor(Number(e.target.value || 0))) }))}
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs">{t("风险分阈值（≥此值强制保底，0=不启用）", "Risk score threshold (≥ = force fallback, 0=off)")}</Label>
              <Input
                type="number" min={0}
                value={lotterySettings.risk_high_score_threshold ?? 0}
                onChange={(e) => setLotterySettings(prev => ({ ...prev, risk_high_score_threshold: Math.max(0, Math.floor(Number(e.target.value || 0))) }))}
                className="max-w-xs"
              />
              <p className="text-[11px] text-muted-foreground/70">{t("风险分由 IP 频率 + 账号频率计算；超出阈值时本次抽奖强制降为感谢参与。", "Score = IP + account frequency signals. Exceeding threshold forces 'thanks' prize.")}</p>
            </div>
          </div>
          <Button size="sm" className="gap-1.5" onClick={saveLotterySettingsHandler}>
            <Save className="h-3.5 w-3.5" />
            {t("保存风控设置", "Save Risk Settings")}
          </Button>
        </CardContent>
      </Card>

      {/* ── D) 奖品配置 ── */}
      <Card>
        <CardContent className="pt-5 space-y-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-muted-foreground" />
              <SectionTitle>{t("奖品配置", "Prize Configuration")}</SectionTitle>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={addLotteryPrize} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              {t("新增奖品", "Add Prize")}
            </Button>
          </div>

          {/* 权重汇总（中性展示，不再要求必须=100） */}
          <div className="text-xs text-muted-foreground">
            {t("当前权重总和", "Total weight")}：<span className="font-mono font-medium">{lotteryWeightTotal.toFixed(4)}</span>
            <span className="ml-2 opacity-60">{t("（运行时自动归一化，无需凑满 100）", "(auto-normalised at runtime — no need to sum to 100)")}</span>
          </div>
          {!hasThanksPrize && (
            <p className="text-xs text-destructive">
              {t('必须包含一个\u201C感谢参与\u201D类型奖品', 'Must include a \u201CThanks for participating\u201D prize')}
            </p>
          )}

          {/* 字段说明 */}
          <div className="rounded-lg border border-dashed p-3 bg-muted/10 text-[11px] text-muted-foreground/70 leading-relaxed space-y-1">
            <p><span className="font-medium text-muted-foreground">{t("奖品类型", "Type")}：</span>{t("积分 = 抽中自动发放；自定义 = 后台人工处理；感谢参与 = 未中奖", "Points=auto-award; Custom=manual; Thanks=no reward")}</p>
            <p><span className="font-medium text-muted-foreground">{t("中奖权重", "Weight")}：</span>{t("任意非负数，比值即为中奖概率（如 70/20/10 表示 70% / 20% / 10%）", "Any non-negative number; ratio determines win chance (e.g. 70/20/10 = 70%/20%/10%)")}</p>
            <p><span className="font-medium text-muted-foreground">{t("展示概率", "Display %")}：</span>{t("仅用于会员端公示，不影响抽奖逻辑；留空则等于真实权重比。", "Shown to members only; does not affect draw logic; empty = same as real ratio.")}</p>
            <p><span className="font-medium text-muted-foreground">{t("发奖成本", "Prize cost")}：</span>{t("积分成本，用于预算 / RTP 计算；留 0 表示无成本。", "Cost in points for budget/RTP tracking; 0 = free.")}</p>
            <p><span className="font-medium text-muted-foreground">{t("库存", "Stock")}：</span>{t("开启后超出库存自动降级为感谢参与；-1 表示不限。", "When enabled, out-of-stock auto-downgrades to Thanks; -1 = unlimited.")}</p>
          </div>

          <div className="space-y-4">
            {lotteryPrizes.map((item, idx) => (
              <div key={`${idx}-${item.id || 'new'}`} className="rounded-xl border p-3 bg-muted/20 space-y-3">
                {/* Row 1: type / name / value or description / remove */}
                <div className="flex items-start gap-2 flex-wrap">
                  <Badge variant="secondary" className="text-[11px] font-mono shrink-0 mt-2">
                    {idx + 1}
                  </Badge>
                  <div className="space-y-0.5">
                    <select
                      value={item.type}
                      onChange={(e) => updateLotteryPrize(idx, { type: e.target.value as LotteryPrizeType, value: e.target.value === 'none' ? 0 : item.value })}
                      className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                    >
                      <option value="points">{t('积分', 'Points')}</option>
                      <option value="custom">{t('自定义奖品', 'Custom Prize')}</option>
                      <option value="none">{t('感谢参与', 'Thanks')}</option>
                    </select>
                    <p className="text-[10px] text-muted-foreground/60 px-0.5">{t("奖品类型", "Type")}</p>
                  </div>
                  <div className="space-y-0.5 min-w-[100px] max-w-[180px]">
                    <Input
                      value={item.name}
                      onChange={(e) => updateLotteryPrize(idx, { name: e.target.value })}
                      placeholder={t("如：积分10、苹果手机", "e.g. 10 Points, iPhone")}
                    />
                    <p className="text-[10px] text-muted-foreground/60 px-0.5">{t("奖品名称（会员可见）", "Prize name")}</p>
                  </div>
                  {item.type === 'points' && (
                    <div className="space-y-0.5">
                      <Input
                        type="number"
                        min={0}
                        value={item.value}
                        onChange={(e) => updateLotteryPrize(idx, { value: Math.max(0, Number(e.target.value || 0)) })}
                        className="w-28"
                        placeholder={t("如：10", "e.g. 10")}
                      />
                      <p className="text-[10px] text-muted-foreground/60 px-0.5">{t("积分数量", "Points amount")}</p>
                    </div>
                  )}
                  {item.type === 'custom' && (
                    <div className="space-y-0.5 flex-1 min-w-[120px]">
                      <Input
                        value={item.description || ''}
                        onChange={(e) => updateLotteryPrize(idx, { description: e.target.value || null })}
                        placeholder={t("如：最新款、限量版", "e.g. Latest model")}
                      />
                      <p className="text-[10px] text-muted-foreground/60 px-0.5">{t("奖品描述", "Description")}</p>
                    </div>
                  )}
                  <div className="flex-1" />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive shrink-0 mt-0.5"
                    onClick={() => setRemovePrizeIdx(idx)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>

                {/* Row 2: weight / display % / prize cost */}
                <div className="flex items-start gap-3 flex-wrap border-t border-border/40 pt-2">
                  {/* 中奖权重 */}
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1">
                      <Input
                        type="text"
                        inputMode="decimal"
                        value={
                          probFieldDrafts[`win:${idx}`] !== undefined
                            ? probFieldDrafts[`win:${idx}`]!
                            : String(Number(item.probability ?? 0))
                        }
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v !== '' && !DECIMAL_TYPING_RE.test(v)) return;
                          const k = `win:${idx}`;
                          setProbFieldDrafts((d) => ({ ...d, [k]: v }));
                          if (v.trim() === '') { updateLotteryPrize(idx, { probability: 0 }); return; }
                          if (endsWithLoneDot(v)) return;
                          const n = parseFloat(v);
                          if (!Number.isFinite(n)) return;
                          updateLotteryPrize(idx, { probability: Math.max(0, n) });
                        }}
                        onBlur={() => {
                          const k = `win:${idx}`;
                          const raw = probFieldDrafts[k];
                          setProbFieldDrafts((d) => { const next = { ...d }; delete next[k]; return next; });
                          if (raw === undefined) return;
                          const trimmed = raw.trim();
                          if (trimmed === '' || trimmed === '.') { updateLotteryPrize(idx, { probability: 0 }); return; }
                          const n = parseFloat(trimmed);
                          if (!Number.isFinite(n)) return;
                          updateLotteryPrize(idx, { probability: Math.max(0, n) });
                        }}
                        className="w-24 font-mono text-sm"
                        placeholder="0"
                      />
                    </div>
                    <p className="text-[10px] text-muted-foreground/60 px-0.5">{t("中奖权重", "Win weight")}</p>
                  </div>

                  {/* 展示概率 */}
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1">
                      <Input
                        type="text"
                        inputMode="decimal"
                        value={
                          probFieldDrafts[`disp:${idx}`] !== undefined
                            ? probFieldDrafts[`disp:${idx}`]!
                            : item.display_probability != null && Number.isFinite(Number(item.display_probability))
                              ? String(item.display_probability)
                              : ''
                        }
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v !== '' && !DECIMAL_TYPING_RE.test(v)) return;
                          const k = `disp:${idx}`;
                          setProbFieldDrafts((d) => ({ ...d, [k]: v }));
                          if (v.trim() === '') { updateLotteryPrize(idx, { display_probability: null }); return; }
                          if (endsWithLoneDot(v)) return;
                          const n = parseFloat(v);
                          if (!Number.isFinite(n)) return;
                          updateLotteryPrize(idx, { display_probability: Math.max(0, n) });
                        }}
                        onBlur={() => {
                          const k = `disp:${idx}`;
                          const raw = probFieldDrafts[k];
                          setProbFieldDrafts((d) => { const next = { ...d }; delete next[k]; return next; });
                          if (raw === undefined) return;
                          const trimmed = raw.trim();
                          if (trimmed === '' || trimmed === '.') { updateLotteryPrize(idx, { display_probability: null }); return; }
                          const n = parseFloat(trimmed);
                          if (!Number.isFinite(n)) return;
                          updateLotteryPrize(idx, { display_probability: Math.max(0, n) });
                        }}
                        className="w-24 font-mono text-sm"
                        placeholder={t("空=同权重比", "Empty = ratio")}
                      />
                      <span className="text-xs text-muted-foreground">%</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground/60 px-0.5">{t("展示概率（公示）", "Display % (public)")}</p>
                  </div>

                  {/* 发奖成本 */}
                  <div className="space-y-0.5">
                    <Input
                      type="number"
                      min={0}
                      step={1}
                      value={item.prize_cost ?? 0}
                      onChange={(e) => updateLotteryPrize(idx, { prize_cost: Math.max(0, Number(e.target.value || 0)) })}
                      className="w-24 font-mono text-sm"
                      placeholder="0"
                    />
                    <p className="text-[10px] text-muted-foreground/60 px-0.5">{t("发奖成本（积分）", "Prize cost (pts)")}</p>
                  </div>
                </div>

                {/* Row 3: 库存控制 */}
                <div className="flex items-center gap-4 flex-wrap border-t border-border/40 pt-2">
                  <Label className="flex items-center gap-2 text-xs">
                    {t("启用库存", "Enable stock")}
                    <Switch
                      checked={item.stock_enabled === true}
                      onCheckedChange={(v) => updateLotteryPrize(idx, { stock_enabled: v })}
                    />
                  </Label>
                  {item.stock_enabled && (
                    <>
                      <div className="space-y-0.5">
                        <Input
                          type="number"
                          min={-1}
                          value={item.stock_total ?? -1}
                          onChange={(e) => updateLotteryPrize(idx, { stock_total: Math.floor(Number(e.target.value || -1)) })}
                          className="w-24 font-mono text-sm"
                          placeholder="-1"
                        />
                        <p className="text-[10px] text-muted-foreground/60 px-0.5">{t("总库存（-1=不限）", "Total (-1=∞)")}</p>
                      </div>
                      <div className="space-y-0.5">
                        <Input
                          type="number"
                          min={-1}
                          value={item.daily_stock_limit ?? -1}
                          onChange={(e) => updateLotteryPrize(idx, { daily_stock_limit: Math.floor(Number(e.target.value || -1)) })}
                          className="w-24 font-mono text-sm"
                          placeholder="-1"
                        />
                        <p className="text-[10px] text-muted-foreground/60 px-0.5">{t("每日上限（-1=不限）", "Daily (-1=∞)")}</p>
                      </div>
                      {item.stock_total !== undefined && item.stock_total >= 0 && (
                        <div className="text-xs text-muted-foreground">
                          {t("已用", "Used")}：<span className="font-mono">{item.stock_used ?? 0}</span>
                          {" / "}
                          <span className="font-mono">{item.stock_total}</span>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>

          <Button
            onClick={saveLotteryPrizes}
            disabled={savingSpinPrizes || !hasThanksPrize}
            className="w-full gap-2"
          >
            {savingSpinPrizes ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {t("保存奖品配置", "Save Prize Config")}
          </Button>
        </CardContent>
      </Card>

      <AlertDialog open={removePrizeIdx !== null} onOpenChange={(o) => !o && setRemovePrizeIdx(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("删除该奖品？", "Remove this prize?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                `将从列表中移除「${pendingRemovePrizeLabel}」。需点击「保存奖品配置」后才会写入服务端。`,
                `Removes "${pendingRemovePrizeLabel}" from the list. Click "Save Prize Config" to persist.`,
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("取消", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                const i = removePrizeIdx;
                setRemovePrizeIdx(null);
                if (i !== null) removeLotteryPrize(i);
              }}
            >
              {t("删除", "Remove")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
