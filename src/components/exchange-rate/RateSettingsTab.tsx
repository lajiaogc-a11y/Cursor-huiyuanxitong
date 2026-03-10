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
import { Timer, RefreshCw, Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useLanguage } from "@/contexts/LanguageContext";
import CurrencySelect from "@/components/CurrencySelect";
import RatePosterGenerator from "@/components/RatePosterGenerator";
import {
  getRateSettingEntries,
  addRateSettingEntry,
  updateRateSettingEntry,
  deleteRateSettingEntry,
  type RateSettingEntry,
} from "@/stores/systemSettings";
import { getCountriesAsync } from "@/stores/systemSettings";

interface CurrencyRates {
  USD_NGN: number;
  MYR_NGN: number;
  GBP_NGN: number;
  CAD_NGN: number;
  EUR_NGN: number;
  CNY_NGN: number;
  lastUpdated: string;
}

interface RateSettingsTabProps {
  currencyRates: CurrencyRates;
  currencyRatesAutoUpdate: boolean;
  currencyRatesCountdown: number;
  onRefreshCurrencyRates: (isManual?: boolean) => Promise<void>;
  onToggleCurrencyRatesAutoUpdate: () => Promise<void>;
  nairaRate: number;
  cediRate: number;
  cardsList: { id: string; name: string }[];
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
  currencyRatesCountdown,
  onRefreshCurrencyRates,
  onToggleCurrencyRatesAutoUpdate,
  nairaRate,
  cediRate,
  cardsList,
}: RateSettingsTabProps) {
  const { t } = useLanguage();
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

  useEffect(() => {
    setRateSettingEntries(getRateSettingEntries());
    getCountriesAsync().then(setCountries).catch(console.error);
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
    (entry: { faceValue: number; currency: "NGN" | "GHS" | "USDT"; rate: number; exchangeAmount?: number; profitRate?: number; country?: string }) => {
      const { faceValue, rate, exchangeAmount, profitRate, country } = entry;
      if (!faceValue || !rate) return "0.00";
      const exchAmt = exchangeAmount !== undefined ? exchangeAmount : parseFloat(calculateExchangeAmount({ ...entry, profitRate }));
      const countryRate = getCountryRate(currencyRates, country || "");
      const denominator = faceValue * countryRate;
      if (denominator === 0) return "0.00";
      return ((exchAmt / denominator) * 100).toFixed(2);
    },
    [currencyRates, calculateExchangeAmount]
  );

  const handleAddRateEntry = () => {
    if (!newRateEntry.country || !newRateEntry.faceValue) {
      toast.error(t("请填写完整信息", "Please fill in all fields"));
      return;
    }
    const calculatedPercentage =
      newRateEntry.faceValue && newRateEntry.rate
        ? parseFloat(
            calculatePercentage({
              faceValue: newRateEntry.faceValue,
              currency: newRateEntry.currency,
              rate: newRateEntry.rate,
              profitRate: newRateEntry.profitRate,
              country: newRateEntry.country,
            })
          )
        : 0;
    const entryWithPercentage = { ...newRateEntry, percentageRate: calculatedPercentage };
    const entry = addRateSettingEntry(entryWithPercentage);
    setRateSettingEntries([...rateSettingEntries, entry]);
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
    toast.success(t("添加成功", "Added successfully"));
  };

  const handleUpdateRateEntry = () => {
    if (!editingRateEntry) return;
    updateRateSettingEntry(editingRateEntry.id, editingRateEntry);
    setRateSettingEntries(getRateSettingEntries());
    setEditingRateEntry(null);
    toast.success(t("更新成功", "Updated successfully"));
  };

  const handleDeleteRateEntry = (id: string) => {
    deleteRateSettingEntry(id);
    setRateSettingEntries(getRateSettingEntries());
    toast.success(t("删除成功", "Deleted successfully"));
  };

  return (
    <div className="space-y-4">
      {/* 汇率采集区域 */}
      <div className="border rounded-lg p-4 bg-muted/30 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <RatePosterGenerator />
            <span className="text-xs text-muted-foreground">
              {t("下次更新", "Next update")}: {Math.floor(currencyRatesCountdown / 3600)}:
              {Math.floor((currencyRatesCountdown % 3600) / 60)
                .toString()
                .padStart(2, "0")}
              :{(currencyRatesCountdown % 60).toString().padStart(2, "0")}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant={currencyRatesAutoUpdate ? "default" : "outline"}
              size="sm"
              onClick={onToggleCurrencyRatesAutoUpdate}
              className="h-7 text-xs gap-1"
            >
              <Timer className="h-3 w-3" />
              {currencyRatesAutoUpdate ? t("自动更新开", "Auto ON") : t("自动更新关", "Auto OFF")}
            </Button>
            <Button variant="outline" size="sm" onClick={() => onRefreshCurrencyRates(true)} className="h-7 text-xs gap-1">
              <RefreshCw className="h-3 w-3" />
              {t("手动更新", "Manual Update")}
            </Button>
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
        <h4 className="font-medium text-sm">{t("添加汇率配置", "Add Rate Config")}</h4>
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
            <div className="space-y-1">
              <Label className="text-xs">{t("百分比(%)", "Pct(%)")}</Label>
              <Input
                type="text"
                value={
                  newRateEntry.faceValue && newRateEntry.rate
                    ? calculatePercentage({
                        faceValue: newRateEntry.faceValue,
                        currency: newRateEntry.currency,
                        rate: newRateEntry.rate,
                        profitRate: newRateEntry.profitRate,
                        country: newRateEntry.country,
                      })
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
              <Button onClick={handleAddRateEntry} size="sm" className="h-8 w-full gap-1">
                <Plus className="h-3.5 w-3.5" />
                {t("添加", "Add")}
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
                <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                  {t("暂无数据", "No data")}
                </TableCell>
              </TableRow>
            ) : (
              rateSettingEntries.map((entry) => (
                <TableRow key={entry.id}>
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
                          value={calculatePercentage({
                            faceValue: editingRateEntry.faceValue,
                            currency: editingRateEntry.currency,
                            rate: editingRateEntry.rate,
                            profitRate: editingRateEntry.profitRate,
                            country: editingRateEntry.country,
                          })}
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
                              <Button variant="default" size="sm" className="h-7 gap-1">
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
                                <AlertDialogAction onClick={handleUpdateRateEntry}>{t("确认", "Confirm")}</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                          <Button variant="outline" size="sm" className="h-7" onClick={() => setEditingRateEntry(null)}>
                            {t("取消", "Cancel")}
                          </Button>
                        </div>
                      </TableCell>
                    </>
                  ) : (
                    <>
                      <TableCell className="text-center">{entry.country}</TableCell>
                      <TableCell className="text-center">{entry.card || "-"}</TableCell>
                      <TableCell className="text-center">{entry.faceValue}</TableCell>
                      <TableCell className="text-center font-medium">{entry.exchangeAmount || calculateExchangeAmount(entry)}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant="secondary">{entry.currency}</Badge>
                      </TableCell>
                      <TableCell className="text-center">{entry.percentageRate || calculatePercentage(entry)}%</TableCell>
                      <TableCell className="text-center">{entry.rate}</TableCell>
                      <TableCell className="text-center">{entry.profitRate}%</TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingRateEntry(entry)}>
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive">
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
                                <AlertDialogAction onClick={() => handleDeleteRateEntry(entry.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                  {t("删除", "Delete")}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
