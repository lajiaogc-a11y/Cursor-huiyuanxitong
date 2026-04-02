/**
 * LuckySpinTab — 幸运抽奖设置 tab
 * 从 MemberPortalSettings 提取
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
import { Plus, Trash2, Save, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { notify } from "@/lib/notifyHub";
import { useLanguage } from '@/contexts/LanguageContext';
import {
  adminGetLotteryPrizes,
  adminSaveLotteryPrizes,
  adminSaveLotterySettings,
  type LotteryPrize,
  type LotteryPrizeType,
  type LotterySettings,
} from '@/services/lottery/lotteryService';
import { SectionTitle } from './shared';

/** 允许输入过程中的「12.」等中间态，避免受控 number 立刻 parse 掉小数点 */
const DECIMAL_TYPING_RE = /^\d*\.?\d*$/;

function clampLotteryPercent(n: number): number {
  return Math.min(100, Math.max(0, parseFloat(n.toFixed(4))));
}

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

  const lotteryRateTotal = useMemo(
    () => lotteryPrizes.reduce((acc, x) => acc + Math.max(0, Number(x.probability || 0)), 0),
    [lotteryPrizes],
  );
  const isLotteryRateValid = Math.abs(lotteryRateTotal - 100) < 0.001;
  const hasThanksPrize = useMemo(() => lotteryPrizes.some(p => p.type === 'none'), [lotteryPrizes]);

  const addLotteryPrize = () => {
    setLotteryPrizes(prev => [...prev, { name: '', type: 'points' as LotteryPrizeType, value: 0, description: null, probability: 0, display_probability: null, image_url: null, sort_order: prev.length }]);
  };
  const removeLotteryPrize = (idx: number) => {
    setProbFieldDrafts({});
    setLotteryPrizes(prev => prev.filter((_, i) => i !== idx));
  };
  const updateLotteryPrize = (idx: number, patch: Partial<LotteryPrize>) => {
    setLotteryPrizes(prev => prev.map((x, i) => (i === idx ? { ...x, ...patch } : x)));
  };

  const saveLotteryPrizes = async () => {
    if (!isLotteryRateValid) {
      notify.error(t('所有奖品概率总和必须等于 100%', 'Prize probabilities must total 100%'));
      return;
    }
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
      {/* ── A) 抽奖设置 ── */}
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
            <Label>{t("会员端\u300C概率说明\u300D", "Probability notice (member app)")}</Label>
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
                "可填写活动规则、免责说明等。会员在转盘页点击\u300C概率说明\u300D时与公示概率列表一同展示。",
                "Rules, disclaimers, etc. Shown in the member spin page \u201CProbability info\u201D dialog together with the prize odds list.",
              )}
            />
            <p className="text-xs text-muted-foreground">
              {t(
                "与下方「奖品配置」在同一页维护：请先点「保存设置」写入数据库；「发布管理」发布上线时会将抽奖变更视为待同步内容（与门户版本一并推送）。",
                "Same page as prizes: click Save Settings to persist. Publishing in Publish tab treats lottery edits as changes to sync with the portal release.",
              )}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ── B) 奖品配置 ── */}
      <Card>
        <CardContent className="pt-5 space-y-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <SectionTitle>{t("奖品配置", "Prize Configuration")}</SectionTitle>
            <Button type="button" variant="outline" size="sm" onClick={addLotteryPrize} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              {t("新增奖品", "Add Prize")}
            </Button>
          </div>
          <div className={cn("text-xs font-medium", isLotteryRateValid ? "text-emerald-600" : "text-destructive")}>
            {t("当前总概率", "Total Probability")}：{lotteryRateTotal.toFixed(4)}%
            {!isLotteryRateValid && (
              <span className="ml-2">({t("必须等于 100%", "Must equal 100%")})</span>
            )}
          </div>
          {!hasThanksPrize && (
            <p className="text-xs text-destructive">
              {t('必须包含一个\u201C感谢参与\u201D类型奖品', 'Must include a \u201CThanks for participating\u201D prize')}
            </p>
          )}
          {/* 字段说明 */}
          <div className="rounded-lg border border-dashed p-3 bg-muted/10 text-[11px] text-muted-foreground/70 leading-relaxed space-y-1">
            <p><span className="font-medium text-muted-foreground">{t("奖品类型", "Type")}：</span>{t("积分 = 抽中自动发放积分；自定义奖品 = 后台人工处理（如话费/礼品）；感谢参与 = 未中奖，无奖励", "Points = auto-award points; Custom = manual fulfillment; Thanks = no reward")}</p>
            <p><span className="font-medium text-muted-foreground">{t("奖品名称", "Name")}：</span>{t("会员在抽奖页面看到的奖品名，如【积分10】【苹果手机】", "Name shown to members, e.g. 10 Points, iPhone")}</p>
            <p><span className="font-medium text-muted-foreground">{t("积分数量", "Points")}：</span>{t("仅积分类型需要填写，抽中后自动加到会员账户", "Only for Points type \u2014 auto-credited to member account")}</p>
            <p><span className="font-medium text-muted-foreground">{t("奖品描述", "Description")}：</span>{t("仅自定义奖品需要填写，描述奖品详情（如【最新款】）", "Only for Custom type \u2014 describe prize details")}</p>
            <p><span className="font-medium text-muted-foreground">{t("中奖概率", "Probability")}：</span>{t("该奖品被抽中的概率百分比，所有奖品概率总和必须 = 100%", "Chance of winning this prize \u2014 all probabilities must sum to 100%")}</p>
            <p><span className="font-medium text-muted-foreground">{t("展示概率", "Display %")}：</span>{t("仅会员端\u300C概率说明\u300D里公示的百分比，可与中奖概率不同；留空则公示与中奖概率一致；不参与抽奖计算。", "Shown to members in the odds dialog only; can differ from real odds; leave empty to match win probability; not used in the draw.")}</p>
          </div>

          <div className="space-y-3">
            {lotteryPrizes.map((item, idx) => (
              <div key={`${idx}-${item.id || 'new'}`} className="rounded-xl border p-3 bg-muted/20 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="secondary" className="text-[11px] font-mono shrink-0">
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
                    <p className="text-[10px] text-muted-foreground/60 px-0.5">{t("奖品名称（会员可见）", "Prize name (visible to members)")}</p>
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
                          if (v.trim() === '') {
                            updateLotteryPrize(idx, { probability: 0 });
                            return;
                          }
                          if (endsWithLoneDot(v)) return;
                          const n = parseFloat(v);
                          if (!Number.isFinite(n)) return;
                          updateLotteryPrize(idx, { probability: clampLotteryPercent(n) });
                        }}
                        onBlur={() => {
                          const k = `win:${idx}`;
                          const raw = probFieldDrafts[k];
                          setProbFieldDrafts((d) => {
                            const next = { ...d };
                            delete next[k];
                            return next;
                          });
                          if (raw === undefined) return;
                          const trimmed = raw.trim();
                          if (trimmed === '' || trimmed === '.') {
                            updateLotteryPrize(idx, { probability: 0 });
                            return;
                          }
                          const n = parseFloat(trimmed);
                          if (!Number.isFinite(n)) return;
                          updateLotteryPrize(idx, { probability: clampLotteryPercent(n) });
                        }}
                        className="w-28 font-mono text-sm"
                        placeholder="%"
                      />
                      <span className="text-xs text-muted-foreground">%</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground/60 px-0.5">{t("中奖概率", "Win rate")}</p>
                  </div>
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
                          if (v.trim() === '') {
                            updateLotteryPrize(idx, { display_probability: null });
                            return;
                          }
                          if (endsWithLoneDot(v)) return;
                          const n = parseFloat(v);
                          if (!Number.isFinite(n)) return;
                          updateLotteryPrize(idx, { display_probability: clampLotteryPercent(n) });
                        }}
                        onBlur={() => {
                          const k = `disp:${idx}`;
                          const raw = probFieldDrafts[k];
                          setProbFieldDrafts((d) => {
                            const next = { ...d };
                            delete next[k];
                            return next;
                          });
                          if (raw === undefined) return;
                          const trimmed = raw.trim();
                          if (trimmed === '' || trimmed === '.') {
                            updateLotteryPrize(idx, { display_probability: null });
                            return;
                          }
                          const n = parseFloat(trimmed);
                          if (!Number.isFinite(n)) return;
                          updateLotteryPrize(idx, { display_probability: clampLotteryPercent(n) });
                        }}
                        className="w-28 font-mono text-sm"
                        placeholder={t("空=同中奖概率", "Empty = win %")}
                      />
                      <span className="text-xs text-muted-foreground">%</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground/60 px-0.5">{t("展示概率", "Display %")}</p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive shrink-0"
                    onClick={() => setRemovePrizeIdx(idx)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <Button
            onClick={saveLotteryPrizes}
            disabled={savingSpinPrizes || !isLotteryRateValid || !hasThanksPrize}
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
