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
import { Textarea } from "@/components/ui/textarea";
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
import { CurrencyCode } from "@/config/currencies";

export interface RedeemPreviewState {
  points: number;
  preview?: {
    exchangeCurrency?: string;
    exchangeAmount?: number;
    activityType?: string;
  };
}

export interface CalculatorRedeemSectionProps {
  t: (zh: string, en: string) => string;
  formMemberCode: string;
  formPhoneNumber: string;
  isRedeemDialogOpen: boolean;
  setIsRedeemDialogOpen: (open: boolean) => void;
  redeemPreviewData: RedeemPreviewState | null;
  redeemGiftRateInput: string;
  setRedeemGiftRateInput: (v: string) => void;
  getSyncedGiftRate: (c: CurrencyCode) => number;
  redeemPaymentProvider: string;
  setRedeemPaymentProvider: (v: string) => void;
  redeemRemark: string;
  setRedeemRemark: (v: string) => void;
  paymentProvidersList: { id: string; name: string }[];
  isRedeemConfirmOpen: boolean;
  setIsRedeemConfirmOpen: (open: boolean) => void;
  onConfirmRedeem: () => void | Promise<void>;
  nairaWarningOpen: boolean;
  onNairaWarningOpenChange: (open: boolean) => void;
  nairaWarningText: string;
  onNairaSubmitAnyway: () => void;
}

export function CalculatorRedeemSection({
  t,
  formMemberCode,
  formPhoneNumber,
  isRedeemDialogOpen,
  setIsRedeemDialogOpen,
  redeemPreviewData,
  redeemGiftRateInput,
  setRedeemGiftRateInput,
  getSyncedGiftRate,
  redeemPaymentProvider,
  setRedeemPaymentProvider,
  redeemRemark,
  setRedeemRemark,
  paymentProvidersList,
  isRedeemConfirmOpen,
  setIsRedeemConfirmOpen,
  onConfirmRedeem,
  nairaWarningOpen,
  onNairaWarningOpenChange,
  nairaWarningText,
  onNairaSubmitAnyway,
}: CalculatorRedeemSectionProps) {
  return (
    <>
      <DrawerDetail
        open={isRedeemDialogOpen}
        onOpenChange={setIsRedeemDialogOpen}
        title={<span className="text-lg">{t("积分兑换", "Points Redemption")}</span>}
        sheetMaxWidth="xl"
      >
        {redeemPreviewData && (
          <div className="space-y-3">
            <div className="p-3 bg-muted/50 rounded-lg space-y-2">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="flex flex-col">
                  <span className="text-xs text-muted-foreground">{t("会员编号", "Member Code")}</span>
                  <span className="font-mono font-medium truncate">{formMemberCode}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-xs text-muted-foreground">{t("电话号码", "Phone Number")}</span>
                  <span className="font-mono font-medium truncate">{formPhoneNumber}</span>
                </div>
              </div>

              <div className="border-t pt-2 space-y-1.5">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">{t("当前积分", "Current Points")}</span>
                  <span className="font-bold text-primary text-base">{redeemPreviewData.points}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">{t("兑换后剩余", "Remaining After")}</span>
                  <span className="font-bold text-orange-500">0</span>
                </div>
              </div>

              <div className="border-t pt-2 space-y-1.5">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">{t("兑换币种", "Redemption Currency")}</span>
                  <span className="font-medium">{redeemPreviewData.preview?.exchangeCurrency}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">{t("兑换金额", "Redemption Amount")}</span>
                  <span className="font-bold text-green-600 text-base">
                    {redeemPreviewData.preview?.exchangeAmount?.toLocaleString()}{" "}
                    {redeemPreviewData.preview?.exchangeCurrency}
                  </span>
                </div>
              </div>

              <div className="border-t pt-2 space-y-1.5">
                <Label className="text-xs text-muted-foreground">
                  {t("活动赠送汇率（可修改）", "Gift record rate (editable)")}
                </Label>
                <div className="flex gap-2">
                  <Input
                    value={redeemGiftRateInput}
                    onChange={(e) => {
                      const v = e.target.value.replace(/[^0-9.,]/g, "").replace(/(\..*)\./g, "$1");
                      setRedeemGiftRateInput(v);
                    }}
                    placeholder={t("留空则用页面同步价", "Blank = use synced rate")}
                    className="h-9 font-mono text-sm"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 shrink-0 px-2 text-xs"
                    onClick={() => {
                      const ec = redeemPreviewData.preview?.exchangeCurrency as CurrencyCode;
                      const s = getSyncedGiftRate(ec);
                      setRedeemGiftRateInput(s > 0 ? String(s) : "");
                    }}
                  >
                    {t("同步", "Sync")}
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground leading-snug">
                  {t(
                    "写入活动赠送记录时使用此汇率计算赠送价值；默认与当前页奈拉/赛地/USDT 同步。",
                    "Used to compute gift value on the activity record; defaults match NGN/GHS/USDT on this page.",
                  )}
                </p>
              </div>

              <div className="border-t pt-2">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">{t("活动类型", "Activity Type")}</span>
                  <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">
                    {redeemPreviewData.preview?.activityType === "activity_1"
                      ? t("活动1（阶梯制）", "Activity 1 (Tiered)")
                      : t("活动2（固定比例）", "Activity 2 (Fixed Rate)")}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {redeemPreviewData.preview?.activityType === "activity_1"
                    ? t(
                        "根据累计积分达到不同档位获得对应奖励",
                        "Rewards based on accumulated points reaching different tiers",
                      )
                    : t("按固定比例将积分兑换为奖励金额", "Exchange points at a fixed rate for rewards")}
                </p>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm">
                {t("代付商家", "Payment Agent")} <span className="text-destructive">*</span>
              </Label>
              <Select value={redeemPaymentProvider} onValueChange={setRedeemPaymentProvider}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder={t("请选择代付商家", "Please select payment agent")} />
                </SelectTrigger>
                <SelectContent>
                  {paymentProvidersList.map((provider) => (
                    <SelectItem key={provider.id} value={provider.name}>
                      {provider.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm">{t("备注（可选）", "Remark (Optional)")}</Label>
              <Textarea
                value={redeemRemark}
                onChange={(e) => setRedeemRemark(e.target.value)}
                placeholder={t("输入备注信息", "Enter remark")}
                className="resize-none h-16 min-h-16"
              />
            </div>
          </div>
        )}
        <div className="flex flex-col md:flex-row gap-2 pt-4 mt-4 border-t border-border">
          <Button variant="outline" onClick={() => setIsRedeemDialogOpen(false)} className="w-full md:w-auto">
            {t("取消", "Cancel")}
          </Button>
          <Button
            onClick={() => setIsRedeemConfirmOpen(true)}
            disabled={!redeemPaymentProvider}
            className="w-full md:w-auto"
          >
            {t("确认兑换", "Confirm Redemption")}
          </Button>
        </div>
      </DrawerDetail>

      <AlertDialog open={isRedeemConfirmOpen} onOpenChange={setIsRedeemConfirmOpen}>
        <AlertDialogContent className="max-w-[95vw] md:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("确认兑换", "Confirm Redemption")}</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2 text-sm">
              <p>
                {t("确定要将", "Are you sure you want to redeem")}{" "}
                <span className="font-bold text-foreground">{redeemPreviewData?.points}</span>{" "}
                {t("积分兑换为", "points for")}{" "}
                <span className="font-bold text-green-600">
                  {redeemPreviewData?.preview?.exchangeAmount?.toLocaleString()}{" "}
                  {redeemPreviewData?.preview?.exchangeCurrency}
                </span>
                ?
              </p>
              <p className="text-destructive font-medium">
                ⚠️{" "}
                {t(
                  "兑换后积分将清零，消费奖励和推荐奖励都会归零，重置时间会更新为当前时间！此操作无法恢复！",
                  "After redemption, all points will be reset to zero, including consumption and referral rewards. Reset time will be updated. This action cannot be undone!",
                )}
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col md:flex-row gap-2">
            <AlertDialogCancel className="w-full md:w-auto">{t("取消", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={onConfirmRedeem} className="w-full md:w-auto">
              {t("确认兑换", "Confirm Redemption")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={nairaWarningOpen} onOpenChange={onNairaWarningOpenChange}>
        <AlertDialogContent className="max-w-[95vw] sm:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("实付奈拉金额异常", "Abnormal Naira amount")}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="max-h-[min(55vh,420px)] overflow-y-auto whitespace-pre-line text-left text-sm text-muted-foreground">
                {nairaWarningText}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
            <AlertDialogCancel className="sm:mt-0">{t("返回修改", "Go back and edit")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-amber-600 text-white hover:bg-amber-600/90"
              onClick={() => {
                onNairaWarningOpenChange(false);
                onNairaSubmitAnyway();
              }}
            >
              {t("仍要提交", "Submit anyway")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
