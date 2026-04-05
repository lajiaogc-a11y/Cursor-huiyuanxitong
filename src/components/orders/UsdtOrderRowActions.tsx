/**
 * USDT 订单行操作按钮 - 编辑/取消/恢复/删除
 * 纯 UI 组件，所有逻辑通过 props 传入
 */
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Pencil, X, Trash2, RotateCcw } from "lucide-react";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import { notify } from "@/lib/notifyHub";
import type { UsdtOrder } from "@/hooks/useOrders";

export interface UsdtOrderRowActionsProps {
  order: UsdtOrder;
  onEdit: (order: UsdtOrder) => void;
  onCancel: (dbId: string) => Promise<boolean>;
  onRestore: (dbId: string) => Promise<boolean>;
  onDelete: (dbId: string) => Promise<boolean>;
  canEditCancelButton: boolean;
  canDelete: boolean;
  t: (zh: string, en: string) => string;
}

export function UsdtOrderRowActions({
  order,
  onEdit,
  onCancel,
  onRestore,
  onDelete,
  canEditCancelButton,
  canDelete,
  t,
}: UsdtOrderRowActionsProps) {
  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex items-center justify-center gap-0.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onEdit(order)} aria-label="Edit">
              <Pencil className="h-3 w-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">{t("编辑", "Edit")}</TooltipContent>
        </Tooltip>
        {order.status === "completed" && canEditCancelButton && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex">
                <ConfirmDialog
                  trigger={
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-amber-500" aria-label="Cancel">
                      <X className="h-3 w-3" />
                    </Button>
                  }
                  title={t("确认取消订单", "Confirm Cancel Order")}
                  description={t("此操作将取消该USDT订单", "This will cancel the USDT order.")}
                  confirmText={t("确认取消", "Confirm Cancel")}
                  cancelText={t("取消", "Cancel")}
                  onConfirm={() => void onCancel(order.dbId)}
                  confirmVariant="amber"
                />
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom">{t("取消订单", "Cancel order")}</TooltipContent>
          </Tooltip>
        )}
        {order.status === "cancelled" && canEditCancelButton && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex">
                <ConfirmDialog
                  trigger={
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-primary">
                      <RotateCcw className="h-3 w-3" />
                    </Button>
                  }
                  title={t("是否恢复该订单？", "Restore Order?")}
                  description={t("恢复后，订单将重新视为有效订单。", "The order will be valid again after restore.")}
                  confirmText={t("确认恢复", "Confirm Restore")}
                  cancelText={t("取消", "Cancel")}
                  onConfirm={async () => {
                    await onRestore(order.dbId);
                    notify.success(t("USDT订单已恢复", "USDT order restored"));
                  }}
                  confirmVariant="default"
                />
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom">{t("恢复订单", "Restore order")}</TooltipContent>
          </Tooltip>
        )}
        {canDelete && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex">
                <ConfirmDialog
                  trigger={
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" aria-label="Delete">
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  }
                  title={t("确认删除", "Confirm Delete")}
                  description={t("此操作将删除该USDT订单", "This will delete the USDT order.")}
                  confirmText={t("删除", "Delete")}
                  cancelText={t("取消", "Cancel")}
                  onConfirm={() => void onDelete(order.dbId)}
                  confirmVariant="destructive"
                />
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom">{t("删除", "Delete")}</TooltipContent>
          </Tooltip>
        )}
      </div>
    </TooltipProvider>
  );
}
