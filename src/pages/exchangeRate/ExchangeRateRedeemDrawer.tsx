import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { DrawerDetail } from "@/components/shell/DrawerDetail";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { notify } from "@/lib/notifyHub";

export type ExchangeRateRedeemPreviewData = {
  memberCode: string;
  phoneNumber: string;
  remainingPoints: number;
  currency: 'NGN' | 'GHS' | 'USDT';
  rewardAmount: number;
  currentRate: number;
  fee: number;
  giftValue: number;
};

export type ExchangeRateRedeemDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  confirmOpen: boolean;
  onConfirmOpenChange: (open: boolean) => void;
  paymentProvider: string;
  onPaymentProviderChange: (value: string) => void;
  remark: string;
  onRemarkChange: (value: string) => void;
  previewData: ExchangeRateRedeemPreviewData | null;
  paymentProvidersList: { id: string; name: string }[];
  isReadOnly: boolean;
  blockReadonly: (actionText: string) => boolean;
  t: (zh: string, en: string) => string;
  onConfirmRedeem: () => void | Promise<void>;
};

export function ExchangeRateRedeemDrawer({
  open,
  onOpenChange,
  confirmOpen,
  onConfirmOpenChange,
  paymentProvider,
  onPaymentProviderChange,
  remark,
  onRemarkChange,
  previewData,
  paymentProvidersList,
  isReadOnly,
  blockReadonly,
  t,
  onConfirmRedeem,
}: ExchangeRateRedeemDrawerProps) {
  return (
    <>
      <DrawerDetail
        open={open}
        onOpenChange={onOpenChange}
        title={t("积分兑换", "Points Redemption")}
        sheetMaxWidth="xl"
      >
        {previewData && (
          <div className="space-y-4">
            <div className="p-4 bg-muted/50 rounded-lg space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t("会员编号", "Member Code")}</span>
                <span className="font-medium">{previewData.memberCode}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t("电话号码", "Phone Number")}</span>
                <span className="font-mono">{previewData.phoneNumber}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t("当前剩余积分", "Current Points")}</span>
                <span className="font-bold text-primary">{previewData.remainingPoints}</span>
              </div>
              <div className="border-t pt-3 mt-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{t("判定币种", "Currency")}</span>
                  <Badge variant="outline">{previewData.currency}</Badge>
                </div>
                <div className="flex justify-between text-sm mt-2">
                  <span className="text-muted-foreground">{t("当前汇率", "Current Rate")}</span>
                  <span>{previewData.currentRate}</span>
                </div>
                <div className="flex justify-between text-sm mt-2">
                  <span className="text-muted-foreground">{t("可兑换金额", "Redemption Amount")}</span>
                  <span className="font-bold text-green-600">
                    {previewData.rewardAmount} {previewData.currency}
                  </span>
                </div>
                <div className="flex justify-between text-sm mt-2">
                  <span className="text-muted-foreground">{t("手续费", "Fee")}</span>
                  <span>{previewData.fee}</span>
                </div>
                <div className="flex justify-between text-sm mt-2">
                  <span className="text-muted-foreground">{t("赠送价值", "Gift Value")}</span>
                  <span>{(previewData.giftValue ?? 0).toFixed(2)}</span>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t("代付商家", "Payment Provider")} <span className="text-destructive">*</span></Label>
              <Select value={paymentProvider} onValueChange={onPaymentProviderChange} disabled={isReadOnly}>
                <SelectTrigger>
                  <SelectValue placeholder={t("请选择代付商家", "Select payment provider")} />
                </SelectTrigger>
                <SelectContent>
                  {paymentProvidersList.map((provider) => (
                    <SelectItem key={provider.id} value={provider.name}>
                      {provider.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {paymentProvidersList.length === 0 && (
                <p className="text-xs text-destructive">{t("暂无可用的代付商家，请先在商家管理中添加", "No payment providers available")}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label>{t("备注（选填）", "Remark (Optional)")}</Label>
              <Textarea
                value={remark}
                onChange={(e) => onRemarkChange(e.target.value)}
                placeholder={t("请输入备注信息", "Enter remark")}
                rows={2}
                disabled={isReadOnly}
              />
            </div>

            <div className="text-xs text-muted-foreground bg-amber-50 dark:bg-amber-950/20 p-3 rounded">
              ⚠️ {t("兑换后积分将清零，重置时间更新为当前时间，之后的积分从新周期开始累积。", "After redemption, points will be reset to zero and the reset time will be updated.")}
            </div>
          </div>
        )}
        <div className="flex flex-wrap justify-end gap-2 pt-4 mt-4 border-t border-border">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("取消", "Cancel")}
          </Button>
          <Button
            onClick={() => {
              if (blockReadonly("进行积分兑换")) return;
              if (!paymentProvider) {
                notify.error(t("请选择代付商家", "Please select payment provider"));
                return;
              }
              onConfirmOpenChange(true);
            }}
            disabled={isReadOnly || !paymentProvider || paymentProvidersList.length === 0}
          >
            {t("确认兑换", "Confirm Redemption")}
          </Button>
        </div>
      </DrawerDetail>

      <AlertDialog open={confirmOpen} onOpenChange={onConfirmOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("确认兑换", "Confirm Redemption")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                `确认为会员 ${previewData?.memberCode} 进行积分兑换吗？兑换后该会员的积分将清零，重置时间将更新为当前时间。`,
                `Confirm points redemption for member ${previewData?.memberCode}? Points will be reset to zero after redemption.`
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("取消", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void onConfirmRedeem()}>
              {t("确认", "Confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
