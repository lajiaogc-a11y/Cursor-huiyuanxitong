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
      const code = e?.code || e?.message || '';
      if (code === 'MAX_8_PRIZES' || code.includes('MAX_8_PRIZES')) {
        notify.error(t('最多只能启用 8 个奖品（转盘有 8 个格子）', 'Maximum 8 enabled prizes allowed (wheel has 8 slots)'));
      } else {
        notify.error(e?.message || t('保存失败', 'Save failed'));
      }
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
          {/* 详细说明 */}
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs leading-relaxed text-blue-900 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-200 space-y-2">
            <p className="font-semibold">{t("预算与 RTP 机制说明", "Budget & RTP Explained")}</p>
            <ul className="list-disc pl-4 space-y-1">
              <li>{t("每日发奖预算：手动设置一个积分上限。今日抽奖累计发出的奖品积分达到此值后，按下方「预算策略」处理。设为 0 表示不限（不推荐）。", "Daily budget: a hard cap on lottery prize points per day. Once reached, the budget policy kicks in. 0 = unlimited.")}</li>
              <li>{t("目标 RTP（Return To Player，返奖率）：参考今日后台「订单管理」中所有订单产生的积分总额，取其百分之多少作为今日抽奖可发放额度。", "Target RTP: takes a percentage of today's total order-generated points as the lottery budget.")}</li>
              <li>{t("举例：今日订单共产生了 10000 积分，RTP 设为 1%，则今日 RTP 额度 = 10000 × 1% = 100 积分。", "Example: if orders generated 10,000 points today and RTP = 1%, then RTP budget = 100 points.")}</li>
              <li>{t("最终有效上限 = min(手动预算, RTP额度)。如果手动预算=500、RTP额度=100，则实际可发 100。如果手动预算=0，则仅以 RTP 额度为准。两者都为 0 则完全不限。", "Effective cap = min(manual budget, RTP budget). Both 0 = unlimited.")}</li>
              <li>{t("注意：RTP 额度会随着今日订单量动态变化——白天订单越多，抽奖可发的积分也越多；凌晨没订单时额度为 0。", "Note: RTP budget changes dynamically as orders come in; more orders = more lottery budget.")}</li>
            </ul>
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
              <p className="text-[11px] text-muted-foreground/70">{t("单位：积分。这是一个手动硬上限，超出后按「预算策略」处理。", "Unit: points. Hard cap; budget policy applies when exceeded.")}</p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t("今日已用预算（只读）", "Used Today (read-only)")}</Label>
              <Input
                type="number"
                readOnly
                value={lotterySettings.daily_reward_used ?? 0}
                className="bg-muted/50 cursor-not-allowed"
              />
              <p className="text-[11px] text-muted-foreground/70">{t("今日已通过抽奖实际发出的积分成本。每日北京时间 0 点自动重置。", "Actual prize cost spent today. Auto-resets at Beijing midnight.")}</p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t("目标 RTP（%，0=不限）", "Target RTP (%, 0=no limit)")}</Label>
              <Input
                type="number"
                min={0}
                max={100}
                step={0.1}
                value={lotterySettings.target_rtp ?? 0}
                onChange={(e) => setLotterySettings(prev => ({ ...prev, target_rtp: Math.min(100, Math.max(0, Number(e.target.value || 0))) }))}
              />
              <p className="text-[11px] text-muted-foreground/70">{t(
                "从今日订单产生的积分中，取百分之多少作为抽奖发放额度。例：设 1% → 今日订单积分 10000 → 额度 100。设 0 表示不使用此限制。",
                "% of today's order points as lottery budget. E.g. 1% of 10,000 = 100. Set 0 to disable.",
              )}</p>
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
                  <SelectItem value="downgrade">{t("降级 — 压低高成本奖品概率", "Downgrade — suppress high-cost prize probability")}</SelectItem>
                  <SelectItem value="fallback">{t("保底 — 只保留低成本奖品", "Fallback — only keep low-cost prizes")}</SelectItem>
                  <SelectItem value="deny">{t("拒绝 — 预算耗尽直接禁止抽奖", "Deny — block all spins when exhausted")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {/* 预算策略详细中文解释 */}
          <div className="rounded-lg border border-dashed p-3 bg-muted/10 text-[11px] text-muted-foreground/80 leading-relaxed space-y-1.5">
            <p className="font-medium text-muted-foreground">{t("预算策略详解", "Budget Policy Details")}</p>
            <p>
              <span className="font-semibold text-orange-600 dark:text-orange-400">{t("降级（推荐）", "Downgrade")}</span>
              {t(
                "：预算快用完时，系统自动压低高成本奖品（如 100 积分大奖）的中奖概率，把概率挪给「感谢参与」和低成本奖品。会员仍然可以抽奖，只是大奖概率变低。预算完全用完后大奖概率接近 0，基本只中「感谢参与」。",
                ": Suppresses high-cost prize probability when budget is low; probability shifts to 'thanks' and cheap prizes.",
              )}
            </p>
            <p>
              <span className="font-semibold text-blue-600 dark:text-blue-400">{t("保底", "Fallback")}</span>
              {t(
                "：预算不足时，直接移除所有成本超过剩余预算的奖品，只保留成本低于剩余预算的奖品和「感谢参与」。比降级更激进——高成本奖品完全消失。",
                ": Removes all prizes whose cost exceeds remaining budget; only cheap prizes and 'thanks' survive.",
              )}
            </p>
            <p>
              <span className="font-semibold text-red-600 dark:text-red-400">{t("拒绝", "Deny")}</span>
              {t(
                "：预算耗尽后，会员点击抽奖直接返回「预算已用完」错误，无法继续抽奖，直到次日预算重置。最严格，但体验最差。",
                ": When budget is exhausted, spins are blocked entirely until the next day's reset.",
              )}
            </p>
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
          {/* 风控详细说明 */}
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200 space-y-2">
            <p className="font-semibold">{t("风险控制说明", "Risk Control Explained")}</p>
            <ul className="list-disc pl-4 space-y-1">
              <li>{t("风控用于防止恶意刷抽奖（如同一账号短时间内疯狂抽奖，或同一 IP 多个账号轮换刷）。", "Prevents abuse such as rapid spinning or multi-account attacks from the same IP.")}</li>
              <li>{t("系统会自动计算每次抽奖的「风险分」（0~100+），分数越高表示越可疑。", "Each draw gets a risk score (0–100+); higher = more suspicious.")}</li>
              <li>{t("风险分来源：账号 60 秒内抽奖次数（超限 +50 分）、账号每日总次数（超限 +60 分）、同 IP 短时间多次请求（超限 +40 分）、同 IP 今日多个账号（超限 +30 分）。", "Score sources: account burst (+50), account daily (+60), IP burst (+40), IP multi-account (+30).")}</li>
              <li>{t("裁定规则：风险分 ≥ 50 且触发账号维度限制 → 直接拦截（本次抽奖失败）；风险分 ≥ 30 → 降级（本次强制只中「感谢参与」）。", "Score ≥ 50 with account trigger → block; score ≥ 30 → downgrade to 'thanks'.")}</li>
            </ul>
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
              <p className="text-[11px] text-muted-foreground/70">{t("同一账号每天最多抽奖多少次。超出后触发拦截（+60 风险分）。", "Max spins per account per day. Exceeding adds +60 risk score → block.")}</p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t("单账号60s内抽奖上限（0=不限）", "Account burst limit/60s (0=no limit)")}</Label>
              <Input
                type="number" min={0}
                value={lotterySettings.risk_account_burst_limit ?? 0}
                onChange={(e) => setLotterySettings(prev => ({ ...prev, risk_account_burst_limit: Math.max(0, Math.floor(Number(e.target.value || 0))) }))}
              />
              <p className="text-[11px] text-muted-foreground/70">{t("同一账号 60 秒内最多抽多少次（防连点/脚本）。超出 +50 风险分 → 拦截。", "Max spins per account in 60s (anti-rapid). Exceeding adds +50 → block.")}</p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t("同IP每日抽奖账号上限（0=不限）", "IP daily account limit (0=no limit)")}</Label>
              <Input
                type="number" min={0}
                value={lotterySettings.risk_ip_daily_limit ?? 0}
                onChange={(e) => setLotterySettings(prev => ({ ...prev, risk_ip_daily_limit: Math.max(0, Math.floor(Number(e.target.value || 0))) }))}
              />
              <p className="text-[11px] text-muted-foreground/70">{t("同一 IP 今天最多允许多少个不同账号抽奖。超出 +30 风险分 → 降级。用于防止同一个人注册多个号刷奖。", "Max distinct accounts per IP per day. Anti multi-account abuse. +30 → downgrade.")}</p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t("同IP 60s内抽奖上限（0=不限）", "IP burst limit/60s (0=no limit)")}</Label>
              <Input
                type="number" min={0}
                value={lotterySettings.risk_ip_burst_limit ?? 0}
                onChange={(e) => setLotterySettings(prev => ({ ...prev, risk_ip_burst_limit: Math.max(0, Math.floor(Number(e.target.value || 0))) }))}
              />
              <p className="text-[11px] text-muted-foreground/70">{t("同一 IP 60 秒内最多多少次抽奖请求。超出 +40 风险分。", "Max spins from same IP in 60s. Exceeding adds +40 risk score.")}</p>
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs">{t("风险分阈值（≥此值强制保底，0=不启用）", "Risk score threshold (≥ = force fallback, 0=off)")}</Label>
              <Input
                type="number" min={0}
                value={lotterySettings.risk_high_score_threshold ?? 0}
                onChange={(e) => setLotterySettings(prev => ({ ...prev, risk_high_score_threshold: Math.max(0, Math.floor(Number(e.target.value || 0))) }))}
                className="max-w-xs"
              />
              {/* 风险分阈值详细说明 */}
              <div className="rounded-lg border border-dashed p-2.5 bg-muted/10 text-[11px] text-muted-foreground/80 leading-relaxed space-y-1 mt-1">
                <p className="font-medium text-muted-foreground">{t("风险分阈值详细说明", "Risk Score Threshold Details")}</p>
                <p>{t(
                  "系统会根据上面 4 项维度自动计算出一个「风险分」。当风险分达到或超过这里设定的阈值时，本次抽奖强制降级为「感谢参与」（即使正常随机本应中大奖）。",
                  "When the computed risk score ≥ this threshold, the draw is forced to 'thanks for participating' even if the normal random would have won a big prize.",
                )}</p>
                <p>{t(
                  "风险分计分规则：账号 60s 爆发超限 = +50分，账号每日超限 = +60分（接近限额 +20），同 IP 爆发超限 = +40分，同 IP 多账号 = +30分。各项可叠加。",
                  "Scoring: account burst +50, account daily +60 (near limit +20), IP burst +40, IP multi-account +30. Scores stack.",
                )}</p>
                <p>{t(
                  "设为 0 表示不启用此阈值（其他维度的拦截/降级仍然生效）。建议值：30~50。设太低会误伤正常用户，设太高则形同虚设。",
                  "0 = disabled. Recommended: 30–50. Too low may affect normal users; too high is ineffective.",
                )}</p>
              </div>
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
                      onChange={(e) => {
                        const newType = e.target.value as LotteryPrizeType;
                        const newValue = newType === 'none' ? 0 : item.value;
                        const autoCost = newType === 'points' ? Math.max(0, Number(newValue) || 0) : item.prize_cost;
                        updateLotteryPrize(idx, { type: newType, value: newValue, prize_cost: autoCost });
                      }}
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
                        onChange={(e) => {
                          const newVal = Math.max(0, Number(e.target.value || 0));
                          const patch: Partial<LotteryPrize> = { value: newVal };
                          if (item.type === 'points') patch.prize_cost = newVal;
                          updateLotteryPrize(idx, patch);
                        }}
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
                    <p className="text-[10px] text-muted-foreground/60 px-0.5">
                      {t("发奖成本（积分）", "Prize cost (pts)")}
                      {item.type === 'points' && <span className="ml-1 text-blue-500">{t("积分类自动同步", "auto-synced")}</span>}
                    </p>
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
