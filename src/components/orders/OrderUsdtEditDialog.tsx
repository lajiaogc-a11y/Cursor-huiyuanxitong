// USDT 订单编辑弹窗 - 从 OrderManagement 提取，不修改业务逻辑
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
import type { UsdtOrder } from "@/hooks/useOrders";

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
}

export function OrderUsdtEditDialog(props: OrderUsdtEditDialogProps) {
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
  } = props;

  if (!order) return null;

  const setOrder = (updates: Partial<UsdtOrder>) => onOrderChange({ ...order, ...updates });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>编辑USDT订单</DialogTitle>
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
            <Label>USDT汇率</Label>
            <Input
              type="text"
              inputMode="decimal"
              placeholder="例如: 6.9500"
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
            <Label>总价值USDT（自动计算）</Label>
            <div className="h-10 px-3 py-2 bg-muted rounded-md font-medium flex items-center">
              {(() => {
                const cardWorth = order.cardValue * order.cardRate;
                const usdtRate = order.usdtRate || 1;
                return usdtRate > 0 ? (cardWorth / usdtRate).toFixed(2) : '0.00';
              })()}
            </div>
          </div>
          <div className="space-y-2">
            <Label>实付USDT</Label>
            <Input
              type="number"
              step="0.01"
              value={order.actualPaidUsdt || 0}
              onChange={(e) => setOrder({ actualPaidUsdt: parseFloat(e.target.value) || 0 })}
            />
          </div>
          <div className="space-y-2">
            <Label>手续费USDT</Label>
            <Input
              type="number"
              step="0.01"
              value={order.feeUsdt}
              onChange={(e) => setOrder({ feeUsdt: parseFloat(e.target.value) || 0 })}
            />
          </div>
          <div className="space-y-2">
            <Label>代付价值（USDT）</Label>
            <div className="h-10 px-3 py-2 bg-muted rounded-md font-medium flex items-center">
              {((order.actualPaidUsdt || 0) + (order.feeUsdt || 0)).toFixed(2)}
            </div>
          </div>
          <div className="space-y-2">
            <Label>利润预览</Label>
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
            <Label>利润率预览</Label>
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
