// 订单筛选面板 - 从 OrderManagement 提取，不修改业务逻辑
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import DateRangeFilter from "@/components/DateRangeFilter";
import type { TimeRangeType, DateRange } from "@/lib/dateFilter";

export interface OrderFiltersProps {
  showAdvancedFilter: boolean;
  onShowAdvancedFilterChange: (open: boolean) => void;
  statusFilter: string;
  onStatusFilterChange: (value: string) => void;
  currencyFilter: string;
  onCurrencyFilterChange: (value: string) => void;
  vendorFilter: string;
  onVendorFilterChange: (value: string) => void;
  paymentProviderFilter: string;
  onPaymentProviderFilterChange: (value: string) => void;
  cardTypeFilter: string;
  onCardTypeFilterChange: (value: string) => void;
  salesPersonFilter: string;
  onSalesPersonFilterChange: (value: string) => void;
  minProfit: string;
  onMinProfitChange: (value: string) => void;
  maxProfit: string;
  onMaxProfitChange: (value: string) => void;
  selectedRange: TimeRangeType;
  dateRange: DateRange;
  onDateRangeChange: (range: TimeRangeType, start?: Date, end?: Date) => void;
  onResetFilters: () => void;
  vendorsList: { id: string; name: string }[];
  paymentProvidersList: { id: string; name: string }[];
  cardsList: { id: string; name: string }[];
  uniqueSalesPersons: string[];
  orderStatusOptions: { value: string; label: string }[];
  currencyOptions: { value: string; label: string }[];
  stats: { totalOrders: number; totalProfit: number; totalCardValue: number; tradingUsers: number };
  isMobile: boolean;
  t: (zh: string, en: string) => string;
}

export function OrderFilters(props: OrderFiltersProps) {
  const {
    showAdvancedFilter,
    onShowAdvancedFilterChange,
    statusFilter,
    onStatusFilterChange,
    currencyFilter,
    onCurrencyFilterChange,
    vendorFilter,
    onVendorFilterChange,
    paymentProviderFilter,
    onPaymentProviderFilterChange,
    cardTypeFilter,
    onCardTypeFilterChange,
    salesPersonFilter,
    onSalesPersonFilterChange,
    minProfit,
    onMinProfitChange,
    maxProfit,
    onMaxProfitChange,
    selectedRange,
    dateRange,
    onDateRangeChange,
    onResetFilters,
    vendorsList,
    paymentProvidersList,
    cardsList,
    uniqueSalesPersons,
    orderStatusOptions,
    currencyOptions,
    stats,
    isMobile,
    t,
  } = props;

  return (
    <Collapsible open={showAdvancedFilter} onOpenChange={onShowAdvancedFilterChange}>
      <CollapsibleContent className="mb-6">
        <div className={isMobile ? "space-y-3" : "bg-muted/30 rounded-lg p-4 space-y-4"}>
          <div className={isMobile ? "space-y-2 bg-muted/30 rounded-lg p-3" : "flex flex-wrap gap-4"}>
            <div className={isMobile ? "w-full" : "flex-1 min-w-[300px]"}>
              <Label className="text-xs text-muted-foreground mb-2 block">{t("日期范围", "Date Range")}</Label>
              <DateRangeFilter
                value={selectedRange}
                onChange={onDateRangeChange}
                dateRange={dateRange}
              />
            </div>

            <div className={isMobile ? "w-full" : "w-[150px]"}>
              <Label className="text-xs text-muted-foreground mb-2 block">{t("订单状态", "Order Status")}</Label>
              <Select value={statusFilter} onValueChange={onStatusFilterChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {orderStatusOptions.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className={isMobile ? "w-full" : "w-[150px]"}>
              <Label className="text-xs text-muted-foreground mb-2 block">{t("需求币种", "Currency")}</Label>
              <Select value={currencyFilter} onValueChange={onCurrencyFilterChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {currencyOptions.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className={isMobile ? "grid grid-cols-2 gap-2 bg-muted/30 rounded-lg p-3" : "flex flex-wrap gap-4"}>
            <div className={isMobile ? "w-full" : "w-[180px]"}>
              <Label className="text-xs text-muted-foreground mb-2 block">{t("卡商", "Vendor")}</Label>
              <Select value={vendorFilter || "all"} onValueChange={(v) => onVendorFilterChange(v === "all" ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder={t("全部卡商", "All Vendors")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("全部卡商", "All Vendors")}</SelectItem>
                  {vendorsList.map(v => (
                    <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className={isMobile ? "w-full" : "w-[180px]"}>
              <Label className="text-xs text-muted-foreground mb-2 block">{t("代付商家", "Payment Provider")}</Label>
              <Select value={paymentProviderFilter || "all"} onValueChange={(v) => onPaymentProviderFilterChange(v === "all" ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder={t("全部代付", "All Providers")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("全部代付", "All Providers")}</SelectItem>
                  {paymentProvidersList.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className={isMobile ? "w-full" : "w-[180px]"}>
              <Label className="text-xs text-muted-foreground mb-2 block">{t("卡片类型", "Card Type")}</Label>
              <Select value={cardTypeFilter || "all"} onValueChange={(v) => onCardTypeFilterChange(v === "all" ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder={t("全部类型", "All Types")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("全部类型", "All Types")}</SelectItem>
                  {cardsList.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className={isMobile ? "w-full" : "w-[180px]"}>
              <Label className="text-xs text-muted-foreground mb-2 block">{t("销售员", "Salesperson")}</Label>
              <Select value={salesPersonFilter || "all"} onValueChange={(v) => onSalesPersonFilterChange(v === "all" ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder={t("全部销售员", "All Salespersons")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("全部销售员", "All Salespersons")}</SelectItem>
                  {uniqueSalesPersons.map(p => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-end gap-2">
              <div className="w-[100px]">
                <Label className="text-xs text-muted-foreground mb-2 block">{t("最小利润", "Min Profit")}</Label>
                <Input
                  type="number"
                  placeholder={t("最小", "Min")}
                  value={minProfit}
                  onChange={(e) => onMinProfitChange(e.target.value)}
                />
              </div>
              <span className="pb-2">-</span>
              <div className="w-[100px]">
                <Label className="text-xs text-muted-foreground mb-2 block">{t("最大利润", "Max Profit")}</Label>
                <Input
                  type="number"
                  placeholder={t("最大", "Max")}
                  value={maxProfit}
                  onChange={(e) => onMaxProfitChange(e.target.value)}
                />
              </div>
            </div>

            <div className="flex items-end">
              <Button variant="outline" size="sm" onClick={onResetFilters}>
                {t("重置筛选", "Reset Filters")}
              </Button>
            </div>
          </div>

          <div className="flex gap-6 pt-2 border-t text-sm">
            <span>{t("筛选结果", "Results")}: <strong>{stats.totalOrders}</strong> {t("单", "orders")}</span>
            <span>{t("交易用户", "Trading Users")}: <strong>{stats.tradingUsers ?? 0}</strong></span>
            <span>{t("卡值总和", "Total Card Value")}: <strong>¥{stats.totalCardValue.toLocaleString()}</strong></span>
            <span>{t("利润总和", "Total Profit")}: <strong className="text-emerald-600">¥{stats.totalProfit.toLocaleString()}</strong></span>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
