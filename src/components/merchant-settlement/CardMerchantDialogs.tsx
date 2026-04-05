import type { Dispatch, SetStateAction } from "react";
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
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useLanguage } from "@/contexts/LanguageContext";
import { getEmployeeNameById } from "@/hooks/useNameResolver";
import type { WithdrawalRecord } from "@/services/finance/merchantSettlementService";
import { Loader2, Pencil, Trash2 } from "lucide-react";
import type { VendorSettlementData } from "./merchantSettlementTypes";

export interface CardMerchantDialogsProps {
  isInitialBalanceDialogOpen: boolean;
  setIsInitialBalanceDialogOpen: (open: boolean) => void;
  currentVendor: string;
  initialBalanceAmount: string;
  setInitialBalanceAmount: (v: string) => void;
  currentVendorData: VendorSettlementData | undefined;
  onSaveInitialBalance: () => void | Promise<void>;

  isWithdrawalDialogOpen: boolean;
  setIsWithdrawalDialogOpen: (open: boolean) => void;
  withdrawalAmountUsdt: string;
  setWithdrawalAmountUsdt: (v: string) => void;
  withdrawalUsdtRate: string;
  setWithdrawalUsdtRate: (v: string) => void;
  withdrawalRemark: string;
  setWithdrawalRemark: (v: string) => void;
  settlementTotal: number;
  onSaveWithdrawal: () => void | Promise<void>;

  isDetailsDialogOpen: boolean;
  setIsDetailsDialogOpen: (open: boolean) => void;
  currentWithdrawals: WithdrawalRecord[];
  canEditBalance: boolean;
  withdrawalSelectionState: {
    ids: string[];
    allSelected: boolean;
    someSelected: boolean;
  };
  selectedWithdrawalIds: Set<string>;
  setSelectedWithdrawalIds: Dispatch<SetStateAction<Set<string>>>;
  onEditWithdrawal: (w: WithdrawalRecord) => void;
  setDeletingWithdrawalId: (id: string | null) => void;
  setPendingBatchWithdrawalDelete: (ids: string[] | null) => void;

  editingWithdrawal: WithdrawalRecord | null;
  setEditingWithdrawal: Dispatch<SetStateAction<WithdrawalRecord | null>>;
  onSaveEditWithdrawal: () => void | Promise<void>;

  deletingWithdrawalId: string | null;
  onConfirmDeleteWithdrawal: () => void | Promise<void>;
  pendingBatchWithdrawalDelete: string[] | null;
  setPendingBatchWithdrawalDelete: (v: string[] | null) => void;
  onConfirmBatchDeleteWithdrawals: () => void | Promise<void>;

  isUndoConfirmOpen: boolean;
  setIsUndoConfirmOpen: (open: boolean) => void;
  undoDescription: string;
  undoPassword: string;
  setUndoPassword: (v: string) => void;
  undoAuthError: string;
  setUndoAuthError: (v: string) => void;
  isUndoVerifying: boolean;
  resetUndoAuthState: () => void;
  employeeUsername: string;
  onConfirmUndo: () => void | Promise<void>;

  isSaving: boolean;
}

export function CardMerchantDialogs({
  isInitialBalanceDialogOpen,
  setIsInitialBalanceDialogOpen,
  currentVendor,
  initialBalanceAmount,
  setInitialBalanceAmount,
  currentVendorData,
  onSaveInitialBalance,
  isWithdrawalDialogOpen,
  setIsWithdrawalDialogOpen,
  withdrawalAmountUsdt,
  setWithdrawalAmountUsdt,
  withdrawalUsdtRate,
  setWithdrawalUsdtRate,
  withdrawalRemark,
  setWithdrawalRemark,
  settlementTotal,
  onSaveWithdrawal,
  isDetailsDialogOpen,
  setIsDetailsDialogOpen,
  currentWithdrawals,
  canEditBalance,
  withdrawalSelectionState,
  selectedWithdrawalIds,
  setSelectedWithdrawalIds,
  onEditWithdrawal,
  setDeletingWithdrawalId,
  setPendingBatchWithdrawalDelete,
  editingWithdrawal,
  setEditingWithdrawal,
  onSaveEditWithdrawal,
  deletingWithdrawalId,
  onConfirmDeleteWithdrawal,
  pendingBatchWithdrawalDelete,
  setPendingBatchWithdrawalDelete,
  onConfirmBatchDeleteWithdrawals,
  isUndoConfirmOpen,
  setIsUndoConfirmOpen,
  undoDescription,
  undoPassword,
  setUndoPassword,
  undoAuthError,
  setUndoAuthError,
  isUndoVerifying,
  resetUndoAuthState,
  employeeUsername,
  onConfirmUndo,
  isSaving,
}: CardMerchantDialogsProps) {
  const { t } = useLanguage();

  return (
    <>
      <DrawerDetail
        open={isInitialBalanceDialogOpen}
        onOpenChange={setIsInitialBalanceDialogOpen}
        title={t("填入初始余额", "Set Initial Balance")}
        sheetMaxWidth="xl"
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>{t("卡商名称", "Vendor Name")}</Label>
            <Input value={currentVendor} disabled />
          </div>
          <div className="space-y-2">
            <Label>{t("初始余额", "Initial Balance")}</Label>
            <div className="flex gap-2">
              <Input
                type="number"
                placeholder={t("输入金额", "Enter amount")}
                value={initialBalanceAmount}
                onChange={(e) => setInitialBalanceAmount(e.target.value)}
                className="flex-1"
              />
              {currentVendorData && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={() =>
                    setInitialBalanceAmount(
                      currentVendorData.realTimeBalance.toFixed(2),
                    )
                  }
                >
                  {t("一键填入", "Fill")}
                </Button>
              )}
            </div>
          </div>
          {currentVendorData && (
            <div className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-lg">
              <p>
                {t("当前实时余额", "Current real-time balance")}: ¥
                {currentVendorData.realTimeBalance.toFixed(2)}
              </p>
              <p className="text-xs mt-1">
                {t(
                  "提示：设置初始余额后，将重置最后重置时间并清空提款记录",
                  "Note: Setting initial balance will reset the last reset time and clear withdrawal records",
                )}
              </p>
            </div>
          )}
        </div>
        <div className="flex flex-wrap justify-end gap-2 pt-4 mt-4 border-t border-border">
          <Button
            variant="outline"
            onClick={() => setIsInitialBalanceDialogOpen(false)}
          >
            {t("取消", "Cancel")}
          </Button>
          <Button onClick={onSaveInitialBalance} disabled={isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("确定", "Confirm")}
          </Button>
        </div>
      </DrawerDetail>

      <DrawerDetail
        open={isWithdrawalDialogOpen}
        onOpenChange={setIsWithdrawalDialogOpen}
        title={t("录入提款", "Add Withdrawal")}
        sheetMaxWidth="xl"
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>{t("卡商名称", "Vendor Name")}</Label>
            <Input value={currentVendor} disabled />
          </div>
          <div className="space-y-2">
            <Label>{t("提款金额USDT", "Withdrawal Amount USDT")}</Label>
            <Input
              type="number"
              placeholder={t(
                "输入USDT金额（支持负数）",
                "Enter USDT amount (negative allowed)",
              )}
              value={withdrawalAmountUsdt}
              onChange={(e) => setWithdrawalAmountUsdt(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("USDT汇率", "USDT Rate")}</Label>
            <Input
              type="number"
              placeholder={t("输入汇率", "Enter rate")}
              value={withdrawalUsdtRate}
              onChange={(e) => setWithdrawalUsdtRate(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("结算总额", "Settlement Total")}</Label>
            <Input
              type="number"
              value={isNaN(settlementTotal) ? 0 : settlementTotal.toFixed(2)}
              disabled
            />
            <p className="text-xs text-muted-foreground">
              = {t("提款金额USDT", "Withdrawal USDT")} ×{" "}
              {t("USDT汇率", "USDT Rate")}
            </p>
          </div>
          <div className="space-y-2">
            <Label>{t("备注", "Remark")}</Label>
            <Textarea
              placeholder={t("输入备注（可选）", "Enter remark (optional)")}
              value={withdrawalRemark}
              onChange={(e) => setWithdrawalRemark(e.target.value)}
              className="min-h-[60px]"
            />
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-2 pt-4 mt-4 border-t border-border">
          <Button
            variant="outline"
            onClick={() => setIsWithdrawalDialogOpen(false)}
          >
            {t("取消", "Cancel")}
          </Button>
          <Button onClick={onSaveWithdrawal} disabled={isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("确定", "Confirm")}
          </Button>
        </div>
      </DrawerDetail>

      <DrawerDetail
        open={isDetailsDialogOpen}
        onOpenChange={setIsDetailsDialogOpen}
        title={`${t("提款明细", "Withdrawal Details")} - ${currentVendor}`}
        description={t(
          "查看和管理该卡商的提款记录",
          "View and manage withdrawal records for this vendor",
        )}
        sheetMaxWidth="4xl"
      >
        <div className="max-h-96 overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 border-b sticky top-0">
                {canEditBalance ? (
                  <th className="w-10 p-3 text-center font-medium">
                    <div className="flex justify-center">
                      <Checkbox
                        checked={
                          withdrawalSelectionState.allSelected
                            ? true
                            : withdrawalSelectionState.someSelected
                              ? "indeterminate"
                              : false
                        }
                        onCheckedChange={() => {
                          setSelectedWithdrawalIds((prev) => {
                            const ids = withdrawalSelectionState.ids;
                            const allOn =
                              ids.length > 0 && ids.every((id) => prev.has(id));
                            const next = new Set(prev);
                            if (allOn) ids.forEach((id) => next.delete(id));
                            else ids.forEach((id) => next.add(id));
                            return next;
                          });
                        }}
                        aria-label={t("全选列表", "Select all")}
                      />
                    </div>
                  </th>
                ) : null}
                <th className="text-left p-3 font-medium">{t("序号", "#")}</th>
                <th className="text-left p-3 font-medium">
                  {t("录入时间", "Entry Time")}
                </th>
                <th className="text-left p-3 font-medium">
                  {t("卡商名称", "Vendor Name")}
                </th>
                <th className="text-left p-3 font-medium">
                  {t("提款金额USDT", "Withdrawal USDT")}
                </th>
                <th className="text-left p-3 font-medium">
                  {t("USDT汇率", "USDT Rate")}
                </th>
                <th className="text-left p-3 font-medium">
                  {t("结算总额", "Settlement Total")}
                </th>
                <th className="text-left p-3 font-medium">{t("备注", "Remark")}</th>
                <th className="text-left p-3 font-medium">
                  {t("录入人", "Recorder")}
                </th>
                <th className="text-center p-3 font-medium">
                  {t("操作", "Actions")}
                </th>
              </tr>
            </thead>
            <tbody>
              {currentWithdrawals.map((w, index) => (
                <tr key={w.id} className="border-b">
                  {canEditBalance ? (
                    <td className="p-3 text-center">
                      <div className="flex justify-center">
                        <Checkbox
                          checked={selectedWithdrawalIds.has(w.id)}
                          onCheckedChange={() => {
                            setSelectedWithdrawalIds((prev) => {
                              const next = new Set(prev);
                              if (next.has(w.id)) next.delete(w.id);
                              else next.add(w.id);
                              return next;
                            });
                          }}
                          aria-label={t("选择该行", "Select row")}
                        />
                      </div>
                    </td>
                  ) : null}
                  <td className="p-3">{index + 1}</td>
                  <td className="p-3">{w.createdAt}</td>
                  <td className="p-3">{w.vendorName}</td>
                  <td className="p-3">{w.withdrawalAmountUsdt}</td>
                  <td className="p-3">{w.usdtRate}</td>
                  <td className="p-3">¥{w.settlementTotal.toFixed(2)}</td>
                  <td
                    className="p-3 max-w-[150px] truncate"
                    title={w.remark || ""}
                  >
                    {w.remark || "-"}
                  </td>
                  <td className="p-3">
                    {w.recorderId ? getEmployeeNameById(w.recorderId) : "-"}
                  </td>
                  <td className="p-3 text-center">
                    {canEditBalance ? (
                      <TooltipProvider delayDuration={300}>
                        <div className="flex items-center justify-center gap-2">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => onEditWithdrawal(w)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="bottom">
                              {t("编辑", "Edit")}
                            </TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive hover:text-destructive"
                                onClick={() => setDeletingWithdrawalId(w.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="bottom">
                              {t("删除", "Delete")}
                            </TooltipContent>
                          </Tooltip>
                        </div>
                      </TooltipProvider>
                    ) : (
                      <span className="text-muted-foreground text-xs">-</span>
                    )}
                  </td>
                </tr>
              ))}
              {currentWithdrawals.length === 0 && (
                <tr>
                  <td
                    colSpan={canEditBalance ? 10 : 9}
                    className="p-6 text-center text-muted-foreground"
                  >
                    {t("暂无提款记录", "No withdrawal records")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap justify-end gap-2 pt-4 mt-4 border-t border-border">
          {canEditBalance && selectedWithdrawalIds.size > 0 ? (
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    onClick={() =>
                      setPendingBatchWithdrawalDelete([
                        ...selectedWithdrawalIds,
                      ])
                    }
                  >
                    {t("批量删除", "Batch delete")}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  {t(
                    `删除已选的 ${selectedWithdrawalIds.size} 条记录`,
                    `Delete ${selectedWithdrawalIds.size} selected`,
                  )}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : null}
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button onClick={() => setIsDetailsDialogOpen(false)}>
                  {t("关闭", "Close")}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">
                {t("关闭抽屉", "Close panel")}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </DrawerDetail>

      <DrawerDetail
        open={!!editingWithdrawal}
        onOpenChange={(open) => !open && setEditingWithdrawal(null)}
        title={t("编辑提款记录", "Edit Withdrawal")}
        description={t("修改提款金额和汇率", "Modify withdrawal amount and rate")}
        sheetMaxWidth="xl"
      >
        {editingWithdrawal && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("提款金额USDT", "Withdrawal Amount USDT")}</Label>
              <Input
                type="number"
                value={editingWithdrawal.withdrawalAmountUsdt}
                onChange={(e) =>
                  setEditingWithdrawal({
                    ...editingWithdrawal,
                    withdrawalAmountUsdt: parseFloat(e.target.value) || 0,
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>{t("USDT汇率", "USDT Rate")}</Label>
              <Input
                type="number"
                value={editingWithdrawal.usdtRate}
                onChange={(e) =>
                  setEditingWithdrawal({
                    ...editingWithdrawal,
                    usdtRate: parseFloat(e.target.value) || 0,
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>{t("结算总额", "Settlement Total")}</Label>
              <Input
                type="number"
                value={(
                  editingWithdrawal.withdrawalAmountUsdt *
                  editingWithdrawal.usdtRate
                ).toFixed(2)}
                disabled
              />
            </div>
            <div className="space-y-2">
              <Label>{t("备注", "Remark")}</Label>
              <Textarea
                placeholder={t("输入备注（可选）", "Enter remark (optional)")}
                value={editingWithdrawal.remark || ""}
                onChange={(e) =>
                  setEditingWithdrawal({
                    ...editingWithdrawal,
                    remark: e.target.value,
                  })
                }
                className="min-h-[60px]"
              />
            </div>
          </div>
        )}
        <div className="flex flex-wrap justify-end gap-2 pt-4 mt-4 border-t border-border">
          <Button variant="outline" onClick={() => setEditingWithdrawal(null)}>
            {t("取消", "Cancel")}
          </Button>
          <Button onClick={onSaveEditWithdrawal} disabled={isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("保存", "Save")}
          </Button>
        </div>
      </DrawerDetail>

      <AlertDialog
        open={!!deletingWithdrawalId}
        onOpenChange={(open) => !open && setDeletingWithdrawalId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("确认删除", "Confirm Delete")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "确定要删除这条提款记录吗？此操作不可恢复。",
                "Are you sure you want to delete this withdrawal record? This action cannot be undone.",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("取消", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={onConfirmDeleteWithdrawal}
              disabled={isSaving}
            >
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("删除", "Delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={pendingBatchWithdrawalDelete !== null}
        onOpenChange={(open) => !open && setPendingBatchWithdrawalDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("确认批量删除", "Confirm batch delete")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingBatchWithdrawalDelete?.length
                ? t(
                    `将删除 ${pendingBatchWithdrawalDelete.length} 条提款记录，确定继续？`,
                    `Delete ${pendingBatchWithdrawalDelete.length} withdrawal record(s)?`,
                  )
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("取消", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                void onConfirmBatchDeleteWithdrawals();
              }}
              disabled={isSaving}
            >
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("删除", "Delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={isUndoConfirmOpen}
        onOpenChange={(open) => {
          setIsUndoConfirmOpen(open);
          if (!open) resetUndoAuthState();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("确认撤回", "Confirm Undo")}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                <p>
                  {t(
                    "确定要撤回以下操作吗？此操作将恢复到修改前的状态并同步更新账本明细。",
                    "Are you sure you want to undo the following action? This will restore the previous state and update the ledger.",
                  )}
                </p>
                <p className="mt-1">
                  <strong className="text-foreground">
                    {t("即将撤回", "About to undo")}: {undoDescription}
                  </strong>
                </p>
                <div className="mt-4 space-y-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">
                      {t("账号", "Account")}
                    </Label>
                    <Input
                      value={employeeUsername}
                      disabled
                      className="bg-muted/30"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">
                      {t("密码", "Password")}
                    </Label>
                    <Input
                      type="password"
                      placeholder={t(
                        "请输入密码以确认身份",
                        "Enter password to confirm identity",
                      )}
                      value={undoPassword}
                      onChange={(e) => {
                        setUndoPassword(e.target.value);
                        setUndoAuthError("");
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void onConfirmUndo();
                      }}
                    />
                  </div>
                  {undoAuthError && (
                    <p className="text-sm text-destructive">{undoAuthError}</p>
                  )}
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("取消", "Cancel")}</AlertDialogCancel>
            <Button
              onClick={onConfirmUndo}
              disabled={isUndoVerifying || isSaving || !undoPassword}
            >
              {(isUndoVerifying || isSaving) && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {t("确定", "Confirm")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
