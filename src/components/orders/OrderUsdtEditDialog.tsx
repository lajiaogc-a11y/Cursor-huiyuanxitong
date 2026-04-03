import React from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DrawerDetail } from "@/components/shell/DrawerDetail";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import type { UsdtOrder } from "@/hooks/useOrders";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";

export interface OrderUsdtEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: UsdtOrder | null;
  onOrderChange: (order: UsdtOrder) => void;
  usdtRateInput: string;
  onUsdtRateInputChange: (value: string) => void;
  onSave: () => void;
  isSubmitting: boolean;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  cardsList: { id: string; name: string }[];
  vendorsList: { id: string; name: string }[];
  paymentProvidersList: { id: string; name: string }[];
  allEmployees: { id: string; real_name: string }[];
  resolveCardName: (idOrName: string) => string;
  resolveVendorName: (idOrName: string) => string;
  resolveProviderName: (idOrName: string) => string;
  /** 非管理员时：本次改动是否需要走审核主按钮文案/样式 */
  preferSubmitReview?: boolean;
}

export const OrderUsdtEditDialog = React.memo(function OrderUsdtEditDialog(props: OrderUsdtEditDialogProps) {
  const {
    open,
    onOpenChange,
    order,
    onOrderChange,
    usdtRateInput,
    onUsdtRateInputChange,
    onSave,
    isSubmitting,
    isAdmin,
    isSuperAdmin,
    cardsList,
    vendorsList,
    paymentProvidersList,
    allEmployees,
    resolveCardName,
    resolveVendorName,
    resolveProviderName,
    preferSubmitReview = true,
  } = props;

  const { t } = useLanguage();
  const useSubmitReviewStyle = !isAdmin && preferSubmitReview;

  const setOrder = (updates: Partial<UsdtOrder>) => order && onOrderChange({ ...order, ...updates });

  return (
    <DrawerDetail
      open={open && !!order}
      onOpenChange={onOpenChange}
      title={t("编辑USDT订单", "Edit USDT Order")}
      description={order?.id ? String(order.id) : undefined}
      sheetMaxWidth="xl"
    >
      {order ? (
        <>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>{t("卡片类型", "Card Type")}</Label>
            <Select value={order.cardType} onValueChange={(v) => setOrder({ cardType: v })}>
              <SelectTrigger>
                <SelectValue placeholder={t("请选择卡片", "Select card")}>{resolveCardName(order.cardType)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {cardsList.map((card) => (
                  <SelectItem key={card.id} value={card.id}>{card.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{t("卡片面值", "Card Value")}</Label>
            <Input
              type="number"
              value={order.cardValue}
              onChange={(e) => setOrder({ cardValue: parseFloat(e.target.value) || 0 })}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("卡片汇率", "Card Rate")}</Label>
            <Input
              type="number"
              step="0.01"
              value={order.cardRate}
              onChange={(e) => setOrder({ cardRate: parseFloat(e.target.value) || 0 })}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("此卡价值（自动计算）", "Card Worth (Auto)")}</Label>
            <div className="h-10 px-3 py-2 bg-muted rounded-md font-medium flex items-center">
              {(order.cardValue * order.cardRate).toFixed(2)}
            </div>
          </div>
          <div className="space-y-2">
            <Label>{t("USDT汇率", "USDT Rate")}</Label>
            <Input
              type="text"
              inputMode="decimal"
              placeholder={t("例如: 6.9500", "e.g. 6.9500")}
              value={usdtRateInput}
              onChange={(e) => {
                const val = e.target.value;
                if (val === '' || /^\d*\.?\d{0,4}$/.test(val)) {
                  onUsdtRateInputChange(val);
                  setOrder({ usdtRate: val === '' ? 0 : parseFloat(val) || 0 });
                }
              }}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("总价值USDT（自动计算）", "Total USDT Value (Auto)")}</Label>
            <div className="h-10 px-3 py-2 bg-muted rounded-md font-medium flex items-center">
              {(() => {
                const cardWorth = order.cardValue * order.cardRate;
                const usdtRate = order.usdtRate || 1;
                return usdtRate > 0 ? (cardWorth / usdtRate).toFixed(2) : '0.00';
              })()}
            </div>
          </div>
          <div className="space-y-2">
            <Label>{t("实付USDT", "Actual Paid USDT")}</Label>
            <Input
              type="number"
              step="0.01"
              value={order.actualPaidUsdt || 0}
              onChange={(e) => setOrder({ actualPaidUsdt: parseFloat(e.target.value) || 0 })}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("手续费USDT", "Fee USDT")}</Label>
            <Input
              type="number"
              step="0.01"
              value={order.feeUsdt}
              onChange={(e) => setOrder({ feeUsdt: parseFloat(e.target.value) || 0 })}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("代付价值（USDT）", "Payment Value (USDT)")}</Label>
            <div className="h-10 px-3 py-2 bg-muted rounded-md font-medium flex items-center">
              {((order.actualPaidUsdt || 0) + (order.feeUsdt || 0)).toFixed(2)}
            </div>
          </div>
          <div className="space-y-2">
            <Label>{t("利润预览", "Profit Preview")}</Label>
            <div className="h-10 px-3 py-2 bg-muted rounded-md text-primary font-medium flex items-center">
              {(() => {
                const cardWorth = order.cardValue * order.cardRate;
                const usdtRate = order.usdtRate || 1;
                const totalValueUsdt = usdtRate > 0 ? cardWorth / usdtRate : 0;
                const paymentValue = (order.actualPaidUsdt || 0) + (order.feeUsdt || 0);
                return (totalValueUsdt - paymentValue).toFixed(2);
              })()}
            </div>
          </div>
          <div className="space-y-2">
            <Label>{t("利润率预览", "Profit Rate Preview")}</Label>
            <div className="h-10 px-3 py-2 bg-muted rounded-md text-primary flex items-center">
              {(() => {
                const cardWorth = order.cardValue * order.cardRate;
                const usdtRate = order.usdtRate || 1;
                const totalValueUsdt = usdtRate > 0 ? cardWorth / usdtRate : 0;
                const paymentValue = (order.actualPaidUsdt || 0) + (order.feeUsdt || 0);
                const profit = totalValueUsdt - paymentValue;
                return totalValueUsdt > 0 ? ((profit / totalValueUsdt) * 100).toFixed(2) + '%' : '0%';
              })()}
            </div>
          </div>
          <div className="space-y-2">
            <Label>{t("电话号码", "Phone Number")}</Label>
            <Input value={order.phoneNumber} onChange={(e) => setOrder({ phoneNumber: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>{t("代付商家", "Payment Provider")}</Label>
            <Select value={order.paymentProvider} onValueChange={(v) => setOrder({ paymentProvider: v })}>
              <SelectTrigger>
                <SelectValue placeholder={t("请选择代付商家", "Select payment provider")}>{resolveProviderName(order.paymentProvider)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {paymentProvidersList.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{t("卡商名称", "Vendor Name")}</Label>
            <Select value={order.vendor} onValueChange={(v) => setOrder({ vendor: v })}>
              <SelectTrigger>
                <SelectValue placeholder={t("请选择卡商", "Select vendor")}>{resolveVendorName(order.vendor)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {vendorsList.map((v) => (
                  <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{t("会员编号（不可修改）", "Member Code (Read-only)")}</Label>
            <Input value={order.memberCode} disabled className="bg-muted" />
          </div>
          <div className="space-y-2">
            <Label>{t("销售员", "Salesperson")}{!isSuperAdmin && t('（不可修改）', ' (Read-only)')}</Label>
            {isSuperAdmin ? (
              <Select value={order.salesPerson} onValueChange={(v) => setOrder({ salesPerson: v })}>
                <SelectTrigger>
                  <SelectValue placeholder={t("请选择销售员", "Select salesperson")}>
                    {allEmployees.find(e => e.id === order.salesPerson)?.real_name || order.salesPerson}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {allEmployees.map((emp) => (
                    <SelectItem key={emp.id} value={emp.id}>{emp.real_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input value={order.salesPerson} disabled className="bg-muted" />
            )}
          </div>
          <div className="space-y-2 col-span-2">
            <Label>{t("备注", "Remark")}</Label>
            <Input value={order.remark} onChange={(e) => setOrder({ remark: e.target.value })} />
          </div>
        </div>
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-4 mt-4 border-t border-border">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            {t("取消", "Cancel")}
          </Button>
          <Button
            onClick={onSave}
            disabled={isSubmitting}
            className={cn(useSubmitReviewStyle && "bg-amber-500 text-white hover:bg-amber-600")}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t("提交中...", "Submitting...")}
              </>
            ) : isAdmin ? (
              t("确认修改", "Confirm Edit")
            ) : useSubmitReviewStyle ? (
              t("提交审核", "Submit for Review")
            ) : (
              t("确认修改", "Confirm Edit")
            )}
          </Button>
        </div>
        </>
      ) : null}
    </DrawerDetail>
  );
});
