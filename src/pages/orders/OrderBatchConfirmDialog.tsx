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

export type OrderBatchDialogState =
  | null
  | { mode: "cancel"; tab: "normal" | "usdt" | "meika-fiat" | "meika-usdt" };

type OrderBatchConfirmDialogProps = {
  open: boolean;
  dialog: OrderBatchDialogState;
  onOpenChange: (open: boolean) => void;
  t: (zh: string, en: string) => string;
  selectedNormalDbIds: Set<string>;
  selectedUsdtDbIds: Set<string>;
  selectedMeikaFiatDbIds: Set<string>;
  selectedMeikaUsdtDbIds: Set<string>;
  normalBatchCancelCount: number;
  usdtBatchCancelCount: number;
  meikaFiatBatchCancelCount: number;
  meikaUsdtBatchCancelCount: number;
  onConfirm: () => void;
};

export function OrderBatchConfirmDialog({
  open,
  dialog,
  onOpenChange,
  t,
  normalBatchCancelCount,
  usdtBatchCancelCount,
  meikaFiatBatchCancelCount,
  meikaUsdtBatchCancelCount,
  onConfirm,
}: OrderBatchConfirmDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("确认批量处理", "Confirm batch process")}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {dialog ? (
              dialog.tab === "normal" || dialog.tab === "meika-fiat" ? (
                t(
                  `将把 ${dialog.tab === "meika-fiat" ? meikaFiatBatchCancelCount : normalBatchCancelCount} 条「已完成」订单取消，确定继续？`,
                  `Cancel ${dialog.tab === "meika-fiat" ? meikaFiatBatchCancelCount : normalBatchCancelCount} completed order(s)?`,
                )
              ) : (
                t(
                  `将把 ${dialog.tab === "meika-usdt" ? meikaUsdtBatchCancelCount : usdtBatchCancelCount} 条「已完成」USDT 订单取消，确定继续？`,
                  `Cancel ${dialog.tab === "meika-usdt" ? meikaUsdtBatchCancelCount : usdtBatchCancelCount} completed USDT order(s)?`,
                )
              )
            ) : null}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("取消", "Cancel")}</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              onConfirm();
            }}
          >
            {t("确认", "Confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
