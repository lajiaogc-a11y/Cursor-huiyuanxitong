// 普通订单编辑弹窗 - 从 OrderManagement 提取，不修改业务逻辑
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
  } = props;

  if (!order) return null;

  const setOrder = (updates: Partial<Order>) => onOrderChange({ ...order, ...updates });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>编辑订单</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4 py-4">
          <div className="space-y-2">
            <Label>卡片类型</Label>
            <Select value={order.cardType} onValueChange={(v) => setOrder({ cardType: v })}>
              <SelectTrigger>
                <SelectValue placeholder="请选择卡片">{resolveCardName(order.cardType)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {cardsList.map((card) => (
                  <SelectItem key={card.id} value={card.id}>{card.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>卡片面值</Label>
            <Input
              type="number"
              value={order.cardValue}
              onChange={(e) => setOrder({ cardValue: parseFloat(e.target.value) || 0 })}
            />
          </div>
          <div className="space-y-2">
            <Label>卡片汇率</Label>
            <Input
              type="number"
              step="0.01"
              value={order.cardRate}
              onChange={(e) => setOrder({ cardRate: parseFloat(e.target.value) || 0 })}
            />
          </div>
          <div className="space-y-2">
            <Label>此卡价值（自动计算）</Label>
            <div className="h-10 px-3 py-2 bg-muted rounded-md font-medium flex items-center">
              {(order.cardValue * order.cardRate).toFixed(2)}
            </div>
          </div>
          <div className="space-y-2">
            <Label>实付外币</Label>
            <Input
              type="number"
              step="0.01"
              value={order.actualPaid || 0}
              onChange={(e) => setOrder({ actualPaid: parseFloat(e.target.value) || 0 })}
            />
          </div>
          <div className="space-y-2">
            <Label>外币汇率</Label>
            <Input
              type="number"
              step="0.01"
              value={order.foreignRate || 0}
              onChange={(e) => setOrder({ foreignRate: parseFloat(e.target.value) || 0 })}
            />
          </div>
          <div className="space-y-2">
            <Label>手续费</Label>
            <Input
              type="number"
              step="0.01"
              value={order.fee || 0}
              onChange={(e) => setOrder({ fee: parseFloat(e.target.value) || 0 })}
            />
          </div>
          <div className="space-y-2">
            <Label>代付价值（人民币）</Label>
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
            <Label>利润预览</Label>
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
            <Label>利润率预览</Label>
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
            <Label>需求币种</Label>
            <Select value={order.demandCurrency || "NGN"} onValueChange={(v) => setOrder({ demandCurrency: v })}>
              <SelectTrigger>
                <SelectValue>{order.demandCurrency === "GHS" ? "赛地 (GHS)" : "奈拉 (NGN)"}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="NGN">奈拉 (NGN)</SelectItem>
                <SelectItem value="GHS">赛地 (GHS)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>电话号码</Label>
            <Input value={order.phoneNumber} onChange={(e) => setOrder({ phoneNumber: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>代付商家</Label>
            <Select value={order.paymentProvider} onValueChange={(v) => setOrder({ paymentProvider: v })}>
              <SelectTrigger>
                <SelectValue placeholder="请选择代付商家">{resolveProviderName(order.paymentProvider)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {paymentProvidersList.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>卡商名称</Label>
            <Select value={order.vendor} onValueChange={(v) => setOrder({ vendor: v })}>
              <SelectTrigger>
                <SelectValue placeholder="请选择卡商">{resolveVendorName(order.vendor)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {vendorsList.map((v) => (
                  <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>会员编号（不可修改）</Label>
            <Input value={order.memberCode} disabled className="bg-muted" />
          </div>
          <div className="space-y-2">
            <Label>销售员{!isSuperAdmin && '（不可修改）'}</Label>
            {isSuperAdmin ? (
              <Select value={order.salesPerson} onValueChange={(v) => setOrder({ salesPerson: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="请选择销售员">
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
            <Label>备注</Label>
            <Input value={order.remark} onChange={(e) => setOrder({ remark: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            取消
          </Button>
          <Button onClick={onSave} disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                提交中...
              </>
            ) : (
              isAdmin ? "确认修改" : "提交审核"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
