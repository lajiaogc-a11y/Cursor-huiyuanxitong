/**
 * 海报设置 Tab - 汇率采集与汇率配置表
 */

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { SortableTableRow } from "@/components/ui/sortable-item";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Timer, RefreshCw, Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useLanguage } from "@/contexts/LanguageContext";
import CurrencySelect from "@/components/CurrencySelect";
import RatePosterGenerator from "@/components/RatePosterGenerator";
import {
  getRateSettingEntries,
  loadRateSettingEntriesAsync,
  addRateSettingEntryAsync,
  updateRateSettingEntryAsync,
  deleteRateSettingEntryAsync,
  saveRateSettingEntriesAsync,
  getPosterTableColumns,
  savePosterTableColumns,
  POSTER_COLUMN_KEYS,
  type RateSettingEntry,
  type PosterColumnKey,
} from "@/stores/systemSettings";
import { getCountriesAsync } from "@/stores/systemSettings";
import { subscribeToSharedData } from "@/services/finance/sharedDataService";

interface CurrencyRates {
  USD_NGN: number;
  MYR_NGN: number;
  GBP_NGN: number;
  CAD_NGN: number;
  EUR_NGN: number;
  CNY_NGN: number;
  lastUpdated: string;
}

const INTERVAL_OPTIONS = [
  { value: 7200, label: "2小时", labelEn: "2 hours" },
  { value: 14400, label: "4小时", labelEn: "4 hours" },
  { value: 86400, label: "24小时", labelEn: "24 hours" },
] as const;

interface RateSettingsTabProps {
  currencyRates: CurrencyRates;
  currencyRatesAutoUpdate: boolean;
  currencyRatesInterval: number;
  currencyRatesCountdown: number;
  onRefreshCurrencyRates: (isManual?: boolean) => Promise<void>;
  onToggleCurrencyRatesAutoUpdate: () => Promise<void>;
  onChangeCurrencyRatesInterval: (intervalSeconds: number) => Promise<void>;
  nairaRate: number;
  cediRate: number;
  cardsList: { id: string; name: string }[];
  isReadOnly?: boolean;
}

// 卡片列只显示英文部分：去除括号内中文，再去除剩余 CJK 字符
function getCardEnglishPart(card: string): string {
  if (!card) return "-";
  let s = card.replace(/\s*[（(][^）)]*[）)]\s*/g, "").trim();
  s = s.replace(/[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/g, "").trim();
  return s || "-";
}

function getCountryRate(currencyRates: CurrencyRates, country: string): number {
  const countryLower = country?.toLowerCase() || "";
  if (countryLower.includes("美国") || countryLower.includes("usa") || countryLower.includes("united states") || countryLower.includes("美元") || countryLower.includes("usd")) {
    return currencyRates.USD_NGN;
  }
  if (countryLower.includes("马来西亚") || countryLower.includes("malaysia") || countryLower.includes("林吉特") || countryLower.includes("myr") || countryLower.includes("ringgit")) {
    return currencyRates.MYR_NGN;
  }
  if (countryLower.includes("英国") || countryLower.includes("uk") || countryLower.includes("united kingdom") || countryLower.includes("英镑") || countryLower.includes("gbp")) {
    return currencyRates.GBP_NGN;
  }
  if (countryLower.includes("加拿大") || countryLower.includes("canada") || countryLower.includes("加元") || countryLower.includes("cad")) {
    return currencyRates.CAD_NGN;
  }
  if (countryLower.includes("欧洲") || countryLower.includes("europe") || countryLower.includes("欧元") || countryLower.includes("eur") || countryLower.includes("德国") || countryLower.includes("法国") || countryLower.includes("意大利")) {
    return currencyRates.EUR_NGN;
  }
  if (countryLower.includes("中国") || countryLower.includes("china") || countryLower.includes("人民币") || countryLower.includes("cny") || countryLower.includes("rmb")) {
    return currencyRates.CNY_NGN;
  }
  return currencyRates.USD_NGN;
}

export default function RateSettingsTab({
  currencyRates,
  currencyRatesAutoUpdate,
  currencyRatesInterval,
  currencyRatesCountdown,
  onRefreshCurrencyRates,
  onToggleCurrencyRatesAutoUpdate,
  onChangeCurrencyRatesInterval,
  nairaRate,
  cediRate,
  cardsList,
  isReadOnly = false,
}: RateSettingsTabProps) {
  const { t } = useLanguage();
  const blockReadonly = () => {
    if (!isReadOnly) return false;
    toast.error(t("平台总管理查看租户时为只读，无法修改汇率设置", "Read-only in platform admin tenant view"));
    return true;
  };
  const [rateSettingEntries, setRateSettingEntries] = useState<RateSettingEntry[]>([]);
  const [newRateEntry, setNewRateEntry] = useState({
    country: "",
    card: "",
    faceValue: 0,
    exchangeAmount: 0,
    currency: "NGN" as "NGN" | "GHS" | "USDT",
    percentageRate: 0,
    rate: 0,
    profitRate: 0,
  });
  const [editingRateEntry, setEditingRateEntry] = useState<RateSettingEntry | null>(null);
  const [countries, setCountries] = useState<{ id: string; name: string }[]>([]);
  const [posterColumns, setPosterColumns] = useState<PosterColumnKey[]>(() => getPosterTableColumns());

  // 百分比(%) 公式：兑换金额 ÷ (面值 × 该国汇率) × 100，四舍五入取整
  const percentageFormulaHint = t(
    "百分比 = 兑换金额 ÷ (面值 × 该国汇率) × 100",
    "Pct = Exchange Amt ÷ (Face Value × Country Rate) × 100"
  );

  const posterColumnLabels: Record<PosterColumnKey, string> = {
    country: t("国家", "Country"),
    card: t("卡片", "Card"),
    faceValue: t("面值", "Face Value"),
    exchangeAmount: t("兑换金额", "Exchange Amt"),
    currency: t("币种", "Currency"),
    percentageRate: t("百分比(%)", "Pct(%)"),
    rate: t("汇率", "Rate"),
    profitRate: t("需求利润%", "Profit(%)"),
  };

  const togglePosterColumn = (key: PosterColumnKey) => {
    if (blockReadonly()) return;
    const next = posterColumns.includes(key)
      ? posterColumns.filter((c) => c !== key)
      : [...posterColumns, key].sort(
          (a, b) => POSTER_COLUMN_KEYS.indexOf(a) - POSTER_COLUMN_KEYS.indexOf(b)
        );
    setPosterColumns(next);
    savePosterTableColumns(next);
  };

  // 从服务器加载汇率配置（租户内所有人可见，跨浏览器同步）
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const entries = await loadRateSettingEntriesAsync();
      if (mounted) setRateSettingEntries(entries);
    };
    load();
    setPosterColumns(getPosterTableColumns());
    getCountriesAsync().then(setCountries).catch(console.error);

    // 订阅共享数据变更，其他用户/标签页修改时同步
    const unsub = subscribeToSharedData((key, value) => {
      if (key === "rateSettingEntries" && Array.isArray(value) && mounted) {
        setRateSettingEntries(value);
      }
    });
    return () => {
      mounted = false;
      unsub();
    };
  }, []);

  const calculateExchangeAmount = useCallback(
    (entry: { faceValue: number; currency: "NGN" | "GHS" | "USDT"; rate: number; profitRate?: number }) => {
      const { faceValue, currency, rate, profitRate = 0 } = entry;
      const currencyRate = currency === "GHS" ? cediRate : nairaRate;
      let result = faceValue * rate * currencyRate * (1 - profitRate / 100);
      result = Math.floor(result / 500) * 500;
      return result.toString();
    },
    [nairaRate, cediRate]
  );

  const calculatePercentage = useCallback(
    (entry: { faceValue: number; currency: "NGN" | "GHS" | "USDT"; rate: number; exchangeAmount?: number; profitRate?: number; country?: string }): number | null => {
      const { faceValue, rate, exchangeAmount, profitRate, country } = entry;
      if (!faceValue || !rate) return null;
      // 当 exchangeAmount 为 0 或缺失时，使用计算值，避免 Pct 列错误显示 0%
      const exchAmt = (exchangeAmount != null && exchangeAmount > 0)
        ? exchangeAmount
        : parseFloat(calculateExchangeAmount({ ...entry, profitRate }));
      const countryRate = getCountryRate(currencyRates, country || "");
      const denominator = faceValue * countryRate;
      if (denominator === 0) return null;
      return Math.round((exchAmt / denominator) * 100);
    },
    [currencyRates, calculateExchangeAmount]
  );

  const [adding, setAdding] = useState(false);
  const handleAddRateEntry = async () => {
    if (blockReadonly()) return;
    if (!newRateEntry.country || !newRateEntry.faceValue) {
      toast.error(t("请填写完整信息", "Please fill in all fields"));
      return;
    }
    setAdding(true);
    try {
      const calculatedExchangeAmount =
        newRateEntry.faceValue && newRateEntry.rate
          ? parseFloat(
              calculateExchangeAmount({
                faceValue: newRateEntry.faceValue,
                currency: newRateEntry.currency,
                rate: newRateEntry.rate,
                profitRate: newRateEntry.profitRate,
              })
            )
          : 0;
      const calculatedPercentage =
        newRateEntry.faceValue && newRateEntry.rate
          ? (calculatePercentage({
              faceValue: newRateEntry.faceValue,
              currency: newRateEntry.currency,
              rate: newRateEntry.rate,
              profitRate: newRateEntry.profitRate,
              country: newRateEntry.country,
            }) ?? 0)
          : 0;
      const entryWithPercentage = {
        ...newRateEntry,
        exchangeAmount: calculatedExchangeAmount,
        percentageRate: calculatedPercentage,
      };
      const entry = await addRateSettingEntryAsync(entryWithPercentage);
      setRateSettingEntries((prev) => [...prev, entry]);
      setNewRateEntry({
        country: "",
        card: "",
        faceValue: 0,
        exchangeAmount: 0,
        currency: "NGN",
        percentageRate: 0,
        rate: 0,
        profitRate: 0,
      });
      toast.success(t("添加成功，已保存到服务器", "Added and saved to server"));
    } catch (err) {
      console.error("Add rate entry failed:", err);
      toast.error(t("保存失败，请重试", "Save failed, please retry"));
    } finally {
      setAdding(false);
    }
  };

  const [updating, setUpdating] = useState(false);
  const handleUpdateRateEntry = async () => {
    if (blockReadonly()) return;
    if (!editingRateEntry) return;
    setUpdating(true);
    try {
      const exchAmt = parseFloat(
        calculateExchangeAmount({
          faceValue: editingRateEntry.faceValue,
          currency: editingRateEntry.currency,
          rate: editingRateEntry.rate,
          profitRate: editingRateEntry.profitRate,
        })
      );
      const pct = calculatePercentage({
        faceValue: editingRateEntry.faceValue,
        currency: editingRateEntry.currency,
        rate: editingRateEntry.rate,
        profitRate: editingRateEntry.profitRate,
        country: editingRateEntry.country,
      }) ?? 0;
      const toSave = {
        ...editingRateEntry,
        exchangeAmount: exchAmt,
        percentageRate: pct,
      };
      const ok = await updateRateSettingEntryAsync(editingRateEntry.id, toSave);
      if (ok) {
        setRateSettingEntries(await loadRateSettingEntriesAsync());
        setEditingRateEntry(null);
        toast.success(t("更新成功，已保存到服务器", "Updated and saved to server"));
      } else {
        toast.error(t("保存失败，请重试", "Save failed, please retry"));
      }
    } catch (err) {
      console.error("Update rate entry failed:", err);
      toast.error(t("保存失败，请重试", "Save failed, please retry"));
    } finally {
      setUpdating(false);
    }
  };

  const handleDeleteRateEntry = async (id: string) => {
    if (blockReadonly()) return;
    try {
      const ok = await deleteRateSettingEntryAsync(id);
      if (ok) {
        setRateSettingEntries(await loadRateSettingEntriesAsync());
        toast.success(t("删除成功，已保存到服务器", "Deleted and saved to server"));
      } else {
        toast.error(t("保存失败，请重试", "Save failed, please retry"));
      }
    } catch (err) {
      console.error("Delete rate entry failed:", err);
      toast.error(t("保存失败，请重试", "Save failed, please retry"));
    }
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    if (blockReadonly()) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = rateSettingEntries.findIndex((e) => e.id === active.id);
    const newIndex = rateSettingEntries.findIndex((e) => e.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(rateSettingEntries, oldIndex, newIndex);
    setRateSettingEntries(reordered);
    const ok = await saveRateSettingEntriesAsync(reordered);
    if (ok) toast.success(t("排序已保存", "Order saved"));
    else toast.error(t("保存失败", "Save failed"));
  };

  return (
    <div className="space-y-4">
      {/* 汇率采集区域 */}
      <div className="border rounded-lg p-4 bg-muted/30 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <RatePosterGenerator
              rateEntries={rateSettingEntries}
              getExchangeAmount={(e) => calculateExchangeAmount(e)}
              getPercentage={(e) => {
                const p = calculatePercentage(e);
                return p === null ? "-" : `${p}%`;
              }}
            />
            <span className="text-xs text-muted-foreground">
              {t("下次更新", "Next update")}: {Math.floor(currencyRatesCountdown / 3600)}:
              {Math.floor((currencyRatesCountdown % 3600) / 60)
                .toString()
                .padStart(2, "0")}
              :{(currencyRatesCountdown % 60).toString().padStart(2, "0")}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant={currencyRatesAutoUpdate ? "default" : "outline"}
              size="sm"
              onClick={() => { if (!blockReadonly()) void onToggleCurrencyRatesAutoUpdate(); }}
              disabled={isReadOnly}
              className="h-7 text-xs gap-1"
            >
              <Timer className="h-3 w-3" />
              {currencyRatesAutoUpdate ? t("自动更新开", "Auto ON") : t("自动更新关", "Auto OFF")}
            </Button>
            {currencyRatesAutoUpdate && (
              <Select
                value={INTERVAL_OPTIONS.some((o) => o.value === currencyRatesInterval) ? String(currencyRatesInterval) : "7200"}
                onValueChange={(v) => { if (!blockReadonly()) void onChangeCurrencyRatesInterval(parseInt(v, 10)); }}
                disabled={isReadOnly}
              >
                <SelectTrigger className="h-7 w-[100px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INTERVAL_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={String(opt.value)}>
                      {t(opt.label, opt.labelEn)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Button variant="outline" size="sm" onClick={() => { if (!blockReadonly()) void onRefreshCurrencyRates(true); }} disabled={isReadOnly} className="h-7 text-xs gap-1">
              <RefreshCw className="h-3 w-3" />
              {t("手动更新", "Manual Update")}
            </Button>
          </div>
        </div>
        {/* 海报表格列配置：勾选的列将显示在生成的海报中 */}
        <div className="flex flex-wrap items-center gap-4 py-2 border-t border-border/50">
          <span className="text-xs font-medium text-muted-foreground">
            {t("海报表格列（勾选=生成海报时显示）", "Poster columns (checked = shown in poster)")}:
          </span>
          <div className="flex flex-wrap gap-4">
            {POSTER_COLUMN_KEYS.map((key) => (
              <label key={key} className="flex items-center gap-2 cursor-pointer text-sm">
                <Checkbox
                  checked={posterColumns.includes(key)}
                  onCheckedChange={() => togglePosterColumn(key)}
                  disabled={isReadOnly}
                />
                {posterColumnLabels[key]}
              </label>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          <div className="border rounded-lg p-2 bg-background">
            <div className="text-xs text-muted-foreground mb-0.5">{t("美元/奈拉", "USD/NGN")}</div>
            <div className="text-base font-semibold">{(currencyRates?.USD_NGN ?? 0).toFixed(2)}</div>
          </div>
          <div className="border rounded-lg p-2 bg-background">
            <div className="text-xs text-muted-foreground mb-0.5">{t("林吉特/奈拉", "MYR/NGN")}</div>
            <div className="text-base font-semibold">{(currencyRates?.MYR_NGN ?? 0).toFixed(2)}</div>
          </div>
          <div className="border rounded-lg p-2 bg-background">
            <div className="text-xs text-muted-foreground mb-0.5">{t("英镑/奈拉", "GBP/NGN")}</div>
            <div className="text-base font-semibold">{(currencyRates?.GBP_NGN ?? 0).toFixed(2)}</div>
          </div>
          <div className="border rounded-lg p-2 bg-background">
            <div className="text-xs text-muted-foreground mb-0.5">{t("加元/奈拉", "CAD/NGN")}</div>
            <div className="text-base font-semibold">{(currencyRates?.CAD_NGN ?? 0).toFixed(2)}</div>
          </div>
          <div className="border rounded-lg p-2 bg-background">
            <div className="text-xs text-muted-foreground mb-0.5">{t("欧元/奈拉", "EUR/NGN")}</div>
            <div className="text-base font-semibold">{(currencyRates?.EUR_NGN ?? 0).toFixed(2)}</div>
          </div>
          <div className="border rounded-lg p-2 bg-background">
            <div className="text-xs text-muted-foreground mb-0.5">{t("人民币/奈拉", "CNY/NGN")}</div>
            <div className="text-base font-semibold">{(currencyRates?.CNY_NGN ?? 0).toFixed(2)}</div>
          </div>
        </div>
        <div className="text-xs text-muted-foreground">
          {t("上次更新", "Last updated")}: {new Date(currencyRates.lastUpdated).toLocaleString()}
        </div>
      </div>

      {/* 新增条目表单 */}
      <div className="border rounded-lg p-3 bg-muted/30 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="font-medium text-sm">{t("添加汇率配置", "Add Rate Config")}</h4>
          <span className="text-xs text-muted-foreground" title={percentageFormulaHint}>
            {t("百分比公式", "Pct formula")}: 兑换金额÷(面值×该国汇率)×100
          </span>
        </div>
        <div className="space-y-2">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">{t("国家", "Country")}</Label>
              <Select value={newRateEntry.country} onValueChange={(v) => setNewRateEntry({ ...newRateEntry, country: v })}>
                <SelectTrigger className="h-8">
                  <SelectValue placeholder={t("选择", "Select")} />
                </SelectTrigger>
                <SelectContent>
                  {countries.map((c) => (
                    <SelectItem key={c.id} value={c.name}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t("卡片", "Card")}</Label>
              <Select value={newRateEntry.card} onValueChange={(v) => setNewRateEntry({ ...newRateEntry, card: v })}>
                <SelectTrigger className="h-8">
                  <SelectValue placeholder={t("选择", "Select")} />
                </SelectTrigger>
                <SelectContent>
                  {cardsList.map((card) => (
                    <SelectItem key={card.id} value={card.name}>
                      {card.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t("面值", "Value")}</Label>
              <Input
                type="number"
                value={newRateEntry.faceValue || ""}
                onChange={(e) => setNewRateEntry({ ...newRateEntry, faceValue: parseFloat(e.target.value) || 0 })}
                className="h-8"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t("兑换金额", "Amount")}</Label>
              <Input
                type="text"
                value={
                  newRateEntry.faceValue && newRateEntry.rate
                    ? calculateExchangeAmount({
                        faceValue: newRateEntry.faceValue,
                        currency: newRateEntry.currency,
                        rate: newRateEntry.rate,
                        profitRate: newRateEntry.profitRate,
                      })
                    : ""
                }
                readOnly
                className="h-8 bg-muted/50"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t("币种", "Currency")}</Label>
              <CurrencySelect
                value={newRateEntry.currency}
                onValueChange={(v) => setNewRateEntry({ ...newRateEntry, currency: v })}
                triggerClassName="h-8 min-w-[90px]"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="space-y-1" title={percentageFormulaHint}>
              <Label className="text-xs">{t("百分比(%)", "Pct(%)")}</Label>
              <Input
                type="text"
                value={
                  newRateEntry.faceValue && newRateEntry.rate
                    ? (() => {
                        const p = calculatePercentage({
                          faceValue: newRateEntry.faceValue,
                          currency: newRateEntry.currency,
                          rate: newRateEntry.rate,
                          profitRate: newRateEntry.profitRate,
                          country: newRateEntry.country,
                        });
                        return p === null ? "-" : `${p}%`;
                      })()
                    : ""
                }
                readOnly
                className="h-8 bg-muted/50"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t("汇率", "Rate")}</Label>
              <Input
                type="number"
                step="0.01"
                value={newRateEntry.rate || ""}
                onChange={(e) => setNewRateEntry({ ...newRateEntry, rate: parseFloat(e.target.value) || 0 })}
                className="h-8"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t("利润%", "Profit%")}</Label>
              <Input
                type="number"
                step="0.1"
                value={newRateEntry.profitRate || ""}
                onChange={(e) => setNewRateEntry({ ...newRateEntry, profitRate: parseFloat(e.target.value) || 0 })}
                className="h-8"
              />
            </div>
            <div className="flex items-end">
              <Button onClick={handleAddRateEntry} size="sm" className="h-8 w-full gap-1" disabled={isReadOnly || adding}>
                <Plus className="h-3.5 w-3.5" />
                {adding ? t("保存中...", "Saving...") : t("添加", "Add")}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* 已有条目列表 */}
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-10 text-center" />
              <TableHead className="text-center">{t("国家", "Country")}</TableHead>
              <TableHead className="text-center">{t("卡片", "Card")}</TableHead>
              <TableHead className="text-center">{t("面值", "Face Value")}</TableHead>
              <TableHead className="text-center">{t("兑换金额", "Exchange Amt")}</TableHead>
              <TableHead className="text-center min-w-[100px]">{t("币种", "Currency")}</TableHead>
              <TableHead className="text-center">{t("百分比(%)", "Pct(%)")}</TableHead>
              <TableHead className="text-center">{t("汇率", "Rate")}</TableHead>
              <TableHead className="text-center">{t("需求利润%", "Profit(%)")}</TableHead>
              <TableHead className="text-center">{t("操作", "Actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rateSettingEntries.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                  {t("暂无数据", "No data")}
                </TableCell>
              </TableRow>
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={rateSettingEntries.map((e) => e.id)} strategy={verticalListSortingStrategy}>
                  {rateSettingEntries.map((entry) => (
                    <SortableTableRow key={entry.id} id={entry.id} disabled={isReadOnly || !!editingRateEntry}>
                  {editingRateEntry?.id === entry.id ? (
                    <>
                      <TableCell className="text-center">
                        <Select value={editingRateEntry.country} onValueChange={(v) => setEditingRateEntry({ ...editingRateEntry, country: v })}>
                          <SelectTrigger className="h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {countries.map((c) => (
                              <SelectItem key={c.id} value={c.name}>
                                {c.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-center">
                        <Select value={editingRateEntry.card || ""} onValueChange={(v) => setEditingRateEntry({ ...editingRateEntry, card: v })}>
                          <SelectTrigger className="h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {cardsList.map((card) => (
                              <SelectItem key={card.id} value={card.name}>
                                {card.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-center">
                        <Input
                          type="number"
                          value={editingRateEntry.faceValue}
                          onChange={(e) => setEditingRateEntry({ ...editingRateEntry, faceValue: parseFloat(e.target.value) || 0 })}
                          className="h-8 w-20 text-center"
                        />
                      </TableCell>
                      <TableCell className="text-center">
                        <Input
                          type="text"
                          value={calculateExchangeAmount({
                            faceValue: editingRateEntry.faceValue,
                            currency: editingRateEntry.currency,
                            rate: editingRateEntry.rate,
                            profitRate: editingRateEntry.profitRate,
                          })}
                          readOnly
                          className="h-8 w-24 text-center bg-muted/50"
                        />
                      </TableCell>
                      <TableCell className="text-center">
                        <CurrencySelect
                          value={editingRateEntry.currency}
                          onValueChange={(v) => setEditingRateEntry({ ...editingRateEntry, currency: v })}
                          triggerClassName="h-8 min-w-[100px]"
                        />
                      </TableCell>
                      <TableCell className="text-center">
                        <Input
                          type="text"
                          value={(() => {
                            const p = calculatePercentage({
                              faceValue: editingRateEntry.faceValue,
                              currency: editingRateEntry.currency,
                              rate: editingRateEntry.rate,
                              profitRate: editingRateEntry.profitRate,
                              country: editingRateEntry.country,
                            });
                            return p === null ? "-" : `${p}%`;
                          })()}
                          readOnly
                          className="h-8 w-20 text-center bg-muted/50"
                        />
                      </TableCell>
                      <TableCell className="text-center">
                        <Input
                          type="number"
                          step="0.01"
                          value={editingRateEntry.rate}
                          onChange={(e) => setEditingRateEntry({ ...editingRateEntry, rate: parseFloat(e.target.value) || 0 })}
                          className="h-8 w-16 text-center"
                        />
                      </TableCell>
                      <TableCell className="text-center">
                        <Input
                          type="number"
                          step="0.1"
                          value={editingRateEntry.profitRate}
                          onChange={(e) => setEditingRateEntry({ ...editingRateEntry, profitRate: parseFloat(e.target.value) || 0 })}
                          className="h-8 w-16 text-center"
                        />
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="default" size="sm" className="h-7 gap-1" disabled={isReadOnly || updating}>
                                {t("保存", "Save")}
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>{t("确认修改", "Confirm Update")}</AlertDialogTitle>
                                <AlertDialogDescription>
                                  {t("确定要保存对此汇率配置的修改吗？", "Are you sure you want to save changes to this rate configuration?")}
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>{t("取消", "Cancel")}</AlertDialogCancel>
                                <AlertDialogAction onClick={handleUpdateRateEntry} disabled={isReadOnly || updating}>{t("确认", "Confirm")}</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                          <Button variant="outline" size="sm" className="h-7" onClick={() => setEditingRateEntry(null)} disabled={isReadOnly || updating}>
                            {t("取消", "Cancel")}
                          </Button>
                        </div>
                      </TableCell>
                    </>
                  ) : (
                    <>
                      <TableCell className="text-center">{entry.country}</TableCell>
                      <TableCell className="text-center">{getCardEnglishPart(entry.card)}</TableCell>
                      <TableCell className="text-center">{entry.faceValue}</TableCell>
                      <TableCell className="text-center font-medium">{entry.exchangeAmount || calculateExchangeAmount(entry)}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant="secondary">{entry.currency}</Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        {(() => {
                          const p = calculatePercentage(entry);
                          if (p === null) return "-";
                          return `${Math.round(entry.percentageRate ?? p)}%`;
                        })()}
                      </TableCell>
                      <TableCell className="text-center">{entry.rate}</TableCell>
                      <TableCell className="text-center">{entry.profitRate}%</TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingRateEntry(entry)} disabled={isReadOnly}>
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" disabled={isReadOnly}>
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>{t("确认删除", "Confirm Delete")}</AlertDialogTitle>
                                <AlertDialogDescription>
                                  {t("确定要删除此汇率配置吗？此操作不可撤销。", "Are you sure you want to delete this rate configuration? This action cannot be undone.")}
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>{t("取消", "Cancel")}</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDeleteRateEntry(entry.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={isReadOnly}>
                                  {t("删除", "Delete")}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </>
                  )}
                </SortableTableRow>
                  ))}
                </SortableContext>
              </DndContext>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
