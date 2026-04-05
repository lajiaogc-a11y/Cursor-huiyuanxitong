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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useLanguage } from "@/contexts/LanguageContext";
import { getEmployeeNameById } from "@/hooks/useNameResolver";
import type { RechargeRecord } from "@/services/finance/merchantSettlementService";
import { Loader2, Pencil, Trash2 } from "lucide-react";
import type { ProviderSettlementData } from "./merchantSettlementTypes";

export interface PaymentProviderDialogsProps {
  isProviderInitialBalanceDialogOpen: boolean;
  setIsProviderInitialBalanceDialogOpen: (open: boolean) => void;
  currentProvider: string;
  providerInitialBalanceAmount: string;
  setProviderInitialBalanceAmount: (v: string) => void;
  currentProviderData: ProviderSettlementData | undefined;
  onSaveProviderInitialBalance: () => void | Promise<void>;

  isRechargeDialogOpen: boolean;
  setIsRechargeDialogOpen: (open: boolean) => void;
  rechargeAmountUsdt: string;
  setRechargeAmountUsdt: (v: string) => void;
  rechargeUsdtRate: string;
  setRechargeUsdtRate: (v: string) => void;
  rechargeRemark: string;
  setRechargeRemark: (v: string) => void;
  rechargeSettlementTotal: number;
  onSaveRecharge: () => void | Promise<void>;

  isProviderDetailsDialogOpen: boolean;
  setIsProviderDetailsDialogOpen: (open: boolean) => void;
  currentRecharges: RechargeRecord[] | undefined;
  canEditBalance: boolean;
  onEditRecharge: (r: RechargeRecord) => void;
  setDeletingRechargeId: (id: string | null) => void;

  editingRecharge: RechargeRecord | null;
  setEditingRecharge: Dispatch<SetStateAction<RechargeRecord | null>>;
  onSaveEditRecharge: () => void | Promise<void>;

  deletingRechargeId: string | null;
  onConfirmDeleteRecharge: () => void | Promise<void>;

  isProviderUndoConfirmOpen: boolean;
  setIsProviderUndoConfirmOpen: (open: boolean) => void;
  providerUndoDescription: string;
  undoPassword: string;
  setUndoPassword: (v: string) => void;
  undoAuthError: string;
  setUndoAuthError: (v: string) => void;
  isUndoVerifying: boolean;
  resetUndoAuthState: () => void;
  employeeUsername: string;
  onConfirmProviderUndo: () => void | Promise<void>;

  isSaving: boolean;
}

export function PaymentProviderDialogs({
  isProviderInitialBalanceDialogOpen,
  setIsProviderInitialBalanceDialogOpen,
  currentProvider,
  providerInitialBalanceAmount,
  setProviderInitialBalanceAmount,
  currentProviderData,
  onSaveProviderInitialBalance,
  isRechargeDialogOpen,
  setIsRechargeDialogOpen,
  rechargeAmountUsdt,
  setRechargeAmountUsdt,
  rechargeUsdtRate,
  setRechargeUsdtRate,
  rechargeRemark,
  setRechargeRemark,
  rechargeSettlementTotal,
  onSaveRecharge,
  isProviderDetailsDialogOpen,
  setIsProviderDetailsDialogOpen,
  currentRecharges,
  canEditBalance,
  onEditRecharge,
  setDeletingRechargeId,
  editingRecharge,
  setEditingRecharge,
  onSaveEditRecharge,
  deletingRechargeId,
  onConfirmDeleteRecharge,
  isProviderUndoConfirmOpen,
  setIsProviderUndoConfirmOpen,
  providerUndoDescription,
  undoPassword,
  setUndoPassword,
  undoAuthError,
  setUndoAuthError,
  isUndoVerifying,
  resetUndoAuthState,
  employeeUsername,
  onConfirmProviderUndo,
  isSaving,
}: PaymentProviderDialogsProps) {
  const { t } = useLanguage();

  return (
    <>
      <DrawerDetail
        open={isProviderInitialBalanceDialogOpen}
        onOpenChange={setIsProviderInitialBalanceDialogOpen}
        title={t("填入初始余额", "Set Initial Balance")}
        sheetMaxWidth="xl"
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>{t("代付商家", "Payment Provider")}</Label>
            <Input value={currentProvider} disabled />
          </div>
          <div className="space-y-2">
            <Label>{t("初始余额", "Initial Balance")}</Label>
            <div className="flex gap-2">
              <Input
                type="number"
                placeholder={t("输入金额", "Enter amount")}
                value={providerInitialBalanceAmount}
                onChange={(e) => setProviderInitialBalanceAmount(e.target.value)}
                className="flex-1"
              />
              {currentProviderData && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={() =>
                    setProviderInitialBalanceAmount(
                      currentProviderData.realTimeBalance.toFixed(2),
                    )
                  }
                >
                  {t("一键填入", "Fill")}
                </Button>
              )}
            </div>
          </div>
          {currentProviderData && (
            <div className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-lg">
              <p>
                {t("当前实时余额", "Current real-time balance")}: ¥
                {currentProviderData.realTimeBalance.toFixed(2)}
              </p>
              <p className="text-xs mt-1">
                {t(
                  "提示：设置初始余额后，将重置最后重置时间并清空充值记录",
                  "Note: Setting initial balance will reset the last reset time and clear recharge records",
                )}
              </p>
            </div>
          )}
        </div>
        <div className="flex flex-wrap justify-end gap-2 pt-4 mt-4 border-t border-border">
          <Button
            variant="outline"
            onClick={() => setIsProviderInitialBalanceDialogOpen(false)}
          >
            {t("取消", "Cancel")}
          </Button>
          <Button onClick={onSaveProviderInitialBalance} disabled={isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("确定", "Confirm")}
          </Button>
        </div>
      </DrawerDetail>

      <DrawerDetail
        open={isRechargeDialogOpen}
        onOpenChange={setIsRechargeDialogOpen}
        title={t("录入充值", "Add Top-up")}
        sheetMaxWidth="xl"
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>{t("代付商家", "Payment Provider")}</Label>
            <Input value={currentProvider} disabled />
          </div>
          <div className="space-y-2">
            <Label>{t("充值金额USDT", "Top-up Amount (USDT)")}</Label>
            <Input
              type="number"
              placeholder={t(
                "输入USDT金额（支持负数）",
                "Enter USDT amount (negative allowed)",
              )}
              value={rechargeAmountUsdt}
              onChange={(e) => setRechargeAmountUsdt(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("USDT汇率", "USDT Rate")}</Label>
            <Input
              type="number"
              placeholder={t("输入汇率", "Enter rate")}
              value={rechargeUsdtRate}
              onChange={(e) => setRechargeUsdtRate(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("结算总额", "Settlement Total")}</Label>
            <Input
              type="number"
              value={
                isNaN(rechargeSettlementTotal)
                  ? 0
                  : rechargeSettlementTotal.toFixed(2)
              }
              disabled
            />
            <p className="text-xs text-muted-foreground">
              = {t("充值金额USDT", "Top-up USDT")} ×{" "}
              {t("USDT汇率", "USDT Rate")}
            </p>
          </div>
          <div className="space-y-2">
            <Label>{t("备注", "Remark")}</Label>
            <Textarea
              placeholder={t("输入备注（可选）", "Enter remark (optional)")}
              value={rechargeRemark}
              onChange={(e) => setRechargeRemark(e.target.value)}
              className="min-h-[60px]"
            />
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-2 pt-4 mt-4 border-t border-border">
          <Button
            variant="outline"
            onClick={() => setIsRechargeDialogOpen(false)}
          >
            {t("取消", "Cancel")}
          </Button>
          <Button onClick={onSaveRecharge} disabled={isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("确定", "Confirm")}
          </Button>
        </div>
      </DrawerDetail>

      <DrawerDetail
        open={isProviderDetailsDialogOpen}
        onOpenChange={setIsProviderDetailsDialogOpen}
        title={`${t("充值明细", "Top-up Details")} - ${currentProvider}`}
        description={t(
          "查看和管理该代付商家的充值记录",
          "View and manage recharge records for this provider",
        )}
        sheetMaxWidth="4xl"
      >
        <div className="max-h-96 overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 border-b sticky top-0">
                <th className="text-left p-3 font-medium">{t("序号", "#")}</th>
                <th className="text-left p-3 font-medium">
                  {t("录入时间", "Entry Time")}
                </th>
                <th className="text-left p-3 font-medium">
                  {t("代付商家", "Payment Provider")}
                </th>
                <th className="text-left p-3 font-medium">
                  {t("充值金额USDT", "Top-up USDT")}
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
              {currentRecharges?.map((r, index) => (
                <tr key={r.id} className="border-b">
                  <td className="p-3">{index + 1}</td>
                  <td className="p-3">{r.createdAt}</td>
                  <td className="p-3">{r.providerName}</td>
                  <td className="p-3">{r.rechargeAmountUsdt}</td>
                  <td className="p-3">{r.usdtRate}</td>
                  <td className="p-3">¥{r.settlementTotal.toFixed(2)}</td>
                  <td
                    className="p-3 max-w-[150px] truncate"
                    title={r.remark || ""}
                  >
                    {r.remark || "-"}
                  </td>
                  <td className="p-3">
                    {r.recorderId ? getEmployeeNameById(r.recorderId) : "-"}
                  </td>
                  <td className="p-3 text-center">
                    {canEditBalance ? (
                      <div className="flex items-center justify-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onEditRecharge(r)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setDeletingRechargeId(r.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-xs">-</span>
                    )}
                  </td>
                </tr>
              ))}
              {(!currentRecharges || currentRecharges.length === 0) && (
                <tr>
                  <td colSpan={9} className="p-6 text-center text-muted-foreground">
                    {t("暂无充值记录", "No recharge records")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap justify-end gap-2 pt-4 mt-4 border-t border-border">
          <Button onClick={() => setIsProviderDetailsDialogOpen(false)}>
            {t("关闭", "Close")}
          </Button>
        </div>
      </DrawerDetail>

      <DrawerDetail
        open={!!editingRecharge}
        onOpenChange={(open) => !open && setEditingRecharge(null)}
        title={t("编辑充值记录", "Edit Top-up")}
        description={t("修改充值金额和汇率", "Modify recharge amount and rate")}
        sheetMaxWidth="xl"
      >
        {editingRecharge && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("充值金额USDT", "Top-up Amount (USDT)")}</Label>
              <Input
                type="number"
                value={editingRecharge.rechargeAmountUsdt}
                onChange={(e) =>
                  setEditingRecharge({
                    ...editingRecharge,
                    rechargeAmountUsdt: parseFloat(e.target.value) || 0,
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>{t("USDT汇率", "USDT Rate")}</Label>
              <Input
                type="number"
                value={editingRecharge.usdtRate}
                onChange={(e) =>
                  setEditingRecharge({
                    ...editingRecharge,
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
                  editingRecharge.rechargeAmountUsdt * editingRecharge.usdtRate
                ).toFixed(2)}
                disabled
              />
            </div>
            <div className="space-y-2">
              <Label>{t("备注", "Remark")}</Label>
              <Textarea
                placeholder={t("输入备注（可选）", "Enter remark (optional)")}
                value={editingRecharge.remark || ""}
                onChange={(e) =>
                  setEditingRecharge({
                    ...editingRecharge,
                    remark: e.target.value,
                  })
                }
                className="min-h-[60px]"
              />
            </div>
          </div>
        )}
        <div className="flex flex-wrap justify-end gap-2 pt-4 mt-4 border-t border-border">
          <Button variant="outline" onClick={() => setEditingRecharge(null)}>
            {t("取消", "Cancel")}
          </Button>
          <Button onClick={onSaveEditRecharge} disabled={isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("保存", "Save")}
          </Button>
        </div>
      </DrawerDetail>

      <AlertDialog
        open={!!deletingRechargeId}
        onOpenChange={(open) => !open && setDeletingRechargeId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("确认删除", "Confirm Delete")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "确定要删除这条充值记录吗？此操作不可恢复。",
                "Are you sure you want to delete this recharge record? This action cannot be undone.",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("取消", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={onConfirmDeleteRecharge}
              disabled={isSaving}
            >
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("删除", "Delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={isProviderUndoConfirmOpen}
        onOpenChange={(open) => {
          setIsProviderUndoConfirmOpen(open);
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
                    {t("即将撤回", "About to undo")}: {providerUndoDescription}
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
                        if (e.key === "Enter") void onConfirmProviderUndo();
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
              onClick={onConfirmProviderUndo}
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
