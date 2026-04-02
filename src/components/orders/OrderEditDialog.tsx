// 普通订单编辑弹窗 - 从 OrderManagement 提取，不修改业务逻辑
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
import { calculatePaymentValue, reverseCalculateActualPaid } from "@/lib/orderCalculations";
import type { Order } from "@/hooks/useOrders";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";

export interface OrderEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: Order | null;
  onOrderChange: (order: Order) => void;
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
  /** 非管理员时：本次改动是否需要走审核主按钮文案/样式（由父组件按 checkNeedsApproval 计算） */
  preferSubmitReview?: boolean;
}

export function OrderEditDialog(props: OrderEditDialogProps) {
  const {
    open,
    onOpenChange,
    order,
    onOrderChange,
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

  const setOrder = (updates: Partial<Order>) => order && onOrderChange({ ...order, ...updates });

  return (
    <DrawerDetail
      open={open && !!order}
      onOpenChange={onOpenChange}
      title={t("编辑订单", "Edit Order")}
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
            <Label>{t("实付外币", "Actual Payment")}</Label>
            <Input
              type="number"
              step="0.01"
              value={order.actualPaid || 0}
              onChange={(e) => setOrder({ actualPaid: parseFloat(e.target.value) || 0 })}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("外币汇率", "Foreign Exchange Rate")}</Label>
            <Input
              type="number"
              step="0.01"
              value={order.foreignRate || 0}
              onChange={(e) => setOrder({ foreignRate: parseFloat(e.target.value) || 0 })}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("手续费", "Fee")}</Label>
            <Input
              type="number"
              step="0.01"
              value={order.fee || 0}
              onChange={(e) => setOrder({ fee: parseFloat(e.target.value) || 0 })}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("代付价值（人民币）", "Payment Value (RMB)")}</Label>
            <Input
              type="number"
              step="0.01"
              value={calculatePaymentValue(
                order.actualPaid,
                order.foreignRate,
                order.fee,
                order.demandCurrency || 'NGN'
              ).toFixed(2)}
              onChange={(e) => {
                const newPaymentValue = parseFloat(e.target.value) || 0;
                const currency = order.demandCurrency || 'NGN';
                const newActualPaid = reverseCalculateActualPaid(
                  newPaymentValue,
                  order.foreignRate,
                  order.fee,
                  currency
                );
                setOrder({ actualPaid: newActualPaid });
              }}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("利润预览", "Profit Preview")}</Label>
            <div className="h-10 px-3 py-2 bg-muted rounded-md text-primary font-medium flex items-center">
              {(() => {
                const cardWorth = order.cardValue * order.cardRate;
                const currency = order.demandCurrency || 'NGN';
                const pv = calculatePaymentValue(order.actualPaid, order.foreignRate, order.fee, currency);
                return (cardWorth - pv).toFixed(2);
              })()}
            </div>
          </div>
          <div className="space-y-2">
            <Label>{t("利润率预览", "Profit Rate Preview")}</Label>
            <div className="h-10 px-3 py-2 bg-muted rounded-md text-primary flex items-center">
              {(() => {
                const cardWorth = order.cardValue * order.cardRate;
                const currency = order.demandCurrency || 'NGN';
                const pv = calculatePaymentValue(order.actualPaid, order.foreignRate, order.fee, currency);
                const profit = cardWorth - pv;
                return cardWorth > 0 ? ((profit / cardWorth) * 100).toFixed(2) + '%' : '0%';
              })()}
            </div>
          </div>
          <div className="space-y-2">
            <Label>{t("需求币种", "Currency")}</Label>
            <Select value={order.demandCurrency || "NGN"} onValueChange={(v) => setOrder({ demandCurrency: v })}>
              <SelectTrigger>
                <SelectValue>{order.demandCurrency === "GHS" ? t("赛地 (GHS)", "Cedi (GHS)") : t("奈拉 (NGN)", "Naira (NGN)")}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="NGN">{t("奈拉 (NGN)", "Naira (NGN)")}</SelectItem>
                <SelectItem value="GHS">{t("赛地 (GHS)", "Cedi (GHS)")}</SelectItem>
              </SelectContent>
            </Select>
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
}
