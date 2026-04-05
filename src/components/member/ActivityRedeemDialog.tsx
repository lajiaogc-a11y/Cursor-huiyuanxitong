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
import { Badge } from "@/components/ui/badge";
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
import { Gift } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import type { CurrencyCode } from "@/config/currencies";

export interface ActivityRedeemPaymentProvider {
  id: string;
  name: string;
  status: string;
}

export interface ActivityRedeemingRow {
  member: {
    memberCode: string;
    phoneNumber: string;
    preferredCurrency?: string[];
    currency_preferences?: string[];
  };
  remainingPoints: number;
}

export interface ActivityRedeemPreview {
  canExchange: boolean;
  message: string;
  currency: CurrencyCode | null;
  rewardAmount: number;
  currentRate: number;
  currentRateDisplay: string;
  fee: number;
  giftValue: number;
  activityType?: string;
}

export interface ActivityRedeemDialogProps {
  redeemOpen: boolean;
  onRedeemOpenChange: (open: boolean) => void;
  redeemingRow: ActivityRedeemingRow | null;
  redeemPreview: ActivityRedeemPreview | null;
  paymentProviders: ActivityRedeemPaymentProvider[];
  selectedPaymentProvider: string;
  onSelectedPaymentProviderChange: (value: string) => void;
  redeemRemark: string;
  onRedeemRemarkChange: (value: string) => void;
  confirmOpen: boolean;
  onConfirmOpenChange: (open: boolean) => void;
  displayPhone: (phone: string) => string;
  onRedeemClick: () => void;
  onCompleteRedeem: () => void;
}

export function ActivityRedeemDialog({
  redeemOpen,
  onRedeemOpenChange,
  redeemingRow,
  redeemPreview,
  paymentProviders,
  selectedPaymentProvider,
  onSelectedPaymentProviderChange,
  redeemRemark,
  onRedeemRemarkChange,
  confirmOpen,
  onConfirmOpenChange,
  displayPhone,
  onRedeemClick,
  onCompleteRedeem,
}: ActivityRedeemDialogProps) {
  const { t } = useLanguage();

  return (
    <>
      <DrawerDetail
        open={redeemOpen}
        onOpenChange={onRedeemOpenChange}
        title={t("积分兑换", "Points Redemption")}
        sheetMaxWidth="3xl"
      >
        {redeemingRow && redeemPreview && (
          <div className="space-y-3 py-2">
            {redeemPreview.activityType && (
              <div
                className={`p-2 rounded-lg text-sm flex items-center gap-2 ${
                  redeemPreview.activityType === "activity_1"
                    ? "bg-blue-50 text-blue-700 border border-blue-200"
                    : "bg-purple-50 text-purple-700 border border-purple-200"
                }`}
              >
                <Gift className="h-4 w-4 flex-shrink-0" />
                <span className="font-medium text-xs sm:text-sm">
                  {redeemPreview.activityType === "activity_1"
                    ? t("活动1：阶梯制兑换", "Activity 1: Tiered Redemption")
                    : t("活动2：固定积分兑换", "Activity 2: Fixed Rate Redemption")}
                </span>
              </div>
            )}

            {!redeemPreview.canExchange && (
              <div className="p-2 rounded-lg text-xs sm:text-sm bg-destructive/10 text-destructive border border-destructive/20">
                ⚠️ {redeemPreview.message}
              </div>
            )}

            <div className="p-3 bg-muted/50 rounded-lg space-y-2 text-xs sm:text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("会员编号", "Member Code")}</span>
                <span className="font-medium">{redeemingRow.member.memberCode}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("电话号码", "Phone")}</span>
                <span className="font-mono">{displayPhone(redeemingRow.member.phoneNumber)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("当前剩余积分", "Current Points")}</span>
                <span
                  className={`font-bold ${redeemingRow.remainingPoints < 0 ? "text-destructive" : "text-primary"}`}
                >
                  {redeemingRow.remainingPoints}
                </span>
              </div>
              {redeemPreview.canExchange && redeemPreview.currency && (
                <div className="border-t pt-2 mt-2 space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t("判定币种", "Currency")}</span>
                    <Badge variant="outline" className="text-xs">
                      {redeemPreview.currency}
                    </Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t("当前汇率", "Current Rate")}</span>
                    <span>{redeemPreview.currentRateDisplay}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t("可兑换金额", "Redeemable Amount")}</span>
                    <span className="font-bold text-green-600">
                      {typeof redeemPreview.rewardAmount === "number"
                        ? redeemPreview.rewardAmount.toFixed(2)
                        : redeemPreview.rewardAmount}{" "}
                      {redeemPreview.currency}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t("手续费", "Fee")}</span>
                    <span>{redeemPreview.fee}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t("赠送价值", "Gift Value")}</span>
                    <span>{redeemPreview.giftValue.toFixed(2)}</span>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs sm:text-sm">
                {t("代付商家", "Payment Provider")} <span className="text-destructive">*</span>
              </Label>
              <Select value={selectedPaymentProvider} onValueChange={onSelectedPaymentProviderChange}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder={t("请选择代付商家", "Select payment provider")} />
                </SelectTrigger>
                <SelectContent>
                  {paymentProviders.map((provider) => (
                    <SelectItem key={provider.id} value={provider.name}>
                      {provider.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {paymentProviders.length === 0 && (
                <p className="text-xs text-destructive">
                  {t("暂无可用的代付商家", "No payment providers available")}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs sm:text-sm">{t("备注（选填）", "Remarks (optional)")}</Label>
              <Textarea
                value={redeemRemark}
                onChange={(e) => onRedeemRemarkChange(e.target.value)}
                placeholder={t("请输入备注信息", "Enter remarks")}
                rows={2}
                className="text-xs sm:text-sm"
              />
            </div>

            <div className="text-xs text-muted-foreground bg-amber-50 dark:bg-amber-950/20 p-2 rounded">
              ⚠️{" "}
              {t(
                "兑换后积分将清零，重置时间更新为当前时间。",
                "After redemption, points will be reset to zero. Reset time will update to now.",
              )}
            </div>
          </div>
        )}
        <div className="flex flex-wrap gap-2 border-t border-border pt-4 mt-4">
          <Button variant="outline" onClick={() => onRedeemOpenChange(false)} className="flex-1 sm:flex-none">
            {t("取消", "Cancel")}
          </Button>
          <Button
            onClick={onRedeemClick}
            disabled={!selectedPaymentProvider || paymentProviders.length === 0 || !redeemPreview?.canExchange}
            className="flex-1 sm:flex-none"
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
                `确认为会员 ${redeemingRow?.member.memberCode} 进行积分兑换吗？`,
                `Confirm points redemption for member ${redeemingRow?.member.memberCode}?`,
              )}
              <br />
              <br />
              {t(
                "兑换后该会员的积分将清零，重置时间将更新为当前时间，之后的积分将从新周期开始累积。",
                "After redemption, this member's points will be reset to zero. Reset time will update to now, and points will accumulate from a new cycle.",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("取消", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={onCompleteRedeem}>{t("确认", "Confirm")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
